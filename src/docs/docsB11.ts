import type { TechDoc } from './types';

/**
 * 기술 문서 B11 — 원리 설명 (i39 i43 i44 i45 i70 i79) · 지도 생성 · 격자 · 좌표 · 길찾기 · 지도 보기 (i245 ~ i279, i539)
 * 코드는 견본 파일(demos/…)의 실제 코드에서 발췌 · 정리했다 (from 에 출처).
 */
export const DOCS: Record<string, TechDoc> = {
  i245: {
    id: 'i245',
    summary: '잡음을 여러 겹 쌓아 높이를 만들고 가장자리를 낮춰 섬 모양으로, 높이 · 습도로 바다 · 모래 · 숲 · 눈을 색칠한다.',
    terms: [
      { en: 'Procedural island map (fBm noise heightmap)', ko: '잡음으로 만드는 섬 지도' },
      { en: 'Fractal Brownian motion (octaves)', ko: '크기가 다른 잡음을 반씩 줄여 겹치기' },
      { en: 'Radial falloff (island mask)', ko: '가운데에서 멀수록 높이를 깎는 섬 틀' },
      { en: 'Biome map (elevation × moisture)', ko: '높이와 습도 두 값으로 땅 종류 고르기' },
    ],
    goal: '{target}을(를) 잡음 높이 지도 + 섬 틀 + 습도로 만들어 줘 — 바다 · 모래 · 풀 · 숲 · 바위 · 눈이 높이대로 보이게. 분위기는 {style}.',
    targets: ['보물섬 지도', '좌표 놀이 판 배경', '월드 고르기 화면 섬'],
    styles: ['밝은 지도 색', '양피지 옛 지도', '어두운 밤 지도'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Mathf.PerlinNoise 를 옥타브로 겹쳐 Texture2D.SetPixels 로 굽거나 Terrain 높이(TerrainData.SetHeights)에 넣는다.',
      godot: 'Godot 4 는 FastNoiseLite(fractal_type = FBM, fractal_octaves) 로 값을 얻어 Image.set_pixel 로 그린다.',
    },
    principle: [
      '값 잡음(value noise)을 크기 2배씩 작게 · 세기 반씩 약하게 여러 번(옥타브) 더하면 산과 골짜기가 있는 높이가 된다 (fBm).',
      '가운데에서의 거리 d² = 0.9·nx² + ny² 만큼 깎으면 (h = 잡음 − 0.62·d²) 가장자리가 바다로 가라앉아 섬이 된다.',
      '바다 높이는 정렬한 높이에서 「땅 45%」가 되는 값으로 정해, 시드가 달라도 땅 넓이가 비슷하다.',
      '바다 위 높이 t 와 따로 만든 습도 m 으로 모래 → 풀 · 덤불 → 숲 → 바위 → 눈을 smoothstep 으로 섞어 칠한다.',
      '이웃 칸과의 높이 차로 언덕 그늘(밝기 0.68~1.28)을 곱하면 평면 지도에도 입체감이 생긴다.',
    ],
    when: ['게임마다 새로운 섬 · 대륙 지도가 필요할 때', '좌표 · 높이 읽기 체험 판의 배경', '같은 시드로 같은 지도를 다시 만들어야 할 때'],
    avoid: ['정해진 모양의 실제 지도 — 대신 그린 그림이나 자료 지도를 쓴다', '나라 · 지역 경계가 주인공일 때 — 대신 보로노이 지역(i246)'],
    cost: 'light',
    costNote: '320×200 칸 = 6만 4천 칸에 잡음 몇 번이라 한 번 굽는 데 수십 ms. 다 구운 뒤엔 그림 한 장(drawImage)이라 폰도 가볍다.',
    level: 1,
    must: [
      '잡음 · 시드는 직접 만든 해시(같은 시드 = 같은 지도) — Math.random 으로 칸 값을 정하지 않기',
      '바다 높이는 고정값이 아니라 「땅 비율」로 정렬해서 고르기 (시드마다 바다만 나오는 일이 없게)',
      '지도는 화면 밖 캔버스(ImageData)에 한 번 굽고, 매 프레임엔 그 그림만 그리기',
      '단계 보기: ① 잡음 겹치기 ② 가장자리 낮추기 ③ 색칠이 차례로 보이게',
    ],
    done: [
      '「새 시드」를 누르면 다른 섬이 나오고, 같은 시드면 똑같은 섬이 나온다',
      '회색 잡음 → 섬 모양 → 색 지도로 바뀌는 단계가 보인다',
      '「섬 모양 세기」를 0 으로 하면 가장자리까지 땅이 이어지고, 키우면 작은 섬이 된다',
      '범례(깊은 바다 · 모래 · 풀밭 · 숲 · 바위 · 눈)의 색이 지도 색과 맞다',
    ],
    code: {
      lang: 'ts',
      title: '높이 = fBm − 섬 틀, 바다 높이 = 땅 45% 되는 값',
      from: 'demos/demosMapA.ts makeTerrain · fbm 을 정리',
      body: `function fbm(x: number, y: number, s = 0, oct = 4): number {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let k = 0; k < oct; k++) {
    sum += vnoise(x * f, y * f, s + k * 17) * a; // 옥타브마다 다른 시드
    n += a;
    a *= 0.5;   // 세기 반
    f *= 2.03;  // 크기 2배 작게 (정확히 2 면 무늬가 겹쳐 보인다)
  }
  return sum / n;
}

function makeTerrain(W: number, H: number, seed: number, land = 0.45, isl = 1) {
  const h = new Float32Array(W * H), m = new Float32Array(W * H);
  const sc = 3.4 / H;
  const ox = hash2(seed, 1) * 200, oy = hash2(seed, 2) * 200;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const nx = (x / (W - 1)) * 2 - 1, ny = (y / (H - 1)) * 2 - 1;
    const d2 = nx * nx * 0.9 + ny * ny;           // 가운데에서 거리²
    const n = fbm(x * sc + ox, y * sc + oy, seed, 5);
    h[i] = n - isl * 0.62 * d2;                   // 가장자리를 깎아 섬으로
    m[i] = fbm(x * sc * 0.8 + 40, y * sc * 0.8 + 20, seed + 77, 3); // 습도
  }
  const s = Array.from(h).sort((a, b) => a - b);
  const sea = s[Math.floor((1 - land) * (s.length - 1))]; // 땅이 45% 되는 높이
  return { W, H, h, m, sea, hi: s[s.length - 1] };
}
// 색칠: t = (h − sea) / (hi − sea) → 모래 · 풀(습도로 마른 풀 ↔ 무성한 풀) · 숲 · 바위(0.52~) · 눈(0.76~)`,
    },
    pitfalls: [
      { title: '바다 높이를 고정값으로 두면 시드마다 땅 넓이가 들쭉날쭉하다', fix: '높이를 정렬해 「땅 비율」이 되는 값을 바다 높이로 쓴다.' },
      { title: '옥타브 배율을 정확히 2 로 두면 격자 무늬가 겹쳐 보인다', fix: '견본처럼 2.03 처럼 조금 어긋나게, 옥타브마다 시드도 바꾼다.' },
      { title: '매 프레임 칸마다 잡음을 다시 계산하면 느리다', fix: '지형은 시드가 바뀔 때만 ImageData 에 굽고, 프레임마다 그림만 그린다.' },
      { title: '경계를 if 로 딱 끊으면 땅 색 사이가 계단처럼 거칠다', fix: 'smoothstep 으로 좁은 구간에서 섞는다 (모래 → 풀 0.025~0.05).' },
    ],
    prev: ['i255'],
    next: ['i246', 'i251', 'i259', 'i275'],
    refs: [{ name: 'Red Blob Games — Making maps with noise functions', url: 'https://www.redblobgames.com/maps/terrain-from-noise/' }],
  },

  i246: {
    id: 'i246',
    summary: '씨앗 점마다 가장 가까운 땅을 한 지역으로 나누고, 씨앗을 무게중심으로 옮기기를 되풀이해 지역 크기를 고르게 한다.',
    terms: [
      { en: 'Voronoi diagram', ko: '가장 가까운 씨앗끼리 묶은 지역 나누기' },
      { en: "Lloyd's relaxation", ko: '씨앗을 제 지역의 무게중심으로 옮기기를 되풀이' },
      { en: 'Half-plane clipping', ko: '두 씨앗의 수직이등분선으로 다각형 자르기' },
      { en: 'Polygon centroid (shoelace)', ko: '신발끈 공식으로 넓이 · 무게중심' },
    ],
    goal: '{target}을(를) 보로노이 지역으로 나누고 로이드 완화로 크기를 고르게 다듬어 줘 — 씨앗이 무게중심으로 옮겨 가는 화살표가 보이게. 분위기는 {style}.',
    targets: ['나라 나누기 지도', '땅따먹기 판', '넓이 · 영역 색칠 문제'],
    styles: ['양피지 옛 지도', '밝은 파스텔 색칠', '깔끔한 도형 그림'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '씨앗 i 의 지역 = 온 땅에서 씨앗 i 가 가장 가까운 점들. 두 씨앗의 수직이등분선 한쪽만 남기기를 다른 모든 씨앗과 하면 그 다각형이 나온다.',
      '자를 때 반평면 식은 n·p ≤ c, 여기서 n = (다른 씨앗 − 내 씨앗), c = n·(두 씨앗의 가운데).',
      '다각형 무게중심은 신발끈 공식(꼭짓점 쌍의 외적 합)으로 구한다.',
      '로이드 완화: 모든 씨앗을 제 지역 무게중심으로 옮기고 다시 나누기를 몇 번(견본 8회) 하면 지역 넓이가 고르게 된다.',
      '넓이 차이(표준편차 ÷ 평균)를 막대로 보이면 되풀이할수록 줄어드는 것이 숫자로 보인다.',
    ],
    when: ['나라 · 영역 지도를 무작위로 만들 때', '땅따먹기처럼 칸 모양이 제각각이어도 크기는 비슷해야 할 때', '넓이 · 거리 개념을 그림으로 보여 줄 때'],
    avoid: ['씨앗이 수천 개 — 반평면 자르기는 n² 이라 대신 들로네 삼각분할(d3-delaunay 등)로', '네모 칸이면 충분한 판 — 대신 보통 격자'],
    cost: 'light',
    costNote: '씨앗 n 개마다 다른 n − 1 개로 자르니 n² (48개 = 약 2,300번 자르기). 수십 개까지는 매 프레임 다시 계산해도 가볍다.',
    level: 2,
    must: [
      '지역 다각형은 바깥 네모(판 전체)에서 시작해 반평면으로 잘라 만들기 — 판 밖으로 넘치지 않게',
      '로이드 한 번마다 「화살표(옛 자리 → 무게중심)」 → 「씨앗이 부드럽게 옮겨 감」 순서로 보이기',
      '넓이가 0 인 다각형(무게중심을 못 구함)은 씨앗을 그대로 두기',
      '씨앗 수 · 로이드 켬/끔 · 시드를 바꿀 수 있게',
    ],
    done: [
      '씨앗이 하나씩 뿌려지며 지역이 나뉘고, 국경선이 판 끝까지 정확히 이어진다',
      '로이드 완화가 돌면 몰려 있던 씨앗이 퍼지고 「넓이 차이 ±%」 숫자가 줄어든다',
      '로이드를 끄면 씨앗이 처음 자리에 머물고 지역 크기가 제각각이다',
      '씨앗 48개에서도 화면이 끊기지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '반평면 자르기로 보로노이 + 무게중심 + 로이드 한 번',
      from: 'demos/demosMapA.ts clipHalf · voronoi · centroid 를 정리',
      body: `type P2 = [number, number];
// 다각형에서 n·p <= c 쪽만 남긴다
function clipHalf(poly: P2[], nx: number, ny: number, c: number): P2[] {
  const out: P2[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
function voronoi(sites: P2[], W: number, H: number): P2[][] {
  return sites.map((s, i) => {
    let poly: P2[] = [[0, 0], [W, 0], [W, H], [0, H]];
    for (let j = 0; j < sites.length && poly.length > 2; j++) {
      if (j === i) continue;
      const o = sites[j], nx = o[0] - s[0], ny = o[1] - s[1];
      poly = clipHalf(poly, nx, ny, (nx * (o[0] + s[0]) + ny * (o[1] + s[1])) / 2); // 수직이등분선
    }
    return poly;
  });
}
function centroid(poly: P2[]): [number, number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length];
    const cr = p[0] * q[1] - q[0] * p[1]; // 신발끈
    a += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
  }
  a *= 0.5;
  return Math.abs(a) < 1e-9 ? [poly[0][0], poly[0][1], 0] : [cx / (6 * a), cy / (6 * a), Math.abs(a)];
}
// 로이드 한 번: 씨앗 → 제 지역 무게중심
const lloyd = (sites: P2[], W: number, H: number): P2[] =>
  voronoi(sites, W, H).map((p, i) => { const c = centroid(p); return c[2] > 0 ? [c[0], c[1]] : sites[i]; });`,
    },
    pitfalls: [
      { title: '다른 씨앗과의 수직이등분선 방향을 반대로 잡으면 지역이 사라진다', fix: 'n = 다른 씨앗 − 내 씨앗, 남기는 쪽은 n·p ≤ c (내 씨앗 쪽).' },
      { title: '넓이 0 인 다각형의 무게중심을 쓰면 NaN 이 퍼진다', fix: '넓이가 거의 0 이면 씨앗을 옮기지 않는다.' },
      { title: '씨앗을 한 번에 순간 이동시키면 로이드가 무엇을 하는지 안 보인다', fix: '화살표를 먼저 보이고, 그다음 ease 로 옮겨 가게 한다.' },
    ],
    prev: ['i245'],
    next: ['i277', 'i539'],
    refs: [
      { name: 'Wikipedia — Voronoi diagram', url: 'https://en.wikipedia.org/wiki/Voronoi_diagram' },
      { name: "Wikipedia — Lloyd's algorithm", url: 'https://en.wikipedia.org/wiki/Lloyd%27s_algorithm' },
    ],
  },

  i247: {
    id: 'i247',
    summary: '공간을 반씩 쪼개는 나무(BSP)를 만들고 잎마다 방 하나, 형제 칸끼리 꺾인 복도로 이어 늘 연결된 던전을 만든다.',
    terms: [
      { en: 'BSP dungeon generation (binary space partitioning)', ko: '공간을 반씩 쪼개 방 놓기' },
      { en: 'Leaf node room placement', ko: '더 안 쪼갠 칸마다 방 하나' },
      { en: 'L-shaped corridor', ko: '가로 먼저 · 세로 먼저 꺾인 복도' },
    ],
    goal: '{target}을(를) BSP 로 만들어 줘 — 공간을 반씩 쪼개는 선 → 칸마다 방 → 형제끼리 복도 순서로 지어지는 모습이 보이게. 분위기는 {style}.',
    targets: ['미로 탐험 던전', '방마다 문제가 있는 탐험 판', '로그라이크 층'],
    styles: ['도트 던전', '양피지 설계도', '밝은 놀이 판'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '판 전체(뿌리)를 가로나 세로로 38~62% 지점에서 둘로 쪼갠다. 길쭉한 쪽(비율 1.25 넘음)을 자르고, 비슷하면 동전 던지기.',
      '정한 깊이(견본 4)에 닿거나 너무 작으면(폭 16 · 높이 12 미만) 그 칸은 잎이 된다.',
      '잎마다 칸 크기의 40~78% 방을 칸 안에 하나 둔다.',
      '나무를 아래에서부터 돌며 두 형제 쪽에서 방을 하나씩 골라, 가로 먼저 또는 세로 먼저로 꺾인 복도를 잇는다 — 형제끼리 다 이어지니 던전 전체가 하나로 이어진다.',
    ],
    when: ['방과 복도가 또렷한 던전 · 건물 지도', '방 개수 · 크기를 대략 조절하고 싶을 때', '모든 방이 반드시 이어져야 할 때'],
    avoid: ['자연스러운 동굴 — 대신 셀룰러 오토마타 동굴(i248)', '길이 꼬불꼬불한 미로 — 대신 미로 생성(i250)'],
    cost: 'light',
    costNote: '64×40 칸 · 깊이 4 = 잎 16개 안팎. 짓기는 한순간이고, 견본은 보여 주려고 일부러 한 단계씩 나눠 그린다.',
    level: 2,
    must: [
      '쪼개기는 너비 우선(큐)으로, 쪼갠 선 · 방 · 복도를 일어난 순서대로 사건 목록에 쌓아 하나씩 보여 주기',
      '쪼갤 위치는 38~62% 사이 무작위 — 반반이면 판이 너무 반듯하다',
      '방은 칸 경계에서 한 칸 이상 떨어뜨리기 (이웃 방과 붙지 않게)',
      '복도는 방 칸을 덮어쓰지 않기 (빈 칸만 복도로)',
      '시드 · 쪼개기 깊이 · 나누기 선 보기를 바꿀 수 있게',
    ],
    done: [
      '나누기 선이 깊이 순서대로 생기고, 그다음 방들, 그다음 복도가 이어진다',
      '어떤 시드에서도 모든 방이 복도로 이어져 있다',
      '깊이를 2 로 하면 큰 방 몇 개, 6 으로 하면 작은 방이 많다',
      '시작(계단)과 끝(보물 상자)이 서로 다른 방에 놓인다',
    ],
    code: {
      lang: 'ts',
      title: 'BSP 쪼개기 → 잎마다 방 → 형제끼리 복도',
      from: 'demos/demosMapA.ts i247 start() 를 정리',
      body: `interface Node { x: number; y: number; w: number; h: number; d: number; a?: Node; b?: Node; room?: [number, number, number, number] }
const root: Node = { x: 1, y: 1, w: TW - 2, h: TH - 2, d: 0 };
const q: Node[] = [root], leaves: Node[] = [];
while (q.length) {
  const n = q.shift()!;
  const canV = n.w >= 16, canH = n.h >= 12;
  if (n.d >= maxDepth || (!canV && !canH)) { leaves.push(n); continue; }
  let vert = n.w / n.h > 1.25 ? true : n.h / n.w > 1.25 ? false : r() < 0.5; // 길쭉한 쪽을 자른다
  if (vert && !canV) vert = false;
  if (!vert && !canH) vert = true;
  if (vert) {
    const sx = Math.round(n.w * (0.38 + r() * 0.24));
    n.a = { x: n.x, y: n.y, w: sx, h: n.h, d: n.d + 1 };
    n.b = { x: n.x + sx, y: n.y, w: n.w - sx, h: n.h, d: n.d + 1 };
  } else {
    const sy = Math.round(n.h * (0.38 + r() * 0.24));
    n.a = { x: n.x, y: n.y, w: n.w, h: sy, d: n.d + 1 };
    n.b = { x: n.x, y: n.y + sy, w: n.w, h: n.h - sy, d: n.d + 1 };
  }
  q.push(n.a, n.b);
}
for (const n of leaves) { // 칸의 40~78% 방
  const rw = ri(Math.max(4, Math.floor(n.w * 0.4)), Math.max(4, Math.floor(n.w * 0.78)));
  const rh = ri(Math.max(3, Math.floor(n.h * 0.4)), Math.max(3, Math.floor(n.h * 0.78)));
  n.room = [n.x + ri(1, n.w - rw - 1), n.y + ri(1, n.h - rh - 1), rw, rh];
}
const pick = (n: Node): [number, number, number, number] => n.room ?? pick(r() < 0.5 ? n.a! : n.b!);
const walk = (n: Node): void => {
  if (!n.a || !n.b) return;
  walk(n.a); walk(n.b);
  corridor(pick(n.a), pick(n.b), r() < 0.5); // 두 방 안의 한 점끼리 가로 먼저 / 세로 먼저 꺾인 길
};
walk(root);`,
    },
    pitfalls: [
      { title: '쪼갤 위치를 늘 반으로 하면 판이 바둑판처럼 반듯하다', fix: '38~62% 사이에서 무작위로, 길쭉한 칸은 긴 쪽을 자른다.' },
      { title: '작은 칸까지 쪼개면 방이 안 들어간다', fix: '폭 16 · 높이 12 미만이면 더 쪼개지 않고 잎으로 둔다.' },
      { title: '방끼리 아무렇게나 이으면 떨어진 방이 생긴다', fix: '나무를 아래에서부터 돌며 형제 쪽끼리 이으면 전체가 반드시 하나로 이어진다.' },
    ],
    prev: ['i255'],
    next: ['i248', 'i264', 'i268'],
    refs: [{ name: 'RogueBasin — Basic BSP Dungeon generation', url: 'https://www.roguebasin.com/index.php/Basic_BSP_Dungeon_generation' }],
  },

  i248: {
    id: 'i248',
    summary: '무작위로 벽을 뿌린 뒤 「이웃 8칸 중 벽이 5개 이상이면 벽」 규칙을 몇 번 되풀이해, 자연스러운 동굴 모양을 만든다.',
    terms: [
      { en: 'Cellular automata cave generation', ko: '이웃 수 규칙으로 동굴 만들기' },
      { en: 'Moore neighborhood (8 neighbors)', ko: '둘레 8칸 이웃' },
      { en: 'Flood fill (connected components)', ko: '이어진 굴끼리 묶어 크기 세기' },
    ],
    goal: '{target}을(를) 셀룰러 오토마타로 만들어 줘 — 무작위 벽 → 규칙 되풀이 → 끊긴 작은 굴 메우기가 한 단계씩 보이게. 분위기는 {style}.',
    targets: ['용의 동굴 지도', '탐험 게임의 굴 층', '규칙 놀이 체험 판'],
    styles: ['어두운 보랏빛 동굴', '도트 그림', '밝은 지도 색'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '처음엔 칸마다 47% 확률로 벽을 놓는다 (판 테두리는 늘 벽).',
      '한 번 되풀이할 때 모든 칸을 동시에 바꾼다: 둘레 8칸 중 벽이 5개 이상이면 벽, 3개 이하면 빈 곳, 4개면 그대로.',
      '판 밖은 벽으로 친다 — 그래서 가장자리가 막힌 동굴이 된다.',
      '되풀이(견본 5번)가 끝나면 빈 칸을 4방향 flood fill 로 묶어 가장 큰 굴만 남기고 나머지는 벽으로 메운다.',
    ],
    when: ['동굴 · 숲 덤불처럼 울퉁불퉁한 모양이 필요할 때', '「규칙 하나로 모양이 생긴다」를 보여 줄 때', '방이 없는 자연 지형 층'],
    avoid: ['방과 복도가 또렷한 건물 — 대신 BSP 던전(i247)', '길이 반드시 하나로 이어진 미로 — 대신 미로 생성(i250)'],
    cost: 'light',
    costNote: '72×45 = 3,240칸 × 이웃 8칸 × 5번 ≈ 13만 번 더하기. 한순간에 끝난다.',
    level: 1,
    must: [
      '새 칸 값은 새 배열에 쓰기 — 같은 배열을 고치면서 세면 결과가 한쪽으로 쏠린다',
      '판 밖 이웃은 벽(1)으로 세기',
      '되풀이가 끝나면 가장 큰 굴만 남기기 (끊긴 작은 굴은 벽으로 메움)',
      '처음 벽 비율 · 되풀이 횟수 · 시드를 바꿀 수 있게',
    ],
    done: [
      '처음엔 소금 뿌린 듯한 점들이, 되풀이할 때마다 뭉쳐 매끈한 굴이 된다',
      '마지막에 떨어진 작은 굴이 사라지고 하나로 이어진 동굴만 남는다',
      '벽 비율을 0.38 로 하면 넓게 트인 굴, 0.56 이면 좁은 굴',
      '되풀이를 1 로 하면 아직 거칠고, 8 이면 아주 매끈하다',
    ],
    code: {
      lang: 'ts',
      title: '4-5 규칙 되풀이 + 가장 큰 굴만 남기기',
      from: 'demos/demosMapA.ts i248 start() · step() 을 정리',
      body: `const at = (g: Uint8Array, x: number, y: number) => (x < 0 || y < 0 || x >= GW || y >= GH ? 1 : g[y * GW + x]);
const walls8 = (g: Uint8Array, x: number, y: number) => {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += at(g, x + dx, y + dy);
  return n;
};
// 1) 무작위 벽 (테두리는 벽)
let grid = new Uint8Array(GW * GH);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++)
  grid[y * GW + x] = x === 0 || y === 0 || x === GW - 1 || y === GH - 1 || r() < 0.47 ? 1 : 0;
// 2) 규칙 되풀이 — 새 배열에 써서 모든 칸이 동시에 바뀌게
for (let it = 0; it < 5; it++) {
  const nx = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const n = walls8(grid, x, y);
    const edge = x === 0 || y === 0 || x === GW - 1 || y === GH - 1;
    nx[y * GW + x] = edge ? 1 : n >= 5 ? 1 : n <= 3 ? 0 : grid[y * GW + x];
  }
  grid = nx;
}
// 3) 4방향 flood fill 로 굴마다 번호 → 가장 큰 굴이 아니면 벽으로
const lab = new Int32Array(GW * GH).fill(-1);
const sizes: number[] = [];
for (let i = 0; i < GW * GH; i++) {
  if (grid[i] || lab[i] >= 0) continue;
  const id = sizes.length, st = [i];
  let n = 0;
  lab[i] = id;
  while (st.length) {
    const c = st.pop()!; n++;
    const x = c % GW, y = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = x + dx, ay = y + dy, k = ay * GW + ax;
      if (ax >= 0 && ay >= 0 && ax < GW && ay < GH && !grid[k] && lab[k] < 0) { lab[k] = id; st.push(k); }
    }
  }
  sizes.push(n);
}
const best = sizes.indexOf(Math.max(...sizes));
for (let i = 0; i < GW * GH; i++) if (!grid[i] && lab[i] !== best) grid[i] = 1;`,
    },
    pitfalls: [
      { title: '같은 배열을 고치면서 이웃을 세면 위 · 왼쪽으로 쏠린 모양이 된다', fix: '한 번 되풀이할 때는 새 배열에 쓰고 끝나면 바꿔 끼운다.' },
      { title: '판 밖을 빈 곳으로 세면 동굴이 가장자리로 뚫린다', fix: '판 밖 이웃은 벽으로 센다.' },
      { title: '끊긴 작은 굴을 그대로 두면 갈 수 없는 곳에 보물이 놓인다', fix: 'flood fill 로 가장 큰 굴만 남기고 나머지는 메운다.' },
      { title: '칸 그대로 그리면 네모 계단이 거칠다', fix: '견본은 칸 지도를 흐리게 키운 뒤 문턱(0.44~0.52)으로 잘라 매끈한 바위 테두리를 그린다.' },
    ],
    prev: ['i255', 'i247'],
    next: ['i258', 'i259', 'i268'],
    refs: [{ name: 'RogueBasin — Cellular Automata Method for Generating Random Cave-Like Levels', url: 'https://www.roguebasin.com/index.php/Cellular_Automata_Method_for_Generating_Random_Cave-Like_Levels' }],
  },

  i256: {
    id: 'i256',
    summary: '육각 칸을 (q, r, s) 세 수로 적고 늘 합을 0 으로 두어, 이웃 · 거리 · 고리 · 직선을 덧셈과 반올림만으로 구한다.',
    terms: [
      { en: 'Hexagonal grid — cube coordinates (q, r, s)', ko: '육각 격자 큐브 좌표 (q + r + s = 0)' },
      { en: 'Axial coordinates', ko: '두 수(q, r)만 적는 축 좌표 — s = −q − r' },
      { en: 'Hex distance / ring / line drawing', ko: '육각 거리 · 고리 · 직선' },
      { en: 'Cube rounding', ko: '소수 좌표를 가장 가까운 칸으로 반올림' },
    ],
    goal: '{target}을(를) 육각 격자 큐브 좌표로 만들어 줘 — 칸마다 (q, r, s) 가 보이고 이웃 6칸 · 거리 · 고리 · 직선을 차례로 보여 주게. 분위기는 {style}.',
    targets: ['헥스 보드게임 판', '벌집 퍼즐', '육각 칸 전략 지도'],
    styles: ['어두운 바탕에 세 가지 색 좌표', '밝은 보드게임', '벌집 노랑'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Tilemap + Grid 의 Cell Layout = Hexagon 으로 칸을 깔고, 좌표 계산은 직접 큐브 좌표로 한다.',
      godot: 'Godot 4 는 TileMap 의 TileSet tile_shape = Hexagon 으로 깔고, 이웃은 get_surrounding_cells() 로 얻는다.',
    },
    principle: [
      '육각 칸은 세 축 방향으로 움직일 수 있어서 (q, r, s) 세 수로 적고, 늘 q + r + s = 0 이 되게 둔다.',
      '이웃 6칸 = 여섯 방향 (1,0) (1,−1) (0,−1) (−1,0) (−1,1) (0,1) 을 더한 칸.',
      '두 칸 거리 = (|Δq| + |Δr| + |Δs|) ÷ 2.',
      '반지름 R 고리 = 한 방향으로 R 칸 간 뒤, 여섯 방향을 R 칸씩 걸으면 6R 칸이 나온다 (R = 3 이면 18칸).',
      '직선 = 두 칸 사이를 N(거리)등분해 소수 좌표를 반올림하고, 반올림 오차가 가장 큰 축을 나머지 두 축으로 다시 맞춘다.',
    ],
    when: ['헥스 보드게임 · 전략 지도', '이웃이 모두 같은 거리여야 하는 판 (네모 격자의 대각선 문제를 피함)', '거리 · 사거리 · 시야 계산이 많은 게임'],
    avoid: ['칸이 네모인 판 — 대신 보통 (x, y) 격자', '구 위 칸 — 대신 육각 타일 행성(i539)'],
    cost: 'light',
    costNote: '모든 계산이 덧셈 · 절댓값 · 반올림이라 아주 가볍다. 반지름 4 판 = 61칸.',
    level: 2,
    must: [
      '좌표는 저장할 땐 (q, r) 두 수, 계산할 땐 s = −q − r 을 함께 — 합이 0 인지 늘 지키기',
      '화면 위치는 x = 크기·√3·(q + r/2), y = 크기·1.5·r (뾰족한 쪽이 위인 육각)',
      '직선 반올림은 세 축을 각각 반올림한 뒤 오차가 가장 큰 축을 다시 계산 (그냥 반올림하면 합이 0 이 아니게 된다)',
      '직선 끝점에 1e-6 을 더해 경계에서 반올림이 흔들리지 않게',
    ],
    done: [
      '칸마다 q · r · s 세 수가 세 가지 색으로 적혀 있고 합이 늘 0 이다',
      '가운데 칸을 고르면 이웃 6칸이 빛나고, 다른 칸에는 거리 숫자가 동심원처럼 적힌다',
      '반지름 3 고리가 한 칸씩 이어지며 18칸이 칠해진다',
      '두 칸 사이 직선이 빈틈없이 이어진다',
    ],
    code: {
      lang: 'ts',
      title: '큐브 좌표 — 방향 · 거리 · 화면 위치 · 고리 · 직선',
      from: 'demos/demosMapA.ts i256 make() 를 정리',
      body: `type Hex = [number, number]; // (q, r), s = −q − r
const DIRS: Hex[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const dist = (a: Hex, b: Hex) =>
  (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;
// 뾰족한 쪽이 위인 육각의 화면 위치
const toScreen = (q: number, r: number, size: number): [number, number] =>
  [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r];

function ring(c: Hex, R: number): Hex[] {
  const out: Hex[] = [];
  let h: Hex = [c[0] + DIRS[4][0] * R, c[1] + DIRS[4][1] * R]; // 한 방향으로 R 칸
  for (let i = 0; i < 6; i++) for (let j = 0; j < R; j++) { out.push(h); h = [h[0] + DIRS[i][0], h[1] + DIRS[i][1]]; }
  return out; // 6R 칸
}
function hexLine(a: Hex, b: Hex): Hex[] {
  const n = dist(a, b), out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const k = n ? i / n : 0;
    const fq = a[0] + 1e-6 + (b[0] - a[0]) * k, fr = a[1] + 1e-6 + (b[1] - a[1]) * k, fs = -fq - fr;
    let q = Math.round(fq), r = Math.round(fr);
    const s = Math.round(fs);
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s; // 오차가 가장 큰 축을 나머지로 맞춘다
    else if (dr > ds) r = -q - s;
    out.push([q, r]);
  }
  return out;
}`,
    },
    pitfalls: [
      { title: '세 축을 그냥 반올림하면 q + r + s 가 0 이 아닌 칸이 생긴다', fix: '오차가 가장 큰 축을 나머지 두 축의 합의 반대로 다시 계산한다.' },
      { title: '(행, 열) 엇갈림 좌표로 이웃을 구하면 짝수 · 홀수 줄마다 식이 달라 틀리기 쉽다', fix: '계산은 큐브 좌표로 하고, 저장 · 화면 변환할 때만 바꾼다.' },
      { title: '직선이 칸 경계를 정확히 지나면 반올림이 칸마다 흔들린다', fix: '끝점에 1e-6 을 더해 한쪽으로 기울인다.' },
    ],
    next: ['i539', 'i264', 'i268'],
    refs: [{ name: 'Red Blob Games — Hexagonal Grids', url: 'https://www.redblobgames.com/grids/hexagons/' }],
  },

  i257: {
    id: 'i257',
    summary: '네모 격자를 45° 돌리고 세로를 반으로 눌러 비스듬한 화면으로 바꾸고, 뒤(x + y 작은 칸)부터 그려 겹침을 맞춘다.',
    terms: [
      { en: 'Isometric projection (2:1 dimetric tiles)', ko: '등각 타일 — 45° 돌리고 세로 ½' },
      { en: "Painter's algorithm (depth sort by x + y)", ko: '뒤에서 앞으로 그리기 순서' },
      { en: 'Grid ↔ screen coordinate transform', ko: '격자 좌표 ↔ 화면 좌표 바꾸기' },
    ],
    goal: '{target}을(를) 아이소메트릭 타일로 그려 줘 — 네모 격자가 45° 돌고 눌리는 과정과, 뒤에서 앞으로 블록을 쌓는 순서가 보이게. 분위기는 {style}.',
    targets: ['작은 섬 마을', '도시 짓기 판', '쌓기 퍼즐 판'],
    styles: ['밝은 블록 마을', '도트 그림', '파스텔 장난감'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Grid 의 Cell Layout = Isometric 과 Tilemap Renderer 의 Sort Order 로 뒤에서 앞 순서를 맞춘다.',
      godot: 'Godot 4 는 TileSet tile_shape = Isometric 에 y_sort_enabled 를 켠다.',
    },
    principle: [
      '격자 (x, y) 를 45° 돌리고 세로를 ½ 로 누르면 등각 화면: 화면 x = (x − y)·칸폭/2, 화면 y = (x + y)·칸높이/2.',
      '높이 z 는 화면 y 를 위로 빼서 블록을 세운다 (견본: z·칸·0.62).',
      '블록은 윗면 · 왼쪽 면 · 오른쪽 면 세 개의 사각형을 서로 다른 밝기로 칠한다.',
      '앞의 블록이 뒤를 가려야 하므로 x + y 가 작은 칸(뒤)부터 큰 칸(앞) 순서로 그린다 (화가 알고리즘).',
    ],
    when: ['3D 없이 입체감 있는 판을 그리고 싶을 때', '도시 · 농장 짓기처럼 칸이 많은 판', '도트 그림 느낌의 블록 세계'],
    avoid: ['카메라를 자유롭게 돌려야 할 때 — 대신 three.js 정사영 카메라', '블록이 칸보다 크거나 여러 칸에 걸칠 때 — 단순 x + y 정렬로는 겹침이 틀어진다'],
    cost: 'light',
    costNote: '7×7 = 49 블록 × 사각형 3개. 칸이 수천이면 정적인 바닥은 화면 밖 캔버스에 굽는다.',
    level: 2,
    must: [
      '그리기 순서는 깊이 x + y 오름차순, 같으면 칸 번호로 (순서가 프레임마다 흔들리지 않게)',
      '면 셋 순서: 왼쪽 면 → 오른쪽 면 → 윗면',
      '평면 → 등각으로 바뀌는 과정을 각도 · 세로 배율을 보간해 보여 주기',
      '「그리는 순서 틀리게」 켬/끔으로 앞 → 뒤로 그리면 겹침이 틀어지는 모습을 비교',
    ],
    done: [
      '위에서 본 네모 격자가 45° 돌며 세로로 눌려 마름모 격자가 된다',
      '블록이 뒤에서부터 차례로 떨어져 쌓이고, 앞 블록이 뒤 블록을 바르게 가린다',
      '순서를 틀리게 하면 뒤 블록이 앞 블록 위에 그려져 겹침이 깨진다',
      '그리는 순서 번호를 켜면 x + y 순서대로 번호가 붙어 있다',
    ],
    code: {
      lang: 'ts',
      title: '격자 → 등각 화면 + 뒤에서 앞으로 블록 그리기',
      from: 'demos/demosMapA.ts i257 draw() 를 정리',
      body: `// k: 0 = 위에서 본 네모, 1 = 등각 (견본은 이 값을 보간해 바뀌는 모습을 보여 준다)
const ang = (k * Math.PI) / 4, sy = 1 - 0.5 * k;
const P = (gx: number, gy: number, z = 0): [number, number] => {
  const a = (gx - N / 2) * S, b = (gy - N / 2) * S;
  const x = a * Math.cos(ang) - b * Math.sin(ang);
  const y = (a * Math.sin(ang) + b * Math.cos(ang)) * sy;   // 세로 ½
  return [cx + x, cy + y - z * S * 0.62 * k];                // 높이는 위로
};
const quad = (p: [number, number][], col: string) => {
  g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])));
  g.closePath(); g.fillStyle = col; g.fill();
};
// 깊이 = x + y. 작은 것(뒤)부터
const depth = (i: number) => (i % N) + Math.floor(i / N);
const order = [...Array(N * N).keys()].sort((a, b) => depth(a) - depth(b) || a - b);
for (const c of order) {
  const x = c % N, y = Math.floor(c / N), hz = hts[c];
  const [top, left, right] = COLS[kinds[c]];
  const A = P(x, y, hz), B = P(x + 1, y, hz), C = P(x + 1, y + 1, hz), D = P(x, y + 1, hz);
  const Cb = P(x + 1, y + 1, 0), Db = P(x, y + 1, 0), Bb = P(x + 1, y, 0);
  quad([D, C, Cb, Db], left);   // 앞 왼쪽 면
  quad([C, B, Bb, Cb], right);  // 앞 오른쪽 면
  quad([A, B, C, D], top);      // 윗면
}`,
    },
    pitfalls: [
      { title: '앞에서 뒤로 그리면 뒤 블록이 앞 블록을 덮는다', fix: '깊이 x + y 오름차순으로 그린다. 견본의 「그리는 순서 틀리게」 토글로 차이를 볼 수 있다.' },
      { title: '같은 깊이끼리 순서가 정해지지 않으면 프레임마다 깜박인다', fix: '정렬에 칸 번호를 두 번째 열쇠로 넣는다.' },
      { title: '면 세 개 밝기가 같으면 블록이 납작해 보인다', fix: '윗면 가장 밝게, 왼쪽 면 중간, 오른쪽 면 가장 어둡게 (견본 COLS 세 색).' },
    ],
    next: ['i275', 'i258'],
    refs: [{ name: 'Clint Bellanger — Isometric Tiles Math', url: 'https://clintbellanger.net/articles/isometric_math/' }],
  },

  i258: {
    id: 'i258',
    summary: '땅 칸마다 이웃 4칸이 땅인지를 비트(위1 · 오른쪽2 · 아래4 · 왼쪽8)로 더해, 그 수에 맞는 가장자리 모양을 저절로 고른다.',
    terms: [
      { en: 'Autotiling (bitmask tiling)', ko: '이웃 비트로 가장자리 조각 고르기' },
      { en: '4-bit (16-tile) / 8-bit (47-tile blob) bitmask', ko: '이웃 4칸 = 16조각 · 8칸 = 47조각' },
      { en: 'Concave corner fill', ko: '양옆은 땅 · 대각선은 물인 오목 모서리 메우기' },
    ],
    goal: '{target}에 자동 타일을 넣어 줘 — 땅을 칠하면 이웃 비트 수에 맞게 해안선 · 모래 띠 · 둥근 모서리가 저절로 생기고, 칸마다 비트 수가 보이게. 분위기는 {style}.',
    targets: ['섬 · 물 경계', '길 · 땅 경계 타일맵', '그리기 놀이 판'],
    styles: ['밝은 지도 색', '도트 타일', '파스텔 그림책'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 2D Tilemap Extras 의 Rule Tile 로 이웃 규칙을 정해 둔다.',
      godot: 'Godot 4 는 TileSet 의 Terrain Sets (Match Corners and Sides) 로 칠하면 저절로 이어진다.',
    },
    principle: [
      '땅 칸마다 위 · 오른쪽 · 아래 · 왼쪽 이웃이 땅이면 1 · 2 · 4 · 8 을 더한다 → 0~15, 16가지.',
      '그 수가 어느 쪽이 물에 드러났는지 알려 준다 (15 = 사방이 땅, 0 = 외딴섬).',
      '견본은 그림 조각 대신 코드로 그린다: 드러난 쪽만 e 만큼 넓히고, 두 쪽이 드러난 바깥 모서리는 둥글게.',
      '물거품(넓게) → 모래(조금 넓게) → 풀(안쪽으로 좁게) 세 겹을 같은 규칙으로 쌓으면 해안 띠가 생긴다.',
      '양옆은 땅인데 대각선만 물인 오목 모서리는 따로 메운다 — 8칸 비트(47조각)가 필요한 까닭.',
    ],
    when: ['칠하기만 하면 경계가 매끈해져야 하는 타일맵', '지도 편집기 · 그리기 놀이', '물 · 땅 · 길 경계가 많은 판'],
    avoid: ['경계가 칸과 상관없이 매끈해야 할 때 — 대신 마칭 스퀘어(i259)', '칸이 몇 개 없는 고정된 판 — 손으로 조각을 놓는 편이 쉽다'],
    cost: 'light',
    costNote: '24×15 = 360칸 × 겹 3개. 칸을 바꿀 때만 다시 그리면 더 가볍다.',
    level: 2,
    must: [
      '비트 값은 위 1 · 오른쪽 2 · 아래 4 · 왼쪽 8 로 고정 (조각 번호와 맞게)',
      '판 밖은 땅이 아닌 것으로 세기',
      '바깥 모서리(두 쪽이 드러남)만 둥글게, 오목 모서리는 따로 메우기',
      '「자동 타일」 켬/끔으로 네모 칸과 비교 · 칸마다 비트 수 보기',
    ],
    done: [
      '땅을 칠하면 그 칸과 이웃 칸의 가장자리가 바로 바뀐다',
      '해안에 흰 물거품 · 모래 띠 · 풀이 겹으로 보이고 바깥 모서리가 둥글다',
      '자동 타일을 끄면 네모 칸 그대로라 계단처럼 보인다',
      '칸마다 적힌 비트 수(0~15)가 실제 이웃 모양과 맞다',
    ],
    code: {
      lang: 'ts',
      title: '이웃 비트 수 + 드러난 쪽만 넓히는 칸 모양',
      from: 'demos/demosMapA.ts i258 maskOf · shape 를 정리',
      body: `const L = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GH && land[y * GW + x] === 1;
// 위 1 · 오른쪽 2 · 아래 4 · 왼쪽 8
const maskOf = (x: number, y: number) =>
  (L(x, y - 1) ? 1 : 0) | (L(x + 1, y) ? 2 : 0) | (L(x, y + 1) ? 4 : 0) | (L(x - 1, y) ? 8 : 0);

/** 드러난 쪽만 e 만큼 늘이고(음수면 줄이고), 두 쪽이 드러난 모서리는 반지름 r 로 둥글게 */
function shape(g: CanvasRenderingContext2D, x: number, y: number, X: number, Y: number, s: number, e: number, r: number) {
  const m = maskOf(x, y);
  const n = !(m & 1), ea = !(m & 2), so = !(m & 4), we = !(m & 8);
  const x0 = X - (we ? e : 0), x1 = X + s + (ea ? e : 0);
  const y0 = Y - (n ? e : 0), y1 = Y + s + (so ? e : 0);
  g.beginPath();
  g.roundRect(x0, y0, x1 - x0, y1 - y0, [n && we ? r : 0, n && ea ? r : 0, so && ea ? r : 0, so && we ? r : 0]);
  g.fill();
}
// 세 겹: [색, 넓힘 e, 둥근 반지름 r] — 칸 크기 s 기준
const layers: [string, number, number][] = [
  ['rgba(255,255,255,0.55)', s * 0.24, s * 0.5], // 물거품
  ['#e9d39a', s * 0.1, s * 0.38],                 // 모래
  ['#7fc45c', -s * 0.14, s * 0.26],               // 풀 (안쪽으로)
];
for (const [col, e, r] of layers) {
  g.fillStyle = col;
  for (const i of landCells) shape(g, i % GW, (i / GW) | 0, ox + (i % GW) * s, oy + ((i / GW) | 0) * s, s, e, r);
}`,
    },
    pitfalls: [
      { title: '이웃 4칸만 보면 오목한 모서리에 물 구멍이 남는다', fix: '양옆은 땅이고 대각선만 물인 모서리를 따로 메운다 (8칸 비트 = 47조각 방식).' },
      { title: '비트 순서를 조각 그림 순서와 다르게 정하면 엉뚱한 조각이 붙는다', fix: '위 1 · 오른쪽 2 · 아래 4 · 왼쪽 8 처럼 한 번 정하고 조각 번호를 그 수로 맞춘다.' },
      { title: '칸 하나를 바꾸고 그 칸만 다시 그리면 이웃 가장자리가 그대로 남는다', fix: '바꾼 칸과 둘레 8칸을 함께 다시 고른다 (견본은 매 프레임 전체를 다시 그림).' },
    ],
    prev: ['i248'],
    next: ['i259'],
  },

  i259: {
    id: 'i259',
    summary: '칸 네 귀가 기준보다 높은지 낮은지로 16가지 선 조각을 고르고 이어, 높이 지도에서 매끈한 해안선 · 등고선을 뽑는다.',
    terms: [
      { en: 'Marching squares', ko: '네 귀 값으로 칸마다 선 조각 고르기' },
      { en: 'Isoline / contour line', ko: '같은 높이를 잇는 선' },
      { en: 'Linear interpolation on edges', ko: '모서리 위에서 기준값이 되는 곳 찾기' },
      { en: 'Saddle case (ambiguous)', ko: '대각선 귀만 높은 애매한 칸' },
    ],
    goal: '{target}에 마칭 스퀘어로 등고선을 그려 줘 — 칸을 하나씩 훑으며 선이 이어지고, 칸마다 조각 번호(0~15)가 보이게. 분위기는 {style}.',
    targets: ['높이 지도 등고선', '섬의 매끈한 해안선', '함수 그래프 같은 값 선'],
    styles: ['어두운 바탕에 밝은 선', '지도 색 띠', '모눈종이 그래프'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '격자 귀마다 높이 값이 있다. 기준(견본 0.5)보다 높으면 ●, 낮으면 ○ — 네 귀로 2⁴ = 16가지.',
      '칸의 모서리 중 한쪽 귀는 ●, 다른 쪽은 ○ 인 모서리를 선이 지나간다.',
      '지나는 자리는 보간으로: t = (기준 − a) / (b − a). 보간을 끄면 모서리 가운데라 계단처럼 보인다.',
      '건너는 점을 두 개씩 이으면 선 조각, ● 귀와 건너는 점을 이은 다각형을 칠하면 땅이 된다.',
      '기준을 여러 개(0.3 ~ 0.92)로 하면 높이 띠와 등고선이 여러 겹 나온다.',
    ],
    when: ['높이 · 온도 같은 값 지도에서 경계선을 뽑을 때', '칸 지도를 매끈한 해안선으로 바꿀 때', '등고선 읽기 체험'],
    avoid: ['칸마다 다른 그림 조각이 필요한 타일맵 — 대신 자동 타일(i258)', '3D 덩어리 표면 — 대신 마칭 큐브'],
    cost: 'light',
    costNote: '28×17 칸 × 기준 수. 칸마다 귀 4개 비교 · 보간 몇 번이라 매 프레임 다시 해도 가볍다.',
    level: 2,
    must: [
      '값은 칸이 아니라 격자 귀에 둔다 ((GX+1)×(GY+1) 개)',
      '건너는 자리는 선형 보간 (끄면 가운데 → 계단으로 비교)',
      '대각선 두 귀만 높은 애매한 칸(5 · 10번)은 건너는 점이 넷 — 둘씩 짝지어 선 두 개',
      '칸을 하나씩 훑는 진행이 보이게, 등고선 개수 · 격자 칸 수를 바꿀 수 있게',
    ],
    done: [
      '칸을 훑으며 선이 왼쪽 위부터 차례로 이어져 끊김 없는 해안선이 된다',
      '보간을 끄면 선이 계단처럼 꺾이고, 켜면 매끈하다',
      '등고선 개수를 늘리면 높이 띠 색과 선이 여러 겹 나온다',
      '귀 점(● · ○)과 조각 번호가 실제 선 모양과 맞다',
    ],
    code: {
      lang: 'ts',
      title: '칸 하나 — 높은 귀 다각형 + 건너는 선 조각',
      from: 'demos/demosMapA.ts i259 draw() 를 정리',
      body: `const V = (x: number, y: number) => f[y * (GX + 1) + x]; // 값은 격자 귀에
const segs: [number, number][] = [];
g.beginPath();
for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
  const cv: [number, number, number][] = [
    [x, y, V(x, y)], [x + 1, y, V(x + 1, y)], [x + 1, y + 1, V(x + 1, y + 1)], [x, y + 1, V(x, y + 1)],
  ];
  const poly: [number, number][] = [], cross: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const a = cv[k], b = cv[(k + 1) % 4];
    if (a[2] >= th) poly.push([ox + a[0] * cs, oy + a[1] * cs]);       // 높은 귀
    if ((a[2] >= th) !== (b[2] >= th)) {                                 // 이 모서리를 선이 지난다
      const t = interp ? (th - a[2]) / (b[2] - a[2]) : 0.5;
      const q: [number, number] = [ox + (a[0] + (b[0] - a[0]) * t) * cs, oy + (a[1] + (b[1] - a[1]) * t) * cs];
      poly.push(q); cross.push(q);
    }
  }
  if (poly.length >= 3) { poly.forEach((q, k) => (k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); }
  for (let k = 0; k + 1 < cross.length; k += 2) segs.push(cross[k], cross[k + 1]); // 애매한 칸은 점 4개 → 선 2개
}
g.fillStyle = '#7fc45c'; g.fill();          // 땅
g.beginPath();
for (let k = 0; k + 1 < segs.length; k += 2) { g.moveTo(segs[k][0], segs[k][1]); g.lineTo(segs[k + 1][0], segs[k + 1][1]); }
g.strokeStyle = '#fffbe8'; g.lineWidth = 2.2; g.stroke(); // 해안선`,
    },
    pitfalls: [
      { title: '값을 칸 가운데에 두면 귀 네 개가 없어 조각을 못 고른다', fix: '값 배열은 (GX+1)×(GY+1) 귀에 둔다.' },
      { title: '보간 없이 모서리 가운데로 이으면 계단 선이 된다', fix: 't = (기준 − a)/(b − a) 로 건너는 자리를 찾는다.' },
      { title: '애매한 칸(대각선 귀만 높음)에서 선이 엇갈려 보일 수 있다', fix: '건너는 점을 순서대로 둘씩 짝짓는다. 더 정확히 하려면 칸 가운데 값(네 귀 평균)으로 이을 방향을 정한다.' },
    ],
    prev: ['i245', 'i258'],
    next: ['i279'],
    refs: [{ name: 'Wikipedia — Marching squares', url: 'https://en.wikipedia.org/wiki/Marching_squares' }],
  },

  i261: {
    id: 'i261',
    summary: '같은 지구 윤곽을 등거리 원통 · 메르카토르 · 몰바이데 식으로 펴서 부드럽게 바꿔 보이고, 같은 크기 원과 넓이 비로 왜곡을 드러낸다.',
    terms: [
      { en: 'Map projection (equirectangular · Mercator · Mollweide)', ko: '구를 평면으로 펴는 세 가지 식' },
      { en: 'Tissot indicatrix', ko: '지구 위 같은 크기 원 — 펴면 얼마나 늘어나는지 보임' },
      { en: 'Conformal vs equal-area projection', ko: '각도를 지키는 투영 · 넓이를 지키는 투영' },
    ],
    goal: '{target}을(를) 세 가지 지도 투영으로 바꿔 가며 보여 줘 — 위경도선 · 같은 크기 원(티소 원) · 그린란드 : 아프리카 넓이 비가 함께 바뀌게. 분위기는 {style}.',
    targets: ['세계 지도', '「지도의 거짓말」 체험', '비율 · 넓이 수업 화면'],
    styles: ['어두운 바탕 밝은 대륙', '종이 지도', '교과서 그림'],
    platforms: ['canvas', 'web'],
    principle: [
      '등거리 원통: (x, y) = (경도, 위도) 를 그대로 — 가장 쉽지만 극으로 갈수록 옆으로 늘어난다.',
      '메르카토르: y = ln(tan(π/4 + 위도/2)) — 작은 모양 · 각도는 지키지만 극에서 넓이가 끝없이 커진다 (견본은 위도 82° 에서 자름).',
      '몰바이데: 2θ + sin 2θ = π·sin(위도) 를 뉴턴법으로 풀어 x = (2√2/π)·경도·cos θ, y = √2·sin θ — 넓이를 지킨다.',
      '두 투영 사이는 같은 점의 두 결과를 섞어(lerp) 부드럽게 바꾼다 (화면 크기도 각자 맞춘 배율끼리 섞음).',
      '지구 위 반지름 6° 원을 구면 식으로 만든 뒤 함께 투영하면, 원이 얼마나 커지고 찌그러지는지 보인다.',
    ],
    when: ['지도 투영 · 축척 · 넓이 왜곡을 설명할 때', '세계 지도를 그려야 하는 게임 · 체험', '「왜 그린란드가 커 보일까?」 같은 질문 화면'],
    avoid: ['지구를 돌려 봐야 할 때 — 대신 구 지도(i262)', '나라 경계 자료가 정확해야 할 때 — 견본 윤곽은 단순화된 점이라 Natural Earth 같은 자료를 쓴다'],
    cost: 'light',
    costNote: '투영 셋을 처음에 한 번 다 계산해 두고(대륙 점 · 위경도선 · 티소 원), 프레임마다 섞어 그리기만 한다.',
    level: 2,
    must: [
      '메르카토르는 위도 ±82° 처럼 끊기 (90° 는 무한대)',
      '몰바이데 θ 는 뉴턴법 반복(최대 12번, 오차 1e-7)으로 — 극 근처는 위도를 ±89.999 로 자르기',
      '대륙 윤곽은 2° 간격으로 점을 촘촘히 채운 뒤(densify) 투영 — 직선으로 이으면 휘어야 할 선이 곧다',
      '투영마다 화면에 꽉 차도록 배율을 따로 맞추고, 바꿀 때 배율도 함께 섞기',
      '그린란드 : 아프리카 화면 넓이 비를 신발끈 공식으로 계산해 보여 주기',
    ],
    done: [
      '세 투영이 자동으로 부드럽게 바뀌고, 지금 투영 이름이 보인다',
      '티소 원이 등거리 · 메르카토르에서는 극으로 갈수록 커지고, 몰바이데에서는 넓이가 비슷하다',
      '메르카토르에서 그린란드 : 아프리카 넓이 비가 1 : 몇 으로 확 줄어든다 (실제는 약 1 : 14)',
      '슬라이더로 투영을 직접 고를 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '세 가지 투영 식 + 티소 원 만들기',
      from: 'demos/demosMapA.ts i261 make() 를 정리',
      body: `type P2 = [number, number];
const R = Math.PI / 180, MAXLAT = 82;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const moll = (lon: number, lat: number): P2 => {
  const ph = clamp(lat, -89.999, 89.999) * R;
  let th = ph;
  for (let i = 0; i < 12; i++) { // 2θ + sin2θ = π sinφ 를 뉴턴법으로
    const d = (2 * th + Math.sin(2 * th) - Math.PI * Math.sin(ph)) / (2 + 2 * Math.cos(2 * th));
    th -= d;
    if (Math.abs(d) < 1e-7) break;
  }
  return [((2 * Math.SQRT2) / Math.PI) * lon * R * Math.cos(th), Math.SQRT2 * Math.sin(th)];
};
const PROJ: ((lon: number, lat: number) => P2)[] = [
  (lon, lat) => [lon * R, lat * R],                                                      // 등거리 원통
  (lon, lat) => [lon * R, Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -MAXLAT, MAXLAT) * R) / 2))], // 메르카토르
  moll,                                                                                    // 몰바이데
];
// 티소 원: (lon, lat) 둘레 반지름 6° 인 지구 위 원
function tissot(lon: number, lat: number, rDeg = 6): [number, number][] {
  const r = rDeg * R, p1 = lat * R, ring: [number, number][] = [];
  for (let k = 0; k < 28; k++) {
    const b = (k / 28) * Math.PI * 2;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(r) + Math.cos(p1) * Math.sin(r) * Math.cos(b));
    const l2 = lon * R + Math.atan2(Math.sin(b) * Math.sin(r) * Math.cos(p1), Math.cos(r) - Math.sin(p1) * Math.sin(p2));
    ring.push([l2 / R, p2 / R]);
  }
  return ring;
}
// 두 투영 사이 섞기 (sa, sb = 각 투영을 화면에 맞춘 배율)
const M = (a: P2, b: P2, k: number): P2 => [cx + (a[0] * sa + (b[0] * sb - a[0] * sa) * k), cy - (a[1] * sa + (b[1] * sb - a[1] * sa) * k)];`,
    },
    pitfalls: [
      { title: '메르카토르를 극까지 그리면 y 가 무한대로 튄다', fix: '위도를 ±82° 로 잘라 투영한다.' },
      { title: '대륙 점을 그대로 투영해 직선으로 이으면 휘어야 할 경계가 곧다', fix: '먼저 2° 간격으로 점을 채운(densify) 뒤 투영한다.' },
      { title: '투영마다 크기가 달라 바꾸는 순간 지도가 튄다', fix: '투영마다 화면에 맞춘 배율을 구해 두고 점과 함께 배율도 섞는다.' },
    ],
    prev: ['i262'],
    next: ['i277', 'i272'],
    refs: [
      { name: 'Wikipedia — Mercator projection', url: 'https://en.wikipedia.org/wiki/Mercator_projection' },
      { name: 'Wikipedia — Mollweide projection', url: 'https://en.wikipedia.org/wiki/Mollweide_projection' },
      { name: "Wikipedia — Tissot's indicatrix", url: 'https://en.wikipedia.org/wiki/Tissot%27s_indicatrix' },
    ],
  },

  i262: {
    id: 'i262',
    summary: '위도 · 경도를 지구본 위 3D 점으로 바꾸고, 두 도시를 구면 보간(slerp)으로 이어 가장 짧은 큰 원 길과 비행 곡선을 그린다.',
    terms: [
      { en: 'Latitude/longitude to 3D (spherical coordinates)', ko: '위도 · 경도 → 구 위 점' },
      { en: 'Great-circle route', ko: '구의 중심을 지나는 평면이 자른 가장 짧은 길' },
      { en: 'Spherical linear interpolation (slerp)', ko: '두 방향 사이를 구면 위로 고르게 잇기' },
      { en: 'three.js TubeGeometry + setDrawRange', ko: '곡선 관을 만들고 앞부분만 그려 자라게' },
    ],
    goal: '{target}을(를) 지구본 위에 그려 줘 — 두 도시를 큰 원 길(점선)과 위로 솟은 비행 곡선으로 잇고, 비행기가 그 길을 따라가며 거리(km)가 보이게. 분위기는 {style}.',
    targets: ['도시 사이 비행 길', '최단 거리 · 각도 체험', '세계 여행 게임 지도'],
    styles: ['밤하늘 속 지구본', '밝은 교과서 지구본', '장난감 지구본'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Vector3.Slerp 로 두 방향을 잇고 LineRenderer 로 길을 그린다.',
      godot: 'Godot 은 Vector3.slerp() 로 점을 만들고 Path3D + CSGPolygon3D(경로 따라) 또는 ImmediateMesh 로 그린다.',
    },
    principle: [
      '경도 λ · 위도 φ 를 단위 구 위 점으로: (−cos(λ+180°)·cos φ, sin φ, sin(λ+180°)·cos φ) — three 의 SphereGeometry 무늬 좌표와 맞춘 식.',
      '두 점 사이 각 θ = va.angleTo(vb), 땅 위 거리 = θ × 6371 km.',
      '구면 보간: p(s) = va·sin((1−s)θ)/sin θ + vb·sin(sθ)/sin θ — 이 점들이 큰 원 위에 고르게 놓인다.',
      '비행 곡선은 같은 점을 1.004 + sin(πs)·(0.05 + 0.07θ) 배로 띄워 가운데가 솟게 하고, 관(TubeGeometry)으로 만든다.',
      '관은 setDrawRange 로 앞부분만 그려 길이 자라는 것처럼 보이고, 비행기는 curve.getPointAt(s) 에 두고 다음 점을 바라보게 한다.',
    ],
    when: ['두 도시 사이 최단 거리 · 비행 경로를 보여 줄 때', '위도 · 경도 좌표를 3D 로 찍어야 할 때', '세계 지도 게임의 지구본 화면'],
    avoid: ['넓이 · 모양을 평면에서 비교할 때 — 대신 지도 투영(i261)', '정밀한 측지 거리(타원체)가 필요할 때 — 구 모델은 0.5% 안팎 오차'],
    cost: 'light',
    costNote: '지구 무늬 캔버스 2048×1024 를 한 번 굽고, 구 96×64 조각 하나. 길은 점 80개 곡선 · 관 160마디라 폰도 가볍다.',
    level: 2,
    must: [
      '위경도 → 3D 식은 SphereGeometry 의 무늬(UV) 방향과 맞추기 — 안 맞으면 도시 핀이 엉뚱한 나라에 꽂힌다',
      '큰 원은 구면 보간(slerp)으로 — 직선 보간 후 normalize 만 하면 간격이 고르지 않다',
      '땅 위 큰 원(점선 LineDashedMaterial + computeLineDistances)과 하늘의 비행 곡선을 따로',
      '지구본은 도시 쌍이 바뀔 때 두 도시의 가운데가 보이도록 부드럽게 돌기 (각도는 −π~π 로 감아서 보간)',
    ],
    done: [
      '도시 핀이 실제 나라 자리(서울 · 런던 · 뉴욕 …)에 꽂혀 있다',
      '점선 큰 원이 땅 위에, 노란 비행 곡선이 그 위로 솟아 자라고, 비행기가 길 방향을 보며 날아간다',
      '「큰 원 거리 약 ○○ km」 가 실제와 비슷하다 (서울 – 런던 약 8,900 km)',
      '「다음 도시」를 누르면 지구본이 돌아 새 길을 보여 준다',
    ],
    code: {
      lang: 'ts',
      title: '위경도 → 3D, 큰 원 점선 + 솟은 비행 곡선',
      from: 'demos/demosMapA.ts llVec · i262 nextRoute 를 정리',
      body: `import * as THREE from 'three';
// 경도 · 위도 → 단위 구 위 점 (SphereGeometry 무늬 좌표와 맞춤)
function llVec(lon: number, lat: number): THREE.Vector3 {
  const p = ((lon + 180) * Math.PI) / 180, t = (lat * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(p) * Math.cos(t), Math.sin(t), Math.sin(p) * Math.cos(t));
}
const va = llVec(126.98, 37.57), vb = llVec(-0.13, 51.5); // 서울 → 런던
const ang = va.angleTo(vb);
const distKm = ang * 6371;
const slerp = (s: number) => va.clone().multiplyScalar(Math.sin((1 - s) * ang) / Math.sin(ang))
  .add(vb.clone().multiplyScalar(Math.sin(s * ang) / Math.sin(ang)));
// 비행 곡선: 가운데가 솟게
const pts: THREE.Vector3[] = [];
for (let i = 0; i <= 80; i++) { const s = i / 80; pts.push(slerp(s).multiplyScalar(1.004 + Math.sin(Math.PI * s) * (0.05 + ang * 0.07))); }
const curve = new THREE.CatmullRomCurve3(pts);
const RAD = 8, TUB = 160;
const tubeGeo = new THREE.TubeGeometry(curve, TUB, 0.011, RAD, false);
globe.add(new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: 0xffd34a })));
// 땅 위 큰 원 (점선)
const gpts: THREE.Vector3[] = [];
for (let i = 0; i <= 120; i++) gpts.push(slerp(i / 120).multiplyScalar(1.003));
const ground = new THREE.Line(new THREE.BufferGeometry().setFromPoints(gpts),
  new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.025, gapSize: 0.02, transparent: true, opacity: 0.85 }));
ground.computeLineDistances(); // 점선에 꼭 필요
globe.add(ground);
// 매 프레임: grow 0 → 1
tubeGeo.setDrawRange(0, Math.floor(grow * TUB) * RAD * 6); // 마디 하나 = 사각형 RAD 개 = 삼각형 2·RAD
plane.position.copy(curve.getPointAt(grow));
plane.lookAt(globe.localToWorld(curve.getPointAt(Math.min(1, grow + 0.01))));`,
    },
    pitfalls: [
      { title: '위경도 식이 구 무늬 방향과 다르면 도시가 엉뚱한 곳에 찍힌다', fix: 'three 의 SphereGeometry 는 경도 −180° 가 u = 0 이라 (lon + 180) 을 쓰고 x 에 − 를 붙인다.' },
      { title: '두 점을 직선으로 섞고 normalize 하면 가운데가 몰려 비행기 속도가 들쭉날쭉하다', fix: 'sin 가중치 구면 보간(slerp)을 쓴다.' },
      { title: 'LineDashedMaterial 이 실선으로 보인다', fix: '선을 만든 뒤 computeLineDistances() 를 불러야 점선이 된다.' },
      { title: '지구본을 돌릴 때 반대로 한 바퀴 휙 돈다', fix: '목표 각과의 차이를 −π~π 로 감아서 보간한다.' },
    ],
    prev: ['i261'],
    next: ['i539', 'i275'],
    refs: [
      { name: 'Wikipedia — Great-circle distance', url: 'https://en.wikipedia.org/wiki/Great-circle_distance' },
      { name: 'Wikipedia — Slerp', url: 'https://en.wikipedia.org/wiki/Slerp' },
    ],
  },

  i539: {
    id: 'i539',
    summary: '정이십면체를 잘게 나눈 구의 쌍대를 만들어, 육각형 칸과 늘 12개뿐인 오각형 칸으로 덮인 행성을 짓고 칸마다 이웃 · 높이를 준다.',
    terms: [
      { en: 'Goldberg polyhedron (hex sphere)', ko: '육각형 + 오각형 12개로 덮인 구' },
      { en: 'Geodesic icosphere subdivision', ko: '정이십면체 면을 n 등분해 구로 부풀리기' },
      { en: 'Dual mesh', ko: '꼭짓점 ↔ 면을 바꾼 그물 — 꼭짓점마다 칸 하나' },
      { en: "Euler's formula V − E + F = 2", ko: '꼭짓점 − 모서리 + 면 = 2' },
    ],
    goal: '{target}을(를) 골드버그 다면체(육각 타일 행성)로 만들어 줘 — 나누기 수를 바꿔도 오각형은 12개, 칸을 누르면 이웃이 빛나고 오일러 공식 숫자가 보이게. 분위기는 {style}.',
    targets: ['행성 땅따먹기 판', '구 위 보드게임', '오일러 공식 체험'],
    styles: ['밝은 장난감 행성', '육각 기둥 디오라마', '어두운 우주'],
    platforms: ['three', 'unity', 'godot'],
    principle: [
      '정이십면체 20개 면을 각각 무게중심 좌표 (i, j) 로 n 등분해 작은 삼각형을 만들고, 점을 모두 구 위로 normalize 한다 (측지 구).',
      '쌍대: 측지 구의 꼭짓점 하나 = 칸 하나. 그 꼭짓점을 둘러싼 삼각형들의 무게중심을 각도 순으로 이으면 칸의 테두리.',
      '처음 정이십면체의 꼭짓점 12개만 이웃이 5개 → 오각형, 나머지는 모두 이웃 6개 → 육각형. 나누기를 늘려도 오각형은 늘 12개.',
      '칸 수 F = 10n² + 2 (n = 4 면 162칸). 칸의 모서리 점 V = 삼각형 수, 모서리 E = 이웃 쌍 수 → V − E + F = 2.',
      '칸마다 3D 잡음으로 높이를 정해 바다 · 모래 · 풀 · 숲 · 바위 · 눈 색과 기둥 높이(층마다 0.035)를 준다.',
    ],
    when: ['구 위에서 칸 게임 · 땅따먹기를 할 때 (네모 격자는 극에서 찌그러짐)', '오일러 공식 · 다면체를 체험으로 보여 줄 때', '행성 지도 · 전략 게임'],
    avoid: ['평면 판 — 대신 육각 격자 좌표(i256)', '칸이 모두 똑같아야 할 때 — 구는 오각형 12개가 꼭 생긴다'],
    cost: 'light',
    costNote: '나누기 9 = 812칸 · 칸마다 윗면 + 옆벽 삼각형 수십 개를 한 메시(정점 색)로 합쳐 그리기 1번. 칸 고르기는 삼각형 → 칸 번호 표로.',
    level: 2,
    must: [
      '측지 구 점은 위치 열쇠(소수 5자리 반올림)로 합쳐 면 경계의 겹친 점을 하나로',
      '칸 테두리 점은 칸 중심의 접평면(tan · bit) 각도로 정렬해 이은다',
      '모든 칸을 한 BufferGeometry 에 넣고 정점 색으로 칠하기 — 칸마다 메시를 만들지 않기',
      '삼각형 번호 → 칸 번호 표(tileOfTri)를 두어 Raycaster 의 faceIndex 로 바로 칸을 찾기',
      '칸 수 · 오각형 수 · V − E + F 를 화면에 보이기',
    ],
    done: [
      '나누기를 1 ~ 9 로 바꿔도 분홍 오각형은 늘 12개다',
      '칸을 누르면 그 칸과 이웃(오각형 5 · 육각형 6)이 빛난다',
      '「꼭짓점 − 모서리 + 면 = 2」 가 나누기를 바꿔도 늘 2 다',
      '높이 기둥을 켜면 땅이 높을수록 칸이 솟는다',
    ],
    code: {
      lang: 'ts',
      title: '측지 구 만들기 → 쌍대 칸 (테두리 = 둘레 삼각형 무게중심)',
      from: 'demos/demosPlanet.ts buildHex 를 정리',
      body: `import * as THREE from 'three';
// B = 정이십면체 꼭짓점 12개(normalize), F0 = 면 20개의 꼭짓점 번호 (견본 그대로)
const verts: THREE.Vector3[] = [], keyMap = new Map<string, number>();
const vid = (p: THREE.Vector3) => {
  p.normalize();
  const k = Math.round(p.x * 1e5) + ',' + Math.round(p.y * 1e5) + ',' + Math.round(p.z * 1e5);
  let i = keyMap.get(k);
  if (i === undefined) { i = verts.length; verts.push(p.clone()); keyMap.set(k, i); } // 겹친 점 합치기
  return i;
};
const tris: number[] = [];
for (let f = 0; f < 20; f++) {
  const A = B[F0[f * 3]], Bv = B[F0[f * 3 + 1]], Cv = B[F0[f * 3 + 2]];
  const P = (i: number, j: number) => vid(new THREE.Vector3()
    .addScaledVector(A, (n - i - j) / n).addScaledVector(Bv, i / n).addScaledVector(Cv, j / n));
  for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
    tris.push(P(i, j), P(i + 1, j), P(i, j + 1));
    if (i + j < n - 1) tris.push(P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  }
}
// 쌍대: 꼭짓점마다 칸 — 둘레 삼각형의 무게중심이 칸의 모서리 점
const cent: THREE.Vector3[] = [], triOf: number[][] = verts.map(() => []), nbr: Set<number>[] = verts.map(() => new Set());
for (let t = 0; t < tris.length / 3; t++) {
  const [a, b, c] = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]];
  cent.push(verts[a].clone().add(verts[b]).add(verts[c]).normalize());
  triOf[a].push(t); triOf[b].push(t); triOf[c].push(t);
  nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b);
}
const tan = new THREE.Vector3(), bit = new THREE.Vector3();
const ringOf = (v: number) => {
  const c = verts[v];
  tan.set(-c.z, 0, c.x); if (tan.lengthSq() < 1e-6) tan.set(1, 0, 0); tan.normalize();
  bit.crossVectors(c, tan);
  return triOf[v].map((t) => cent[t]).sort((p, q) => Math.atan2(p.dot(bit), p.dot(tan)) - Math.atan2(q.dot(bit), q.dot(tan)));
};
const isPenta = (v: number) => nbr[v].size === 5; // 늘 12개
const F = verts.length, V = tris.length / 3, E = nbr.reduce((s, x) => s + x.size, 0) / 2; // V − E + F = 2`,
    },
    pitfalls: [
      { title: '면 경계의 같은 점을 따로 만들면 칸이 둘로 쪼개지고 이웃 수가 틀린다', fix: '위치를 반올림한 열쇠로 같은 점을 하나로 합친다.' },
      { title: '테두리 점을 아무 순서로 이으면 칸이 꼬인 별 모양이 된다', fix: '칸 중심의 접평면 두 축으로 각도를 구해 정렬한다.' },
      { title: '칸마다 메시를 만들면 800칸에서 그리기 호출이 800번이다', fix: '한 BufferGeometry 에 모으고 정점 색으로 칠한다. 칸 색 바꾸기는 그 칸의 정점 범위(ranges)만 고친다.' },
    ],
    prev: ['i256', 'i262'],
    next: ['i275'],
    refs: [
      { name: 'Wikipedia — Goldberg polyhedron', url: 'https://en.wikipedia.org/wiki/Goldberg_polyhedron' },
      { name: 'Wikipedia — Geodesic polyhedron', url: 'https://en.wikipedia.org/wiki/Geodesic_polyhedron' },
    ],
  },

  i264: {
    id: 'i264',
    summary: '열린 칸(노랑)과 닫힌 칸(파랑)이 퍼지는 모습을 한 걸음씩 보여, A* · 다익스트라 · 탐욕 탐색이 길을 찾는 방식을 나란히 비교한다.',
    terms: [
      { en: 'A* pathfinding (f = g + h)', ko: '온 거리 + 남은 거리 어림이 가장 작은 칸부터' },
      { en: "Dijkstra's algorithm", ko: '온 거리만 보고 둥글게 다 퍼지기' },
      { en: 'Greedy best-first search', ko: '남은 거리 어림만 보고 달려가기' },
      { en: 'Octile distance heuristic · binary heap', ko: '8방향 어림 거리 · 우선순위 큐' },
    ],
    goal: '{target}에 A* 길찾기를 넣고 다익스트라 · 탐욕과 나란히 비교해 줘 — 열린 칸 · 닫힌 칸이 한 걸음씩 퍼지고, 끝나면 길과 길이 · 살펴본 칸 수가 보이게. 분위기는 {style}.',
    targets: ['미로 · 벽이 있는 격자 판', '탐험 게임의 캐릭터 이동', '최단 길 수업 화면'],
    styles: ['어두운 바탕 형광 색', '밝은 모눈종이', '도트 던전'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 칸 판이면 직접 A* 를, 3D 지형이면 AI Navigation 패키지의 NavMeshAgent 를 쓴다.',
      godot: 'Godot 4 는 AStarGrid2D(diagonal_mode · heuristic 설정)로 바로 쓸 수 있다.',
    },
    principle: [
      '모든 탐색은 「열린 칸」 우선순위 큐에서 값이 가장 작은 칸을 꺼내 닫고, 그 이웃을 열린 칸에 넣는다.',
      '값이 다익스트라는 g(온 거리), 탐욕은 h(남은 거리 어림), A* 는 f = g + h. 그래서 A* 는 목표 쪽으로 뾰족하게, 다익스트라는 둥글게 퍼진다.',
      '8방향 격자의 어림은 옥타일 거리: h = max(dx, dy) + (√2 − 1)·min(dx, dy) — 실제보다 크지 않아 A* 가 최단 길을 보장한다.',
      '탐욕은 처음 열린 칸을 다시 고치지 않아 빠르지만, 컵 모양 벽에 걸려 먼 길로 돌아갈 수 있다.',
      '견본은 탐색을 한 번에 끝까지 돌려 칸마다 「몇 번째에 열렸나 · 닫혔나」를 적어 두고, 화면은 그 번호까지만 칠해 한 걸음씩 보인다.',
    ],
    when: ['격자 판에서 두 칸 사이 가장 짧은 길이 필요할 때', '탐색 알고리즘의 차이를 눈으로 보여 줄 때', '캐릭터가 벽을 돌아 목표로 걸어가야 할 때'],
    avoid: ['유닛 수백이 같은 목표로 갈 때 — 대신 흐름장(i265)', '칸이 아닌 넓은 땅 — 대신 내비 메시(i267)', '칸마다 비용이 다른 지도를 한 출발점에서 모두 재야 할 때 — 대신 다익스트라 비용 지도(i266)'],
    cost: 'light',
    costNote: '30×18 = 540칸, 힙으로 꺼내기 한 번 log n. 한 번 탐색은 1ms 도 안 걸린다 — 보여 주기 위해 일부러 초당 110걸음으로 나눠 그린다.',
    level: 2,
    must: [
      '열린 칸은 이진 힙(우선순위 큐)으로 — 배열을 매번 정렬하지 않기',
      '대각선 이동은 양옆 칸 중 하나라도 벽이면 막기 (모서리 끼어 지나가기 금지), 대각선 비용 √2',
      '어림은 옥타일 거리, A* 열쇠는 g + h·1.0001 (같은 값일 때 목표 쪽을 먼저)',
      '이미 닫힌 칸이 힙에서 다시 나오면 건너뛰기',
      '셋 나란히 비교에서는 같은 문제 · 같은 속도로',
    ],
    done: [
      'A* 는 목표 쪽으로 좁게, 다익스트라는 둥글게 넓게, 탐욕은 목표로 곧장 가다 벽에 막혀 돌아가는 모습이 보인다',
      '끝나면 분홍 길이 그려지고 「길이 ○○」와 살펴본 칸 수가 알고리즘마다 보인다',
      'A* 와 다익스트라 길이는 같고, 탐욕은 같거나 더 길다',
      '「새 문제」로 미로가 바뀌어도 끊김 없이 돈다',
    ],
    code: {
      lang: 'ts',
      title: '하나의 틀로 A* · 다익스트라 · 탐욕 (열쇠만 다르다)',
      from: 'demos/demosMapB.ts gridSearch · eachNb 를 정리 (Heap 은 같은 파일의 이진 힙)',
      body: `const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
const DL = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
function eachNb(cols: number, rows: number, block: (i: number) => boolean, i: number, fn: (j: number, len: number) => void) {
  const x = i % cols, y = (i / cols) | 0;
  for (let d = 0; d < 8; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const j = ny * cols + nx;
    if (block(j)) continue;
    if (d >= 4 && (block(y * cols + nx) || block(ny * cols + x))) continue; // 모서리 끼어 지나가기 금지
    fn(j, DL[d]);
  }
}
// algo: 0 = A*, 1 = 다익스트라, 2 = 탐욕
function gridSearch(cols: number, rows: number, wall: Uint8Array, s: number, goal: number, algo: number) {
  const N = cols * rows, gs = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1);
  const closedAt = new Int32Array(N).fill(-1), openedAt = new Int32Array(N).fill(-1); // 몇 번째 걸음에 열렸나 · 닫혔나 → 화면은 이 번호까지만 칠한다
  const gx = goal % cols, gy = (goal / cols) | 0;
  const H = (i: number) => { const dx = Math.abs((i % cols) - gx), dy = Math.abs(((i / cols) | 0) - gy); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const key = (i: number) => (algo === 0 ? gs[i] + H(i) * 1.0001 : algo === 1 ? gs[i] : H(i));
  const heap = new Heap();
  gs[s] = 0; openedAt[s] = 0; heap.push(key(s), s);
  let step = 0;
  while (heap.size) {
    const i = heap.pop();
    if (closedAt[i] >= 0) continue;
    closedAt[i] = ++step;
    if (i === goal) break;
    eachNb(cols, rows, (j) => wall[j] === 1, i, (j, len) => {
      if (closedAt[j] >= 0) return;
      const ng = gs[i] + len;
      if (algo === 2 ? openedAt[j] < 0 : ng < gs[j] - 1e-6) { // 탐욕은 처음 연 값을 고치지 않는다
        gs[j] = ng; par[j] = i;
        if (openedAt[j] < 0) openedAt[j] = step;
        heap.push(key(j), j);
      }
    });
  }
  const path: number[] = [];
  if (closedAt[goal] >= 0) for (let c = goal; c >= 0; c = par[c]) path.unshift(c);
  return { closedAt, openedAt, steps: step, path, cost: gs[goal] };
}`,
    },
    pitfalls: [
      { title: '어림값을 실제보다 크게 잡으면 A* 가 최단이 아닌 길을 낸다', fix: '8방향이면 옥타일 거리, 4방향이면 맨해튼 거리처럼 실제를 넘지 않는 어림을 쓴다.' },
      { title: '대각선으로 벽 모서리 사이를 빠져나간다', fix: '대각선은 양옆 두 칸이 모두 열려 있을 때만 허락한다.' },
      { title: '열린 칸을 배열에 넣고 매번 정렬하면 큰 판에서 느려진다', fix: '이진 힙에 넣고, 값이 바뀌면 새로 넣은 뒤 이미 닫힌 칸은 꺼낼 때 건너뛴다.' },
      { title: '같은 f 값이 많으면 A* 가 다익스트라처럼 넓게 퍼진다', fix: 'h 에 1.0001 처럼 아주 조금 더 무게를 주면 목표 쪽 칸을 먼저 꺼낸다.' },
    ],
    prev: ['i250'],
    next: ['i265', 'i266', 'i267'],
    refs: [
      { name: 'Red Blob Games — Introduction to the A* Algorithm', url: 'https://www.redblobgames.com/pathfinding/a-star/introduction.html' },
      { name: 'Godot 문서 — AStarGrid2D', url: 'https://docs.godotengine.org/en/stable/classes/class_astargrid2d.html' },
    ],
  },

  i265: {
    id: 'i265',
    summary: '목표에서 거꾸로 거리 지도를 한 번 만들고 칸마다 내리막 화살표를 두어, 수백 마리 유닛이 그 지도 하나만 보고 몰려가게 한다.',
    terms: [
      { en: 'Flow field pathfinding', ko: '칸마다 갈 방향 화살표를 둔 지도' },
      { en: 'Distance field (Dijkstra map)', ko: '목표에서 거꾸로 잰 거리 지도' },
      { en: 'Crowd separation (spatial hash)', ko: '가까운 유닛끼리 밀어내기 — 칸별 목록으로 이웃 찾기' },
    ],
    goal: '{target}을(를) 흐름장으로 움직여 줘 — 목표에서 거리 물결이 퍼지며 칸마다 화살표가 생기고, 유닛 수백 마리가 서로 밀며 목표로 몰려가게. 분위기는 {style}.',
    targets: ['유닛 수백 마리 무리', '좀비 · 개미 떼', '전략 게임 병사들'],
    styles: ['어두운 바탕 형광 점', '귀여운 동물 떼', '도트 전략 게임'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '목표 칸에서 다익스트라를 한 번 돌려 모든 칸의 「목표까지 거리」를 구한다 (벽은 무한대).',
      '칸마다 8이웃 중 거리가 가장 작은 쪽을 가리키는 단위 화살표를 저장한다 — 이것이 흐름장.',
      '유닛은 길찾기 없이, 지금 서 있는 칸의 화살표 × 속도(3.4)를 원하는 속도로 삼는다. 유닛이 몇 마리든 지도는 하나.',
      '가까운 유닛끼리(거리 0.4 안) 밀어내는 힘을 더해 겹치지 않게 하고, 이웃 찾기는 칸별 연결 목록(head · next)으로 둘레 9칸만 본다.',
      '목표가 바뀌면 지도만 다시 만든다 (견본은 4.2초마다 새 목표).',
    ],
    when: ['많은 유닛이 같은 목표로 움직일 때', '목표가 하나이고 자주 바뀌지 않을 때', '거리 숫자 지도를 수업에서 보여 줄 때'],
    avoid: ['유닛마다 목표가 다를 때 — 대신 유닛마다 A*(i264)', '아주 큰 열린 땅 — 칸이 너무 많아지면 내비 메시(i267)'],
    cost: 'light',
    costNote: '32칸 판 다익스트라 한 번 + 칸마다 8이웃 비교 = 목표가 바뀔 때만. 유닛 800마리도 칸 조회 + 둘레 9칸 밀기라 가볍다.',
    level: 2,
    must: [
      '거리 지도는 목표에서 거꾸로 한 번만 — 유닛마다 길찾기를 돌리지 않기',
      '유닛 위치 · 속도는 Float32Array 에 모아 두기 (객체 수백 개 대신)',
      '밀어내기 이웃은 칸별 목록으로 둘레 9칸만 — 모든 쌍(n²)을 비교하지 않기',
      '속도는 원하는 속도로 부드럽게 다가가게(lerp, dt·7), 벽에 막히면 그 축만 튕기기',
      '거리 물결이 퍼지는 모습 · 화살표 · 거리 숫자를 켜고 끌 수 있게',
    ],
    done: [
      '목표가 바뀌면 거리 물결이 목표에서 둥글게 퍼지며 칸이 물들고 화살표가 생긴다',
      '유닛 수백 마리가 벽을 돌아 목표로 흘러가고 서로 겹치지 않는다',
      '유닛 수를 800 으로 늘려도 화면이 끊기지 않는다',
      '거리 숫자를 켜면 목표에서 멀수록 수가 커진다',
    ],
    code: {
      lang: 'ts',
      title: '거리 지도 → 칸마다 화살표 → 유닛은 화살표만 따라',
      from: 'demos/demosMapB.ts i265 retarget · 유닛 움직이기를 정리 (dijkstra · eachNb 는 같은 파일)',
      body: `// 1) 목표에서 거꾸로 거리 지도 + 칸마다 내리막 화살표
const dist = dijkstra(C, R, cost, goal); // 벽 칸 cost = Infinity
const dir = new Float32Array(C * R * 2);
for (let i = 0; i < C * R; i++) {
  let bx = 0, by = 0, bd = dist[i];
  eachNb(C, R, (j) => wall[j] === 1, i, (j) => {
    if (dist[j] < bd) { bd = dist[j]; bx = (j % C) - (i % C); by = ((j / C) | 0) - ((i / C) | 0); }
  });
  const l = Math.hypot(bx, by) || 1;
  dir[i * 2] = bx / l; dir[i * 2 + 1] = by / l;
}
// 2) 매 프레임: 칸별 목록 → 화살표 + 밀어내기
head.fill(-1);
for (let k = 0; k < alive; k++) { const ci = (py[k] | 0) * C + (px[k] | 0); next[k] = head[ci]; head[ci] = k; }
const SP = 3.4;
for (let k = 0; k < alive; k++) {
  const x = px[k], y = py[k], ci = (y | 0) * C + (x | 0);
  let wx = dir[ci * 2] * SP, wy = dir[ci * 2 + 1] * SP;
  let sx = 0, sy = 0;
  for (let yy = (y | 0) - 1; yy <= (y | 0) + 1; yy++) for (let xx = (x | 0) - 1; xx <= (x | 0) + 1; xx++) {
    if (xx < 0 || yy < 0 || xx >= C || yy >= R) continue;
    for (let o = head[yy * C + xx]; o >= 0; o = next[o]) {
      if (o === k) continue;
      const ddx = x - px[o], ddy = y - py[o], d2 = ddx * ddx + ddy * ddy;
      if (d2 < 0.16 && d2 > 1e-6) { const d = Math.sqrt(d2); sx += (ddx / d) * (0.4 - d); sy += (ddy / d) * (0.4 - d); }
    }
  }
  wx += sx * 14; wy += sy * 14;
  vx[k] += (wx - vx[k]) * Math.min(1, dt * 7);
  vy[k] += (wy - vy[k]) * Math.min(1, dt * 7);
  const nx = x + vx[k] * dt; if (free(nx, y)) px[k] = nx; else vx[k] *= -0.2;      // 벽이면 그 축만 튕김
  const ny = py[k] + vy[k] * dt; if (free(px[k], ny)) py[k] = ny; else vy[k] *= -0.2;
}`,
    },
    pitfalls: [
      { title: '유닛마다 A* 를 돌리면 수백 마리에서 멈춘다', fix: '목표가 같으면 흐름장 하나를 모두가 함께 본다.' },
      { title: '모든 유닛 쌍을 비교해 밀어내면 n² 이라 느리다', fix: '칸별 연결 목록으로 둘레 9칸 안의 유닛만 본다.' },
      { title: '목표 바로 옆에서 유닛이 빙빙 돈다', fix: '목표 근처(거리 1.2 안)에서는 화살표 대신 목표 칸 가운데로 곧장 당긴다.' },
      { title: '벽에 부딪힌 유닛이 벽 속으로 파고든다', fix: 'x · y 축을 따로 옮겨 막힌 축만 되돌리고 그 축 속도를 −0.2 배로 튕긴다.' },
    ],
    prev: ['i264', 'i266'],
    next: ['i267'],
    refs: [{ name: 'Red Blob Games — Flow Field Pathfinding (tower defense)', url: 'https://www.redblobgames.com/pathfinding/tower-defense/' }],
  },

  i266: {
    id: 'i266',
    summary: '길 1 · 풀 2 · 모래 3 · 늪 5 처럼 칸마다 비용이 다른 지도에 다익스트라를 돌려, 같은 시간 선(등시선)이 지형 따라 퍼지는 모습을 그린다.',
    terms: [
      { en: "Dijkstra's algorithm with terrain cost (weighted grid)", ko: '칸 비용이 다른 격자의 최단 거리' },
      { en: 'Isochrone map', ko: '같은 시간에 닿는 곳을 이은 선' },
      { en: 'Cost map / travel time map', ko: '칸마다 걸리는 시간 지도' },
    ],
    goal: '{target}에 지형 비용 다익스트라를 넣어 줘 — 출발점에서 같은 시간 선이 길을 따라 길쭉하게, 늪에서는 촘촘하게 퍼지고, 끝나면 가장 빠른 길이 그려지게. 분위기는 {style}.',
    targets: ['길 · 풀 · 모래 · 늪이 있는 지도', '시간 · 비용 비교 수업', '전략 게임 이동 범위'],
    styles: ['지도 색 + 색 띠', '어두운 바탕 형광 선', '종이 지도'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      godot: 'Godot 4 는 AStarGrid2D.set_point_weight_scale() 로 칸 비용을 줄 수 있다.',
    },
    principle: [
      '칸마다 지나는 비용(길 1 · 풀 2 · 모래 3 · 늪 5 · 물 ∞)을 둔다.',
      '두 칸 사이 비용 = (두 칸 비용의 평균) × 이동 길이(곧게 1 · 대각선 √2).',
      '출발점에서 다익스트라를 끝까지 돌리면 모든 칸의 「가장 빠른 시간」이 나온다.',
      '그 값이 시간 T 이하인 칸만 칠하고, 일정 간격의 값마다 마칭 스퀘어로 선을 그으면 등시선 — 길 위에서는 멀리, 늪에서는 조금만 퍼진다.',
      '도착점에서 시간이 가장 작게 줄어드는 이웃을 따라 거꾸로 걸으면 가장 빠른 길이 나온다.',
    ],
    when: ['지형마다 이동 속도가 다를 때', '「여기서 3분 안에 갈 수 있는 곳」 범위를 보여 줄 때', '전략 게임 이동 범위 · 시간 비교'],
    avoid: ['출발 · 도착이 정해진 길 하나만 필요할 때 — 대신 A*(i264, 더 적게 살펴봄)', '비용이 모두 같은 판 — 너비 우선 탐색이면 충분'],
    cost: 'light',
    costNote: '40×25 = 1,000칸 다익스트라 한 번(문제가 바뀔 때만). 등시선은 격자 위 마칭 스퀘어라 프레임마다 그려도 가볍다.',
    level: 2,
    must: [
      '칸 사이 비용은 두 칸 비용의 평균 × 이동 길이 (한쪽 칸 비용만 쓰면 방향에 따라 값이 달라진다)',
      '물 같은 못 가는 칸은 Infinity 로, 대각선은 모서리 끼어 지나가기 금지',
      '시간 T 를 0 에서 최대값까지 늘리며 색 띠 · 등시선이 퍼지는 모습 보이기',
      '「지형 비용 끄기(모두 1)」로 둥글게 퍼지는 것과 비교',
    ],
    done: [
      '등시선이 길을 따라 길쭉하게 뻗고, 늪 · 모래에서는 촘촘하다',
      '지형 비용을 끄면 등시선이 거의 둥근 팔각형이 된다',
      '퍼짐이 끝나면 출발점에서 도착점까지 가장 빠른 길이 그어지는데, 곧은 길보다 길(갈색)을 타고 돌아간다',
      '「새 지도」 · 「새 출발점」으로 바로 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '비용 지도 다익스트라 + 가장 빠른 길 되짚기',
      from: 'demos/demosMapB.ts dijkstra · i266 newProblem 을 정리',
      body: `const COST = [1, 2, 3, 5, Infinity]; // 길 · 풀 · 모래 · 늪 · 물
const cost = new Float32Array(C * R);
for (let i = 0; i < C * R; i++) cost[i] = flat && terr[i] !== 4 ? 1 : COST[terr[i]];

function dijkstra(cols: number, rows: number, cost: Float32Array, src: number): Float32Array {
  const dist = new Float32Array(cols * rows).fill(Infinity);
  const heap = new Heap();
  dist[src] = 0; heap.push(0, src);
  const blocked = (j: number) => !isFinite(cost[j]);
  while (heap.size) {
    const i = heap.pop(), di = dist[i];
    eachNb(cols, rows, blocked, i, (j, len) => {
      const nd = di + ((cost[i] + cost[j]) / 2) * len; // 두 칸 평균 × 길이(1 또는 √2)
      if (nd < dist[j] - 1e-6) { dist[j] = nd; heap.push(nd, j); }
    });
  }
  return dist;
}
// 가장 빠른 길: 도착점에서 시간이 가장 작은 이웃으로 거꾸로
const dist = dijkstra(C, R, cost, src);
const path: number[] = [];
for (let c = dst; c !== src; ) {
  path.unshift(c);
  let bj = -1, bd = dist[c];
  eachNb(C, R, (j) => !isFinite(cost[j]), c, (j) => { if (dist[j] < bd) { bd = dist[j]; bj = j; } });
  if (bj < 0) break;
  c = bj;
}
path.unshift(src);
// 그리기: dist ≤ T 인 칸만 색 띠, band 간격마다 마칭 스퀘어로 등시선 (T 는 시간에 따라 0 → 최대)`,
    },
    pitfalls: [
      { title: '들어가는 칸 비용만 더하면 늪에서 나올 때와 들어갈 때 값이 다르다', fix: '두 칸 비용의 평균 × 이동 길이로 잰다.' },
      { title: '힙에 같은 칸이 여러 번 들어가 오래된 값으로 다시 퍼진다', fix: '꺼낸 거리가 지금 거리보다 크면 건너뛰거나, 더 작아질 때만 넣는다 (nd < dist[j]).' },
      { title: '칸 경계로 등시선을 그리면 계단이 거칠다', fix: '칸 가운데 값으로 마칭 스퀘어(i259)를 돌려 매끈한 선을 뽑는다.' },
    ],
    prev: ['i264', 'i259'],
    next: ['i265'],
    refs: [{ name: 'Red Blob Games — Implementation of A* (Dijkstra with weights)', url: 'https://www.redblobgames.com/pathfinding/a-star/implementation.html' }],
  },

  i267: {
    id: 'i267',
    summary: '걸을 수 있는 땅을 들로네 삼각형으로 나누고, 삼각형 줄을 A* 로 찾은 뒤 깔때기 알고리즘으로 당겨 모서리를 스치는 곧은 길을 만든다.',
    terms: [
      { en: 'Navigation mesh (navmesh)', ko: '걸을 수 있는 땅을 다각형으로 나눈 지도' },
      { en: 'Delaunay triangulation (Bowyer–Watson)', ko: '외접원 안에 다른 점이 없는 삼각형 나누기' },
      { en: 'Funnel algorithm (string pulling)', ko: '삼각형 줄 안에서 실을 당기듯 곧은 길 만들기' },
      { en: 'Portal edges', ko: '이웃 삼각형 사이 공유 모서리 (지나는 문)' },
    ],
    goal: '{target}에 내비 메시 길찾기를 넣어 줘 — 땅이 삼각형으로 나뉘고, 삼각형 줄(파랑) → 꼬불꼬불한 중심 길 → 깔때기로 당긴 곧은 길(노랑) 순서로 보이게. 분위기는 {style}.',
    targets: ['장애물이 있는 방', '3D 캐릭터 이동 바닥', '전략 게임 지형'],
    styles: ['어두운 바탕 반투명 삼각형', '설계도', '밝은 놀이 판'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 AI Navigation 패키지의 NavMeshSurface 로 굽고 NavMeshAgent.SetDestination 으로 걷는다.',
      godot: 'Godot 4 는 NavigationRegion2D/3D 로 굽고 NavigationAgent 의 target_position 으로 걷는다.',
      three: 'three.js 에는 내장 기능이 없어 recast-navigation-js 같은 라이브러리를 쓰거나 견본처럼 직접 만든다.',
    },
    principle: [
      '방 테두리(12 간격)와 장애물 테두리(6.5 간격)를 따라 점을 찍고 들로네 삼각분할을 한다 (커다란 삼각형에서 시작해 점을 하나씩 넣는 Bowyer–Watson).',
      '무게중심이 장애물 안에 있는 삼각형은 버리면 남은 삼각형들이 걸을 수 있는 땅이 된다.',
      '두 삼각형이 공유하는 모서리 = 지나는 문(portal). 삼각형 무게중심을 점으로, 문을 선으로 A* 를 돌리면 삼각형 줄이 나온다.',
      '무게중심끼리 이으면 꼬불꼬불하다. 깔때기 알고리즘은 출발점(꼭짓점)에서 문의 왼쪽 · 오른쪽 끝으로 깔때기를 좁혀 가다, 두 줄이 엇갈리면 그 모서리를 새 꼭짓점으로 삼는다.',
      '결과는 장애물 모서리만 스치며 꺾이는 가장 짧은 길이다.',
    ],
    when: ['넓은 열린 땅에서 캐릭터가 자연스럽게 걸어야 할 때', '칸 격자로는 길이 지그재그로 보일 때', '3D 게임 바닥 (같은 원리를 3D 바닥 다각형에)'],
    avoid: ['칸 판 퍼즐 — 대신 A*(i264)', '같은 목표로 가는 유닛 수백 — 대신 흐름장(i265)', '장애물이 계속 움직이는 판 — 메시를 매번 다시 지어야 한다'],
    cost: 'medium',
    costNote: '들로네는 점 n 개마다 모든 삼각형을 훑어 n² 정도 — 점 수백 개면 수 ms 라 방이 바뀔 때만 짓는다. 길찾기 · 깔때기는 삼각형 줄 길이만큼이라 가볍다.',
    level: 3,
    must: [
      '삼각분할 점에 아주 작은 흔들림(±0.01)을 줘 같은 선 위 점들로 인한 퇴화 삼각형을 피하기',
      '장애물 안 삼각형 거르기: 무게중심과 각 모서리 가운데 근처 점까지 장애물 안인지 확인 (얇은 삼각형이 장애물을 가로지르지 않게)',
      '문(portal)의 왼쪽 · 오른쪽 방향을 일관되게 — 앞 삼각형 중심 기준 외적 부호로 정하고, 길이 땅 밖으로 나가면 방향을 뒤집어 다시',
      '삼각형 보기 · 깔때기 켬/끔(중심 길과 비교)을 바꿀 수 있게',
    ],
    done: [
      '방이 반투명 삼각형으로 덮이고 장애물 자리는 비어 있다',
      '파란 삼각형 줄 위에 꼬불꼬불한 중심 길과 노란 곧은 길이 함께 보이고, 곧은 길이 더 짧다',
      '곧은 길은 장애물 모서리에서만 꺾이고 장애물을 뚫지 않는다',
      '「새 방」 · 「새 문제」를 여러 번 눌러도 길이 늘 땅 안에 있다',
    ],
    code: {
      lang: 'ts',
      title: '깔때기 알고리즘 (문 목록 → 곧은 길)',
      from: 'demos/demosMapB.ts funnel · i267 newProblem 을 정리',
      body: `type V2 = [number, number];
const tri2 = (a: V2, b: V2, c: V2) => (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);
const eq = (a: V2, b: V2) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
function funnel(start: V2, end: V2, portals: [V2, V2][]): V2[] {
  const P: [V2, V2][] = [[start, start], ...portals, [end, end]];
  const path: V2[] = [start];
  let apex = start, left = start, right = start, ai = 0, li = 0, ri = 0;
  for (let i = 1; i < P.length; i++) {
    const [L, Rr] = P[i];
    if (tri2(apex, right, Rr) <= 0) {                       // 오른쪽 줄을 좁힐 수 있나
      if (eq(apex, right) || tri2(apex, left, Rr) > 0) { right = Rr; ri = i; }
      else { path.push(left); apex = left; ai = li; left = right = apex; li = ri = ai; i = ai; continue; } // 엇갈림 → 왼쪽 끝이 새 꼭짓점
    }
    if (tri2(apex, left, L) >= 0) {                          // 왼쪽 줄을 좁힐 수 있나
      if (eq(apex, left) || tri2(apex, right, L) < 0) { left = L; li = i; }
      else { path.push(right); apex = right; ai = ri; left = right = apex; li = ri = ai; i = ai; continue; }
    }
  }
  if (!eq(path[path.length - 1], end)) path.push(end);
  return path;
}
// 삼각형 줄 → 문 목록 (앞 삼각형 중심 기준으로 왼쪽 · 오른쪽 정하기)
const raw: [V2, V2][] = [];
for (let i = 0; i + 1 < corridor.length; i++) {
  const e = M.nb[corridor[i]].find((n) => n.o === corridor[i + 1])!;
  const p = M.P[e.u], q = M.P[e.v], c = M.cen[corridor[i]];
  raw.push(tri2(c, p, q) > 0 ? [p, q] : [q, p]);
}
let straight = funnel(start, goal, raw);
if (!valid(straight)) straight = funnel(start, goal, raw.map(([p, q]) => [q, p])); // 방향이 반대였으면 뒤집어 다시`,
    },
    pitfalls: [
      { title: '문의 왼쪽 · 오른쪽을 섞으면 깔때기 길이 장애물을 뚫는다', fix: '모든 문을 같은 규칙(앞 삼각형 기준 외적 부호)으로 정하고, 길 위 점이 메시 밖이면 방향을 뒤집어 다시 돌린다.' },
      { title: '삼각형 중심끼리 이은 길을 그대로 쓰면 캐릭터가 지그재그로 걷는다', fix: '삼각형 줄은 「어디를 지날지」만 정하고, 실제 길은 깔때기로 당긴다.' },
      { title: '장애물 모서리를 가로지르는 얇은 삼각형이 남는다', fix: '무게중심만이 아니라 모서리 가운데 근처 점도 장애물 안인지 검사해 거른다.' },
      { title: '점들이 한 줄로 놓이면 들로네가 깨진 삼각형을 만든다', fix: '점에 아주 작은 흔들림을 더하고, 외접원 분모가 0 에 가까우면 반지름 무한대로 둔다.' },
    ],
    prev: ['i264', 'i246'],
    next: ['i268'],
    refs: [
      { name: 'Wikipedia — Bowyer–Watson algorithm', url: 'https://en.wikipedia.org/wiki/Bowyer%E2%80%93Watson_algorithm' },
    ],
  },

  i268: {
    id: 'i268',
    summary: '칸 지도에서 여덟 조각으로 그림자 던지기를 해 벽 뒤는 안 보이게 하고, 횃불 반경 안만 밝게 · 이미 본 칸은 흐리게 기억해 보여 준다.',
    terms: [
      { en: 'Field of view — recursive shadowcasting', ko: '팔분면마다 기울기 범위로 가림 계산' },
      { en: 'Fog of war (explored memory)', ko: '안 본 곳은 검게 · 본 곳은 흐리게' },
      { en: 'Octant transform', ko: '한 조각 계산을 여덟 방향으로 돌려 쓰기' },
    ],
    goal: '{target}에 시야 · 가림을 넣어 줘 — 캐릭터 둘레 횃불 반경 안에서 벽 뒤는 그림자, 지나온 칸은 흐린 기억으로 남게. 분위기는 {style}.',
    targets: ['던전 탐험 지도', '안개 지도 게임', '숨바꼭질 판'],
    styles: ['어두운 던전 + 횃불 빛', '도트 로그라이크', '밝은 종이 지도에 안개'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '캐릭터 둘레를 45° 조각 여덟 개(팔분면)로 나누고, 한 조각 계산을 좌표 변환 표로 여덟 번 돌려 쓴다.',
      '조각마다 가까운 줄부터 먼 줄로 훑으며, 보이는 범위를 기울기(start ~ end)로 들고 간다.',
      '벽 칸을 만나면 그 벽 앞까지의 범위로 다음 줄을 재귀로 훑고, 벽 뒤 범위는 좁아진다 — 그래서 벽 뒤가 그림자가 된다.',
      '반경 안(dx² + dy² < r²)인 칸만 보이는 칸으로 친다. 보인 칸은 seen 배열에 쌓아 기억한다.',
      '그리기: 안 본 칸은 검게, 본 칸은 흑백 · 어둡게 구운 그림, 지금 보이는 칸만 밝은 그림을 clip 해서 그리고 횃불 빛 원을 얹는다.',
    ],
    when: ['탐험 · 로그라이크에서 벽 뒤를 감출 때', '전략 게임 안개 지도', '「보이는 곳 · 안 보이는 곳」 기하 체험'],
    avoid: ['칸이 없는 자유 공간 — 대신 광선 · 다각형 시야(가시 다각형)', '3D 장면 — 대신 그림자 지도나 깊이 비교'],
    cost: 'light',
    costNote: '반경 8 이면 칸 수백 개만 훑는다. 캐릭터가 칸을 옮길 때만 다시 계산하면 더 가볍다 (견본은 lastCell 로 거름).',
    level: 2,
    must: [
      '시야는 캐릭터가 다른 칸으로 옮겼을 때만 다시 계산',
      '판 밖 칸은 벽(불투명)으로 친다',
      '밝은 지도 · 기억 지도(흑백 · 어둡게)는 화면 밖 캔버스에 한 번 굽고, 매 프레임엔 clip 으로 보이는 칸만 밝게',
      '횃불 반경 · 기억하기 켬/끔을 바꿀 수 있게, 본 칸 % 를 보이기',
    ],
    done: [
      '캐릭터 둘레만 밝고, 벽 뒤 · 기둥 뒤로 그림자 쐐기가 생긴다',
      '지나온 방은 흑백으로 흐리게 남고, 한 번도 안 본 곳은 새까맣다',
      '횃불 반경을 3 으로 줄이면 좁게, 14 로 늘리면 방 전체가 보인다',
      '기억하기를 끄면 지금 보이는 곳 말고는 모두 검다',
    ],
    code: {
      lang: 'ts',
      title: '재귀 그림자 던지기 (팔분면 8개)',
      from: 'demos/demosMapB.ts shadowcast 를 정리',
      body: `function shadowcast(C: number, R: number, opaque: (x: number, y: number) => boolean,
                    ox: number, oy: number, radius: number, vis: Uint8Array) {
  vis.fill(0);
  vis[oy * C + ox] = 1;
  // 팔분면 8개의 좌표 변환 (xx, xy, yx, yy)
  const M = [[1, 0, 0, -1, -1, 0, 0, 1], [0, 1, -1, 0, 0, -1, 1, 0], [0, 1, 1, 0, 0, -1, -1, 0], [1, 0, 0, 1, -1, 0, 0, -1]];
  const cast = (row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number): void => {
    if (start < end) return;
    let newStart = 0;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1, blocked = false;
      const dy = -j;
      while (dx <= 0) {
        dx++;
        const X = ox + dx * xx + dy * xy, Y = oy + dx * yx + dy * yy;
        const lS = (dx - 0.5) / (dy + 0.5), rS = (dx + 0.5) / (dy - 0.5); // 이 칸의 왼쪽 · 오른쪽 기울기
        if (start < rS) continue;
        else if (end > lS) break;
        const inb = X >= 0 && Y >= 0 && X < C && Y < R;
        if (inb && dx * dx + dy * dy < radius * radius) vis[Y * C + X] = 1;
        const op = !inb || opaque(X, Y);
        if (blocked) {
          if (op) { newStart = rS; continue; }
          blocked = false; start = newStart;
        } else if (op && j < radius) {
          blocked = true;
          cast(j + 1, start, lS, xx, xy, yx, yy); // 벽 앞까지 범위로 다음 줄
          newStart = rS;
        }
      }
      if (blocked) break;
    }
  };
  for (let o = 0; o < 8; o++) cast(1, 1, 0, M[0][o], M[1][o], M[2][o], M[3][o]);
}
// 칸을 옮겼을 때만: shadowcast(...); for (i) if (vis[i]) seen[i] = 1;`,
    },
    pitfalls: [
      { title: '매 프레임 시야를 다시 계산하면 칸이 많을 때 낭비다', fix: '캐릭터가 다른 칸으로 옮겼을 때만 계산한다.' },
      { title: '판 밖을 빈 칸으로 치면 가장자리 너머로 시야가 새어 배열 밖을 읽는다', fix: '판 밖은 불투명으로 친다.' },
      { title: '안 보이는 칸을 하나씩 어둡게 칠하면 칸 사이에 가는 틈이 보인다', fix: '견본은 칸을 0.3px 씩 넓혀 사각형을 한 경로에 모아 한 번에 칠한다.' },
    ],
    prev: ['i247', 'i248'],
    next: ['i271'],
    refs: [{ name: 'RogueBasin — FOV using recursive shadowcasting', url: 'https://www.roguebasin.com/index.php/FOV_using_recursive_shadowcasting' }],
  },

  i269: {
    id: 'i269',
    summary: '여러 집을 한 번씩 도는 배달 길을 가까운 곳부터 고르는 욕심 길로 만들고, 엇갈린 두 길을 풀어 잇는 2-opt 로 점점 짧게 다듬는다.',
    terms: [
      { en: 'Traveling salesman problem (TSP)', ko: '모든 곳을 한 번씩 돌고 돌아오는 가장 짧은 길' },
      { en: 'Nearest neighbor heuristic', ko: '지금 자리에서 가장 가까운 곳부터 (욕심 길)' },
      { en: '2-opt local search', ko: '두 길을 끊고 반대로 이어 엇갈림 풀기' },
    ],
    goal: '{target}을(를) 외판원 순회로 풀어 줘 — 욕심 길이 먼저 그려지고, 2-opt 가 한 번씩 엇갈린 두 길(빨강)을 끊고 새 길(초록)로 이어 짧아지는 모습과 길이(km · %)가 보이게. 분위기는 {style}.',
    targets: ['동네 배달 길', '여러 곳을 도는 여행 순서', '최단 순서 수업 화면'],
    styles: ['밤 동네 지도', '밝은 그림 지도', '모눈종이 점 잇기'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '모든 순서를 다 재면 n! 가지라 16곳만 돼도 너무 많다 — 그래서 빨리 「꽤 좋은」 길을 찾는다.',
      '욕심 길: 0번 집에서 시작해 아직 안 간 곳 중 가장 가까운 곳으로 가기를 되풀이.',
      '2-opt: 길 a→b 와 c→d 를 끊고 a→c, b→d 로 잇는다 (그 사이 순서는 뒤집힘). 길이 변화 = D(a,c) + D(b,d) − D(a,b) − D(c,d).',
      '한 번에 가장 많이 줄어드는 쌍을 골라 바꾸고, 더 줄어드는 쌍이 없을 때까지(견본 최대 60번) 되풀이하면 길이 엇갈리지 않는다.',
    ],
    when: ['배달 · 순회 순서를 정해야 할 때', '「욕심이 늘 최선은 아니다」를 보여 줄 때', '점이 수십 개 정도인 경로 최적화'],
    avoid: ['두 점 사이 한 길만 필요할 때 — 대신 A*(i264)', '정확한 최적해가 꼭 필요한 작은 문제 — 동적 계획법(점 15개 안팎까지)으로'],
    cost: 'light',
    costNote: '2-opt 한 번 = 쌍 n²/2 (40곳 = 780쌍), 60번까지라 문제를 바꿀 때 한 번 돌리면 된다. 견본은 바꾼 순서를 모두 적어 두고 한 단계씩 보여 준다.',
    level: 2,
    must: [
      '바꾸는 과정을 미리 다 계산해 기록(moves: i · k · 바꾸기 전 순서)하고, 화면은 그 기록을 한 단계씩 재생',
      '바꿀 때 끊는 두 길(빨강) → 새로 잇는 두 길(초록) 순서로 보이기',
      '집들은 서로 최소 거리(0.11)를 두고 뿌리기 — 겹친 점이 없게',
      '욕심 길과 최종 길의 길이 · 줄어든 % 를 보이고, 욕심 길을 점선으로 겹쳐 비교',
    ],
    done: [
      '욕심 길이 집을 하나씩 이으며 그려지고, 길이 서로 엇갈린 곳이 보인다',
      '2-opt 단계마다 엇갈림 하나가 풀리고 길이 숫자가 줄어든다',
      '마지막 길에는 엇갈린 선이 없고, 점선 욕심 길보다 몇 % 짧다',
      '배달할 곳 수를 40 까지 늘려도 바로 풀린다',
    ],
    code: {
      lang: 'ts',
      title: '욕심 길 + 2-opt (가장 많이 줄어드는 쌍부터)',
      from: 'demos/demosMapB.ts i269 gen() 을 정리',
      body: `const D = (a: number, b: number) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
const N = pts.length;
// 1) 욕심 길: 가장 가까운 안 간 곳으로
const used = new Uint8Array(N);
const greedy = [0];
used[0] = 1;
for (let s = 1; s < N; s++) {
  const c = greedy[greedy.length - 1];
  let b = -1;
  for (let j = 0; j < N; j++) if (!used[j] && (b < 0 || D(c, j) < D(c, b))) b = j;
  greedy.push(b); used[b] = 1;
}
// 2) 2-opt: a→b, c→d 를 a→c, b→d 로 (사이 구간 뒤집기)
const o = greedy.slice();
const moves: { i: number; k: number; before: number[] }[] = [];
for (let it = 0; it < 60; it++) {
  let best = -1e-9, bi = -1, bk = -1;
  for (let i = 1; i < N - 1; i++) for (let k = i + 1; k < N; k++) {
    const a = o[i - 1], b = o[i], c = o[k], d = o[(k + 1) % N];
    const delta = D(a, c) + D(b, d) - D(a, b) - D(c, d);
    if (delta < best) { best = delta; bi = i; bk = k; }
  }
  if (bi < 0) break;                                  // 더 줄일 쌍이 없다
  moves.push({ i: bi, k: bk, before: o.slice() });    // 화면에서 한 단계씩 다시 보여 줄 기록
  const seg = o.slice(bi, bk + 1).reverse();
  o.splice(bi, seg.length, ...seg);
}
const tourLen = (ord: number[]) => ord.reduce((L, v, i) => L + D(v, ord[(i + 1) % ord.length]), 0);`,
    },
    pitfalls: [
      { title: '모든 순서를 다 재려 하면 점 12개만 돼도 수억 가지라 멈춘다', fix: '욕심 길로 시작해 2-opt 같은 지역 개선으로 다듬는다.' },
      { title: '두 길을 바꿀 때 사이 구간을 안 뒤집으면 순회가 둘로 끊긴다', fix: 'i ~ k 구간을 통째로 뒤집어야 하나의 고리가 유지된다.' },
      { title: '부동소수점 때문에 0 에 가까운 변화로 끝없이 바꾼다', fix: '변화가 −1e-9 보다 작을 때만 바꾸고, 되풀이 횟수에 상한을 둔다.' },
    ],
    prev: ['i264'],
    next: ['i270'],
    refs: [
      { name: 'Wikipedia — Travelling salesman problem', url: 'https://en.wikipedia.org/wiki/Travelling_salesman_problem' },
      { name: 'Wikipedia — 2-opt', url: 'https://en.wikipedia.org/wiki/2-opt' },
    ],
  },

  i270: {
    id: 'i270',
    summary: '역을 점 · 노선을 선으로 둔 그래프에서 환승이 가장 적은 길을 찾고, 구불구불한 실제 지도를 곧은 노선도로 부드럽게 바꿔 보인다.',
    terms: [
      { en: 'Transit map (schematic diagram)', ko: '거리 대신 연결만 보이는 노선도' },
      { en: 'Graph search on (station, line) states', ko: '「역 + 지금 탄 노선」을 한 상태로 둔 탐색' },
      { en: 'Minimum transfers (lexicographic cost)', ko: '환승 1000 · 역 1 비용으로 환승 먼저 줄이기' },
    ],
    goal: '{target}을(를) 노선도 그래프로 만들어 줘 — 실제 지도의 구불구불한 노선이 곧은 노선도로 바뀌고, 두 역 사이 환승이 가장 적은 길을 열차가 따라가게. 분위기는 {style}.',
    targets: ['지하철 노선도', '버스 · 기차 노선', '그래프 읽기 수업'],
    styles: ['밝은 노선도 (색 선 · 흰 역)', '어두운 바탕 형광 노선', '손그림 지도'],
    platforms: ['canvas', 'web'],
    principle: [
      '역 18개 = 점, 노선 4개 = 역 번호 목록. 실제 지도 위치(구불구불)와 노선도 위치(격자 위 곧은 자리) 두 벌을 둔다.',
      '두 위치를 섞어(lerp) 바꾸면 거리는 버리고 「연결」만 남는다는 것이 눈에 보인다.',
      '길찾기 상태는 (역, 지금 탄 노선). 같은 노선으로 옆 역 = 비용 1, 같은 역에서 다른 노선으로 갈아타기 = 비용 1000.',
      '비용이 가장 작은 길을 다익스트라로 찾으면 「환승이 가장 적고, 같으면 역 수가 적은」 길이 된다.',
    ],
    when: ['노선 · 연결 관계가 중요하고 실제 거리는 덜 중요할 때', '환승 최소 · 그래프 개념을 보여 줄 때', '단계 지도 · 기술 나무처럼 연결만 보이면 되는 지도'],
    avoid: ['실제 거리 · 시간이 중요할 때 — 대신 비용 지도(i266)', '역이 수백 개라 자동 배치가 필요할 때 — 노선도 자리는 견본처럼 손으로 정한다'],
    cost: 'light',
    costNote: '역 18 × 노선 4 = 상태 72개. 길찾기는 순간이고, 그리기는 선 몇 개뿐이다.',
    level: 2,
    must: [
      '상태 열쇠는 역 × 8 + 노선 (한 역에 여러 노선이 지나므로 역만으로는 환승을 못 센다)',
      '환승 비용을 역 이동보다 훨씬 크게(1000) 두어 환승 수가 먼저 비교되게',
      '같은 역에서 노선만 바뀐 상태는 되짚을 때 역을 두 번 넣지 않기',
      '실제 지도 ↔ 노선도 바꾸기와 새 길 찾기 단추',
    ],
    done: [
      '구불구불한 실제 노선이 가로 · 세로 곧은 노선도로 부드럽게 바뀐다',
      '고른 두 역 사이 길이 빛나고 열차가 그 길을 따라간다',
      '「환승 n번」이 표시되고, 실제로 그보다 적게 갈아타는 길이 없다',
      '노선마다 색이 달라 환승역에서 색이 바뀌는 것이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '(역, 노선) 상태로 환승 최소 길 찾기',
      from: 'demos/demosMapB.ts subwayRoute 를 정리 (Heap 은 같은 파일의 이진 힙)',
      body: `const LINES = [
  { name: '1호선', st: [0, 1, 2, 3, 4, 5, 6] },
  { name: '2호선', st: [7, 8, 3, 9, 10] },
  { name: '3호선', st: [11, 2, 9, 12, 13, 14] },
  { name: '4호선', st: [15, 16, 5, 17, 13] },
];
function subwayRoute(a: number, b: number) {
  const key = (s: number, l: number) => s * 8 + l;       // 상태 = (역, 지금 탄 노선)
  const dist = new Map<number, number>(), par = new Map<number, number>(), heap = new Heap();
  for (let l = 0; l < LINES.length; l++) if (LINES[l].st.includes(a)) { dist.set(key(a, l), 0); heap.push(0, key(a, l)); }
  let endK = -1;
  while (heap.size) {
    const k = heap.pop(), s = (k / 8) | 0, l = k % 8, d = dist.get(k)!;
    if (s === b) { endK = k; break; }
    const st = LINES[l].st, p = st.indexOf(s);
    for (const q of [p - 1, p + 1]) {                     // 같은 노선 옆 역: 비용 1
      if (q < 0 || q >= st.length) continue;
      const nk = key(st[q], l);
      if (d + 1 < (dist.get(nk) ?? Infinity)) { dist.set(nk, d + 1); par.set(nk, k); heap.push(d + 1, nk); }
    }
    for (let l2 = 0; l2 < LINES.length; l2++) {           // 갈아타기: 비용 1000
      if (l2 === l || !LINES[l2].st.includes(s)) continue;
      const nk = key(s, l2);
      if (d + 1000 < (dist.get(nk) ?? Infinity)) { dist.set(nk, d + 1000); par.set(nk, k); heap.push(d + 1000, nk); }
    }
  }
  if (endK < 0) return null;
  const st: number[] = [], ln: number[] = [];
  for (let k: number | undefined = endK; k !== undefined; k = par.get(k)) {
    const s = (k / 8) | 0;
    if (st[0] === s) { ln[0] = k % 8; continue; }         // 같은 역에서 노선만 바뀐 상태
    st.unshift(s); ln.unshift(k % 8);
  }
  let transfers = 0;
  for (let i = 1; i < ln.length; i++) if (ln[i] !== ln[i - 1]) transfers++;
  return { st, ln, transfers };
}
// 그리기: 역 i 의 위치 = lerp(실제 지도 ST_GEO[i], 노선도 ST[i], m) — m 을 0 ↔ 1 로 바꾸면 지도 ↔ 노선도`,
    },
    pitfalls: [
      { title: '역만 상태로 두면 환승 횟수를 셀 수 없다', fix: '(역, 노선) 짝을 상태로 두고 갈아타기를 따로 비용 매긴다.' },
      { title: '환승 비용을 역 이동과 비슷하게 두면 역 수가 적은 대신 환승이 많은 길이 나온다', fix: '환승 비용을 역 수보다 훨씬 크게(1000) 둔다.' },
      { title: '노선도 자리를 실제 좌표에서 자동으로 만들면 선이 겹치고 엇갈린다', fix: '견본처럼 노선도 자리(격자 위 곧은 위치)를 따로 정해 둔다.' },
    ],
    prev: ['i264', 'i266'],
    next: ['i271'],
    refs: [{ name: 'Wikipedia — Transit map', url: 'https://en.wikipedia.org/wiki/Transit_map' }],
  },

  i271: {
    id: 'i271',
    summary: '큰 화면은 캐릭터 둘레만 확대해 따라가고, 구석 작은 지도에 섬 전체 · 내 위치 · 보이는 범위 틀 · 깜박이는 목표를 함께 그린다.',
    terms: [
      { en: 'Minimap', ko: '구석의 작은 전체 지도' },
      { en: 'Viewport rectangle (camera frustum on minimap)', ko: '지금 큰 화면에 보이는 범위를 작은 지도에 틀로' },
      { en: 'Off-screen target indicator', ko: '화면 밖 목표를 가장자리 화살표로' },
      { en: 'Smooth follow camera (lerp)', ko: '캐릭터를 부드럽게 따라가는 카메라' },
    ],
    goal: '{target}에 미니맵을 넣어 줘 — 큰 화면은 캐릭터를 부드럽게 따라가고, 구석 작은 지도에 전체 · 내 위치 · 보이는 범위 틀 · 지나온 길 · 깜박이는 목표가 보이게. 분위기는 {style}.',
    targets: ['큰 섬 탐험 게임', '넓은 판 전략 게임', '보물찾기 지도'],
    styles: ['밝은 지도 색 + 둥근 테', '어두운 레이더 화면', '양피지 지도'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 위에서 내려다보는 두 번째 Camera 를 RenderTexture 에 그려 RawImage 로 구석에 띄운다.',
      godot: 'Godot 은 SubViewport 안에 위에서 보는 Camera2D/3D 를 두고 SubViewportContainer 로 구석에 띄운다.',
      three: 'three.js 는 setViewport · setScissor 로 같은 장면을 구석에 정사영 카메라로 한 번 더 그린다.',
    },
    principle: [
      '세계 지도는 한 장의 캔버스로 미리 그려 두고, 큰 화면과 작은 지도가 같은 그림을 다른 배율로 잘라 그린다 (drawImage 의 원본 영역).',
      '큰 화면 배율 Z 에서 보이는 세계 범위 = 화면 폭 ÷ Z. 그 왼쪽 위 (sx, sy) 와 크기 (vw, vh) 를 작은 지도 배율 mz 로 곱하면 「보이는 범위 틀」이 된다.',
      '카메라는 캐릭터 위치로 lerp(카메라, 캐릭터, dt·3) — 바로 붙지 않고 부드럽게 따라간다.',
      '목표가 큰 화면 밖이면 화면 가운데에서 목표 쪽 각도로 가장자리에 화살표를 그린다.',
      '지나온 길은 6 이상 움직였을 때만 점을 더하고(최대 400개), 작은 지도에 점선으로 그린다.',
    ],
    when: ['화면보다 훨씬 큰 지도에서 길을 잃지 않게 할 때', '목표 방향을 알려 줘야 할 때', '전략 게임처럼 전체 상황을 함께 봐야 할 때'],
    avoid: ['화면 하나에 다 들어오는 작은 판 — 작은 지도가 자리만 차지한다', '탐험 자체가 재미인 안개 지도 — 미니맵에도 안 본 곳을 가리거나(i268) 빼기'],
    cost: 'light',
    costNote: '세계 그림은 한 번만 굽고, 프레임마다 같은 그림을 두 번 drawImage. 3D 라면 미니맵용 두 번째 렌더가 그만큼 더 든다.',
    level: 1,
    must: [
      '세계 지도는 한 번 구워 큰 화면 · 미니맵이 같이 쓰기 — 미니맵을 따로 다시 그리지 않기',
      '보이는 범위 틀은 큰 화면 카메라의 실제 범위(sx, sy, vw, vh) × 미니맵 배율',
      '미니맵 안 그림은 둥근 테로 clip, 그림자로 떠 보이게',
      '화면 밖 목표는 가장자리 화살표로, 미니맵 위 목표는 깜박이기',
      '미니맵 크기 · 큰 화면 확대 · 범위 틀 · 지나온 길을 조절할 수 있게',
    ],
    done: [
      '캐릭터가 움직이면 큰 화면이 부드럽게 따라가고, 미니맵의 흰 틀도 같이 움직인다',
      '큰 화면 확대를 키우면 미니맵의 틀이 작아진다',
      '목표가 화면 밖이면 가장자리 화살표가 목표 쪽을 가리킨다',
      '지나온 길이 미니맵에 점선으로 남는다',
    ],
    code: {
      lang: 'ts',
      title: '같은 세계 그림으로 큰 화면 + 미니맵 + 보이는 범위 틀',
      from: 'demos/demosMapB.ts i271 draw() 를 정리',
      body: `// 카메라는 캐릭터를 부드럽게 따라간다
cam = [cam[0] + (p[0] - cam[0]) * Math.min(1, dt * 3), cam[1] + (p[1] - cam[1]) * Math.min(1, dt * 3)];
// 큰 화면: 배율 Z 로 카메라 둘레만 잘라 그리기
const vw = w / Z, vh = h / Z;
const sx = cam[0] - vw / 2, sy = cam[1] - vh / 2;
g.drawImage(world, sx, sy, vw, vh, 0, 0, w, h);
const toS = (q: [number, number]) => [(q[0] - sx) * Z, (q[1] - sy) * Z];
// 화면 밖 목표 → 가장자리 화살표
const ts = toS(tgt);
if (ts[0] < 0 || ts[1] < 0 || ts[0] > w || ts[1] > h) {
  const ang = Math.atan2(ts[1] - h / 2, ts[0] - w / 2);
  const ex = Math.min(w - 14, Math.max(14, w / 2 + Math.cos(ang) * w));
  const ey = Math.min(h - 14, Math.max(14, h / 2 + Math.sin(ang) * h));
  drawArrow(g, ex, ey, ang);
}
// 미니맵: 같은 세계 그림을 작게
const mw = w * 0.34 * mmSize, mh = (mw * WORLD_H) / WORLD_W;
const mx = w - mw - 8, my = 8, mz = mw / WORLD_W;
g.save();
g.beginPath(); g.roundRect(mx, my, mw, mh, 5); g.clip();
g.drawImage(world, mx, my, mw, mh);
// 보이는 범위 틀 = 큰 화면 카메라 범위 × 미니맵 배율
g.strokeStyle = '#fff'; g.lineWidth = 1.5;
g.strokeRect(mx + sx * mz, my + sy * mz, vw * mz, vh * mz);
// 내 위치 · 목표
g.fillStyle = '#ff8fa3';
g.beginPath(); g.arc(mx + p[0] * mz, my + p[1] * mz, 2.6, 0, Math.PI * 2); g.fill();
g.restore();`,
    },
    pitfalls: [
      { title: '미니맵을 매 프레임 새로 그리면 큰 지도에서 느리다', fix: '세계 그림을 한 번 구워 두고 drawImage 로 줄여 그린다.' },
      { title: '보이는 범위 틀이 실제 화면과 어긋난다', fix: '큰 화면에서 쓴 sx · sy · vw · vh 를 그대로 미니맵 배율로 곱한다 — 따로 계산하지 않는다.' },
      { title: '카메라가 캐릭터에 딱 붙어 화면이 덜컹거린다', fix: 'dt 에 비례한 lerp 로 따라가게 한다.' },
    ],
    prev: ['i245'],
    next: ['i272', 'i268'],
  },

  i272: {
    id: 'i272',
    summary: '세계를 확대 단계(z)마다 2ᶻ × 2ᶻ 타일로 나눠 보이는 타일만 그때그때 만들어 끼우고, 아직 없는 타일은 윗단계 그림을 늘려 임시로 채운다.',
    terms: [
      { en: 'Slippy map (tiled web map, z/x/y)', ko: '확대 단계마다 타일을 바꿔 끼우는 지도' },
      { en: 'Level of detail (zoom levels)', ko: '가까이 볼수록 더 자세한 그림' },
      { en: 'Parent tile fallback', ko: '못 받은 타일은 윗단계 타일 일부를 늘려 대신' },
      { en: 'Tile cache with eviction', ko: '만든 타일 보관 · 오래된 것 버리기' },
    ],
    goal: '{target}을(를) 확대 · 끌기 지도로 만들어 줘 — 확대 단계가 오를 때마다 더 자세한 타일로 바꿔 끼우고, 아직 없는 타일은 윗단계 그림을 늘려 임시로, 타일 번호(z/x/y)가 보이게. 분위기는 {style}.',
    targets: ['세계 지도', '아주 큰 그림 · 지형', '축척 수업 지도'],
    styles: ['밝은 지도 색', '어두운 바탕 위성 지도', '종이 지도'],
    platforms: ['canvas', 'web'],
    platformHints: {
      web: '실제 지도 타일을 쓸 거라면 Leaflet · OpenLayers · MapLibre GL 이 이 방식을 그대로 한다.',
    },
    principle: [
      '확대 단계 z 에서 세계는 2ᶻ × 2ᶻ 장의 타일. 타일 이름은 「z/x/y」.',
      '연속 확대값 Zc 에서 세계 크기 = 기준 × 2^Zc, 그리는 단계 z = floor(Zc + 0.25). 화면에 걸친 x0~x1 · y0~y1 타일만 그린다.',
      '타일은 그 단계에 맞게 자세히(옥타브 3 + z) 만든다 — 확대할수록 잡음 결이 더 고와진다.',
      '아직 없는 타일은 받기 줄(queue)에 넣고, 그동안 윗단계(z−1, z−2 …) 타일에서 해당 부분((tx − (ptx≪sh))·sub …)을 잘라 늘려 그린다.',
      '새 타일은 0.35초 동안 서서히 나타나게, 보관함이 160장을 넘으면 0 · 1 단계 말고 오래된 것부터 버린다.',
    ],
    when: ['화면보다 훨씬 큰 지도 · 그림을 확대해 봐야 할 때', '확대할수록 더 자세한 내용(도시 이름 등)을 보여 줄 때', '축척 · 2의 거듭제곱 개념을 보여 줄 때'],
    avoid: ['한 장으로 충분한 작은 지도 — 대신 drawImage 확대', '진짜 세계 지도 서비스 — 직접 만들지 말고 Leaflet · MapLibre 같은 라이브러리'],
    cost: 'medium',
    costNote: '타일 하나(176×176) 만들기에 잡음 수만 번 — 그래서 한 장면에 1~2장씩만 만든다. 보관함 120~160장 × 176² × 4바이트 ≈ 15~20MB.',
    level: 2,
    must: [
      '보이는 타일만 계산해 그리기 (x0~x1, y0~y1)',
      '타일 만들기는 한 장면에 1~2장씩만 (한꺼번에 만들면 확대 순간 멈춘다)',
      '없는 타일은 윗단계 타일을 늘려 임시로 — 빈 구멍이 보이지 않게',
      '보관함 크기 상한과 버리기 규칙 (낮은 단계는 남기기)',
      '휠 · 끌기로 확대 · 이동, 가만히 두면 자동 둘러보기',
    ],
    done: [
      '확대하면 처음엔 흐릿한 타일이 보이다가 곧 자세한 타일로 바뀌며 서서히 나타난다',
      '타일 번호 z/x/y 와 경계선이 보이고, 단계가 오를 때마다 타일이 4장으로 쪼개진다',
      '확대 단계가 오를수록 마을 이름이 더 많이 나타난다',
      '휠 · 끌기로 움직여도 화면에 빈 구멍이 생기지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '보이는 타일 고르기 + 윗단계 타일로 임시 채우기',
      from: 'demos/demosMapB.ts i272 draw() 를 정리',
      body: `const z = Math.max(0, Math.min(4, Math.floor(Zc + 0.25)));   // 그릴 단계
const n = 1 << z;
const worldPx = BASE * Math.pow(2, Zc), tilePx = worldPx / n;
const ox = w / 2 - cx * worldPx, oy = h / 2 - cy * worldPx;  // cx, cy = 화면 가운데의 세계 좌표 (0~1)
const cl = (v: number) => Math.max(0, Math.min(n - 1, v));
const x0 = cl(Math.floor(-ox / tilePx)), x1 = cl(Math.floor((w - ox) / tilePx));
const y0 = cl(Math.floor(-oy / tilePx)), y1 = cl(Math.floor((h - oy) / tilePx));
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
  const key = z + '/' + tx + '/' + ty;
  const X = ox + tx * tilePx, Y = oy + ty * tilePx;
  const tile = cache.get(key);
  if (!tile) {
    if (!queue.includes(key)) queue.push(key);
    for (let pz = z - 1; pz >= 0; pz--) {                    // 윗단계 타일의 해당 부분을 늘려 쓰기
      const sh = z - pz, ptx = tx >> sh, pty = ty >> sh;
      const pt = cache.get(pz + '/' + ptx + '/' + pty);
      if (!pt) continue;
      const sub = RES / (1 << sh);
      g.drawImage(pt.c, (tx - (ptx << sh)) * sub, (ty - (pty << sh)) * sub, sub, sub, X, Y, tilePx + 0.5, tilePx + 0.5);
      break;
    }
    continue;
  }
  g.globalAlpha = Math.min(1, (t - tile.born) / 0.35);       // 새 타일은 서서히
  g.drawImage(tile.c, X, Y, tilePx + 0.5, tilePx + 0.5);      // +0.5 = 타일 사이 틈 막기
  g.globalAlpha = 1;
}
// 한 장면에 1~2장만 만든다
for (let k = 0; k < 2 && queue.length; k++) {
  const key = queue.shift()!;
  const [zz, xx, yy] = key.split('/').map(Number);
  if (zz === z && !cache.has(key)) cache.set(key, { c: makeTile(zz, xx, yy), born: t });
}`,
    },
    pitfalls: [
      { title: '확대 순간 보이는 타일을 한꺼번에 만들면 화면이 멈춘다', fix: '받기 줄에 넣고 한 장면에 1~2장씩만 만든다.' },
      { title: '타일 사이에 가는 틈이 보인다', fix: '타일을 0.5px 크게 그린다.' },
      { title: '아직 없는 타일 자리가 비어 깜박인다', fix: '윗단계 타일의 해당 1/2ˢʰ 부분을 잘라 늘려 임시로 채운다.' },
      { title: '오래 둘러보면 보관함이 끝없이 커진다', fix: '상한(160장)을 넘으면 낮은 단계(0 · 1)는 남기고 나머지를 버린다.' },
    ],
    prev: ['i271', 'i245'],
    next: ['i261', 'i277'],
    refs: [
      { name: 'OpenStreetMap Wiki — Slippy map tilenames', url: 'https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames' },
      { name: 'Leaflet', url: 'https://leafletjs.com/' },
    ],
  },

  i273: {
    id: 'i273',
    summary: '양피지 결 · 얼룩 · 접힌 자국 · 탄 가장자리를 코드로 구워 깔고, 그 위에 잉크 점선 길이 깃펜 끝을 따라 그려지다 X 표로 끝나게 한다.',
    terms: [
      { en: 'Treasure map style (parchment texture)', ko: '낡은 양피지 보물 지도 그림체' },
      { en: 'Procedural paper (stains, folds, burnt edges)', ko: '코드로 그리는 얼룩 · 접힌 자국 · 탄 가장자리' },
      { en: 'Animated path drawing (partial stroke)', ko: '길이의 앞부분만 그어 그려지는 길' },
      { en: 'Compass rose', ko: '나침반 장미' },
    ],
    goal: '{target}을(를) 양피지 보물 지도 그림체로 그려 줘 — 울퉁불퉁 탄 가장자리 · 얼룩 · 접힌 자국 · 잉크 물결 바다 · 나침반 장미 위로 점선 길이 깃펜을 따라 그려지고 X 표가 찍히게. 분위기는 {style}.',
    targets: ['보물섬 지도', '모험 게임 단계 지도', '보물찾기 수업 연출'],
    styles: ['낡은 해적 지도', '깨끗한 동화책 지도', '촛불 아래 어두운 방'],
    platforms: ['canvas', 'web'],
    principle: [
      '종이 가장자리는 네 변을 4px 간격 점으로 나누고, 잡음 + 작은 흔들림으로 안팎으로 밀어 울퉁불퉁하게 (낡을수록 더 크게).',
      '그 모양 안을 가운데 밝고 가장자리 어두운 방사 그러데이션으로 칠하고, 흐린 갈색 얼룩 원 수십 개 · 작은 점 1,500개로 결을 낸다.',
      '접힌 자국 = 가운데 어둡고 바로 옆 밝은 좁은 그러데이션 띠, 탄 가장자리 = 종이 테두리를 굵게 · 흐리게(blur) 한 번, 얇고 진하게 한 번.',
      '섬 둘레 잉크 물결은 굵은 선을 그리고 destination-out 으로 안쪽을 지워 고리만 남기기를 5겹.',
      '이 모든 바탕은 화면 밖 캔버스에 한 번 굽고, 매 프레임엔 점선 길의 앞부분(전체 길이 × k)만 그어 깃펜 끝을 그 끝점에 둔다.',
    ],
    when: ['보물찾기 · 모험 게임의 지도 화면', '이야기 시작 · 단계 고르기 연출', '종이 느낌의 결과 화면'],
    avoid: ['실제 길찾기 · 좌표 읽기처럼 정확해야 하는 지도 — 얼룩 · 접힌 자국이 읽기를 방해한다', '자주 바뀌는 지도 — 바탕을 매번 다시 구우면 무겁다'],
    cost: 'light',
    costNote: '바탕(얼룩 수십 · 점 1,500 · blur 한 번)은 시드 · 낡은 정도 · 크기가 바뀔 때만 굽는다. 매 프레임은 그림 한 장 + 점선 길 하나.',
    level: 1,
    must: [
      '바탕(종이 · 섬 · 산 · 나침반 · 제목)은 화면 밖 캔버스에 굽고, 열쇠(시드 · 낡은 정도 · 크기 · dpr)가 바뀔 때만 다시',
      '그림 파일 없이 모두 코드로, 글씨는 손글씨 글꼴로',
      '길은 Catmull-Rom 으로 부드럽게 한 뒤 전체 길이의 앞부분만 그어 그려지는 모습을, 끝점에 깃펜',
      '길이 다 그려지면 X 표를 두 획으로 긋고 깜박이는 원 + 「여기!」',
      '「낡은 정도」 슬라이더로 얼룩 · 탄 가장자리 세기를 바꿀 수 있게',
    ],
    done: [
      '종이 가장자리가 울퉁불퉁하고 탄 자국처럼 어둡게 번져 있다',
      '빨간 점선 길이 깃펜 끝을 따라 그려지고, 끝에서 X 표가 두 획으로 그어진다',
      '낡은 정도를 0 으로 하면 깨끗한 종이, 1 이면 얼룩 · 탄 가장자리가 짙다',
      '폰에서도 끊김 없이 그려진다',
    ],
    code: {
      lang: 'ts',
      title: '울퉁불퉁 종이 가장자리 + 탄 테두리 + 그려지는 점선 길',
      from: 'demos/demosMapB.ts i273 paint() · strokePathPart 를 정리',
      body: `// 1) 종이 가장자리: 네 변을 점으로 나눠 잡음으로 밀기 (age = 낡은 정도 0~1)
const edge: [number, number][] = [];
const per = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (4 * u));
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const j = (vnoise(f * 12 + x0 * 0.01, y0 * 0.01, seed) - 0.5) * 7 * u * (0.5 + age) + (r() - 0.5) * 1.6 * u;
    edge.push([x0 + (x1 - x0) * f + nx * j, y0 + (y1 - y0) * f + ny * j]);
  }
};
const m = 9 * u;
per(m, m, w - m, m, 0, 1); per(w - m, m, w - m, h - m, -1, 0); per(w - m, h - m, m, h - m, 0, -1); per(m, h - m, m, m, 1, 0);
const paperPath = () => { lg.beginPath(); edge.forEach(([x, y], i) => (i ? lg.lineTo(x, y) : lg.moveTo(x, y))); lg.closePath(); };
// 2) 탄 가장자리: 굵고 흐린 선 + 얇고 진한 선 (종이 모양으로 clip 한 상태에서)
paperPath();
lg.strokeStyle = 'rgba(60,30,10,0.55)';
lg.lineWidth = (10 + 18 * age) * u;
lg.filter = 'blur(' + (3 + 4 * age) * u + 'px)';
lg.stroke();
lg.filter = 'none';
paperPath(); lg.strokeStyle = 'rgba(40,18,5,0.85)'; lg.lineWidth = 2.2 * u; lg.stroke();

// 3) 매 프레임: 길의 앞부분 k 만 긋고 끝점을 돌려준다 (깃펜 자리)
function strokePathPart(g: CanvasRenderingContext2D, pts: [number, number][], k: number) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total * Math.min(1, Math.max(0, k));
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  let head = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L >= left) { head = [a[0] + ((b[0] - a[0]) * left) / (L || 1), a[1] + ((b[1] - a[1]) * left) / (L || 1)]; g.lineTo(head[0], head[1]); break; }
    left -= L; g.lineTo(b[0], b[1]); head = b;
  }
  g.stroke();
  return head;
}
g.setLineDash([5 * u, 4 * u]); g.strokeStyle = 'rgba(150,30,25,0.9)';
const pen = strokePathPart(g, pathPts, ease(Math.min(1, phaseT / 3.2)));
g.setLineDash([]);`,
    },
    pitfalls: [
      { title: '얼룩 · 결 · blur 를 매 프레임 그리면 폰에서 느리다', fix: '바탕은 화면 밖 캔버스에 한 번 굽고, 바뀌는 것(길 · X 표 · 촛불 빛)만 매 프레임 그린다.' },
      { title: '가장자리를 Math.random 으로만 흔들면 톱니처럼 거칠다', fix: '잡음(vnoise)으로 크게 출렁이고, 작은 무작위는 조금만 더한다.' },
      { title: '점선 길을 setLineDash 로 그리고 안 풀면 다음 그림까지 점선이 된다', fix: '길을 그은 뒤 setLineDash([]) 로 되돌린다.' },
    ],
    prev: ['i245'],
    next: ['i275', 'i271'],
  },

  i275: {
    id: 'i275',
    summary: '높이 지도를 칸마다 블록 기둥으로 쌓아 계단식 섬 판을 만들고, 옆면에 지층 줄무늬 · 둘레에 물 찬 유리 상자를 둔다.',
    terms: [
      { en: 'Diorama map (voxel terraced terrain)', ko: '계단 블록으로 쌓은 작은 섬 판' },
      { en: 'three.js InstancedMesh + setColorAt', ko: '같은 상자 수천 개를 한 번에 · 블록마다 색' },
      { en: 'Quantized heightmap', ko: '높이를 몇 단계로 끊기' },
      { en: 'Strata coloring', ko: '옆면 흙 · 돌 지층 줄무늬' },
    ],
    goal: '{target}을(를) 디오라마 지도로 만들어 줘 — 높이 지도를 계단 블록 기둥으로 쌓고, 옆면은 지층 줄무늬, 둘레는 물 찬 유리 상자, 위에 나무 · 집이 솟아나게. 분위기는 {style}.',
    targets: ['월드 고르기 화면 섬', '작은 마을 판', '높이 · 등고선 체험 판'],
    styles: ['밝은 장난감 블록', '귀엽고 아기자기', '잔잔한 파스텔'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Graphics.RenderMeshInstanced (또는 GPU Instancing 켠 재질) 로 블록을 한 번에 그린다.',
      godot: 'Godot 은 MultiMeshInstance3D (use_colors) 로 블록마다 위치 · 색을 준다.',
    },
    principle: [
      '22×22 칸마다 높이 = fbm 잡음 × 1.25 − 가운데에서 거리 × 2.1 + 0.42 를 단계 수(견본 7)로 끊는다 — 가장자리는 낮아져 섬이 된다.',
      '칸마다 바닥에서 그 높이까지 상자를 한 층(0.3)씩 쌓는다. 상자는 모두 InstancedMesh 하나에 setMatrixAt · setColorAt 으로.',
      '맨 윗층은 높이에 따라 모래 · 풀 · 숲 · 바위 · 눈 색, 아래층은 두 가지 흙색 줄무늬 + 아래로 갈수록 어둡게(0.62~1) — 옆에서 보면 지층.',
      '물은 판 크기의 반투명 상자(높이 = 물 높이)와 정점이 sin · cos 로 출렁이는 윗면 판.',
      '새 섬이 나올 때 가운데부터 바깥으로 기둥이 easeOutBack 으로 솟고, 그다음 나무 · 집이 커진다.',
    ],
    when: ['단계 · 월드 고르기 화면의 귀여운 섬', '높이 지도를 입체로 보여 줄 때', '블록 장난감 느낌의 판'],
    avoid: ['매끈한 실제 산 — 대신 등고선 3D 지형(i279)', '칸이 수백 × 수백인 큰 땅 — 상자 수가 너무 많아 덩어리 메시로 합치기'],
    cost: 'light',
    costNote: '22×22 칸 × 최대 13층 = 상자 6,292개지만 InstancedMesh 하나라 그리기 호출 1번. 솟는 동안(1.7초)만 행렬을 다시 쓰고, 다 솟으면 멈춘다.',
    level: 2,
    must: [
      '블록은 InstancedMesh 하나로 (Mesh 수천 개 금지), count 로 실제 개수만 그리기',
      '행렬 · 색은 솟는 동안만 다시 쓰고 instanceMatrix · instanceColor.needsUpdate 를 켜기',
      '물은 depthWrite: false 반투명 — 블록이 물 아래에서도 보이게',
      '나무 · 줄기도 InstancedMesh, 물 높이보다 낮은 칸 · 너무 높은 칸에는 놓지 않기',
      '단계 수 · 물 높이 슬라이더와 「새 섬」 단추',
    ],
    done: [
      '새 섬이 가운데부터 바깥으로 기둥이 통통 솟으며 생긴다',
      '옆에서 보면 흙 · 돌 지층 줄무늬가 보이고, 물 상자 옆면으로 잠긴 블록이 비친다',
      '물 높이를 올리면 낮은 땅이 잠기고 모래 칸이 바뀐다',
      '폰에서도 60fps (그리기 호출 수십 번 안)',
    ],
    code: {
      lang: 'ts',
      title: '높이 지도 → 계단 블록 InstancedMesh (윗면 색 + 지층)',
      from: 'demos/demosMapB.ts i275 genIsland · layout 을 정리',
      body: `import * as THREE from 'three';
const N = 22, S = 9.6 / N, LH = 0.3, half = (N * S) / 2;
const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, flatShading: true }), N * N * 13);
scene.add(blocks);
// 높이: 잡음 − 가운데 거리 → 단계로 끊기
const hgt = new Int8Array(N * N);
for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
  const d = Math.hypot((x + 0.5) / N - 0.5, ((z + 0.5) / N - 0.5) * 1.1);
  const val = fbm(x * 0.15, z * 0.15, seed * 9, 4) * 1.25 - d * 2.1 + 0.42;
  hgt[z * N + x] = Math.max(0, Math.min(levels, Math.floor(val * levels * 1.15)));
}
const topColor = (L: number) => (L <= waterL ? 0xd8c38c : L <= waterL + 1 ? 0xe9d79e : L <= levels * 0.55 ? 0x74c24e
  : L <= levels * 0.72 ? 0x4f9a3e : L <= levels * 0.86 ? 0x9a948a : 0xf4f7fa);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(S, LH, S), col = new THREE.Color();
let n = 0;
for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
  const L = hgt[z * N + x];
  for (let y = 0; y <= L; y++) {
    v.set((x + 0.5) * S - half, (y + 0.5) * LH, (z + 0.5) * S - half);
    blocks.setMatrixAt(n, m4.compose(v, q, sc));
    if (y === L) col.setHex(topColor(L));
    else col.setHex(L <= waterL ? 0xc9b07a : y < 1 ? 0x5e5049 : y % 2 ? 0x8a6242 : 0x7a5338)
      .multiplyScalar(0.62 + 0.38 * (y / Math.max(1, L))); // 아래로 갈수록 어둡게
    blocks.setColorAt(n, col);
    n++;
  }
}
blocks.count = n;
blocks.instanceMatrix.needsUpdate = true;
if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
// 물: 반투명 상자 (depthWrite 끔)
const water = new THREE.Mesh(new THREE.BoxGeometry(N * S, 1, N * S),
  new THREE.MeshStandardMaterial({ color: 0x2b9be0, transparent: true, opacity: 0.42, roughness: 0.2, depthWrite: false }));
const wh = (waterL + 1) * LH * 0.98;
water.scale.y = wh; water.position.y = wh / 2;
scene.add(water);`,
    },
    pitfalls: [
      { title: '블록마다 Mesh 를 만들면 수천 번 그려 폰이 멈춘다', fix: 'InstancedMesh 하나에 setMatrixAt · setColorAt 으로 넣고 count 를 실제 개수로.', seen: true },
      { title: 'setColorAt 을 처음 부르기 전에는 instanceColor 가 없다', fix: '색을 넣은 뒤 if (blocks.instanceColor) needsUpdate = true 처럼 확인한다.' },
      { title: '반투명 물이 깊이를 써서 잠긴 블록이 사라진다', fix: '물 재질은 depthWrite: false.' },
      { title: '다 솟은 뒤에도 매 프레임 행렬 수천 개를 다시 쓰면 CPU 낭비다', fix: '솟는 동안(1.7초)만 layout 을 돌리고 끝나면 멈춘다.' },
    ],
    prev: ['i245', 'i257'],
    next: ['i279', 'i539'],
    refs: [{ name: 'three.js 문서 — InstancedMesh', url: 'https://threejs.org/docs/#api/en/objects/InstancedMesh' }],
  },

  i277: {
    id: 'i277',
    summary: '지역마다 값을 같은 간격 몇 단계로 나눠 색칠하고 범례로 읽게 하며, 자료를 바꿀 때 색이 부드럽게 넘어가고 마우스를 댄 지역 값이 뜬다.',
    terms: [
      { en: 'Choropleth map', ko: '지역마다 값으로 색칠한 통계 지도' },
      { en: 'Class breaks (equal interval)', ko: '최솟값~최댓값을 같은 간격 단계로 나누기' },
      { en: 'Sequential color ramp + legend', ko: '연한 색 → 진한 색 사다리와 범례' },
      { en: 'Region id raster (lookup table)', ko: '픽셀마다 지역 번호 → 색 표로 한 번에 칠하기' },
    ],
    goal: '{target}을(를) 등치 지도로 그려 줘 — 지역마다 값을 단계 색으로 칠하고, 범례 · 지역 이름 · 마우스를 댄 지역 값이 보이며, 자료를 바꾸면 색이 부드럽게 바뀌게. 분위기는 {style}.',
    targets: ['지역별 인구 · 강수량 지도', '통계 · 자료 해석 수업', '우리 반 설문 결과 지도'],
    styles: ['어두운 바탕 밝은 색 사다리', '밝은 교과서 지도', '파스텔 그림 지도'],
    platforms: ['canvas', 'web'],
    platformHints: {
      web: '실제 행정구역 경계로 만들 때는 GeoJSON 경계 + D3(d3-geo, d3-scale) 조합이 흔하다.',
    },
    principle: [
      '지역 나누기: 땅 픽셀마다 가장 가까운 씨앗(보로노이)을 찾아 지역 번호를 적는다 — 경계를 잡음으로 살짝 흔들어 자연스럽게.',
      '단계: (값 − 최솟값) / (최댓값 − 최솟값) × 단계 수 를 내림 → 0 ~ 단계 수 − 1. 단계 가운데 색을 색 사다리에서 고른다.',
      '칠하기: 지역 번호 → 색 표(Uint32 LUT)를 만들고, 픽셀 배열을 한 번 훑어 표에서 색을 꺼내 넣는다. 이웃 번호가 다르면 흰 경계, 바다와 닿으면 진한 해안선.',
      '자료를 바꿀 때는 지역마다 옛 색과 새 색을 0.7초 동안 섞는다.',
      '마우스가 있는 픽셀의 지역 번호로 그 지역을 밝히고 값을 띄운다.',
    ],
    when: ['지역마다 하나의 값(인구 · 비율)을 비교할 때', '통계 · 자료 해석 체험', '단계 수에 따라 지도 인상이 바뀌는 것을 보여 줄 때'],
    avoid: ['점이 찍힌 위치 · 빈도 — 대신 열 지도(i278)', '지역 크기가 값과 상관없이 너무 다를 때 — 큰 지역이 과장되니 비율 값으로 바꾸거나 기호 지도로'],
    cost: 'light',
    costNote: '지역 번호 그림은 크기가 바뀔 때만 만들고, 색은 자료 · 단계 · 마우스 지역이 바뀔 때만 다시 칠한다 (픽셀 수십만 개를 Uint32 로 한 번 훑기).',
    level: 2,
    must: [
      '지역 번호 그림(Int16Array)은 한 번 만들고, 색칠은 지역 번호 → 색 표(LUT)로',
      '색 키(자료 · 전환 진행 · 마우스 지역 · 단계 수)가 바뀔 때만 다시 칠하기',
      '단계 색 사다리는 연한 → 진한 한 방향 색 (무지개 색 쓰지 않기), 범례에 단계 경계값 표시',
      '단계 수(3 ~ 7) · 연속 색 켬/끔 · 자료 바꾸기를 조절할 수 있게',
    ],
    done: [
      '지역마다 다른 단계 색이 칠해지고, 범례의 색 · 값 범위와 맞는다',
      '자료를 바꾸면 색이 0.7초 동안 부드럽게 넘어간다',
      '마우스(가짜 커서)가 지나가는 지역이 밝아지고 값이 뜬다',
      '단계 수를 3 으로 하면 큰 덩어리, 7 이면 촘촘한 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '같은 간격 단계 + 지역 번호 → 색 표로 한 번에 칠하기',
      from: 'demos/demosMapB.ts i277 classOf · colorFor · 칠하기 부분을 정리',
      body: `const classOf = (v: number, mn: number, mx: number) =>
  Math.max(0, Math.min(classes - 1, Math.floor(((v - mn) / (mx - mn + 1e-9)) * classes)));
const colorFor = (d: number, v: number): RGB => {
  const arr = vals[d], mn = Math.min(...arr), mx = Math.max(...arr);
  const k = continuous ? (v - mn) / (mx - mn) : (classOf(v, mn, mx) + 0.5) / classes; // 단계 가운데 색
  return rampAt(DATASETS[d].ramp, k);
};
// 지역 번호 → 색 표 (옛 자료 → 새 자료 tw 만큼 섞기, 마우스 지역은 밝게)
const lut = new Uint32Array(NREG + 1);
for (let i = 0; i < NREG; i++) {
  const a = colorFor(prevDs, vals[prevDs][i]), b = colorFor(ds, vals[ds][i]);
  let c: RGB = [a[0] + (b[0] - a[0]) * tw, a[1] + (b[1] - a[1]) * tw, a[2] + (b[2] - a[2]) * tw];
  if (i === hov) c = [c[0] + (255 - c[0]) * 0.25, c[1] + (255 - c[1]) * 0.25, c[2] + (255 - c[2]) * 0.25];
  lut[i] = (255 << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255); // 리틀 엔디언 RGBA
}
// 픽셀 한 번 훑기: rid = 지역 번호(바다 −1), edge = 1 지역 경계 · 2 해안선
const d32 = new Uint32Array(img.data.buffer);
const WHITE = (220 << 24) | (255 << 16) | (255 << 8) | 255;
const COAST = (255 << 24) | (60 << 16) | (40 << 8) | 30;
for (let i = 0; i < d32.length; i++) {
  const r = rid[i];
  if (r < 0) { d32[i] = 0; continue; }
  d32[i] = edge[i] === 2 ? COAST : edge[i] === 1 ? WHITE : lut[r];
}
ctx.putImageData(img, 0, 0);`,
    },
    pitfalls: [
      { title: '지역을 픽셀마다 따로 계산해 색칠하면 프레임마다 느리다', fix: '지역 번호 그림을 한 번 만들어 두고, 색은 번호 → 색 표로 칠한다. 바뀔 때만.' },
      { title: '무지개 색 사다리를 쓰면 어느 쪽이 큰 값인지 헷갈린다', fix: '연한 → 진한 한 방향 색 사다리를 쓰고 범례에 경계값을 적는다.' },
      { title: 'Uint32Array 로 색을 넣을 때 바이트 순서를 반대로 쓴다', fix: '브라우저는 리틀 엔디언이라 (A << 24) | (B << 16) | (G << 8) | R 순서.' },
    ],
    prev: ['i246'],
    next: ['i278'],
    refs: [{ name: 'Wikipedia — Choropleth map', url: 'https://en.wikipedia.org/wiki/Choropleth_map' }],
  },

  i278: {
    id: 'i278',
    summary: '누른 자리마다 가우스 번짐을 작은 격자에 더해 쌓고, 가장 뜨거운 값으로 나눈 세기를 색 사다리로 칠해 많이 눌린 곳이 빨갛게 빛나게 한다.',
    terms: [
      { en: 'Heatmap (kernel density)', ko: '점이 많은 곳이 뜨거운 열 지도' },
      { en: 'Gaussian kernel splatting', ko: '점마다 둥근 가우스 번짐을 더하기' },
      { en: 'Color ramp normalization', ko: '가장 큰 값으로 나눠 0~1 색 사다리에 맞추기' },
      { en: 'Additive blending (lighter)', ko: '더해 그리기 — 뜨거울수록 밝게' },
    ],
    goal: '{target}에 열 지도를 겹쳐 줘 — 누른 자리마다 번짐이 쌓여 많이 눌린 곳이 빨강 · 흰빛으로 뜨겁게, 색 사다리 범례와 누른 횟수가 보이게. 분위기는 {style}.',
    targets: ['게임 화면 누른 자리 기록', '확률 분포 실험 결과', '지도 위 방문 빈도'],
    styles: ['어두운 바탕 형광 열빛', '밝은 화면 위 반투명', '보랏빛 마그마 색'],
    platforms: ['canvas', 'web', 'three'],
    principle: [
      '화면을 120×75 작은 격자로 두고, 점 하나가 오면 둘레 칸에 exp(−거리² / (반경² × 0.5)) 를 더한다 (가우스 번짐).',
      '격자의 가장 큰 값 peak 로 나눠 0~1 로 맞추고, 0.7 제곱으로 약한 곳도 보이게 한 뒤 색 사다리(검정 → 파랑 → 초록 → 노랑 → 주황 → 흰빛)에서 색을 고른다.',
      '알파도 세기에 비례하게 해서 차가운 곳은 투명 — 아래 화면이 비친다.',
      '작은 격자 그림을 화면 크기로 부드럽게 늘려(imageSmoothing) lighter 로 더해 그린다.',
      'peak 는 lerp(peak, 지금 최대, 0.08) 로 천천히 따라가 색이 깜박이지 않게 한다.',
    ],
    when: ['사람들이 어디를 많이 눌렀나 · 많이 갔나를 보일 때', '확률 실험 결과를 분포로 보일 때', '지도 위 사건 빈도'],
    avoid: ['지역마다 하나의 값 — 대신 등치 지도(i277)', '점이 몇 개뿐일 때 — 점을 그대로 찍는 편이 읽기 쉽다'],
    cost: 'light',
    costNote: '점 하나 = 둘레 (4·반경)² 칸 더하기. 9천 칸 격자를 프레임마다 색칠해도 가볍고, 늘려 그리기는 GPU 가 한다.',
    level: 1,
    must: [
      '번짐은 작은 격자(Float32Array)에 쌓고, 화면 크기로 늘려 그리기 — 화면 픽셀마다 계산하지 않기',
      '색 세기는 가장 큰 값으로 나눠 맞추되, 그 최댓값은 천천히 따라가게(lerp 0.08)',
      '차가운 곳은 투명하게 — 아래 화면 요소가 보여야 한다',
      '번짐 반경 · 누르는 빠르기 · 누른 점 보기 · 색 사다리를 바꿀 수 있게',
    ],
    done: [
      '「시작」 단추 자리가 가장 뜨겁고(흰빛), 드물게 누른 곳은 파랗게 옅다',
      '번짐 반경을 키우면 뜨거운 곳이 넓고 부드러워지고, 줄이면 점처럼 또렷하다',
      '누를 때마다 작은 고리가 퍼지고 열 지도가 조금씩 자란다',
      '색 사다리 범례 「적게 → 많이」가 화면 색과 맞다',
    ],
    code: {
      lang: 'ts',
      title: '가우스 번짐 쌓기 + 색 사다리로 칠해 늘려 그리기',
      from: 'demos/demosMapB.ts i278 addPoint · draw() 를 정리',
      body: `const GW = 120, GH = 75;
const heat = new Float32Array(GW * GH);
const small = document.createElement('canvas');
small.width = GW; small.height = GH;
const sg = small.getContext('2d')!, img = sg.createImageData(GW, GH);
let peak = 1;
// 점 하나 (x, y 는 0~1) → 둘레에 가우스 번짐 더하기
function addPoint(x: number, y: number, R = 4) {
  const gx = x * GW, gy = y * GH;
  for (let yy = Math.floor(gy - R * 2); yy <= gy + R * 2; yy++)
    for (let xx = Math.floor(gx - R * 2); xx <= gx + R * 2; xx++) {
      if (xx < 0 || yy < 0 || xx >= GW || yy >= GH) continue;
      const d2 = (xx + 0.5 - gx) ** 2 + (yy + 0.5 - gy) ** 2;
      heat[yy * GW + xx] += Math.exp(-d2 / (R * R * 0.5));
    }
}
// 매 프레임: 최댓값으로 나눠 색칠 → 늘려 더해 그리기
function drawHeat(g: CanvasRenderingContext2D, x0: number, y0: number, W: number, H: number, ramp: RGB[]) {
  let mx = 0;
  for (let i = 0; i < heat.length; i++) if (heat[i] > mx) mx = heat[i];
  peak = Math.max(peak + (mx - peak) * 0.08, 1);  // 천천히 따라가 깜박임 막기
  const d = img.data;
  for (let i = 0; i < heat.length; i++) {
    const kk = Math.pow(Math.min(1, heat[i] / peak), 0.7); // 약한 곳도 보이게
    const c = rampAt(ramp, kk);
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2];
    d[i * 4 + 3] = Math.min(1, kk * 1.6) * 215;            // 차가운 곳은 투명
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'lighter';
  g.drawImage(small, x0, y0, W, H);
  g.globalCompositeOperation = 'source-over';
}`,
    },
    pitfalls: [
      { title: '화면 픽셀마다 모든 점과의 거리를 재면 점이 늘수록 느려진다', fix: '작은 격자에 번짐을 미리 더해 두고, 그림만 늘려 그린다.' },
      { title: '그때그때 최댓값으로 나누면 새 점이 올 때마다 전체 색이 출렁인다', fix: '최댓값을 lerp 로 천천히 따라가게 한다.' },
      { title: '알파를 늘 불투명으로 두면 아래 화면이 가려진다', fix: '세기에 비례한 알파로 차가운 곳은 투명하게.' },
    ],
    prev: ['i277'],
    next: ['i271'],
    refs: [{ name: 'Wikipedia — Kernel density estimation', url: 'https://en.wikipedia.org/wiki/Kernel_density_estimation' }],
  },

  i279: {
    id: 'i279',
    summary: '지형 높이를 셰이더에서 간격으로 나눠 높이별 색 띠와 늘 같은 굵기의 등고선을 그리고, 오르내리는 물 높이와 만나는 선을 빛나게 한다.',
    terms: [
      { en: 'Contour lines in fragment shader (fract + fwidth)', ko: '높이 ÷ 간격의 소수 부분으로 등고선' },
      { en: 'Hypsometric tinting (elevation bands)', ko: '높이별 색 띠' },
      { en: 'Index contour', ko: '다섯 줄마다 굵은 계곡선' },
      { en: 'three.js ShaderMaterial', ko: '직접 짠 셰이더 재질' },
    ],
    goal: '{target}에 등고선 3D 지형을 만들어 줘 — 높이별 색 띠와 늘 같은 굵기의 등고선(다섯 줄마다 굵게), 옆면 지층 단면, 오르내리는 물 높이와 만나는 빛나는 선이 보이고, 위에서 보면 등고선 지도가 되게. 분위기는 {style}.',
    targets: ['산 · 언덕 지형', '등고선 읽기 체험', '지도 위 높이 표현'],
    styles: ['어두운 바탕 지형 모형', '밝은 교과서 지도 색', '종이 지형도'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 에서 Position.y ÷ 간격 → Fraction · DDXY(fwidth) 로 같은 선을 그린다.',
      godot: 'Godot 은 spatial 셰이더에서 VERTEX.y 를 varying 으로 넘겨 fract · fwidth 로 그린다.',
    },
    principle: [
      '150×150 조각 평면의 정점 높이를 언덕 두 개(가우스) + 잡음으로 정하고, 옆면 네 변을 바닥까지 막아 단면을 만든다.',
      '조각 셰이더에서 lv = 높이 ÷ 간격. 색 띠는 floor(lv) 단계의 가운데 높이로 색 사다리에서 고른다 (끄면 높이 그대로 부드럽게).',
      '등고선: lv 의 정수에서 얼마나 떨어졌나를 fwidth(lv) 로 나누면 화면 픽셀 단위 거리 — 그래서 가까이서도 멀리서도 같은 굵기.',
      '정수 lv 가 5 의 배수면 굵은 계곡선(1.6px), 나머지는 0.9px.',
      '물 높이 uSlice 와의 차이 ÷ fwidth(높이) 가 작은 곳을 노랗게 빛내면, 물이 오르내릴 때 「등고선 한 줄 = 같은 물 높이」가 보인다.',
    ],
    when: ['등고선 지도 읽기를 입체로 보여 줄 때', '지형 높이를 색 띠로 읽게 할 때', '높이 과장 · 위에서 보기를 비교할 때'],
    avoid: ['2D 지도의 등고선만 필요할 때 — 대신 마칭 스퀘어(i259)', '귀여운 블록 섬 — 대신 디오라마 지도(i275)'],
    cost: 'light',
    costNote: '정점 약 2만 3천 개 평면 하나 + 조각 셰이더의 나눗셈 · fract · fwidth 몇 번뿐. 반복문 · 잡음이 셰이더에 없어 컴파일도 빠르다.',
    level: 2,
    must: [
      '등고선 굵기는 fwidth 로 나눠 화면 픽셀 기준으로 (월드 단위 굵기면 멀리서 사라지고 가까이서 뭉툭)',
      '잡음은 CPU 에서 정점 높이로 한 번만 — 셰이더 안에 잡음 반복문 넣지 않기',
      '색 띠 · 높이 과장(uExag) · 간격은 uniform 으로 — 바꿔도 셰이더를 다시 컴파일하지 않게',
      '옆면(지층 단면)은 같은 셰이더에 uSide 로 등고선을 끄고 줄무늬만',
      '물 높이 판은 반투명 · depthWrite: false',
    ],
    done: [
      '산에 높이별 색 띠와 가는 등고선, 다섯 줄마다 굵은 선이 보인다',
      '카메라가 다가가거나 멀어져도 등고선 굵기가 같다',
      '물 높이가 오르내리면 물과 만나는 노란 선이 등고선을 따라 움직인다',
      '「위에서 보기」를 켜면 그대로 등고선 지도가 된다',
    ],
    code: {
      lang: 'glsl',
      title: '조각 셰이더 — 높이 띠 + 같은 굵기 등고선 + 물 높이 선',
      from: 'demos/demosMapB.ts i279 fs 를 정리 (ramp 는 같은 셰이더의 6색 사다리)',
      body: `uniform float uInterval;   // 등고선 간격 (0.25)
uniform float uBands;      // 1 = 색 띠
uniform float uSlice;      // 물 높이
uniform float uMaxH;
uniform vec3 uLight;
uniform float uSide;       // 1 = 옆면 단면
varying float vH;          // 정점 셰이더가 넘긴 원래 높이
varying vec3 vN;
void main() {
  float lv = vH / uInterval;
  float band = floor(lv);
  float k = uBands > 0.5 ? (band + 0.5) * uInterval / uMaxH : vH / uMaxH;
  vec3 col = ramp(k);
  if (uSide > 0.5) col *= 0.75 + 0.1 * step(0.5, fract(lv * 0.5)); // 옆면 지층 줄무늬
  col *= 0.45 + 0.75 * max(dot(normalize(vN), uLight), 0.0);
  // 등고선: 정수까지 거리 ÷ fwidth = 화면 픽셀 거리 → 늘 같은 굵기
  float f = abs(fract(lv - 0.5) - 0.5) / max(fwidth(lv), 1e-4);
  bool idx = mod(floor(lv + 0.5), 5.0) < 0.5;       // 다섯 줄마다 굵게
  float wdt = idx ? 1.6 : 0.9;
  float line = 1.0 - smoothstep(wdt - 0.6, wdt + 0.6, f);
  if (uSide < 0.5 && vH > 0.02) col = mix(col, idx ? vec3(0.25, 0.14, 0.07) : vec3(0.36, 0.22, 0.12), line * (idx ? 0.95 : 0.7));
  // 물 높이와 만나는 빛나는 선
  float sd = abs(vH - uSlice) / max(fwidth(vH), 1e-4);
  col = mix(col, vec3(1.0, 0.95, 0.55), 1.0 - smoothstep(0.5, 2.5, sd));
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '등고선 굵기를 월드 단위로 정하면 멀리서는 사라지고 가까이서는 뭉툭하다', fix: 'fwidth(lv) 로 나눠 화면 픽셀 기준 굵기로 그린다.' },
      { title: '셰이더 안에서 잡음을 반복해 부르면 윈도에서 컴파일이 수십 초 멈춘다', fix: '높이는 CPU 에서 정점에 한 번 구워 넣고, 셰이더는 그 높이만 읽는다.', seen: true },
      { title: '높이 과장을 정점 y 에만 곱하면 빛(법선)이 어긋난다', fix: '견본처럼 법선 x · z 에도 과장 값을 곱해 다시 normalize 한다.' },
      { title: '평평한 바닥(높이 0 근처)에 등고선이 지저분하게 깔린다', fix: '높이 0.02 이하는 등고선을 그리지 않는다.' },
    ],
    prev: ['i259', 'i275'],
    next: ['i261'],
    refs: [{ name: 'Wikipedia — Contour line', url: 'https://en.wikipedia.org/wiki/Contour_line' }],
  },

  /* ───────── 원리 설명 · 구조 ───────── */

  i39: {
    id: 'i39',
    summary: '각도 θ 하나로 3D 피스톤과 옆 그래프를 함께 움직이고, 3D 피스톤 높이와 그래프 위 점을 선으로 이어 「같은 값」임을 보여 준다.',
    terms: [
      { en: 'Linked views (3D model + graph)', ko: '3D 와 그래프를 같은 값으로 묶기' },
      { en: 'Single source of truth parameter', ko: '값 하나(θ)에서 모든 그림이 나온다' },
      { en: 'Vector3.project (world → screen)', ko: '3D 점을 화면 좌표로 바꿔 2D 그림과 맞추기' },
      { en: 'Slider-crank kinematics', ko: '크랭크 · 커넥팅 로드 · 피스톤 위치 식' },
    ],
    goal: '{target}을(를) 3D 와 그래프로 나란히 보여 줘 — 값 하나(각도)로 둘이 함께 움직이고, 3D 의 그 높이와 그래프 위 지금 점이 선으로 이어지게. 분위기는 {style}.',
    targets: ['엔진 피스톤 위치', '진자 · 용수철 흔들림', '바퀴 위 한 점의 높이'],
    styles: ['어두운 남색 바탕 + 노란 곡선', '밝은 교과서 그림', '모눈종이 그래프'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    principle: [
      '모든 그림은 각도 θ 하나에서 나온다: 3D 엔진은 eng.set(θ) 로 크랭크 · 로드 · 피스톤을 놓고, 그 결과 피스톤 높이 yp 를 돌려준다.',
      '피스톤 높이 식: yp = r·cos θ + √(L² − r²·sin² θ) (r = 크랭크 반지름, L = 로드 길이). 비교용 점선은 L + r·cos θ (순수 사인꼴).',
      '그래프 세로 눈금을 3D 와 맞추려고, 피스톤의 가장 높은 · 낮은 높이를 Vector3.project 로 화면 y 로 바꿔 그래프의 위 · 아래로 쓴다.',
      '지금 θ 의 그래프 점과 3D 피스톤 윗면의 화면 위치를 점선으로 이으면, 「3D 의 이 높이 = 그래프의 이 점」이 바로 보인다.',
      '「저절로 돌리기」를 끄면 슬라이더 θ 가 그대로 둘 다를 움직인다.',
    ],
    when: ['움직이는 기계 · 물리를 식 · 그래프와 함께 설명할 때', '「이 곡선이 무엇을 뜻하나」를 보여 줄 때', '슬라이더 하나로 원인과 결과를 같이 보여 줄 때'],
    avoid: ['값이 여러 개라 한 그래프로 못 보일 때 — 그래프를 나누거나 단계 이야기(i45)로', '3D 가 꼭 필요 없을 때 — 2D 그림 + 그래프가 더 가볍다'],
    cost: 'light',
    costNote: '3D 엔진 부품 몇 개 + 2D 곡선 점 200개 둘. 3D 는 공용 렌더러로 그려 2D 캔버스에 붙인다(drawImage).',
    level: 1,
    must: [
      '값은 θ 하나만 들고, 3D · 그래프 · 글씨가 모두 그 값에서 계산되게 (따로 시간을 재지 않기)',
      '그래프 세로 눈금 = 3D 피스톤의 화면 높이 (project 로 맞추기)',
      '3D 피스톤 ↔ 그래프 점을 잇는 점선, 지금 θ 를 도(°)로 표시',
      '실제 곡선과 비교 곡선(사인)을 함께 — 차이가 보이게',
      '첫 장면은 compileAsync 로 셰이더를 굽고 나서 그리기 (첫 프레임 멈춤 막기)',
    ],
    done: [
      '피스톤이 오르내리는 높이와 그래프 위 빨간 점의 높이가 늘 같다',
      '슬라이더로 θ 를 끌면 3D 와 그래프가 함께 멈추고 함께 움직인다',
      '노란 실제 곡선과 흰 점선 사인 곡선이 거의 겹치지만 꼭대기 · 바닥 모양이 조금 다르다',
      '화면 비율이 바뀌어도 그래프 눈금이 3D 높이와 맞는다',
    ],
    code: {
      lang: 'ts',
      title: 'θ 하나 → 3D 피스톤 + 그래프 점 + 잇는 선',
      from: 'demos/demosStructure.ts makeEngine set() · i39 update() 를 정리',
      body: `import * as THREE from 'three';
// 1) 3D: 각도 하나로 크랭크 · 로드 · 피스톤 놓기
const set = (theta: number): number => {
  crank.rotation.z = -theta;
  const px = r * Math.sin(theta), py = r * Math.cos(theta);
  const yp = r * Math.cos(theta) + Math.sqrt(L * L - r * r * Math.sin(theta) ** 2); // 피스톤 높이
  rod.position.set(px / 2, (py + yp) / 2, 0.24);
  rod.rotation.z = Math.atan2(px, yp - py);
  piston.position.y = yp + 0.25;
  return yp;
};
// 2) 매 프레임: 같은 θ 로 3D 와 그래프
const yp = set(th);
cam.updateMatrixWorld();
const scr = (yy: number) => ((1 - new THREE.Vector3(0, yy + offY, 0).project(cam).y) / 2) * h; // 3D 높이 → 화면 y
const sTop = scr(L + r), sBot = scr(L - r);
const Y = (v: number) => sBot + (sTop - sBot) * ((v - (L - r)) / (2 * r)); // 그래프 눈금 = 3D 눈금
const span = Math.PI * 4;
const X = (a: number) => gx0 + (gx1 - gx0) * ((a % span) / span);
g.beginPath();
for (let k = 0; k <= 200; k++) {
  const a = (k / 200) * span;
  const v = r * Math.cos(a) + Math.sqrt(L * L - r * r * Math.sin(a) ** 2);
  if (k) g.lineTo(X(a), Y(v)); else g.moveTo(X(a), Y(v));
}
g.strokeStyle = '#ffc23a'; g.lineWidth = 3; g.stroke();
// 3) 3D 피스톤 윗면 ↔ 그래프 점 잇기
const a = ((th % span) + span) % span;
const pistonX = ((new THREE.Vector3(0.45, pistonTop + offY, 0).project(cam).x + 1) / 2) * leftW;
g.setLineDash([3, 4]); g.strokeStyle = '#ff6b8b';
g.beginPath(); g.moveTo(pistonX, scr(pistonTop)); g.lineTo(X(a), Y(yp)); g.stroke();
g.setLineDash([]);`,
    },
    pitfalls: [
      { title: '3D 와 그래프가 각자 시간을 재면 조금씩 어긋난다', fix: '값 θ 하나만 들고 둘 다 그 값에서 계산한다.' },
      { title: '그래프 세로 눈금을 따로 정하면 3D 피스톤 높이와 안 맞는다', fix: '피스톤 최고 · 최저 높이를 project 로 화면 y 로 바꿔 그래프 눈금으로 쓴다.' },
      { title: '공용 렌더러로 처음 그릴 때 셰이더 컴파일로 1~2초 멈춘다', fix: '견본처럼 처음엔 compileAsync 만 하고 끝난 뒤부터 그린다.', seen: true },
    ],
    prev: ['i38'],
    next: ['i45', 'i40'],
    refs: [{ name: 'Distill — Why Momentum Really Works (연동 그림 예)', url: 'https://distill.pub/2017/momentum/' }],
  },

  i43: {
    id: 'i43',
    summary: '겹친 공 껍질을 바깥부터 한 겹씩 투명하게 바꿔, 지각 → 맨틀 → 외핵 → 내핵처럼 속 구조를 슬라이더 하나로 벗겨 본다.',
    terms: [
      { en: 'Layer peeling (cutaway by transparency)', ko: '바깥 층부터 투명하게 벗기기' },
      { en: 'Transparent sorting (renderOrder · depthWrite)', ko: '투명 층 그리는 순서 · 깊이 쓰기 끄기' },
      { en: 'Nested shells', ko: '크기가 다른 껍질을 겹쳐 둔 모형' },
    ],
    goal: '{target}을(를) 층 벗기기로 보여 줘 — 바깥 껍질부터 한 겹씩 투명해지며 속 층이 드러나고, 옆에 층 이름과 남은 불투명도(%) 막대가 보이게. 분위기는 {style}.',
    targets: ['지구 내부 (지각 · 맨틀 · 핵)', '인체 (피부 · 근육 · 뼈)', '꽃 · 과일 단면 구조'],
    styles: ['어두운 우주 바탕', '밝은 교과서 모형', '빛나는 속 (발광 핵)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 층마다 재질 Surface Type = Transparent 로 두고 Alpha 를 바꾸며, Render Queue 로 그리는 순서를 정한다.',
      godot: 'Godot 은 StandardMaterial3D transparency = Alpha, render_priority 로 순서를 정한다.',
    },
    principle: [
      '반지름이 다른 공 네 개(1 · 0.88 · 0.55 · 0.3)를 겹쳐 둔다. 바깥은 지구 무늬, 안쪽은 붉은 맨틀 · 주황 외핵 · 빛나는 내핵(emissive).',
      '「벗긴 층 수」 peel 은 0 ~ 3 의 실수. 층 i 의 불투명도 = 1 − clamp(peel − i, 0, 1) × 0.92 — 한 층이 다 벗겨진 뒤 다음 층이 벗겨진다.',
      '거의 다 벗긴 층도 8% 는 남겨 윤곽이 보인다. 가장 안쪽(내핵)은 늘 불투명.',
      '투명 층은 바깥이 나중에 그려지도록 renderOrder = 10 − i, 불투명도가 0.97 아래면 depthWrite 를 꺼 안쪽이 가려지지 않게 한다.',
    ],
    when: ['겉으로 안 보이는 속 구조를 설명할 때', '층 · 껍질이 차례로 있는 대상 (지구 · 몸 · 양파)', '슬라이더 하나로 겹겹이 보여 주고 싶을 때'],
    avoid: ['한 단면만 보면 될 때 — 잘라 낸 단면(클리핑 평면)이 더 또렷하다', '부품이 옆으로 흩어져야 할 때 — 대신 분해도(i36)'],
    cost: 'light',
    costNote: '공 4개(48×32 조각). 투명 층이 겹쳐 같은 픽셀을 4번 칠하지만 화면 일부라 폰도 가볍다.',
    level: 2,
    must: [
      '층마다 따로 재질 (transparent: true) — 같은 재질을 나눠 쓰지 않기',
      '벗기기는 바깥 층부터 차례로 (peel − i 를 0~1 로 잘라 쓰기)',
      '불투명할 때만 depthWrite, 투명해지면 끄기 · renderOrder 로 바깥을 나중에',
      '옆에 층 이름 · 불투명도 % 막대, 슬라이더 「벗긴 층 수」와 저절로 켬/끔',
    ],
    done: [
      '슬라이더를 0 → 3 으로 끌면 지각 → 맨틀 → 외핵 차례로 투명해지고 빛나는 내핵이 드러난다',
      '벗겨진 층도 옅은 윤곽이 남아 크기 비교가 된다',
      '투명한 층 뒤로 안쪽 층이 깨지거나 사라지는 곳이 없다',
      '층 막대의 % 가 실제 투명도와 같이 줄어든다',
    ],
    code: {
      lang: 'ts',
      title: '겹친 껍질 + 바깥부터 차례로 투명하게',
      from: 'demos/demosStructure.ts i43 make() 를 정리',
      body: `import * as THREE from 'three';
const layers = [
  { name: '지각', r: 1.0, mat: new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.7, transparent: true }) },
  { name: '맨틀', r: 0.88, mat: new THREE.MeshStandardMaterial({ color: 0xd8502a, emissive: 0x6a1a08, roughness: 0.6, transparent: true }) },
  { name: '외핵', r: 0.55, mat: new THREE.MeshStandardMaterial({ color: 0xffa23a, emissive: 0xa04a00, roughness: 0.5, transparent: true }) },
  { name: '내핵', r: 0.3, mat: new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd060, emissiveIntensity: 0.8, roughness: 0.4, transparent: true }) },
];
const earth = new THREE.Group();
layers.forEach((L, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(L.r, 48, 32), L.mat);
  m.renderOrder = 10 - i; // 바깥 층을 나중에 그린다
  earth.add(m);
});
scene.add(earth);

// peel: 0 ~ 3 (벗긴 층 수, 슬라이더 또는 자동)
function setPeel(peel: number) {
  layers.forEach((L, i) => {
    const o = i < 3 ? 1 - Math.min(1, Math.max(0, peel - i)) * 0.92 : 1; // 8% 는 윤곽으로 남김
    L.mat.opacity = o;
    L.mat.depthWrite = o > 0.97; // 투명해지면 깊이를 안 써서 안쪽이 보이게
  });
}`,
    },
    pitfalls: [
      { title: '투명 층이 깊이를 쓰면 안쪽 층이 통째로 안 보인다', fix: '불투명도가 1 아래로 내려가면 depthWrite 를 끈다.' },
      { title: '그리는 순서가 섞여 투명 층이 깜박이거나 안쪽이 바깥 위에 그려진다', fix: 'renderOrder 로 안쪽부터 바깥 순서를 고정한다.' },
      { title: '완전히 0 까지 투명하게 하면 층 크기를 비교할 수 없다', fix: '0.08 정도 남겨 옅은 윤곽을 둔다.' },
    ],
    prev: ['i38'],
    next: ['i36', 'i45'],
    refs: [{ name: 'Zygote Body (층 벗기기 예)', url: 'https://www.zygotebody.com/' }],
  },

  i44: {
    id: 'i44',
    summary: '날개 둘레 흐름 식(주코프스키 변환)으로 칸마다 속도를 구해 공기 알갱이 520개를 흘리고, 빠르기에 따라 노랑 · 흰 · 파랑 꼬리선으로 그린다.',
    terms: [
      { en: 'Particle flow visualization (streaklines)', ko: '알갱이를 흘려 꼬리로 흐름 보이기' },
      { en: 'Joukowski airfoil (potential flow)', ko: '원 둘레 흐름을 날개 모양으로 바꾸는 식' },
      { en: 'Midpoint (RK2) integration', ko: '반 걸음 앞 속도로 한 걸음 — 오일러보다 정확' },
      { en: 'three.js LineSegments + vertexColors', ko: '꼬리 선분 수천 개를 한 번에 · 선마다 색' },
    ],
    goal: '{target} 둘레 흐름을 입자 꼬리로 보여 줘 — 알갱이 수백 개가 속도장을 따라 흐르고 빠른 곳은 노랑 · 느린 곳은 파랑으로, 받음각을 바꾸면 흐름이 바로 바뀌게. 분위기는 {style}.',
    targets: ['비행기 날개', '제트엔진 · 관 속 공기', '심장 · 혈관 피 흐름'],
    styles: ['어두운 남색 바탕 빛나는 꼬리', '밝은 교과서 화살표', '풍동 실험 연기'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 VFX Graph 의 Vector Field 또는 Particle System 의 External Forces · Trails 로 비슷하게 만든다.',
      godot: 'Godot 은 GPUParticles3D + ParticleProcessMaterial 의 turbulence · trail 로 만들 수 있다.',
    },
    principle: [
      '날개 둘레 공기 속도는 「원 둘레 흐름 + 소용돌이(순환)」를 주코프스키 변환 z = ζ + 1/ζ 로 날개 모양에 옮긴 식으로 계산한다 (견본은 복소수 곱 · 나눗셈 · 제곱근을 직접 씀).',
      '알갱이는 원 평면(ζ) 좌표로 들고 다니며 한 프레임을 3번 나눠 중간점(RK2)으로 옮긴다 — 날개 앞 빠른 곳에서도 튀지 않는다.',
      '화면 밖으로 나가거나 날개 안으로 들어간 알갱이는 왼쪽 끝에서 다시 태어난다.',
      '알갱이마다 꼬리 점 12개를 두 프레임마다 한 칸씩 밀어, 선분 11개를 LineSegments 하나에 모아 그린다. 색은 빠르기(0.82 ~ 1.42)로 파랑 → 흰 → 노랑, 꼬리 끝으로 갈수록 어둡게.',
      '받음각을 바꾸면 날개 모양을 다시 만들고 알갱이를 다시 뿌린다.',
    ],
    when: ['공기 · 물 · 피처럼 안 보이는 흐름을 보여 줄 때', '빠른 곳 · 느린 곳(압력 차)을 색으로 설명할 때', '속도장이 식으로 주어질 때'],
    avoid: ['흐름이 서로 밀고 당기며 바뀌어야 할 때 — 대신 GPU 유체(i46)', '알갱이가 수만 개 — CPU 계산 대신 GPU(셰이더) 입자로'],
    cost: 'medium',
    costNote: '알갱이 520 × 한 프레임 3걸음 × 속도 계산 2번 ≈ 3,100번 복소수 계산 + 꼬리 선분 5,720개 버퍼 갱신. PC 는 가볍고 폰은 알갱이 수를 줄이면 된다.',
    level: 3,
    must: [
      '속도는 식으로 바로 계산 (격자 없이), 적분은 중간점(RK2)으로 한 프레임을 여러 번 나눠서',
      '한 걸음 크기는 dt 를 0.05 로 잘라 너무 크지 않게, 속도가 너무 크면(4 넘음) 줄이기',
      '꼬리 선분은 LineSegments 하나 + vertexColors — 알갱이마다 Line 객체를 만들지 않기',
      '화면 밖 · 날개 안 알갱이는 다시 뿌리기',
      '받음각 슬라이더, 빠름 · 보통 · 느림 색 범례',
    ],
    done: [
      '알갱이가 날개 위 · 아래로 갈라져 흐르고, 날개 위쪽이 노랗게(빠르게) 보인다',
      '받음각을 키우면 위 · 아래 빠르기 차이가 커지고, 음수로 하면 반대가 된다',
      '알갱이가 날개를 뚫고 지나가지 않는다',
      '꼬리선이 끊김 없이 부드럽게 흐른다',
    ],
    code: {
      lang: 'ts',
      title: '중간점 적분으로 알갱이 옮기기 + 꼬리 선분 버퍼 채우기',
      from: 'demos/demosStructure.ts i44 update() 를 정리 (vel · toDisplay · spawn 은 같은 견본의 주코프스키 식)',
      body: `import * as THREE from 'three';
const N = 520, TR = 12;
const pos = new Float32Array(N * (TR - 1) * 6), col = new Float32Array(N * (TR - 1) * 6);
const lg = new THREE.BufferGeometry();
lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 })));
const slow = new THREE.Color(0x4a8bff), mid = new THREE.Color(0xf4f8ff), fast = new THREE.Color(0xffb52e), cc = new THREE.Color();

function update(dt: number, frame: number) {
  const step = Math.min(dt, 0.05) * 1.6;
  for (let i = 0; i < N; i++) {
    const p = P[i];
    for (let k = 0; k < 3; k++) {             // 한 프레임을 3번 나눠
      const h = step / 3;
      const [v1] = vel(p.z);
      const zm: [number, number] = [p.z[0] + v1[0] * h * 0.5, p.z[1] + v1[1] * h * 0.5];
      const [v2, sp] = vel(zm);                // 반 걸음 앞 속도로
      p.z = [p.z[0] + v2[0] * h, p.z[1] + v2[1] * h];
      p.sp = sp;
    }
    const D = toDisplay(p.z);
    if (D[0] > 4.4 || Math.abs(D[1]) > 2.6 || insideWing(p.z) || !Number.isFinite(D[0])) { P[i] = spawn(false); continue; }
    if (frame % 2 === 0) { p.trail.pop(); p.trail.unshift([D[0], D[1]]); } else p.trail[0] = [D[0], D[1]];
  }
  let o = 0;
  for (const p of P) {
    const k = Math.min(1, Math.max(0, (p.sp - 0.82) / 0.6)); // 빠르기 → 0~1
    if (k < 0.4) cc.copy(slow).lerp(mid, k / 0.4); else cc.copy(mid).lerp(fast, (k - 0.4) / 0.6);
    for (let s = 0; s < TR - 1; s++) {
      const a = p.trail[s], b = p.trail[s + 1], fade = 1 - s / (TR - 1);
      pos.set([a[0] * SC, a[1] * SC, p.depth, b[0] * SC, b[1] * SC, p.depth], o * 6);
      col.set([cc.r * fade, cc.g * fade, cc.b * fade, cc.r * fade * 0.7, cc.g * fade * 0.7, cc.b * fade * 0.7], o * 6);
      o++;
    }
  }
  lg.attributes.position.needsUpdate = true;
  lg.attributes.color.needsUpdate = true;
}`,
    },
    pitfalls: [
      { title: '오일러(속도 × dt 한 번)로 옮기면 빠른 곳에서 알갱이가 날개 속으로 튄다', fix: '중간점(RK2)으로, 한 프레임을 3번 나눠 옮기고 속도 크기에 상한을 둔다.' },
      { title: '알갱이마다 THREE.Line 을 만들면 그리기 호출이 수백 번이다', fix: '모든 꼬리를 LineSegments 하나의 버퍼에 넣고 정점 색으로 칠한다.' },
      { title: '화면 밖으로 나간 알갱이를 그대로 두면 흐름이 점점 비어 간다', fix: '나가거나 날개 안에 든 알갱이는 바로 왼쪽 끝에서 다시 태어나게 한다.' },
    ],
    prev: ['i39'],
    next: ['i46'],
    refs: [
      { name: 'Bartosz Ciechanowski — Airfoil', url: 'https://ciechanow.ski/airfoil/' },
      { name: 'Wikipedia — Joukowsky transform', url: 'https://en.wikipedia.org/wiki/Joukowsky_transform' },
    ],
  },

  i45: {
    id: 'i45',
    summary: '설명을 단계 목록(이름 · 글 · 카메라 자리 · 색)으로 적어 두고 「다음」을 누르면 카메라 · 부품 · 글이 그 단계로 부드럽게 넘어가게 한다.',
    terms: [
      { en: 'Step-by-step explainer (scrollytelling)', ko: '단계마다 장면이 진행되는 설명' },
      { en: 'Data-driven steps (step table)', ko: '단계를 데이터 표로 적고 화면은 표를 읽기' },
      { en: 'Camera tween (lerp to target)', ko: '카메라를 다음 자리로 부드럽게' },
    ],
    goal: '{target}을(를) 「다음」 단추로 넘기는 단계 설명으로 만들어 줘 — 단계마다 카메라 · 움직임 · 색 · 설명 글이 바뀌고, 단계 점과 이전/다음 단추가 있게. 분위기는 {style}.',
    targets: ['엔진 한 바퀴 (흡입 · 압축 · 폭발 · 배기)', '실험 순서 설명', '조립 · 원리 단계 설명'],
    styles: ['밝은 교과서 그림', '어두운 무대 조명', '귀여운 그림책'],
    platforms: ['three', 'web', 'unity', 'godot'],
    principle: [
      '단계 표: { 이름, 설명 글, 카메라 위치, 바라볼 곳, 가스 색, 시작 · 끝 불투명도 } 네 줄. 화면은 지금 단계 번호로 이 표만 읽는다.',
      '단계 안 진행 k(0 → 1, 2.4초)로 크랭크를 π·단계 + π·k 만큼 돌려, 네 단계가 이어지면 엔진 두 바퀴(한 순환)가 된다.',
      '카메라 위치 · 바라볼 곳은 단계 목표로 매 프레임 lerp(dt × 2.5) — 단계를 바꾸면 부드럽게 날아간다.',
      '단계마다 할 일만 덧붙인다: 흡입은 파란 밸브 열기, 배기는 빨간 밸브 열기, 폭발은 불꽃 + 점광원 번쩍.',
      '「다음」 · 「이전」을 누르면 12초 동안 자동 넘김을 멈춰 사람이 읽을 시간을 준다.',
    ],
    when: ['한 바퀴 · 한 과정을 차례로 설명할 때 (엔진 · 순환 · 실험)', '읽을 글과 그림을 함께 보여 줄 때', '자동 재생과 손으로 넘기기를 둘 다 쓰고 싶을 때'],
    avoid: ['값 하나로 이어지는 변화 — 대신 슬라이더 연동(i39)', '스크롤이 긴 웹 문서 — 그때는 IntersectionObserver 로 스크롤 단계'],
    cost: 'light',
    costNote: '장면은 하나, 단계마다 바뀌는 것은 카메라 · 색 · 글뿐. 그리기는 단계와 상관없이 같다.',
    level: 2,
    must: [
      '단계는 데이터 표로 — 단계마다 if 로 장면을 새로 만들지 않기',
      '단계를 바꾸면 글 · 단계 점 · 이전/다음 단추만 갈아 끼우기 (화면 전체를 다시 만들지 않기)',
      '카메라는 목표로 부드럽게 (dt 비례 lerp), 화면이 세로로 좁으면 뒤로 물리기',
      '손으로 넘기면 자동 넘김을 잠시(12초) 멈추기',
      '단추는 화면 위 HTML 로 (번역 가능한 글)',
    ],
    done: [
      '「다음」을 누를 때마다 카메라가 부드럽게 옮겨 가고, 단계 이름 · 설명 글 · 점이 바뀐다',
      '흡입에서는 파란 밸브, 배기에서는 빨간 밸브가 열리고, 폭발에서 불꽃이 번쩍인다',
      '가만히 두면 단계가 저절로 넘어가고, 단추를 누르면 한동안 멈춰 있다',
      '폰 세로 화면에서도 글과 단추가 가리지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '단계 표 + 단계 바꾸기 + 매 프레임 진행',
      from: 'demos/demosStructure.ts i45 make() 를 정리',
      body: `import * as THREE from 'three';
const STEPS = [
  { name: '흡입', text: '피스톤이 내려가며 연료 + 공기를 빨아들여요 (파란 밸브 열림)', cam: new THREE.Vector3(-3.6, 1.6, 7.6), look: new THREE.Vector3(0, 0.05, 0), gas: 0x6fc3ff, o0: 0.12, o1: 0.45 },
  { name: '압축', text: '두 밸브를 닫고 피스톤이 올라가 꽉 눌러요', cam: new THREE.Vector3(0, 2.2, 6.4), look: new THREE.Vector3(0, 0.5, 0), gas: 0x3aa0ff, o0: 0.45, o1: 0.8 },
  { name: '폭발', text: '불꽃! 터지는 힘이 피스톤을 세게 밀어 내려요', cam: new THREE.Vector3(2.4, 2.4, 5.6), look: new THREE.Vector3(0, 0.6, 0), gas: 0xff8a3d, o0: 0.85, o1: 0.4 },
  { name: '배기', text: '빨간 밸브가 열리고 타고 남은 가스를 밀어내요', cam: new THREE.Vector3(3.8, 1.2, 7.4), look: new THREE.Vector3(0, 0.05, 0), gas: 0x9a9aa8, o0: 0.4, o1: 0.06 },
];
let step = 0, stepT = 0, hold = 0;
const go = (k: number) => {
  step = (k + STEPS.length) % STEPS.length;
  stepT = 0;
  chip.textContent = (step + 1) + ' / 4  ' + STEPS[step].name; // 바뀌는 글만 갈아 끼우기
  text.textContent = STEPS[step].text;
  dots.forEach((d, i) => (d.style.background = i === step ? '#ff6b3c' : '#c7d2ee'));
};
nextBtn.onclick = () => { hold = 12; go(step + 1); };
prevBtn.onclick = () => { hold = 12; go(step - 1); };

const camPos = STEPS[0].cam.clone(), camLook = STEPS[0].look.clone();
function update(dt: number) {
  stepT += dt;
  hold = Math.max(0, hold - dt);
  const dur = 2.4;
  if (stepT > dur * 2 + 0.6 && hold <= 0) go(step + 1);         // 자동 넘김
  const k = smooth(Math.min(1, (stepT % (dur + 0.6)) / dur));
  const S = STEPS[step];
  eng.set(Math.PI * step + Math.PI * k);                         // 네 단계 = 크랭크 두 바퀴
  gasMat.color.setHex(S.gas);
  gasMat.opacity = S.o0 + (S.o1 - S.o0) * k;
  const open = (on: boolean) => (on ? Math.sin(k * Math.PI) * 0.14 : 0);
  eng.intake.position.y = valveY - open(step === 0);
  eng.exhaust.position.y = valveY - open(step === 3);
  camPos.lerp(S.cam, Math.min(1, dt * 2.5));                     // 카메라는 부드럽게
  camLook.lerp(S.look, Math.min(1, dt * 2.5));
  cam.position.copy(camPos);
  cam.lookAt(camLook);
}`,
    },
    pitfalls: [
      { title: '단계마다 장면을 새로 만들면 넘길 때마다 깜박이고 느리다', fix: '장면은 하나로 두고 단계 표의 값(카메라 · 색 · 글)만 바꾼다.', seen: true },
      { title: '카메라를 단계 자리로 순간 이동시키면 어디가 바뀌었는지 놓친다', fix: '목표로 dt 비례 lerp 해서 날아가게 한다.' },
      { title: '자동 넘김이 계속 돌면 읽던 글이 사라진다', fix: '사람이 단추를 누르면 한동안 자동 넘김을 멈춘다.' },
    ],
    prev: ['i39'],
    next: ['i70', 'i79'],
    refs: [{ name: 'Bartosz Ciechanowski — Internal Combustion Engine', url: 'https://ciechanow.ski/internal-combustion-engine/' }],
  },

  i70: {
    id: 'i70',
    summary: '정사영 카메라 · 흰 단색 재질 · 가는 모서리 선으로 설명서처럼 그리고, 단계마다 이번 부품만 주황으로 떨어뜨리며 지시점 · 평면도 · 축척을 얹는다.',
    terms: [
      { en: 'Instruction manual illustration (axonometric)', ko: '조립 설명서 그림체 (정사영 비스듬 보기)' },
      { en: 'OrthographicCamera', ko: '멀어도 크기가 같은 정사영 카메라' },
      { en: 'EdgesGeometry outline', ko: '각진 모서리만 뽑은 가는 선' },
      { en: 'Single accent color', ko: '이번 단계 부품만 강조색 하나' },
    ],
    goal: '{target}을(를) 설명서 그림체로 보여 줘 — 정사영 카메라 · 흰 단색 세계 · 가는 회색 모서리 선, 단계마다 이번 부품만 주황으로 화살표를 따라 떨어지고, 번호 지시점 · 평면도 · 축척 막대 · 부품 칸이 함께. 분위기는 {style}.',
    targets: ['쌓기나무 탑 조립', '입체도형 · 전개도 조립', '도르래 · 톱니 원리 설명서'],
    styles: ['흰 단색 + 주황 강조', '파란 설계도 선', '연필 스케치'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Camera Projection = Orthographic, 모서리 선은 Edge Detection 후처리나 메시 Edge 선을 따로 만든다.',
      godot: 'Godot 은 Camera3D projection = Orthogonal, 모서리 선은 MeshInstance 에 와이어 선 메시를 덧붙이거나 외곽선 셰이더로.',
    },
    principle: [
      '정사영 카메라를 늘 같은 비스듬 방향 (1, 0.86, 1.1) 에서 30 만큼 떨어뜨려 두고, 단계마다 바라볼 곳 · 화면 크기만 lerp 로 바꾼다 — 2D 그림처럼 깔끔하지만 3D.',
      '모든 부품은 흰 Lambert 재질 + EdgesGeometry(25°) 회색 선. 배경 집 · 나무는 35% 반투명 흰색 + 더 옅은 선.',
      '이번 단계 부품만 주황 재질로 바꾸고, 2.6 위에서 화살표와 함께 bounce 로 떨어져 제자리에 끼운다 (부품마다 0.22초씩 늦게).',
      '지시점 ①② 는 부품 윗점을 project 로 화면 좌표로 바꿔 SVG 선 · 원 · 번호로, 평면도는 위에서 본 칸마다 쌓인 개수를 작은 캔버스에 숫자로.',
      '확대 원은 두 번째 정사영 카메라로 setViewport · setScissor 를 써서 같은 장면의 일부를 원 자리에 한 번 더 그린다.',
    ],
    when: ['조립 · 쌓기 순서를 단계로 설명할 때', '무엇을 봐야 할지 강조해야 하는 원리 설명', '도면처럼 깔끔하면서 돌려 볼 수 있어야 할 때'],
    avoid: ['분위기 · 질감이 중요한 게임 장면 — 평소 그림(색 · 빛)으로', '원근감이 필요한 넓은 풍경 — 정사영은 깊이가 잘 안 느껴진다'],
    cost: 'light',
    costNote: '부품 십여 개 + 모서리 선. 그림자 지도 1장(1024²). 확대 원이 켜진 단계만 한 번 더 그린다.',
    level: 2,
    must: [
      '카메라는 OrthographicCamera, 방향은 고정하고 단계마다 바라볼 곳 · 크기만 부드럽게',
      '세계는 흰 단색, 강조색은 이번 단계 부품에만 하나 (주황) — 여러 색 쓰지 않기',
      '모서리 선은 EdgesGeometry(각도 문턱 25°) — 둥근 면의 잔선이 안 나오게',
      '지시점 · 확대 원 · 축척 막대 · 평면도는 3D 위치를 project 해서 HTML/SVG 로 (글씨 번역 가능)',
      '톤 매핑 끄기(NoToneMapping) · 밝은 반구광으로 흰색이 회색으로 죽지 않게',
    ],
    done: [
      '단계마다 이번 부품만 주황으로 화살표와 함께 떨어져 끼워지고, 지난 부품은 흰색으로 남는다',
      '번호 지시점 ①② 가 부품을 정확히 가리키고, 평면도 숫자가 쌓인 개수와 맞다',
      '「원근 카메라로」를 켜면 축척 막대 글이 바뀌고 먼 쪽이 작아진다 — 정사영과 비교',
      '「평소 그림」을 켜면 색 · 질감 그림으로 바뀌어 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '흰 재질 + 모서리 선 부품, 정사영 카메라, 이번 단계 부품 떨어뜨리기',
      from: 'demos/demosManual.ts make() 의 edged · 카메라 · 부품 부분을 정리',
      body: `import * as THREE from 'three';
renderer.toneMapping = THREE.NoToneMapping;
scene.add(new THREE.HemisphereLight(0xffffff, 0xd4d6da, 2.35));
const white = new THREE.MeshLambertMaterial({ color: 0xf6f6f3 });
const accent = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
const lineM = new THREE.LineBasicMaterial({ color: 0x8c8c88 });
const edged = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineM)); // 25° 넘게 꺾인 모서리만
  return m;
};
// 정사영 카메라 — 방향 고정, 바라볼 곳 · 크기만 단계마다
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const DIR = new THREE.Vector3(1, 0.86, 1.1).normalize();
function placeCam(dt: number, aspect: number) {
  const kk = 1 - Math.exp(-dt * 3);
  cam.target.lerp(cam.toTarget, kk);
  cam.size += (cam.toSize - cam.size) * kk;
  ortho.left = (-cam.size / 2) * aspect; ortho.right = (cam.size / 2) * aspect;
  ortho.top = cam.size / 2; ortho.bottom = -cam.size / 2;
  ortho.position.copy(cam.target).addScaledVector(DIR, 30);
  ortho.lookAt(cam.target);
  ortho.updateProjectionMatrix();
}
// 이번 단계 부품: 주황 + 위에서 통통 떨어져 끼우기
let order = 0;
for (const p of parts) {
  p.mesh.visible = p.step <= step;
  if (p.step !== step) { p.mesh.position.copy(p.home); setMat(p.mesh, white); continue; }
  const k = Math.min(1, Math.max(0, (stepT - 0.25 - order++ * 0.22) / 0.7));
  p.mesh.position.set(p.home.x, p.home.y + (1 - easeBounce(k)) * 2.6, p.home.z);
  setMat(p.mesh, accent);
}
// 지시점: 부품 윗점 → 화면 좌표 → SVG 선 · 원 · 번호
const proj = (v: THREE.Vector3) => { const q = v.clone().project(ortho); return [((q.x + 1) / 2) * w, ((1 - q.y) / 2) * gh]; };`,
    },
    pitfalls: [
      { title: '원근 카메라로 그리면 설명서 느낌이 사라지고 축척 막대가 맞지 않는다', fix: '정사영 카메라를 쓴다. 원근은 비교용으로만.' },
      { title: 'EdgesGeometry 문턱을 낮게 두면 둥근 면에 잔선이 가득하다', fix: '각도 문턱을 25° 쯤으로 둔다.' },
      { title: '강조색을 여러 개 쓰면 무엇을 봐야 할지 흐려진다', fix: '세계는 흰 단색, 이번 단계 부품만 주황 하나.' },
      { title: '확대 원을 그릴 때 setViewport 의 y 를 화면 위에서 재면 엉뚱한 자리에 그려진다', fix: 'WebGL 뷰포트는 아래에서 위로 잰다 — vy = 높이 − (원 위 + 원 크기).' },
    ],
    prev: ['i45'],
    next: ['i36', 'i79'],
    refs: [{ name: 'three.js 문서 — EdgesGeometry', url: 'https://threejs.org/docs/#api/en/geometries/EdgesGeometry' }],
  },

  i79: {
    id: 'i79',
    summary: '손떨림 · 굵기 변화가 있는 마커 선을 길이 비율만큼 그어 펜이 따라가며 그리게 하고, 글씨는 한 글자씩, 장면 끝은 지우개로 지우며 자막과 맞춘다.',
    terms: [
      { en: 'Whiteboard animation (draw-on strokes)', ko: '선이 그려지는 화이트보드 설명 영상' },
      { en: 'Variable-width marker stroke', ko: '시작 · 끝이 가늘고 펜 누름이 흔들리는 선' },
      { en: 'Line boil', ko: '다 그린 선도 0.14초마다 살짝 다시 떨림' },
      { en: 'Hatch fill · caption sync', ko: '지그재그 빗금 색칠 · 낱말 단위 자막' },
    ],
    goal: '{target}을(를) 화이트보드 그리기 애니메이션으로 만들어 줘 — 손떨림 마커 선이 펜을 따라 그려지고, 글씨는 한 글자씩, 빗금 색칠 · 선 살랑임, 장면 끝은 지우개로 쓱쓱, 내레이션 자막이 낱말씩 맞춰 나오게. 분위기는 {style}.',
    targets: ['「왜 그럴까?」 짧은 원리 영상', '수학 이야기 설명', '게임 방법 소개'],
    styles: ['흰 보드 + 검정 · 빨강 · 파랑 마커', '종이 노트 연필', '칠판 분필'],
    platforms: ['canvas', 'web'],
    principle: [
      '그림은 장면 목록: 장면마다 { 길이, 내레이션 글, 요소들(선 · 빗금 · 글씨) }, 요소마다 시작 시각 t0 · 걸리는 시간 dur.',
      '선은 점들에 손떨림(wob)을 더해 Catmull-Rom 으로 2.5 간격 점을 만들고, 누적 길이표를 둔다. 진행 f 만큼의 길이까지만 그리고 그 끝점에 펜을 둔다.',
      '마커 굵기 = 기본 × 시작 가늘기(√) × 끝 빠짐(√) × 누름 흔들림(0.86 + 0.14·sin·sin) — 조각마다 굵기를 바꿔 짧은 선으로 이어 긋는다. 겹선은 같은 선을 한 번 더 반 굵기 · 55% 로.',
      '색칠은 도형을 기울여 일정 간격 가로줄과의 교점을 지그재그로 이은 빗금, 다 그린 선은 0.14초마다 다른 떨림 씨앗(boil 0 · 1 · 2)으로 다시 그려 살아 있는 낙서처럼.',
      '장면 끝에는 굵기 150 의 지그재그 선을 destination-out 으로 그어 지우개처럼 지우고, 자막은 지난 시간 비율만큼 낱말을 보여 준다 (읽어 주기는 speechSynthesis).',
    ],
    when: ['원리 · 이유를 짧은 영상처럼 설명할 때', '그림이 그려지는 과정 자체가 설명이 될 때', '그림 파일 없이 코드만으로 설명 영상을 만들 때'],
    avoid: ['정확한 도형 · 그래프 — 손떨림이 값을 흐린다, 대신 깔끔한 선(i80 SVG 선 그리기)', '사람이 직접 조작해야 하는 체험 — 영상은 보기만 한다'],
    cost: 'light',
    costNote: '선마다 짧은 조각 수백 개를 긋지만 장면 하나에 요소 수십 개라 가볍다. 떨린 선 점은 (요소 · 겹 · boil · 손떨림) 열쇠로 캐시해 다시 계산하지 않는다.',
    level: 2,
    must: [
      '종이 층(한 번 그림)과 잉크 층(매 프레임) 두 캔버스로 나누기',
      '떨린 선 점 목록은 캐시 — 같은 씨앗이면 같은 떨림 (프레임마다 무작위 금지, 선이 지글거린다)',
      '선 살랑임은 0.14초마다 씨앗 3개를 돌려 쓰기 — 다 그린 선에만',
      '펜은 지금 그리는 요소의 끝점에, 그리는 것이 없으면 다음 요소 시작점으로 옮겨 가기',
      '자막 · 읽어 주기(한국어 음성) · 펜 · 겹선 · 빗금 · 손떨림을 켜고 끌 수 있게',
    ],
    done: [
      '선이 시작은 가늘게, 끝은 빠지듯 그려지고 펜 끝이 선 끝을 따라간다',
      '다 그린 그림도 아주 살짝 살랑이며 살아 있는 낙서처럼 보인다',
      '장면 끝에 지우개가 지그재그로 지나가며 그림이 지워지고 다음 장면이 시작된다',
      '자막이 내레이션 길이에 맞춰 낱말씩 늘어난다',
    ],
    code: {
      lang: 'ts',
      title: '손떨림 선 → 길이 비율까지 굵기 변하는 마커로 긋기',
      from: 'demos/whiteboardSketch.ts rough · upTo · marker 를 정리 (catmull · withLen · rng 는 같은 파일)',
      body: `type P = [number, number];
type Poly = { p: P[]; L: number[] }; // 점들 + 누적 길이
// 손떨림 + 살랑임을 얹은 부드러운 선 (같은 seed = 같은 떨림)
function rough(pts: P[], wob: number, seed: number, boil: number, sharp: boolean): Poly {
  const r = rng(seed), r2 = rng(seed * 31 + boil * 977 + 5);
  const q = pts.map(([x, y]) => [x + (r() - 0.5) * wob + (r2() - 0.5) * (boil ? 1.6 : 0),
                                 y + (r() - 0.5) * wob + (r2() - 0.5) * (boil ? 1.6 : 0)] as P);
  return withLen(catmull(q, 2.5, sharp));
}
// 길이 비율 frac 까지의 점 개수와 끝점
function upTo(pl: Poly, frac: number): { n: number; end: P } {
  const want = pl.L[pl.L.length - 1] * frac;
  let i = 1;
  while (i < pl.L.length && pl.L[i] < want) i++;
  if (i >= pl.L.length) return { n: pl.p.length, end: pl.p[pl.p.length - 1] };
  const a = pl.p[i - 1], b = pl.p[i], k = (want - pl.L[i - 1]) / Math.max(1e-6, pl.L[i] - pl.L[i - 1]);
  return { n: i, end: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] };
}
// 굵기가 변하는 마커 선 — 끝점(펜 자리)을 돌려준다
function marker(g: CanvasRenderingContext2D, pl: Poly, frac: number, color: string, w: number, seed: number): P | null {
  if (frac <= 0) return null;
  const { n, end } = upTo(pl, frac);
  const len = pl.L[pl.L.length - 1], ph = seed * 1.7;
  g.strokeStyle = color; g.lineCap = 'round';
  let prev = pl.p[0];
  for (let i = 1; i <= n; i++) {
    const p = i === n ? end : pl.p[i];
    const s = pl.L[Math.min(i, pl.L.length - 1)];
    const t0 = Math.min(1, s / Math.min(14, len * 0.3));                          // 시작은 가늘게
    const t1 = frac >= 1 ? Math.min(1, (len - s) / Math.min(18, len * 0.3)) : 1;  // 끝은 빠지듯
    const press = 0.86 + 0.14 * Math.sin(s * 0.045 + ph) * Math.sin(s * 0.011 + ph * 2); // 펜 누름
    g.lineWidth = Math.max(0.6, w * (0.35 + 0.65 * Math.sqrt(t0)) * (0.3 + 0.7 * Math.sqrt(Math.max(0, t1))) * press);
    g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke();
    prev = p;
  }
  return end;
}
// 매 프레임: f = (장면 시각 − t0) / dur, ease = 1 − (1 − f)^1.5
// const boil = Math.floor(t / 0.14) % 3;  → 다 그린 선만 boil 씨앗으로 다시`,
    },
    pitfalls: [
      { title: '프레임마다 손떨림을 새 무작위로 주면 선이 지글지글 끓는다', fix: '요소마다 씨앗을 고정하고 점 목록을 캐시한다. 살랑임은 0.14초마다 씨앗 3개만 돌린다.' },
      { title: '선 전체를 한 굵기로 그으면 컴퓨터 선처럼 보인다', fix: '짧은 조각마다 시작 가늘기 · 끝 빠짐 · 펜 누름을 곱한 굵기로 긋는다.' },
      { title: '지우개를 clearRect 로 한 번에 지우면 「지우는 맛」이 없다', fix: '굵은 지그재그 선을 destination-out 으로 진행 비율만큼 그어 쓱쓱 지운다.' },
      { title: '읽어 주기가 장면이 바뀐 뒤에도 계속 말한다', fix: '장면이 바뀔 때 speechSynthesis.cancel() 후 새로 말한다.' },
    ],
    prev: ['i45'],
    next: ['i80'],
    refs: [
      { name: 'MDN — CanvasRenderingContext2D.globalCompositeOperation', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' },
      { name: 'MDN — SpeechSynthesisUtterance', url: 'https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance' },
    ],
  },
};

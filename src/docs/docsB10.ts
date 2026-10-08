import type { TechDoc } from './types';

/**
 * 기술 문서 B10 — 손그림 그림체 (i331 ~ i339) · CSS · 화면 틀 (u61 ~ u74) · 물리 · 시뮬레이션 (u48 · i24 · i40 · i46 ~ i50)
 * · 수학 시각화 기법 (i362 · i365 · i380 · i382) · 원리 설명 · 구조 (i35 ~ i38)
 */
export const DOCS: Record<string, TechDoc> = {
  /* ───────── 손그림 그림체 (2D) ───────── */

  i331: {
    id: 'i331',
    summary: '어두운 곳일수록 점을 많이 뿌린 뒤, 가중 보로노이 이완으로 점을 고르게 펴서 점의 밀도만으로 명암을 낸다.',
    terms: [
      { en: 'Stippling (weighted Voronoi stippling)', ko: '점묘 — 점의 촘촘함으로 명암' },
      { en: "Lloyd's relaxation", ko: '로이드 이완 — 점을 자기 칸의 무게중심으로 옮기기를 되풀이' },
      { en: 'Rejection sampling', ko: '밀도만큼 확률로 받아들여 처음 점 뿌리기' },
      { en: 'Uniform grid nearest-neighbor', ko: '격자 칸으로 가장 가까운 점 빨리 찾기' },
    ],
    goal: '{target}을(를) 점묘(스티플링) 그림체로 그려 줘 — 어두운 곳은 점이 촘촘하고 밝은 곳은 성기게, 점은 서로 겹치지 않고 고르게. 분위기는 {style}.',
    targets: ['정육면체 · 원그래프 같은 도형 그림', '게임 표지 · 제목 그림', '사진을 점으로 바꾼 장면'],
    styles: ['흰 종이에 검은 펜 점', '옛 신문 삽화', '빈티지 판화'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 계산을 C# 으로 돌려 점 좌표를 만든 뒤 Graphics.DrawMeshInstanced 나 파티클로 찍는다.',
      godot: 'Godot 은 계산한 점을 MultiMeshInstance2D 로 한 번에 그린다.',
    },
    principle: [
      '그림을 작은 회색 지도(견본은 150×150)로 그리고, 칸마다 「어두움 = 점이 있을 확률」인 밀도 값을 만든다.',
      '처음에는 밀도만큼 확률로 점을 받아들여 막 뿌린다 — 뭉친 곳과 빈 곳이 생긴다.',
      '이완 한 번: 모든 칸을 가장 가까운 점에게 나눠 주고, 점을 「밀도로 무게를 단 자기 영역의 무게중심」으로 옮긴다.',
      '이것을 수십 번(견본 36번) 되풀이하면 점 사이 간격이 고르게 되면서도 어두운 곳에 더 몰린다.',
    ],
    when: ['명암이 분명한 도형 · 아이콘을 손그림 느낌으로 보여 줄 때', '「밀도 · 비율」 개념을 눈으로 보여 줄 때'],
    avoid: ['매 프레임 바뀌는 그림 — 이완 계산이 무겁다. 움직이는 그림엔 디더링 · 스크린톤(i335)을 쓴다', '색이 많은 그림 — 점묘는 한 색 명암에 맞다'],
    cost: 'medium',
    costNote: '이완 한 번 = 밀도 지도 2만 2천 칸 × 가까운 점 찾기. 프레임마다 한 번씩 나눠 돌리고, 끝난 점 배치는 저장해 다시 쓴다.',
    level: 2,
    must: [
      '이완은 한 번에 다 돌리지 말고 프레임마다 한 단계씩 (화면이 멈추지 않게), 단계별 점 좌표를 저장',
      '가까운 점 찾기는 격자 칸(점 수의 제곱근 정도)으로 — 모든 점을 다 비교하지 않는다',
      '난수는 시드 고정 (같은 그림이면 매번 같은 점)',
      '점 크기는 점 수가 늘면 줄인다 (반지름 ∝ √(1500 / N))',
    ],
    done: [
      '처음엔 점이 뭉쳐 있다가, 이완 횟수가 늘수록 고르게 퍼지는 것이 보인다',
      '옆에 놓은 회색 명암 그림과 비교해 어두운 곳 · 밝은 곳이 같은 자리다',
      '점 개수 슬라이더(500 ~ 3500)를 바꾸면 처음부터 다시 퍼지고, 점 크기도 알맞게 바뀐다',
      '폰에서도 화면이 멈칫하지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '로이드 이완 한 단계 (밀도로 무게를 단 무게중심으로 옮기기)',
      from: 'demos/demosHandA.ts stipStep() 을 정리 (격자 찾기는 단순하게)',
      body: `// dens: R×R 밀도(0~1, 어두울수록 큼) · pts: [x0,y0,x1,y1,...]
function stipStep(R: number, dens: Float32Array, pts: Float32Array, nearest: (x: number, y: number) => number): Float32Array {
  const n = pts.length / 2;
  const sx = new Float64Array(n), sy = new Float64Array(n), sw = new Float64Array(n);
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) {
      const w = dens[y * R + x];
      if (w < 0.004) continue;               // 흰 곳은 건너뛴다
      const px = x + 0.5, py = y + 0.5;
      const q = nearest(px, py);             // 이 칸을 차지하는 점 (격자 칸으로 빨리 찾기)
      if (q < 0) continue;
      sx[q] += px * w; sy[q] += py * w; sw[q] += w;
    }
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    // 무게중심으로 옮긴다 — 차지한 칸이 없으면 그 자리
    out[i * 2] = sw[i] > 0 ? sx[i] / sw[i] : pts[i * 2];
    out[i * 2 + 1] = sw[i] > 0 ? sy[i] / sw[i] : pts[i * 2 + 1];
  }
  return out;
}

// 밀도: 밝기 l(0~1) 에서 — 아주 옅은 회색은 0 으로
const densOf = (l: number) => Math.pow(Math.max(0, 1 - l - 0.03), 1.25);
// 점 반지름: 어두운 곳은 조금 크게, 점마다 살짝 다르게
const radius = (base: number, d: number, h: number) => base * (0.8 + 0.35 * Math.sqrt(d)) * (0.85 + 0.3 * h);`,
    },
    pitfalls: [
      { title: '막 뿌린 점만 쓰면 얼룩덜룩하다', fix: '확률로 뿌리면 뭉침 · 빈틈이 생긴다. 이완을 20번 이상 돌려야 점묘다운 고른 간격이 된다.' },
      { title: '모든 점과 모든 칸을 비교하면 한 단계에 수 초 걸린다', fix: '점을 격자 칸에 넣고 가까운 칸부터 고리 모양으로 찾는다 — 찾은 거리가 고리 반지름보다 작으면 멈춘다.' },
      { title: '밀도에 0 이 많으면 점이 흰 곳에 남는다', fix: '처음 뿌릴 때 밀도로 걸러 받고, 이완도 밀도로 무게를 달아 흰 곳에서 끌려 나오게 한다.' },
      { title: '이완을 한 프레임에 다 돌리면 화면이 멈춘다', fix: '프레임마다 한 단계만 돌리고 단계별 결과를 저장해 보여 준다 (무거운 생성은 프레임당 몇 ms 예산).', seen: true },
    ],
    prev: ['i325'],
    next: ['i335', 'i336'],
    refs: [
      { name: 'Wikipedia — Stippling', url: 'https://en.wikipedia.org/wiki/Stippling' },
      { name: "Wikipedia — Lloyd's algorithm", url: 'https://en.wikipedia.org/wiki/Lloyd%27s_algorithm' },
    ],
    source: [{ file: 'demosHandA.ts', symbol: 'stipStep' }],
  },

  i332: {
    id: 'i332',
    summary: '도형 테두리를 잡음으로 들쭉날쭉 밀고 흰 속지 띠 · 종이 결 · 흐린 그림자 · 살짝 기운 각도를 더해 색종이를 찢어 붙인 콜라주로 만든다.',
    terms: [
      { en: 'Paper cut-out collage (torn paper edge)', ko: '종이 오려 붙이기 — 찢긴 가장자리' },
      { en: 'Polygon edge displacement along normal', ko: '변을 잘게 나눠 바깥 방향으로 잡음만큼 밀기' },
      { en: 'Offscreen canvas sprite + blur shadow', ko: '조각마다 미리 구운 그림 · 흐린 그림자' },
      { en: 'Stop-motion (stepped time)', ko: '시간을 1/12초씩 끊어 스톱모션 느낌' },
    ],
    goal: '{target}을(를) 색종이를 찢어 붙인 콜라주 그림체로 그려 줘 — 찢긴 흰 테두리, 종이 결, 살짝 기운 조각, 바닥에 떨어지는 그림자까지. 분위기는 {style}.',
    targets: ['도형 친구들 이야기 장면', '게임 메뉴 · 제목 화면', '오려 붙인 글자 제목'],
    styles: ['크라프트지 위 색종이', '유치원 만들기 시간', '잡지 오려 붙인 협박 편지 글자'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 조각마다 스프라이트로 구워 SpriteRenderer 로 겹치고, 그림자는 같은 모양을 검게 흐려 아래에 깐다.',
      godot: 'Godot 은 Polygon2D 에 찢긴 꼭짓점을 넣고 그림자는 아래 Polygon2D 를 반투명하게.',
    },
    principle: [
      '도형의 각 변을 0.7 단위마다 잘게 나누고, 그 점을 변의 바깥 방향(법선)으로 잡음만큼 민다 — 찢긴 선이 된다.',
      '색 면은 살짝 안쪽으로, 흰 속지 테두리는 조금 바깥으로 밀되 굵기를 낮은 잡음으로 들쭉날쭉하게 — 찢을 때 드러나는 흰 섬유.',
      '조각마다 따로 캔버스에 구워(색 · 무늬 · 종이 결 · 옅은 사선 그러데이션) 두고, 같은 모양을 검게 흐린 그림자도 함께 굽는다.',
      '그릴 때는 조각을 조금씩 돌리고 그림자를 오른쪽 아래로 비켜 깐다. 시간을 1/12초씩 끊어 하나씩 들썩이면 스톱모션처럼 보인다.',
    ],
    when: ['동화 · 이야기 장면을 따뜻한 손작업 느낌으로', '조각이 하나씩 들썩이는 메뉴 · 제목 연출'],
    avoid: ['조각이 계속 모양을 바꾸는 장면 — 찢긴 모양은 미리 구워 두는 방식이라 매번 다시 굽으면 무겁다', '정확한 도형을 읽어야 하는 문제 화면 — 테두리가 흔들려 길이 · 각을 재기 어렵다'],
    cost: 'light',
    costNote: '조각은 처음 한 번(또는 찢긴 정도를 바꿀 때만) 굽고, 매 프레임은 drawImage 몇 장뿐. 크라프트 배경도 한 번만 굽는다.',
    level: 1,
    must: [
      '찢긴 모양 · 종이 결은 시드 고정 잡음으로 — 프레임마다 모양이 바뀌면 안 된다',
      '조각 그림 · 그림자는 미리 캔버스에 굽고, 화면 크기나 찢긴 정도가 바뀔 때만 다시 굽는다',
      '흰 속지 테두리 굵기는 들쭉날쭉하게 (한 굵기면 스티커처럼 보인다)',
      '그림자는 흐리게 · 반투명(0.4 정도) · 오른쪽 아래로 1~2 단위 비켜서',
    ],
    done: [
      '조각마다 찢긴 흰 테두리와 종이 결, 바닥 그림자가 보인다',
      '「찢긴 정도」 슬라이더(0.2 ~ 2.4)로 반듯한 오림부터 거칠게 찢은 것까지 바뀐다',
      '가르는 선으로 반듯한 원본과 나란히 비교된다',
      '들썩이는 조각은 그림자가 커지고 멀어져 떠오르는 것처럼 보인다',
    ],
    code: {
      lang: 'ts',
      title: '찢긴 가장자리 — 색 면 테두리와 흰 속지 테두리 두 겹',
      from: 'demos/demosHandB.ts torn() 을 정리',
      body: `type P = [number, number];
// hash2 · n1 = 시드 고정 잡음 (0~1 · -1~1)
function torn(pts: P[], seed: number, rough: number, rim: number): { col: P[]; wht: P[] } {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sg = area > 0 ? 1 : -1;               // 돌림 방향에 맞춰 바깥 법선 쪽을 고른다
  const col: P[] = [], wht: P[] = [];
  let s = 0, j = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const nx = (dy / L) * sg, ny = (-dx / L) * sg;
    const k = Math.max(1, Math.ceil(L / 0.7));
    for (let q = 0; q < k; q++) {
      const f = q / k, ss = s + L * f;
      const px = a[0] + dx * f, py = a[1] + dy * f;
      const fine = hash2(j, seed) - 0.5;
      // 색 면: 낮은 잡음 + 잔 들쭉, 살짝 안쪽
      const co = (n1(ss * 0.2, seed) * 0.4 + fine * 0.3) * rough - 0.15 * rough;
      // 흰 속지: 굵기가 길이를 따라 들쭉날쭉
      const rw = rim > 0 ? rough * rim * (0.5 + 1.7 * Math.max(0, n1(ss * 0.08, seed + 5))) + 0.25 : 0;
      const wo = co + rw + (hash2(j, seed + 1) - 0.5) * 0.45 * rough * rim;
      col.push([px + nx * co, py + ny * co]);
      wht.push([px + nx * wo, py + ny * wo]);
      j++;
    }
    s += L;
  }
  return { col, wht };
}`,
    },
    pitfalls: [
      { title: '변을 그대로 두고 꼭짓점만 흔들면 찢긴 느낌이 안 난다', fix: '변을 잘게(0.7 단위) 나눈 점마다 밀어야 섬유처럼 잔 들쭉이 생긴다.' },
      { title: '도형 돌림 방향이 반대면 테두리가 안쪽으로 파인다', fix: '넓이 부호로 돌림 방향을 구해 법선 부호를 맞춘다.' },
      { title: '그림자를 매 프레임 blur 필터로 그리면 느리다', fix: '그림자는 조각과 함께 한 번만 흐려 구워 두고 drawImage 로 깐다.' },
      { title: '조각을 모두 똑같이 기울이면 기계로 찍은 것 같다', fix: '시드 난수로 조각마다 다른 작은 각(±0.05 라디안 안팎)을 준다.' },
    ],
    prev: ['i330'],
    next: ['i335'],
    source: [{ file: 'demosHandB.ts', symbol: 'makeCollage' }],
  },

  i333: {
    id: 'i333',
    summary: '분필 결 무늬를 패턴으로 칠한 흔들린 선 · 손글씨에, 문지른 번짐과 흐릿한 지운 자국을 한 번 구운 칠판에 겹쳐 칠판 풀이처럼 보이게 한다.',
    terms: [
      { en: 'Chalkboard style (chalk texture stroke)', ko: '칠판 · 분필 그림체' },
      { en: 'CanvasPattern stroke (createPattern)', ko: '분필 결 그림을 패턴으로 만들어 선 색으로' },
      { en: 'Erased ghost (blurred offset copy)', ko: '지운 자국 — 흐리게 비켜 겹친 옛 글씨' },
      { en: 'Write-on reveal (clip progress)', ko: '잘라 보이기로 써 내려가는 연출' },
    ],
    goal: '{target}을(를) 칠판에 분필로 쓰는 장면으로 그려 줘 — 결이 끊긴 분필 선, 문지른 번짐, 지우개로 지운 흐릿한 자국, 써 내려가는 순서까지. 분위기는 {style}.',
    targets: ['수학 풀이 설명 (식 · 도형)', '수업 시작 화면', '선생님 캐릭터의 판서'],
    styles: ['초록 칠판 · 흰 분필', '검은 칠판 · 색분필', '오래된 교실 칠판'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 분필 결 텍스처를 LineRenderer 재질에 반복(Tile)으로 깔고, 지운 자국은 RenderTexture 에 흐리게 남긴다.',
      godot: 'Godot 은 Line2D 의 texture_mode = TILE 로 분필 결을 깔 수 있다.',
    },
    principle: [
      '분필 색마다 192×192 결 그림을 굽는다 — 길쭉한 잡음 · 잔 잡음 · 가끔 빈 점을 투명도로 넣어 선이 끊겨 보이게.',
      '이 그림을 패턴(createPattern)으로 만들어 strokeStyle · fillStyle 로 쓰면 어떤 선 · 글자든 분필 결이 생긴다.',
      '선은 길이를 따라 살짝 흔들고(wobbly), 그 아래 3배 굵기의 아주 옅은 선을 깔아 가루가 번진 테두리를 낸다.',
      '지운 자국 = 같은 풀이를 흐림 필터로 뭉개 좌우로 비켜 두 번 겹친 그림을 옅게(0.22) 칠판 위에 깐다.',
      '써 내려가기는 영역마다 시간 구간을 주고 그 진행만큼 사각형으로 잘라(clip) 보여 주며, 끝점에 분필 막대를 둔다.',
    ],
    when: ['풀이 · 증명을 한 줄씩 써 가며 설명할 때', '수업 · 교실 분위기의 화면'],
    avoid: ['글자가 아주 작은 화면 — 분필 결이 글자를 갉아 읽기 어렵다. 작은 글씨는 결을 약하게', '빠르게 바뀌는 점수 · 숫자 표시 — 평범한 글꼴이 낫다'],
    cost: 'light',
    costNote: '칠판 바탕 · 분필 결 3장 · 지운 자국은 화면 크기나 값이 바뀔 때만 굽는다. 매 프레임은 패턴 선 몇십 개.',
    level: 1,
    must: [
      '분필 결 · 칠판 바탕 · 지운 자국은 미리 굽고, 크기 · 거칠기가 바뀔 때만 다시',
      '패턴은 화면 배율에 맞춰 setTransform 으로 크기를 맞춘다 (확대해도 결 크기가 같게)',
      '흔들림 · 손글씨는 시드 고정 — 프레임마다 글자가 떨리면 안 된다',
      '써 내려가는 순서: 제목 → 그림 → 식 한 줄씩 → 답 동그라미',
    ],
    done: [
      '분필 선에 결이 끊긴 자국과 가루 번짐이 보이고, 반듯한 원본과 나란히 비교된다',
      '풀이가 한 줄씩 써지고 분필 막대가 끝을 따라간다, 끝나면 지우개가 지나가며 지운다',
      '「분필 거칠기」 · 「번짐 · 지운 자국」 슬라이더로 결과 번짐이 바뀐다',
      '폰 폭에서도 글씨가 읽힌다',
    ],
    code: {
      lang: 'ts',
      title: '분필 결 그림 굽기 + 패턴 선',
      from: 'demos/demosHandB.ts chalkTile() · makeChalk() 의 cl() 을 정리',
      body: `// bake(w, h, fn): 픽셀마다 fn 으로 색을 채운 캔버스 · pnoise2 = 반복되는 잡음 · hash2 = 점 잡음
function chalkTile(rgb: [number, number, number], seed: number, grit: number): HTMLCanvasElement {
  return bake(192, 192, (x, y, c) => {
    const n = pnoise2(x / 6, y / 16, 32, 12, seed);      // 길쭉한 결
    const n2 = pnoise2(x / 2, y / 2, 96, 96, seed + 3);  // 잔 결
    const sp = hash2(x, y, seed + 7);
    const a = 0.8 + (n - 0.5) * 0.95 * grit + (n2 - 0.5) * 0.55 * grit - (sp > 1 - 0.16 * grit ? 0.75 : 0);
    c[0] = rgb[0]; c[1] = rgb[1]; c[2] = rgb[2];
    c[3] = Math.max(0, Math.min(1, a)) * 255;            // 결은 투명도로 — 칠판이 비쳐 보인다
  });
}

const white = g.createPattern(chalkTile([240, 242, 234], 1, 1), 'repeat')!;

function chalkLine(g: CanvasRenderingContext2D, pts: [number, number][], w: number, ink: CanvasPattern, seed: number) {
  const q = wobbly(pts, false, seed, 0.55, 0.08);       // 길이를 따라 살짝 흔든 선
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(230,240,232,0.07)';             // 가루 번짐: 3.2배 굵은 아주 옅은 선
  g.lineWidth = w * 3.2;
  polyPath(g, q, false); g.stroke();
  g.strokeStyle = ink;
  g.lineWidth = w;
  polyPath(g, q, false); g.stroke();
}`,
    },
    pitfalls: [
      { title: '패턴을 화면 배율과 상관없이 쓰면 확대할 때 결이 뭉개진다', fix: '패턴에 setTransform(1/배율) 을 걸어 결 크기를 화면 픽셀 기준으로 맞춘다.' },
      { title: '지운 자국을 매 프레임 blur 로 그리면 느리다', fix: '지운 자국은 한 번 흐려 구워 두고 globalAlpha 로 옅게 깐다.' },
      { title: '분필 결을 글자 색 불투명도로 넣으면 회색 글자가 된다', fix: '결은 알파 채널에 넣어야 칠판 초록이 비쳐 분필답다.' },
      { title: '모든 선이 한꺼번에 나타나면 「쓰는」 느낌이 없다', fix: '영역마다 시작 · 끝 시간을 주고 진행만큼 잘라 보이며, 끝점에 분필 막대를 그린다.' },
    ],
    prev: ['i324'],
    next: ['i337', 'i339'],
    source: [{ file: 'demosHandB.ts', symbol: 'makeChalk' }],
  },

  i335: {
    id: 'i335',
    summary: '양끝이 가늘고 가운데가 굵은 펜 선, 45° 격자 점으로 찍은 스크린톤 그늘, 가운데로 모이는 집중선과 충격 흔들림으로 만화 한 컷을 만든다.',
    terms: [
      { en: 'Manga inking (tapered stroke)', ko: '굵기가 변하는 펜 선 — 끝을 뾰족하게' },
      { en: 'Screentone (halftone dots)', ko: '스크린톤 — 일정 간격 점으로 회색' },
      { en: 'Speed lines / focus lines', ko: '집중선 — 가운데로 모이는 쐐기 선' },
      { en: 'Canvas clip + pattern fill', ko: '모양으로 잘라 미리 구운 톤 깔기' },
    ],
    goal: '{target}을(를) 흑백 만화 한 컷으로 그려 줘 — 끝이 가는 펜 선, 점 스크린톤 그늘, 집중선, 「두둥!」 하는 충격 흔들림. 분위기는 {style}.',
    targets: ['정답을 맞힌 순간 연출', '캐릭터 등장 컷', '이야기 장면 칸'],
    styles: ['소년 만화 「두둥!」', '귀여운 4컷 만화', '옛 흑백 만화책'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 스크린톤을 화면 공간 점 무늬 셰이더(Shader Graph 의 Screen Position 으로 점 격자)로, 펜 선은 굵기 곡선을 준 LineRenderer 로.',
      godot: 'Godot 은 Line2D 의 width_curve 로 끝 가는 선, 톤은 canvas_item 셰이더의 SCREEN_UV 점 격자로.',
    },
    principle: [
      '펜 선: 선을 1.2 단위로 다시 나누고, 점마다 굵기 = 최대 × (1 − amt + amt · sin(π·진행)^0.55) 로 — 양끝은 가늘고 가운데 굵다. 왼쪽 · 오른쪽 테두리를 모아 다각형으로 칠한다.',
      '스크린톤: 45° 돌린 격자(간격 2.6 × √½, 칸 하나 건너 하나) 위에 점을 찍는다. 점 반지름이 곧 회색의 짙기 — 짙은 톤 0.34, 옅은 톤 0.19.',
      '톤은 화면 크기에 한 장씩 미리 구워 두고, 칠할 모양으로 잘라(clip) 그대로 깐다 — 면이 움직여도 점이 화면에 고정돼 진짜 톤처럼 보인다.',
      '집중선: 가운데에서 바깥으로 가늘어지는 쐐기 150개. 충격 값 exp(−4.5·t) 로 칸이 흔들리고 주인공이 7% 커졌다 돌아온다.',
    ],
    when: ['정답 · 반전 같은 순간을 강조할 때', '흑백 인쇄물 같은 이야기 장면'],
    avoid: ['넓은 면을 매 프레임 새 톤으로 다시 찍는 것 — 톤은 미리 구워 잘라 쓴다', '컬러가 중요한 화면 — 스크린톤은 흑백 명암 표현이다'],
    cost: 'light',
    costNote: '톤 3장 · 종이는 크기가 바뀔 때만 굽는다. 매 프레임은 쐐기 150개와 펜 선 몇십 개라 폰도 가볍다.',
    level: 2,
    must: [
      '톤 점은 화면(또는 칸)에 고정된 격자 — 물체를 따라 움직이면 안 된다',
      '선 굵기는 길이 비율로 (짧은 선도 양끝이 가늘게)',
      '모서리는 양끝을 조금 넘겨(0.8 ~ 2.2 단위) 그어 펜으로 그은 맛을 낸다',
      '흔들림은 시간을 1/15초로 끊어 만화 같은 덜컥임으로',
    ],
    done: [
      '펜 선 끝이 뾰족하고, 「펜 굵기 변화」 슬라이더(0 ~ 1)를 0 으로 하면 고른 선이 된다',
      '그늘 면에 점 스크린톤이 보이고, 점 크기 슬라이더로 짙기가 바뀐다',
      '3초마다 집중선이 조여들고 칸이 덜컥 흔들린다',
      '원본 그림과 가르는 선으로 비교된다',
    ],
    code: {
      lang: 'ts',
      title: '끝이 가는 펜 선 + 스크린톤 점 굽기',
      from: 'demos/demosHandB.ts taper() · bakeTone() 을 정리',
      body: `type P = [number, number];
function taper(g: CanvasRenderingContext2D, src: P[], wMax: number, amt: number, seed: number) {
  const pts = resample(src, false, 1.2);       // 1.2 단위로 다시 나눈 점
  const cum = cumLen(pts);
  const L = cum[cum.length - 1] || 1;
  const left: P[] = [], right: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const prof = Math.pow(Math.sin(Math.PI * cum[i] / L), 0.55);           // 끝 0 → 가운데 1
    const w = wMax * (1 - amt + amt * prof) * (1 + 0.18 * n1(cum[i] * 0.07, seed)) * 0.5; // 필압 잡음
    const p = pts[i];
    left.push([p[0] - dy * w, p[1] + dx * w]);
    right.push([p[0] + dy * w, p[1] - dx * w]);
  }
  g.beginPath();
  left.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
  g.fillStyle = '#111';
  g.fill();
}

// 스크린톤: 45° 격자(칸 하나 건너 하나)에 점 — rad 는 간격 대비 반지름(0.34 짙게 · 0.19 옅게)
function bakeTone(g: CanvasRenderingContext2D, w: number, h: number, pitch: number, rad: (x: number, y: number) => number) {
  const q = pitch * Math.SQRT1_2;
  g.fillStyle = '#161616';
  g.beginPath();
  for (let k = 0; k * q < h; k++)
    for (let m = 0; m * q < w; m++) {
      if ((k + m) & 1) continue;
      const x = m * q, y = k * q, r = rad(x, y) * pitch;
      if (r < 0.04) continue;
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, Math.PI * 2);
    }
  g.fill();
}`,
    },
    pitfalls: [
      { title: '톤을 물체 좌표에 찍으면 움직일 때 점이 미끄러진다', fix: '톤은 화면에 고정된 격자로 한 장 굽고 모양으로 잘라 깐다 — 실제 스크린톤처럼.' },
      { title: '굵기를 lineWidth 로만 바꾸면 끝이 뭉툭하다', fix: '선 하나를 양쪽 테두리 다각형으로 만들어 칠해야 끝이 뾰족해진다.' },
      { title: '점 격자를 0° 로 두면 모아레 줄무늬가 잘 보인다', fix: '만화 톤처럼 45° 로 돌린 격자(칸 하나 건너 하나)를 쓴다.' },
      { title: '집중선이 가운데까지 들어오면 주인공이 가려진다', fix: '쐐기 안쪽 끝을 60 ~ 100 단위로 멈춰 가운데를 비운다.' },
    ],
    prev: ['i324', 'u64'],
    next: ['i336'],
    source: [{ file: 'demosHandB.ts', symbol: 'makeManga' }],
  },

  i336: {
    id: 'i336',
    summary: '픽셀마다 「어느 면 위인가」에 따라 굵기가 다른 줄무늬 홈을 계산하고 가장자리를 잡음으로 일그러뜨려, 칼로 판 목판을 찍은 흑백 판화처럼 그린다.',
    terms: [
      { en: 'Woodcut / linocut print style', ko: '목판화 · 고무판화 그림체' },
      { en: 'Line engraving (stripe width = tone)', ko: '줄 굵기로 명암 — 굵으면 어둡게' },
      { en: 'Domain warping (noise-displaced coordinates)', ko: '좌표를 잡음으로 밀어 거친 가장자리' },
      { en: 'Per-pixel procedural bake', ko: '픽셀마다 계산해 한 번 굽기' },
    ],
    goal: '{target}을(를) 목판화 그림체로 그려 줘 — 칼로 판 흰 홈과 검은 줄, 줄 굵기로 명암, 거친 가장자리, 찍은 판화와 좌우가 뒤집힌 나무판까지. 분위기는 {style}.',
    targets: ['언덕 · 해 · 구름이 있는 풍경', '옛이야기 장면', '역사 · 전통 화면 표지'],
    styles: ['흑백 목판화 + 붉은 낙관', '고무판화 미술 시간', '옛 책 삽화'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 줄무늬 식을 Shader Graph 나 프래그먼트 셰이더로 옮겨 실시간으로 그릴 수 있다.',
      godot: 'Godot 은 canvas_item 셰이더에서 UV 로 같은 줄무늬 식을 계산한다.',
    },
    principle: [
      '줄무늬 한 줄 = 좌표를 간격(pitch)으로 나눈 나머지. 「나머지가 굵기의 절반보다 작으면 먹」 — 굵기(dark)가 클수록 어둡다.',
      '면마다 줄 방향 · 굵기를 다르게: 정육면체 앞면은 세로 줄(위 0.24 → 아래 0.56), 윗면은 옅은 가로 줄, 옆면은 짙은 사선 줄, 하늘은 해를 도는 동심원.',
      '좌표를 저주파 잡음으로 ±1.3 단위 밀어 판정하면(도메인 휘기) 테두리가 칼로 깎은 듯 거칠어진다.',
      '먹 값을 한 번 계산해 두면 찍은 판화(크림 종이 · 먹색)와 나무판(좌우 반대 · 나뭇결)을 같은 값으로 굽는다.',
    ],
    when: ['옛이야기 · 역사 장면처럼 무게 있는 분위기', '「판화는 좌우가 뒤집힌다」를 보여 주는 미술 체험'],
    avoid: ['매 프레임 바뀌는 장면 — 픽셀마다 계산이라 CPU 로는 굽기만 한다. 움직이려면 셰이더로 옮긴다', '작은 아이콘 — 줄 간격이 보이지 않을 만큼 작으면 회색 덩어리가 된다'],
    cost: 'medium',
    costNote: '화면 픽셀마다 잡음 여러 번 — 굽는 데 수백 ms. 배율을 1.5 로 묶고, 값이 바뀔 때만 다시 굽는다.',
    level: 2,
    must: [
      '줄무늬는 안티에일리어싱 식(clamp(0.5 + (e − d) / (픽셀 × 1.4)))으로 — 계단이 지면 안 된다',
      '굽기 해상도는 기기 배율 1.5 까지만 (CPU 굽기가 길어지지 않게)',
      '판화(찍은 것)와 나무판은 같은 먹 값에서 x 를 뒤집어 만든다',
      '먹이 아주 드물게 빠진 점(0.6%)과 찍힘 얼룩으로 손으로 찍은 맛을 낸다',
    ],
    done: [
      '면마다 다른 방향 · 굵기의 줄로 명암이 보이고, 테두리가 거칠다',
      '나무판(좌우 반대)이 종이를 벗기듯 판화로 바뀌는 장면이 반복된다',
      '「거친 가장자리」 · 「칼자국 간격」 슬라이더로 결이 바뀐다',
      '슬라이더를 움직여도 화면이 오래 멈추지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '줄무늬 홈 · 거친 가장자리 판정',
      from: 'demos/demosHandB.ts stripe() · woodInk() 앞부분을 정리',
      body: `const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// 안티에일리어싱 경계: 거리 d 가 e 보다 작으면 1 (먹)
const aaE = (d: number, e: number, px: number) => clamp01(0.5 + (e - d) / (px * 1.4));

/** 판 홈 줄무늬: dark(0~1) = 먹 줄 굵기 비율 = 어두움 */
function stripe(c: number, pitch: number, dark: number, px: number): number {
  const v = c / pitch;
  const fr = v - Math.floor(v);
  return aaE(Math.min(fr, 1 - fr) * pitch, dark * pitch * 0.5, px);
}

// 한 픽셀의 먹 값 (bx, by = 그림 좌표 · px = 한 픽셀 크기 · R 거칠기 · D 칼자국 간격)
function woodInkFront(bx: number, by: number, R: number, D: number, px: number, top: number): number {
  // 도메인 휘기: 판정 좌표를 잡음으로 밀면 테두리가 깎은 듯 들쭉
  const qx = bx + (vnoise(bx * 0.8, by * 0.8, 3) - 0.5) * 1.3 * R;
  const qy = by + (vnoise(bx * 0.8 + 9.1, by * 0.8, 4) - 0.5) * 1.3 * R;
  const lw = (vnoise(bx * 0.07, by * 0.07, 6) - 0.5) * 1.5 * R;   // 줄이 살짝 구불
  const tp = 0.7 + 0.6 * vnoise(bx * 0.11, by * 0.11, 12);          // 칼 힘 고르지 않게
  // 정육면체 앞면: 세로 줄, 아래로 갈수록 굵게(어둡게) + 테두리 먹 선
  const v = stripe(bx + lw, 2.5 * D, (0.24 + 0.32 * clamp01((qy - top) / 56)) * tp, px);
  return v; // 실제로는 Math.max(v, aaE(테두리까지 거리, 1.4, px))
}

// 판화 색: 크림 종이 ↔ 먹
// c = lerp(238 * p, 27, v), lerp(229 * p, 23, v), lerp(209 * p, 21, v)
// 나무판: 같은 v 를 x 를 뒤집어 (ink[y * W + (W - 1 - x)]) 나뭇결 색과 섞는다`,
    },
    pitfalls: [
      { title: '줄 경계를 if 로 0/1 만 주면 계단 · 지글거림이 생긴다', fix: '거리 기반 안티에일리어싱(aaE)으로 경계를 한 픽셀 폭만큼 부드럽게.' },
      { title: '기기 배율 3 그대로 픽셀마다 계산하면 굽기가 몇 초 걸린다', fix: '굽기 배율을 1.5 로 묶는다. 판화 결은 그 정도로 충분하다.', seen: true },
      { title: '줄 방향을 모든 면에 같게 하면 입체가 안 읽힌다', fix: '면마다 방향(세로 · 가로 · 사선)과 굵기를 달리해 빛 방향을 나타낸다.' },
      { title: '나무판을 따로 그리면 판화와 모양이 어긋난다', fix: '먹 값 배열을 하나만 계산하고, 나무판은 x 를 뒤집어 같은 배열을 읽는다.' },
    ],
    prev: ['i331', 'i335'],
    next: ['i339'],
    source: [{ file: 'demosHandB.ts', symbol: 'woodInk' }],
  },

  i337: {
    id: 'i337',
    summary: '글자를 하나씩 따로 그리며 기울기 · 크기 · 기준선 · 간격을 시드 난수로 살짝 달리해, 같은 글꼴이 손으로 쓴 글씨처럼 보이게 한다.',
    terms: [
      { en: 'Handwriting jitter (per-glyph transform)', ko: '글자마다 따로 돌리고 키우고 올리기' },
      { en: 'Seeded random (deterministic jitter)', ko: '시드 고정 난수 — 매 프레임 같은 흔들림' },
      { en: 'Canvas fillText + transform (skew)', ko: '캔버스 글자 + 기울임 변환' },
      { en: 'Wobbly outline', ko: '말풍선 테두리도 손으로 그린 듯 흔들기' },
    ],
    goal: '{target}의 글자를 손글씨처럼 바꿔 줘 — 글자마다 기울기 · 크기 · 기준선 · 간격을 조금씩 달리하고, 같은 글자도 매번 다르게. 분위기는 {style}.',
    targets: ['말풍선 대사', '게임 제목 · 안내 글', '칠판 · 공책의 식'],
    styles: ['공책에 쓴 아이 글씨', '또박또박 선생님 글씨', '급하게 휘갈긴 메모'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity TextMeshPro 는 TMP_TextInfo 의 글자별 정점(characterInfo · meshInfo)을 고쳐 글자마다 돌리고 옮길 수 있다.',
      godot: 'Godot 은 RichTextLabel 의 사용자 RichTextEffect(_process_custom_fx)에서 글자마다 offset · transform 을 바꾼다.',
    },
    principle: [
      '문자열을 글자 하나씩 나눠, 글자마다 난수 6개를 뽑는다: 회전(±0.11 라디안) · 크기(±12%) · 기준선(±글자 크기 8.5%) · 기울임 · 가로 폭 · 다음 글자까지 간격.',
      '난수는 시드 고정 — 같은 시드면 매 프레임 똑같은 손글씨, 시드를 바꾸면 다른 사람 글씨.',
      '줄 전체에도 작은 오르막 · 내리막(slope)을 줘 기준선이 한 방향으로 살짝 흐르게 한다.',
      '세기 k(0~1)로 반듯한 글자 ↔ 손글씨 사이를 섞을 수 있다 — 글자마다 k 를 늦게 주면 앞에서부터 흐트러진다.',
    ],
    when: ['말풍선 · 메모 · 칠판처럼 사람이 쓴 글', '손글씨 글꼴을 따로 받지 않고 여러 언어에 같은 느낌을 낼 때'],
    avoid: ['긴 설명 글 · 규칙 글 — 읽기 힘들다. 제목 · 짧은 대사에만', '점수처럼 매 프레임 바뀌는 숫자 — 바뀔 때마다 글자가 튀어 보인다'],
    cost: 'light',
    costNote: '글자마다 save · transform · fillText 한 번. 수백 글자까지는 폰도 문제없다.',
    level: 1,
    must: [
      '난수는 시드 고정 (매 프레임 Math.random 금지 — 글자가 떨린다)',
      '흔들림 폭은 작게: 회전 ±0.11 라디안 · 크기 ±12% 안팎 — 넘으면 읽기 어렵다',
      '글자 간격은 실제 글자 폭(measureText) 기준으로 계산',
      '가운데 · 오른쪽 맞춤도 흔든 뒤의 전체 폭으로 계산',
    ],
    done: [
      '같은 「7」 이 줄 안에서 매번 다르게 보인다',
      '세기를 0 으로 하면 반듯한 타자 글씨, 1 이면 손글씨로 부드럽게 바뀐다',
      '「다른 손글씨」 단추로 시드를 바꾸면 다른 글씨체처럼 보인다',
      '기울기 · 크기 · 기준선 슬라이더를 따로 조절할 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '글자마다 흔들어 쓰기',
      from: 'demos/demosHandB.ts handText() 를 정리',
      body: `function rng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function handText(g: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, seed: number, k = 1, ink = '#24324a') {
  g.font = '600 ' + size + 'px Pretendard, sans-serif';
  const r = rng(seed);
  const slope = (r() - 0.5) * 0.05;                  // 줄 전체가 살짝 오르막 · 내리막
  const gl = [...str].map((ch) => {
    const w = g.measureText(ch).width;
    return {
      ch, w,
      rot: (r() - 0.5) * 0.22,                       // 기울기
      sc: 1 + (r() - 0.5) * 0.24,                    // 크기
      dy: (r() - 0.5) * size * 0.17,                 // 기준선
      sk: (r() - 0.5) * 0.26,                        // 기울임(skew)
      adv: w * (1 + (r() - 0.5) * 0.2),              // 다음 글자까지
      sx: 1 + (r() - 0.5) * 0.12,                    // 가로 폭
    };
  });
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  g.textAlign = 'center';
  let cx = x;
  for (const q of gl) {
    const adv = lerp(q.w, q.adv, k);
    const mx = cx + adv / 2;
    if (q.ch !== ' ') {
      g.save();
      g.translate(mx, y + (q.dy + slope * (mx - x)) * k);
      g.rotate(q.rot * k);
      g.transform(lerp(1, q.sc * q.sx, k), 0, q.sk * k, lerp(1, q.sc, k), 0, 0);
      g.fillStyle = ink;
      g.fillText(q.ch, 0, 0);
      g.restore();
    }
    cx += adv;
  }
  g.textAlign = 'left';
}`,
    },
    pitfalls: [
      { title: '매 프레임 Math.random 으로 흔들면 글자가 덜덜 떨린다', fix: '시드 고정 난수로 글자마다 값을 정해 두고, 바꿀 때만 시드를 바꾼다.' },
      { title: '문자열을 한 번에 fillText 하면 글자별로 못 흔든다', fix: '[...str] 로 글자를 나누고(한글 · 이모지도 한 글자씩) 하나씩 그린다.' },
      { title: '흔든 뒤 폭을 모르면 가운데 맞춤이 어긋난다', fix: '먼저 글자마다 간격을 더해 전체 폭을 구하고, 그 절반만큼 왼쪽에서 시작한다.' },
      { title: '흔들림을 너무 크게 하면 아이들이 못 읽는다', fix: '회전 · 크기 흔들림은 작게, 글자 수가 많을수록 더 줄인다.' },
    ],
    prev: ['i323'],
    next: ['i333', 'i339'],
    source: [{ file: 'demosHandB.ts', symbol: 'handText' }],
  },

  i339: {
    id: 'i339',
    summary: '파란 종이에 모눈 · 접은 자국을 굽고 흰 선 · 치수선 · 화살표 · 손글씨 주석을 얹어, 전개도가 접히는 설계도(블루프린트)를 그린다.',
    terms: [
      { en: 'Blueprint style (technical drawing)', ko: '설계도 그림체 — 파란 바탕 흰 선' },
      { en: 'Dimension line with arrowheads', ko: '치수선 — 보조선 · 양쪽 화살표 · 글자' },
      { en: 'Isometric projection', ko: '등각 투영 — 3D 를 30° 비스듬히 그린 그림' },
      { en: "Painter's algorithm (depth sort)", ko: '먼 면부터 그리기' },
    ],
    goal: '{target}을(를) 설계도(블루프린트) 그림체로 그려 줘 — 파란 모눈 종이, 흰 선, 치수선과 화살표, 손글씨 주석, 표제란까지. 분위기는 {style}.',
    targets: ['정육면체 전개도가 접히는 장면', '작도 · 측정 문제 화면', '기계 · 건물 구조 설명'],
    styles: ['낡은 청사진 (얼룩 · 접은 자국)', '깨끗한 공학 도면', '손으로 그린 설계 스케치'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '바탕: 왼쪽 위 → 오른쪽 아래로 짙어지는 파랑에 잡음 얼룩 · 섬유를 넣어 한 번 굽고, 5 단위 모눈(25 단위마다 진하게)과 가운데 십자 접은 자국을 그린다.',
      '선은 흰색 + 2.8배 굵기 옅은 빛 선을 아래에 깔고, 길이를 따라 살짝 흔들어(손떨림) 손으로 그은 맛을 낸다.',
      '치수선: 두 점을 법선 방향으로 띄워 보조선 둘 · 본선 · 양끝 화살표(±0.35 라디안)를 긋고, 글자는 선 방향으로 돌리되 거꾸로 서지 않게 ±90° 안으로 맞춘다.',
      '접히는 정육면체: 접는 각 θ 로 각 면의 꼭짓점을 (cos θ, sin θ) 로 계산해 등각 투영하고, x+y+z 합으로 정렬해 먼 면부터 그린다.',
    ],
    when: ['전개도 · 작도 · 측정 문제를 「설계」처럼 보여 줄 때', '구조 · 부품 설명 화면'],
    avoid: ['아이들이 색으로 구별해야 하는 화면 — 설계도는 한 색이다. 그럴 땐 색 칠한 그림', '정밀한 3D 회전 — 직접 짠 등각 투영보다 three.js 정사영 카메라가 낫다'],
    cost: 'light',
    costNote: '파란 종이는 크기 · 낡음 값이 바뀔 때만 굽는다. 매 프레임은 선 수십 개 · 면 6장.',
    level: 1,
    must: [
      '자르는 선 = 실선, 접는 선 = 점선, 풀칠 날개 = 짧은 점선으로 구분',
      '치수 글자는 선 방향으로 돌리되 거꾸로 서지 않게 (각을 ±90° 안으로)',
      '면 그리기 순서는 깊이 정렬 — 접히는 중에 뒤 면이 앞을 덮으면 안 된다',
      '손떨림 · 손글씨는 시드 고정',
    ],
    done: [
      '파란 모눈 종이에 흰 선 전개도 · 치수선(12 cm · 3 cm) · 「접는 선 · 자르는 선」 주석 · 표제란이 보인다',
      '옆의 정육면체가 펼쳐졌다 접히고, 다 접히면 치수선이 나타난다',
      '「손떨림」 0 이면 반듯한 도면, 올리면 손으로 그린 설계 스케치',
      '「종이 낡음」으로 얼룩 · 접은 자국이 짙어진다',
    ],
    code: {
      lang: 'ts',
      title: '치수선 (보조선 · 화살표 · 돌린 글자)',
      from: 'demos/demosHandB.ts makeBlueprint() 의 head() · dim() 을 정리',
      body: `type P = [number, number];
function head(g: CanvasRenderingContext2D, b: P, a: P, col: string) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(b[0], b[1]);
  g.lineTo(b[0] - Math.cos(ang - 0.35) * 3, b[1] - Math.sin(ang - 0.35) * 3);
  g.lineTo(b[0] - Math.cos(ang + 0.35) * 3, b[1] - Math.sin(ang + 0.35) * 3);
  g.closePath();
  g.fill();
}

// line(pts, w) = 흔들린 흰 선 그리기 · text(s, x, y, size) = 손글씨 가운데 맞춤
function dim(g: CanvasRenderingContext2D, a: P, b: P, off: number, lab: string, col: string) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = -dy / l, uy = dx / l;                  // 선에 수직인 방향
  const A: P = [a[0] + ux * off, a[1] + uy * off];
  const B: P = [b[0] + ux * off, b[1] + uy * off];
  const sg = Math.sign(off);
  line([[a[0] + ux * sg * 1.2, a[1] + uy * sg * 1.2], [A[0] + ux * sg * 2, A[1] + uy * sg * 2]], 0.45); // 보조선
  line([[b[0] + ux * sg * 1.2, b[1] + uy * sg * 1.2], [B[0] + ux * sg * 2, B[1] + uy * sg * 2]], 0.45);
  line([A, B], 0.55);                               // 본선
  head(g, A, B, col);
  head(g, B, A, col);
  let ang = Math.atan2(dy, dx);
  if (ang > Math.PI / 2) ang -= Math.PI;            // 글자가 거꾸로 서지 않게
  if (ang < -Math.PI / 2) ang += Math.PI;
  g.save();
  g.translate((A[0] + B[0]) / 2 + ux * sg * 3.6, (A[1] + B[1]) / 2 + uy * sg * 3.6);
  g.rotate(ang);
  text(lab, 0, 2.2, 6.4);
  g.restore();
}`,
    },
    pitfalls: [
      { title: '치수 글자를 선 각도 그대로 돌리면 왼쪽으로 가는 선에서 글자가 거꾸로 선다', fix: '각을 ±90° 안으로 접어 늘 읽는 방향이 되게 한다.' },
      { title: '접히는 면을 정해진 순서로 그리면 중간에 뒤 면이 앞을 덮는다', fix: '프레임마다 면의 깊이(x+y+z 합)로 정렬해 먼 면부터 그린다.' },
      { title: '모눈을 그림 좌표로만 그리면 화면 가장자리가 비어 보인다', fix: '모눈은 바탕을 구울 때 화면 전체에, 그림 원점에 맞춰 5 단위로 깐다.' },
      { title: '흰 선만 그으면 밋밋하다', fix: '아래에 2.8배 굵기의 아주 옅은 하늘색 선을 깔아 청사진 빛 번짐을 낸다.' },
    ],
    prev: ['i337', 'i333'],
    next: ['i362'],
    source: [{ file: 'demosHandB.ts', symbol: 'makeBlueprint' }],
  },

  /* ───────── CSS · 화면 틀 ───────── */

  u61: {
    id: 'u61',
    summary: '화면 틀(HUD · 패널 · 단추)은 하나로 두고, 색 · 모서리 · 무늬를 CSS 변수로 빼서 data-game 값만 바꾸면 게임마다 다른 옷을 입힌다.',
    terms: [
      { en: 'Theming with CSS custom properties', ko: 'CSS 변수로 테마 바꾸기' },
      { en: 'Attribute selector scoping ([data-game=…])', ko: 'data-game 값으로 그 게임에만 걸리는 규칙' },
      { en: 'Lazy-loaded skin stylesheet (import.meta.glob)', ko: '그 게임을 열 때만 옷 CSS 내려받기' },
      { en: 'CSS transition', ko: '옷을 갈아입을 때 색이 스르르 바뀌기' },
    ],
    goal: '{target}에 「공통 틀 + 게임마다 테마 옷」 구조를 만들어 줘 — 틀의 HTML 은 하나, 색 · 모서리 · 무늬는 CSS 변수로, data-game 값만 바꾸면 {style} 옷으로 갈아입게.',
    targets: ['게임 HUD · 미션 패널 · 단추 줄', '게임 고르기 메뉴', '결과 · 성공 창'],
    styles: ['얼음 · 나무 · 별빛 세 벌', '게임 배경에 맞춘 색', '밝은 기본 + 어두운 밤 옷'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI Toolkit 은 USS 에서 사용자 변수(--color 와 var())를 지원한다 — 테마 USS 를 바꿔 끼운다.',
      godot: 'Godot 은 Theme 리소스를 게임마다 하나씩 만들어 루트 Control 의 theme 에 바꿔 넣는다.',
    },
    principle: [
      '틀의 모든 색 · 테두리 · 모서리 반지름을 직접 쓰지 않고 var(--pan) · var(--edge) · var(--rad) 처럼 변수로 쓴다.',
      '기본 옷은 틀 자체에, 게임 옷은 [data-game=warehouse] { --pan: …; --edge: … } 처럼 변수만 다시 정의한다.',
      '변수로 안 되는 장식(눈 모자 · 나뭇결 줄 · 금빛 그림자)은 같은 선택자 아래 ::before · background-image 로 덧붙인다.',
      '사이트는 옷 CSS 를 게임 폴더의 skin.css 로 두고, 그 게임을 처음 열 때만 import.meta.glob 으로 내려받는다.',
    ],
    when: ['게임이 많아도 틀 · 동작은 하나로 고치고 싶을 때', '게임 배경과 틀 색이 따로 놀아 보일 때'],
    avoid: ['게임마다 틀 HTML 을 복사해 고치기 — 하나를 고치면 수십 개를 고쳐야 한다', '옷 CSS 가 data-game 선택자 없이 전역 규칙을 쓰기 — 다른 게임 화면까지 바뀐다'],
    cost: 'light',
    costNote: 'CSS 변수만 바꾸므로 거의 공짜. 옷 파일은 그 게임을 열 때 한 번만 받는다.',
    level: 1,
    must: [
      '옷 CSS 의 모든 규칙은 [data-game=\'게임 id\'] 아래에만 (다른 게임에 새지 않게)',
      '틀의 HTML · 동작(JS)은 고치지 않는다 — 색 · 질감 · 장식만',
      '변수 이름은 역할로 (--pan 패널 바탕 · --edge 테두리 · --ink 글자 · --btn 단추), 색 이름으로 짓지 않는다',
      '옷이 없는 게임은 기본 옷 그대로 보여야 한다',
    ],
    done: [
      'data-game 값만 바꾸면 같은 HUD · 패널 · 단추가 얼음 · 나무 · 별빛 옷으로 바뀐다',
      '바뀔 때 색 · 모서리가 0.6초 동안 부드럽게 넘어간다',
      '옷 CSS 파일을 지워도 그 게임은 기본 파란 틀로 멀쩡히 열린다',
      '개발자 도구 네트워크 탭에서 옷 CSS 가 그 게임을 열 때만 받아진다',
    ],
    code: {
      lang: 'ts',
      title: '역할 변수 · 게임 옷 · 그 게임 열 때 옷 내려받기',
      from: 'demos/demosDraw2d.ts u61 의 CSS 와 shell/gameSkin.ts loadSkin() 을 정리',
      body: `// ① 틀: 변수만 쓴다 (기본 옷)
const css = '.frame{--bg:#bfe6ff;--pan:#ffffffd9;--edge:#7cc4f0;--ink:#1d4a74;--btn:#4fb3ff;--btn2:#1e7fd0;--rad:4cqmin}' +
  '.frame *{transition:background .6s,border-color .6s,color .6s,border-radius .6s}' +
  '.frame .chip,.frame .side{background:var(--pan);border:.9cqmin solid var(--edge);color:var(--ink);border-radius:var(--rad)}' +
  '.frame .btn{background:linear-gradient(var(--btn),var(--btn2));border-radius:99px}' +
  // ② 게임 옷: 변수만 다시 정의 + 변수로 안 되는 장식
  ".frame[data-game=warehouse]{--pan:#e9c58f;--edge:#7a4a22;--ink:#4a2a10;--btn:#e08a3a;--btn2:#9a4f18;--rad:1.5cqmin}" +
  ".frame[data-game=warehouse] .side{background-image:repeating-linear-gradient(0deg,#0000 0 3cqmin,#7a4a2218 3cqmin 3.5cqmin)}" +
  ".frame[data-game=mirrorlab]{--pan:#141a45e6;--edge:#e8c25a;--ink:#ffe7a6;--btn:#3a4fa8;--btn2:#e8c25a;--rad:3cqmin}";

// ③ 옷 갈아입기 = 속성 하나
function wear(root: HTMLElement, gameId: string) {
  root.dataset['game'] = gameId;
}

// ④ 옷 CSS 는 게임 폴더에 — 그 게임을 처음 열 때만 내려받는다 (vite)
const skins = import.meta.glob('../game/games/*/skin.css');
export function loadSkin(gameId: string): Promise<unknown> {
  const load = skins['../game/games/' + gameId + '/skin.css'];
  return load ? load().catch(() => undefined) : Promise.resolve();   // 옷이 없으면 기본 옷
}`,
    },
    pitfalls: [
      { title: '옷 CSS 에 선택자 범위를 빼먹으면 다른 게임 화면까지 바뀐다', fix: '모든 규칙을 .game-overlay[data-game=\'id\'] 아래에 쓴다. 옷을 연 뒤 다른 게임을 열어 확인한다.' },
      { title: '틀에 색을 직접 쓴 곳이 남아 있으면 그 칸만 옷을 안 갈아입는다', fix: '틀 CSS 에서 색 · 반지름 값을 모두 변수로 바꾸고, 변수 없이 쓴 색이 없는지 찾아본다.' },
      { title: '게임 폴더 이름과 게임 id 가 다르면 옷을 못 찾는다', fix: '이름이 다른 게임은 id → 폴더 표(FOLDER)를 한 줄 둔다 (창고지기 warehouse → sokoban).', seen: true },
      { title: '배경 그림은 바꿨는데 틀은 그대로라 따로 놀아 보인다', fix: '배경에서 바탕색 · 테두리색 · 글자색을 뽑아 옷 변수로 맞춘다.' },
    ],
    next: ['u62', 'u63'],
  },

  u62: {
    id: 'u62',
    summary: '그림 파일 없이 CSS 그러데이션(줄 · 원 · 원뿔 반복)과 주소에 넣은 SVG 만으로 나뭇결 · 공책 · 줄무늬 · 집중선 · 모눈 · 물방울 무늬를 만든다.',
    terms: [
      { en: 'CSS gradient patterns (repeating-linear / radial / conic-gradient)', ko: 'CSS 그러데이션 반복 무늬' },
      { en: 'Data URI SVG background', ko: '주소 안에 넣은 SVG 그림 (data:image/svg+xml)' },
      { en: 'Multiple backgrounds + background-size / position', ko: '배경 여러 겹 · 무늬 크기 · 위치 옮기기' },
      { en: 'Hard color stops', ko: '같은 자리에 두 색을 둬 경계를 칼같이' },
    ],
    goal: '{target}에 그림 파일 없이 CSS 만으로 {style} 무늬를 깔아 줘 — 그러데이션 반복과 데이터 SVG 로, 크기가 바뀌어도 또렷하게.',
    targets: ['게임 판 · 패널 바탕', '카드 뒷면 · 버튼', '만화 집중선 배경'],
    styles: ['나뭇결 · 공책 종이 · 모눈', '노랑검정 공사 줄무늬', '분홍 물방울'],
    platforms: ['web'],
    principle: [
      '같은 위치에 두 색을 두면(#ffd34d 0 4cqmin, #262626 4cqmin 8cqmin) 흐림 없이 칼같은 띠가 된다 — 반복(repeating-)하면 줄무늬.',
      '공책 = 가로 줄 반복 위에 빨간 세로 여백 줄 한 겹. 물방울 = 원 그러데이션 두 겹을 반 칸 비켜 깔기.',
      '집중선 = repeating-conic-gradient(가운데에서 도는 쐐기) 위에 가운데 흰 원 그러데이션.',
      '모눈처럼 선 모양이 중요하면 작은 SVG 를 encodeURIComponent 로 주소에 넣어 url("data:image/svg+xml,…") 로 깐다.',
      'background-position · background-size 만 바꾸면 줄무늬가 흐르고, 물방울이 숨 쉬고, 집중선이 돈다.',
    ],
    when: ['단순한 반복 무늬 — 그림 파일을 받을 필요가 없다', '크기가 바뀌어도 또렷해야 하는 틀 · 단추 바탕'],
    avoid: ['사진 같은 질감(종이 섬유 · 얼룩) — 캔버스로 구운 그림이 낫다', '그러데이션 수십 겹 — 큰 화면에서 매 프레임 바꾸면 그리기가 무거워진다'],
    cost: 'light',
    costNote: '그림 파일 0개. 움직이는 무늬는 background-position 만 바꾸면 가볍다 — 무늬 식 자체를 매 프레임 새로 쓰는 집중선은 칸 몇 개까지만.',
    level: 1,
    must: [
      '경계가 또렷해야 하는 줄무늬는 같은 자리 두 색(하드 스톱)으로',
      '무늬 크기는 cqmin · em 처럼 상자에 따라 바뀌는 단위로 (폰에서 줄이 너무 촘촘하지 않게)',
      'SVG 를 주소에 넣을 땐 encodeURIComponent 로 감싼다 (# · < 가 깨지지 않게)',
      '움직임은 background-position · background-size 로 (무늬 식을 매번 다시 만들지 않는다)',
    ],
    done: [
      '나뭇결 · 공책 · 줄무늬 · 집중선 · 모눈 · 물방울 여섯 칸이 그림 파일 없이 보인다',
      '줄무늬가 흐르고 집중선이 돌고 물방울이 숨 쉰다',
      '창 크기를 바꿔도 선이 흐려지지 않는다',
      '네트워크 탭에 그림 요청이 없다',
    ],
    code: {
      lang: 'ts',
      title: '줄무늬 · 공책 · 물방울 · 모눈(SVG) · 집중선',
      from: 'demos/demosDraw2d.ts u62 의 CSS 와 update() 를 정리',
      body: `const grid = encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><path d='M20 0H0V20' fill='none' stroke='#7fb2e6' stroke-width='1'/></svg>");

const css =
  // 공사 줄무늬: 같은 자리 두 색 = 칼같은 경계
  '.stripe{background:repeating-linear-gradient(45deg,#ffd34d 0 4cqmin,#262626 4cqmin 8cqmin)}' +
  // 공책: 가로 줄 반복 + 빨간 여백 줄 한 겹
  '.paper{background:linear-gradient(90deg,#0000 16%,#ef7a7a 16% 17%,#0000 17%),repeating-linear-gradient(#fffdf4 0 4.6cqmin,#a9cdeb 4.6cqmin 5cqmin)}' +
  // 물방울: 원 두 겹을 반 칸 비켜서
  '.dots{background:radial-gradient(circle,#ff7fb0 28%,#0000 31%) 0 0/7cqmin 7cqmin,radial-gradient(circle,#ffd1e3 28%,#0000 31%) 3.5cqmin 3.5cqmin/7cqmin 7cqmin,#fff0f6}' +
  // 모눈: 작은 SVG 를 주소에 넣어 반복
  '.grid{background:#f6fbff url("data:image/svg+xml,' + grid + '")}';

function animate(t: number, stripe: HTMLElement, burst: HTMLElement, dots: HTMLElement) {
  stripe.style.backgroundPosition = ((t * 30) % 1000) + 'px 0';          // 흐르는 줄무늬
  const a = (t * 25) % 360;                                              // 도는 집중선
  burst.style.background = 'radial-gradient(circle at 50% 45%,#fff 0 12%,#fff0 34%),' +
    'repeating-conic-gradient(from ' + a + 'deg at 50% 45%,#ff9a3c 0 4deg,#ffe27a 4deg 10deg)';
  const s = 1 + 0.08 * Math.sin(t * 2);                                  // 숨 쉬는 물방울
  dots.style.backgroundSize = 7 * s + 'cqmin ' + 7 * s + 'cqmin';
}`,
    },
    pitfalls: [
      { title: '두 색 사이에 간격을 두면 줄무늬 경계가 흐릿하다', fix: '앞 색 끝과 뒤 색 시작을 같은 값으로 둔다 (하드 스톱).' },
      { title: 'SVG 를 그대로 주소에 넣으면 # 색 코드에서 깨진다', fix: 'encodeURIComponent 로 감싸 넣는다.' },
      { title: '물방울 두 겹의 크기를 따로 바꾸면 무늬가 어긋난다', fix: '두 겹에 같은 background-size 를 한 번에 준다.' },
      { title: '45° 줄무늬를 px 단위로 두면 폰에서 너무 굵거나 가늘다', fix: '상자 기준 단위(cqmin)로 두어 칸 크기에 따라 같이 바뀌게.' },
    ],
    prev: ['u61'],
    next: ['u63', 'u64'],
    refs: [
      { name: 'MDN — repeating-linear-gradient()', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-linear-gradient' },
      { name: 'MDN — repeating-conic-gradient()', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-conic-gradient' },
    ],
  },

  u63: {
    id: 'u63',
    summary: 'CSS 마스크 xor 로 테두리만 남기고, mix-blend-mode 로 색을 곱해 섞고, clip-path 다각형으로 별 ↔ 육각형을 바꾸고, backdrop-filter 로 뒤를 흐린 유리를 만든다.',
    terms: [
      { en: 'CSS mask + mask-composite (exclude / xor)', ko: '마스크 두 겹을 빼서 테두리만 남기기' },
      { en: 'mix-blend-mode: multiply', ko: '색 곱하기 섞기 — 겹친 곳이 진해짐' },
      { en: 'clip-path: polygon()', ko: '다각형으로 잘라내기 — 꼭짓점 수가 같으면 모양끼리 섞기' },
      { en: 'backdrop-filter: blur() saturate()', ko: '뒤에 비친 것을 흐리게 — 유리 판' },
    ],
    goal: '{target}에 CSS 마스크 · 섞기 · 잘라내기 · 뒤 흐림을 써 줘 — 도는 무지개 테두리, 겹치면 진해지는 색, 모양이 바뀌는 잘라내기, 유리 판. 분위기는 {style}.',
    targets: ['카드 · 고르기 창 테두리', '결과 화면 장식', '게임 위 반투명 메뉴 판'],
    styles: ['밤하늘 · 무지개 빛', '물감 섞기 놀이', '반투명 유리 UI'],
    platforms: ['web'],
    principle: [
      '테두리만 남기기: 마스크를 두 겹(내용 상자 · 전체 상자) 깔고 mask-composite: exclude(웹킷은 -webkit-mask-composite: xor)로 빼면 padding 띠만 남는다 — 그 아래 도는 conic-gradient 를 깔면 무지개 테.',
      '섞기: 원 셋에 mix-blend-mode: multiply 를 주면 겹친 곳이 물감처럼 진해진다 (하양 바탕 필요).',
      '잘라내기: clip-path: polygon() 의 꼭짓점 수를 같게(12개) 두고 반지름만 별(0.5 · 0.22 번갈아)과 육각형 사이로 섞으면 모양이 부드럽게 바뀐다.',
      '유리: 반투명 바탕 + backdrop-filter: blur(2.4cqmin) saturate(1.6) — 뒤에 지나가는 색 덩어리가 흐리게 비친다.',
    ],
    when: ['그림 없이 특별한 테두리 · 모양을 낼 때', '게임 화면 위에 메뉴를 띄우되 뒤가 은은히 보이게 할 때'],
    avoid: ['backdrop-filter 를 큰 판 여러 장에 — 폰에서 무겁다. 한두 장만', 'clip-path 로 꼭짓점 수가 다른 두 모양을 섞기 — 부드럽게 안 넘어간다. 꼭짓점 수를 맞춘다'],
    cost: 'medium',
    costNote: 'backdrop-filter 는 뒤 화면을 매번 흐리므로 큰 판 · 여러 장이면 폰에서 프레임이 떨어진다. 마스크 · 섞기 · clip-path 는 가볍다.',
    level: 2,
    must: [
      '마스크는 표준(mask + exclude)과 웹킷(-webkit-mask + -webkit-mask-composite: xor)을 함께 쓴다',
      'backdrop-filter 도 -webkit- 접두어를 함께 (사파리)',
      'clip-path 다각형은 두 모양의 꼭짓점 수를 같게',
      'backdrop-filter 판은 화면에 두 장 이하',
    ],
    done: [
      '카드 둘레에 무지개 테두리만 돌고 가운데 카드는 그대로 보인다',
      '세 색 원이 겹친 곳이 더 진한 색으로 섞인다',
      '별이 육각형으로 부드럽게 바뀌었다 돌아온다',
      '유리 판 뒤로 색 덩어리가 흐리게 비치며 지나간다 (사파리 · 크롬 둘 다)',
    ],
    code: {
      lang: 'ts',
      title: '테두리 마스크 · 유리 판 · 별 ↔ 육각형 clip-path',
      from: 'demos/demosDraw2d.ts u63 의 CSS 와 update() 를 정리',
      body: `const css =
  // 테두리만 남기기: 내용 상자 마스크를 전체 마스크에서 빼기
  '.ring{border-radius:4cqmin;padding:1.6cqmin;' +
  '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;' +
  'mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}' +
  // 유리 판
  '.glass{background:#ffffff26;border:.4cqmin solid #ffffff80;' +
  'backdrop-filter:blur(2.4cqmin) saturate(1.6);-webkit-backdrop-filter:blur(2.4cqmin) saturate(1.6)}' +
  '.blend i{mix-blend-mode:multiply;border-radius:50%}';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function update(t: number, ring: HTMLElement, shape: HTMLElement, k: number /* 0 별 → 1 육각형 */) {
  ring.style.background = 'conic-gradient(from ' + ((t * 120) % 360) + 'deg,#ff6fa8,#ffd23f,#3ee0ff,#8b6bff,#ff6fa8)';
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {                       // 꼭짓점 12개로 같게
    const a = -Math.PI / 2 + (i * Math.PI) / 6 + t * 0.4;
    const star = i % 2 ? 0.22 : 0.5;
    const hex = 0.5 / Math.cos(((((a + Math.PI / 2 - t * 0.4) % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3)) - Math.PI / 6) * 0.866;
    const r = lerp(star, Math.min(0.5, hex), k);
    pts.push((50 + Math.cos(a) * r * 100).toFixed(1) + '% ' + (50 + Math.sin(a) * r * 100).toFixed(1) + '%');
  }
  shape.style.clipPath = 'polygon(' + pts.join(',') + ')';
}`,
    },
    pitfalls: [
      { title: '표준 mask 만 쓰면 사파리 · 옛 크롬에서 테두리가 꽉 찬 판으로 보인다', fix: '-webkit-mask 와 -webkit-mask-composite: xor 를 함께 쓴다.' },
      { title: 'mix-blend-mode 를 어두운 바탕에 쓰면 곱하기가 안 보인다', fix: 'multiply 는 밝은 바탕에서 쓴다. 어두운 바탕엔 screen 이나 lighten.' },
      { title: 'backdrop-filter 판을 여러 장 겹치면 폰에서 버벅인다', fix: '유리 판은 한두 장만, 큰 배경 흐림은 미리 흐린 그림으로 대신한다.' },
      { title: '꼭짓점 수가 다른 clip-path 로 transition 하면 뚝 바뀐다', fix: '두 모양을 같은 꼭짓점 수로 만들어 반지름만 섞는다.' },
    ],
    prev: ['u62'],
    next: ['u64'],
    refs: [
      { name: 'MDN — mask-composite', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/mask-composite' },
      { name: 'MDN — backdrop-filter', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter' },
      { name: 'MDN — clip-path', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path' },
    ],
  },

  u64: {
    id: 'u64',
    summary: '같은 글자를 네 겹 겹쳐 — 뒤는 굵은 어두운 테와 그림자, 가운데 흰 테, 앞은 그러데이션 글자, 맨 위 흐르는 빛 — 만화 같은 제목 글씨를 만든다.',
    terms: [
      { en: '-webkit-text-stroke (outlined text)', ko: '글자 테두리' },
      { en: 'background-clip: text (gradient text)', ko: '배경을 글자 모양으로 잘라 그러데이션 글자' },
      { en: 'Layered text (stacked spans)', ko: '같은 글자를 겹겹이 쌓기' },
      { en: 'Shine sweep (moving background-position)', ko: '글자 위로 흐르는 빛' },
    ],
    goal: '{target}을(를) 만화 제목 글씨로 꾸며 줘 — 굵은 어두운 테, 흰 안쪽 테, 위에서 아래로 노랑 → 주황 그러데이션, 글자 위를 흐르는 빛. 분위기는 {style}.',
    targets: ['게임 시작 화면 제목', '「성공!」 · 「홈런!」 같은 결과 글자', '단계 이름 띠'],
    styles: ['소년 만화 금빛 제목', '사탕처럼 말랑한 분홍', '밤하늘 네온'],
    platforms: ['web'],
    principle: [
      '글자 테(-webkit-text-stroke)는 글자 선의 안팎으로 반씩 그려져 굵히면 글자 속을 파먹는다 — 그래서 테만 맡는 뒤 겹을 따로 둔다.',
      '맨 뒤: 어두운 글자 + 굵은 테(2.6cqmin) + 아래로 비킨 text-shadow 두 개(두께 · 그림자). 가운데: 흰 글자 + 흰 테(1.2cqmin).',
      '앞: background: linear-gradient(…) 를 background-clip: text 로 글자 모양만 남기고 color: transparent.',
      '맨 위: 빛 줄기 그러데이션을 같은 방법으로 글자에 자르고 background-position 을 옮겨 빛이 흐르게 한다.',
    ],
    when: ['게임 이름 · 결과처럼 크게 한 번 보이는 글자', '그림 파일 대신 번역되는 제목 글씨가 필요할 때'],
    avoid: ['본문 · 작은 글씨 — 테가 글자를 뭉갠다. 큰 제목(화면 높이 10% 이상)에만', '글자를 매 프레임 바꾸는 점수 — 겹마다 다시 그려야 한다'],
    cost: 'light',
    costNote: '글자 네 겹 · 그러데이션뿐. 빛이 흐르는 칸 하나는 폰도 가볍다.',
    level: 1,
    must: [
      '테는 별도 뒤 겹에서 (앞 그러데이션 글자에 테를 바로 걸면 글자가 가늘어진다)',
      '-webkit-background-clip: text 와 background-clip: text 를 함께, 글자색은 transparent',
      '겹은 모두 같은 글자 · 같은 글꼴 · position: absolute; inset: 0 으로 딱 겹치게',
      '긴 번역 글(독일어 등)도 한 줄에 들어가게 white-space: nowrap + 글자 크기 줄이기',
    ],
    done: [
      '위 보통 글자와 아래 꾸민 글자를 나란히 보면 테 · 두께 · 그러데이션이 확실히 보인다',
      '빛 줄기가 2.6초마다 글자 위를 지나가고, 그때 글자가 살짝 튀어 오른다',
      '빛 흐르는 빠르기 슬라이더로 속도가 바뀐다',
      '다른 언어로 바꿔도 글자가 그림이 아니라 글이라 그대로 번역된다',
    ],
    code: {
      lang: 'ts',
      title: '네 겹 만화 제목 글씨',
      from: 'demos/demosDraw2d.ts u64 의 CSS · HTML · update() 를 정리',
      body: `const css =
  '.fancy{position:relative;font-size:19cqmin;line-height:1.1;white-space:nowrap}' +
  // ① 뒤: 굵은 어두운 테 + 두께 · 그림자
  '.fancy .back{position:absolute;inset:0;color:#2a1600;-webkit-text-stroke:2.6cqmin #2a1600;' +
  'text-shadow:0 1.6cqmin 0 #2a1600,0 2.4cqmin 3cqmin #0008}' +
  // ② 가운데: 흰 안쪽 테
  '.fancy .mid{position:absolute;inset:0;color:#fff;-webkit-text-stroke:1.2cqmin #fff}' +
  // ③ 앞: 그러데이션 글자
  '.fancy .front{position:relative;background:linear-gradient(180deg,#fffbd0 0%,#ffe24a 42%,#ff9a1a 62%,#ff6a00 100%);' +
  '-webkit-background-clip:text;background-clip:text;color:transparent}' +
  // ④ 맨 위: 흐르는 빛
  '.fancy .shine{position:absolute;inset:0;background:linear-gradient(105deg,#0000 40%,#fffffff0 50%,#0000 60%) no-repeat;' +
  'background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}';

const word = '수학 검문소!';
const html = '<div class="fancy">' + ['back', 'mid', 'front', 'shine'].map((c) => '<span class="' + c + '">' + word + '</span>').join('') + '</div>';

function update(t: number, fancy: HTMLElement, shine: HTMLElement) {
  const tt = t % 2.6;
  shine.style.backgroundPosition = 120 - Math.min(1, tt / 1.2) * 140 + '% 0';
  const pop = tt < 0.35 ? 1 + Math.sin((tt / 0.35) * Math.PI) * 0.08 : 1;     // 빛이 지날 때 톡
  fancy.style.transform = 'rotate(' + (-3 + Math.sin(t * 1.5) * 1.5) + 'deg) scale(' + pop + ')';
}`,
    },
    pitfalls: [
      { title: '그러데이션 글자에 바로 text-stroke 를 걸면 글자가 가늘어지고 테가 그러데이션을 덮는다', fix: '테는 뒤 겹이 맡고, 앞 겹은 테 없이 그러데이션만.' },
      { title: 'background-clip: text 만 쓰면 일부 브라우저에서 네모 그러데이션이 보인다', fix: '-webkit-background-clip: text 를 함께 쓰고 color: transparent 를 준다.' },
      { title: '겹마다 글자를 따로 쓰면 하나만 바꿔 어긋난다', fix: '같은 글자 변수 하나로 네 겹을 만든다 (번역 글도 한 번만).' },
      { title: '긴 번역 글이 두 줄로 꺾이면 겹이 어긋난다', fix: 'white-space: nowrap 으로 한 줄을 지키고, 넘치면 글자 크기를 줄인다.' },
    ],
    prev: ['u62'],
    next: ['i335'],
    refs: [
      { name: 'MDN — -webkit-text-stroke', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-text-stroke' },
      { name: 'MDN — background-clip', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/background-clip' },
    ],
  },

  u66: {
    id: 'u66',
    summary: '카드 앞 · 뒷면을 겹치고 뒷면을 미리 180° 돌려 두면, perspective 아래에서 카드를 rotateY 로 돌리는 것만으로 진짜처럼 뒤집힌다.',
    terms: [
      { en: 'CSS 3D card flip', ko: 'CSS 3D 카드 뒤집기' },
      { en: 'perspective · transform-style: preserve-3d', ko: '원근 · 자식도 3D 공간에 두기' },
      { en: 'backface-visibility: hidden', ko: '뒤돌아선 면은 안 보이게' },
      { en: 'rotateY · rotateX', ko: '세로축 · 가로축 돌리기' },
    ],
    goal: '{target}을(를) CSS 3D 로 뒤집히게 만들어 줘 — 앞면(?)이 돌아가면 뒷면(숫자)이 나오고, 뒤집히는 동안 살짝 떠오르게. 분위기는 {style}.',
    targets: ['숫자 카드 뒤집기', '정답 공개 카드', '짝 맞추기 게임 카드'],
    styles: ['초록 펠트 위 트럼프', '금테 보물 카드', '귀여운 동물 카드'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 앞 · 뒤 두 장의 판(Quad)을 붙인 물체를 Y 축으로 돌린다 — 뒷면 판은 180° 돌려 붙인다.',
      godot: 'Godot 3D 는 같은 방법, 2D UI 만이면 scale.x 를 1 → 0 → −1 로 줄였다 늘리며 가운데에서 그림을 바꾼다.',
    },
    principle: [
      '바깥 상자에 perspective(견본 120cqmin)를 주면 안쪽 3D 회전이 원근으로 보인다.',
      '카드에 transform-style: preserve-3d 를 줘야 앞 · 뒷면이 각자 3D 공간에 놓인다.',
      '앞 · 뒷면을 같은 자리에 겹치고, 뒷면만 rotateY(180deg) 로 미리 돌려 둔다. 두 면 다 backface-visibility: hidden.',
      '카드를 rotateY(k × 180°) 로 돌리면 90° 를 넘는 순간 앞면이 사라지고 뒷면이 보인다. 돌 때 sin(k·π) 만큼 띄우면 손으로 뒤집는 맛.',
    ],
    when: ['정답 · 숫자 공개', '짝 맞추기 · 카드 게임처럼 DOM 으로 만든 화면'],
    avoid: ['카드 수십 장이 동시에 도는 3D 장면 — three.js 로 그리는 편이 낫다', 'overflow: hidden 이 걸린 부모 안 — 3D 가 납작해진다'],
    cost: 'light',
    costNote: 'transform 만 바꾸므로 GPU 합성으로 처리된다. 카드 몇십 장까지 폰도 가볍다.',
    level: 1,
    must: [
      '뒤집는 상자에 transform-style: preserve-3d, 두 면에 backface-visibility: hidden (+ -webkit-)',
      '뒷면은 처음부터 rotateY(180deg) — 안 그러면 뒷면 글자가 거울처럼 뒤집혀 보인다',
      '돌리는 값은 transform 하나로 (translateY · rotateX · rotateY 를 한 줄에)',
      '여러 장은 0.35초씩 늦춰 차례로',
    ],
    done: [
      '카드가 차례로 돌며 「?」 앞면이 숫자 뒷면으로 바뀐다, 뒷면 숫자가 거꾸로 보이지 않는다',
      '뒤집히는 중간에 카드가 살짝 떠오른다',
      '「내려다보는 각도」 슬라이더(0 ~ 40°)로 카드를 비스듬히 볼 수 있다',
      '폰에서도 부드럽다',
    ],
    code: {
      lang: 'ts',
      title: '카드 뒤집기 CSS + 차례로 돌리기',
      from: 'demos/demosDraw2d.ts u66 의 CSS · update() 를 정리',
      body: `const css =
  '.table{display:flex;gap:5cqmin;perspective:120cqmin}' +
  '.card{width:22cqmin;height:32cqmin;position:relative;transform-style:preserve-3d}' +
  '.face{position:absolute;inset:0;border-radius:3cqmin;backface-visibility:hidden;-webkit-backface-visibility:hidden;display:grid;place-items:center}' +
  '.front{background:repeating-linear-gradient(45deg,#2b3f9e 0 2cqmin,#3550b8 2cqmin 4cqmin);color:#ffd23f}' +
  '.back{transform:rotateY(180deg);background:linear-gradient(#fffdf2,#ffeec2);color:#d0342c}';  // 뒷면은 미리 뒤집어 둔다

const html = [7, 3, 9].map((n) => '<div class="card"><div class="face front">?</div><div class="face back">' + n + '</div></div>').join('');

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
function update(t: number, cards: HTMLElement[], tilt = 12) {
  cards.forEach((c, i) => {
    const ph = (t - i * 0.35) % 4;                   // 0.35초씩 늦춰 차례로
    const k = ph < 0.6 ? 0 : ph < 1.3 ? ease((ph - 0.6) / 0.7) : ph < 2.8 ? 1 : ph < 3.5 ? 1 - ease((ph - 2.8) / 0.7) : 0;
    const lift = Math.sin(k * Math.PI) * 4;          // 도는 동안 떠오르기
    c.style.transform = 'translateY(' + -lift + 'cqmin) rotateX(' + tilt + 'deg) rotateY(' + k * 180 + 'deg)';
  });
}`,
    },
    pitfalls: [
      { title: '뒷면을 미리 돌려 두지 않으면 뒤집힌 뒤 숫자가 거울 글씨다', fix: '.back 에 transform: rotateY(180deg) 를 처음부터 준다.' },
      { title: '부모에 overflow: hidden 이나 filter 가 있으면 3D 가 납작해진다', fix: '그런 속성은 preserve-3d 를 끊는다 — 뒤집는 카드의 부모에서 뺀다.' },
      { title: 'backface-visibility 에 -webkit- 을 빼면 사파리에서 앞뒤가 겹쳐 보인다', fix: '두 가지를 함께 쓴다.' },
      { title: 'perspective 를 카드 자신에 주면 카드마다 소실점이 달라 어색하다', fix: '카드들을 담은 부모 상자에 perspective 를 한 번 준다.' },
    ],
    prev: ['u62'],
    next: ['i36'],
    refs: [
      { name: 'MDN — backface-visibility', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/backface-visibility' },
      { name: 'MDN — transform-style', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style' },
    ],
  },

  u68: {
    id: 'u68',
    summary: '게임 화면을 1600×900 같은 고정 크기 판 하나로 만들고, 화면 크기에 맞춰 transform: scale 로 통째로 키우거나 줄여 PC · 태블릿 · 폰에서 배치가 똑같게 한다.',
    terms: [
      { en: 'Fixed-resolution stage scaling (letterbox)', ko: '고정 크기 판을 통째로 확대 · 남는 곳은 띠' },
      { en: 'transform: scale() + transform-origin', ko: 'CSS 로 판 전체 키우기' },
      { en: 'Aspect-fit (min of width / height ratio)', ko: '가로 · 세로 배율 중 작은 쪽으로 맞추기' },
      { en: 'ResizeObserver', ko: '화면 크기가 바뀌면 다시 맞추기' },
    ],
    goal: '{target}을(를) 1600×900 고정 크기 판으로 만들고 화면에 맞춰 통째로 확대 · 축소해 줘 — PC · 태블릿 · 가로 폰에서 배치가 똑같이, 남는 곳은 {style}.',
    targets: ['HTML 로 만든 게임 화면 (서류 · 카드 · 판정 단추)', '보드게임 판', '퀴즈 화면'],
    styles: ['검은 띠', '흐린 배경 그림', '판을 늘려 채우기 (4:3 까지)'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 Canvas Scaler 의 「Scale With Screen Size」(기준 해상도 1600×900, Match) 가 같은 일을 한다.',
      godot: 'Godot 은 프로젝트 설정 Display → Window → Stretch 의 mode = canvas_items · aspect = keep 으로 같은 효과.',
    },
    principle: [
      '모든 배치를 1600×900 좌표 하나로 짠다 — 글씨 · 단추 크기도 그 판 기준.',
      '배율 s = min(화면 폭 / 1600, 화면 높이 / 900). 판을 s 배 하면 어느 쪽도 넘치지 않는다.',
      '판을 가운데에 두고 남는 곳은 띠(검정 · 흐린 배경)로 채운다. 판 안 그림 · 글씨는 비율이 그대로라 어디서나 같은 모습.',
      '수학 검문소는 한 걸음 더: 폰(폭 1100 미만)은 기준 폭 1100, 세로가 긴 화면은 판 높이를 4:3 까지 늘려 띠를 줄인다.',
    ],
    when: ['서류 · 카드처럼 배치가 촘촘해 반응형으로 다시 짜기 어려운 화면', '그림 위 정확한 자리에 글씨 · 단추를 얹는 화면'],
    avoid: ['글이 긴 읽기 화면 — 폰에서 글씨가 너무 작아진다. 그럴 땐 반응형 배치', '판 안에서 다시 vw · vh 단위를 쓰기 — 이중으로 줄어든다'],
    cost: 'light',
    costNote: '크기가 바뀔 때 transform 하나만 바꾼다. 매 프레임 비용 없음.',
    level: 1,
    must: [
      '판 안의 모든 크기는 판 좌표(px) 기준 — vw · vh · 화면 단위 금지',
      'transform-origin: 0 0 으로 두고 가운데 맞춤은 left · top 으로 따로 계산',
      '화면 크기 변화는 ResizeObserver(또는 resize)로 받아 다시 계산',
      '가로 폰 844×390 에서 글씨 · 단추가 읽히고 눌리는지 확인 (작으면 폰용 기준 폭을 따로)',
    ],
    done: [
      'PC 1920×1200 · 태블릿 1180×820 · 가로 폰 844×390 에서 판 배치가 똑같고 비율만 다르다',
      '판이 화면 밖으로 잘리지 않고, 남는 곳은 띠로 채워진다',
      '창 크기를 끌어 바꾸면 바로 다시 맞춰진다',
      '판 안 클릭 위치가 정확하다 (배율을 고려해 좌표를 바꿀 필요 없이 DOM 이 알아서)',
    ],
    code: {
      lang: 'ts',
      title: '고정 판을 화면에 맞추기 (띠 방식 + 판 늘리기)',
      from: 'demos/demosDraw2d.ts u68 의 배율 식과 game/games/checkpoint/CheckpointGame.ts resize() 를 정리',
      body: `// 띠 방식: 1600×900 판을 화면 안에 꼭 맞게
function fitBoard(stage: HTMLElement, layer: HTMLElement) {
  const w = stage.clientWidth, h = stage.clientHeight;
  const s = Math.min(w / 1600, h / 900);
  Object.assign(layer.style, {
    position: 'absolute', width: '1600px', height: '900px', transformOrigin: '0 0',
    left: (w - 1600 * s) / 2 + 'px', top: (h - 900 * s) / 2 + 'px', transform: 'scale(' + s + ')',
  });
}

// 판 늘리기 방식 (수학 검문소): 폭에 맞추고, 세로가 길면 4:3 까지 판을 늘린다
function fitLayer(stage: HTMLElement, layer: HTMLElement) {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (w <= 0 || h <= 0) return;
  const compact = w < 1100;                    // 폰은 기준 폭을 줄여 글씨를 크게
  const base = compact ? 1100 : 1600;
  const minH = compact ? 480 : 740;
  let s = w / base, lw = base, lh = h / s;
  if (lh > base * 0.75) { s = h / (base * 0.75); lh = base * 0.75; lw = w / s; }
  if (lh < minH) { s = h / minH; lh = minH; lw = w / s; }
  Object.assign(layer.style, { width: lw + 'px', height: lh + 'px', transform: 'scale(' + s + ')', transformOrigin: '0 0' });
  layer.classList.toggle('is-compact', compact);
}

new ResizeObserver(() => fitLayer(stageEl, layerEl)).observe(stageEl);`,
    },
    pitfalls: [
      { title: '판 안에서 vw · vh 를 쓰면 배율과 겹쳐 두 번 줄어든다', fix: '판 안은 판 좌표(px)만 쓴다.' },
      { title: '폰에서 1600 판을 통째로 줄이면 글씨가 읽을 수 없게 작다', fix: '폰은 기준 폭을 1100 으로 줄이고 .is-compact 규칙으로 배치를 따로 다듬는다.', seen: true },
      { title: 'transform-origin 을 가운데로 두면 판이 화면 밖으로 반쯤 나간다', fix: '원점은 0 0 으로, 가운데 맞춤은 left · top 으로 계산한다.' },
      { title: 'getBoundingClientRect 로 잰 크기를 판 좌표로 쓰면 틀린다', fix: '잰 값을 배율 s 로 나눠 판 좌표로 바꾼다.' },
    ],
    next: ['u70', 'u71'],
    refs: [{ name: 'MDN — ResizeObserver', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver' }],
  },

  u70: {
    id: 'u70',
    summary: '패널마다 쓸 수 있는 자리를 정해 두고, 넘칠 때만 넘친 비율만큼 그 패널의 zoom 을 줄여 — 넘치지 않는 패널은 그대로 두고 잘림을 막는다.',
    terms: [
      { en: 'Shrink-to-fit (overflow-only scaling)', ko: '넘칠 때만 줄이기' },
      { en: 'CSS zoom', ko: '칸 하나를 통째로 줄이기 (자리도 함께 줄어듦)' },
      { en: 'MutationObserver · ResizeObserver', ko: '내용 · 크기가 바뀌면 다시 재기' },
      { en: 'Anchor-aware fitting', ko: '붙은 쪽(위 · 아래 · 가운데)은 그대로 두고 맞추기' },
    ],
    goal: '{target}에 「넘칠 때만 줄이기」를 넣어 줘 — 패널마다 쓸 수 있는 자리를 정하고, 넘치는 패널만 넘친 만큼 줄이고 나머지는 그대로. 분위기는 {style}.',
    targets: ['게임 화면 오른쪽 정보 패널 · 아래 단추 줄', '고르기 창 카드', '번역 글이 긴 단추'],
    styles: ['가로 폰(844×390)에서도 잘림 없이', '글씨는 원래 크기의 60% 아래로 안 줄게', '창을 줄여도 부드럽게'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 ContentSizeFitter 로 잰 크기를 보고 넘치면 그 패널의 localScale 을 줄이는 작은 스크립트로 같은 일을 한다.',
      godot: 'Godot 은 Control 의 get_combined_minimum_size() 와 쓸 자리를 비교해 넘치면 scale 을 줄인다.',
    },
    principle: [
      '패널마다 규칙 하나: 선택자 · 붙은 쪽(top · bottom · center) · 쓸 수 있는 범위(판 좌표 위 · 아래 · 왼 · 오른).',
      '패널 크기를 재서 남는 높이 / 필요한 높이, 남는 폭 / 필요한 폭 중 작은 값 s 를 구한다. s ≥ 1 이면 그대로 둔다.',
      '넘치면 zoom 을 s × 0.995 배 — zoom 은 자리 값(top · right)도 같이 바꿔 한 번에 딱 맞지 않으므로 세 번까지 다시 잰다.',
      '단추 글자가 단추 밖으로 나가면 그 글자만 들어갈 때까지 4% 씩 줄이되, 원래의 60% 에서 멈춘다.',
      '내용 · 클래스가 바뀌거나(MutationObserver) 크기가 바뀌면(ResizeObserver) 다음 프레임에 한 번 다시 맞춘다.',
    ],
    when: ['게임마다 패널 내용 양이 달라 같은 크기로는 어떤 게임은 잘릴 때', '번역 글 길이가 언어마다 1.5 ~ 2배 다를 때'],
    avoid: ['모든 패널을 같은 비율로 한꺼번에 줄이기 — 넘치지 않는 패널까지 작아진다', '매 프레임 재기 — 바뀔 때만 잰다'],
    cost: 'light',
    costNote: '바뀔 때만 패널 몇 개 · 단추 몇십 개를 잰다 (requestAnimationFrame 으로 한 프레임에 한 번).',
    level: 2,
    must: [
      '넘치지 않으면 손대지 않는다 (CSS 가 정한 크기 그대로)',
      '잴 때마다 먼저 zoom 을 지우고 원래 크기에서 다시 잰다 (줄인 값에 또 줄이지 않게)',
      '자기가 바꾼 style 이 다시 감시를 부르지 않게 — MutationObserver 는 style 속성을 보지 않는다',
      '튀어나오는 연출(scale) 중 잰 크기는 작으니, animationend · transitionend 뒤에 다시 잰다',
    ],
    done: [
      '창 높이를 줄이면 넘치는 패널만 「× 0.82」 처럼 줄고, 나머지는 「그대로」',
      '「모두 같은 비율로」 비교를 켜면 넘치지 않던 패널까지 작아지는 차이가 보인다',
      '독일어처럼 긴 글에서도 단추 글자가 단추 밖으로 나가지 않는다',
      '가로 폰 844×390 에서 플레이 · 나가기 단추가 잘리지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '패널 하나를 넘친 만큼만 줄이기',
      from: 'shell/components/fitChrome.ts fitOne() 을 줄여 정리 (견본 demos/demosDraw2d.ts u70 은 같은 식을 그림으로)',
      body: `interface Area { top: number; bottom: number; left: number; right: number }
// boxOf(root, el) = el 의 사각형을 판(1600×900) 좌표로 잰 값

function fitOne(root: HTMLElement, el: HTMLElement, anchor: 'top' | 'bottom', area: () => Area) {
  el.style.removeProperty('zoom');                      // 원래 크기에서 다시 잰다
  if (!el.getClientRects().length) return;
  let zoom = parseFloat(getComputedStyle(el).zoom) || 1;
  for (let i = 0; i < 3; i++) {                         // zoom 은 자리 값도 바꿔 여러 번 잰다
    const a = area();
    const b = boxOf(root, el);
    const sh = anchor === 'top'
      ? (a.bottom - Math.max(b.top, a.top)) / (b.bottom - b.top)
      : (Math.min(b.bottom, a.bottom) - a.top) / (b.bottom - b.top);
    const sw = (a.right - a.left) / (b.right - b.left);
    const s = Math.min(sh, sw);
    if (s >= 0.999) return;                             // 넘치지 않으면 그대로
    zoom *= s * 0.995;
    el.style.zoom = String(zoom);
  }
}

// 바뀔 때만, 한 프레임에 한 번
let raf = 0;
const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; runAll(); }); };
new MutationObserver(schedule).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
new ResizeObserver(schedule).observe(root);`,
    },
    pitfalls: [
      { title: '같은 배율로 다 키웠더니 패널이 많은 게임에서 단추가 화면 밖으로 잘렸다', fix: '패널마다 쓸 수 있는 자리를 정하고 넘치는 만큼만 그 패널을 줄인다.', seen: true },
      { title: '감시가 style 속성까지 보면 zoom 을 바꿀 때마다 다시 불려 끝없이 돈다', fix: 'attributeFilter 로 class · hidden 같은 것만 본다.' },
      { title: '튀어나오는 연출 중에 재면 크기가 작게 잡혀 덜 줄인다', fix: 'animationend · transitionend 뒤에 다시 잰다.' },
      { title: '긴 번역 글을 무작정 줄이면 읽을 수 없게 작아진다', fix: '원래 크기의 60%(아주 큰 글씨는 26px)에서 멈춘다.', seen: true },
    ],
    prev: ['u68'],
    next: ['u71', 'u74'],
  },

  u71: {
    id: 'u71',
    summary: '폰에서 게임을 열 때 전체 화면 + 화면 방향 고정을 걸고, 노치는 safe-area 여백으로 피하고, 높이는 주소창에 맞춰 줄어드는 100dvh 로 잡는다.',
    terms: [
      { en: 'Screen Orientation API (screen.orientation.lock)', ko: '화면 방향 고정 (전체 화면일 때만)' },
      { en: 'env(safe-area-inset-*) + viewport-fit=cover', ko: '노치 · 둥근 모서리를 피하는 여백' },
      { en: 'Dynamic viewport units (100dvh)', ko: '주소창이 생기고 사라져도 맞는 높이' },
      { en: 'Fullscreen API (requestFullscreen)', ko: '전체 화면 들어가기' },
    ],
    goal: '{target}을(를) 폰에서 앱처럼 보이게 해 줘 — 열 때 전체 화면 + {style} 방향 고정, 막힌 브라우저는 「돌려 주세요」 안내, 노치를 피한 HUD, 주소창에 안 잘리는 높이.',
    targets: ['가로 게임 화면', '세로 퍼즐 게임', '전체 화면 체험'],
    styles: ['가로', '세로', '게임마다 다르게 (manifest 값)'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Screen.orientation 으로 방향을, Screen.safeArea 로 노치를 피한 사각형을 얻는다.',
      godot: 'Godot 은 DisplayServer.screen_set_orientation() 과 DisplayServer.get_display_safe_area() 를 쓴다.',
    },
    principle: [
      '방향 고정(screen.orientation.lock)은 대부분 전체 화면일 때만 된다 — 게임을 여는 누름 안에서 requestFullscreen 다음에 부른다.',
      '아이폰 사파리처럼 막힌 곳은 실패를 조용히 받고, 방향이 틀리면 「세워 주세요 / 돌려 주세요」 안내 화면이 대신한다.',
      'meta viewport 에 viewport-fit=cover 를 넣어야 env(safe-area-inset-top) 같은 값이 생긴다. HUD 는 max(12px, env(…)) 만큼 안으로.',
      '100vh 는 주소창이 숨은 높이라 주소창이 보이면 아래가 잘린다. 100dvh 는 지금 보이는 높이라 딱 맞는다.',
    ],
    when: ['폰에서 가로(또는 세로)로만 놀 수 있는 게임', '화면 위 · 아래 끝에 HUD · 단추가 붙은 화면'],
    avoid: ['페이지가 열리자마자 lock 부르기 — 사용자 누름 밖이면 막힌다. 게임 여는 단추에서', 'PC 에서 전체 화면 강제 — 폰(거친 포인터 · 짧은 변 900 이하)에서만'],
    cost: 'light',
    costNote: '설정 몇 줄. 비용 없음.',
    level: 1,
    must: [
      'lock 은 사용자 누름 처리 안에서, requestFullscreen 다음에 — 실패는 try/catch 로 조용히',
      '고정을 못 했을 때를 위해 방향이 틀리면 보이는 안내 화면을 꼭 둔다',
      'viewport-fit=cover 와 env(safe-area-inset-*) 를 함께 (하나만으로는 안 된다)',
      '높이는 100dvh, 게임을 닫으면 unlock · 전체 화면 끝내기',
    ],
    done: [
      '안드로이드 크롬에서 게임을 열면 전체 화면 + 가로로 고정된다',
      '아이폰에서 세로로 들면 「돌려 주세요」 안내가 보이고, 돌리면 사라진다',
      '노치 폰에서 HUD 점수 · 메뉴 단추가 노치에 가리지 않는다',
      '주소창이 나타나도 아래 「시작」 단추가 잘리지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '열 때 전체 화면 + 방향 고정, 닫을 때 풀기',
      from: 'shell/components/GameOverlay.ts lockLandscape() · unlockLandscape() (견본 demos/demosDraw2d.ts u71 은 세 가지를 그림으로)',
      body: `// index.html: <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
// CSS: .hud { padding-top: max(12px, env(safe-area-inset-top)); }  .app { height: 100dvh; }

let lockedByUs = false;

/** 게임 여는 단추의 click 안에서 부른다 (사용자 동작이어야 막히지 않는다) */
async function lockLandscape(portrait = false): Promise<void> {
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 900;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (!phone || !orientation?.lock || !document.documentElement.requestFullscreen) return;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      lockedByUs = true;
    }
    await orientation.lock(portrait ? 'portrait' : 'landscape');
  } catch {
    /* 막힌 브라우저(아이폰 사파리 등) — 「돌려 주세요」 안내가 대신한다 */
  }
}

async function unlockLandscape(): Promise<void> {
  try {
    screen.orientation?.unlock?.();
    if (lockedByUs && document.fullscreenElement) await document.exitFullscreen();
  } catch { /* 이미 풀렸다 */ }
  lockedByUs = false;
}`,
    },
    pitfalls: [
      { title: 'lock 만 부르면 전체 화면이 아니라서 실패한다', fix: '안드로이드 크롬 등은 전체 화면일 때만 고정된다 — requestFullscreen 을 먼저.', seen: true },
      { title: '아이폰 사파리는 둘 다 막혀 있다', fix: '실패를 조용히 받고, 방향이 틀리면 보이는 안내 화면을 둔다.', seen: true },
      { title: 'viewport-fit=cover 없이 env(safe-area-inset-top) 을 쓰면 늘 0 이다', fix: 'meta viewport 에 viewport-fit=cover 를 넣는다.' },
      { title: '100vh 로 높이를 잡으면 주소창이 보일 때 아래 단추가 잘린다', fix: '100dvh 를 쓴다.' },
    ],
    prev: ['u68'],
    next: ['u70'],
    refs: [
      { name: 'MDN — ScreenOrientation.lock()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock' },
      { name: 'MDN — env()', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/env' },
    ],
  },

  u74: {
    id: 'u74',
    summary: '한국어 문장 자체를 번역 열쇠로 써서 $t(\'시작하기\') 가 언어별 사전에서 찾아 바꾸고, 빠진 번역은 원문 그대로 · 게임별 사전은 따로 나눠 불러온다.',
    terms: [
      { en: 'Source-string-as-key i18n (gettext style)', ko: '원문이 번역 열쇠' },
      { en: 'Fallback to source text', ko: '번역이 없으면 원문 그대로' },
      { en: 'Lazy-loaded per-feature dictionaries (dynamic import)', ko: '게임별 사전을 그 언어일 때만 내려받기' },
      { en: 'Placeholder interpolation ({0} · {name})', ko: '문장 속 자리에 값 끼우기' },
    ],
    goal: '{target}을(를) 10개 언어로 바꿀 수 있게 해 줘 — 한국어 원문이 번역 열쇠($t(\'한국어\')), 빠진 번역은 원문으로, 게임별 사전은 따로 나눠 그 언어일 때만 불러오기. {style}.',
    targets: ['게임 안 단추 · 안내 글', '사이트 메뉴 · 게임 설명', '규칙 · 게임 방법 창'],
    styles: ['언어 단추로 바로 바꾸기', '주소 ?lang= 으로 고르기', '브라우저 언어 따라 자동'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Localization 패키지(String Table)를 쓴다 — 열쇠는 보통 따로 짓지만 원문을 열쇠로 써도 된다.',
      godot: 'Godot 의 tr() 은 원문을 열쇠로 쓰는 gettext 방식 그대로 — .po 파일이나 TranslationServer 에 사전을 넣는다.',
    },
    principle: [
      '코드에는 $t(\'시작하기\') 처럼 한국어를 그대로 쓴다 — 열쇠 이름을 따로 짓지 않으니 코드만 봐도 무슨 글인지 안다.',
      '언어별 사전은 { \'시작하기\': \'Start\' } 꼴. t() 는 사전에 있으면 번역, 없으면 원문(한국어)을 돌려준다 — 빠져도 멈추지 않는다.',
      '게임별 사전은 src/i18n/<언어>/<게임>.ts 로 나누고, 목록에 part(\'게임\', () => import(…)) 한 줄. 한국어면 아무것도 안 받는다.',
      '사전 하나가 빠지거나 못 받아도 try/catch 로 빈 사전을 돌려줘 그 게임 글만 한국어로 보인다.',
      '문장 속 값은 {0} · {name} 자리에 끼운다 — 언어마다 어순이 달라도 자리만 옮기면 된다.',
    ],
    when: ['글이 많은 게임 · 사이트를 여러 언어로', '여러 사람(세션)이 동시에 번역을 넣어야 할 때 — 게임별 파일로 부딪힘이 적다'],
    avoid: ['글자를 이어 붙여 문장 만들기(\'점수: \' + n + \'점\') — 어순이 다른 언어에서 깨진다. {0} 자리표시로', '그림 안에 글씨 넣기 — 번역이 안 된다. 글은 코드로'],
    cost: 'light',
    costNote: '사전 찾기는 객체 한 번. 외국어 방문자만 그 언어 사전을 받는다 (한국어는 0).',
    level: 1,
    must: [
      '화면에 나오는 모든 글은 t() 를 거친다 (원문 한국어 그대로)',
      '사전 불러오기는 하나씩 감싸서 — 하나가 빠져도 사이트 전체가 멈추지 않게',
      '자리표시({0} · {name})로 값을 끼우고, 글자 이어 붙이기로 문장을 만들지 않는다',
      '언어별 글꼴(일본어 · 번체 중국어)을 그 언어일 때만 더한다',
    ],
    done: [
      '주소에 ?lang=en 을 붙이면 같은 단추가 영어로 바뀌고, 10개 언어 모두 확인된다',
      '사전에 없는 글은 한국어로 보이고 오류가 없다',
      '게임 사전 파일 하나를 지워도 사이트는 열리고 그 게임 글만 한국어다',
      '독일어처럼 긴 글에서 단추가 깨지지 않는다 (넘침 맞추기와 함께)',
    ],
    code: {
      lang: 'ts',
      title: '원문 열쇠 t() · 게임별 사전 나눠 불러오기',
      from: 'src/i18n/index.ts part() · t() · fill() 을 줄여 정리 (견본 demos/demosSystem.ts u74 는 흐름을 그림으로)',
      body: `type Lang = 'ko' | 'en' | 'ja' | 'es' | 'pt' | 'zh' | 'fr' | 'de' | 'vi' | 'id';
declare const lang: Lang;                               // 주소 ?lang · 저장값 · 브라우저 언어로 정한 값
declare const BASE: Record<string, string>;             // 큰 사전

/** 사전 하나 — 빠지거나 못 받아도 빈 사전 (그 부분만 한국어) */
async function part(file: string, load: () => Promise<unknown>): Promise<Record<string, string>> {
  if (lang === 'ko') return {};
  try {
    const mod = (await load()) as Record<string, unknown>;
    const dict = Object.values(mod).find((v) => v && typeof v === 'object');   // 내보낸 이름에 기대지 않는다
    return (dict as Record<string, string> | undefined) ?? {};
  } catch (e) {
    console.warn('[i18n] ' + lang + '/' + file + '.ts 사전을 불러오지 못해 이 부분은 한국어로 보여요', e);
    return {};
  }
}

// 새 게임 = 한 줄. import() 경로 모양 그대로 써야 빌드가 언어별 파일을 묶는다
const PARTS = await Promise.all([
  part('abacus', () => import('./' + lang + '/abacus.ts')),
  part('seven', () => import('./' + lang + '/seven.ts')),
]);
const DICT: Record<string, string> = Object.assign({}, ...PARTS, BASE);

function fill(s: string, vars?: Record<string, unknown>): string {
  if (!vars) return s;
  return s.replace(/\\{(\\w+)\\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 한국어 원문 → 지금 언어 (없으면 원문) */
export function t(ko: string, vars?: Record<string, unknown>): string {
  if (lang === 'ko') return fill(ko, vars);
  return fill(DICT[ko] ?? ko, vars);
}`,
    },
    pitfalls: [
      { title: '사전 파일 하나가 커밋에서 빠져 외국어 사이트 전체가 「여는 중…」에서 멈췄다', fix: '사전마다 try/catch 로 감싸 빈 사전을 돌려준다 — 그 게임만 한국어로.', seen: true },
      { title: '원문 한국어를 조금 고치면 번역이 끊긴다', fix: '열쇠가 원문이라 원문을 고치면 사전 열쇠도 같이 고친다. 글이 굳은 뒤 한 번에 번역한다.', seen: true },
      { title: 'import() 경로를 변수로 만들면 빌드가 언어별 파일을 못 묶는다', fix: '경로 모양(\'./\' + 언어 + \'/파일.ts\')을 그대로 쓴다 — 빌드는 그 모양을 보고 파일을 모은다.' },
      { title: '웹 워커(AI)에서 사전을 그대로 묶으면 외국어 방문자가 사전을 두 번 받는다', fix: '워커용으로는 원문을 그대로 돌려주는 가벼운 t() 를 따로 둔다 (i18n/worker.ts).', seen: true },
    ],
    prev: ['u61'],
    next: ['u70'],
    refs: [{ name: 'Godot — Internationalizing games', url: 'https://docs.godotengine.org/en/stable/tutorials/i18n/internationalizing_games.html' }],
  },

  /* ───────── 물리 · 시뮬레이션 ───────── */

  u48: {
    id: 'u48',
    summary: 'Box2D 의 JS 판 planck 으로 강체 · 마찰 · 관절 · 센서를 돌리고, 고정 시간 간격(0.02초)으로 나눠 계산해 — 같은 설정값이면 늘 같은 움직임이 나오게 한다.',
    terms: [
      { en: 'Box2D (planck.js)', ko: '2D 강체 물리 엔진' },
      { en: 'Fixed timestep with accumulator', ko: '고정 시간 간격 — 남은 시간을 모아 0.02초씩 계산' },
      { en: 'RevoluteJoint · sensor fixture', ko: '경첩 관절 · 닿기만 알려 주는 센서' },
      { en: 'Velocity / position iterations (8 / 3)', ko: '한 걸음마다 풀이 반복 횟수' },
    ],
    goal: '{target}을(를) planck(Box2D) 2D 물리로 만들어 줘 — 중력 -9.81, 0.02초 고정 간격, 반복 8/3, 마찰 0.6. {style}.',
    targets: ['상자 · 공이 쌓이고 굴러가는 퍼즐', '관절로 이은 진자 · 사슬', '들어오면 켜지는 센서 칸 (골인 지점)'],
    styles: ['유니티 2D 와 같은 값으로 똑같이', '귀여운 블록 퍼즐', '물리 실험실'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 2D 물리가 Box2D 기반이다 — Rigidbody2D · HingeJoint2D · Collider2D 의 isTrigger, Fixed Timestep 0.02 · Velocity/Position Iterations 8/3 이 기본값.',
      godot: 'Godot 은 RigidBody2D · PinJoint2D · Area2D(센서), physics_ticks_per_second = 50 이면 0.02초.',
    },
    principle: [
      '세계(World)에 중력을 주고, 몸(Body)에 모양(Box · Circle)을 붙인다. 밀도 · 마찰 · 튐(restitution)은 모양마다.',
      '화면 프레임 간격은 들쭉날쭉하니, 흐른 시간을 모아 두었다가 0.02초씩 world.step(0.02, 8, 3) 을 부른다 — 같은 입력이면 같은 결과.',
      '한 프레임에 최대 4번까지만 계산하고 넘치면 버린다 — 느린 기기에서 계산이 계산을 부르는 「죽음의 나선」을 막는다.',
      '관절(RevoluteJoint)은 두 몸을 한 점에 꽂아 돌게 하고, 센서(isSensor)는 부딪히지 않고 닿은 것만 알려 준다.',
      '물리 단위는 미터 — 화면에 그릴 때만 배율(픽셀/미터)을 곱하고 y 를 뒤집는다.',
    ],
    when: ['쌓기 · 굴리기 · 매달기처럼 진짜 같은 2D 움직임', '유니티 2D 게임을 웹으로 옮길 때 (같은 Box2D 값)'],
    avoid: ['3D 로 굴러야 하는 주사위 — 3D 물리 엔진(i24)', '정해진 칸 위로만 움직이는 퍼즐 — 물리 없이 규칙으로 움직이는 편이 정확하다'],
    cost: 'medium',
    costNote: '몸 수십 개는 폰도 가볍다. 수백 개가 서로 닿으면 무거워지니, 오래된 것은 지운다 (견본은 떨어진 물체 26개까지).',
    level: 2,
    must: [
      '고정 간격(0.02초) + 누적기로 계산, 한 프레임 최대 4걸음',
      '물리 단위는 미터 (물체 0.1 ~ 10m) — 픽셀을 그대로 넣으면 엉뚱하게 느리다',
      '화면 좌표 변환은 한 곳에서 (y 뒤집기 · 배율 · 원점)',
      '안 보이는 물체는 destroyBody 로 지운다 (계속 쌓이지 않게)',
    ],
    done: [
      '진자 사슬이 흔들리고, 떨어진 상자 · 공이 경사에 굴러 쌓인다',
      '센서 칸에 물체가 들어오면 칸이 초록으로 켜지고 개수가 보인다',
      '같은 시작 상태에서 두 번 돌리면 같은 움직임이 나온다',
      '탭을 바꿨다 돌아와도 물체가 폭발하듯 튀지 않는다',
    ],
    code: {
      lang: 'ts',
      title: 'planck 세계 · 관절 · 센서 · 고정 간격 계산',
      from: 'demos/demosSim.ts u48 build() · draw() 를 정리',
      body: `import { Box, Circle, RevoluteJoint, World } from 'planck';

const world = new World({ gravity: { x: 0, y: -9.81 } });
const ground = world.createBody();
ground.createFixture({ shape: new Box(8.4, 0.3, { x: 0, y: -0.3 }, 0), friction: 0.6 });

// 관절로 이은 사슬 6마디 + 끝 공
let prev = ground;
const ax = 2.2, ay = 9.6;
for (let i = 0; i < 6; i++) {
  const y = ay - 0.25 - i * 0.5;
  const b = world.createDynamicBody({ position: { x: ax, y } });
  b.createFixture({ shape: new Box(0.08, 0.25), density: 2, friction: 0.6 });
  world.createJoint(new RevoluteJoint({}, prev, b, { x: ax, y: y + 0.25 }));
  prev = b;
}
const bob = world.createDynamicBody({ position: { x: ax, y: ay - 3 - 0.45 } });
bob.createFixture({ shape: new Circle(0.45), density: 4, friction: 0.6 });
world.createJoint(new RevoluteJoint({}, prev, bob, { x: ax, y: ay - 3 }));

// 센서: 부딪히지 않고 닿은 것만 센다
const sensor = world.createBody({ position: { x: 6.3, y: 1.1 } });
sensor.createFixture({ shape: new Box(1.6, 1.1), isSensor: true });
const countInside = () => { let n = 0; for (let ce = sensor.getContactList(); ce; ce = ce.next ?? null) if (ce.contact.isTouching()) n++; return n; };

// 고정 간격 0.02초 — 한 프레임 최대 4걸음
let acc = 0;
function tick(dt: number) {
  acc += Math.min(dt, 0.1);
  let n = 0;
  while (acc >= 0.02 && n < 4) { world.step(0.02, 8, 3); acc -= 0.02; n++; }
  if (n === 4) acc = 0;                     // 밀린 시간은 버린다 (죽음의 나선 막기)
}`,
    },
    pitfalls: [
      { title: '프레임 간격(dt)을 그대로 step 에 넣으면 기기마다 결과가 다르다', fix: '0.02초 고정 간격 + 누적기로 나눠 계산한다 — 유니티 원본과 같은 값이어야 같은 결과.', seen: true },
      { title: '픽셀 단위로 몸을 만들면 물체가 달 위처럼 느리게 떨어진다', fix: 'Box2D 는 미터 단위(0.1 ~ 10m)에 맞춰져 있다. 그릴 때만 픽셀 배율을 곱한다.' },
      { title: '위치 고정 같은 유니티 설정이 planck 에 없다', fix: '관절 · 계산 뒤 위치 되돌리기로 흉내 낸다 (SEVEN 의 applyLock).', seen: true },
      { title: '탭이 숨었다 돌아오면 밀린 시간 때문에 수십 걸음을 한꺼번에 돌린다', fix: 'dt 를 0.1초로 자르고 한 프레임 최대 4걸음, 넘치면 버린다.' },
    ],
    next: ['i24', 'i47'],
    refs: [
      { name: 'planck.js (GitHub)', url: 'https://github.com/piqnt/planck.js' },
      { name: 'Box2D 문서', url: 'https://box2d.org/documentation/' },
      { name: 'Gaffer On Games — Fix Your Timestep!', url: 'https://gafferongames.com/post/fix_your_timestep/' },
    ],
  },

  i47: {
    id: 'i47',
    summary: '물을 입자 500개로 두고, 이웃 입자와의 거리로 밀도를 재서 너무 몰리면 서로 밀어내게 해 — 수조를 기울이면 물처럼 출렁이게 한다.',
    terms: [
      { en: 'SPH-style particle fluid (double density relaxation)', ko: '입자 물 — 밀도 두 가지로 밀어내기' },
      { en: 'Position-based integration (Verlet-like)', ko: '위치를 먼저 옮기고 고친 뒤 속도를 다시 구하기' },
      { en: 'Spatial hash grid (neighbor search)', ko: '격자 칸으로 이웃 입자 빨리 찾기' },
      { en: 'Kernel radius h', ko: '서로 영향을 주는 거리 (견본 9)' },
    ],
    goal: '{target}을(를) 입자 물로 만들어 줘 — 입자들이 밀도로 서로 밀어내 출렁이고, 기울이면 한쪽으로 쏠리게. 분위기는 {style}.',
    targets: ['기울어지는 수조', '부력 · 수위 체험', '컵에 물 붓기'],
    styles: ['밝은 파란 물방울', '말랑한 젤리', '반짝이는 모래'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 에서는 같은 계산 결과를 Points 나 InstancedMesh 로 그린다. 수만 개는 GPU(WebGPU 컴퓨트)로.',
      unity: 'Unity 는 같은 계산을 C# Job/Burst 나 Compute Shader 로, 그리기는 DrawMeshInstanced.',
    },
    principle: [
      '한 걸음: 중력을 속도에 더하고, 이전 위치를 기억한 뒤 위치를 속도만큼 옮긴다.',
      '이웃 찾기: 입자를 칸 크기 = 영향 거리 h(9)인 격자에 넣고, 둘레 9칸만 본다.',
      '밀도 둘: q = 1 − r/h 일 때 밀도 d = Σq², 가까운 밀도 dn = Σq³. 압력 P = 굳기 × (d − 쉬는 밀도 3.2), 가까운 압력 Pn = 1.2 × dn.',
      '이웃마다 (P·q + Pn·q²)/2 만큼 서로 반대로 밀어낸다 — 몰리면 퍼지고, 가까운 압력이 입자끼리 겹치지 않게 한다.',
      '벽 안으로 위치를 묶고, 속도 = (새 위치 − 이전 위치) / dt 로 다시 구한다 (±4 로 제한).',
    ],
    when: ['출렁임 · 쏟아짐처럼 물 모양이 바뀌는 장면', '「밀면 퍼진다」를 보여 주는 압력 · 부력 체험'],
    avoid: ['넓은 바다 · 강 표면 — 셰이더 물이나 높이 지도 물결(i48)이 훨씬 싸다', '입자 수만 개를 CPU 로 — 몇천 개까지만'],
    cost: 'heavy',
    costNote: '입자 500개 × 이웃 수십 개 × 프레임당 2걸음. 이웃 격자 없이 전부 비교하면 25만 쌍이라 폰이 못 버틴다.',
    level: 3,
    must: [
      '이웃 찾기는 격자 칸(칸 = 영향 거리)으로 — 모든 쌍 비교 금지',
      '밀어내기는 두 입자에 반씩 반대로 (운동량이 새지 않게)',
      '속도는 위치 차이로 다시 구하고 상한을 둔다 (폭발 막기)',
      '그리기는 큰 흐린 점 위에 작은 점 — 입자가 뭉쳐 물 덩어리처럼 보이게',
    ],
    done: [
      '수조가 기울면 물이 한쪽으로 쏠렸다 출렁이며 돌아온다',
      '빠른 입자는 밝게 보여 흐름이 보인다',
      '「압력 세기」를 낮추면 물이 눌려 납작해지고, 높이면 탱탱해진다',
      '「물 다시 붓기」로 처음 배치로 돌아간다',
    ],
    code: {
      lang: 'ts',
      title: '밀도 두 가지로 밀어내기 (한 입자 i)',
      from: 'demos/demosSim.ts i47 step() 의 가운데를 정리 (이웃 격자 순회는 forNeighbors 로 줄임)',
      body: `const HR = 9;          // 영향 거리
const REST = 3.2;     // 쉬는 밀도
const KN = 1.2;       // 가까운 압력 세기
// forNeighbors(i, fn): 격자 둘레 9칸의 다른 입자 j 마다 fn(j)

function relax(i: number, x: Float32Array, y: Float32Array, stiff: number, dt = 1) {
  const xi = x[i], yi = y[i];
  let d = 0, dn = 0;
  forNeighbors(i, (j) => {
    const r = Math.hypot(x[j] - xi, y[j] - yi);
    if (r < HR) { const q = 1 - r / HR; d += q * q; dn += q * q * q; }
  });
  const P = stiff * (d - REST);       // 몰리면 + (밀어냄), 성기면 - (당김)
  const Pn = KN * dn;                 // 아주 가까우면 늘 밀어냄 — 겹침 막기
  let dxi = 0, dyi = 0;
  forNeighbors(i, (j) => {
    const rx = x[j] - xi, ry = y[j] - yi;
    const r = Math.hypot(rx, ry);
    if (r < HR && r > 1e-4) {
      const q = 1 - r / HR;
      const D = (dt * dt * (P * q + Pn * q * q)) / 2;
      const ux = (rx / r) * D, uy = (ry / r) * D;
      x[j] += ux; y[j] += uy;         // 이웃은 바깥으로
      dxi -= ux; dyi -= uy;           // 나는 반대로
    }
  });
  x[i] = xi + dxi;
  y[i] = yi + dyi;
}
// 걸음 끝: 벽 안으로 묶고 v = clamp((x - 이전 x) / dt, -4, 4)`,
    },
    pitfalls: [
      { title: '모든 입자 쌍을 비교하면 500개만 돼도 느리다', fix: '영향 거리만 한 격자 칸에 넣고 둘레 9칸만 본다.' },
      { title: '밀도 하나(압력)만 쓰면 입자가 서로 겹쳐 뭉친다', fix: '가까운 밀도(q³)로 늘 밀어내는 압력을 하나 더 둔다.' },
      { title: '속도를 따로 적분하면 벽에서 튀어 나간다', fix: '위치를 먼저 고치고, 속도는 위치 차이로 다시 구한 뒤 상한을 건다.' },
      { title: '입자를 작은 점으로만 그리면 물이 아니라 모래처럼 보인다', fix: '큰 반투명 점을 먼저 깔고 작은 점을 위에 — 덩어리가 이어져 보인다.' },
    ],
    prev: ['i46'],
    next: ['i48'],
    refs: [
      { name: 'Wikipedia — Smoothed-particle hydrodynamics', url: 'https://en.wikipedia.org/wiki/Smoothed-particle_hydrodynamics' },
    ],
  },

  i48: {
    id: 'i48',
    summary: '물 높이를 격자(80×80)에 두고 「이웃 평균 × 2 − 이전 높이」로 매 프레임 갱신해, 물방울이 떨어지면 동심원이 퍼지고 서로 겹치며 바닥에 빛무늬가 생기게 한다.',
    terms: [
      { en: 'Height-field water (2D wave equation)', ko: '높이 지도 물결 — 파동 방정식' },
      { en: 'Two-buffer ripple (current / previous)', ko: '지금 · 이전 높이 두 장을 번갈아' },
      { en: 'Interference', ko: '간섭 — 두 물결이 만나 더해지고 상쇄' },
      { en: 'Caustics from Laplacian', ko: '물결이 오목한 곳(라플라시안)으로 바닥 빛무늬' },
    ],
    goal: '{target}에 높이 지도 물결을 넣어 줘 — 물방울이 떨어지면 동심원이 퍼지고, 둘이 만나면 간섭하고, 바닥에 빛무늬가 일렁이게. 분위기는 {style}.',
    targets: ['수영장 · 연못 물 표면', '파동 · 간섭 체험', '누르면 물결이 퍼지는 메뉴'],
    styles: ['맑은 하늘색 타일 수영장', '밤 연못', '만화 물결'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 계산을 CustomRenderTexture(두 장 번갈아)나 Compute Shader 로 하고, 정점 셰이더가 높이를 읽는다.',
      godot: 'Godot 은 SubViewport 두 장으로 핑퐁하고, ShaderMaterial 정점 함수에서 높이 텍스처를 읽는다.',
    },
    principle: [
      '칸마다 높이 둘(지금 · 이전). 새 높이 = (위 + 아래 + 왼 + 오른) / 2 − 이전 높이, 그리고 × 감쇠(0.988).',
      '이 한 줄이 파동 방정식을 흉내 낸다 — 볼록한 곳은 꺼지고 둘레가 솟아 동심원이 퍼진다. 두 동심원은 그냥 더해져 간섭이 저절로 생긴다.',
      '계산 뒤 두 장을 바꾼다. 물방울은 한 점 둘레를 가우스 모양(exp(−r²/3))으로 눌러 넣는다.',
      '화면: 평면 메시(80×80 정점)의 y 를 높이로, 색도 높이로 칠하고 법선을 다시 구한다.',
      '빛무늬: 이웃 합 − 4×가운데(라플라시안)가 양수인 오목한 곳을 밝게 — 그 캔버스를 더하기 섞기로 바닥에 깐다.',
    ],
    when: ['연못 · 수영장처럼 표면만 움직이는 물', '파동 · 간섭을 눈으로 보여 줄 때'],
    avoid: ['물이 쏟아지거나 출렁여 모양이 바뀌는 장면 — 입자 물(i47)', '끝없는 바다 — 셰이더 파도(사인 · 게르스트너)가 싸다'],
    cost: 'medium',
    costNote: '80×80 = 6,400칸 계산 + 정점 6,400개 · 법선 다시 구하기 + 빛무늬 캔버스 올리기. 폰은 격자 64 정도, 더 크면 GPU 로.',
    level: 2,
    must: [
      '높이 두 장(지금 · 이전)을 번갈아 — 한 장으로 하면 파동이 안 된다',
      '감쇠는 1 보다 아주 조금 작게 (0.95 ~ 0.998) — 1 이상이면 끝없이 커진다',
      '가장자리 한 줄은 계산하지 않아 벽처럼 반사',
      '높이를 바꾼 뒤 position · color 의 needsUpdate 와 computeVertexNormals',
    ],
    done: [
      '물방울이 떨어진 자리에서 동심원이 퍼지고 벽에서 되돌아온다',
      '두 방울이 동시에 떨어지면 물결이 겹쳐 무늬가 생긴다 (간섭)',
      '바닥 타일 위에 물결을 따라 밝은 빛무늬가 일렁인다',
      '「물결 남는 정도」로 오래 남거나 금방 잔잔해진다',
    ],
    code: {
      lang: 'ts',
      title: '높이 지도 파동 한 걸음 · 물방울 · 빛무늬',
      from: 'demos/demosSim.ts i48 update() · disturb() 를 정리',
      body: `const NG = 80;
let cur = new Float32Array(NG * NG);
let prv = new Float32Array(NG * NG);

function drop(ci: number, cj: number, amt: number) {
  for (let j = -3; j <= 3; j++)
    for (let i = -3; i <= 3; i++) {
      const a = ci + i, b = cj + j;
      if (a < 1 || b < 1 || a >= NG - 1 || b >= NG - 1) continue;
      cur[a + b * NG] -= amt * Math.exp(-(i * i + j * j) / 3);   // 가우스 모양으로 눌러 넣기
    }
}

function waveStep(damp = 0.988) {
  for (let j = 1; j < NG - 1; j++)
    for (let i = 1; i < NG - 1; i++) {
      const k = i + j * NG;
      const nv = (cur[k - 1] + cur[k + 1] + cur[k - NG] + cur[k + NG]) / 2 - prv[k];
      prv[k] = nv * damp;                 // 이전 칸 자리에 새 높이를 쓴다
    }
  [cur, prv] = [prv, cur];                // 새 높이가 지금, 지금이 이전
}

// 화면: 정점 y = 높이, 바닥 빛무늬 = 라플라시안이 양수인 곳
function apply(pos: THREE.BufferAttribute, caus: ImageData) {
  for (let j = 0; j < NG; j++)
    for (let i = 0; i < NG; i++) {
      const k = i + j * NG;
      pos.setY(k, cur[k] * 0.5);
      const lap = i > 0 && j > 0 && i < NG - 1 && j < NG - 1 ? cur[k - 1] + cur[k + 1] + cur[k - NG] + cur[k + NG] - 4 * cur[k] : 0;
      caus.data[k * 4 + 3] = Math.max(0, Math.min(220, lap * 500));
    }
  pos.needsUpdate = true;
}`,
    },
    pitfalls: [
      { title: '높이를 한 장에서 바로 고치면 물결이 한쪽으로 쏠린다', fix: '지금 · 이전 두 장을 두고, 새 값은 다른 장에 쓴 뒤 바꾼다.' },
      { title: '감쇠를 1 로 두면 물결이 점점 커져 터진다', fix: '0.95 ~ 0.998 사이로 둔다.' },
      { title: '높이만 바꾸고 법선을 안 구하면 물결이 빛을 안 받는다', fix: '매 프레임 computeVertexNormals — 무거우면 셰이더에서 높이 차로 법선을 구한다.' },
      { title: '빛무늬를 보통 섞기로 깔면 바닥이 하얗게 덮인다', fix: '더하기 섞기(AdditiveBlending) + depthWrite: false 로 바닥 위에 빛만 얹는다.' },
    ],
    prev: ['i46'],
    next: ['i47'],
    refs: [
      { name: 'Evan Wallace — WebGL Water', url: 'https://madebyevan.com/webgl-water/' },
    ],
  },

  i50: {
    id: 'i50',
    summary: '물고기 한 마리마다 「너무 가까우면 떨어지기 · 이웃과 같은 방향 · 이웃 가운데로」 세 규칙만 주면, 아무도 지휘하지 않는데 떼가 생긴다.',
    terms: [
      { en: 'Boids (flocking)', ko: '무리 짓기 — 레이놀즈의 새 떼' },
      { en: 'Separation · Alignment · Cohesion', ko: '분리 · 정렬 · 결집 세 규칙' },
      { en: 'Emergent behavior', ko: '단순한 규칙이 모여 생기는 복잡한 움직임' },
      { en: 'Toroidal wrap-around', ko: '화면 끝이 반대편과 이어진 세계' },
    ],
    goal: '{target}에 무리 짓기(boids)를 넣어 줘 — 한 마리마다 분리 · 정렬 · 결집 세 규칙만으로 떼가 생기고, 규칙을 끄면 흩어지게. 분위기는 {style}.',
    targets: ['물고기 떼 바닷속', '새 떼 하늘 배경', '벡터 더하기 수학 체험'],
    styles: ['밝은 열대 바다', '노을 하늘 새 떼', '반딧불이 밤'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 예제 webgl_gpgpu_birds 가 같은 규칙을 GPU 로 수천 마리에 돌린다.',
      unity: 'Unity 는 같은 규칙을 C# 으로, 많으면 Job System 이나 Compute Shader 로.',
    },
    principle: [
      '한 마리마다 가까운 이웃(거리² < 0.012)만 본다 — 떼 전체를 아는 물고기는 없다.',
      '분리: 아주 가까운(거리² < 0.0012) 이웃에게서 거리²에 반비례해 멀어진다.',
      '정렬: 이웃 평균 속도 쪽으로 6% 맞춘다. 결집: 이웃의 평균 위치 쪽으로 5% 다가간다.',
      '작은 흔들림을 더하고 속도를 0.12 ~ 0.28 로 묶는다. 화면 끝은 반대편과 이어져 있어 거리도 짧은 쪽으로 잰다.',
      '정렬 · 결집을 끄면 금방 흩어지고, 켜면 다시 떼가 된다 — 규칙의 효과가 눈에 보인다.',
    ],
    when: ['살아 있는 배경 (물고기 · 새 · 반딧불)', '「단순한 규칙 → 복잡한 모양」 · 벡터 더하기를 보여 줄 때'],
    avoid: ['수천 마리를 CPU 에서 모두 비교 — 마리² 계산이라 느리다. 격자로 이웃을 찾거나 GPU 로', '정해진 길을 가야 하는 캐릭터 — 길찾기가 맞다'],
    cost: 'medium',
    costNote: '견본은 110마리 모두 비교(1만 2천 쌍)라 가볍다. 500마리를 넘기면 격자 이웃 찾기가 필요하다.',
    level: 2,
    must: [
      '물고기는 이웃만 본다 (보는 거리 제한) — 전체 평균을 쓰면 떼가 하나로 뭉치기만 한다',
      '속도 크기를 최소 · 최대 사이로 묶는다 (멈추거나 폭주하지 않게)',
      '끝이 이어진 세계면 거리도 짧은 쪽으로 잰다',
      '규칙 켬/끔 표시를 화면에 보여 차이를 확인할 수 있게',
    ],
    done: [
      '물고기들이 몇 무리로 모여 같은 방향으로 헤엄친다',
      '정렬 · 결집을 끄면 흩어지고, 켜면 다시 모인다 (14초마다 저절로)',
      '포인터를 가까이 대면 물고기가 피해 간다',
      '머리 방향이 헤엄치는 방향과 같고 꼬리가 흔들린다',
    ],
    code: {
      lang: 'ts',
      title: '분리 · 정렬 · 결집 (한 마리 갱신)',
      from: 'demos/demosSim.ts i50 draw() 의 갱신 부분을 정리',
      body: `interface Fish { x: number; y: number; vx: number; vy: number }
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function steer(f: Fish, fish: Fish[], A: number, rules = { sep: true, ali: true, coh: true }) {
  let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
  for (const o of fish) {
    if (o === f) continue;
    let dx = o.x - f.x, dy = o.y - f.y;
    if (dx > A / 2) dx -= A; if (dx < -A / 2) dx += A;     // 끝이 이어진 세계 — 짧은 쪽 거리
    if (dy > 0.5) dy -= 1; if (dy < -0.5) dy += 1;
    const d2 = dx * dx + dy * dy;
    if (d2 < 0.012) {                                     // 보이는 이웃만
      n++; ax += o.vx; ay += o.vy; cx += dx; cy += dy;
      if (d2 < 0.0012) { sx -= dx / (d2 + 1e-4); sy -= dy / (d2 + 1e-4); }
    }
  }
  if (rules.sep) { f.vx += sx * 0.00025; f.vy += sy * 0.00025; }        // 분리
  if (n) {
    if (rules.ali) { f.vx += (ax / n - f.vx) * 0.06; f.vy += (ay / n - f.vy) * 0.06; }  // 정렬
    if (rules.coh) { f.vx += (cx / n) * 0.05; f.vy += (cy / n) * 0.05; }                // 결집
  }
  f.vx += (Math.random() - 0.5) * 0.01;
  f.vy += (Math.random() - 0.5) * 0.01;
  const sp = Math.hypot(f.vx, f.vy);
  const want = clamp(sp, 0.12, 0.28);                    // 너무 느리거나 빠르지 않게
  f.vx = (f.vx / (sp || 1)) * want;
  f.vy = (f.vy / (sp || 1)) * want;
}
// 모두 steer 한 뒤에 위치를 옮긴다: f.x = (f.x + f.vx * dt + A) % A`,
    },
    pitfalls: [
      { title: '한 마리씩 갱신하며 바로 옮기면 앞 물고기의 새 위치가 뒤 계산에 섞인다', fix: '모두 방향을 고친 뒤에 위치를 한꺼번에 옮긴다.' },
      { title: '이웃 거리 제한 없이 전체를 보면 떼가 하나로만 뭉친다', fix: '보는 거리를 짧게 둬야 여러 무리가 생기고 갈라지고 합쳐진다.' },
      { title: '속도를 묶지 않으면 결집 때문에 한 점에 멈춰 버린다', fix: '속도 크기를 최소 · 최대 사이로 정규화한다.' },
      { title: '화면 끝에서 이어지는 세계인데 거리를 그냥 재면 끝에서 떼가 찢어진다', fix: '차이가 절반을 넘으면 세계 폭만큼 빼서 짧은 쪽으로 잰다.' },
    ],
    prev: ['i24'],
    next: ['i47'],
    refs: [
      { name: 'Craig Reynolds — Boids', url: 'https://www.red3d.com/cwr/boids/' },
      { name: 'three.js 예제 — gpgpu birds', url: 'https://threejs.org/examples/#webgl_gpgpu_birds' },
    ],
  },

  i40: {
    id: 'i40',
    summary: '얇은 렌즈 공식 1/f = 1/a + 1/b 로 상의 자리를 구하고 대표 광선 셋을 렌즈에서 꺾어 그려, 물체가 움직이면 실상 · 허상이 생기는 과정을 보여 준다.',
    terms: [
      { en: '2D ray optics (thin lens)', ko: '2D 광선 광학 — 얇은 렌즈' },
      { en: 'Thin lens equation 1/f = 1/a + 1/b', ko: '물체 거리 a · 상 거리 b · 초점 거리 f' },
      { en: 'Principal rays', ko: '대표 광선 셋 — 나란히 · 가운데 · 초점 지나기' },
      { en: "Snell's law n₁sinθ₁ = n₂sinθ₂", ko: '굴절 — 물에서 공기로 꺾이는 빛' },
    ],
    goal: '{target}에 2D 광선 광학을 넣어 줘 — 볼록 렌즈와 대표 광선 셋, 1/f = 1/a + 1/b 로 구한 상, 초점 안쪽이면 점선 허상까지. 분위기는 {style}.',
    targets: ['볼록 렌즈 상 만들기 체험', '돋보기 · 사진기 원리 설명', '빛 꺾임(굴절) 설명'],
    styles: ['어두운 실험실 · 빛나는 광선', '교과서 그림', '칠판 그림'],
    platforms: ['canvas', 'web'],
    principle: [
      '상 거리 b = 1 / (1/f − 1/a), 배율 m = −b/a. b 가 음수면 렌즈 앞쪽에 바로 선 허상, a = f 근처면 상이 생기지 않는다(나란한 빛).',
      '광선 ① 축에 나란히 들어와 렌즈를 지나 뒤 초점으로, ② 렌즈 가운데로 곧게, ③ 앞 초점을 지나 들어와 렌즈 뒤에선 축에 나란히.',
      '세 광선이 실제로 만나는 점이 실상, 허상은 꺾인 광선을 뒤로 이어(점선) 만나는 점이다.',
      '광선은 점선 무늬를 흘려(lineDashOffset) 빛이 나아가는 방향을 보여 준다.',
      '작은 창: 스넬 법칙 θ₂ = asin(n₁/n₂ · sinθ₁) 로 물 → 공기 굴절을 따로 보여 준다.',
    ],
    when: ['렌즈 · 상 · 초점을 눈으로 확인하는 과학 · 수학 체험', '비례식 · 역수 공식이 「왜」 쓰이는지 보여 줄 때'],
    avoid: ['사실적인 3D 빛 · 그림자 — 레이 트레이싱 렌더러나 3D 엔진 조명', '렌즈 두께 · 수차까지 정확히 — 얇은 렌즈 근사를 넘는 계산이 필요하다'],
    cost: 'light',
    costNote: '선 몇 개와 공식 하나 — 폰도 아주 가볍다.',
    level: 2,
    must: [
      'a = f 근처(3% 안)는 「상이 안 생김」으로 따로 처리 (b 가 무한대로 튄다)',
      '초점 안쪽(a < f)이면 허상을 점선 · 바로 선 화살표로',
      '물체 거리 · 초점 거리 슬라이더는 f 의 배수로 (0.4f ~ 3.5f)',
      '화면에 a · b 값과 「실상 · 허상 · 배율」 글을 늘 보여 준다',
    ],
    done: [
      '물체를 2f 에 두면 같은 크기의 거꾸로 선 실상이 2f 에 생긴다',
      '물체가 f 안으로 들어가면 렌즈 앞쪽에 바로 선 큰 허상(점선)이 생긴다',
      '세 광선이 상의 꼭대기 한 점에서 만난다 (허상은 뒤로 이은 점선이 만난다)',
      '구석 창에서 입사각이 바뀌면 굴절각이 스넬 법칙대로 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '얇은 렌즈 공식 · 대표 광선 셋',
      from: 'demos/demosStructure.ts i40 draw() 의 계산 부분을 정리',
      body: `type P = [number, number];
// lx: 렌즈 x · ax: 광축 y · f: 초점 거리(px) · a: 물체 거리 · ho: 물체 높이 · w: 화면 폭
function lensRays(lx: number, ax: number, f: number, a: number, ho: number, w: number) {
  const near = Math.abs(a - f) < f * 0.03;               // 초점 위: 상이 안 생김
  const b = near ? Infinity : 1 / (1 / f - 1 / a);        // 1/f = 1/a + 1/b
  const m = -b / a;                                       // 배율 (음수 = 거꾸로)
  const top: P = [lx - a, ax - ho];                       // 물체 화살 끝
  const ext = (x0: number, y0: number, x1: number, y1: number, toX: number): P => [toX, y0 + ((y1 - y0) * (toX - x0)) / (x1 - x0)];

  const rays: P[][] = [];
  const p1: P = [lx, top[1]];
  rays.push([top, p1, ext(lx, top[1], lx + f, ax, w + 10)]);      // ① 나란히 → 뒤 초점
  rays.push([top, ext(top[0], top[1], lx, ax, w + 10)]);          // ② 가운데 → 곧게
  if (a > f * 1.02) {                                              // ③ 앞 초점 지나 → 나란히
    const hit = ext(top[0], top[1], lx - f, ax, lx);
    rays.push([top, hit, [w + 10, hit[1]]]);
  } else if (a < f * 0.98) {                                       // 초점 안쪽: 초점에서 물체를 지나는 선을 이어
    const hit = ext(lx - f, ax, top[0], top[1], lx);
    rays.push([top, hit, [w + 10, hit[1]]]);
  }
  const image = near ? null : { x: lx + b, h: ho * m, virtual: b < 0 };  // 허상이면 점선으로 그린다
  return { rays, image };
}

// 스넬 법칙 (물 n=1.5 → 공기 n=1.0 쪽 예시)
const refract = (th1: number, n1 = 1.0, n2 = 1.5) => Math.asin(Math.max(-1, Math.min(1, (n1 / n2) * Math.sin(th1))));`,
    },
    pitfalls: [
      { title: 'a = f 에서 b 가 무한대가 되어 상 화살이 화면 밖으로 튄다', fix: 'a 가 f 의 3% 안이면 「상이 안 생김(나란한 빛)」으로 따로 보여 준다.' },
      { title: '허상도 실선으로 그리면 아이들이 진짜 빛이 모인 줄 안다', fix: '허상과 뒤로 이은 광선은 점선 · 옅은 색으로 구별한다.' },
      { title: '세 번째 광선을 초점 안쪽에서도 같은 식으로 그리면 반대로 꺾인다', fix: '초점 안쪽이면 초점에서 물체 끝을 지나는 직선을 렌즈까지 이어 쓴다.' },
      { title: 'asin 에 1 보다 큰 값이 들어가면 NaN 이 된다', fix: '값을 −1 ~ 1 로 묶는다 — 넘으면 전반사다.' },
    ],
    next: ['i39'],
    refs: [
      { name: 'PhET — Geometric Optics', url: 'https://phet.colorado.edu/sims/html/geometric-optics/latest/geometric-optics_all.html' },
      { name: 'Wikipedia — Thin lens', url: 'https://en.wikipedia.org/wiki/Thin_lens' },
    ],
  },

  /* ───────── 원리 설명 · 구조 ───────── */

  i36: {
    id: 'i36',
    summary: '부품마다 「제자리」와 「끼우는 축 방향의 펼친 자리」를 정해 조립 순서대로 미끄러뜨려, 기계가 분해됐다 다시 조립되는 분해도를 만든다.',
    terms: [
      { en: 'Exploded view (assembly animation)', ko: '분해도 — 부품을 축 따라 펼치기' },
      { en: 'Staggered sequencing (smoothstep per step)', ko: '단계마다 시간을 엇갈려 차례로 움직이기' },
      { en: 'Assembly axis guide (LineDashedMaterial)', ko: '끼우는 축을 점선으로 표시' },
      { en: 'Screw motion (translate + rotate)', ko: '나사는 올라가는 만큼 돈다' },
    ],
    goal: '{target}을(를) 분해도로 보여 줘 — 부품이 조립 순서의 반대로 끼우는 축(점선)을 따라 펼쳐졌다가 다시 조립되고, 펼친 상태에선 번호 이름표가 붙게. 분위기는 {style}.',
    targets: ['톱니 상자 (축 · 와셔 · 톱니 · 덮개 · 나사 · 손잡이)', '쌓기나무 · 입체도형 조립', '로봇 · 장난감 부품'],
    styles: ['밝은 제품 설명서', '설계도 · 조립도', '장난감 상자 열기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 부품마다 시작 · 끝 localPosition 을 두고 Animator 나 DOTween 순서(Sequence)로 같은 일을 한다.',
      godot: 'Godot 은 Tween 을 chain() 으로 이어 부품마다 position 을 차례로 옮긴다.',
    },
    principle: [
      '단계 = 조립 순서 (축 → 와셔 → 톱니 → 덮개 → 나사 → 손잡이). 단계마다 부품 목록과 「펼친 방향 · 거리」(off) 하나.',
      '진행 값 u(0 ~ 단계 수)에서 단계 i 의 진행 f = smoothstep(u − (N − 1 − i)) — 분해는 마지막에 끼운 것부터 빠진다.',
      '부품 위치 = 제자리 + off × f. 끼우는 방향으로만 움직이니 「어디에 어떻게 끼우나」가 그대로 보인다.',
      '나사는 올라가는 만큼 돈다(f × 6바퀴). 다 조립됐을 때만 손잡이가 돌고 톱니가 잇수비(18 : 10)대로 맞물려 돈다.',
      '다 펼치면 단계 이름표를 3D 자리에서 화면으로 투영해 지시선과 함께 붙인다 (번호 = 조립 순서).',
    ],
    when: ['기계 · 장난감이 어떻게 생겼는지 · 어떻게 조립하는지 보여 줄 때', '입체를 조각으로 나눠 보여 주는 수학 체험'],
    avoid: ['부품을 그냥 중심에서 사방으로 흩뿌리기 — 어디에 끼우는지 안 보인다. 끼우는 축을 따라', '부품이 수백 개 — 무리로 묶어 단계를 줄인다'],
    cost: 'light',
    costNote: '부품 위치만 바꾼다. 부품 수십 개는 폰도 가볍다 (모양이 많으면 고정 부품은 합쳐 그린다).',
    level: 2,
    must: [
      '부품은 끼우는 축 방향으로만 움직인다 (축을 점선으로 보여 준다)',
      '분해는 조립의 거꾸로 — 마지막에 끼운 것부터 빠진다',
      '맞물리는 부품(톱니 · 나사)은 실제 비율대로 함께 돈다',
      '카메라는 다 펼친 모습이 들어오게 거리를 정한다 (펼칠 때 화면 밖으로 나가지 않게)',
    ],
    done: [
      '조립된 톱니 상자가 손잡이 → 나사(돌며 빠짐) → 덮개 → 톱니 → 와셔 → 축 순서로 펼쳐진다',
      '다 펼치면 「1. 축 2개 … 6. 손잡이 · 마개」 이름표와 지시선이 붙는다',
      '다시 조립되고, 다 조이면 손잡이가 돌며 큰 톱니 1바퀴에 작은 톱니 1.8바퀴',
      '「조립 ↔ 분해」 슬라이더로 아무 단계에서나 멈춰 볼 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '단계별로 축을 따라 펼치기 · 나사 돌리기',
      from: 'demos/demosStructure.ts i36 step() · put() · update() 를 정리',
      body: `import * as THREE from 'three';

const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
type Part = { o: THREE.Object3D; home: THREE.Vector3 };
interface Step { name: string; off: THREE.Vector3; parts: Part[]; spin?: number }
const steps: Step[] = [];                       // 조립 순서대로 넣는다

function step(name: string, off: [number, number, number], spin?: number): Step {
  const s: Step = { name, off: new THREE.Vector3(...off), parts: [], spin };
  steps.push(s);
  return s;
}
function put(s: Step, o: THREE.Object3D, x: number, y: number, z: number, root: THREE.Object3D) {
  o.position.set(x, y, z);
  root.add(o);
  s.parts.push({ o, home: new THREE.Vector3(x, y, z) });
}
// 예: const sShaft = step('축 2개', [0, -1.35, 0]);  const sScrew = step('나사 4개', [0, 2.05, 0], Math.PI * 2 * 6);

/** u: 0 = 다 조립 · N = 다 분해 */
function apply(u: number) {
  const N = steps.length;
  steps.forEach((s, i) => {
    const f = smooth(u - (N - 1 - i));          // 마지막에 끼운 것부터 빠진다
    for (const p of s.parts) {
      p.o.position.copy(p.home).addScaledVector(s.off, f);
      if (s.spin) p.o.rotation.y = -f * s.spin; // 나사: 올라가는 만큼 돈다
    }
  });
}

// 다 조립됐을 때만 톱니가 잇수비대로 맞물려 돈다 (18 : 10)
function turnGears(spin: number, big: THREE.Object3D, small: THREE.Object3D) {
  big.rotation.z = spin;
  small.rotation.z = (-spin * 18) / 10 + Math.PI / 10;   // 반대로 · 1.8배 · 반 이 어긋나 맞물림
}`,
    },
    pitfalls: [
      { title: '부품을 중심에서 사방으로 흩어 놓으면 어디에 끼우는지 모른다', fix: '부품마다 끼우는 축 방향(off)으로만 미끄러지게 하고, 축을 점선으로 보여 준다.', seen: true },
      { title: '모든 부품이 한꺼번에 움직이면 순서가 안 보인다', fix: '단계마다 진행을 1씩 엇갈려(smoothstep(u − 순번)) 하나씩 움직인다.' },
      { title: '톱니가 서로 파고들어 보인다', fix: '작은 톱니를 이 하나 반만큼(π/잇수) 돌려 놓고, 잇수비대로 반대로 돌린다.' },
      { title: '이름표를 3D 글자로 붙이면 돌 때 읽기 어렵다', fix: '3D 자리를 화면 좌표로 투영해 HUD 에 2D 이름표 · 지시선으로 그린다 (i38).' },
    ],
    prev: ['i35'],
    next: ['i37', 'i38'],
  },

  i38: {
    id: 'i38',
    summary: '3D 부품의 한 점을 매 프레임 화면 좌표로 투영해 HTML 이름표와 SVG 지시선을 붙이고, 그 점이 다른 면에 가려지면 이름표를 흐리게 한다.',
    terms: [
      { en: '3D-anchored labels (Vector3.project)', ko: '3D 점을 화면 좌표로 바꿔 이름표 붙이기' },
      { en: 'Leader lines (SVG overlay)', ko: '지시선 — 점에서 이름표까지 선' },
      { en: 'Occlusion test with Raycaster', ko: '카메라에서 쏜 광선으로 가려졌나 확인' },
      { en: 'CSS2DRenderer', ko: 'three.js 가 주는 같은 일의 도우미' },
    ],
    goal: '{target}에 3D 를 따라가는 이름표와 지시선을 붙여 줘 — 물체가 돌아도 이름표가 그 부품을 가리키고, 부품이 뒤로 가면 흐려지게. 분위기는 {style}.',
    targets: ['로켓 · 기계 부품 이름', '입체도형 꼭짓점 · 모서리 이름', '각 · 길이 재기 표시'],
    styles: ['흰 알약 이름표 · 노란 지시선', '설계도 주석', '귀여운 말풍선'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 는 CSS2DRenderer · CSS2DObject 로 같은 투영을 해 준다 — 가려짐 검사는 직접 해야 한다.',
      unity: 'Unity 는 Camera.WorldToScreenPoint 로 화면 좌표를, Physics.Raycast(또는 Linecast)로 가려짐을 확인한다.',
      godot: 'Godot 은 Camera3D.unproject_position() 과 PhysicsRayQueryParameters3D 로 같은 일을 한다.',
    },
    principle: [
      '부품마다 「물체 안 좌표」 한 점을 정해 두고, 매 프레임 matrixWorld 로 세계 좌표 → project(camera) 로 −1 ~ 1 화면 좌표 → 픽셀로 바꾼다.',
      '이름표(HTML div)는 그 점에서 옆으로(화면 폭 20%) 비켜 두고, SVG 선으로 점과 이름표를 잇는다.',
      '가려짐: 카메라에서 그 점 쪽으로 광선을 쏴 먼저 맞은 면이 점보다 0.07 이상 가까우면 「뒤」 — 이름표 35%, 선은 점선 15%.',
      '이름표는 transform: translate 로만 옮겨(will-change) 레이아웃을 다시 계산하지 않게 한다.',
    ],
    when: ['부품 · 장기 · 도형 부분의 이름을 가르칠 때', '돌아가는 3D 물체에 값(각 · 길이)을 붙일 때'],
    avoid: ['이름표가 수십 개 — 겹쳐 읽을 수 없다. 고른 것만 보이게', '글자를 3D 텍스처로 붙이기 — 돌면 비스듬해 읽기 어렵다. 화면 이름표가 낫다'],
    cost: 'light',
    costNote: '이름표마다 투영 한 번 + 광선 한 번. 다섯 개 정도면 아무 부담 없다 (수십 개면 광선 검사를 몇 프레임에 한 번).',
    level: 1,
    must: [
      '투영 전에 scene.updateMatrixWorld() — 이번 프레임 위치로 계산',
      '이름표는 화면 안으로 묶는다 (가장자리에서 잘리지 않게)',
      '가려진 이름표는 숨기지 말고 흐리게 + 「(뒤)」 — 갑자기 사라지면 헷갈린다',
      '이름표 이동은 transform 으로만',
    ],
    done: [
      '로켓이 돌아도 이름표 다섯 개가 각 부품을 계속 가리킨다',
      '부품이 뒤로 돌아가면 이름표가 흐려지고 「(뒤)」 가 붙으며 지시선이 점선이 된다',
      '창 크기를 바꿔도 이름표 자리가 맞다',
      '폰 폭에서도 이름표가 화면 밖으로 나가지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '3D 점 → 화면 이름표 · 가려짐 검사',
      from: 'demos/demosStructure.ts i38 update() 를 정리',
      body: `import * as THREE from 'three';

interface Anchor { name: string; obj: THREE.Object3D; local: THREE.Vector3; side: number; el: HTMLDivElement; line: SVGLineElement }
const ray = new THREE.Raycaster();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function placeLabels(anchors: Anchor[], cam: THREE.PerspectiveCamera, scene: THREE.Scene, hitList: THREE.Object3D[], w: number, h: number, fs: number) {
  scene.updateMatrixWorld();
  for (const a of anchors) {
    const wp = a.local.clone().applyMatrix4(a.obj.matrixWorld);      // 물체 안 점 → 세계
    const sp = wp.clone().project(cam);                              // 세계 → -1 ~ 1
    const x = ((sp.x + 1) / 2) * w;
    const y = ((1 - sp.y) / 2) * h;
    // 가려졌나? 카메라 → 점 사이에 다른 면이 먼저 닿으면 뒤
    const dir = wp.clone().sub(cam.position);
    const dist = dir.length();
    ray.set(cam.position, dir.normalize());
    const hit = ray.intersectObjects(hitList, false)[0];
    const hidden = !!hit && hit.distance < dist - 0.07;
    const lx = clamp(x + a.side * w * 0.2, fs * 3.5, w - fs * 3.5); // 옆으로 비켜, 화면 안으로
    const ly = y - fs * 0.8;
    a.el.style.transform = 'translate(' + lx + 'px, ' + ly + 'px) translate(-50%, -50%)';
    a.el.style.opacity = hidden ? '0.35' : '1';
    a.el.textContent = hidden ? a.name + ' (뒤)' : a.name;
    a.line.setAttribute('x1', String(x)); a.line.setAttribute('y1', String(y));
    a.line.setAttribute('x2', String(lx)); a.line.setAttribute('y2', String(ly));
    a.line.setAttribute('stroke-dasharray', hidden ? '4 4' : '');
  }
}`,
    },
    pitfalls: [
      { title: '이름표가 한 프레임 늦게 따라온다', fix: '투영 전에 updateMatrixWorld 를 불러 이번 프레임의 자리로 계산한다.' },
      { title: '점이 물체 표면 바로 위라 자기 면에 맞아 늘 「가려짐」이 된다', fix: '맞은 거리가 점까지 거리보다 조금(0.07) 더 가까울 때만 가려진 것으로 친다.' },
      { title: '이름표를 left · top 으로 옮기면 매 프레임 레이아웃을 다시 계산해 버벅인다', fix: 'transform: translate 로만 옮기고 will-change: transform 을 준다.' },
      { title: '카메라 뒤로 간 점도 화면에 투영돼 엉뚱한 곳에 이름표가 뜬다', fix: 'project 결과 z 가 1 보다 크면(카메라 뒤) 이름표를 숨긴다.' },
    ],
    prev: ['i36'],
    next: ['i35'],
    refs: [{ name: 'three.js 예제 — CSS2D label', url: 'https://threejs.org/examples/#css2d_label' }],
  },

  /* ───────── 수학 시각화 기법 ───────── */

  i362: {
    id: 'i362',
    summary: '전개도의 면마다 「부모 면과 맞닿은 변」을 경첩 축으로 정해 행렬을 부모에서 자식으로 곱해 내려가며 접어, 전개도가 입체로 접히고 안 되는 전개도는 겹친 면이 빨갛게 보이게 한다.',
    terms: [
      { en: 'Hinged net folding (hierarchical transforms)', ko: '경첩 접기 — 부모 면 기준으로 차례로 돌리기' },
      { en: 'Rotation about an arbitrary axis (Matrix4.makeRotationAxis)', ko: '맞닿은 변을 축으로 돌리기' },
      { en: 'Translate–rotate–translate back', ko: '축 위 점으로 옮겨 돌리고 되돌리기' },
      { en: 'Overlap check (centroid + normal)', ko: '다 접었을 때 두 면이 같은 자리 · 같은 방향이면 겹침' },
    ],
    goal: '{target}을(를) 경첩처럼 접히는 전개도로 만들어 줘 — 면마다 부모 면과 맞닿은 변을 축으로 차례로 접히고, 접히지 않는 전개도는 겹치는 면을 빨갛게. 분위기는 {style}.',
    targets: ['정육면체 · 삼각기둥 · 사각뿔 전개도', '상자 열기 · 선물 상자 연출', '종이 접기 · 팝업 카드'],
    styles: ['파스텔 색종이 면', '골판지 상자', '설계도 선'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 면마다 빈 물체를 맞닿은 변 위에 두고(경첩) 자식으로 면을 달아, 경첩의 localRotation 만 돌리면 같은 효과.',
      godot: 'Godot 도 Node3D 경첩을 맞닿은 변에 두고 자식 면을 달아 rotation 을 돌린다.',
    },
    principle: [
      '전개도 = 평면 위 면 목록. 면마다 부모 면 번호와 접는 각(정육면체 90°, 삼각기둥 옆면 120°, 사각뿔 옆면 180° − acos(1/√3))을 둔다.',
      '부모와 함께 가진 두 꼭짓점이 경첩 축. 면 가운데가 축의 어느 쪽인지로 접는 방향(부호)을 정한다.',
      '면 i 의 행렬 = 부모 행렬 × 옮기기(축 위 점) × 축 회전(부호 × 각 × 진행) × 되돌리기 — 부모가 접히면 자식도 따라간다.',
      '깊이(뿌리에서 몇 번째)마다 0.38초씩 늦춰 접으면 바깥 면이 차례로 일어선다.',
      '다 접은 상태에서 두 면의 가운데가 0.03 안 · 법선이 거의 같으면 겹침 → 그 면들을 빨갛게, 빈 자리는 점선 유령 면으로 보여 준다.',
    ],
    when: ['전개도 · 입체도형 체험', '상자가 열리고 접히는 연출'],
    avoid: ['곡면(원기둥 옆면) — 한 면이 휘어야 해서 경첩 접기로는 안 된다. 정점을 직접 휘게 한다', '면이 수백 장 — 경첩 사슬이 깊어지면 계산 · 정렬이 복잡하다'],
    cost: 'light',
    costNote: '면 6장 · 행렬 곱 몇 번 — 아주 가볍다.',
    level: 2,
    must: [
      '면은 matrixAutoUpdate = false 로 두고 계산한 행렬을 직접 넣는다',
      '부모 → 자식 순서로 계산 (자식이 부모 행렬을 쓴다)',
      '접는 방향은 면 가운데가 축의 어느 쪽인지로 자동으로 (손으로 부호를 넣지 않는다)',
      '겹치는 면은 polygonOffset 으로 깜빡임(z-fighting)을 막는다',
    ],
    done: [
      '정육면체 전개도 ① · ②(계단)가 접혀 정육면체가 된다',
      '안 되는 전개도(같은 쪽 두 장 · 2×3 직사각형)는 다 접으면 겹친 면이 빨갛게 깜빡이고 빈 자리가 점선으로 보인다',
      '삼각기둥 · 사각뿔도 맞는 각으로 접혀 닫힌다',
      '「접은 정도」 슬라이더로 아무 데서나 멈춰 볼 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '경첩 행렬로 전개도 접기',
      from: 'demos/demosMathA.ts i362 의 경첩 준비 · fold() 를 정리',
      body: `import * as THREE from 'three';

type P2 = [number, number];
interface NetFace { pts: P2[]; parent: number; angle: number }   // 뿌리 면은 parent = -1

const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), tmpC = new THREE.Matrix4();
const centroid = (ps: P2[]): P2 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];

function hinges(faces: NetFace[]) {
  return faces.map((f) => {
    if (f.parent < 0) return { P: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), sign: 1 };
    const par = faces[f.parent];
    const sh = f.pts.filter((p) => par.pts.some((q) => Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6));
    const a = new THREE.Vector3(sh[0][0], 0, sh[0][1]);
    const b = new THREE.Vector3(sh[1][0], 0, sh[1][1]);
    const axis = b.clone().sub(a).normalize();                 // 맞닿은 변 = 경첩
    const c = centroid(f.pts);
    const cc = new THREE.Vector3(c[0], 0, c[1]).sub(a).applyAxisAngle(axis, 0.1);
    return { P: a, axis, sign: cc.y > 0 ? 1 : -1 };            // 살짝 돌려 위로 가면 + 방향
  });
}

/** ks[i]: 면 i 의 접힌 정도 0 ~ 1 · M[i]: 결과 행렬 (부모가 앞에 있어야 한다) */
function fold(faces: NetFace[], H: ReturnType<typeof hinges>, ks: number[], M: THREE.Matrix4[]) {
  faces.forEach((f, i) => {
    if (f.parent < 0) { M[i].identity(); return; }
    const p = H[i].P;
    tmpA.makeTranslation(p.x, p.y, p.z);
    tmpB.makeRotationAxis(H[i].axis, H[i].sign * f.angle * ks[i]);
    tmpC.makeTranslation(-p.x, -p.y, -p.z);
    M[i].copy(M[f.parent]).multiply(tmpA).multiply(tmpB).multiply(tmpC);   // 부모를 따라간다
  });
}
// 그릴 때: mesh.matrixAutoUpdate = false; mesh.matrix.copy(M[i]);`,
    },
    pitfalls: [
      { title: '면마다 따로 돌리면 바깥 면이 부모를 안 따라가 허공에 뜬다', fix: '자식 행렬 = 부모 행렬 × 경첩 회전 — 부모부터 차례로 계산한다.' },
      { title: '접는 방향 부호를 손으로 넣으면 면마다 틀린다', fix: '면 가운데를 축으로 조금 돌려 위로 가는지 보고 부호를 자동으로 정한다.' },
      { title: '다 접었을 때 겹친 면이 지글지글 깜빡인다', fix: '면마다 다른 polygonOffset 을 줘 깊이를 조금씩 비킨다.' },
      { title: '사각뿔 옆면을 90° 로 접으면 꼭짓점이 안 만난다', fix: '정사각뿔 옆면 각은 180° − acos(1/√3) — 입체마다 실제 이면각을 쓴다.' },
    ],
    prev: ['i339'],
    next: ['i36'],
  },

  i365: {
    id: 'i365',
    summary: '타일 하나의 꼭짓점을 격자 공식으로 만들어 평행 이동으로 이어 깔고 가운데부터 톡톡 튀어나오게 해, 한 꼭짓점에 모인 각의 합이 360° 일 때만 빈틈없이 덮이는 것을 보여 준다.',
    terms: [
      { en: 'Tessellation (tiling)', ko: '테셀레이션 — 빈틈없이 평면 덮기' },
      { en: 'Lattice translation', ko: '격자 벡터만큼 옮겨 이어 깔기' },
      { en: 'Vertex angle sum = 360°', ko: '한 꼭짓점에 모인 각의 합' },
      { en: 'Escher-style edge modification', ko: '한 변을 바꾼 만큼 맞은편도 똑같이 — 변형 타일' },
    ],
    goal: '{target}에 빈틈없이 까는 무늬(테셀레이션)를 넣어 줘 — 타일을 평행 이동으로 이어 깔고, 가운데 꼭짓점의 각과 합 360° 를 보여 주고, 변형 타일도. 분위기는 {style}.',
    targets: ['정다각형 깔기 비교 (3 · 4 · 6 · 5 · 8+4)', '바닥 · 배경 무늬', '에셔풍 변형 타일'],
    styles: ['짙은 남색 타일 · 금빛 각', '알록달록 모자이크', '목욕탕 타일'],
    platforms: ['canvas', 'three', 'web'],
    principle: [
      '정삼각형 격자: 점 p(i, j) = e·(i + j/2, j·√3/2) — 칸마다 위 · 아래 삼각형 둘.',
      '정육각형: 가운데 (1.5e·i, (√3/2·i + √3·j)·e) 에서 꼭짓점 여섯. 팔각+사각: 간격 e(1+√2) 격자에 정팔각형, 틈마다 정사각형.',
      '정오각형(108°)은 셋 모으면 324° — 36° 빈틈이 남아 덮을 수 없다. 빈틈을 빨간 부채꼴로 보여 준다.',
      '변형 타일: 정사각형의 아래 변을 베지에 곡선으로 휘면 위 변도 똑같이, 왼 변을 휘면 오른 변도 — 평행 이동만으로 빈틈없이 맞는다.',
      '타일마다 가운데에서 거리만큼 늦게, 튀는 이징(backOut)으로 커지며 나타나 「깔리는」 느낌을 준다.',
    ],
    when: ['도형 · 대칭 · 각의 합을 보여 줄 때', '반복 무늬 배경 · 바닥을 코드로 만들 때'],
    avoid: ['아주 넓은 화면을 작은 타일로 매 프레임 다시 계산 — 한 번 캔버스에 구워 패턴으로 쓴다', '사진 같은 질감 바닥 — 텍스처 그림이 낫다'],
    cost: 'light',
    costNote: '화면을 덮는 타일 수백 개를 경로로 칠할 뿐. 깔기가 끝나면 구워 두면 더 가볍다.',
    level: 2,
    must: [
      '꼭짓점 좌표는 격자 공식으로 정확히 (눈대중 좌표 금지 — 틈이 생긴다)',
      '덮이지 않는 경우(정오각형)도 보여 주고 빈틈 각을 숫자로',
      '가운데 꼭짓점의 각을 부채꼴 + 숫자로, 합 360° 를 식으로',
      '변형 타일은 한 변을 바꾸면 맞은편 변을 같은 곡선으로 (평행 이동이면 그대로 · 회전이면 돌린 곡선)',
    ],
    done: [
      '정삼각형 · 정사각형 · 정육각형이 가운데부터 깔리고, 가운데 꼭짓점에 60°×6 · 90°×4 · 120°×3 = 360° 가 보인다',
      '정오각형 셋을 모으면 「빈틈 36°」 가 빨갛게 보인다',
      '정팔각형 + 정사각형(135° + 135° + 90°)도 빈틈없이 덮인다',
      '변형 타일이 정사각형에서 구불구불한 모양으로 바뀌어도 빈틈이 없다',
    ],
    code: {
      lang: 'ts',
      title: '격자로 타일 꼭짓점 만들기 (삼각형 · 육각형 · 변형 타일)',
      from: 'demos/demosMathA.ts i365 tiles() 를 정리',
      body: `type P2 = [number, number];
const R3 = Math.sqrt(3);

// 정삼각형: 칸마다 위 · 아래 둘
function triTiles(e: number, N: number): P2[][] {
  const p = (i: number, j: number): P2 => [e * (i + j / 2), e * ((j * R3) / 2)];
  const out: P2[][] = [];
  for (let i = -N * 2; i <= N * 2; i++)
    for (let j = -N; j <= N; j++) {
      out.push([p(i, j), p(i + 1, j), p(i, j + 1)]);
      out.push([p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)]);
    }
  return out;
}

// 정육각형: 가운데 격자 + 꼭짓점 여섯
function hexTiles(e: number, N: number): P2[][] {
  const out: P2[][] = [];
  for (let i = -N; i <= N; i++)
    for (let j = -N; j <= N; j++) {
      const c: P2 = [e + 1.5 * e * i, ((R3 / 2) * i + R3 * j) * e];
      const pts: P2[] = [];
      for (let k = 0; k < 6; k++) pts.push([c[0] + e * Math.cos((k * Math.PI) / 3), c[1] + e * Math.sin((k * Math.PI) / 3)]);
      out.push(pts);
    }
  return out;
}

// 변형 타일: 아래 변 곡선 = 위 변 곡선 (e 만큼 옮긴 것), 왼 변 = 오른 변
function bez(p0: P2, c1: P2, c2: P2, p3: P2, k: number): P2 {
  const m = 1 - k;
  return [m * m * m * p0[0] + 3 * m * m * k * c1[0] + 3 * m * k * k * c2[0] + k * k * k * p3[0],
          m * m * m * p0[1] + 3 * m * m * k * c1[1] + 3 * m * k * k * c2[1] + k * k * k * p3[1]];
}
const bot = (x: number, y: number, e: number, m: number): P2[] =>
  Array.from({ length: 10 }, (_, k) => bez([x, y], [x + 0.3 * e, y - 0.32 * e * m], [x + 0.7 * e, y + 0.26 * e * m], [x + e, y], k / 10));
// 타일 (x, y): 아래 = bot(x, y) · 위 = bot(x, y + e) 를 거꾸로 — 같은 곡선이라 이웃과 꼭 맞는다`,
    },
    pitfalls: [
      { title: '꼭짓점을 반올림한 좌표로 그리면 타일 사이에 실금이 보인다', fix: '격자 공식으로 정확한 좌표를 쓰고, 테두리 선을 살짝 겹쳐 그린다.' },
      { title: '변형 타일에서 한 변만 바꾸면 이웃과 겹치거나 틈이 생긴다', fix: '바꾼 변의 맞은편 변을 같은 곡선으로 — 위 변은 아래 변을 e 만큼 옮긴 것.' },
      { title: '「정오각형은 왜 안 되나」를 말로만 하면 안 와닿는다', fix: '셋을 모아 놓고 빈틈 36° 를 빨간 부채꼴과 숫자로 보여 준다.' },
      { title: '화면 밖까지 수천 개를 만들면 느리다', fix: '타일 가운데가 화면 반지름 안인 것만 남긴다.' },
    ],
    next: ['i382'],
    refs: [{ name: 'Wikipedia — Euclidean tilings by convex regular polygons', url: 'https://en.wikipedia.org/wiki/Euclidean_tilings_by_convex_regular_polygons' }],
  },

  i380: {
    id: 'i380',
    summary: '공 하나하나가 핀마다 왼쪽 · 오른쪽을 반반 확률로 실제로 골라 떨어지며 칸에 쌓이고, 그 막대 위에 이론 이항 분포 선을 겹쳐 반복 실험이 종 모양으로 모이는 것을 보여 준다.',
    terms: [
      { en: 'Galton board (bean machine)', ko: '갈톤 판 — 핀에 튀는 공' },
      { en: 'Binomial distribution B(n, ½)', ko: '이항 분포 — n 번 중 오른쪽이 k 번' },
      { en: 'Monte Carlo simulation', ko: '진짜 무작위로 여러 번 시행' },
      { en: 'Sum of dice → normal shape', ko: '주사위 여러 개의 합도 종 모양으로' },
    ],
    goal: '{target}에 반복 실험 시뮬레이션을 넣어 줘 — 공이 핀마다 반반으로 튀어 칸에 쌓이고, 쌓인 막대 위에 이론 곡선을 겹쳐 보여 주게. 분위기는 {style}.',
    targets: ['갈톤 판 체험', '주사위 여러 개 합의 분포', '확률 게임 결과 그래프'],
    styles: ['어두운 판 · 금빛 공', '나무 핀볼 판', '깔끔한 통계 그래프'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '공이 생길 때 줄마다 Math.random() < 0.5 로 오른쪽(1) · 왼쪽(0)을 미리 정해 「몇 번째 칸으로 가나」 누적 배열(ks)을 만든다 — 진짜 무작위 시행.',
      '그림은 그 길을 따라 줄 사이를 보간하며 튀는 호(sin)로 움직이고, 바닥 막대 높이에 닿으면 그 칸 개수를 1 늘린다.',
      '이론: 공 N 개면 칸 k 의 기대 개수 = N · C(R, k) / 2^R. 이 값을 점 · 선으로 막대 위에 겹친다.',
      '막대 · 이론 선은 같은 배율(가장 큰 값 기준)로 그려야 비교된다. 공이 늘수록 막대가 선에 붙는다.',
      '주사위 m 개의 합은 한 개 분포를 m 번 겹쳐(합성곱) 이론 분포를 구하고, 실제로 굴린 합의 막대와 비교한다.',
    ],
    when: ['확률 · 통계를 「직접 해 보면 이렇게 된다」로 보여 줄 때', '게임 결과(주사위 · 뽑기)의 분포를 그래프로'],
    avoid: ['결과를 이론값에서 바로 그리기 — 실험 느낌이 없다. 진짜 무작위로 하나씩', '공 수만 개를 하나씩 그리기 — 떨어진 공은 칸 숫자로만 남긴다'],
    cost: 'light',
    costNote: '공은 초당 60개, 최대 500개 · 떨어지면 칸 숫자 하나. 움직이는 공 수십 개만 그린다.',
    level: 2,
    must: [
      '무작위는 공마다 실제로 (분포를 흉내 내지 않는다)',
      '막대와 이론 선은 같은 배율로',
      '공 수 · 줄 수 R 을 화면에 보여 주고 바꿀 수 있게',
      '다 떨어지면 잠시 보여 준 뒤 다시 시작',
    ],
    done: [
      '공이 핀에 튀며 떨어져 칸에 쌓이고, 막대가 종 모양으로 자란다',
      '흰 이론 선(B(R, ½))이 막대 위에 겹쳐 보이고, 공이 늘수록 막대가 선에 가까워진다',
      '줄 수를 바꾸면 칸 수와 이론 선이 함께 바뀐다',
      '주사위 모드에서 주사위 개수를 늘리면 합의 분포가 점점 종 모양이 된다',
    ],
    code: {
      lang: 'ts',
      title: '공마다 진짜 무작위 길 · 이론 기대 개수',
      from: 'demos/demosMathB.ts i380 galton() · choose() · diceDist() 를 정리',
      body: `interface Ball { age: number; ks: Uint8Array }   // ks[r] = r 줄까지 오른쪽으로 간 횟수

function newBall(R: number): Ball {
  const ks = new Uint8Array(R + 1);
  for (let r = 0; r < R; r++) ks[r + 1] = ks[r] + (Math.random() < 0.5 ? 1 : 0);   // 핀마다 반반
  return { age: -Math.random() * 0.05, ks };
}

const choose = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
/** 공 total 개일 때 칸 k 의 기대 개수 — 이항 분포 B(R, 1/2) */
const expected = (total: number, R: number, k: number) => (total * choose(R, k)) / 2 ** R;

/** 주사위 m 개 합의 분포 (합성곱) */
function diceDist(m: number): number[] {
  let d = [1];
  for (let k = 0; k < m; k++) {
    const nd = new Array(d.length + 5).fill(0);
    d.forEach((v, i) => { for (let f = 0; f < 6; f++) nd[i + f] += v / 6; });
    d = nd;
  }
  return d;                                           // d[i] = 합이 m + i 일 확률
}

// 막대 · 이론 선은 같은 배율로: mx = max(bins[k], expected(...)) 로 sc = 높이 / mx`,
    },
    pitfalls: [
      { title: '이론 분포에서 결과를 뽑아 막대를 그리면 「실험」이 아니다', fix: '공마다 핀마다 실제로 반반을 골라 떨어뜨린다 — 막대가 흔들리며 선에 다가가는 것이 핵심.', seen: true },
      { title: '막대와 이론 선의 배율이 다르면 맞는지 비교가 안 된다', fix: '둘 중 가장 큰 값으로 같은 배율을 정한다.' },
      { title: '이항 계수를 팩토리얼로 구하면 줄 수가 커질 때 넘친다', fix: '곱하고 나누기를 번갈아(r = r · (n − k + i) / i) 계산한다.' },
      { title: '떨어진 공을 계속 그리면 수백 개가 쌓여 느려진다', fix: '바닥에 닿으면 칸 숫자만 올리고 공은 지운다.' },
    ],
    next: ['i382'],
    refs: [
      { name: 'Wikipedia — Galton board', url: 'https://en.wikipedia.org/wiki/Galton_board' },
      { name: 'Wikipedia — Binomial distribution', url: 'https://en.wikipedia.org/wiki/Binomial_distribution' },
    ],
  },

  i382: {
    id: 'i382',
    summary: '도형 하나를 같은 규칙으로 쪼개는 함수를 자기 자신으로 다시 부르는 재귀로 시에르핀스키 삼각형 · 코흐 눈송이를 그리고, 무작위 점 찍기(카오스 게임)로도 같은 삼각형이 생기게 한다.',
    terms: [
      { en: 'Recursive fractal drawing', ko: '재귀로 그리는 프랙탈' },
      { en: 'Sierpinski triangle · Koch snowflake', ko: '시에르핀스키 삼각형 · 코흐 눈송이' },
      { en: 'Chaos game (iterated function system)', ko: '카오스 게임 — 꼭짓점 쪽으로 반씩 뛰기' },
      { en: 'Self-similarity', ko: '자기 닮음 — 부분이 전체를 닮음' },
    ],
    goal: '{target}에 재귀로 그리는 프랙탈을 넣어 줘 — 단계를 올릴 때마다 같은 규칙으로 쪼개고, 단계마다 개수 · 둘레 · 넓이 숫자가 바뀌게. 분위기는 {style}.',
    targets: ['시에르핀스키 · 코흐 눈송이 설명', '배경 무늬 · 눈송이 장식', '수열 · 극한 체험'],
    styles: ['밤하늘 금빛 선', '하얀 눈송이', '색종이 오리기'],
    platforms: ['canvas', 'three', 'web'],
    principle: [
      '시에르핀스키: tri(a, b, c, n) 는 n = 0 이면 삼각형을 그리고, 아니면 세 변의 가운데 점으로 작은 삼각형 셋을 만들어 tri(…, n − 1) 를 세 번 부른다.',
      '단계 n 이면 삼각형 3ⁿ 개, 넓이 (3/4)ⁿ → 0, 둘레 (3/2)ⁿ → 무한.',
      '코흐: 변마다 1/3 · 2/3 점을 잡고 가운데 1/3 을 60° 돌려 뾰족이를 세운다 — 변 3·4ⁿ 개, 둘레 (4/3)ⁿ, 넓이는 8/5 배로 다가간다.',
      '마지막 단계만 진행 k(0 → 1)로 섞으면(가운데 점 → 뾰족이) 단계가 부드럽게 자란다.',
      '카오스 게임: 아무 점에서 시작해 세 꼭짓점 중 하나를 무작위로 골라 그 쪽으로 반만 뛰기를 수천 번 — 점이 시에르핀스키 삼각형 위에만 모인다.',
    ],
    when: ['같은 규칙의 반복 · 수열 · 극한을 보여 줄 때', '눈송이 · 나뭇가지 같은 자연스러운 무늬를 코드로'],
    avoid: ['단계를 너무 높이기(시에르핀스키 9단계 이상) — 3ⁿ 으로 늘어 한 프레임에 못 그린다', '카오스 게임 점을 매 프레임 다시 찍기 — 화면 밖 캔버스에 쌓아 두고 붙인다'],
    cost: 'light',
    costNote: '7단계 시에르핀스키 = 삼각형 2,187개 · 코흐 6단계 = 변 12,288개 경로 하나. 카오스 게임 점 1만 4천 개는 따로 캔버스에 쌓아 한 번에 붙인다.',
    level: 2,
    must: [
      '재귀는 단계 n 을 줄여 가며 n = 0 에서 멈춘다 (끝 조건 먼저)',
      '한 단계 전체를 경로 하나에 모아 fill · stroke 한 번 (삼각형마다 따로 칠하지 않는다)',
      '단계마다 개수 · 둘레 · 넓이 숫자를 식과 함께 보여 준다',
      '카오스 게임 점은 화면 밖 캔버스에 누적',
    ],
    done: [
      '시에르핀스키 삼각형이 단계마다 가운데가 뚫리며 자라고, 「삼각형 3ⁿ 개 · 넓이 (3/4)ⁿ」 숫자가 바뀐다',
      '코흐 눈송이가 단계마다 뾰족이가 돋아나며, 둘레는 커지고 넓이는 8/5 배에 다가간다',
      '카오스 게임에서 무작위 점이 몇 초 만에 같은 삼각형 무늬를 만든다',
      '단계 슬라이더로 원하는 단계에서 멈출 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '시에르핀스키 재귀 · 코흐 한 단계 · 카오스 게임',
      from: 'demos/demosMathB.ts i382 tri() · koch() · drawChaos() 를 정리',
      body: `type P = [number, number];
const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** 시에르핀스키: 경로에 쌓기만 — 다 쌓은 뒤 fill 한 번 */
function tri(g: CanvasRenderingContext2D, a: P, b: P, c: P, n: number) {
  if (n === 0) {                                  // 끝 조건 먼저
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath();
    return;
  }
  const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
  tri(g, a, ab, ca, n - 1);
  tri(g, ab, b, bc, n - 1);
  tri(g, ca, bc, c, n - 1);                       // 가운데는 비운다
}

/** 코흐 한 단계: 변마다 가운데 1/3 을 60° 세우기 (k: 0 평평 → 1 뾰족) */
function kochStep(pts: number[], k: number): number[] {
  const np: number[] = [];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const ax = x0 + (x1 - x0) / 3, ay = y0 + (y1 - y0) / 3;
    const bx = x0 + ((x1 - x0) * 2) / 3, by = y0 + ((y1 - y0) * 2) / 3;
    const vx = bx - ax, vy = by - ay, c = 0.5, s = -Math.sqrt(3) / 2;
    const px = ax + vx * c - vy * s, py = ay + vx * s + vy * c;   // 60° 돌린 꼭대기
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    np.push(x0, y0, ax, ay, mx + (px - mx) * k, my + (py - my) * k, bx, by);
  }
  np.push(pts[pts.length - 2], pts[pts.length - 1]);
  return np;
}

/** 카오스 게임: 무작위 꼭짓점 쪽으로 반씩 — 점은 화면 밖 캔버스에 쌓는다 */
function chaos(off: CanvasRenderingContext2D, V: P[], start: P, n: number): P {
  let cp = start;
  for (let i = 0; i < n; i++) {
    const v = V[Math.floor(Math.random() * 3)];
    cp = mid(cp, v);
    off.fillRect(cp[0] - 0.5, cp[1] - 0.5, 1, 1);
  }
  return cp;
}`,
    },
    pitfalls: [
      { title: '끝 조건을 빼먹거나 n 을 안 줄이면 재귀가 끝나지 않아 탭이 멈춘다', fix: '함수 맨 앞에 n === 0 조건, 부를 때마다 n − 1.' },
      { title: '작은 삼각형마다 fill 을 부르면 수천 번 칠해 느리다', fix: '경로에 모두 쌓은 뒤 fill 한 번.' },
      { title: '카오스 게임 점을 매 프레임 처음부터 다시 찍으면 느려진다', fix: '화면 밖 캔버스에 새 점만 더하고 그 캔버스를 붙인다.' },
      { title: '단계가 뚝 바뀌면 무엇이 늘었는지 안 보인다', fix: '마지막 단계를 진행 값으로 섞어(가운데 점 → 꼭대기) 자라는 모습을 보여 준다.' },
    ],
    prev: ['i365'],
    next: ['i380'],
    refs: [
      { name: 'Wikipedia — Sierpiński triangle', url: 'https://en.wikipedia.org/wiki/Sierpi%C5%84ski_triangle' },
      { name: 'Wikipedia — Koch snowflake', url: 'https://en.wikipedia.org/wiki/Koch_snowflake' },
      { name: 'Wikipedia — Chaos game', url: 'https://en.wikipedia.org/wiki/Chaos_game' },
    ],
  },
};

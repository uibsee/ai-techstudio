import type { TechDoc } from './types';

/**
 * 기술 문서 B05 — 손맛 5 (i208 i214 i216 i217 i220) · 스킬 VFX 18 (i170 ~ i196) · 연출 · 카메라 (u35 ~ u43, i23, i426 ~ i430) · i56 SDF 레이마칭
 * 코드는 견본(demos/*.ts)의 실제 코드에서 발췌 · 정리했다 (from 에 출처).
 */
export const DOCS: Record<string, TechDoc> = {
  /* ═══════════════ 손맛 · 주스 ═══════════════ */

  i208: {
    id: 'i208',
    summary: '보상 동전이 하나씩 간격을 두고 곡선으로 날아가 점수 칸에 쏙 들어가고, 들어갈 때마다 칸이 통 튀며 숫자가 오른다.',
    terms: [
      { en: 'Collect-to-UI animation (coin fly)', ko: '보상이 점수 칸으로 날아가는 연출' },
      { en: 'Quadratic Bezier curve', ko: '시작 · 조절점 · 끝 세 점으로 그리는 곡선' },
      { en: 'Staggered animation', ko: '하나씩 조금씩 늦게 출발 (간격 두기)' },
      { en: 'Squash and bump feedback', ko: '받는 칸이 통 커졌다 돌아오기' },
    ],
    goal: '{target}을(를) 얻으면 하나씩 곡선을 그리며 점수 칸으로 날아가 쏙 들어가게 해 줘 — 들어갈 때마다 칸이 통 튀고 숫자가 1씩 올라. 분위기는 {style}.',
    targets: ['상자에서 나온 동전 10개', '모은 별 · 보석', '정답 보상 점수'],
    styles: ['밤하늘 보라 + 금빛', '귀엽고 아기자기', '반짝이는 카지노'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 화면 좌표의 UI 칸(RectTransform) 위치를 목표로 DOTween 같은 트윈이나 코루틴에서 베지에 식을 직접 계산한다.',
      godot: 'Godot 은 Tween 의 tween_method 로 0 → 1 값을 돌리며 베지에 식으로 위치를 구한다.',
    },
    principle: [
      '상자가 깨지면 동전이 사방으로 흩어진다 — 거리는 (1 − e^(−5t)) 로 빨리 갔다 느려지고, 중력처럼 조금씩 떨어진다.',
      '0.85초 뒤부터 동전 i 번째가 i × 0.055초 늦게 출발한다. 한꺼번에 날면 덩어리로 보이고, 간격을 두면 「하나씩」 세는 맛이 난다.',
      '날아가는 길은 2차 베지에 곡선: 시작점 → 옆으로 비킨 조절점 → 점수 칸. 동전마다 조절점을 좌우로 다르게 두면 길이 겹치지 않는다.',
      '시간 k 를 e = k²(2.2 − 1.2k) 로 바꿔, 처음엔 느리고 칸 가까이서 빨라지게(빨려 드는 느낌) 한다. 0.5초 안에 도착.',
      '도착할 때마다 칸이 1 + 0.35·e^(−14t) 배로 커졌다 돌아오고, 숫자 +1 · 작은 불티가 튄다. 마지막엔 「10개 = 1묶음!」.',
    ],
    when: ['동전 · 별 · 점수 보상을 줄 때 — 얼마나 받았는지 몸으로 느끼게', '「10개면 1묶음」처럼 하나씩 세는 것 자체가 배움일 때'],
    avoid: ['보상이 수백 개일 때 — 하나씩 날리면 너무 길다. 10~20개만 날리고 나머지는 숫자로 한 번에 더한다', '빨리 이어서 눌러야 하는 판 — 연출이 다음 입력을 막지 않게 0.5초 안에 끝낸다'],
    cost: 'light',
    costNote: '동전 10개를 원 · 빛무리로 그리는 2D 계산뿐이라 폰에서도 가볍다. 빛무리는 lighter 섞기 한 번.',
    level: 2,
    must: [
      '동전은 한꺼번에가 아니라 하나씩 간격(0.02~0.15초, 기본 0.055초)을 두고 출발',
      '점수 숫자는 동전이 칸에 「도착한 순간」 1씩 오른다 — 날기 전에 미리 다 더하지 않는다',
      '받는 칸이 도착마다 통 커졌다 돌아온다 (1 + 0.35·e^(−14t))',
      '날아가는 길은 곡선 (2차 베지에), 동전마다 조절점이 달라 겹치지 않게',
      '연출 전체 2초 안 — 다음 판 입력을 막지 않는다',
    ],
    done: [
      '왼쪽(그냥 숫자가 바뀜) · 오른쪽(동전이 날아감)을 나란히 보면, 오른쪽에서 동전이 하나씩 칸에 들어가며 숫자가 1씩 오른다',
      '도착할 때마다 칸이 통 튀고 테두리가 금빛으로 번쩍한다',
      '「동전 사이 간격」 슬라이더로 줄줄이 · 띄엄띄엄이 바로 바뀐다',
      '폰 가로 화면(844×390)에서도 동전과 점수 칸이 또렷하다',
    ],
    code: {
      lang: 'ts',
      title: '동전 하나의 비행 — 간격 출발 · 2차 베지에 · 빨려 드는 이징 · 칸 튀기',
      from: 'demos/demosJuice.ts D208 (scene) 을 정리',
      body: `const N = 10, BREAK = 0.35;  // 동전 수 · 상자 깨지는 때 (초)
const FLY = 0.85, DUR = 0.5; // 날기 시작 · 한 개 비행 시간 (초)
let gap = 0.055;               // 동전 사이 간격

// 흩어진 자리: 빨리 갔다 느려짐 + 조금씩 떨어짐
function scatter(i: number, t: number, ox: number, oy: number, u: number): [number, number] {
  const an = -Math.PI / 2 + (hash(i, 3) - 0.5) * 2.2;
  const sp = (40 + hash(i, 4) * 40) * u;
  const a = Math.max(0, t - BREAK);
  const d = 1 - Math.exp(-a * 5);
  return [ox + Math.cos(an) * sp * d, oy + Math.sin(an) * sp * d + 30 * u * a * a];
}

function coinPos(i: number, ph: number, ox: number, oy: number, cx: number, cy: number, u: number): [number, number] | null {
  const t0 = FLY + i * gap;               // i 번째는 i × gap 늦게 출발
  if (ph < t0) return scatter(i, ph, ox, oy, u);
  const k = (ph - t0) / DUR;
  if (k >= 1) return null;                // 도착 — 이제 칸이 센다
  const [sx, sy] = scatter(i, t0, ox, oy, u);
  const e = k * k * (2.2 - 1.2 * k);      // 처음 느리고 끝에서 빨려 듦
  const c1x = sx - 40 * u * (i % 2 ? 1 : -0.4); // 조절점을 좌우로 다르게
  const c1y = sy - 10 * u;
  return [
    (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * c1x + e * e * cx,
    (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * c1y + e * e * cy,
  ];
}

// 받는 칸: 도착한 개수만큼 숫자 +, 막 도착했으면 통 튐
let arrived = 0, lastArr = 99;
for (let i = 0; i < N; i++) {
  const ta = FLY + i * gap + DUR;
  if (ph >= ta) { arrived++; lastArr = Math.min(lastArr, ph - ta); }
}
const bump = lastArr < 0.3 ? 1 + 0.35 * Math.exp(-lastArr * 14) : 1;`,
    },
    pitfalls: [
      { title: '숫자를 미리 다 올려 두면 동전이 헛날아 보인다', fix: '점수는 동전이 칸에 닿는 순간마다 1씩 올린다. 그래야 동전 = 점수 1 이 이어져 보인다.' },
      { title: '모든 동전이 같은 길로 날면 한 줄로 겹친다', fix: '베지에 조절점을 동전마다 좌우로 다르게(홀짝으로 1 · −0.4) 두고 크기도 날며 30% 줄인다.' },
      { title: '같은 빠르기로 날면 「빨려 드는」 맛이 없다', fix: 'k → k²(2.2 − 1.2k) 처럼 끝에서 빨라지는 이징을 쓴다. 등속은 둥둥 떠다니는 느낌.' },
      { title: '점수 칸 위치를 하드코딩하면 화면 크기마다 빗나간다', fix: '칸 위치는 그릴 때마다 화면 폭 · 높이로 다시 계산한다 (견본은 오른쪽 위 w − 36u, 34u).' },
    ],
    prev: ['i202'],
    next: ['i211', 'i217'],
  },

  i214: {
    id: 'i214',
    summary: '블록이 떨어지거나 친구가 폴짝 착지하는 순간 발밑 좌우로 동글동글 먼지가 굴러 나가, 「쿵」 하는 무게가 느껴진다.',
    terms: [
      { en: 'Landing dust puff', ko: '착지 먼지 뭉게' },
      { en: 'Squash and stretch', ko: '떨어질 땐 길쭉, 닿으면 납작 — 탄력' },
      { en: 'Damped oscillation', ko: 'e^(−at)·cos(bt) 로 출렁이다 잦아들기' },
      { en: 'Game juice', ko: '작은 연출로 손맛 더하기' },
    ],
    goal: '{target}이(가) 바닥에 닿는 순간 발밑 좌우로 동글동글 먼지가 굴러 나가고, 몸이 납작했다 돌아오게 해 줘. 분위기는 {style}.',
    targets: ['떨어지는 숫자 블록', '폴짝 뛰는 캐릭터', '판에 놓는 말'],
    styles: ['따뜻한 모래색 그림책', '귀엽고 아기자기', '먼지 풀풀 서부 사막'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System 하나(Burst 로 좌우 두 방향, Size over Lifetime 키움 · Color over Lifetime 투명)로 같은 먼지를 만든다.',
      godot: 'Godot 은 GPUParticles2D/3D 의 one_shot + explosiveness 1 로 착지 때 한 번에 뿜는다.',
    },
    principle: [
      '닿은 순간부터 0.7초 동안 왼쪽 · 오른쪽에 먼지 덩이를 각각 6개쯤 굴려 보낸다.',
      '덩이는 (1 − e^(−5t)) 로 빨리 퍼졌다 멈추고, 크기는 0.6 + 1.6t 배로 커지며, 투명도는 (1 − t/0.7)·0.85 로 옅어진다.',
      '밝은 덩이 위에 조금 어두운 덩이를 비껴 겹쳐 그려 동글동글 입체감을 낸다.',
      '몸은 떨어질 때 살짝 길쭉, 닿으면 sq = e^(−9t)·cos(30t) 로 납작했다 출렁이며 돌아온다 (가로 1 + 0.22sq, 세로 1 − 0.25sq).',
      '닿는 0.15초 동안 화면이 위아래로 2픽셀쯤 떨려 무게를 더한다.',
    ],
    when: ['블록 놓기 · 캐릭터 착지 · 판에 말 놓기처럼 「닿는 순간」이 있는 곳', '놓은 것이 맞게 들어갔다는 걸 소리 없이도 알려 주고 싶을 때'],
    avoid: ['아주 자주 착지하는 것(초당 여러 번) — 먼지가 화면을 덮는다. 큰 착지에만 쓰고 작은 걸음엔 덩이 수를 줄인다', '공중 · 물속 장면 — 먼지 대신 물결 · 거품을 쓴다'],
    cost: 'light',
    costNote: '착지 한 번에 원 12~30개를 0.7초 그리는 것뿐이라 폰에서도 가볍다.',
    level: 1,
    must: [
      '먼지는 좌우 양쪽으로 — 한쪽만 나오면 미끄러진 것처럼 보인다',
      '덩이는 빨리 퍼졌다 멈추고(감속), 커지며 옅어진다. 0.7초 안에 사라진다',
      '몸 납작함은 출렁이다 잦아드는 감쇠 진동(e^(−at)·cos(bt))으로',
      '먼지 양은 조절 값 하나(배율)로 바꿀 수 있게',
    ],
    done: [
      '나란히 비교에서 왼쪽은 블록이 그냥 멈추고, 오른쪽은 먼지가 좌우로 굴러 나가며 블록이 납작했다 돌아온다',
      '폴짝 뛰는 친구도 착지 때 같은 먼지가 조금 작게(0.85배) 나온다',
      '「먼지 양」 슬라이더(0.3 ~ 2.5)로 덩이 수가 바로 바뀐다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '착지 먼지 덩이 그리기 (a = 닿은 뒤 지난 초)',
      from: 'demos/demosJuice.ts D214 puffs() 를 정리',
      body: `const TAU = Math.PI * 2;
let amount = 1; // 먼지 양 배율

function puffs(g: CanvasRenderingContext2D, x: number, y: number, a: number, u: number, seed: number, scale: number): void {
  if (a < 0 || a > 0.7) return;               // 0.7초 동안만
  const n = Math.round(5 * amount) + 1;
  for (const side of [-1, 1]) {                // 왼쪽 · 오른쪽
    for (let i = 0; i < n; i++) {
      const sp = (24 + hash(i, seed + side) * 26) * u * scale;
      const d = sp * (1 - Math.exp(-a * 5));   // 빨리 퍼졌다 멈춤
      const px = x + side * (6 * u * scale + d);
      const py = y - (2 + hash(i, seed + 7) * 6) * u * scale * Math.min(1, a * 4) - a * 6 * u;
      const r = (4 + hash(i, seed + 3) * 5) * u * scale * (0.6 + a * 1.6); // 커지며
      const al = (1 - a / 0.7) * 0.85;                                      // 옅어짐
      g.fillStyle = 'rgba(255,248,235,' + al + ')';
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(200,180,160,' + al * 0.5 + ')'; // 비껴 겹친 그늘 덩이
      g.beginPath(); g.arc(px + r * 0.2, py + r * 0.3, r * 0.7, 0, TAU); g.fill();
    }
  }
}

// 몸: 닿은 뒤 납작했다 출렁이며 돌아옴
const sq = Math.exp(-a * 9) * Math.cos(a * 30);
const sx = 1 + 0.22 * sq, sy = 1 - 0.25 * sq;
// 화면: 닿은 0.15초만 살짝 떨림
const shake = a >= 0 && a < 0.15 ? Math.sin(a * 120) * 2 * u * (1 - a / 0.15) : 0;`,
    },
    pitfalls: [
      { title: '먼지를 같은 크기로 두면 종이 오린 것처럼 딱딱하다', fix: '덩이마다 반지름 · 거리 · 높이를 hash 로 조금씩 다르게, 퍼지며 커지게 한다.' },
      { title: '납작함을 한 번 줄였다 펴기만 하면 고무 느낌이 없다', fix: 'e^(−9t)·cos(30t) 처럼 두세 번 출렁이다 잦아들게 한다.' },
      { title: '먼지를 몸보다 위에 그리면 발을 가린다', fix: '그림자 → 몸 → 먼지 순서로 그리되 먼지는 발밑 높이(y − 2~8)에서 시작해 몸통을 덮지 않게.' },
    ],
    prev: ['i208'],
    next: ['i178'],
  },

  i216: {
    id: 'i216',
    summary: '빠르게 달릴 때 카메라 둘레로 가는 빛줄이 휙휙 지나가게 해서, 속도가 오를수록 선이 길어지고 진해지며 시야도 넓어진다.',
    terms: [
      { en: 'Speed lines (3D motion streaks)', ko: '3D 속도선 — 질주감' },
      { en: 'InstancedMesh', ko: '같은 선 110개를 그리기 한 번에' },
      { en: 'Additive blending', ko: '빛 더하기 섞기 — 겹칠수록 밝게' },
      { en: 'FOV kick', ko: '빨라질 때 시야각 넓히기' },
    ],
    goal: '{target}이(가) 빨라지면 카메라 둘레로 가는 빛줄이 흐르게 해 줘 — 속도에 비례해 길어지고 진해지며 시야도 살짝 넓어지게. 분위기는 {style}.',
    targets: ['부스터를 켠 꼬마 자동차', '빠르게 굴러가는 공', '앞으로 돌진하는 캐릭터'],
    styles: ['맑은 낮 하늘', '귀엽고 아기자기', '밤 네온 질주'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 카메라 자식으로 둔 Particle System(Stretched Billboard, Speed Scale) 이나 URP 의 Radial Blur 대신 같은 선 메시로 만든다.',
      godot: 'Godot 은 카메라 자식 GPUParticles3D(Draw Pass 에 길쭉한 QuadMesh, particle_flag_align_y) 로 만든다.',
    },
    principle: [
      '가는 판(0.022 × 1) 110개를 InstancedMesh 로 한 번에 그린다. 판은 가운데가 밝고 양 끝이 사라지는 세로 그러데이션 텍스처.',
      '선은 카메라 축 둘레 반지름 1.6 ~ 4.2 원통 위에 흩어 두고, 앞에서 뒤로(z 증가) 속도 × 1.35 로 흐르다 카메라 뒤(z > 6)로 가면 앞(−24 ~ −30)으로 되돌린다.',
      '속도 boost(0~1)에 따라 선 길이 0.6 + 4.5·boost, 투명도 (boost − 0.08)·1.4·0.85 — 느릴 땐 아예 안 보인다.',
      '빛 더하기(Additive) · 깊이 안 씀 · 안개 끔으로 그려 겹칠수록 밝고 멀리서도 흐려지지 않는다.',
      '시야각을 55° → 55 + 14·boost 로 넓혀 앞으로 빨려 드는 느낌을 더한다.',
    ],
    when: ['부스터 · 돌진 · 빠른 공처럼 「지금 빠르다」를 보여 줄 때', '배경이 단순해 속도감이 안 날 때 (평평한 길 · 하늘)'],
    avoid: ['느리게 생각하는 퍼즐 판 — 산만하다', '카메라가 위에서 내려다보는 판 게임 — 선이 판을 가린다. 대신 물체 뒤 잔상 꼬리를 쓴다'],
    cost: 'light',
    costNote: 'InstancedMesh 하나라 그리기 1번, 매 프레임 행렬 110개만 바꾼다. 폰에서도 가볍다.',
    level: 1,
    must: [
      '선은 InstancedMesh 하나로 (선마다 Mesh 를 만들지 않는다)',
      '재질은 AdditiveBlending · depthWrite: false · fog: false · toneMapped: false',
      '선은 카메라 축 둘레에만 — 화면 한가운데(진행 방향)는 비워 둔다',
      '속도가 느리면 투명도 0 — 늘 보이면 속도감이 없어진다',
      'frustumCulled = false (인스턴스가 처음 자리 밖으로 흘러가도 잘리지 않게)',
    ],
    done: [
      '나란히 비교에서 오른쪽만 부스터를 켤 때 카메라 둘레로 빛줄이 흐르고, 끄면 사라진다',
      '빨라질수록 선이 길어지고 진해지며 시야각이 55° → 69° 로 넓어진다',
      '선이 화면 가운데 차 · 길을 가리지 않는다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '속도선 InstancedMesh — 카메라 둘레에서 흐르다 되돌아오기',
      from: 'demos/demosJuice.ts D216 (make · update) 를 정리',
      body: `const N = 110;
const lGeo = new THREE.PlaneGeometry(0.022, 1);
lGeo.rotateX(Math.PI / 2); // 판을 z(진행) 방향으로 눕힘
const lMat = new THREE.MeshBasicMaterial({
  map: lineTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
});
const lines = new THREE.InstancedMesh(lGeo, lMat, N);
lines.frustumCulled = false;
scene.add(lines);
const lz = new Float32Array(N);
for (let i = 0; i < N; i++) lz[i] = -hash(i, 5) * 28;
const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion();
const zAxis = new THREE.Vector3(0, 0, 1), vp = new THREE.Vector3(), vs = new THREE.Vector3();

function updateLines(t: number, dt: number, v: number, boost: number): void {
  const lineLen = 0.6 + boost * 4.5;
  for (let i = 0; i < N; i++) {
    lz[i] += v * dt * 1.35;
    if (lz[i] > 6) lz[i] = -24 - hash(i, Math.floor(t)) * 6; // 카메라 뒤로 가면 앞으로
    const an = hash(i, 7) * Math.PI * 2;
    const r = 1.6 + hash(i, 8) * 2.6;                       // 가운데는 비움
    vp.set(Math.cos(an) * r, 1.4 + Math.sin(an) * r * 0.75, lz[i]);
    qn.setFromAxisAngle(zAxis, an - Math.PI / 2);
    vs.set(1, 1, lineLen * (0.6 + hash(i, 9) * 0.8));
    lines.setMatrixAt(i, m4.compose(vp, qn, vs));
  }
  lines.instanceMatrix.needsUpdate = true;
  lMat.opacity = THREE.MathUtils.clamp((boost - 0.08) * 1.4, 0, 1) * 0.85;
  cam.fov = 55 + boost * 14; // 빨라지면 시야도 넓게
  cam.updateProjectionMatrix();
}`,
    },
    pitfalls: [
      { title: '선마다 Mesh 를 만들면 그리기 호출이 100번 넘는다', fix: '같은 모양이니 InstancedMesh 하나로. 이 사이트는 물체 하나씩 그리기가 느려진 원인 1순위였다.', seen: true },
      { title: '안개를 켠 채 두면 먼 선이 배경색으로 묻힌다', fix: '선 재질만 fog: false. 장면 안개는 그대로 둔다.' },
      { title: '선을 진행 방향 한가운데에도 두면 앞이 안 보인다', fix: '반지름 1.6 이상 원통 위에만 둔다.' },
      { title: '시야각을 확 바꾸면 멀미가 난다', fix: 'boost 를 lerp(1 − e^(−3dt)) 로 부드럽게 올리고, 넓히는 폭은 +14° 안으로.' },
    ],
    prev: ['i426'],
    next: ['i199'],
  },

  i217: {
    id: 'i217',
    summary: '진행 막대를 물이 차오르는 병 · 관으로 그려서, 값이 바뀌면 물이 출렁이며 살짝 넘쳤다 가라앉는다.',
    terms: [
      { en: 'Liquid progress bar (fill gauge)', ko: '물이 차오르는 진행 막대' },
      { en: 'Damped spring', ko: '용수철 + 감쇠 — 지나쳤다 돌아오기' },
      { en: 'Slosh (wave surface)', ko: '출렁임 — 속도 변화가 수면을 흔듦' },
      { en: 'Canvas clip path', ko: '병 모양으로 잘라 그리기' },
    ],
    goal: '{target}을(를) 물이 출렁이며 차오르는 게이지로 그려 줘 — 값이 바뀌면 살짝 넘쳤다 가라앉고 수면이 흔들리게. 분위기는 {style}.',
    targets: ['분수 · 백분율 진행 막대', '들이(물의 양) 문제 병', '경험치 게이지'],
    styles: ['밤바다 파랑', '귀엽고 아기자기', '마법 물약 보라'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 Image(Filled) 대신 셰이더(Shader Graph)에서 수면 높이 uniform 과 sin 물결로 잘라 그린다.',
      godot: 'Godot 은 TextureProgressBar 대신 canvas_item 셰이더에서 UV.y 와 sin 물결로 수면을 그린다.',
    },
    principle: [
      '보이는 높이 lv 가 목표값을 용수철로 쫓는다: 가속 = (목표 − lv)·70 − 속도·8. 감쇠가 약해서 목표를 살짝 넘었다 돌아온다.',
      '출렁임 slosh 는 또 하나의 용수철인데, 높이의 가속도(acc)를 조금(0.02) 받아 흔들린다 — 빨리 찰수록 크게 출렁인다.',
      '수면은 sin 물결 + 기울기(slosh 비례)로 그리고, 앞 · 뒤 두 겹을 반대로 기울여 물 두께를 낸다.',
      '병 · 관 모양 경로로 clip 한 뒤 물을 그리면 모양 밖으로 안 넘친다. 거품은 아래에서 올라오다 수면 위에선 안 그린다.',
    ],
    when: ['분수 · 백분율 · 들이처럼 「얼마나 찼나」가 수학 내용일 때', '진행 막대가 밋밋해서 눈에 안 띌 때'],
    avoid: ['값이 아주 자주 바뀌는 막대(매 프레임) — 늘 출렁여 읽기 어렵다. 그땐 출렁임 배율을 낮춘다', '정확한 눈금 읽기가 목표인 문제 — 넘침이 헷갈린다. 눈금 문제는 넘침 없이'],
    cost: 'light',
    costNote: '2D 경로 몇 개와 그러데이션뿐. 폰에서도 가볍다.',
    level: 1,
    must: [
      '높이는 목표로 순간 이동하지 않고 용수철(가속 = (목표 − 값)·70 − 속도·8)로',
      '출렁임은 높이의 가속도에서 나오게 — 그냥 늘 흔들리는 물결이 아니다',
      '물은 병 모양으로 clip 해서 밖으로 안 넘치게',
      'dt 는 0.05초로 잘라 탭이 숨었다 돌아와도 터지지 않게',
      '출렁임 세기는 조절 값 하나로',
    ],
    done: [
      '1/4 → 2/4 → 3/4 → 가득 으로 바뀔 때마다 물이 출렁이며 차오르고, 목표를 살짝 넘었다 가라앉는다',
      '아래 「그냥 막대」와 비교하면 위 병 · 관만 출렁인다',
      '「출렁임」 슬라이더를 0 으로 두면 잔잔하게 찬다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '용수철 높이 + 출렁임 + 물결 수면',
      from: 'demos/demosJuice.ts D217 draw() 를 정리',
      body: `let lv = 0, vel = 0;      // 보이는 높이 · 속도
let slosh = 0, sv = 0;    // 출렁임 · 그 속도
let wobble = 1;           // 출렁임 배율

function step(target: number, dt0: number): void {
  const dt = Math.min(dt0, 0.05);
  const acc = (target - lv) * 70 - vel * 8; // 약한 감쇠 → 살짝 넘침
  vel += acc * dt;
  lv += vel * dt;
  // 빨리 찰수록(가속이 클수록) 크게 출렁
  const sa = -slosh * 60 - sv * 3 + acc * 0.02 * wobble;
  sv += sa * dt;
  slosh += sv * dt;
}

// 수면 한 겹: 병 모양으로 clip 한 뒤 아래를 채운다
function water(g: CanvasRenderingContext2D, x0: number, x1: number, yy: number, tilt: number, t: number, u: number, bottom: number): void {
  const amp = Math.max(-0.6, Math.min(0.6, slosh));
  const cx = (x0 + x1) / 2;
  g.beginPath();
  g.moveTo(x0, bottom);
  for (let k = 0; k <= 24; k++) {
    const x = x0 + ((x1 - x0) * k) / 24;
    const y = yy + Math.sin((x * 0.12) / u + t * 5) * 2 * u * (0.4 + Math.abs(amp) * 4) + (x - cx) * tilt;
    g.lineTo(x, y);
  }
  g.lineTo(x1, bottom);
  g.closePath();
  g.fill();
}
// 앞 · 뒤 두 겹을 반대로 기울여 두께: water(..., amp * 0.5) 옅게, water(..., -amp * 0.6) 진하게`,
    },
    pitfalls: [
      { title: '감쇠를 너무 세게 주면 넘침이 없어 밋밋하다', fix: '견본은 강성 70 · 감쇠 8 — 한 번 살짝 넘었다 돌아온다. 감쇠를 키울수록 그냥 막대처럼 된다.' },
      { title: 'dt 를 자르지 않으면 탭 전환 뒤 물이 튀어 나간다', fix: '용수철은 dt 가 크면 터진다. Math.min(dt, 0.05).' },
      { title: '0 으로 비울 때 음수로 내려가 바닥 아래로 샌다', fix: '목표가 0 이고 거의 비면 lv 를 0 이상으로 잡는다.' },
    ],
    prev: ['i208'],
    next: ['i211'],
  },

  i220: {
    id: 'i220',
    summary: '수집 카드 위에 무지개 띠 · 반짝이 층을 color-dodge 로 겹치고 기울기에 따라 옮겨서, 기울일 때마다 빛 띠가 미끄러지는 홀로 포일을 만든다.',
    terms: [
      { en: 'Holographic foil card effect', ko: '홀로그램 포일 카드' },
      { en: 'CSS mix-blend-mode: color-dodge', ko: '아래 색을 밝게 태우는 섞기' },
      { en: 'repeating-linear-gradient + background-position', ko: '무지개 줄을 크게 깔고 위치만 옮기기' },
      { en: 'CSS 3D tilt (perspective · rotateX/Y)', ko: '마우스 쪽으로 카드 기울이기' },
    ],
    goal: '{target}을(를) 홀로 포일 카드로 만들어 줘 — 마우스(폰은 저절로)로 기울이면 무지개 빛 띠가 미끄러지고 반짝이가 빛 쪽에서만 반짝이게. 분위기는 {style}.',
    targets: ['수학자 수집 카드', '도형 · 배지 보상 카드', '희귀 등급 캐릭터 카드'],
    styles: ['남색 바탕 금테', '귀엽고 아기자기', '반짝이는 레어 카드'],
    platforms: ['web'],
    principle: [
      '카드 위에 층을 셋 겹친다: 무지개 줄(holo) · 반짝이 점(spark) · 빛 반사(glare). 모두 pointer-events: none.',
      '무지개 층은 115° 무지개 repeating-linear-gradient 를 300% 크기로 깔고, 기울기 nx · ny 에 따라 background-position 만 옮긴다 — 그래서 띠가 미끄러져 보인다.',
      'color-dodge 로 섞으면 어두운 곳은 거의 그대로, 밝은 곳은 무지갯빛으로 탄다. 그림 칸에는 반대로 움직이는 둘째 무지개 층을 하나 더.',
      '반짝이 층은 빛이 닿는 자리를 가운데로 한 radial-gradient 마스크로 가려, 빛 쪽에서만 반짝인다.',
      '카드는 perspective 안에서 rotateX(−ny·13°) rotateY(nx·17°). 기울기는 1 − e^(−9dt) 로 부드럽게 따라가고, 1.2초 손을 떼면 저절로 흔들린다.',
    ],
    when: ['보상 카드 · 배지처럼 「갖고 싶은」 느낌이 필요할 때', '등급(★★★)이 높은 것만 특별해 보여야 할 때'],
    avoid: ['글씨를 많이 읽어야 하는 카드 — color-dodge 가 글씨를 태운다. 글씨 칸은 층 아래가 아니라 위에 두거나 세기를 낮춘다', '한 화면에 카드 수십 장 — 섞기 층이 많아 느려진다. 고른 한 장만 포일'],
    cost: 'light',
    costNote: 'CSS 층 4장과 transform 만 바꾼다. 카드 한두 장은 폰에서도 가볍지만, 수십 장을 동시에 섞으면 GPU 합성이 무거워진다.',
    level: 2,
    must: [
      '무지개 · 반짝이 층은 mix-blend-mode: color-dodge, 빛 반사 층은 overlay',
      '카드 자체에 isolation: isolate — 섞기가 카드 밖 배경까지 번지지 않게',
      '움직이는 건 background-position 과 transform 뿐 — 그러데이션을 매 프레임 새로 만들지 않는다 (빛 위치 radial 은 예외)',
      '마우스가 없으면(폰 · 1.2초 손 뗌) 저절로 천천히 기울어진다',
      '「홀로 포일」 켬/끔 · 「빛 세기」 조절',
    ],
    done: [
      '마우스를 카드 위에서 움직이면 카드가 그쪽으로 기울고 무지개 띠가 반대쪽으로 미끄러진다',
      '반짝이 점은 빛이 닿는 쪽에서만 보이고 반대쪽은 어둡다',
      '「홀로 포일」을 끄면 빛 반사 하나만 남은 평범한 카드가 된다',
      '폰(마우스 없음)에서도 저절로 흔들리며 빛이 움직인다',
    ],
    code: {
      lang: 'ts',
      title: '기울기 → 층 위치 · 마스크 · 카드 회전',
      from: 'demos/demosJuice.ts D220 update() · tiltRig() 를 정리',
      body: `// CSS (요지)
// .card  { isolation:isolate; overflow:hidden; }
// .holo  { mix-blend-mode:color-dodge; background-size:300% 300%;
//          background-image:repeating-linear-gradient(115deg,#ff5fa2 0%,#ffcf5c 7%,#6dffb0 14%,#5cc8ff 21%,#b18cff 28%,#ff5fa2 35%); }
// .spark { mix-blend-mode:color-dodge; background-image:radial-gradient(circle,#fff 0 .35cqmin,transparent .8cqmin); background-size:7cqmin 7cqmin; }
// .glare { mix-blend-mode:overlay; }

let nx = 0, ny = 0;              // 부드럽게 따라가는 기울기 (−1 ~ 1)
function update(t: number, dt: number, mx: number, my: number, idle: boolean, power: number): void {
  const gx = idle ? Math.sin(t * 1.25) * 0.85 : mx;     // 손 떼면 저절로
  const gy = idle ? Math.sin(t * 1.7 + 1.2) * 0.65 : my;
  const k = 1 - Math.exp(-Math.min(dt, 0.05) * 9);
  nx += (gx - nx) * k;
  ny += (gy - ny) * k;
  stage.style.transform = 'translate(-50%,-50%) rotateX(' + (-ny * 13).toFixed(2) + 'deg) rotateY(' + (nx * 17).toFixed(2) + 'deg)';
  const lx = 50 + nx * 50, ly = 50 + ny * 50;            // 빛이 닿는 곳 (%)
  const mag = Math.min(1, Math.hypot(nx, ny));
  holo.style.opacity = String((0.28 + 0.3 * mag) * power);
  holo.style.backgroundPosition = (50 + nx * 60).toFixed(1) + '% ' + (50 + ny * 60).toFixed(1) + '%';
  const m = 'radial-gradient(circle at ' + lx.toFixed(1) + '% ' + ly.toFixed(1) + '%, #000 0%, rgba(0,0,0,.35) 30%, transparent 55%)';
  spark.style.maskImage = m;            // 빛 쪽만 반짝
  spark.style.webkitMaskImage = m;
  spark.style.opacity = String((0.6 + 0.4 * Math.sin(t * 9)) * power);
  glare.style.background = 'radial-gradient(circle at ' + lx.toFixed(1) + '% ' + ly.toFixed(1) + '%, rgba(255,255,255,.8), rgba(255,255,255,.1) 35%, rgba(0,0,0,.3) 90%)';
}`,
    },
    pitfalls: [
      { title: 'isolation 없이 섞으면 무지개가 카드 밖 배경까지 태운다', fix: '카드 상자에 isolation: isolate (또는 자체 쌓임 맥락)를 준다.' },
      { title: '그러데이션 각도를 매 프레임 바꾸면 버벅인다', fix: '큰 그러데이션을 한 번 깔고 background-position 만 옮긴다.' },
      { title: '-webkit-mask 를 빼먹으면 사파리에서 반짝이가 전부 보인다', fix: 'maskImage 와 webkitMaskImage 를 함께 넣는다.' },
      { title: '폰에서는 마우스가 없어 그냥 정지 카드가 된다', fix: '마지막 입력 뒤 1.2초가 지나면 sin 으로 저절로 기울인다.' },
    ],
    prev: ['u38'],
    next: ['i221'],
    refs: [{ name: 'MDN — mix-blend-mode', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/mix-blend-mode' }],
  },

  /* ═══════════════ 스킬 VFX (마법 · 미사일) ═══════════════ */

  i170: {
    id: 'i170',
    summary: '입자를 점 · 원 · 원뿔 · 구 모양에서 뿜고 수명 동안 크기 · 색 · 투명도를 곡선으로 바꿔서, 모든 마법 효과의 바탕이 되는 입자 방출기를 만든다.',
    terms: [
      { en: 'Particle emitter (emission shape)', ko: '입자 방출기 — 어디서 · 어느 쪽으로 뿜나' },
      { en: 'Over-lifetime curves (size · color · alpha)', ko: '수명 곡선 — 나이에 따라 바뀌는 값' },
      { en: 'InstancedBufferGeometry billboards', ko: '인스턴스 사각형 한 묶음으로 입자 수천 개' },
      { en: 'Premultiplied alpha (additive + alpha in one pass)', ko: '더하기 · 덮기를 입자마다 섞는 섞기' },
    ],
    goal: '{target}에 쓸 입자 방출기를 만들어 줘 — 방출 모양(점 · 원 · 원뿔 · 구)을 고르고, 입자가 수명 동안 커졌다 식으며 사라지게(크기 · 색 · 투명도 곡선). 분위기는 {style}.',
    targets: ['마법 효과 전부의 바탕', '정답 · 보상 반짝임', '불꽃 · 연기 · 먼지'],
    styles: ['어두운 돌바닥 위 하늘빛 마법', '귀엽고 아기자기', '디아블로 같은 진한 액션'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System 의 Shape 모듈(Sphere · Cone · Circle) + Size/Color over Lifetime 이 같은 것이다.',
      godot: 'Godot 은 GPUParticles3D + ParticleProcessMaterial 의 emission_shape 와 scale_curve · color_ramp 가 같은 것이다.',
    },
    principle: [
      '입자 하나 = 자리 · 속도 · 나이 · 수명 · 시작 크기 s0 · 끝 크기 s1 · 색 곡선. 배열(Float32Array)에 모아 두고 죽으면 맨 끝 것과 바꿔 지운다.',
      '방출 모양마다 시작 자리와 방향이 다르다: 점(사방) · 원 둘레(위로) · 원뿔(24° 안, 중력 1.6) · 구 겉면(바깥으로).',
      '색 곡선은 32칸 표 [색 × 밝기, 투명도, 더하기 정도] — 처음 하얗게 빛나다 하늘색 → 보라 → 어둡게. 밝기가 1 을 넘는(HDR) 칸이 빛나 보인다.',
      '크기는 s0 + (s1 − s0)·easeOut(나이 비율) 로 커지고, 공기 저항은 속도 × e^(−drag·dt).',
      '사각형 하나를 인스턴스로 수천 번 그리고, 섞기는 One / OneMinusSrcAlpha 로 둔 채 알파에 (1 − 더하기 정도) 를 곱해 빛(더하기)과 연기(덮기)를 한 번에 그린다.',
    ],
    when: ['마법 · 폭발 · 보상처럼 입자가 필요한 모든 효과의 첫 단추', '같은 엔진 하나로 여러 효과(불 · 얼음 · 독)를 값만 바꿔 만들 때'],
    avoid: ['입자 몇 개뿐인 단순 반짝임 — Sprite 몇 장이 더 쉽다', '부드러운 소용돌이 · 빔처럼 이어진 모양 — 입자보다 흐르는 무늬 메시(i172)가 낫다'],
    cost: 'medium',
    costNote: '그리기는 묶음당 1번이지만 CPU 가 매 프레임 입자마다 이동 · 곡선 계산 · 버퍼 올리기를 한다. 견본은 최대 2200개 · 초당 170개. 폰은 1000개 안쪽으로.',
    level: 2,
    must: [
      '입자는 InstancedBufferGeometry 한 묶음 (입자마다 Mesh · Sprite 를 만들지 않는다)',
      '방출 모양 4가지(점 · 원 · 원뿔 · 구)를 조절 값 하나로 바꾼다',
      '수명 곡선 표(32칸)로 크기 · 색 · 투명도를 나이에 따라 — 켬/끔 비교 단추',
      '죽은 입자는 맨 끝과 바꿔 지운다(배열을 새로 만들지 않음), 최대 수를 넘으면 더 만들지 않음',
      'depthWrite: false, 방출량은 시간 누적(acc += dt × 초당 개수)으로 — 프레임 빠르기와 상관없게',
    ],
    done: [
      '3초마다 방출 모양이 점 → 원 → 원뿔 → 구로 바뀌고, 모양을 보여 주는 선(기즈모)도 함께 바뀐다',
      '수명 곡선을 켜면 입자가 하얗게 태어나 커지며 하늘색 → 보라로 식고, 끄면 같은 크기 · 같은 색으로 툭 사라진다',
      '「입자 수」 0.3 ~ 3배 조절이 바로 먹는다',
      '폰에서 입자 1000개 기준 60fps',
    ],
    code: {
      lang: 'ts',
      title: '수명 곡선 표 + 입자 한 걸음 + 인스턴스 버퍼 올리기',
      from: 'demos/demosSkillA.ts ramp() · Pool.step() · Pool.upload() 를 정리',
      body: `const RN = 32; // 곡선 표 칸 수 — 한 칸 = [r·I, g·I, b·I, 투명도, 더하기 정도]
type Stop = [number, number, number, number, number]; // [나이, 색, 밝기(HDR), 투명도, 더하기]
function ramp(stops: Stop[]): Float32Array {
  const out = new Float32Array(RN * 5), c = new THREE.Color();
  for (let i = 0; i < RN; i++) {
    const k = i / (RN - 1);
    let j = 0;
    while (j < stops.length - 2 && k > stops[j + 1][0]) j++;
    const a = stops[j], b = stops[j + 1] ?? a;
    const f = Math.min(1, Math.max(0, (k - a[0]) / Math.max(1e-6, b[0] - a[0])));
    const ca = c.setHex(a[1]).toArray().map((v) => v * a[2]);
    const cb = c.setHex(b[1]).toArray().map((v) => v * b[2]);
    const A = [...ca, a[3], a[4]], B = [...cb, b[3], b[4]];
    for (let q = 0; q < 5; q++) out[i * 5 + q] = A[q] + (B[q] - A[q]) * f;
  }
  return out;
}
const EMIT = ramp([[0, 0xffffff, 6, 0, 1], [0.06, 0xffffff, 5, 1, 1], [0.3, 0x70e8ff, 3, 1, 1], [0.7, 0x8a5cff, 2, 0.6, 1], [1, 0x3a1a90, 0.8, 0, 1]]);

// 한 걸음: 중력 · 공기 저항 · 이동 (죽으면 맨 끝과 바꿔 지움)
for (let i = 0; i < n; ) {
  age[i] += dt;
  if (age[i] >= life[i]) { kill(i); continue; }
  const f = Math.exp(-drag[i] * dt);
  vx[i] *= f; vy[i] = (vy[i] - grav[i] * dt) * f; vz[i] *= f;
  x[i] += vx[i] * dt; y[i] += vy[i] * dt; z[i] += vz[i] * dt;
  i++;
}
// 올리기: 나이 비율 k 로 곡선 표를 읽어 색 · 크기를 인스턴스 속성에
for (let i = 0; i < n; i++) {
  const k = age[i] / life[i], fj = k * (RN - 1), j = Math.min(RN - 2, fj | 0), u = fj - j, o = j * 5;
  const rp = ramps[i];
  for (let q = 0; q < 4; q++) col[i * 4 + q] = rp[o + q] + (rp[o + 5 + q] - rp[o + q]) * u;
  add[i] = rp[o + 4] + (rp[o + 9] - rp[o + 4]) * u;
  size[i] = s0[i] + (s1[i] - s0[i]) * (1 - Math.pow(1 - k, 3)); // easeOut
}
geo.instanceCount = n; // 그리고 각 속성 needsUpdate = true`,
    },
    pitfalls: [
      { title: '입자마다 Sprite 를 만들면 수백 개에서 멈칫한다', fix: '사각형 하나를 InstancedBufferGeometry 로 n 번 — 그리기 호출 1번. 같은 모양 수백 개를 하나씩 그린 것이 이 사이트 느림의 1순위 원인이었다.', seen: true },
      { title: '방출을 프레임마다 정해진 개수로 하면 폰에서 입자가 줄어든다', fix: 'acc += dt × 초당 개수, acc ≥ 1 인 동안 하나씩 — 30fps 든 60fps 든 같은 양.' },
      { title: '빛과 연기를 따로 섞기 모드로 그리면 묶음이 둘로 갈린다', fix: '섞기를 One / OneMinusSrcAlpha 로 두고 셰이더에서 알파에 (1 − 더하기) 를 곱하면 한 묶음에서 둘 다 된다.' },
      { title: '색 곡선이 1 이하면 빛이 안 나 보인다', fix: '태어날 때 밝기를 5~9(HDR)로 줘서 하얗게 타오르게. 톤 매핑이 그 값을 받아 준다.' },
    ],
    prev: ['u36'],
    next: ['i171', 'i174'],
  },

  i171: {
    id: 'i171',
    summary: '마법 하나를 밝은 핵 · 큰 빛무리 · 튀는 불티 · 꼬리 연기 · 바닥 빛 다섯 층으로 나눠 따로 움직여서, 효과가 한 덩어리가 아니라 풍성하게 보인다.',
    terms: [
      { en: 'VFX layering (core · glow · sparks · smoke · ground light)', ko: '효과 층 쌓기 — 한 마법을 여러 층으로' },
      { en: 'HDR core', ko: '밝기 1 을 넘겨 하얗게 타는 가운데' },
      { en: 'Velocity inheritance', ko: '움직이는 몸의 속도를 입자가 조금 물려받기' },
      { en: 'Ground glow decal + PointLight', ko: '바닥에 번지는 빛 판 + 실제 점광' },
    ],
    goal: '{target}을(를) 다섯 층(핵 · 빛무리 · 불티 · 연기 · 바닥 빛)으로 쌓아 만들어 줘 — 층마다 따로 움직이고 하나씩 켜고 끌 수 있게. 분위기는 {style}.',
    targets: ['날아다니는 마법 구슬', '불덩이 · 얼음 창 같은 마법 탄', '정답 축하 빛'],
    styles: ['보랏빛 비전 마법', '귀엽고 아기자기', '진한 액션 RPG'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 부모 Particle System 아래 층마다 자식 Particle System 을 두고 Light 를 붙인다 (Sub Emitters 와 함께).',
      godot: 'Godot 은 층마다 GPUParticles3D 노드를 하나씩 두고 OmniLight3D 를 같이 움직인다.',
    },
    principle: [
      '핵: 하얀 작은 빛(밝기 9) + 그 둘레 연보라(밝기 4). 크기를 sin(30t) 으로 조금 떨게.',
      '빛무리: 크고 옅은 빛 두 장(1.5 · 2.8) + 천천히 도는 별 모양 — 핵보다 훨씬 크고 흐리게.',
      '불티: 초당 70개, 사방으로 튀고 중력 3 · 바닥에서 튕김. 몸 속도의 −0.25 배를 물려받아 뒤로 흘린다.',
      '연기: 초당 34개, 크게 퍼지며(0.35 → 1.25) 컬 잡음(0.35)으로 휘감기고, 몸 속도의 −0.1 배를 물려받아 꼬리가 된다.',
      '바닥 빛: 바닥에 붙인 빛 판(더하기) + 실제 점광(13 ± 1.5, 17Hz 일렁) — 주변 바닥과 기둥이 같이 밝아진다.',
    ],
    when: ['효과가 「빛 덩어리 하나」처럼 밋밋할 때', '여러 마법(불 · 얼음 · 독)을 같은 틀로 만들 때 — 층의 색 · 양만 바꾼다'],
    avoid: ['작고 많은 효과(수십 개 동시) — 층마다 입자 · 점광이 늘어난다. 작은 것은 핵 + 빛무리 두 층만', '점광을 효과마다 켜면 셰이더가 다시 컴파일된다 — 점광 수는 늘 같게'],
    cost: 'medium',
    costNote: '입자 묶음 3개(연기 · 불티 · 핵) + 점광 1개. 점광은 비추는 모든 재질에 계산이 붙으니 효과 하나에 하나만, 그림자는 끈다.',
    level: 2,
    must: [
      '층마다 입자 묶음(Pool)을 따로 두고 renderOrder 로 연기(2) → 불티(3) → 핵(4) 순서로 그린다',
      '핵은 밝기 1 을 넘는 HDR 색, 빛무리는 크고 옅게 — 둘의 크기 차이가 3배 이상',
      '불티 · 연기는 몸의 속도를 조금(−0.25 · −0.1) 물려받아 꼬리가 진다',
      '바닥 빛은 빛 판 + 점광 하나, 점광 그림자는 끈다',
      '층마다 켜고 끄는 단추 다섯 개',
    ],
    done: [
      '1.5초마다 층이 하나씩 더해지며(핵 → + 빛무리 → + 불티 → + 연기 → + 바닥 빛) 점점 풍성해진다',
      '구슬이 원을 그리며 돌 때 불티 · 연기가 뒤로 흘러 꼬리가 생긴다',
      '바닥 빛을 켜면 구슬 밑 돌바닥이 보랏빛으로 물든다',
      '폰에서도 끊김 없이 (입자 1400개 안)',
    ],
    code: {
      lang: 'ts',
      title: '다섯 층을 매 프레임 쌓기 (pos = 구슬 자리, vx · vz = 구슬 속도)',
      from: 'demos/demosSkillA.ts i171 update() 를 정리 (Pool · RAMP · flat 은 i170 과 같은 도구)',
      body: `const CORE = flat(0xfff4ff, 9, 1), CORE2 = flat(0xd8a0ff, 4, 0.9);
const HALO = flat(0x9a50ff, 2.6, 0.7), HALO2 = flat(0x6a30ff, 1.1, 0.5);
let accS = 0, accM = 0;

function layers(t: number, dt: number): void {
  orb.clear(); // 핵 · 빛무리는 매 프레임 새로 (한 프레임짜리 입자)
  if (on[0]) { // 핵
    orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 0.3 + Math.sin(t * 30) * 0.02, ramp: CORE, shape: 0 });
    orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 0.55, ramp: CORE2, shape: 0 });
  }
  if (on[1]) { // 빛무리 — 크고 옅게
    orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 1.5 + Math.sin(t * 7) * 0.08, ramp: HALO, shape: 0 });
    orb.spawn({ x: pos.x, y: pos.y, z: pos.z, life: 1, s0: 2.8, ramp: HALO2, shape: 0 });
  }
  if (on[2]) for (accS += dt * 70; accS >= 1; accS--) { // 불티 초당 70
    const d = sphereDir(), sp = R(1.2, 3.2);
    sparks.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: d.x * sp - vx * 0.25, vy: d.y * sp + 0.6, vz: d.z * sp - vz * 0.25,
      life: R(0.45, 0.9), s0: 0.07, s1: 0.02, ramp: RAMP.magicSpark, st: 0.06, shape: 2, drag: 1.2, grav: 3, bnc: 0.4 });
  }
  if (on[3]) for (accM += dt * 34; accM >= 1; accM--) { // 연기 초당 34
    smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: -vx * 0.1, vy: R(0.2, 0.5), vz: -vz * 0.1,
      life: R(1.3, 2.0), s0: 0.35, s1: 1.25, ramp: RAMP.magicSmoke, shape: 1, rot: R(0, Math.PI * 2), rv: R(-1, 1), drag: 1.5, curl: 0.35 });
  }
  // 바닥 빛: 빛 판 + 점광 하나
  light.position.set(pos.x, pos.y - 0.3, pos.z);
  light.intensity = on[4] ? 13 + Math.sin(t * 17) * 1.5 : 0;
  disc.visible = on[4];
  disc.position.set(pos.x, 0.015, pos.z);
}`,
    },
    pitfalls: [
      { title: '점광을 켰다 껐다 하면 판마다 멈칫한다', fix: '점광 수가 바뀌면 three.js 가 셰이더를 통째로 다시 컴파일한다. 점광은 그대로 두고 intensity 만 0 으로. 보물 동굴에서 3~5초 멈춤이 이것이었다.', seen: true },
      { title: '핵과 빛무리를 비슷한 크기로 두면 덩어리로 뭉친다', fix: '핵 0.3 · 빛무리 1.5 · 2.8 처럼 크기 차이를 크게, 빛무리는 투명도 0.5~0.7 로 옅게.' },
      { title: '불티 · 연기가 구슬과 같이 움직이면 꼬리가 안 생긴다', fix: '구슬 속도의 반대(−0.25 · −0.1)를 조금 물려받게 하면 뒤로 흘러 꼬리가 된다.' },
      { title: '층을 한 묶음에 섞으면 연기가 핵을 덮는다', fix: '묶음을 나누고 renderOrder 연기 2 → 불티 3 → 핵 4.' },
    ],
    prev: ['i170'],
    next: ['i172', 'i178'],
  },

  i172: {
    id: 'i172',
    summary: '끝이 열린 원통 · 원뿔 · 원판 메시에 잡음 무늬를 UV 를 따라 흘려서, 입자 없이도 소용돌이 기둥 · 불기둥 · 빔을 화려하게 만든다.',
    terms: [
      { en: 'UV scrolling (panning) shader', ko: 'UV 를 시간으로 밀어 무늬를 흘리기' },
      { en: 'Tileable fbm noise (periodic)', ko: '이음새 없이 둘레를 감는 잡음' },
      { en: 'Fresnel rim fade', ko: '보는 각도로 가장자리 밝기 조절' },
      { en: 'Open-ended CylinderGeometry', ko: '뚜껑 없는 원통 · 원뿔' },
    ],
    goal: '{target}을(를) 입자 없이 원통 · 원뿔 메시에 흐르는 잡음 무늬로 만들어 줘 — 무늬가 위로 비틀리며 흐르고 양 끝은 자연스럽게 사라지게. 분위기는 {style}.',
    targets: ['소용돌이 기둥', '빔 · 레이저', '빛기둥 · 소환 기둥'],
    styles: ['보랏빛 소용돌이', '귀엽고 아기자기', '주황 불기둥'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 에서 Tiling And Offset 노드에 Time 을 넣어 UV 를 밀고 Fresnel Effect 노드로 가장자리를 맞춘다.',
      godot: 'Godot 은 spatial 셰이더에서 UV + TIME * 속도 로 잡음 텍스처를 읽고, render_mode blend_add, unshaded 로 그린다.',
    },
    principle: [
      '원통의 UV 는 u = 둘레, v = 높이. 무늬 좌표를 p = (u·per + v·twist + T·0.35, v·sy − T) 로 두면 무늬가 위로 흐르며 비틀린다.',
      '잡음은 x 를 per 로 감는(mod) fbm 4겹이라 원통 둘레 이음새가 안 보인다. 두 겹을 섞어 smoothstep(0.36, 0.86) 으로 밝은 줄만 남긴다.',
      '양 끝은 v 로 사라지게(아래 0 ~ 0.14 · 위 0.72 ~ 1), 가장자리는 프레넬(보는 각도)로 밝기를 맞춘다. 빔은 반대로 가운데를 밝게(core).',
      '더하기 섞기 · 양면 · 깊이 안 씀으로 여러 겹(바깥 원뿔 + 안쪽 원통 + 바닥 원판)을 겹치면 입자 없이도 풍성하다.',
      '원판은 극좌표(반지름 · 각도)로 같은 무늬를 돌려 바닥 소용돌이를 만든다.',
    ],
    when: ['소용돌이 · 빔 · 빛기둥처럼 「이어진 모양」의 효과', '입자 수를 아끼고 싶을 때 — 메시 3~5개면 된다'],
    avoid: ['흩어지는 불티 · 연기 — 입자(i170)가 맞다', '셰이더에 잡음을 더 많이 겹치고 싶을 때 — 그 대신 미리 구운 잡음 텍스처를 읽는다'],
    cost: 'light',
    costNote: '메시 몇 개뿐이지만 픽셀마다 fbm 2번(4겹씩)을 계산한다. 화면을 꽉 채우면 폰에서 무거워지니 기둥 굵기를 적당히.',
    level: 2,
    must: [
      '무늬 x 방향은 둘레 칸 수(per)로 감아(mod) 원통 이음새가 안 보이게',
      '양 끝은 v 로 부드럽게 사라지게 — 메시 끝이 칼로 자른 듯 보이면 안 된다',
      'AdditiveBlending · side: DoubleSide · depthWrite: false · CylinderGeometry 는 openEnded true',
      '흐름 속도 · 무늬 켬/끔을 uniform 하나씩으로',
      '잡음은 셰이더 하나에 fbm 2번까지 — 더 필요하면 텍스처로 굽기',
    ],
    done: [
      '소용돌이: 바깥 원뿔 · 안쪽 원통 · 바닥 원판의 무늬가 위로 비틀리며 흐르고 전체가 천천히 돈다',
      '빔: 가는 하얀 원통 + 굵은 주황 원통이 겹쳐 가운데가 밝은 광선이 된다',
      '「잡음 무늬 흘리기」를 끄면 같은 메시가 밋밋한 반투명 통이 된다',
      '「흐름 속도」 0 ~ 3 조절이 바로 먹는다',
    ],
    code: {
      lang: 'ts',
      title: '흐르는 무늬 재질 (원통 · 원뿔용)',
      from: 'demos/demosSkillA.ts scrollMat() · NOISE_GLSL 을 정리',
      body: `const NOISE =
  'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }' +
  'float pn(vec2 p, float per){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);' +
  '  float a = h21(vec2(mod(i.x, per), i.y)), b = h21(vec2(mod(i.x+1.0, per), i.y));' +
  '  float c = h21(vec2(mod(i.x, per), i.y+1.0)), d = h21(vec2(mod(i.x+1.0, per), i.y+1.0));' +
  '  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }' +
  'float fbm(vec2 p, float per){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ s += a*pn(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s; }';

const scrollMat = (colA: number, colB: number, per = 5, sy = 2.4, twist = 2.2, bright = 1.2) => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPer: { value: per }, uSy: { value: sy }, uTwist: { value: twist }, uBright: { value: bright },
    uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) } },
  vertexShader: 'varying vec2 vUv; varying float vF; void main(){ vUv = uv;' +
    ' vec3 n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
    ' vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float uTime, uPer, uSy, uTwist, uBright; uniform vec3 uColA, uColB; varying vec2 vUv; varying float vF;' + NOISE +
    'void main(){ float T = uTime;' +
    ' vec2 p = vec2(vUv.x * uPer + vUv.y * uTwist + T * 0.35, vUv.y * uSy - T);' +   // 위로 흐르며 비틀림
    ' float fade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));' +
    ' float rim = mix(0.35, 1.0, pow(1.0 - vF, 1.3));' +
    ' float n = fbm(p, uPer), n2 = fbm(vec2(p.x * 2.0, p.y * 1.7 - T * 0.8), uPer * 2.0);' +
    ' float m = smoothstep(0.36, 0.86, n * 0.62 + n2 * 0.55);' +
    ' vec3 col = mix(uColB, uColA, m) * uBright * (0.35 + 2.6 * m * m);' +
    ' gl_FragColor = vec4(col, clamp(m * fade * rim, 0.0, 1.0)); }',
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
});

const outer = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.3, 3.4, 64, 1, true), scrollMat(0xd8b0ff, 0x4020c0));
outer.position.y = 1.7; // 매 프레임: outer.material.uniforms.uTime.value = time; 묶음째 rotation.y = time * 0.6`,
    },
    pitfalls: [
      { title: '잡음을 mod 로 감지 않으면 원통 둘레에 세로 이음새가 생긴다', fix: '무늬 x 에 둘레 칸 수(per)를 곱하고, 잡음 격자 x 를 mod(i.x, per) 로 감는다. 옥타브마다 per 도 2배.' },
      { title: '잡음 반복문을 셰이더 여러 곳에서 부르면 첫 화면이 몇 초 멈춘다', fix: '윈도는 반복문 잡음을 D3D 로 바꾸는 데 오래 걸린다(보물 동굴 17~20초). fbm 은 두 번까지, 더 필요하면 잡음 텍스처를 구워 읽고 compileAsync 로 미리 데운다.', seen: true },
      { title: '끝을 안 지우면 원통 단면이 보인다', fix: 'v 로 아래 · 위를 smoothstep 으로 사라지게, CylinderGeometry 는 openEnded = true.' },
      { title: '깊이를 쓰면 겹친 원통끼리 서로 가린다', fix: 'depthWrite: false · 더하기 섞기면 순서와 상관없이 겹쳐 밝아진다.' },
    ],
    prev: ['i170'],
    next: ['i180', 'i171'],
  },

  i174: {
    id: 'i174',
    summary: '입자를 무작위로 흔드는 대신 컬 잡음(소용돌이만 있는 흐름) 위에 띄워서, 연기 · 치유 오라가 지글거리지 않고 부드럽게 휘감기며 흐른다.',
    terms: [
      { en: 'Curl noise', ko: '컬 잡음 — 소용돌이만 있고 모이거나 퍼지지 않는 흐름' },
      { en: 'Divergence-free velocity field', ko: '발산 없는 속도장 (입자가 한곳에 뭉치지 않음)' },
      { en: 'Vector potential (curl of sine field)', ko: '퍼텐셜의 회전(curl)으로 속도 만들기' },
      { en: 'Particle advection', ko: '흐름을 따라 입자 옮기기' },
    ],
    goal: '{target}의 입자가 컬 잡음을 따라 부드럽게 휘감기며 흐르게 해 줘 — 무작위 흔들기와 켬/끔으로 비교할 수 있게. 분위기는 {style}.',
    targets: ['치유 오라 (초록 빛 알갱이)', '연기 · 마나 흐름', '영혼 · 반딧불 무리'],
    styles: ['초록 치유 빛', '귀엽고 아기자기', '신비로운 보라 안개'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Particle System 의 Noise 모듈은 컬 잡음과 비슷한 흐름을 준다 (Strength · Frequency · Scroll Speed). VFX Graph 에는 Turbulence 블록이 있다.',
      godot: 'Godot 4 의 ParticleProcessMaterial 에는 turbulence_enabled (난류) 가 있다.',
    },
    principle: [
      '무작위로 매 프레임 방향을 바꾸면 입자가 지글지글 떤다. 대신 공간 전체에 부드럽게 바뀌는 「흐름」을 깔고 입자를 그 위에 띄운다.',
      '흐름은 세 개의 sin 퍼텐셜 A = (Ax, Ay, Az) 의 회전(curl): v = (∂Az/∂y − ∂Ay/∂z, ∂Ax/∂z − ∂Az/∂x, ∂Ay/∂x − ∂Ax/∂y).',
      'curl 로 만든 흐름은 발산이 0 이라 입자가 한 점에 모이거나 비지 않고 고르게 휘감긴다.',
      '견본은 두 겹(크기 1배 + 2.3배, 세기 1 + 0.45)을 더하고, 시간 t 를 넣어 흐름 자체도 천천히 바뀐다. 입자 자리 += 흐름 × 세기 × dt.',
    ],
    when: ['연기 · 오라 · 마나처럼 「살아 움직이는」 흐름이 필요할 때', '입자가 무작위로 떨려 싸구려처럼 보일 때'],
    avoid: ['폭발 · 불티처럼 곧게 튀어야 하는 것 — 컬을 끄고 속도 · 중력만', '입자 수만 개 — CPU 계산이 무거워진다. 그땐 GPU(셰이더) 에서 같은 식을 계산한다'],
    cost: 'medium',
    costNote: '입자마다 sin · cos 12번 정도. 견본은 초당 190개 · 최대 2400개를 CPU 로 돌린다. 폰은 1000개 안쪽.',
    level: 2,
    must: [
      '흐름은 퍼텐셜의 curl 로 — 그냥 잡음 세 개를 속도로 쓰면 발산이 생겨 입자가 뭉친다',
      '두 겹(작은 소용돌이 + 큰 소용돌이)과 시간 흐름',
      '「컬 잡음 / 무작위 흔들기」 켬/끔 비교와 「소용돌이 세기」(0 ~ 3) 조절',
      '흐름 크기(curlScale)는 효과 크기에 맞게 (견본 0.85)',
    ],
    done: [
      '4.5초마다 컬 잡음 ↔ 무작위 흔들기가 바뀌고, 컬 쪽은 알갱이가 부드럽게 휘감기며 올라가고 무작위 쪽은 지글지글 떤다',
      '알갱이가 한곳에 뭉치거나 구멍이 나지 않고 고르게 퍼진다',
      '「소용돌이 세기」를 0 으로 두면 곧게 올라간다',
      '폰에서도 끊김 없이',
    ],
    code: {
      lang: 'ts',
      title: '컬 잡음 흐름 (두 겹) 과 입자 옮기기',
      from: 'demos/demosSkillA.ts curlOct() · curlAt() · Pool.step() 을 정리',
      body: `const CV = { x: 0, y: 0, z: 0 };
// sin 퍼텐셜의 회전(curl) — 미분을 직접 써서 발산 0
function curlOct(x: number, y: number, z: number, t: number, s: number, amp: number): void {
  x *= s; y *= s; z *= s;
  const a1 = 1.3 * y + 0.7 * t, a2 = 1.7 * z + 0.4 * t;  // Ax 의 재료
  const b1 = 1.5 * z + 0.6 * t, b2 = 1.1 * x - 0.5 * t;  // Ay
  const c1 = 1.2 * x + 0.8 * t, c2 = 1.9 * y + 0.3 * t;  // Az
  const dAxdy = 1.3 * Math.cos(a1), dAxdz = -1.7 * Math.sin(a2);
  const dAydz = 1.5 * Math.cos(b1), dAydx = -1.1 * Math.sin(b2);
  const dAzdx = 1.2 * Math.cos(c1), dAzdy = -1.9 * Math.sin(c2);
  CV.x += (dAzdy - dAydz) * amp;
  CV.y += (dAxdz - dAzdx) * amp;
  CV.z += (dAydx - dAxdy) * amp;
}
function curlAt(x: number, y: number, z: number, t: number, s: number): void {
  CV.x = CV.y = CV.z = 0;
  curlOct(x, y, z, t, s, 1);                                 // 큰 소용돌이
  curlOct(x + 3.1, y - 1.7, z + 5.3, t * 1.3, s * 2.3, 0.45); // 작은 소용돌이
}

// 입자 한 걸음: 보통 이동 뒤 흐름만큼 더 옮긴다
const curlScale = 0.85;
let nx = x[i] + vx[i] * dt, ny = y[i] + vy[i] * dt, nz = z[i] + vz[i] * dt;
if (curl[i]) {
  curlAt(nx, ny, nz, time, curlScale);
  nx += CV.x * curl[i] * dt;  // curl[i] = 소용돌이 세기 (견본 1.3)
  ny += CV.y * curl[i] * dt;
  nz += CV.z * curl[i] * dt;
}`,
    },
    pitfalls: [
      { title: '잡음 세 개를 그대로 속도로 쓰면 입자가 한곳에 뭉친다', fix: '그건 발산이 있는 흐름이다. 퍼텐셜을 만들고 그 curl 을 속도로 쓴다.' },
      { title: '흐름을 속도에 더하면 점점 빨라져 날아간다', fix: '견본처럼 흐름은 속도가 아니라 자리에 직접 더한다(nx += CV·세기·dt). 속도는 따로 둔다.' },
      { title: '흐름 크기가 효과보다 너무 크면 그냥 한쪽으로 쏠린다', fix: '효과 지름 안에 소용돌이가 2~3개 들어가게 curlScale 을 맞춘다 (반지름 1 정도 오라에 0.85).' },
    ],
    prev: ['i170'],
    next: ['i175'],
    refs: [{ name: 'Wikipedia — Curl (mathematics)', url: 'https://en.wikipedia.org/wiki/Curl_(mathematics)' }],
  },

  i175: {
    id: 'i175',
    summary: '장면 깊이를 먼저 그려 두고 입자 깊이와 비교해서, 연기 · 안개 입자가 바닥 · 기둥과 만나는 곳의 딱 잘린 선을 부드럽게 지운다.',
    terms: [
      { en: 'Soft particles (depth fade)', ko: '부드러운 입자 — 깊이 차이로 가장자리 옅게' },
      { en: 'WebGLRenderTarget + DepthTexture', ko: '장면 깊이를 텍스처로 받기' },
      { en: 'perspectiveDepthToViewZ', ko: '깊이 값을 카메라 거리로 바꾸는 three.js 함수' },
      { en: 'Depth pre-pass', ko: '입자 빼고 장면을 먼저 한 번 그리기' },
    ],
    goal: '{target}이(가) 바닥 · 벽과 만나는 곳을 깊이 비교로 부드럽게 해 줘 — 왼쪽 딱딱한 입자 · 오른쪽 부드러운 입자를 나눠 비교할 수 있게. 분위기는 {style}.',
    targets: ['바닥에 깔린 안개 · 연기', '오라 · 마법 구름', '폭발 먼지'],
    styles: ['보랏빛 신비로운 안개', '귀엽고 아기자기', '어두운 던전 연기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 파티클 셰이더(Particles/Unlit 등)의 Soft Particles 옵션을 켜고 카메라 Depth Texture 를 켠다.',
      godot: 'Godot 4 의 StandardMaterial3D 에 proximity_fade_enabled (근접 페이드) 가 같은 것이다.',
    },
    principle: [
      '큰 연기 판이 바닥이나 기둥을 뚫고 들어가면 만나는 곳에 칼로 자른 듯한 선이 생긴다.',
      '입자를 빼고 장면을 먼저 렌더 타깃(깊이 텍스처 포함)에 그려, 픽셀마다 「뒤에 있는 물체까지 거리」를 얻는다.',
      '입자 셰이더에서 그 거리와 입자 자신의 거리 차이를 재 투명도에 곱한다: a × clamp((입자 z − 장면 z) / 부드러운 거리, 0, 1).',
      '물체에 가까울수록 입자가 옅어져 경계가 사라진다. 부드러운 거리 0.7 이 견본 기본값.',
    ],
    when: ['바닥에 깔리는 안개 · 연기 · 오라처럼 큰 입자가 물체와 겹칠 때', '입자가 몇 장 안 되지만 크게 보일 때 — 잘린 선이 가장 눈에 띈다'],
    avoid: ['작은 불티 · 빛 점 — 잘린 선이 안 보이니 깊이 패스가 아깝다', '폰에서 장면이 무거울 때 — 장면을 두 번 그리게 된다. 그땐 입자를 물체에서 띄워 두는 것으로 피한다'],
    cost: 'medium',
    costNote: '입자 빼고 장면을 한 번 더 그린다(깊이 패스). 장면 그리기 비용이 거의 2배. 화면 크기 렌더 타깃 하나 메모리.',
    level: 3,
    must: [
      '깊이 패스는 입자를 숨기고(visible = false) 그린 뒤 다시 보인다',
      '렌더 타깃 크기 = 그리는 화면 크기, 바뀌면 setSize — uRes 도 같은 값',
      '셰이더에서 #include <packing> 후 perspectiveDepthToViewZ(깊이, near, far) 로 카메라 거리로 바꿔 비교',
      '부드러운 거리(0.1 ~ 2.5) 조절 값과 켬/끔(uSoftOn) 비교',
      '반투명 · 스프라이트는 깊이 패스에서 숨긴다',
    ],
    done: [
      '화면을 반으로 나눠, 왼쪽은 안개가 바닥 · 기둥과 만나는 곳에 잘린 선이 보이고 오른쪽은 스르르 사라진다',
      '「부드러운 거리」를 키우면 물체 가까이 안개가 더 넓게 옅어진다',
      '나눠 비교를 끄면 화면 전체가 부드러운 입자로 그려진다',
      '화면 크기를 바꿔도 경계가 어긋나지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '깊이 패스 + 입자 셰이더의 깊이 비교',
      from: 'demos/demosSkillA.ts i175 render() · POOL_FS(SOFT) 를 정리',
      body: `// 1) 장면 깊이를 받을 렌더 타깃
const rt = new THREE.WebGLRenderTarget(1, 1);
rt.depthTexture = new THREE.DepthTexture(1, 1);
const U = particles.material.uniforms; // uDepth · uRes · uNear · uFar · uSoft
U.uDepth.value = rt.depthTexture;
U.uSoft.value = 0.7;

function render(r: THREE.WebGLRenderer, w: number, h: number): void {
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
  U.uRes.value.set(w, h);
  U.uNear.value = cam.near;
  U.uFar.value = cam.far;
  particles.visible = false;       // 입자 빼고 장면만
  r.setRenderTarget(rt);
  r.render(scene, cam);
  r.setRenderTarget(null);
  particles.visible = true;
  r.render(scene, cam);            // 이제 진짜 화면
}

// 2) 입자 조각 셰이더 (요지) — 정점 셰이더에서 vViewZ = (modelViewMatrix * pos).z
const softFS =
  '#include <packing>\\n' +
  'uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar, uSoft;\\n' +
  'varying float vViewZ;\\n' +
  'float softFade(){\\n' +
  '  float sd = texture2D(uDepth, gl_FragCoord.xy / uRes).x;\\n' +
  '  float sz = perspectiveDepthToViewZ(sd, uNear, uFar);\\n' +   // 뒤 물체까지 (음수 z)
  '  return clamp((vViewZ - sz) / uSoft, 0.0, 1.0);\\n' +          // 가까울수록 0
  '}\\n';
// 알파에 곱한다: a *= softFade();`,
    },
    pitfalls: [
      { title: '깊이 패스에 입자를 같이 그리면 입자가 자기 자신에 가려 사라진다', fix: '깊이 패스 전에 입자를 숨기고 끝나면 다시 보인다.' },
      { title: '반투명 · 스프라이트를 숨기지 않으면 검은 네모가 생긴다', fix: '깊이를 다시 그리는 패스에서는 반투명 · 스프라이트도 숨긴다 — 이 사이트 후처리에서 겪은 일.', seen: true },
      { title: '렌더 타깃 크기와 uRes 가 다르면 경계가 밀린다', fix: 'render 마다 크기를 비교해 setSize, uRes 도 같은 w · h 로.' },
      { title: '깊이 값을 그대로 빼면 멀수록 효과가 달라진다', fix: '깊이 텍스처 값은 0~1 비선형이다. perspectiveDepthToViewZ 로 카메라 거리로 바꾼 뒤 뺀다.' },
    ],
    prev: ['i170'],
    next: ['i195'],
  },

  i178: {
    id: 'i178',
    summary: '맞은 자리 바닥에 퍼지는 빛 고리 두 개와 식어 가는 그을음 자국을 붙여서, 폭발 · 착지의 「쾅」이 바닥까지 전해진다.',
    terms: [
      { en: 'Shockwave ring', ko: '충격 고리 — 바닥에서 퍼지는 빛 띠' },
      { en: 'Scorch decal', ko: '그을음 데칼 — 바닥에 남는 탄 자국' },
      { en: 'polygonOffset (z-fighting fix)', ko: '바닥과 겹친 판이 깜박이지 않게 살짝 앞으로' },
      { en: 'Object pool (round robin)', ko: '고리 4개 · 자국 3개를 돌려 쓰기' },
    ],
    goal: '{target}이(가) 바닥을 치면 그 자리에서 빛 고리가 퍼지고 그을음 자국이 남았다 식어 가게 해 줘. 분위기는 {style}.',
    targets: ['떨어지는 불덩이 · 유성', '쾅 내려찍는 블록', '정답 강조 바닥 파동'],
    styles: ['어두운 돌바닥 주황 불빛', '귀엽고 아기자기', '푸른 번개 충격'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 바닥 Quad 에 고리 셰이더를 붙이거나 URP Decal Projector 로 그을음을 찍는다.',
      godot: 'Godot 4 는 Decal 노드로 그을음을, 바닥 QuadMesh + 셰이더로 고리를 만든다.',
    },
    principle: [
      '고리는 바닥에 눕힌 판 하나의 셰이더: 판 가운데서 거리 r, 띠 = e^(−((r − R)/W)²). 안쪽에 옅은 둘째 띠(0.82R)를 하나 더.',
      'R 은 easeOut(k)·0.9 로 빨리 퍼졌다 느려지고, 띠 굵기 W 는 0.035 → 0.095 로 굵어지며, 밝기는 (1 − k)^1.4 로 사라진다.',
      '띠를 sin(각도·13 + r·30)·sin(각도·7 − 2) 로 조금씩 끊어 완벽한 원이 아니라 거친 충격처럼.',
      '폭발 한 번에 고리 둘: 큰 주황(반지름 3.4, 0.6초) + 작은 흰(2.2, 0.4초).',
      '그을음은 텍스처 r = 탄 자국, g = 불씨 금. 탄 자국은 덮고(최대 0.92), 불씨는 e^(−1.1t) 로 식으며 빛난다. 2.2초 남았다 1.4초에 걸쳐 사라진다.',
    ],
    when: ['폭발 · 착지 · 내려찍기처럼 바닥이 있는 충격', '「어디에」 떨어졌는지 바닥에 남겨 보여 주고 싶을 때'],
    avoid: ['바닥이 없는 공중 폭발 — 고리를 카메라 쪽으로 세우거나 빛 번쩍(점광)만', '울퉁불퉁한 지형 — 평평한 판이 떠 보인다. 그땐 Decal 투영을 쓴다'],
    cost: 'light',
    costNote: '판 하나에 짧은 셰이더. 고리 4장 · 자국 3장을 돌려 써서 새로 만들지 않는다. 폰에서도 가볍다.',
    level: 1,
    must: [
      '고리 · 자국은 미리 몇 개(고리 4 · 자국 3) 만들어 두고 돌려 쓴다 — 터질 때마다 new 하지 않기',
      '고리는 AdditiveBlending · depthWrite: false, 바닥보다 0.03 위',
      '그을음은 polygonOffset(−2, −2) 로 바닥과 깜박임(z-fighting) 없이, 놓을 때마다 무작위 회전',
      '고리 반지름은 easeOut, 밝기는 (1 − k)^1.4 — 등속으로 퍼지면 힘이 없다',
      '고리 · 그을음 켬/끔 단추',
    ],
    done: [
      '불덩이가 떨어진 자리에서 주황 · 흰 고리 둘이 퍼지고, 바닥에 검은 자국과 주황 불씨 금이 남았다 식는다',
      '고리 띠가 군데군데 끊겨 거칠게 보인다',
      '「충격 고리」 · 「그을음 데칼」을 하나씩 끄면 그 층만 사라진다',
      '자국이 바닥과 겹쳐 깜박이지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '충격 고리 판 (셰이더) + 시간에 따른 값',
      from: 'demos/demosSkillA.ts class Shock 를 정리',
      body: `const ringMat = new THREE.ShaderMaterial({
  uniforms: { uR: { value: 0 }, uW: { value: 0.05 }, uA: { value: 0 }, uCol: { value: new THREE.Color(0xffa850).multiplyScalar(3) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'uniform float uR, uW, uA; uniform vec3 uCol; varying vec2 vUv;' +
    'void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); float ang = atan(p.y, p.x);' +
    '  float d = (r - uR) / uW;' +
    '  float band = exp(-d*d) + exp(-pow((r - uR*0.82)/(uW*0.6), 2.0))*0.35;' +   // 바깥 띠 + 안쪽 옅은 띠
    '  float inner = (1.0 - smoothstep(0.0, uR, r)) * step(r, uR) * 0.12;' +
    '  float brk = 0.72 + 0.28 * sin(ang*13.0 + r*30.0) * sin(ang*7.0 - 2.0);' +  // 군데군데 끊김
    '  float a = (band*brk + inner) * uA * (1.0 - smoothstep(0.95, 1.0, r));' +
    '  gl_FragColor = vec4(uCol, clamp(a, 0.0, 1.0)); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMat);
ring.rotation.x = -Math.PI / 2;

// 쾅: ring.position.set(x, 0.03, z); ring.scale.setScalar(maxR); age = 0;
function updateRing(dt: number, dur: number): void {
  age += dt;
  const k = Math.min(1, age / dur);
  ringMat.uniforms.uR.value = (1 - Math.pow(1 - k, 3)) * 0.9; // easeOut 으로 퍼짐
  ringMat.uniforms.uW.value = 0.035 + 0.06 * k;               // 점점 굵게
  ringMat.uniforms.uA.value = Math.pow(1 - k, 1.4);           // 사라짐
  ring.visible = age <= dur;
}
// 그을음: polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
//   덮기 a = min(탄 자국 · uA · 0.95, 0.92), 불씨 = uHeat = exp(-t·1.1) · (0.85 + 0.15·sin(t·23))`,
    },
    pitfalls: [
      { title: '바닥과 같은 높이에 판을 놓으면 깜박인다', fix: '고리는 0.03 위로, 그을음은 polygonOffset(−2, −2) 로 앞에 그리게.' },
      { title: '터질 때마다 고리 메시를 새로 만들면 쓰레기가 쌓인다', fix: '고리 4개 · 자국 3개를 미리 만들고 돌아가며(i++ % 개수) 다시 쓴다.' },
      { title: '고리를 매끈한 원으로만 두면 수학 도형처럼 보인다', fix: '각도 sin 두 개를 곱한 끊김(0.72 ~ 1)으로 거칠게.' },
    ],
    prev: ['i171'],
    next: ['i429', 'i181'],
  },

  i180: {
    id: 'i180',
    summary: '룬 무늬 판 세 겹을 바닥에 눕혀 각도로 그려지게 하고 반대로 돌리다가, 차오르면 흐르는 무늬 빛기둥이 솟게 해서 시전 준비를 보여 준다.',
    terms: [
      { en: 'Magic circle (rotating rune rings)', ko: '마법진 — 겹겹이 반대로 도는 룬 고리' },
      { en: 'Angular reveal (polar wipe)', ko: '각도로 시계 방향 그려지기' },
      { en: 'CanvasTexture rune pattern', ko: '캔버스로 그린 룬 · 기하 무늬' },
      { en: 'Charge → burst timeline', ko: '그리기 → 차오름 → 발동 → 사라짐 시간표' },
    ],
    goal: '{target}에 바닥 마법진을 만들어 줘 — 세 겹 룬 고리가 시계 방향으로 그려지며 서로 반대로 돌고, 차오르면 빛기둥이 솟게. 분위기는 {style}.',
    targets: ['소환 · 레벨 업 순간', '수학 기호(원 · 다각형) 마법진', '보스 등장'],
    styles: ['금빛 · 분홍 룬', '귀엽고 아기자기', '어둡고 장엄한'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 바닥 Quad 여러 장에 룬 텍스처 + Shader Graph(Polar Coordinates 노드로 각도 잘라 그리기)를 붙이고 Z 축으로 돌린다.',
      godot: 'Godot 은 바닥 QuadMesh 에 spatial 셰이더(atan 으로 각도 · step 으로 그리기)를 붙이고 rotation 을 돌린다.',
    },
    principle: [
      '겹마다 캔버스로 그린 룬 텍스처(원 · 다각형 · 글자) 한 장을 판에 붙여 바닥에 눕힌다. 크기 4.4 · 3.0 · 1.6.',
      '셰이더가 판 가운데 기준 각도 ang(0~1)을 구해, ang < uRev 인 곳만 보인다 → uRev 를 0 → 1 로 올리면 시계 방향으로 그려진다. 그려지는 끝은 e^(−((uRev − ang)·30)²) 로 5배 밝게.',
      '세 겹을 0.25 · −0.45 · 0.8 배 빠르기로 서로 반대로 돌리고, 밝기는 0.85 + 0.15·sin(5t − 14r) 로 안에서 밖으로 맥박친다.',
      '5초 주기: 0 ~ 1.3초 그리기 → 1.3 ~ 2.5초 차오름(밝기 · 점광 · 금빛 알갱이 늘어남) → 2.5 ~ 4.3초 발동(흐르는 무늬 원통 빛기둥) → 4.1 ~ 4.9초 사라짐.',
    ],
    when: ['소환 · 레벨 업 · 큰 기술 직전 「준비 중」을 보여 줄 때', '원 · 정다각형을 겹쳐 그리는 수학 무늬를 멋지게 보여 줄 때'],
    avoid: ['짧은 일반 공격 — 1초 넘는 준비가 답답하다', '위에서 내려다보지 않는 구도(옆에서 보기) — 바닥 무늬가 납작해 안 보인다'],
    cost: 'light',
    costNote: '판 3장 + 원통 2개 + 금빛 알갱이 최대 900개. 텍스처는 처음 한 번 그린다. 폰에서도 가볍다.',
    level: 2,
    must: [
      '룬 무늬는 그림 파일 대신 캔버스로 그린다 (번역 · 색 바꾸기 쉽게)',
      '그려지기는 셰이더의 각도 비교(step(ang, uRev))로 — 텍스처를 다시 그리지 않는다',
      '세 겹은 서로 다른 빠르기 · 반대 방향으로 돈다',
      '그리기 → 차오름 → 발동 → 사라짐 시간표가 분명하게, 점광 세기도 함께',
      '회전 속도 · 겹 수(1~3) · 빛기둥 켬/끔 조절',
    ],
    done: [
      '바닥에 세 겹 룬 고리가 시계 방향으로 그려지고, 그려지는 끝이 반짝인다',
      '다 그려지면 겹마다 반대로 돌며 밝아지고, 금빛 알갱이가 떠오른다',
      '발동 순간 금빛 빛기둥이 솟았다가 마법진과 함께 사라진다',
      '「겹 수」 1 로 두면 바깥 고리 하나만 남는다',
    ],
    code: {
      lang: 'ts',
      title: '각도로 그려지는 룬 고리 재질 + 시간표',
      from: 'demos/demosSkillA.ts runeMat() · i180 update() 를 정리',
      body: `const runeMat = (tex: THREE.Texture, hex: number, I: number) => new THREE.ShaderMaterial({
  uniforms: { uTex: { value: tex }, uCol: { value: new THREE.Color(hex).multiplyScalar(I) }, uA: { value: 1 }, uRev: { value: 1 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader:
    'uniform sampler2D uTex; uniform vec3 uCol; uniform float uA, uRev, uTime; varying vec2 vUv;' +
    'void main(){ vec2 p = vUv*2.0-1.0; float r = length(p);' +
    '  float ang = atan(p.x, p.y) / 6.2831853 + 0.5;' +                       // 0 ~ 1 각도
    '  float vis = step(ang, uRev);' +                                        // 그려진 곳만
    '  float edge = exp(-pow((uRev - ang) * 30.0, 2.0)) * step(ang, uRev) * step(uRev, 0.999);' +
    '  float pulse = 0.85 + 0.15 * sin(uTime * 5.0 - r * 14.0);' +
    '  vec3 col = uCol * pulse * (1.0 + edge * 5.0);' +
    '  gl_FragColor = vec4(col, clamp(texture2D(uTex, vUv).r * vis * uA, 0.0, 1.0)); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

// 시간표 (5초 주기). layers = 바닥에 눕힌 판 세 장 (크기 4.4 · 3.0 · 1.6)
function update(t: number, rot: number): void {
  const k = t % 5;
  const reveal = Math.min(1, k / 1.3);
  const fade = 1 - Math.min(1, Math.max(0, (k - 4.1) / 0.8));
  const charge = Math.min(1, Math.max(0, (k - 1.3) / 1.2));
  const burst = k > 2.5 && k < 4.3 ? Math.sin(((k - 2.5) / 1.8) * Math.PI) : 0;
  layers.forEach((m, i) => {
    const u = m.material.uniforms;
    u.uRev.value = Math.min(1, Math.max(0, reveal * 1.15 - i * 0.08)); // 겹마다 살짝 늦게
    u.uA.value = fade * (0.75 + 0.5 * charge + 0.6 * burst);
    u.uTime.value = t;
    m.rotation.z = [0.25, -0.45, 0.8][i] * rot;                         // 반대로 돌기
  });
  light.intensity = fade * (3 + charge * 10 + burst * 26);
  beamMat.uniforms.uA.value = burst;                                    // 흐르는 무늬 원통 (i172)
}`,
    },
    pitfalls: [
      { title: '그려지기를 텍스처를 다시 그려서 하면 매 프레임 업로드로 버벅인다', fix: '텍스처는 한 번만 그리고, 보일 각도만 uniform(uRev)으로 바꾼다.' },
      { title: '세 겹이 같은 방향 · 같은 빠르기로 돌면 한 장처럼 보인다', fix: '빠르기와 방향을 겹마다 다르게(0.25 · −0.45 · 0.8).' },
      { title: '더하기 판 세 장이 겹친 곳이 하얗게 날아간다', fix: '겹마다 색을 다르게(금 · 분홍) 하고 세기를 2.2 ~ 2.6 정도로, 차오를 때만 밝힌다.' },
    ],
    prev: ['i172'],
    next: ['i181'],
  },

  i181: {
    id: 'i181',
    summary: '떨어질 곳을 바닥 원 · 부채꼴이 가장자리부터 안쪽까지 차오르며 미리 보여 주고, 다 차면 그 범위에 터지게 해서 피하거나 노릴 시간을 준다.',
    terms: [
      { en: 'AoE telegraph (area indicator)', ko: '광역 표시 — 맞을 범위를 미리 보여 주기' },
      { en: 'Radial fill indicator', ko: '반지름으로 차오르는 진행 표시' },
      { en: 'Sector mask (atan angle test)', ko: '각도로 부채꼴만 남기기' },
      { en: 'Animated hazard stripes', ko: '흐르는 사선 경고 줄무늬' },
    ],
    goal: '{target}이(가) 떨어질 곳을 바닥 원 · 부채꼴로 미리 보여 줘 — 테두리 · 흐르는 줄무늬 · 안에서 밖으로 차오르는 앞머리, 다 차면 그 범위에 터지게. 분위기는 {style}.',
    targets: ['유성 낙하 예고', '불 숨결(부채꼴) 공격', '넓이 문제의 범위 표시'],
    styles: ['빨간 경고 빛', '귀엽고 아기자기', '차분한 파랑 안내선'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 URP Decal Projector 나 바닥 Quad 에 Shader Graph(Polar Coordinates 로 반지름 · 각도) 로 그리고 진행 값을 Material 속성으로 올린다.',
      godot: 'Godot 은 바닥 QuadMesh + spatial 셰이더(length · atan) 에 uniform 으로 진행 값을 넘긴다.',
    },
    principle: [
      '바닥 판 하나에서 가운데까지 거리 r · 각도를 구한다. 원은 r ≤ 1 안쪽, 부채꼴은 |atan(x, y)| ≤ 반각(견본 0.55) 까지만.',
      '테두리는 r = 0.975 근처 가는 빛 띠, 부채꼴은 양옆 곧은 선도 같은 굵기로 그린다.',
      '안쪽은 아주 옅게(0.09) + 흐르는 사선 줄무늬 sin((x + y)·26 − 5t), 진행 uFill 까지는 0.32 로 채우고 그 끝(앞머리)은 밝은 띠로.',
      'uFill 을 0 → 1 로 1.6초에 걸쳐 올린다. 다 차면 그 자리에 폭발(원) · 불 숨결(부채꼴: 그 방향 ±0.5 rad 로 불꽃 70 + 불티 50) 을 터뜨린다.',
    ],
    when: ['큰 공격 · 낙하가 「어디에 언제」 떨어지는지 미리 알려 줘야 공정할 때', '넓이 · 범위 · 각도를 눈으로 보여 주는 수학 문제'],
    avoid: ['아주 빠른 공격 — 0.5초 안이면 표시를 읽기 전에 끝난다', '판 칸을 가리면 안 되는 퍼즐 — 칸 테두리만 깜박이는 표시가 낫다'],
    cost: 'light',
    costNote: '바닥 판 하나에 짧은 셰이더. 터질 때 입자 120개. 폰에서도 가볍다.',
    level: 1,
    must: [
      '원 · 부채꼴은 같은 셰이더 하나(define SECTOR)로 — 각도 검사만 다르게',
      '테두리 · 옅은 안쪽 · 흐르는 줄무늬 · 차오르는 앞머리 넷이 다 보이게',
      '차오르는 시간(0.6 ~ 3초)을 조절 값으로, 다 찬 순간에 정확히 터지게',
      '바닥보다 살짝 위(0.025), 더하기 섞기 · 깊이 안 씀',
    ],
    done: [
      '왼쪽 원 · 오른쪽 부채꼴이 가운데부터 바깥으로 차오르고, 테두리와 흐르는 줄무늬가 보인다',
      '다 차면 원에는 폭발이, 부채꼴에는 그 방향으로 불 숨결이 뿜어진다',
      '「차오르는 시간」을 바꾸면 예고 길이가 바로 바뀐다',
      '「모양」으로 원만 · 부채꼴만 · 둘 다 고를 수 있다',
    ],
    code: {
      lang: 'glsl',
      title: '원 · 부채꼴 예고 셰이더 (SECTOR 를 define 하면 부채꼴)',
      from: 'demos/demosSkillA.ts i181 teleMat() 을 정리',
      body: `uniform float uFill, uHalf, uA, uTime; // 진행 0~1 · 부채꼴 반각 · 투명도 · 시간
uniform vec3 uCol;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float inside = step(r, 1.0);
  float edge = exp(-pow((r - 0.975) / 0.022, 2.0));            // 둥근 테두리
#ifdef SECTOR
  float ang = abs(atan(p.x, p.y));
  inside *= step(ang, uHalf);                                   // 부채꼴만
  float side = exp(-pow(r * sin(uHalf - ang) / 0.022, 2.0)) * step(ang, uHalf + 0.05);
  edge = max(edge * step(ang, uHalf), side * step(r, 1.0));     // 양옆 곧은 선
#endif
  float filled = step(r, uFill) * inside;                       // 차오른 곳
  float front = exp(-pow((r - uFill) / 0.035, 2.0)) * inside;   // 앞머리
  float stripes = 0.5 + 0.5 * sin((p.x + p.y) * 26.0 - uTime * 5.0);
  float a = inside * (0.09 + 0.06 * stripes) + filled * 0.32 + front * 1.1 + edge;
  gl_FragColor = vec4(uCol * (1.0 + front * 1.5 + edge), clamp(a * uA, 0.0, 1.0));
}
// JS: uFill += dt / fillT (fillT 기본 1.6초), 1 이 되면 터뜨린다.
//     재질: transparent, depthWrite: false, AdditiveBlending, uCol = 0xff4020 × 2.6`,
    },
    pitfalls: [
      { title: '예고를 꽉 찬 빨강 원으로만 두면 남은 시간을 모른다', fix: '안에서 밖으로 차오르는 앞머리(uFill)로 남은 시간을 보여 준다.' },
      { title: '부채꼴을 원 셰이더에 마스크로만 자르면 양옆 선이 없어 범위가 흐릿하다', fix: '양옆 경계까지의 거리 r·sin(반각 − 각도) 로 곧은 선을 그린다.' },
      { title: '판이 바닥과 같은 높이면 깜박인다', fix: '0.025 위로 띄우고 depthWrite: false.' },
    ],
    prev: ['i180'],
    next: ['i178'],
  },

  i184: {
    id: 'i184',
    summary: '번개를 가장 가까운 대상 순서로 이어 튀게 하고 중간점을 흔드는 지그재그로 그려서, 맞을 때마다 번쩍 · 불티 · 바닥 빛이 따라오는 연쇄 번개를 만든다.',
    terms: [
      { en: 'Chain lightning', ko: '연쇄 번개 — 대상에서 대상으로 튀는 번개' },
      { en: 'Midpoint displacement', ko: '중간점 흔들기 — 선을 반씩 나누며 비틀어 지그재그' },
      { en: 'Greedy nearest-neighbor chain', ko: '가장 가까운 다음 대상을 차례로 고르기' },
      { en: 'Camera-facing ribbon segments', ko: '화면을 보는 캡슐 띠 (가운데 하얀 심 + 색 빛)' },
    ],
    goal: '{target} 사이를 튀어 다니는 연쇄 번개를 만들어 줘 — 가장 가까운 대상 차례로, 지그재그 · 갈래, 맞을 때마다 번쩍 · 불티. 분위기는 {style}.',
    targets: ['가까운 적 여럿', '가까운 수끼리 잇기 (연결 그래프)', '점과 점을 잇는 정답 연출'],
    styles: ['푸른 전기 마법', '귀엽고 아기자기', '보랏빛 폭풍'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 LineRenderer 의 점을 중간점 흔들기로 만들고 Additive 재질을 붙인다. 맞은 곳은 Particle System Burst.',
      godot: 'Godot 은 ImmediateMesh(또는 MeshInstance3D + SurfaceTool)로 화면을 보는 띠를 그리거나 Line2D(2D)에 점을 넣는다.',
    },
    principle: [
      '순서 정하기: 지팡이 끝에서 가장 가까운 적 → 그 적에서 남은 것 중 가장 가까운 적 … (욕심쟁이 잇기).',
      '번개 모양: 시작 · 끝 두 점에서 출발해 각 선분의 가운데를 진행 방향에 수직으로 흔든다. 5번 나누면 33점, 흔드는 폭은 길이 × 0.3 에서 단계마다 0.55배.',
      '같은 모양을 0.045초마다 새 씨앗으로 다시 만들어 지직거린다. 선분마다 굵은 옅은 빛(3.2배, 0.22) + 가는 밝은 심 두 겹.',
      'i 번째 튐은 0.35 + 0.11i 초에 시작해 0.62초에 사라진다. 갈래 둘은 중간쯤 점에서 비스듬히 짧게(3번 나눔).',
      '맞는 순간: 불티 18개 · 큰 번쩍 · 점광 한 번 · 적 색 물들이기 · 바닥 빛 1 → e^(−2.2t) · 화면 흔들림 0.05.',
    ],
    when: ['여러 대상을 차례로 맞히는 기술 · 연결 보여 주기', '그래프에서 가까운 점끼리 잇는 과정을 보여 줄 때'],
    avoid: ['대상이 하나뿐 — 그냥 빔(i172)이 낫다', '번쩍임에 민감한 화면 — 0.045초 깜박임 대신 0.1초 이상으로 늦추고 세기를 낮춘다'],
    cost: 'light',
    costNote: '번개 선분 수십 개를 인스턴스 띠 하나로 그린다. 점광은 하나를 돌려 쓴다. 폰에서도 가볍다.',
    level: 2,
    must: [
      '튀는 순서는 가장 가까운 다음 대상(욕심쟁이) — 화면에서 지그재그로 왔다 갔다 하지 않게',
      '번개는 중간점 흔들기(수직 방향, 단계마다 폭 0.55배)로, 0.045초마다 다시 만들어 지직거리게',
      '선분은 굵은 옅은 빛 + 가는 밝은 심 두 겹, 더하기 섞기',
      '맞을 때 번쩍 · 불티 · 점광 · 바닥 빛 · 작은 흔들림을 함께, 점광은 하나를 돌려 쓰기',
      '튀는 횟수(1~6) · 갈래 켬/끔 · 세기 조절',
    ],
    done: [
      '지팡이에서 나온 번개가 가장 가까운 적부터 차례로 튀고, 맞은 적마다 푸르게 번쩍이며 바닥이 빛난다',
      '번개 선이 지직거리며 모양이 계속 바뀌고, 중간에 짧은 갈래가 뻗는다',
      '「튀는 횟수」를 바꾸면 맞는 적 수가 바뀐다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '중간점 흔들기 번개 + 욕심쟁이 순서',
      from: 'demos/demosSkillB.ts boltPts() · drawBolt() · i184 make() 를 정리',
      body: `type V3 = [number, number, number];
// 선분 가운데를 진행 방향에 수직으로 흔들며 반씩 나누기
function boltPts(a: V3, b: V3, rnd: () => number, depth = 5, jag = 0.32): V3[] {
  let pts: V3[] = [a, b];
  let off = len3(sub3(b, a)) * jag;
  for (let d = 0; d < depth; d++) {
    const np: V3[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const dir = norm3(sub3(q, p));
      let r: V3 = [rnd() - 0.5, (rnd() - 0.5) * 0.8, rnd() - 0.5];
      r = sub3(r, sc3(dir, r[0] * dir[0] + r[1] * dir[1] + r[2] * dir[2])); // 수직 성분만
      np.push(add3(sc3(add3(p, q), 0.5), sc3(r, off)), q);
    }
    pts = np;
    off *= 0.55; // 잘게 나눌수록 작게 흔든다
  }
  return pts;
}
// 굵은 옅은 빛 + 가는 밝은 심 (streaks.seg = 화면을 보는 캡슐 띠 한 칸)
function drawBolt(pts: V3[], w: number, c: V3, a: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    streaks.seg(pts[i], pts[i + 1], w * 3.2, c, a * 0.22);
    streaks.seg(pts[i], pts[i + 1], w, sc3(c, 1.8), a);
  }
}
// 순서: 지팡이에서 가장 가까운 적 → 그다음 가까운 적 …
const order: number[] = [];
let cur = tip;
const left = new Set(mons.map((_, i) => i));
while (left.size) {
  let best = -1, bd = 1e9;
  for (const i of left) { const d = len3(sub3(mons[i].center(), cur)); if (d < bd) { bd = d; best = i; } }
  order.push(best); left.delete(best); cur = mons[best].center();
}
// 매 프레임: i 번째 튐은 0.35 + 0.11i 초부터 0.62초 — 씨앗을 0.045초마다 바꿔 지직
// const r = rng(Math.floor(lt / 0.045) * 31 + i * 977); drawBolt(boltPts(a, b, r, 5, 0.3), 0.045, BC, fade);`,
    },
    pitfalls: [
      { title: '흔들기를 무작위 방향으로 하면 번개가 앞뒤로 접혀 엉킨다', fix: '흔드는 벡터에서 진행 방향 성분을 빼 수직으로만 흔든다.' },
      { title: '매 프레임 새 모양이면 너무 빨리 깜박여 눈이 아프다', fix: '씨앗을 0.045초 단위로만 바꾼다(그 사이엔 같은 모양).' },
      { title: '순서를 배열 순서대로 하면 번개가 화면을 가로질러 왔다 갔다 한다', fix: '현재 자리에서 가장 가까운 남은 대상을 차례로 고른다.' },
      { title: '맞을 때마다 점광을 새로 만들면 셰이더가 다시 컴파일된다', fix: '점광 하나를 미리 두고 자리 · 세기만 바꾼다(Flash.kick).', seen: true },
    ],
    prev: ['i171'],
    next: ['i185'],
  },

  i185: {
    id: 'i185',
    summary: '빛 구슬 여러 개를 부채꼴로 쏜 뒤 매 프레임 목표 쪽으로 속도를 조금씩 돌려서, 휘어지며 움직이는 목표를 쫓아가 맞는 유도 미사일을 만든다.',
    terms: [
      { en: 'Homing missile (steering)', ko: '유도 탄 — 목표 쪽으로 방향을 조금씩 틀기' },
      { en: 'Seek steering behavior', ko: '원하는 속도와 지금 속도의 차이만큼 꺾기' },
      { en: 'Ribbon trail', ko: '지나온 점을 이어 가늘어지는 꼬리' },
      { en: 'Fan-out launch', ko: '부채꼴로 퍼뜨려 쏘기' },
    ],
    goal: '{target}을(를) 쫓아가는 유도 미사일을 만들어 줘 — 여러 개가 부채꼴로 퍼졌다가 휘어지며 따라가 맞고, 리본 꼬리가 남게. 분위기는 {style}.',
    targets: ['움직이는 괴물 하나', '여러 개 동시 맞히기 (곱셈 묶음)', '정답 칸으로 날아가는 별'],
    styles: ['보라 · 분홍 비전 빛', '귀엽고 아기자기', '푸른 얼음 탄'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Update 에서 velocity = Vector3.Lerp(velocity, 원하는 속도, turn) 로 꺾고 TrailRenderer 로 꼬리를 단다.',
      godot: 'Godot 은 _process 에서 velocity = velocity.lerp(원하는 속도, turn) 로 꺾고, 꼬리는 지나온 점을 ImmediateMesh 로 잇는다.',
    },
    principle: [
      '쏠 때 k 번째 미사일 옆 속도를 (k/(n−1)·2 − 1)·4.2 로 주어 부채꼴로 퍼뜨린다 (위로도 2.4 ~ 4).',
      '매 프레임 원하는 속도 = 목표 방향 × (6.5 + 나이 × 5) — 오래 날수록 빨라진다.',
      '속도를 원하는 속도 쪽으로 turn = min(1, (1.5 + 나이 × 9)·유도 세기·dt) 만큼 끌어당긴다. 처음엔 거의 안 꺾여 크게 휘고, 갈수록 날카롭게 꺾여 결국 맞는다.',
      '목표까지 0.38 안이거나 2.4초가 지나면 맞음: 불티 16 · 번쩍 · 빛 알갱이 10 · 점광 · 흔들림.',
      '꼬리는 지나온 자리 16개를 이어 앞은 굵게(0.12) 뒤는 가늘고 옅게, 색은 분홍 → 보라로 섞는다.',
    ],
    when: ['움직이는 목표를 반드시 맞혀야 하는 연출', '여러 개가 한꺼번에 한 곳으로 모이는 장면 (묶음 세기)'],
    avoid: ['정해진 곳에 정확한 시간에 닿아야 할 때 — 유도는 도착 시간이 들쭉날쭉하다. 그땐 베지에 곡선(i208 처럼)으로 시간을 정한다', '수십 개 동시 — 꼬리 선분이 많아진다'],
    cost: 'light',
    costNote: '미사일마다 계산 몇 줄 + 꼬리 선분 16개. 9개면 선분 150개 정도를 띠 한 묶음으로. 폰에서도 가볍다.',
    level: 2,
    must: [
      '유도는 「속도를 원하는 속도 쪽으로 조금씩」 — 위치를 목표로 직접 lerp 하지 않는다 (그러면 휘지 않고 미끄러진다)',
      '꺾는 세기는 나이에 따라 커지게 — 처음엔 크게 휘고 끝엔 반드시 맞게',
      '최대 비행 시간(2.4초)을 두어 영원히 도는 미사일이 없게',
      '꼬리는 지나온 점 목록으로, 맞은 뒤에도 꼬리가 줄어들며 사라진다',
      '미사일 수(1~9) · 유도 세기 · 리본 꼬리 켬/끔 조절',
    ],
    done: [
      '보라 빛 구슬 다섯 개가 부채꼴로 퍼졌다가 휘어지며 움직이는 괴물을 쫓아가 하나씩 맞는다',
      '맞을 때마다 분홍 불티 · 번쩍 · 바닥 빛이 터진다',
      '「유도 세기」를 낮추면 크게 돌아서 늦게 맞고, 높이면 거의 곧게 날아간다',
      '「리본 꼬리」를 끄면 구슬만 날아간다',
    ],
    code: {
      lang: 'ts',
      title: '쏘기(부채꼴) · 유도(속도 꺾기) · 리본 꼬리',
      from: 'demos/demosSkillB.ts i185 make() 를 정리',
      body: `interface Mis { p: V3; v: V3; age: number; trail: V3[]; live: boolean }
const mis: Mis[] = [];
let count = 5, homing = 1;

function fire(k: number, tip: V3): void { // k 번째를 부채꼴로
  const s = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
  mis.push({ p: tip, v: [1.2 + Math.random(), 2.4 + Math.random() * 1.6, s * 4.2 + (Math.random() - 0.5)], age: 0, trail: [], live: true });
}

function step(dt: number, tgt: V3): void {
  for (const m of mis) {
    if (m.live) {
      m.age += dt;
      const to = sub3(tgt, m.p);
      const want = sc3(norm3(to), 6.5 + m.age * 5);                 // 오래 날수록 빠르게
      const turn = Math.min(1, (1.5 + m.age * 9) * homing * dt);   // 갈수록 날카롭게 꺾임
      m.v = add3(m.v, sc3(sub3(want, m.v), turn));
      m.p = add3(m.p, sc3(m.v, dt));
      m.trail.unshift(m.p);
      if (m.trail.length > 16) m.trail.pop();
      if (len3(to) < 0.38 || m.age > 2.4) { m.live = false; /* 불티 · 번쩍 · 점광 · 흔들림 */ }
    } else if (m.trail.length) m.trail.pop();                       // 맞은 뒤 꼬리 줄이기
    const n = m.trail.length;                                        // 리본: 앞 굵게 → 뒤 가늘게
    for (let i = 0; i < n - 1; i++) {
      const k = 1 - i / (n - 1);
      streaks.seg(m.trail[i + 1], m.trail[i], 0.11 * k + 0.01, mix3(PINK, PURPLE, k), 0.75 * k);
    }
  }
  for (let i = mis.length - 1; i >= 0; i--) if (!mis[i].live && !mis[i].trail.length) mis.splice(i, 1);
}`,
    },
    pitfalls: [
      { title: '꺾는 세기를 늘 같게 두면 목표 둘레를 영원히 돈다', fix: '나이에 따라 꺾는 세기 · 속도를 키우고(1.5 + 9·나이), 2.4초가 지나면 맞은 것으로 친다.' },
      { title: '위치를 목표로 바로 lerp 하면 휘는 맛이 없다', fix: '속도를 꺾어야 관성이 남아 곡선이 생긴다.' },
      { title: '맞자마자 미사일을 지우면 꼬리가 툭 끊긴다', fix: 'live = false 로 두고 꼬리 점을 한 프레임에 하나씩 빼다가 다 빠지면 지운다.' },
    ],
    prev: ['i184'],
    next: ['i191'],
  },

  i191: {
    id: 'i191',
    summary: '반투명 구에 프레넬 테두리 · 육각 무늬를 그리고 맞은 방향을 셰이더에 넘겨서, 맞은 곳에서 육각 물결이 퍼지고 금이 갔다 아무는 보호막을 만든다.',
    terms: [
      { en: 'Force field / energy shield shader', ko: '보호막 셰이더' },
      { en: 'Fresnel rim', ko: '가장자리일수록 밝게 (보는 각도)' },
      { en: 'Triplanar hexagon pattern', ko: '세 방향에서 투영한 육각 무늬' },
      { en: 'Hit ripple via uniform array', ko: '맞은 방향 · 시각을 배열로 넘겨 물결' },
    ],
    goal: '{target}을(를) 감싸는 보호막을 만들어 줘 — 반투명 구 · 가장자리 빛 · 육각 무늬, 맞으면 그 자리에서 물결이 퍼지고 금이 갔다 아물게. 분위기는 {style}.',
    targets: ['마법사 캐릭터', '지켜야 할 성 · 판', '실수를 막아 주는 방어막'],
    styles: ['푸른 SF 에너지', '귀엽고 아기자기', '금빛 성스러운 빛'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 의 Fresnel Effect + 육각 텍스처, 맞은 점은 Material.SetVectorArray 로 넘긴다.',
      godot: 'Godot 은 spatial 셰이더(render_mode blend_add, cull_disabled)에서 uniform vec4 배열로 맞은 점을 받는다.',
    },
    principle: [
      '가장자리 빛: fr = 1 − |n·v|, rim = fr³ — 구의 테두리만 밝고 가운데는 거의 투명.',
      '육각 무늬: 구 위 점 P(정규화)를 yz · zx · xy 세 평면에 투영해 육각 거리 함수를 계산하고, |P|⁴ 비율로 섞는다(삼면 투영). 무늬 크기 K = 5.5.',
      '맞은 방향 · 시각을 vec4 배열 4칸에 돌려 넣는다. 셰이더는 맞은 점과의 각도 거리 ang 를 재, ang = 나이 × 2.4 에 물결 띠를 그린다(1.6초).',
      '물결이 지나가는 곳만 육각 무늬가 2.2배 밝아지고, 맞은 바로 그 자리엔 짧은 하얀 점(spot)이 번쩍인다.',
      '금: 맞은 곳 0.75 rad 안에서 보로노이 경계(3D) 를 그려 1.3초 동안 금이 보였다 사라진다.',
    ],
    when: ['방어 · 보호를 보여 줄 때 (실수 1번 막아 주기 등)', '「어디를 맞았나」를 보여 줘야 할 때'],
    avoid: ['보호막이 화면 대부분을 덮을 때 — 픽셀마다 보로노이 반복문이 돌아 폰에서 무겁다. 금 가기를 끄거나 작게', '평평한 벽 방어막 — 구가 아니라 판이면 각도 대신 거리로 물결을 계산한다'],
    cost: 'medium',
    costNote: '구 하나지만 픽셀마다 육각 3번 + 맞은 곳 근처에서 보로노이(27칸 × 2번) 반복문. 맞은 곳 근처(cz > 0.01)에서만 돌린다.',
    level: 3,
    must: [
      '맞은 방향 · 시각은 uniform vec4 배열(4칸)로 — 맞을 때마다 재질을 새로 만들지 않는다',
      '물결 · 금은 각도 거리(acos(P·H))로 — 구 위에서 고르게 퍼지게',
      '금 계산(보로노이)은 맞은 곳 근처에서만 (조건문으로 건너뛰기)',
      'AdditiveBlending · side: DoubleSide · depthWrite: false',
      '육각 무늬 · 금 가기 켬/끔, 세기 조절',
    ],
    done: [
      '불덩이가 사방에서 날아와 구에 닿으면 그 자리에서 육각 물결이 둥글게 퍼진다',
      '맞은 곳에 하얀 점이 번쩍이고 금이 갔다가 1.3초 안에 아문다',
      '「육각 무늬」를 끄면 테두리 빛과 물결만 남는다',
      '동시에 4번 맞아도 물결이 각자 퍼진다',
    ],
    code: {
      lang: 'glsl',
      title: '보호막 조각 셰이더 (요지 — 육각 · 물결 · 금)',
      from: 'demos/demosSkillB.ts i191 shMat 을 정리',
      body: `uniform float uT; uniform vec4 uHit[4]; uniform vec3 uC; uniform float uHex, uCrack;
varying vec3 vN, vV, vP;
float hexD(vec2 p){ const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  vec2 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
  vec2 a = abs(g); return 0.5 - max(dot(a, s * 0.5), a.x); }
// float vorEdge(vec3 x) — 3D 보로노이 경계 거리 (견본 참고, 27칸 두 번)
void main(){
  float fr = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(fr, 3.0);
  vec3 P = normalize(vP);
  vec3 w = pow(abs(P), vec3(4.0)); w /= (w.x + w.y + w.z);          // 삼면 투영 비율
  float e = hexD(P.yz * 5.5) * w.x + hexD(P.zx * 5.5) * w.y + hexD(P.xy * 5.5) * w.z;
  float hex = 1.0 - smoothstep(0.0, 0.07, e);
  float ripple = 0.0, spot = 0.0, crack = 0.0, near = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 H = uHit[i]; float age = uT - H.w;                         // xyz = 맞은 방향, w = 시각
    if (age < 0.0 || age > 1.6) continue;
    float ang = acos(clamp(dot(P, H.xyz), -1.0, 1.0));
    ripple += exp(-pow((ang - age * 2.4) * 6.0, 2.0)) * (1.0 - age / 1.6);
    near += exp(-ang * ang * 6.0) * (1.0 - age / 1.6);
    spot += exp(-ang * ang * 45.0) * max(0.0, 1.0 - age * 3.5);
    if (uCrack > 0.5) {
      float cz = smoothstep(0.75, 0.0, ang) * max(0.0, 1.0 - age / 1.3);
      if (cz > 0.01) crack += (1.0 - smoothstep(0.0, 0.035, vorEdge(P * 6.0 + H.xyz * 13.0))) * cz;
    }
  }
  float a = 0.035 + rim * 0.75 + hex * uHex * (0.05 + rim * 0.35 + ripple * 2.2 + near * 0.5) + ripple * 0.45 + spot * 2.0 + crack * 1.6;
  gl_FragColor = vec4(uC * a + vec3(1.0) * (spot * 1.6 + crack * 1.4 + ripple * hex * uHex * 0.8), 1.0);
}
// JS: 맞으면 hits[hi % 4].set(dir.x, dir.y, dir.z, time); hi++;  (dir = 중심에서 맞은 곳 방향)`,
    },
    pitfalls: [
      { title: '맞을 때마다 재질 · 메시를 새로 만들면 멈칫한다', fix: 'vec4 배열 4칸을 돌려 쓰고 값만 바꾼다. 재질이 그대로면 셰이더도 그대로다.' },
      { title: '육각 무늬를 UV 로 깔면 구의 극에서 찌그러진다', fix: '구 위 점을 세 평면에 투영해 |P|⁴ 비율로 섞는다(삼면 투영).' },
      { title: '보로노이 금을 화면 전체에서 계산하면 폰이 버벅인다', fix: '맞은 곳 0.75 rad 안(cz > 0.01)에서만 계산한다. 반복문이 많은 셰이더는 첫 컴파일도 길어지니 미리 데운다.', seen: true },
    ],
    prev: ['i185'],
    next: ['i195'],
  },

  i195: {
    id: 'i195',
    summary: '장면을 먼저 텍스처로 그려 두고 구 표면에서 그 텍스처를 휘게 · 흑백으로 다시 읽어, 구 안쪽만 색이 빠지고 굴절되며 안에 든 것들이 그 자리에 멈춘다.',
    terms: [
      { en: 'Screen-space refraction (scene texture)', ko: '화면 굴절 — 그려 둔 장면을 휘게 다시 읽기' },
      { en: 'Desaturation (luminance)', ko: '흑백 — 밝기만 남기기' },
      { en: 'Chromatic aberration', ko: '빨강 · 초록 · 파랑을 조금씩 다르게 휘기' },
      { en: 'Local time scale', ko: '자리마다 다른 시간 빠르기 (구 안 = 0)' },
    ],
    goal: '{target} 둘레에 시간 정지 구를 만들어 줘 — 구 안쪽만 색이 빠지고 굴절되어 휘어 보이며, 안에 든 불티 · 미사일 · 괴물은 그 자리에 멈추게. 분위기는 {style}.',
    targets: ['뛰는 괴물 · 날아가는 미사일', '시간 문제(시계) 마법', '멈춤 · 일시 정지 연출'],
    styles: ['금빛 시계 테두리 + 푸른 흑백', '귀엽고 아기자기', '차가운 SF 정지장'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 는 Opaque Texture(_CameraOpaqueTexture) 를 켜고 Shader Graph 의 Scene Color 노드를 법선만큼 밀어 읽는다.',
      godot: 'Godot 4 는 spatial 셰이더에서 hint_screen_texture 샘플러를 SCREEN_UV + 법선 오프셋으로 읽는다.',
    },
    principle: [
      '구를 숨기고 장면을 렌더 타깃(HalfFloat)에 먼저 그린 뒤, 구를 보이고 진짜 화면을 그린다.',
      '구 셰이더는 화면 좌표(gl_FragCoord / 해상도)로 그 텍스처를 읽되 법선 xy 만큼 밀어 읽는다: 밀기 = n.xy × 세기 × (0.03 + 0.09·fr²). 가장자리일수록 많이 휜다.',
      '빨강 1.15 · 초록 1 · 파랑 0.85 배로 다르게 밀어 무지갯빛 가장자리, 밝기 l 로 흑백 + 푸른빛(0.62, 0.78, 1.1)을 섞는다.',
      '테두리는 금빛 fr⁴ · 1.3. 구 반지름은 0.4 ~ 1.0초에 easeOut 으로 2.1 까지 커졌다 4.9 ~ 5.6초에 줄어든다.',
      '입자 · 미사일 · 괴물은 자리마다 시간 배율 smoothstep(0.88R, 1.02R, 중심까지 거리)을 곱한다 — 구 안은 0 이라 멈춘다.',
    ],
    when: ['시간 정지 · 느리게 · 멈춤 마법', '「이 안만 다르다」를 강하게 보여 줄 때 (구역 표시)'],
    avoid: ['폰에서 장면이 무거울 때 — 구가 보이는 동안 장면을 두 번 그린다', '구가 화면 대부분을 덮는 가까운 카메라 — 휘기가 심해 어지럽다. 굴절 세기를 낮춘다'],
    cost: 'medium',
    costNote: '구가 보이는 동안만 장면을 한 번 더 그린다(화면 크기 HalfFloat 타깃). 구 셰이더 자체는 텍스처 3번 읽기로 가볍다.',
    level: 3,
    must: [
      '장면 텍스처 패스는 구가 보일 때만, 구 · 시계 무늬는 그 패스에서 숨긴다',
      '렌더 타깃 크기 = 화면 크기, uRes 도 같은 값 (gl_FragCoord 로 읽으니 픽셀 단위)',
      '굴절은 법선 xy 만큼 밀어 읽기, 빨강 · 초록 · 파랑을 조금씩 다르게',
      '멈춤은 재생을 멈추는 게 아니라 자리마다 시간 배율을 곱하기 — 구 밖은 그대로 움직인다',
      '굴절 세기(0 ~ 3) · 흑백 켬/끔 조절',
    ],
    done: [
      '구가 커지면 그 안만 푸른 흑백이 되고 뒤 배경이 휘어 보인다',
      '구 안의 불티 분수 · 미사일 · 뛰는 괴물이 공중에서 멈추고, 구 밖 괴물은 계속 뛴다',
      '구가 줄어들면 멈췄던 것들이 다시 움직인다',
      '「굴절 세기」 0 이면 휘지 않고 색만 빠진다',
    ],
    code: {
      lang: 'ts',
      title: '장면 텍스처 패스 + 굴절 · 흑백 구 셰이더 + 자리별 시간 배율',
      from: 'demos/demosSkillB.ts i195 make() · render() 를 정리',
      body: `const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
const sMat = new THREE.ShaderMaterial({
  uniforms: { uTex: { value: rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uRef: { value: 1 }, uGray: { value: 1 }, uA: { value: 1 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
    ' vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform sampler2D uTex; uniform vec2 uRes; uniform float uRef, uGray, uA; varying vec3 vN; varying vec3 vV;' +
    'void main(){ vec3 n = normalize(vN); float ndv = abs(dot(n, normalize(vV))); float fr = 1.0 - ndv;' +
    ' vec2 uv = gl_FragCoord.xy / uRes;' +
    ' vec2 off = n.xy * uRef * (0.03 + 0.09 * fr * fr) * uA;' +                    // 가장자리일수록 많이 휨
    ' vec3 c; c.r = texture2D(uTex, uv - off * 1.15).r; c.g = texture2D(uTex, uv - off).g; c.b = texture2D(uTex, uv - off * 0.85).b;' +
    ' float l = dot(c, vec3(0.299, 0.587, 0.114));' +
    ' vec3 g = mix(c, vec3(l / (1.0 + l)) * vec3(0.62, 0.78, 1.1) * 0.85, uGray * uA);' +
    ' vec3 rim = vec3(1.0, 0.78, 0.4) * pow(fr, 4.0) * 1.3;' +
    ' gl_FragColor = vec4(g * (0.7 + 0.2 * ndv) + rim * uA, 1.0); }',
});

function render(r: THREE.WebGLRenderer, w: number, h: number): void {
  if (sphere.visible) {
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    sMat.uniforms.uRes.value.set(w, h);
    sphere.visible = false;            // 구 빼고 장면만 텍스처로
    r.setRenderTarget(rt); r.render(scene, cam); r.setRenderTarget(null);
    sphere.visible = true;
  }
  r.render(scene, cam);
}

// 자리마다 시간 배율: 구 안 0, 밖 1 (경계는 부드럽게)
const tsAt = (x: number, y: number, z: number): number =>
  R < 0.05 ? 1 : smoothstep(R * 0.88, R * 1.02, Math.hypot(x - CEN[0], y - CEN[1], z - CEN[2]));
// 입자 한 걸음에 dt * tsAt(입자 자리) 를 넘긴다. 미사일: m.x += dt * 3.2 * tsAt(m.x, m.y, m.z)`,
    },
    pitfalls: [
      { title: '장면 텍스처 패스에 구를 같이 그리면 구가 자기 자신을 비춰 이상해진다', fix: '패스 전에 구 · 시계 무늬를 숨기고, 끝나면 다시 보인다.' },
      { title: '렌더 타깃을 화면과 다른 크기로 두면 휘는 자리가 어긋난다', fix: 'render 마다 크기를 비교해 setSize, uRes 도 같은 값.' },
      { title: '「멈춤」을 전체 재생 정지로 하면 구 밖까지 멈춘다', fix: '물체 · 입자마다 자기 자리의 시간 배율을 곱한다. 경계는 smoothstep 으로 부드럽게.' },
    ],
    prev: ['i175'],
    next: ['i204'],
  },

  i196: {
    id: 'i196',
    summary: '효과를 방출량 · 속도 · 크기 · 수명 · 색조 · 중력 · 퍼짐 · 층 켬/끔 값 묶음으로 만들고 JSON 으로 저장해서, 코드를 안 고치고 조절판으로 효과를 다듬는다.',
    terms: [
      { en: 'Data-driven VFX (effect presets)', ko: '값으로 정의하는 효과 · 프리셋' },
      { en: 'VFX graph / effect editor', ko: '방출기 → 곡선 → 층 노드로 보는 효과 편집기' },
      { en: 'JSON serialization', ko: '효과를 JSON 글로 저장 · 불러오기' },
      { en: 'Parameter interpolation between presets', ko: '프리셋 사이 값을 부드럽게 옮기기' },
    ],
    goal: '{target}을(를) 값 묶음으로 정의하는 효과 편집기를 만들어 줘 — 방출 · 수명 · 층을 조절판으로 바꾸면 바로 보이고, 오른쪽에 같은 효과의 JSON 이 나오고 복사할 수 있게. 분위기는 {style}.',
    targets: ['불덩이 · 얼음 · 독 · 비전 효과', '정답 · 보상 효과 모음', '게임 전체 효과 목록'],
    styles: ['어두운 작업대 + 보라 패널', '귀엽고 아기자기', '깔끔한 개발 도구'],
    platforms: ['three', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 VFX Graph(노드 편집기) 가 같은 생각이고, 값 묶음은 ScriptableObject 로 저장한다.',
      godot: 'Godot 은 ParticleProcessMaterial 을 .tres 리소스로 저장해 여러 효과가 나눠 쓴다.',
    },
    principle: [
      '효과 하나 = 값 묶음: rate(초당 개수) · speed · size · life · hue · gravity(− 는 위로) · spread + 층 켬/끔(핵 · 불꽃 · 연기 · 불티 · 바닥).',
      '같은 방출 코드가 이 값만 읽어 입자를 뿜는다 — 불꽃은 rate, 연기는 rate × 0.2, 불티는 rate × 0.35. 색은 hue 하나에서 hot · mid · dark 세 단계를 만든다.',
      '프리셋 4개(불덩이 · 얼음 결정 · 독 샘 · 비전 소용돌이)를 3.6초마다 바꾸며, 숫자 값은 1 − e^(−4dt) 로 부드럽게 옮긴다. 색조는 짧은 쪽으로 돌아간다(0.9 → 0.1 은 0.2 차이).',
      '오른쪽 판은 노드 셋(방출기 · 수명 곡선 · 층) 그림 + JSON.stringify 결과. 값이 바뀌었을 때만, 0.12초에 한 번까지 다시 그린다.',
    ],
    when: ['비슷한 효과를 여러 개 만들어야 할 때 — 코드 하나 + 값 여럿', '디자이너 · 다른 사람이 효과를 다듬어야 할 때'],
    avoid: ['효과가 한두 개뿐 — 편집기 만드는 품이 더 든다', '모양 자체가 다른 효과(번개 · 보호막) — 값 묶음으론 안 된다. 그런 건 따로 코드'],
    cost: 'light',
    costNote: '효과 자체는 입자 방출(최대 900 + 연기 220 + 불티 300). 판 캔버스는 값이 바뀔 때만 다시 그린다.',
    level: 3,
    must: [
      '효과는 값 묶음(타입 하나)으로 정의하고, 방출 코드는 그 값만 읽는다 — 효과마다 다른 코드 금지',
      'JSON 으로 저장 · 복사 (클립보드), 같은 JSON 으로 다시 만들 수 있게',
      '프리셋 바꿀 때 값을 부드럽게 옮기고, 색조는 짧은 쪽으로 돈다',
      '판 그리기는 값이 바뀐 때만 + 최소 간격(0.12초) — 매 프레임 캔버스 업로드 금지',
      '조절판: 방출량 · 크기 · 색조 · 중력 · 연기 층 · 불티 층 · 다음 프리셋 · JSON 복사',
    ],
    done: [
      '받침대 위 효과가 불덩이 → 얼음 → 독 → 비전으로 부드럽게 바뀌고, 오른쪽 JSON 이 함께 바뀐다',
      '조절판 값을 바꾸면 이름이 「내 효과」가 되고 효과 · JSON 이 바로 바뀐다',
      '「JSON 복사」로 복사한 글에 emitter · particle · curves · layers 가 들어 있다',
      '폰에서도 끊김 없이',
    ],
    code: {
      lang: 'ts',
      title: '효과 값 묶음 · 프리셋 사이 옮기기 · 값으로 방출 · JSON',
      from: 'demos/demosSkillB.ts i196 make() 를 정리',
      body: `interface FX { rate: number; speed: number; size: number; life: number; hue: number; gravity: number; spread: number;
  core: boolean; flame: boolean; smoke: boolean; sparks: boolean; ground: boolean }
const PRESETS: { name: string; fx: FX }[] = [
  { name: '불덩이', fx: { rate: 70, speed: 1.6, size: 0.9, life: 0.9, hue: 0.06, gravity: -1.4, spread: 0.35, core: true, flame: true, smoke: true, sparks: true, ground: true } },
  { name: '얼음 결정', fx: { rate: 55, speed: 2.4, size: 0.5, life: 1.1, hue: 0.55, gravity: 1.8, spread: 0.9, core: true, flame: true, smoke: false, sparks: true, ground: true } },
];
const cur: FX = { ...PRESETS[0].fx };

function blendTo(tg: FX, dt: number): void { // 프리셋 사이 부드럽게
  const k = 1 - Math.exp(-dt * 4);
  for (const key of ['rate', 'speed', 'size', 'life', 'hue', 'gravity', 'spread'] as const) {
    const a = cur[key];
    let b = tg[key];
    if (key === 'hue' && Math.abs(b - a) > 0.5) b += b < a ? 1 : -1; // 색조는 짧은 쪽으로
    cur[key] = key === 'hue' ? (((a + (b - a) * k) % 1) + 1) % 1 : a + (b - a) * k;
  }
  for (const key of ['core', 'flame', 'smoke', 'sparks', 'ground'] as const) cur[key] = tg[key];
}

function emitFlame(dt: number, E: V3): void { // 값만 읽는 같은 코드
  for (let i = rate(fAcc, cur.rate, dt); i > 0; i--) {
    const d = norm3([rr(-1, 1) * cur.spread, 1, rr(-1, 1) * cur.spread]);
    fx.emit({ p: add3(E, sc3(randDir(), 0.12)), v: sc3(d, cur.speed * rr(0.6, 1.2)), life: cur.life * rr(0.7, 1.2),
      size: cur.size * 0.5, size2: cur.size * 1.1, c: HSL(cur.hue, 1, 0.6, 2.4), c2: HSL(cur.hue + 0.02, 1, 0.3, 0.5),
      a: 0.5 / Math.max(1, cur.size * 1.3), grav: cur.gravity, drag: 0.8 });
  }
}

const json = (name: string): string => JSON.stringify({
  effect: name,
  emitter: { shape: 'cone', rate: Math.round(cur.rate), spread: +cur.spread.toFixed(2), speed: +cur.speed.toFixed(2) },
  particle: { life: +cur.life.toFixed(2), size: +cur.size.toFixed(2), gravity: +cur.gravity.toFixed(2), hue: +cur.hue.toFixed(2) },
  layers: { core: cur.core, flame: cur.flame, smoke: cur.smoke, sparks: cur.sparks, ground: cur.ground },
}, null, 1);`,
    },
    pitfalls: [
      { title: '효과마다 방출 코드를 따로 쓰면 편집기가 못 따라간다', fix: '방출 코드는 하나, 다른 건 값뿐이어야 JSON 하나로 효과가 다시 만들어진다.' },
      { title: '색조를 그냥 lerp 하면 빨강 → 보라 사이에 무지개가 다 지나간다', fix: '차이가 0.5 넘으면 1 을 더하거나 빼서 짧은 쪽으로 돈다.' },
      { title: '판 캔버스를 매 프레임 다시 그리면 텍스처 업로드로 버벅인다', fix: '값이 바뀐 때(dirty)만, 그것도 0.12초 간격 이상으로.' },
    ],
    prev: ['i170', 'i171'],
  },

  /* ═══════════════ 입자 · 연출 ═══════════════ */

  u35: {
    id: 'u35',
    summary: '글씨 · 하트 · Z 를 캔버스에 그려 Sprite 로 띄워서, 카메라가 어디로 돌아도 늘 정면으로 보이는 점수 · 표시를 만든다.',
    terms: [
      { en: 'Billboard sprite (THREE.Sprite)', ko: '늘 카메라를 보는 판' },
      { en: 'SpriteMaterial + CanvasTexture', ko: '캔버스로 그린 글씨를 스프라이트 그림으로' },
      { en: 'World-space label', ko: '3D 자리에 붙는 글씨 표시' },
      { en: 'Floating text (rise & fade)', ko: '떠오르며 사라지는 글씨' },
    ],
    goal: '{target}을(를) 늘 카메라 정면을 보는 스프라이트로 띄워 줘 — 캔버스로 글씨를 그리고, 떠오르며 나타났다 사라지게. 분위기는 {style}.',
    targets: ['점수 +10 · 하트 · 잠자는 Z', '말 · 캐릭터 머리 위 이름표', '칸 위 숫자 표시'],
    styles: ['맑은 하늘 동화', '귀엽고 아기자기', '굵은 만화 글씨'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 TextMeshPro(월드) 를 두고 LateUpdate 에서 transform.rotation = 카메라 회전 으로 맞춘다 (빌보드).',
      godot: 'Godot 은 Label3D · Sprite3D 의 billboard 속성을 켠다.',
    },
    principle: [
      'THREE.Sprite 는 자리만 3D 이고 늘 화면 쪽을 본다. 평면 판(PlaneGeometry)은 옆으로 돌면 얇아지지만 스프라이트는 그대로다.',
      '글씨는 캔버스에 그린다: 글씨 폭을 measureText 로 재서 캔버스 크기를 정하고, 굵은 테두리(strokeText) → 글씨(fillText) 순서.',
      'CanvasTexture 는 SRGBColorSpace, 재질은 transparent · depthWrite: false. 크기는 높이 h 를 정하고 가로는 캔버스 비율로 (h × 폭 / 높이).',
      '떠오르는 표시는 2.4초 주기로 1.6 만큼 올라가며, 처음 15% 동안 나타나고 60% 뒤부터 사라진다. 크기도 0.7 → 1 로 톡 커진다.',
    ],
    when: ['점수 · 하트 · 상태(잠, 화남)처럼 3D 물체에 붙는 작은 표시', '이름표 · 칸 숫자처럼 어느 각도에서도 읽혀야 하는 글씨'],
    avoid: ['바닥에 눕혀 써야 하는 글씨(칸 위 무늬) — 평면 판 + 캔버스 텍스처가 맞다', '많이 바뀌는 긴 문장 — 바뀔 때마다 캔버스를 새로 그려 올려야 한다. 그땐 HTML 층이 낫다'],
    cost: 'light',
    costNote: '스프라이트 하나 = 판 하나. 글씨가 바뀔 때만 캔버스를 다시 그린다. 수십 개는 폰에서도 가볍다.',
    level: 1,
    must: [
      '글씨 캔버스 크기는 measureText 로 재서 정하고, 스프라이트 가로 · 세로 비율을 캔버스와 같게 (찌그러짐 금지)',
      'CanvasTexture.colorSpace = SRGBColorSpace — 안 하면 색이 바랜다',
      'SpriteMaterial 은 transparent · depthWrite: false',
      '글씨를 바꿀 때 예전 텍스처 · 재질은 dispose',
      '굵은 테두리(strokeText, lineJoin round)를 글씨 아래에 — 배경 위에서도 읽히게',
    ],
    done: [
      '카메라가 빙 돌 때 왼쪽 평면 판은 옆에서 얇아지고, 오른쪽 스프라이트는 늘 정면으로 보인다',
      '잠자는 친구 위로 Z, 뛰는 친구 위로 ♥ · +10 이 떠오르며 나타났다 사라진다',
      '글씨가 늘어나거나 찌그러지지 않는다',
      '폰에서도 글씨가 또렷하다',
    ],
    code: {
      lang: 'ts',
      title: '캔버스 글씨 → 스프라이트 (비율 그대로)',
      from: 'demos/demosSim.ts textSprite() · u35 update() 를 정리',
      body: `function textSprite(s: string, o: { size?: number; color?: string; stroke?: string; bg?: string; h?: number } = {}): THREE.Sprite {
  const size = o.size ?? 64;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '800 ' + size + 'px Pretendard, system-ui, sans-serif';
  g.font = font;
  const pad = Math.round(size * 0.45);
  c.width = Math.ceil(g.measureText(s).width) + pad * 2;   // 글씨 폭에 맞춘 캔버스
  c.height = Math.round(size * 1.6);
  g.font = font;                                           // 크기를 바꾸면 글꼴이 풀리니 다시
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (o.bg) { g.fillStyle = o.bg; g.beginPath(); g.roundRect(2, 2, c.width - 4, c.height - 4, c.height / 2 - 2); g.fill(); }
  if (o.stroke) { g.lineWidth = size * 0.16; g.lineJoin = 'round'; g.strokeStyle = o.stroke; g.strokeText(s, c.width / 2, c.height / 2 + size * 0.04); }
  g.fillStyle = o.color ?? '#fff';
  g.fillText(s, c.width / 2, c.height / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const hh = o.h ?? 0.5;
  sp.scale.set((hh * c.width) / c.height, hh, 1);          // 캔버스 비율 그대로
  return sp;
}

// 떠오르며 나타났다 사라지기 (2.4초 주기, t0 = 하나마다 다른 시작)
const k = ((t + t0) % 2.4) / 2.4;
spr.position.set(base.x + Math.sin(k * 6 + t0) * 0.25, 1.1 + k * 1.6, base.z);
spr.material.opacity = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
const sc = 0.7 + Math.min(1, k * 4) * 0.3;
spr.scale.set(w0 * sc, h0 * sc, 1); // w0 · h0 = 처음 크기`,
    },
    pitfalls: [
      { title: '캔버스 크기를 정한 뒤 글꼴을 다시 안 넣으면 기본 글꼴로 그려진다', fix: 'canvas.width 를 바꾸면 그리기 상태가 초기화된다. 크기를 정한 뒤 g.font 를 다시 넣는다.' },
      { title: '스프라이트 크기를 정사각형으로 두면 글씨가 찌그러진다', fix: '가로 = 높이 × 캔버스 폭 / 캔버스 높이.' },
      { title: '글씨를 자주 바꾸며 새 텍스처만 만들면 GPU 메모리가 샌다', fix: '바꿀 때 예전 map · material 을 dispose 한다.' },
    ],
    next: ['i202', 'u36'],
    refs: [{ name: 'three.js 문서 — Sprite', url: 'https://threejs.org/docs/#api/en/objects/Sprite' }],
  },

  u36: {
    id: 'u36',
    summary: '같은 모양 수천 개를 InstancedMesh 하나로 묶고 행렬 · 색만 칸마다 넣어서, 관중 4000명을 그리기 호출 2번으로 그리고 파도타기도 행렬만 바꿔 움직인다.',
    terms: [
      { en: 'GPU instancing (THREE.InstancedMesh)', ko: '같은 모양을 한 번에 여러 번 그리기' },
      { en: 'setMatrixAt / setColorAt', ko: '하나하나의 자리 · 회전 · 크기 · 색 넣기' },
      { en: 'Draw call', ko: 'CPU 가 GPU 에 「그려」라고 하는 한 번' },
      { en: 'InstancedMesh.count', ko: '앞에서부터 몇 개만 그릴지' },
    ],
    goal: '{target}을(를) InstancedMesh 로 수천 개 그려 줘 — 그리기 호출은 모양 종류 수만큼만, 움직임은 행렬만 바꿔서. 분위기는 {style}.',
    targets: ['경기장 관중', '풀 · 꽃 · 구슬', '판 위 같은 블록 수백 개'],
    styles: ['밤 경기장 조명', '귀엽고 아기자기', '들판 한낮'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 재질의 Enable GPU Instancing 을 켜거나 Graphics.RenderMeshInstanced 로 행렬 배열을 그린다.',
      godot: 'Godot 은 MultiMeshInstance3D(MultiMesh 의 set_instance_transform · set_instance_color) 가 같은 것이다.',
    },
    principle: [
      '물체 하나하나를 Mesh 로 만들면 물체마다 행렬 계산 · 화면 안 검사 · 그리기 호출이 붙어 CPU 가 막힌다.',
      'InstancedMesh(모양, 재질, 최대 개수) 하나에 칸마다 행렬(setMatrixAt)과 색(setColorAt)만 넣으면 GPU 가 한 번에 다 그린다.',
      '관중 = 몸(상자) InstancedMesh + 머리(공) InstancedMesh, 80 × 50 = 4000칸. 그리기 호출 2번.',
      '파도타기: 칸마다 위상 ph 를 두고 들림 = max(0, sin(ph − 3.2t))³ × 0.45. 매 프레임 행렬만 다시 넣고 instanceMatrix.needsUpdate = true.',
      'count 를 바꾸면 앞에서부터 그만큼만 그린다 — 줄 순서로 정렬해 두면 앞줄부터 채워진다.',
    ],
    when: ['같은 모양이 수십 개 넘을 때 (풀 · 관중 · 블록 · 구슬)', '프레임이 CPU 에서 막힐 때 — 물체 수(1000개 넘음)가 원인일 때'],
    avoid: ['하나하나 다른 모양 · 다른 재질 — 인스턴싱은 같은 모양 · 같은 재질끼리만. 고정 물체는 합치기(mergeStatic)', '몇 개뿐인 물체 — 그냥 Mesh 가 단순하다'],
    cost: 'light',
    costNote: '그리기 호출은 모양 종류 수(관중 2번). 매 프레임 행렬 4000개를 다시 넣는 CPU 계산이 남는다 — 안 움직이면 넣지 않는다.',
    level: 1,
    must: [
      '같은 모양 · 같은 재질은 InstancedMesh 하나로 — 칸마다 Mesh 를 만들지 않는다',
      '행렬은 Matrix4.compose(자리, 회전, 크기) 하나를 돌려 쓰고, 다 넣은 뒤 instanceMatrix.needsUpdate = true 한 번',
      '색은 setColorAt, 바꿨으면 instanceColor.needsUpdate = true',
      '움직이지 않는 프레임엔 행렬을 다시 넣지 않는다',
      '개수(count) 조절 · 파도타기 켬/끔',
    ],
    done: [
      '관중 수 슬라이더(200 ~ 4000)를 올려도 그리기 호출은 「2번」 그대로이고 부드럽다',
      '파도타기가 옆으로 흐르며 관중이 차례로 일어난다',
      '관중 옷 색이 사람마다 다르다 (setColorAt)',
      '폰에서 4000명도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '관중 4000명 — 몸 · 머리 InstancedMesh 두 개와 파도타기',
      from: 'demos/demosSim.ts u36 make() · update() 를 정리',
      body: `const COLS = 80, ROWS = 50, MAX = COLS * ROWS;
const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.42, 0.24), new THREE.MeshLambertMaterial(), MAX);
const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffd2a8 }), MAX);
const pal = [0xff4a5a, 0xffd23a, 0x3ab0ff, 0x4ae07a, 0xffffff, 0xff8a3a, 0xb07aff];
const col = new THREE.Color();
const seats: { x: number; y: number; z: number; ry: number; ph: number }[] = [];
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) {
    const ang = (c / (COLS - 1) - 0.5) * 2.0, R = 9 + r * 0.5;   // 둥근 관중석
    seats.push({ x: Math.sin(ang) * R, y: r * 0.36, z: -Math.cos(ang) * R + 6, ry: -ang, ph: c * 0.16 });
    body.setColorAt(seats.length - 1, col.setHex(pal[Math.floor(Math.random() * pal.length)]));
  }
scene.add(body, head);

const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
const v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
function update(t: number, count: number, waveOn: boolean): void {
  body.count = head.count = count;                 // 앞에서부터 count 명만
  for (let k = 0; k < count; k++) {
    const s = seats[k];
    const w = waveOn ? Math.max(0, Math.sin(s.ph - t * 3.2)) : 0;
    const up = Math.pow(w, 3) * 0.45;              // 파도타기
    q.setFromEuler(e.set(0, s.ry, 0));
    body.setMatrixAt(k, m.compose(v.set(s.x, s.y + 0.21 + up, s.z), q, one));
    head.setMatrixAt(k, m.compose(v.set(s.x, s.y + 0.55 + up, s.z), q, one));
  }
  body.instanceMatrix.needsUpdate = true;
  head.instanceMatrix.needsUpdate = true;
}`,
    },
    pitfalls: [
      { title: '같은 모양을 Mesh 로 하나씩 만들면 수백 개에서 CPU 가 막힌다', fix: '이 사이트 3D 퍼즐이 물체 1,000 ~ 1,700개를 하나씩 그려 느렸다. 움직이는 같은 모양은 인스턴싱, 고정된 것은 mergeStatic 으로 합쳤다.', seen: true },
      { title: '인스턴스가 처음 자리 밖으로 움직이면 통째로 사라진다', fix: 'three.js 는 묶음 전체의 경계로 화면 밖 검사를 한다. 넓게 움직이면 computeBoundingSphere() 를 다시 하거나 frustumCulled = false.' },
      { title: 'needsUpdate 를 칸마다 켜면 헛일이 많다', fix: '모든 칸을 넣은 뒤 한 번만 켠다.' },
    ],
    next: ['i170'],
    refs: [
      { name: 'three.js 문서 — InstancedMesh', url: 'https://threejs.org/docs/#api/en/objects/InstancedMesh' },
      { name: 'three.js 예제 — webgl_instancing_performance', url: 'https://threejs.org/examples/#webgl_instancing_performance' },
    ],
  },

  u38: {
    id: 'u38',
    summary: '3D 판 위에 HTML 층을 하나 덮고 CSS 로 집중선 · 번쩍 · 컷인 띠 · 별 터짐 글자 · 꽃가루를 띄워서, 결정적 순간을 만화처럼 크게 보여 준다.',
    terms: [
      { en: 'DOM overlay effects (CSS animation)', ko: 'HTML 층 위 연출 — CSS 애니메이션' },
      { en: 'Manga speed lines (repeating-conic-gradient)', ko: '만화 집중선 — 가운데가 빈 방사형 줄' },
      { en: 'Starburst SVG polygon', ko: '뾰족뾰족 별 터짐 말풍선' },
      { en: 'Restart CSS animation (reflow)', ko: '클래스를 뗐다 붙여 애니메이션 다시 시작' },
    ],
    goal: '{target}에 만화 연출 층을 덮어 줘 — 집중선 · 번쩍 · 기술 이름 컷인 띠 · 별 터짐 큰 글자 · 종이 꽃가루를 HTML · CSS 로. 분위기는 {style}.',
    targets: ['숫자 야구 홈런 순간', '정답 · 체크메이트 순간', '필살기 · 레벨 업'],
    styles: ['밤 야구장 애니메이션', '귀엽고 아기자기', '굵은 소년 만화'],
    platforms: ['web'],
    principle: [
      '판(캔버스) 위에 position: absolute · pointer-events: none 인 층(.nb-fx)을 덮어, 그 안에 연출 요소를 넣고 뺀다. 판 클릭은 그대로 통과한다.',
      '집중선: repeating-conic-gradient 로 판 가운데(--cx · --cy)에서 퍼지는 가는 흰 줄, 가운데는 radial-gradient 마스크로 비운다. 0.12초마다 살짝 커졌다(1.06 ↔ 1.1) 떨린다.',
      '별 터짐: SVG 다각형 꼭짓점을 바깥 · 안쪽 반지름으로 번갈아(24 또는 18 갈래) 찍고, 위에 굵은 테두리 글자(-webkit-text-stroke + paint-order)를 얹는다. 튀어나오는 탄성 이징 0.42초.',
      '같은 애니메이션을 다시 틀려면 클래스를 뗀 뒤 void el.offsetWidth 로 다시 그리게 하고 붙인다.',
      '컷인 · 딱지 · 꽃가루처럼 잠깐 쓰는 요소는 수명(초)을 적어 두고 지나면 지운다. 꽃가루 60조각은 CSS 변수(--dx · --r)로 저마다 다르게.',
    ],
    when: ['홈런 · 정답처럼 짧고 결정적인 순간을 크게', '글자 · 말풍선이 들어가 번역이 필요한 연출 — HTML 글씨는 번역 · 글꼴이 쉽다'],
    avoid: ['늘 떠 있는 표시 — 공통 HUD 가 맞다', '3D 물체에 붙어 함께 움직여야 하는 것 — 스프라이트(u35)로'],
    cost: 'light',
    costNote: 'CSS 그러데이션 · 변형 애니메이션뿐. 꽃가루 60조각도 GPU 합성으로 가볍다. 다 쓴 요소를 지우지 않으면 쌓인다.',
    level: 2,
    must: [
      '연출 층은 pointer-events: none — 판 입력을 막지 않는다',
      '판 가운데 · 크기를 CSS 변수(--cx · --cy · --fw · --fh)로 넘겨 화면 크기와 상관없이 맞게',
      '애니메이션 다시 틀기는 클래스 떼기 → void el.offsetWidth → 붙이기',
      '잠깐 쓰는 요소는 수명이 지나면 remove() — 쌓이지 않게',
      '글자는 번역 키로(한국어 원문) — 그림에 글씨를 넣지 않는다',
    ],
    done: [
      '공이 다가오면 집중선 · 기술 이름 컷인 띠, 꽂히면 번쩍 · 「스트라이크!」 · 「볼!」 딱지가 뜬다',
      '홈런이면 금빛 무지개 집중선 · 큰 별 터짐 「홈런!」 · 꽃가루가 쏟아진다',
      '연출이 떠 있는 동안에도 판을 누를 수 있다',
      '폰 가로 화면(844×390)에서 글자가 화면 밖으로 안 나간다',
    ],
    code: {
      lang: 'ts',
      title: '별 터짐 꼭짓점 · 애니메이션 다시 틀기 · 잠깐 쓰는 요소',
      from: 'demos/demosSim.ts u38 make() (+ numbaseball/ballfx.css) 를 정리',
      body: `// CSS (요지)
// .nb-fx   { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
// .nb-speed{ position:absolute; inset:0; opacity:0; mix-blend-mode:screen;
//   background: repeating-conic-gradient(from 0deg at var(--cx,50%) var(--cy,50%),
//     rgba(255,255,255,.9) 0deg .6deg, transparent .6deg 3.1deg, rgba(255,255,255,.55) 3.1deg 3.5deg, transparent 3.5deg 7deg);
//   mask: radial-gradient(ellipse calc(var(--fw)*.36) calc(var(--fh)*.34) at var(--cx) var(--cy), transparent 55%, #000 100%); }
// .nb-speed.on { opacity:.45; animation: nb-speed-jitter .12s steps(2) infinite; }

// 별 터짐 다각형: 바깥 · 안쪽 반지름을 번갈아
function burst(spikes: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let k = 0; k < spikes * 2; k++) {
    const a = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? inner : outer * (0.9 + ((k * 37) % 10) / 100); // 바깥 끝을 조금씩 다르게
    pts.push((Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1));
  }
  return pts.join(' ');
}
function showComic(el: HTMLElement, kind: 'hr' | 'out', text: string): void {
  el.className = 'nb-comic ' + kind;
  el.innerHTML = '<svg viewBox="-100 -100 200 200"><polygon points="' + burst(kind === 'hr' ? 24 : 18, 98, kind === 'hr' ? 62 : 70) + '"/></svg><b>' + text + '</b>';
  void el.offsetWidth;         // 다시 그리게 해서 애니메이션을 처음부터
  el.classList.add('on');
}
// 잠깐 쓰는 요소: 수명이 지나면 지운다
const temp: { el: HTMLElement; until: number }[] = [];
function add(fx: HTMLElement, el: HTMLElement, now: number, life: number): void { fx.appendChild(el); temp.push({ el, until: now + life }); }
function sweep(now: number): void {
  for (let i = temp.length - 1; i >= 0; i--) if (temp[i].until < now) { temp[i].el.remove(); temp.splice(i, 1); }
}`,
    },
    pitfalls: [
      { title: '클래스를 다시 붙여도 애니메이션이 처음부터 안 나온다', fix: '같은 클래스면 브라우저가 무시한다. 떼고 void el.offsetWidth 로 다시 계산시킨 뒤 붙인다.' },
      { title: '연출 층이 판 클릭을 먹는다', fix: '층 전체에 pointer-events: none.' },
      { title: '만화 글자를 그림으로 넣으면 번역이 안 된다', fix: '이 사이트 규칙 — 그림에 글씨를 넣지 않고 HTML · SVG 글씨로, 한국어 원문을 번역 키로.', seen: true },
      { title: '꽃가루 · 딱지를 지우지 않으면 판이 거듭될수록 느려진다', fix: '만들 때 수명을 적어 두고 매 프레임 지난 것을 remove().' },
    ],
    next: ['u39', 'i428'],
    refs: [{ name: 'MDN — repeating-conic-gradient()', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/repeating-conic-gradient' }],
  },

  u39: {
    id: 'u39',
    summary: '도장을 크게 · 흐리게 위에서 0.32초에 내려찍고 닿는 순간 살짝 눌림 · 종이 흔들림 · 잉크 번짐을 붙여서, 판정이 「쾅」 하고 박힌다.',
    terms: [
      { en: 'Stamp slam animation', ko: '도장 내려찍기 연출' },
      { en: 'Ease-in drop (scale + blur + drop-shadow)', ko: '크게 · 흐리게 · 그림자 길게 → 작게 · 또렷하게' },
      { en: 'Impact shake (decaying)', ko: '닿는 순간 잦아드는 흔들림' },
      { en: 'Ink bleed', ko: '도장 둘레 잉크 번짐' },
    ],
    goal: '{target}에 판정 도장을 쾅 찍는 연출을 만들어 줘 — 위에서 크게 내려오며 또렷해지고, 닿는 순간 눌림 · 종이 흔들림 · 잉크 번짐. 분위기는 {style}.',
    targets: ['검사서 통과 · 보류 · 반려 판정', '숙제 「참 잘했어요」 도장', '레벨 완료 인증'],
    styles: ['나무 책상 위 서류', '귀엽고 아기자기', '딱딱한 관공서'],
    platforms: ['web', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 도장 Image 의 localScale · rotation 을 코루틴(또는 DOTween)으로 2.8 → 1 로 줄이고, 닿을 때 부모 RectTransform 을 흔든다.',
      godot: 'Godot 은 Tween 으로 scale · rotation 을 내리고, 닿는 순간 다른 Tween 으로 종이 position 을 흔든다.',
    },
    principle: [
      '내려오기 0.32초: 크기 lerp(2.8, 1, q²) — 처음 느리고 끝에서 빨라져 「쾅」. 회전 −24° → −9°, 흐림 3px → 0, 그림자 거리 30px → 0.',
      '닿는 순간(처음 25%): 크기 1 − sin(q/0.25·π)·0.08 로 살짝 눌렸다 펴진다.',
      '종이 흔들림 0.5초: 폭 (1 − q)·6·세기, x = sin(90k)·폭, y = cos(70k)·폭·0.7, 회전도 조금. 빨리 잦아든다.',
      '잉크 번짐: 도장보다 큰 원(52%)에 도장 색 radial-gradient, 0.6 + 0.6·easeOut(q) 배로 퍼진다.',
      '도장 글자 · 테두리는 SVG(원 두 겹 + 글자)로 그려 번역된다. 판정마다 색이 다르다(반려 빨강 · 통과 초록 · 보류 주황).',
    ],
    when: ['판정 · 인증 · 통과처럼 「결정이 내려졌다」를 보여 줄 때', '손으로 찍는 맛이 필요한 서류 · 검사 게임'],
    avoid: ['자주 반복되는 작은 확인 — 매번 흔들리면 피곤하다. 작은 체크 표시로', '어지러움에 민감한 화면 — 흔들림 세기를 0 으로 둘 수 있게'],
    cost: 'light',
    costNote: 'CSS transform · filter 만 바꾼다. 흐림(blur)은 내려오는 0.32초에만 걸고 닿으면 none.',
    level: 1,
    must: [
      '내려오기는 끝에서 빨라지는 이징(q²) — 등속이면 「쾅」이 없다',
      '닿기 전엔 크게 · 흐리게 · 그림자 길게, 닿으면 크기 1 · 흐림 없음 · 그림자 없음',
      '흔들림은 종이(받는 쪽)에, 잦아들게(1 − q), 세기 조절(0 이면 끔)',
      '도장 글자 · 테두리는 SVG 로 — 그림에 글씨를 넣지 않는다',
      'filter: blur 는 내려오는 동안만, 닿으면 none',
    ],
    done: [
      '도장이 크고 흐릿하게 내려와 종이에 닿는 순간 또렷해지며 살짝 눌린다',
      '닿는 순간 종이가 흔들리고 도장 둘레로 잉크가 번진다',
      '반려 · 통과 · 보류가 색을 바꿔 차례로 찍힌다',
      '「흔들림 세기」 0 이면 흔들림 없이 찍힌다',
    ],
    code: {
      lang: 'ts',
      title: '도장 내려찍기 · 눌림 · 종이 흔들림 · 잉크 번짐 (k = 이번 판정 시작 뒤 초)',
      from: 'demos/demosSim.ts u39 update() 를 정리',
      body: `const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const DROP = 0.32;
let shakeAmt = 1;

function stampStep(k: number, stamp: HTMLElement, paper: HTMLElement, ink: HTMLElement): void {
  if (k < DROP) {                                   // 내려오기
    const q = k / DROP;
    stamp.style.transform = 'translate(-50%,-50%) scale(' + lerp(2.8, 1, q * q) + ') rotate(' + lerp(-24, -9, q) + 'deg)';
    stamp.style.opacity = String(Math.min(0.95, q * 2));
    stamp.style.filter = 'blur(' + (1 - q) * 3 + 'px) drop-shadow(0 ' + (1 - q) * 30 + 'px 10px rgba(0,0,0,.4))';
    paper.style.transform = 'rotate(-3deg)';
    ink.style.opacity = '0';
  } else {                                          // 닿은 뒤
    const q = (k - DROP) / 0.5;
    const amp = q < 1 ? (1 - q) * 6 * shakeAmt : 0;
    const sx = Math.sin(k * 90) * amp, sy = Math.cos(k * 70) * amp * 0.7;
    const sq = q < 0.25 ? 1 - Math.sin((q / 0.25) * Math.PI) * 0.08 : 1; // 살짝 눌림
    stamp.style.transform = 'translate(-50%,-50%) scale(' + sq + ') rotate(-9deg)';
    stamp.style.filter = 'none';
    paper.style.transform = 'translate(' + sx + 'px,' + sy + 'px) rotate(' + (-3 + sx * 0.15) + 'deg)';
    ink.style.opacity = String(Math.max(0.4, Math.min(1, 1 - q * 0.5)));
    ink.style.transform = 'translate(-50%,-50%) scale(' + (0.6 + easeOut(Math.min(1, q)) * 0.6) + ')';
  }
}
// 도장 그림: SVG 원 두 겹 + 글자 (판정마다 색) — 반려 #d8283a · 통과 #1a9a4a · 보류 #e08a1a
// ink.style.background = 'radial-gradient(circle, ' + c + '22, ' + c + '00 70%)';`,
    },
    pitfalls: [
      { title: '닿은 뒤에도 blur 를 걸어 두면 글자가 뿌옇고 느리다', fix: '내려오는 동안만 filter 를 쓰고 닿으면 none.' },
      { title: '도장을 흔들면 찍힌 게 아니라 떨리는 것처럼 보인다', fix: '흔들림은 받는 쪽(종이)에 준다. 도장은 종이 안에 있어 함께 움직인다.' },
      { title: '도장 글자를 그림에 넣으면 다른 언어에서 못 쓴다', fix: '수학 검문소 규칙 — 도장 · 단추 글씨는 전부 SVG 글자로 그려 번역되게 한다.', seen: true },
    ],
    prev: ['u38'],
    next: ['i429'],
  },

  i23: {
    id: 'i23',
    summary: '누른 카드의 자리 · 크기 · 모서리를 화면 전체로 이어 키우고 나머지는 옅게 사라지게 해서, 메뉴에서 게임으로 화면이 툭 바뀌지 않고 이어진다.',
    terms: [
      { en: 'Shared element transition', ko: '같은 요소가 이어지며 바뀌는 화면 전환' },
      { en: 'View Transitions API', ko: '브라우저 기본 화면 전환 (document.startViewTransition)' },
      { en: 'FLIP animation (First · Last · Invert · Play)', ko: '처음 · 끝 자리를 재서 사이를 움직이기' },
      { en: 'Rect interpolation', ko: '사각형 자리 · 크기 · 둥근 모서리 lerp' },
    ],
    goal: '{target}에서 누른 카드가 그대로 커져 다음 화면이 되게 해 줘 — 나머지 카드는 옅어지고, 닫을 때는 거꾸로 카드로 돌아가게. 분위기는 {style}.',
    targets: ['게임 고르기 메뉴 → 게임 화면', '일차 목록 → 그날 근무 화면', '목록 → 자세히 보기'],
    styles: ['밝은 카드 메뉴', '귀엽고 아기자기', '차분한 앱 화면'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 누른 카드 RectTransform 의 anchoredPosition · sizeDelta 를 화면 전체 크기로 트윈하고, 다른 카드 CanvasGroup.alpha 를 0 으로.',
      godot: 'Godot 은 Control 의 position · size 를 Tween 으로 화면 크기까지 키우고 다른 카드 modulate.a 를 내린다.',
    },
    principle: [
      '그냥 바뀜: 열림 값이 0.5 를 넘는 순간 메뉴를 숨기고 게임을 보인다 — 어디서 왔는지 끊긴다.',
      '이어짐: 누른 카드의 사각형 [x, y, 폭, 높이] 를 열림 e(0 → 1, 0.6초, smoothstep)로 화면 전체 [0, 0, 100, 100] 까지 lerp 한다. 둥근 모서리 2.4 → 0, 카드 아이콘 크기 → 0.',
      '다른 카드는 1 − e 로 옅어지며 85% 까지 살짝 작아지고, 제목도 옅어진다. 게임 화면은 열림이 60% 를 넘은 뒤에 나타난다.',
      '닫을 때는 같은 값을 거꾸로(1 → 0) 돌리면 카드로 돌아간다. 브라우저의 View Transitions API 도 같은 생각(이전 · 다음 화면을 찍어 그 사이를 이어 줌)이지만, 견본은 직접 사각형을 lerp 한다.',
    ],
    when: ['메뉴 → 게임, 목록 → 자세히처럼 「이걸 눌러서 여기 왔다」를 보여 줄 때', '화면 전환이 툭 바뀌어 새로고침처럼 느껴질 때'],
    avoid: ['아주 자주 오가는 탭 — 0.6초 연출이 답답하다. 바뀌는 부분만 갈아 끼운다', '카드와 다음 화면 모양이 전혀 달라 이어 보일 게 없을 때 — 옅게 겹치기(크로스페이드)로'],
    cost: 'light',
    costNote: 'left · top · width · height 를 매 프레임 바꾸면 레이아웃 계산이 붙는다. 카드 몇 장은 괜찮지만 무거운 화면이면 transform(scale · translate)으로 바꾼다.',
    level: 2,
    must: [
      '누른 카드의 자리 · 크기 · 모서리가 화면 전체까지 이어 커진다 (갑자기 다른 상자가 나타나지 않게)',
      '다른 카드 · 제목은 동시에 옅어진다, 다음 화면 내용은 열림 60% 뒤에',
      '닫을 때는 같은 값을 거꾸로 — 카드 자리로 돌아간다',
      '열기 0.6초 안, smoothstep 같은 부드러운 이징',
      '바뀌는 부분만 움직인다 — 화면 전체를 다시 그리지 않는다',
    ],
    done: [
      '왼쪽(그냥 바뀜)은 누르면 화면이 툭 바뀌고, 오른쪽(이어짐)은 누른 빨간 카드가 그대로 커져 게임 화면이 된다',
      '오른쪽에서 다른 카드는 옅어지며 살짝 작아진다',
      '닫힐 때 게임 화면이 다시 그 카드 자리로 줄어든다',
      '폰에서도 끊김 없이',
    ],
    code: {
      lang: 'ts',
      title: '카드 → 화면 이어 키우기 (open = 0 → 1)',
      from: 'demos/demosSim.ts i23 update() 를 정리',
      body: `type Rect = [number, number, number, number]; // left · top · width · height (%)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const slot = (i: number): Rect => [8 + (i % 2) * 44, 18 + Math.floor(i / 2) * 40, 40, 34];
const FULL: Rect = [0, 0, 100, 100];

function place(el: HTMLElement, r: Rect, rad: number): void {
  el.style.left = r[0] + '%';
  el.style.top = r[1] + '%';
  el.style.width = r[2] + '%';
  el.style.height = r[3] + '%';
  el.style.borderRadius = rad + 'cqh';
}

// open: 0 메뉴 · 1 게임 (열 때 0 → 1, 닫을 때 1 → 0, 각 0.6초)
function transition(open: number, picked: number, tiles: HTMLElement[], head: HTMLElement, game: HTMLElement): void {
  const e = ease(open);
  tiles.forEach((el, i) => {
    if (i === picked) {
      const s = slot(i);
      place(el, [lerp(s[0], FULL[0], e), lerp(s[1], FULL[1], e), lerp(s[2], FULL[2], e), lerp(s[3], FULL[3], e)], lerp(2.4, 0, e));
      el.style.fontSize = lerp(9, 0, e) + 'cqh'; // 아이콘은 사라짐
    } else {
      place(el, slot(i), 2.4);
      el.style.opacity = String(1 - e);
      el.style.transform = 'scale(' + (1 - e * 0.15) + ')';
    }
  });
  head.style.opacity = String(1 - e);
  game.style.opacity = String(Math.min(1, Math.max(0, (open - 0.6) / 0.4))); // 내용은 60% 뒤
}`,
    },
    pitfalls: [
      { title: '화면 전환 때 화면 전체를 새로 그리면 새로고침처럼 보인다', fix: '바뀌는 요소만 움직이고 갈아 끼운다 — 이 사이트에서 쪽 넘김 · 탭이 새로고침 같다고 지적받았다.', seen: true },
      { title: '다음 화면 내용을 처음부터 보이면 커지는 카드 위에 글자가 겹쳐 지저분하다', fix: '열림 60% 뒤부터 나타나게.' },
      { title: '누른 카드가 다른 카드 아래에 깔려 커진다', fix: '누른 카드의 z-index 를 다른 카드보다 높게 (견본은 첫 카드 2, 나머지 1).' },
    ],
    next: ['i430'],
    refs: [{ name: 'MDN — View Transition API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API' }],
  },

  /* ═══════════════ 카메라 ═══════════════ */

  u40: {
    id: 'u40',
    summary: '카메라는 그대로 두고 투영 중심만 setViewOffset 으로 옮겨서, 위 HUD · 아래 단추 · 오른쪽 패널에 가린 화면에서도 판이 남은 빈 자리 가운데에 온다.',
    terms: [
      { en: 'Off-axis projection (lens shift)', ko: '비대칭 투영 — 투영 중심 옮기기' },
      { en: 'PerspectiveCamera.setViewOffset', ko: 'three.js 투영 창 옮기기' },
      { en: 'Safe area / free rect', ko: 'HUD 를 뺀 빈 사각형' },
      { en: 'Lens shift', ko: '사진기 렌즈를 옆으로 미는 것과 같은 효과' },
    ],
    goal: '{target}이(가) HUD · 패널을 뺀 빈 자리 가운데에 오도록 투영 중심을 옮겨 줘 — 카메라 각도는 그대로. 분위기는 {style}.',
    targets: ['보드게임 판', '퍼즐 판 · 3D 무대', '가운데 캐릭터'],
    styles: ['밝은 나무 판', '귀엽고 아기자기', '깔끔한 게임 화면'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Physical Camera 를 켜고 Lens Shift 값을 바꾸거나, Camera.projectionMatrix 를 직접 비대칭으로 만든다.',
      godot: 'Godot 4 는 Camera3D 의 projection 을 PROJECTION_FRUSTUM 으로 두고 frustum_offset 을 옮긴다.',
    },
    principle: [
      '판을 화면 한가운데 두면 오른쪽 패널(30%) · 위 HUD(14%) · 아래 단추(16%)에 가린다.',
      '카메라를 옆으로 옮기거나 돌리면 판이 비스듬히 보여 구도가 바뀐다. 대신 투영 창만 옮기면 같은 각도 그대로 화면 위 자리만 이동한다.',
      '빈 사각형 가운데 (cx, cy) 를 구하고 setViewOffset(w, h, (w/2 − cx), (h/2 − cy), w, h) — 창을 그만큼 밀면 판 가운데가 (cx, cy) 에 그려진다.',
      '거리는 판 반폭 half 가 빈 자리(화면의 70%)에 들어가게: d = max(half / (tan(fov/2)·0.7), half / (tan(fov/2)·종횡비·0.7)).',
      '켬/끔은 옮기는 양에 m(0 → 1)을 곱해 부드럽게 (m += (목표 − m)·5dt).',
    ],
    when: ['오른쪽 정보 칸 · 위 HUD · 아래 단추가 있는 공통 틀 위 3D 판', '폰 가로 화면처럼 HUD 가 차지하는 몫이 클 때 — 판을 아래로 조금 내리기'],
    avoid: ['HUD 가 반투명하게 판 위에 떠 있어도 되는 화면 — 옮길 필요 없다', '카메라를 자주 크게 움직이는 연출 — 옮긴 투영과 섞이면 계산이 꼬인다. 연출 땐 clearViewOffset'],
    cost: 'light',
    costNote: '투영 행렬만 바뀐다. 비용 없음.',
    level: 2,
    must: [
      '카메라 자리 · 각도는 그대로, 투영 창만 setViewOffset 으로 옮긴다',
      '빈 사각형은 실제 HUD · 패널 크기에서 계산 (화면 크기가 바뀌면 다시)',
      '거리는 판이 빈 자리에 들어가게 화면 비율로 계산',
      '필요 없을 때(PC 넓은 화면 등)는 clearViewOffset()',
      '켬/끔 비교를 부드럽게',
    ],
    done: [
      '끔: 판이 화면 한가운데라 오른쪽 패널에 가린다 · 켬: 판이 점선(빈 자리) 가운데로 옮겨 가고 각도는 그대로다',
      '빈 자리 가운데 십자 표시와 판 가운데가 겹친다',
      '화면 비율을 바꿔도 판이 빈 자리 안에 들어간다',
      '폰 가로 화면(844×390)에서도 판이 단추에 안 가린다',
    ],
    code: {
      lang: 'ts',
      title: '빈 자리 가운데 맞추기 (매 렌더)',
      from: 'demos/demosStructure.ts u40 render() 를 정리',
      body: `let m = 0; // 0 끔 → 1 켬 (update 에서 m += ((on ? 1 : 0) - m) * Math.min(1, dt * 5))

function frame(r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, w: number, h: number): void {
  // 빈 자리: 위 HUD 14% · 아래 단추 16% · 오른쪽 패널 30% 를 뺀 곳
  const fx1 = w * 0.7, fy0 = h * 0.14, fy1 = h * 0.84;
  const cx = fx1 / 2, cy = (fy0 + fy1) / 2;
  // 판(반폭 1.85)이 빈 자리 70% 안에 들어가는 거리
  const tn = Math.tan((cam.fov * Math.PI) / 360);
  const half = 1.85;
  const d = Math.max(half / (tn * 0.7), half / (tn * (w / h) * 0.7));
  cam.aspect = w / h;
  cam.position.set(0, d * 0.8, d * 0.6);
  cam.lookAt(0, 0, 0);
  // 카메라는 그대로, 투영 창만 밀기 — 화면 가운데(w/2, h/2)가 (cx, cy) 로 간다
  cam.setViewOffset(w, h, (w / 2 - cx) * m, (h / 2 - cy) * m, w, h);
  r.render(scene, cam);
}
// 이 사이트 공통 도구 (shared/fillFraming.ts): 폰 가로 화면에서만 판을 아래로
//   camera.setViewOffset(w, h, 0, -shift * h, w, h);  아니면 camera.clearViewOffset();`,
    },
    pitfalls: [
      { title: '카메라를 옆으로 옮겨 맞추면 판이 비스듬해진다', fix: '자리 · 각도는 그대로 두고 투영 창(setViewOffset)만 옮긴다.' },
      { title: 'setViewOffset 을 한 번 걸고 잊으면 다른 화면에서도 판이 밀려 있다', fix: '필요 없는 화면 · 연출에선 clearViewOffset(). 이 사이트 phoneBoardFraming 은 PC 에서 늘 지운다.', seen: true },
      { title: '빈 자리를 고정 비율로만 잡으면 폰에서 단추에 가린다', fix: '폰 가로 화면은 HUD 몫이 커서 판을 따로 키우고 내린다(fillFraming 의 zoom · shift).', seen: true },
    ],
    prev: ['u41'],
    next: ['u43'],
    refs: [{ name: 'three.js 문서 — PerspectiveCamera.setViewOffset', url: 'https://threejs.org/docs/#api/en/cameras/PerspectiveCamera.setViewOffset' }],
  },

  u41: {
    id: 'u41',
    summary: '판 모서리 8점을 화면에 투영해 95% 틀 안에 드는지 보고 카메라 거리를 반씩 좁혀서(이분 탐색), 판 크기 · 화면 비율이 바뀌어도 판이 꽉 차게 맞춘다.',
    terms: [
      { en: 'Fit camera to bounds (binary search)', ko: '이분 탐색으로 맞는 카메라 거리 찾기' },
      { en: 'Vector3.project (NDC)', ko: '3D 점을 화면 좌표(−1 ~ 1)로 바꾸기' },
      { en: 'Bounding box corners', ko: '판을 감싸는 상자의 꼭짓점 8개' },
      { en: 'Bisection', ko: '범위를 반씩 줄이기' },
    ],
    goal: '{target}이(가) 화면에 꽉 차도록 카메라 거리를 이분 탐색으로 찾아 줘 — 모서리가 95% 틀 밖이면 멀리, 안이면 가까이, 화면 비율이 바뀌어도. 분위기는 {style}.',
    targets: ['크기가 바뀌는 퍼즐 판', '주차장 · 보드게임 판', '여러 크기의 3D 무대'],
    styles: ['밝은 하늘색 도면', '귀엽고 아기자기', '깔끔한 퍼즐 화면'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Camera.WorldToViewportPoint 로 모서리를 화면 비율(0~1)로 바꿔 같은 이분 탐색을 한다.',
      godot: 'Godot 은 Camera3D.unproject_position 으로 화면 픽셀 좌표를 얻어 같은 이분 탐색을 한다.',
    },
    principle: [
      '원근 카메라에서는 판 높이 · 기울기 때문에 「반폭 / tan」 한 줄 식이 잘 안 맞는다. 대신 직접 재 본다.',
      '판을 감싸는 상자 꼭짓점 8개(높이 0 과 0.6)를 project() 로 화면 좌표(−1 ~ 1)로 바꿔, 가장 큰 |x| · |y| 가 0.95 이하면 「들어간다」.',
      '거리 범위 lo = 1, hi = 40 에서 가운데 mid 로 시험: 들어가면 hi = mid(더 가까이), 아니면 lo = mid(더 멀리). 10번이면 범위가 39/1024 ≈ 0.04 로 좁아진다.',
      '마지막 hi 를 쓴다 — 늘 들어가는 쪽이라 판이 잘리지 않는다. 카메라 방향(0, 0.82, 0.57)은 그대로, 거리만 바뀐다.',
    ],
    when: ['판 크기(가로 6 × 세로 3, 3 × 4.5 …)가 단계마다 바뀔 때', '화면 비율(폰 가로 · 세로 · 태블릿)이 제각각일 때'],
    avoid: ['정사영 카메라 — 거리 대신 zoom 이나 left/right 를 한 줄 식으로 바로 계산한다', '판이 늘 같고 화면도 고정 — 한 번 정한 값이면 충분하다'],
    cost: 'light',
    costNote: '10번 × 꼭짓점 8개 투영 = 점 80개 계산. 화면 크기 · 판이 바뀔 때만 한다.',
    level: 2,
    must: [
      '판 꼭짓점은 높이까지(바닥 · 위) 8개 — 바닥 4점만 재면 차 지붕이 잘린다',
      '맞춤 판정은 화면 좌표 max(|x|, |y|) ≤ 0.95 (5% 여백)',
      '시험할 때마다 카메라 행렬 갱신(updateMatrixWorld · updateProjectionMatrix) 후 project()',
      '마지막에 hi(들어가는 쪽) 를 쓴다',
      '화면 크기 · 판이 바뀔 때만 다시 찾는다 (매 프레임 X)',
    ],
    done: [
      '판 크기가 바뀔 때마다 이분 탐색이 한 단계씩 보이며(「틀 안 → 더 가까이」 · 「틀 밖 → 더 멀리」) 카메라가 맞는 거리로 다가간다',
      '모서리 점이 틀 밖이면 빨강, 안이면 초록으로 보이고 마지막엔 모두 초록',
      '화면 비율을 바꿔도 판이 95% 틀 안에 꽉 찬다',
      '아래 띠에 남은 거리 범위가 반씩 줄어든다',
    ],
    code: {
      lang: 'ts',
      title: '모서리 투영 판정 + 이분 탐색',
      from: 'demos/demosStructure.ts u41 fits() · update() 를 정리',
      body: `const dir = new THREE.Vector3(0, 0.82, 0.57).normalize(); // 카메라 방향은 고정
const corners: THREE.Vector3[] = [];
function setBoard(W: number, D: number): void {
  corners.length = 0;
  for (const sx of [-1, 1]) for (const sy of [0, 0.6]) for (const sz of [-1, 1])
    corners.push(new THREE.Vector3((sx * W) / 2, sy, (sz * D) / 2)); // 높이까지 8점
}

const p = new THREE.Vector3();
function fits(cam: THREE.PerspectiveCamera, d: number, aspect: number): boolean {
  cam.position.copy(dir).multiplyScalar(d);
  cam.lookAt(0, 0, 0);
  cam.aspect = aspect;
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  let mx = 0;
  for (const c of corners) {
    p.copy(c).project(cam); // 화면 좌표 −1 ~ 1
    mx = Math.max(mx, Math.abs(p.x), Math.abs(p.y));
  }
  return mx <= 0.95;        // 5% 여백
}

function fitDistance(cam: THREE.PerspectiveCamera, aspect: number): number {
  let lo = 1, hi = 40;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (fits(cam, mid, aspect)) hi = mid; // 들어감 → 더 가까이
    else lo = mid;                        // 밖 → 더 멀리
  }
  return hi;                              // 늘 들어가는 쪽
}`,
    },
    pitfalls: [
      { title: '카메라 행렬을 갱신하지 않고 project() 하면 이전 자리로 잰다', fix: '자리를 바꿀 때마다 updateMatrixWorld() 와 updateProjectionMatrix() 뒤에 투영한다.' },
      { title: '바닥 네 점만 재면 위로 솟은 물체가 잘린다', fix: '판 위 물체 높이(견본 0.6)까지 8점을 잰다.' },
      { title: '마지막에 mid 를 쓰면 가끔 판이 살짝 잘린다', fix: 'hi 는 늘 「들어간」 거리라 hi 를 쓴다.' },
    ],
    next: ['u40'],
  },

  u43: {
    id: 'u43',
    summary: '렌더러 한 대로 화면을 칸으로 나눠 setViewport · setScissor 로 칸마다 다른 카메라를 그려서, 한 3D 물체를 원근 큰 화면 + 정면 · 옆 · 위 정사영 작은 창으로 나란히 보여 준다.',
    terms: [
      { en: 'Multiple viewports (scissor test)', ko: '한 화면을 칸으로 나눠 여러 카메라 그리기' },
      { en: 'OrthographicCamera', ko: '정사영 카메라 — 멀어도 크기가 같은 설계도 시점' },
      { en: 'Orthographic projection views (front · side · top)', ko: '정면 · 옆 · 위에서 본 모양 (투영도)' },
      { en: 'setViewport / setScissor', ko: '그릴 칸 정하기 · 그 밖은 안 지우기' },
    ],
    goal: '{target}을(를) 큰 원근 화면 하나와 정면 · 옆 · 위 정사영 작은 창 셋으로 동시에 보여 줘 — 렌더러 하나로 칸을 나눠서. 분위기는 {style}.',
    targets: ['쌓기나무', '입체도형', '미니맵이 있는 게임 판'],
    styles: ['밝은 모눈 설계도', '귀엽고 아기자기', '깔끔한 교과서 그림'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 카메라를 여러 대 두고 Camera.rect(뷰포트 사각형)로 칸을 나누고 Projection 을 Orthographic 으로.',
      godot: 'Godot 은 SubViewportContainer + SubViewport 마다 Camera3D(projection = PROJECTION_ORTHOGONAL)를 둔다.',
    },
    principle: [
      '렌더러 하나에 setScissorTest(true) 를 켜고, 칸마다 setViewport · setScissor 로 그릴 사각형을 정한 뒤 그 칸의 카메라로 render 한다.',
      '큰 화면(넓으면 왼쪽 70%, 좁으면 위 70%)은 원근 카메라로 천천히 돌며 본다.',
      '작은 창 셋은 OrthographicCamera(−2.3 ~ 2.3): 정면 (0, 1, 10) · 옆 (10, 1, 0) · 위 (0, 10, 0) 에서 가운데를 본다. 위 카메라는 up 을 (0, 0, −1) 로 바꿔 앞이 아래로 오게.',
      '정사영이라 멀고 가까운 것이 같은 크기 — 쌓기나무 투영도가 그대로 나온다. 창마다 6% 여백 · 테두리 · 이름표.',
      '뷰포트 좌표는 왼쪽 아래가 (0, 0) 이다 (HTML 은 왼쪽 위). 다 그린 뒤 setScissorTest(false) · setViewport(0, 0, w, h) 로 되돌린다.',
    ],
    when: ['쌓기나무 · 입체도형의 정면 · 옆 · 위 모양을 보여 줄 때', '미니맵 · 뒤에서 본 모습 같은 작은 보조 화면'],
    avoid: ['보조 화면이 많아질 때(4개 넘게) — 칸마다 장면을 한 번씩 다시 그린다. 미니맵은 2D 로 그리는 편이 싸다', '창마다 다른 장면이면 — 장면을 따로 두거나 레이어(camera.layers)로 나눈다'],
    cost: 'medium',
    costNote: '칸 수만큼 장면을 다시 그린다 (견본 4번). 물체가 적은 쌓기나무는 가볍지만 무거운 장면이면 작은 창 해상도 · 수를 줄인다.',
    level: 2,
    must: [
      '렌더러 하나로 setScissorTest(true) + 칸마다 setViewport · setScissor 둘 다',
      '정면 · 옆 · 위는 OrthographicCamera, 위 카메라는 up 을 바꿔 방향을 고정',
      '넓은 화면 / 좁은 화면(세로 폰)에서 칸 배치를 바꾼다',
      '뷰포트 y 는 아래에서부터 — HTML 좌표와 섞지 않기',
      '다 그린 뒤 scissor 끄고 뷰포트를 화면 전체로 되돌린다',
    ],
    done: [
      '큰 화면에서 쌓기나무가 천천히 돌고, 오른쪽 작은 창 셋에 정면 · 옆 · 위 모양이 보인다',
      '4초마다 쌓기나무가 바뀌면 세 창의 모양도 바로 바뀐다',
      '세로 폰에서는 큰 화면이 위, 작은 창 셋이 아래 한 줄로 바뀐다',
      '작은 창에서 멀고 가까운 블록이 같은 크기로 보인다 (정사영)',
    ],
    code: {
      lang: 'ts',
      title: '큰 원근 화면 + 정사영 작은 창 셋 (렌더러 하나)',
      from: 'demos/demosStructure.ts u43 make() · render() 를 정리',
      body: `const S = 2.3;
const ortho = [0, 1, 2].map(() => new THREE.OrthographicCamera(-S, S, S, -S, 0.1, 50));
ortho[0].position.set(0, 1, 10);   // 정면
ortho[1].position.set(10, 1, 0);   // 옆
ortho[2].position.set(0, 10, 0);   // 위
ortho[2].up.set(0, 0, -1);         // 위에서 볼 때 앞이 아래로
ortho.forEach((c) => c.lookAt(0, 1, 0));
ortho[2].lookAt(0, 0, 0);

function render(r: THREE.WebGLRenderer, w: number, h: number): void {
  const wide = w >= h;
  const mw = wide ? w * 0.7 : w, mh = wide ? h : h * 0.7;
  main.aspect = mw / mh;
  main.updateProjectionMatrix();
  r.setScissorTest(true);
  r.setViewport(0, wide ? 0 : h - mh, mw, mh);   // y 는 아래에서부터
  r.setScissor(0, wide ? 0 : h - mh, mw, mh);
  r.render(scene, main);
  for (let i = 0; i < 3; i++) {
    const size = wide ? Math.min(w - mw, h / 3) : Math.min(h - mh, w / 3);
    const x = wide ? mw + (w - mw - size) / 2 : (w / 3) * i + (w / 3 - size) / 2;
    const y = wide ? h - (i + 1) * (h / 3) + (h / 3 - size) / 2 : (h - mh - size) / 2;
    const pad = size * 0.06;
    r.setViewport(x + pad, y + pad, size - pad * 2, size - pad * 2);
    r.setScissor(x + pad, y + pad, size - pad * 2, size - pad * 2);
    r.render(scene, ortho[i]);
  }
  r.setScissorTest(false);
  r.setViewport(0, 0, w, h);                     // 되돌리기
}`,
    },
    pitfalls: [
      { title: 'setViewport 만 하고 scissor 를 안 켜면 칸마다 화면 전체가 지워진다', fix: 'setScissorTest(true) + 같은 사각형으로 setScissor — 지우기도 그 칸에만.' },
      { title: '뷰포트 y 를 HTML 처럼 위에서부터 잡으면 칸이 뒤집혀 놓인다', fix: 'WebGL 뷰포트는 왼쪽 아래가 (0, 0). 테두리를 HTML/캔버스로 그릴 땐 top = h − y − size 로 바꾼다.' },
      { title: '위에서 보는 정사영 카메라가 화면마다 돌아가 보인다', fix: 'lookAt 전에 up 을 (0, 0, −1) 로 정해 방향을 고정한다.' },
    ],
    prev: ['u41'],
    next: ['u40'],
    refs: [{ name: 'three.js 예제 — webgl_multiple_views', url: 'https://threejs.org/examples/#webgl_multiple_views' }],
  },

  i426: {
    id: 'i426',
    summary: '카메라와 바라보는 곳을 SmoothDamp 스프링으로 따라가게 하고 목표를 가는 쪽으로 조금 앞질러 두어서, 흔들림 없이 따라가며 앞길을 더 보여 준다.',
    terms: [
      { en: 'Smooth follow camera (SmoothDamp)', ko: '스프링으로 부드럽게 따라가는 카메라' },
      { en: 'Look-ahead (camera lead)', ko: '앞질러 보기 — 가는 쪽을 더 보여 주기' },
      { en: 'Critically damped spring', ko: '넘치지 않고 가장 빨리 붙는 용수철' },
      { en: 'Velocity smoothing', ko: '속도를 걸러 덜컹거림 없애기' },
    ],
    goal: '{target}을(를) 따라가는 카메라를 만들어 줘 — 스프링으로 부드럽게, 가는 쪽을 조금 앞질러 보여 주고, 폴짝 뛰어도 화면이 같이 흔들리지 않게. 분위기는 {style}.',
    targets: ['길을 걷는 병아리', '굴러가는 공', '판 위를 움직이는 말'],
    styles: ['맑은 마을', '귀엽고 아기자기', '빠른 추격전'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Vector3.SmoothDamp 가 같은 식이고, Cinemachine 의 Follow · Damping · Lookahead 가 같은 기능이다.',
      godot: 'Godot 에는 SmoothDamp 함수가 없어 같은 식을 직접 쓰거나, 2D 는 Camera2D 의 position_smoothing 을 켠다.',
    },
    principle: [
      '딱 붙여 따라가면 폴짝 · 멈춤마다 화면이 덜컹거린다.',
      'SmoothDamp: 지금 값 · 목표 · 속도를 들고 「smoothTime 초쯤 걸려 넘치지 않게」 붙게 하는 식. ω = 2 / smoothTime, 감쇠 = 1 / (1 + x + 0.48x² + 0.235x³), x = ω·dt.',
      '목표 = 자리 + 걸러 낸 속도 × 0.75 (앞질러 보기). 속도는 1 − e^(−6dt) 로 걸러 폴짝 높이 변화가 섞이지 않게.',
      '바라보는 곳은 smoothTime 0.35, 카메라 자리는 그 1.25배(0.44)로 조금 더 늦게 — 고정 거리 (0, 6.8, 7.4) 뒤에서 따라간다.',
      '처음 한 번은 스프링 없이 목표에 바로 놓는다 (시작부터 날아오지 않게).',
    ],
    when: ['캐릭터 · 공이 넓은 판을 돌아다닐 때', '갑자기 멈췄다 출발하는 움직임이 있을 때'],
    avoid: ['판 전체가 늘 보여야 하는 퍼즐 — 고정 카메라(u41)가 맞다', '아주 빠른 경주 — 앞질러 보기 배율을 속도에 맞춰 키우지 않으면 화면 밖으로 나간다'],
    cost: 'light',
    costNote: '벡터 계산 몇 줄. 비용 없음.',
    level: 2,
    must: [
      '카메라 자리 · 바라보는 곳 둘 다 SmoothDamp(속도 상태를 따로 들고)로',
      '앞질러 보기 = 걸러 낸 속도 × 배율(0.75) 를 목표에 더하기',
      '폴짝 높이는 목표에 넣지 않는다 (바닥 자리만 따라가기)',
      'dt 는 0.05초로 자르고, 처음 한 번은 바로 놓기',
      '앞질러 보기 켬/끔 · 부드러움(0.05 ~ 1초) · 「딱 붙기」 비교',
    ],
    done: [
      '병아리가 길을 따라 걷다 멈췄다 출발해도 화면이 부드럽게 따라가고 덜컹거리지 않는다',
      '앞질러 보기를 켜면 가는 쪽이 더 보인다 (작은 지도에서 분홍 점이 병아리보다 앞)',
      '「딱 붙기」 비교에서는 폴짝마다 화면이 흔들린다',
      '「부드러움」을 키우면 더 느긋하게 따라온다',
    ],
    code: {
      lang: 'ts',
      title: 'SmoothDamp + 앞질러 보기',
      from: 'demos/demosCamLight.ts smoothDamp() · demoFollow() 를 정리',
      body: `// Unity Vector3.SmoothDamp 와 같은 식 — 넘치지 않고 smoothTime 쯤에 붙는다
function smoothDamp(cur: THREE.Vector3, target: THREE.Vector3, vel: THREE.Vector3, smoothTime: number, dt: number): void {
  const om = 2 / Math.max(0.0001, smoothTime);
  const x = om * dt;
  const ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const cx = cur.x - target.x, cy = cur.y - target.y, cz = cur.z - target.z;
  const tx = (vel.x + om * cx) * dt, ty = (vel.y + om * cy) * dt, tz = (vel.z + om * cz) * dt;
  vel.set((vel.x - om * tx) * ex, (vel.y - om * ty) * ex, (vel.z - om * tz) * ex);
  cur.set(target.x + (cx + tx) * ex, target.y + (cy + ty) * ex, target.z + (cz + tz) * ex);
}

const OFF = new THREE.Vector3(0, 6.8, 7.4);
const vel = new THREE.Vector3(), prev = new THREE.Vector3(), tmp = new THREE.Vector3();
const look = new THREE.Vector3(), lookV = new THREE.Vector3(), camP = new THREE.Vector3(), camV = new THREE.Vector3(), goal = new THREE.Vector3();
let first = true, lead = true, smooth = 0.35;

function follow(cam: THREE.PerspectiveCamera, pos: THREE.Vector3, dt0: number): void { // pos = 바닥 자리 (폴짝 높이 뺌)
  const dt = Math.min(dt0, 0.05);
  if (dt > 0) {
    tmp.copy(pos).sub(prev).divideScalar(dt);
    if (tmp.length() < 20) vel.lerp(tmp, 1 - Math.exp(-dt * 6)); // 속도 거르기
  }
  prev.copy(pos);
  goal.copy(pos);
  if (lead) goal.addScaledVector(vel, 0.75);                      // 앞질러 보기
  if (first) { look.copy(goal); camP.copy(goal).add(OFF); first = false; }
  smoothDamp(look, goal, lookV, smooth, dt);
  smoothDamp(camP, tmp.copy(goal).add(OFF), camV, smooth * 1.25, dt);
  cam.position.copy(camP);
  cam.lookAt(look);
}`,
    },
    pitfalls: [
      { title: 'lerp(목표, 0.1) 로 따라가면 프레임 빠르기에 따라 속도가 달라진다', fix: 'dt 를 쓰는 SmoothDamp(또는 1 − e^(−k·dt))로. 고정 0.1 은 30fps 에서 두 배 느리다.' },
      { title: '폴짝 높이까지 따라가면 화면이 위아래로 출렁인다', fix: '목표에는 바닥 자리만 넣는다.' },
      { title: '앞질러 보기에 날 속도를 쓰면 방향이 바뀔 때 화면이 휙 돈다', fix: '속도를 1 − e^(−6dt) 로 걸러 쓰고, 순간 이동(20 넘음)은 버린다.' },
    ],
    next: ['i430', 'i429'],
    refs: [{ name: 'Unity 문서 — Vector3.SmoothDamp', url: 'https://docs.unity3d.com/ScriptReference/Vector3.SmoothDamp.html' }],
  },

  i428: {
    id: 'i428',
    summary: '결정적 수가 닿는 순간 게임 시간을 0.14배로 늦추고 카메라를 그 자리로 다가가며 시야를 좁혀서, 체크메이트 · 정답 순간을 영화처럼 짧게 강조했다 돌아온다.',
    terms: [
      { en: 'Dramatic zoom (slow-motion punch-in)', ko: '극적인 확대 — 결정적 순간 느리게 + 다가가기' },
      { en: 'Time scale (game time vs real time)', ko: '게임 시간 배율 — 연출 시계는 실제 시간' },
      { en: 'FOV narrowing', ko: '시야각 좁히기로 확대감' },
      { en: 'Exponential smoothing in/out', ko: '들어갈 땐 빠르게, 나올 땐 천천히' },
    ],
    goal: '{target}에서 결정적 순간에 시간을 느리게 하고 카메라가 그 자리로 다가갔다가 돌아오게 해 줘. 분위기는 {style}.',
    targets: ['체크메이트 한 수', '홈런 · 정답 순간', '마지막 블록이 맞춰지는 순간'],
    styles: ['밤 보랏빛 판', '귀엽고 아기자기', '긴장감 있는 대결'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Time.timeScale 을 낮추고(연출 카메라는 Time.unscaledDeltaTime 로) 카메라 위치 · Field of View 를 옮긴다.',
      godot: 'Godot 은 Engine.time_scale 을 낮추고, 카메라 Tween 은 set_ignore_time_scale(true) 로 실제 시간에 돈다.',
    },
    principle: [
      '시계를 둘로 나눈다: 게임 시계 gt += dt × ts (말 · 별 입자), 연출 시계는 실제 시간. 그래야 느려져도 카메라 연출은 제 빠르기다.',
      '말이 닿기 직전(게임 시간 1.88초)부터 실제 1.7초 동안 ts 목표 0.14. ts 는 들어갈 때 1 − e^(−18dt) 로 확, 나올 때 1 − e^(−5dt) 로 천천히.',
      '확대 z 도 같은 때 목표 1 (들어갈 때 7, 나올 때 2.6 의 빠르기). 카메라 = lerp(넓은 자리, 착지점 + (2.2, 1.5, 2.6), ease(z) × 세기 0.85), 시야각 40° → 30°.',
      '착지 순간 말이 납작해지고 왕이 튕겨 날아가며 별 90개 · 고리가 터진다. 화면 위에 「결정적 한 수!」 딱지.',
    ],
    when: ['게임이 끝나는 한 수 · 정답처럼 한 판에 한 번 있는 순간', '무엇이 일어났는지 아이가 놓치기 쉬울 만큼 빠른 순간'],
    avoid: ['자주 일어나는 일 — 매번 느려지면 답답하다. 한 판에 한두 번만', '빠른 반응이 중요한 연속 입력 — 연출 중 입력을 막지 말거나 아주 짧게 (생각하는 척 0.4 ~ 0.7초 기준)'],
    cost: 'light',
    costNote: '카메라 · 시간 배율 계산뿐. 비용 없음.',
    level: 2,
    must: [
      '게임 시계(배율 적용)와 연출 시계(실제 시간)를 나눈다',
      '느려지기 · 확대는 들어갈 때 빠르게, 나올 때 천천히 (지수 smoothing 빠르기를 다르게)',
      '확대 세기 · 느린 화면 켬/끔 · 확대 켬/끔 조절',
      '연출은 2초 안에 원래 구도로 돌아온다',
      '시야각을 바꾸면 updateProjectionMatrix()',
    ],
    done: [
      '말이 왕 자리로 폴짝 뛰어 닿는 순간 화면이 느려지고(「느린 화면 ×0.14」) 카메라가 그 칸으로 다가간다',
      '왕이 튕겨 날아가고 별이 터지는 장면이 느리게 보인 뒤, 카메라가 넓은 구도로 천천히 돌아온다',
      '「느린 화면」을 끄면 확대만, 「확대」를 끄면 느려지기만 된다',
      '폰에서도 끊김 없이',
    ],
    code: {
      lang: 'ts',
      title: '게임 시계 · 느린 화면 · 확대 카메라 (t = 실제 시간, c = 이번 주기 안 시간)',
      from: 'demos/demosCamLight.ts demoDramatic() update() 를 정리',
      body: `const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
let gt = 0, ts = 1, z = 0, slowAt = -1;
const st = { zoom: true, slow: true, power: 0.85 };

function update(c: number, t: number, dt0: number, land: THREE.Vector3, cam: THREE.PerspectiveCamera): void {
  const dt = Math.min(dt0, 0.05);
  if (st.slow && slowAt < 0 && gt > 1.88) slowAt = c;            // 닿기 직전부터
  const realSince = slowAt >= 0 ? c - slowAt : 0;
  const slowing = slowAt >= 0 && realSince < 1.7;                // 실제 시간 1.7초
  const tsWant = slowing ? 0.14 : 1;
  ts += (tsWant - ts) * (1 - Math.exp(-dt * (slowing ? 18 : 5))); // 들어갈 땐 확, 나올 땐 천천히
  gt += dt * ts;                                                  // 게임 시계만 느려짐 — 말 · 별은 gt 로
  const zWant = st.zoom && slowing ? 1 : 0;
  z += (zWant - z) * (1 - Math.exp(-dt * (zWant ? 7 : 2.6)));
  // 카메라: 넓게 천천히 돌다가 → 결정적 순간 착지점으로
  const yaw = 0.5 + Math.sin(t * 0.25) * 0.35;
  const wide = new THREE.Vector3(Math.sin(yaw) * 11.5, 9.4, Math.cos(yaw) * 11.5);
  const close = new THREE.Vector3(land.x + 2.2, land.y + 1.5, land.z + 2.6);
  const zz = ease(z) * st.power;
  cam.position.lerpVectors(wide, close, zz);
  cam.fov = 40 + (30 - 40) * zz;
  cam.updateProjectionMatrix();
  cam.lookAt(new THREE.Vector3(0, 0, 0).lerp(land.clone().setY(0.55), zz));
}`,
    },
    pitfalls: [
      { title: '카메라 연출까지 게임 시간으로 돌리면 느려질 때 카메라도 멈춘다', fix: '느려지는 건 게임 시계(gt)만, 카메라는 실제 dt 로.' },
      { title: '느려지기를 확 풀면 툭 끊긴다', fix: '들어갈 땐 빠르게(18), 나올 땐 천천히(5) 지수 smoothing.' },
      { title: '연출이 길면 아이가 기다리다 지친다', fix: '느린 구간 1.7초 · 전체 2초 안. 이 사이트는 「생각하는 척 0.4 ~ 0.7초까지」를 빠른 반응 기준으로 삼는다.', seen: true },
    ],
    prev: ['i426'],
    next: ['i204', 'i429'],
  },

  i429: {
    id: 'i429',
    summary: '충격마다 trauma 값을 올리고 빠르게 줄이며 trauma² 만큼 부드러운 잡음으로 카메라를 옆 · 위 · 기울기로 흔들어서, 덜컹거리지 않고 묵직하게 흔들렸다 잦아든다.',
    terms: [
      { en: 'Trauma-based camera shake', ko: '충격 값(trauma) 기반 카메라 흔들림' },
      { en: 'Value noise (1D, smooth)', ko: '부드러운 1차원 잡음' },
      { en: 'Shake decay', ko: '흔들림이 빠르게 잦아들기' },
      { en: 'Camera local offset (right · up · roll)', ko: '카메라 자기 축으로 밀기 · 기울이기' },
    ],
    goal: '{target}에 잡음 기반 카메라 흔들림을 넣어 줘 — 충격마다 세기가 쌓였다 빠르게 잦아들고, 무작위 대신 부드러운 잡음으로 · 세기 · 주파수 조절. 분위기는 {style}.',
    targets: ['떨어지는 상자 · 쾅 착지', '폭발 · 충돌', '실패 · 틀림 순간'],
    styles: ['맑은 마을', '귀엽고 아기자기', '묵직한 액션'],
    platforms: ['three', 'unity', 'godot', 'canvas'],
    platformHints: {
      unity: 'Unity 는 Cinemachine Impulse(Impulse Source · Listener) 가 같은 기능이고, 직접 하려면 Mathf.PerlinNoise 로 같은 식을 쓴다.',
      godot: 'Godot 은 FastNoiseLite.get_noise_1d 로 같은 식을 쓰고 Camera3D(또는 Camera2D offset) 에 더한다.',
    },
    principle: [
      'trauma(0 ~ 1)를 둔다: 충격이 오면 trauma += 세기(최대 1), 매 프레임 trauma −= dt × 1.5 로 빠르게 준다.',
      '실제 흔들림 = trauma². 제곱이라 큰 충격은 크게, 작은 것은 거의 안 흔들리고, 끝이 부드럽게 사라진다.',
      '흔들 방향은 Math.random() 이 아니라 시간 × 주파수(14)로 읽는 부드러운 잡음 두 겹(0.8 + 2.1배 빠른 0.2). 그래서 덜컹 대신 출렁.',
      '매 프레임 카메라를 기본 자리로 되돌린 뒤, 카메라 자기 오른쪽 · 위 축으로 n × s × 0.55 만큼 밀고 rotateZ(n × s × 0.07) 로 살짝 기울인다.',
    ],
    when: ['착지 · 충돌 · 폭발처럼 무게가 있는 순간', '여러 충격이 이어질 때 — trauma 가 쌓여 자연스럽게 커진다'],
    avoid: ['글씨를 읽어야 하는 순간 · 판을 정확히 눌러야 할 때 — 흔들림이 방해된다', '어지러움에 민감한 사용자 — 세기를 0 으로 둘 수 있게'],
    cost: 'light',
    costNote: '잡음 계산 몇 번. 비용 없음.',
    level: 1,
    must: [
      '흔들림 = trauma² — 그대로 쓰지 않는다',
      '방향은 부드러운 잡음(시간 × 주파수)으로 — 매 프레임 Math.random() 금지 (비교용으로만)',
      '매 프레임 기본 자리에서 다시 시작해 흔들림을 더한다 (흔들림이 쌓여 카메라가 떠내려가지 않게)',
      '카메라 자기 축(오른쪽 · 위 · 기울기)으로 흔든다',
      '세기 · 주파수(3 ~ 30) · 잡음/무작위 조절',
    ],
    done: [
      '상자가 떨어져 닿는 순간 화면이 묵직하게 출렁였다 1초 안에 잦아든다',
      '위 막대의 세기가 확 올랐다가 빠르게 줄어든다',
      '「부드러운 잡음」을 끄면 매 장면 덜컹거리는 무작위 흔들림과 비교된다',
      '흔들림이 끝나면 카메라가 정확히 원래 자리에 있다',
    ],
    code: {
      lang: 'ts',
      title: 'trauma + 부드러운 잡음 흔들림',
      from: 'demos/demosCamLight.ts vnoise() · demoShake() update() 를 정리',
      body: `const hash1 = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, seed: number): number { // 부드러운 1차원 잡음 (−1 ~ 1)
  const i = Math.floor(x), f = x - i;
  const a = hash1(i + seed * 157.3), b = hash1(i + 1 + seed * 157.3);
  const u = f * f * (3 - 2 * f);
  return (a + (b - a) * u) * 2 - 1;
}

const st = { power: 1, freq: 14, decay: 1.5 };
let trauma = 0;
const right = new THREE.Vector3(), up = new THREE.Vector3();

function hit(): void { trauma = Math.min(1, trauma + st.power); } // 충격마다 쌓기

function shake(cam: THREE.PerspectiveCamera, base: THREE.Vector3, lookAt: THREE.Vector3, t: number, dt: number): void {
  trauma = Math.max(0, trauma - dt * st.decay);
  cam.position.copy(base);        // 매 프레임 기본 자리부터
  cam.lookAt(lookAt);
  const s = trauma * trauma;      // 제곱 — 큰 충격만 크게
  const f = t * st.freq;
  const nx = vnoise(f, 1) * 0.8 + vnoise(f * 2.1, 4) * 0.2;
  const ny = vnoise(f, 2) * 0.8 + vnoise(f * 2.1, 5) * 0.2;
  const nr = vnoise(f, 3);
  cam.updateMatrixWorld();
  right.setFromMatrixColumn(cam.matrixWorld, 0);
  up.setFromMatrixColumn(cam.matrixWorld, 1);
  cam.position.addScaledVector(right, nx * s * 0.55).addScaledVector(up, ny * s * 0.55);
  cam.rotateZ(nr * s * 0.07);     // 살짝 기울기
}`,
    },
    pitfalls: [
      { title: '매 프레임 Math.random() 으로 흔들면 덜컹거리고 싸 보인다', fix: '시간 × 주파수로 읽는 부드러운 잡음을 쓴다. 주파수로 빠르기를 조절.' },
      { title: '흔들림을 카메라 자리에 계속 더하면 카메라가 떠내려간다', fix: '매 프레임 기본 자리 · 방향에서 다시 시작해 흔들림을 더한다.' },
      { title: 'trauma 를 그대로 쓰면 작은 충격도 크게 흔들린다', fix: '제곱(trauma²)을 쓰면 작은 건 거의 안 흔들리고 끝이 부드럽다.' },
    ],
    next: ['i199', 'i428'],
  },

  i430: {
    id: 'i430',
    summary: '장소마다 바라볼 곳 · 거리 · 방위 · 높이를 정해 두고 그 값들을 구면 좌표로 보간하며 가운데에서 위로 부풀려서, 장면 사이를 원호로 날아가며 바라보는 곳도 함께 옮긴다.',
    terms: [
      { en: 'Orbit camera transition (spherical interpolation)', ko: '궤도 이동 — 구면 좌표로 카메라 옮기기' },
      { en: 'Spherical coordinates (radius · yaw · elevation)', ko: '거리 · 방위각 · 올려본 각' },
      { en: 'Shortest-angle wrap', ko: '각도를 짧은 쪽으로 돌기' },
      { en: 'Arc bump (sin π e)', ko: '가운데에서 높이 · 거리를 부풀려 둥근 길' },
    ],
    goal: '{target} 사이를 오갈 때 카메라가 순간 이동 대신 원호로 날아가며 바라보는 곳도 함께 옮기게 해 줘. 분위기는 {style}.',
    targets: ['마을 전체 → 집 → 연못 같은 장소', '메뉴 → 게임 판', '단원 · 일차 이동'],
    styles: ['맑은 마을 하늘', '귀엽고 아기자기', '영화 같은 카메라'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Cinemachine 가상 카메라 여러 대와 Blend(Custom Blends) 로 장소를 오가거나, 같은 구면 좌표 식을 코루틴으로 쓴다.',
      godot: 'Godot 은 Tween 으로 0 → 1 값을 돌리며 같은 구면 좌표 식으로 Camera3D 자리를 정한다.',
    },
    principle: [
      '장소 하나 = 바라볼 곳(target) · 거리 r · 방위 yaw · 높이각 el. 카메라 자리 = target + (sin yaw·cos el, sin el, cos yaw·cos el) × r.',
      '이동 중에는 바라볼 곳을 lerp 하고, r · yaw · el 을 따로 보간한다. 자리를 직선으로 lerp 하면 카메라가 물체를 뚫거나 바라보는 방향이 휙 돈다.',
      'yaw 차이는 ((차 + π) mod 2π) − π 로 짧은 쪽으로 돈다.',
      '가운데에서 bump = sin(π·e) 만큼 높이각 +0.32 · 거리 +5 를 더해, 위로 떠올랐다 내려앉는 둥근 길이 된다. e 는 smoothstep, 이동 1.7초.',
    ],
    when: ['장소 · 장면이 바뀔 때 어디서 어디로 갔는지 보여 줄 때', '메뉴에서 판으로 들어가는 첫 장면'],
    avoid: ['자주 오가는 화면 — 1.7초 날기가 답답하다. 짧게(0.6초) 하거나 순간 이동', '멀미가 나기 쉬운 크게 도는 길 — bump 를 줄인다'],
    cost: 'light',
    costNote: '삼각 함수 몇 번. 비용 없음.',
    level: 2,
    must: [
      '장소는 바라볼 곳 · 거리 · 방위 · 높이각 값으로 정의',
      '자리를 직선 lerp 하지 않고 구면 값(r · yaw · el)을 보간, 바라볼 곳도 함께 lerp',
      'yaw 는 짧은 쪽으로 돌기',
      '가운데 부풀림(sin π e)으로 둥근 길',
      '순간 · 직선 · 궤도 비교와 빠르기 조절',
    ],
    done: [
      '마을 전체 → 집 → 연못 → 다른 집으로 카메라가 위로 떠올랐다 내려앉으며 날아간다',
      '날아가는 동안 바라보는 곳이 부드럽게 옮겨 가 화면이 휙 돌지 않는다',
      '작은 지도에서 흰 원호(궤도)와 빨간 직선이 비교된다',
      '「순간 이동」 · 「직선 이동」으로 바꾸면 차이가 바로 보인다',
    ],
    code: {
      lang: 'ts',
      title: '구면 좌표 보간 + 가운데 부풀림',
      from: 'demos/demosCamLight.ts demoOrbit() camAt() 을 정리',
      body: `interface Station { name: string; target: THREE.Vector3; r: number; yaw: number; el: number }
const TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

// k = 0 → 1 (이동 1.7초). out = 카메라 자리, look = 바라볼 곳
function camAt(a: Station, b: Station, k: number, out: THREE.Vector3, look: THREE.Vector3): void {
  const e = ease(k);
  look.lerpVectors(a.target, b.target, e);
  let dy = b.yaw - a.yaw;
  dy = (((dy + Math.PI) % TAU) + TAU) % TAU - Math.PI;   // 짧은 쪽으로
  const yaw = a.yaw + dy * e;
  const bump = Math.sin(Math.PI * e);                    // 가운데에서 부풀림
  const el = lerp(a.el, b.el, e) + bump * 0.32;
  const r = lerp(a.r, b.r, e) + bump * 5;
  out.set(
    look.x + Math.sin(yaw) * Math.cos(el) * r,
    look.y + Math.sin(el) * r,
    look.z + Math.cos(yaw) * Math.cos(el) * r,
  );
}
// 매 프레임: camAt(a, b, k, cam.position, tg); cam.lookAt(tg);
// 장소 예: { name: '마을 전체', target: new THREE.Vector3(0, 0, 0), r: 17, yaw: 0.5, el: 0.72 }`,
    },
    pitfalls: [
      { title: '카메라 자리를 직선으로 lerp 하면 가운데에서 물체를 뚫는다', fix: '구면 값(r · yaw · el)을 보간하고 가운데에서 거리 · 높이를 부풀린다.' },
      { title: '방위각을 그냥 lerp 하면 반대쪽으로 거의 한 바퀴를 돈다', fix: '차이를 −π ~ π 로 접어 짧은 쪽으로 돈다.' },
      { title: '바라볼 곳을 끝에서만 바꾸면 화면이 휙 돈다', fix: '바라볼 곳도 같은 e 로 lerp 한다.' },
    ],
    prev: ['i426'],
    next: ['i428'],
  },

  /* ═══════════════ 화려한 효과 (VFX) ═══════════════ */

  i56: {
    id: 'i56',
    summary: '메시 없이 화면 사각형 하나의 셰이더에서 거리 함수로 장면을 정의하고 광선을 한 걸음씩 진행시켜서, 매끈한 도형과 녹아 붙는 합 · 교 · 차를 그린다.',
    terms: [
      { en: 'SDF raymarching (sphere tracing)', ko: '거리 함수 레이마칭 — 남은 거리만큼 성큼성큼' },
      { en: 'Signed distance function', ko: '점에서 도형 겉면까지 거리 (안쪽은 음수)' },
      { en: 'Smooth minimum (smin)', ko: '두 모양을 녹아 붙게 합치기' },
      { en: 'CSG union · intersection · subtraction', ko: '합 min · 교 max · 차 max(a, −b)' },
    ],
    goal: '{target}을(를) SDF 레이마칭으로 그려 줘 — 공과 둥근 상자를 합 · 부드러운 합 · 교 · 차로 바꿔 가며, 그림자 · 구석 그늘까지. 분위기는 {style}.',
    targets: ['집합 연산(합 · 교 · 차) 체험', '녹아 붙는 말랑한 모양', '수학 곡면 보기'],
    styles: ['밝은 파스텔 바둑판 바닥', '귀엽고 아기자기', '매끈한 금속 조형'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 화면을 덮는 Quad(또는 URP Full Screen Pass)에 같은 HLSL 레이마칭 셰이더를 붙인다.',
      godot: 'Godot 은 화면을 덮는 ColorRect 의 canvas_item 셰이더나 Quad 의 spatial 셰이더에 같은 식을 쓴다.',
    },
    principle: [
      '거리 함수 map(p) 는 「점 p 에서 가장 가까운 겉면까지 거리」를 돌려준다. 공 = length(p − c) − r, 둥근 상자 = sdBox.',
      '집합 연산은 거리끼리 계산: 합 min(a, b) · 교 max(a, b) · 차 max(a, −b) · 부드러운 합 smin(a, b, k) — k(0.45)가 클수록 넓게 녹아 붙는다.',
      '픽셀마다 카메라에서 광선을 쏘고 t += map(지금 점) 으로 남은 거리만큼 성큼 간다. 0.001 보다 가까우면 맞음, 최대 90걸음 · 거리 12.',
      '법선은 둘레 네 점의 거리 차이(사면체), 그림자는 빛 쪽으로 28걸음 진행하며 가장 좁았던 틈(9h/t)으로 부드러운 그림자, 구석 그늘은 법선 쪽 4점 거리.',
      '감마는 셰이더에서 직접(pow 0.4545), 톤 매핑은 끈다.',
    ],
    when: ['합 · 교 · 차 같은 집합 연산을 매끈하게 보여 줄 때', '녹아 붙는 말랑한 모양 · 수학 곡면처럼 메시로 만들기 어려운 것'],
    avoid: ['폰 전체 화면 — 픽셀마다 90걸음 + 그림자 28걸음이라 무겁다. 작은 창이나 낮은 해상도로', '다른 3D 물체와 섞어야 하는 장면 — 깊이가 없어 겹치기 어렵다. 그땐 SDF 를 메시로 굽기(i446)'],
    cost: 'heavy',
    costNote: '픽셀마다 광선 90걸음 + 그림자 28걸음 + 법선 4번 + 그늘 4번 거리 계산. 1080p 면 200만 픽셀 × 수백 번 — 폰은 픽셀 비율을 낮추거나 작은 창으로.',
    level: 3,
    must: [
      '화면을 덮는 사각형 하나 + ShaderMaterial (메시 없이)',
      '연산은 합 · 부드러운 합 · 교 · 차 넷, 바꿀 때 거리 값을 섞어(uMix) 툭 끊기지 않게',
      '걸음 수 상한(광선 90 · 그림자 28)과 최대 거리로 반복문을 끊는다',
      'NoToneMapping, 감마는 셰이더에서',
      '폰에서는 해상도(픽셀 비율)를 낮춰 프레임을 지킨다 — 반복문이 많아 첫 컴파일도 길 수 있으니 미리 데우기',
    ],
    done: [
      '물체 없이 공과 둥근 상자가 바둑판 바닥 위에 그림자 · 구석 그늘과 함께 보인다',
      '3초마다 합 → 부드러운 합 → 교 → 차로 부드럽게 바뀌고 위에 연산 이름이 나온다',
      '「녹아 붙는 정도 k」를 키우면 부드러운 합의 목이 넓어진다',
      '폰에서는 작은 창 · 낮은 해상도로 30fps 이상',
    ],
    code: {
      lang: 'glsl',
      title: '거리 함수 · 집합 연산 · 레이마칭 반복 (요지)',
      from: 'demos/demosShader.ts sdfDemo() 의 조각 셰이더를 정리',
      body: `uniform vec2 uRes; uniform float uTime, uOp, uK;
float sdBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float opF(float a, float b, float op){
  if (op < 0.5) return min(a, b);        // 합
  if (op < 1.5) return smin(a, b, uK);   // 부드러운 합
  if (op < 2.5) return max(a, b);        // 교
  return max(a, -b);                     // 차
}
float map(vec3 p){
  float a = length(p - vec3(sin(uTime * 0.9) * 0.55, 0.0, 0.0)) - 0.72;            // 공
  float b = sdBox(p - vec3(-sin(uTime * 0.9) * 0.45, 0.0, 0.0), vec3(0.48), 0.07); // 둥근 상자
  return min(opF(a, b, uOp), p.y + 0.95);                                          // + 바닥
}
vec3 nrm(vec3 p){ vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx)); }
void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.y, uRes.x * 0.8);
  vec3 ro = vec3(5.6 * sin(uTime * 0.25 + 0.6), 2.3, 5.6 * cos(uTime * 0.25 + 0.6));
  vec3 fw = normalize(vec3(0.0, -0.05, 0.0) - ro), rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))), up = cross(rt, fw);
  vec3 rd = normalize(p.x * rt + p.y * up + 1.5 * fw);
  vec3 col = vec3(0.8, 0.85, 1.0);
  float t = 0.0;
  for (int i = 0; i < 90; i++) {         // 남은 거리만큼 성큼성큼
    float h = map(ro + rd * t);
    if (h < 0.001) { vec3 n = nrm(ro + rd * t); col = vec3(0.25, 0.72, 1.0) * (0.28 + 0.85 * max(dot(n, normalize(vec3(0.6, 0.85, 0.35))), 0.0)); break; }
    t += h; if (t > 12.0) break;
  }
  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0); // 감마는 직접 (NoToneMapping)
}`,
    },
    pitfalls: [
      { title: '반복문 셰이더는 첫 화면에서 몇 초 멈출 수 있다', fix: '윈도는 반복문이 많은 셰이더를 D3D 로 바꾸는 데 오래 걸린다(보물 동굴 17~20초). 걸음 수를 줄이고 compileAsync 로 미리 데운다.', seen: true },
      { title: '폰 전체 화면에서 그대로 돌리면 프레임이 크게 떨어진다', fix: '픽셀마다 수백 번 계산이라 해상도를 낮추거나 작은 창에서만 쓴다.' },
      { title: '톤 매핑을 켠 채 직접 감마를 하면 색이 두 번 바뀐다', fix: '견본처럼 tone: NoToneMapping 으로 두고 셰이더에서 pow(col, 0.4545) 한 번만.' },
      { title: '연산을 툭 바꾸면 모양이 튄다', fix: '이전 연산 · 새 연산의 거리 값을 uMix 로 0.6초 섞는다.' },
    ],
    next: ['i446'],
    refs: [
      { name: 'Inigo Quilez — distance functions', url: 'https://iquilezles.org/articles/distfunctions/' },
      { name: 'Inigo Quilez — smooth minimum', url: 'https://iquilezles.org/articles/smin/' },
    ],
  },
};

import type { TechDoc } from './types';

/**
 * 기술 문서 B07 — 배움 · 피드백(i400 · i402 · i403) · 속도 기법(i67 · i232 · i303 · i384 · i386 · i387 · i389 · i391 · i393 · i394 · i478)
 * · 온라인 대전(i439 ~ i443) · 입력(u51 · u79 · i418 ~ i422 · i424 · i425) · 플랫폼 · 성능(u81 · u84 · u86).
 * 코드는 견본(src/studio/demos/*) 또는 실제 게임 코드에서 발췌해 카드용 장치를 걷어 냈다 (from 에 출처).
 */
export const DOCS: Record<string, TechDoc> = {
  i400: {
    id: 'i400',
    summary: '답을 맞음 · 틀림 둘로만 가르지 않고 단위 빠짐 · 약분 안 한 분수 · 오차 범위를 구별해, 「한 걸음 더」라고 알려 준다.',
    terms: [
      { en: 'Partial-credit answer checking', ko: '근접 정답 판정 (부분 점수)' },
      { en: 'Tolerance (error margin)', ko: '오차 범위 — ±0.2cm 안이면 정답으로' },
      { en: 'Equivalent fraction detection', ko: '같은 값 분수 알아채기 (2/4 = 1/2)' },
      { en: 'Formative feedback', ko: '다음에 무엇을 고칠지 알려 주는 피드백' },
    ],
    goal: '{target}의 답 판정을 「정답 · 한 걸음 더 · 다시 생각」 세 갈래로 나눠 줘 — 단위 빠짐 · 약분 안 한 분수 · 소수로 쓴 답 · 눈금 오차를 따로 알아채고, 갈래마다 다음에 할 일을 한 줄로. 말투는 {style}.',
    targets: ['자로 길이 재기 · 분수 문제', '계산 연습 문제', '측정 · 단위 바꾸기 문제'],
    styles: ['다정한 선생님', '짧고 또렷한 게임 안내', '친구처럼 장난스럽게'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 판정 함수를 C# 으로 옮기고, 입력은 TMP_InputField.onSubmit 에서 부른다.',
      godot: 'Godot 은 LineEdit 의 text_submitted 시그널에서 같은 판정 함수를 부른다 (RegEx 클래스로 수 · 단위 읽기).',
    },
    principle: [
      '먼저 글자를 정리한다 — 빈칸을 지우고, 수와 단위를 따로 읽는다 (정규식).',
      '단위를 하나로 바꿔(mm → cm ÷ 10) 정답과 견준다. 차이가 오차(±0.2) 안이면 정답.',
      '틀렸어도 「수는 맞는데 단위가 없다」 · 「값은 같은데 약분 안 했다」 · 「거의 다 왔다(±0.6)」처럼 이유가 보이면 「한 걸음 더」로 가른다.',
      '갈래마다 다음에 할 일을 한 줄로 — 「단위를 붙여요」 · 「약분하면 더 간단해요」.',
    ],
    when: ['측정 · 분수 · 단위처럼 「거의 맞은 답」이 자주 나오는 문제', '어린 학생이 틀림 표시에 쉽게 포기할 때', '같은 값을 여러 꼴(1/2 · 0.5 · 50%)로 쓸 수 있는 문제'],
    avoid: ['답이 하나뿐인 고르기 문제 — 맞음/틀림이면 충분하다', '빨리 풀기 대결 — 「한 걸음 더」 대화가 흐름을 끊는다 (대신 끝난 뒤 해설로)'],
    cost: 'light',
    costNote: '글자 정리 · 정규식 한두 번 — 계산 비용은 없다. 일은 「어떤 거의 맞은 답이 있나」를 미리 적는 데 든다.',
    level: 1,
    must: [
      '판정은 정답(ok) · 한 걸음 더(near) · 다시 생각(no) 세 갈래, 갈래마다 다음 행동 한 줄',
      '단위가 있는 답은 단위를 하나로 바꿔 비교 (50mm = 5cm 는 정답)',
      '실수끼리는 === 로 비교하지 않기 — 차이의 절댓값이 아주 작은지(1e-9)나 오차 범위로',
      '「한 걸음 더」는 점수를 깎지 않고 다시 쓸 기회를 준다 (틀림 표시 금지)',
      '알아볼 수 없는 글은 「수와 단위로 적어요 (예: 5cm)」처럼 적는 법을 알려 준다',
    ],
    done: [
      '5 → 「수는 맞아요! 단위를 붙여요」, 4.9cm → 정답(오차 안), 50mm → 정답(같은 길이)으로 판정된다',
      '2/4 → 「같은 양이에요! 약분하면 더 간단해요」, 0.5 → 「분수로 써 볼까요?」, 1/2 → 정답',
      '세 갈래 등(초록 · 노랑 · 빨강)과 도장 · 한 줄 말이 판정마다 바뀐다',
      '폰 가로 화면에서 입력 칸 · 판정 단추가 손가락으로 누르기 충분히 크다',
    ],
    code: {
      lang: 'ts',
      title: '길이 답 판정 — 단위 맞추기 · 오차 범위 · 「한 걸음 더」 갈래',
      from: 'demos/demosLearn.ts judgeLen() (정답 5cm)',
      body: `type Verdict = { v: 'ok' | 'near' | 'no'; msg: string };

function judgeLen(s: string): Verdict {
  const t = s.trim().toLowerCase().replace(/\\s+/g, '');
  const m = t.match(/^(\\d+(?:\\.\\d+)?)(cm|mm|m)?$/);
  if (!m) return { v: 'no', msg: '수와 단위로 적어요 (예: 5cm)' };
  const n = +m[1];
  const u = m[2] ?? '';
  // 단위가 빠진 답 — 수가 맞으면 「한 걸음 더」
  if (!u) {
    if (Math.abs(n - 5) <= 0.2) return { v: 'near', msg: '수는 맞아요! 단위를 붙여요 — 5 무엇?' };
    if (Math.abs(n - 50) <= 2) return { v: 'near', msg: '50 무엇일까요? 단위를 붙여요' };
    return { v: 'no', msg: '막대 끝이 닿은 눈금을 다시 봐요' };
  }
  // 단위를 cm 하나로 바꿔 비교
  const cm = u === 'mm' ? n / 10 : u === 'm' ? n * 100 : n;
  if (Math.abs(cm - 5) < 1e-9) return { v: 'ok', msg: u === 'mm' ? '정답! 50mm = 5cm, 같은 길이예요' : '정답! 눈금을 정확히 읽었어요' };
  if (Math.abs(cm - 5) <= 0.2) return { v: 'ok', msg: '정답 — 눈금 오차(±2mm) 안이에요' };
  // 수는 맞는데 단위가 다른 답 (5mm · 50cm …)
  if (Math.abs(cm * 10 - 5) < 1e-9 || Math.abs(cm / 10 - 5) < 1e-9 || Math.abs(cm / 100 - 5) < 1e-9)
    return { v: 'near', msg: '수는 맞는데 단위가 달라요 — cm 와 mm' };
  if (Math.abs(cm - 5) <= 0.6) return { v: 'near', msg: '거의 다 왔어요! 눈금을 한 번 더 세어 봐요' };
  return { v: 'no', msg: '막대 끝이 닿은 눈금을 다시 봐요' };
}

// 분수: n/d 가 1/2 와 같은 값이면(n * 2 === d) 1/2 만 정답, 2/4 · 4/8 은 「약분하면 더 간단해요」`,
    },
    pitfalls: [
      { title: '실수를 === 로 비교하면 0.1 + 0.2 같은 답이 틀림이 된다', fix: '차이의 절댓값이 1e-9 보다 작은지로 보고, 측정 문제는 오차 범위(±0.2)를 따로 둔다.' },
      { title: '「거의 맞음」 범위를 너무 넓히면 찍어도 칭찬받는다', fix: '근접 범위(±0.6)는 오차 범위(±0.2)보다 조금만 넓게, 그 밖은 「다시 생각」으로.' },
      { title: '공백 · 대문자 · 한글 단위를 안 거르면 맞는 답이 「알아볼 수 없음」이 된다', fix: '판정 전에 trim · toLowerCase · 빈칸 지우기, 「센티 · 밀리」 같은 한글 단위도 받아 준다 (견본은 센티미터 · 밀리까지).' },
      { title: '근접 답에도 빨간 틀림 표시를 붙이면 아이가 포기한다', fix: '「한 걸음 더」는 노란 등 · 다시 쓸 기회, 점수는 깎지 않는다.' },
    ],
    next: ['i402', 'i403'],
  },

  i402: {
    id: 'i402',
    summary: '최근 정답률을 늘 재서 85%를 넘으면 한 단계 위, 70% 밑이면 한 단계 아래 문제를 내, 늘 「조금 어려운」 몰입 구간에 머물게 한다.',
    terms: [
      { en: 'Adaptive difficulty (dynamic difficulty adjustment)', ko: '알맞은 난이도 고르기' },
      { en: 'Exponential moving average', ko: '지수 이동 평균 — 최근 답일수록 무겁게 센 정답률' },
      { en: 'Flow channel', ko: '몰입 구간 — 너무 쉽지도 어렵지도 않은 70~85%' },
      { en: 'Hysteresis / cooldown', ko: '바꾼 뒤 몇 문제는 그대로 두기 (출렁임 막기)' },
    ],
    goal: '{target}에 알맞은 난이도 고르기를 넣어 줘 — 최근 정답률(지수 이동 평균)이 85%를 넘으면 한 단계 위, 70% 밑이면 한 단계 아래, 바꾼 뒤 2문제는 그대로. 정답률 · 난이도 그래프도 {style}(으)로 보여 줘.',
    targets: ['덧셈 · 곱셈 연습 모드', '오늘의 문제', '퍼즐 단계 추천'],
    styles: ['어두운 칠판 그래프', '밝은 공책 그래프', '게임 HUD 막대'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '정답률은 지수 이동 평균으로 — 답할 때마다 rate = rate × 0.84 + (맞음 ? 1 : 0) × 0.16.',
      '정답률이 85% 를 넘으면 난이도 +1, 70% 밑이면 −1 (1 ~ 10단계).',
      '바꾼 뒤 2문제는 다시 바꾸지 않는다 — 안 그러면 한 문제마다 출렁인다.',
      '난이도마다 문제 만드는 함수가 따로 있다 (1 = 한 자리 덧셈 … 10 = 두 자리 × 두 자리).',
    ],
    when: ['실력 차가 큰 아이들이 같은 연습 모드를 쓸 때', '정해진 단계 대신 끝없이 이어지는 연습 · 오늘의 문제'],
    avoid: ['정해진 단계를 차례로 깨는 퍼즐 — 깬 단계 표시가 더 분명하다', '대결 게임 — 몰래 쉬워지면 공정하지 않다 (대신 난이도 고르기 창)'],
    cost: 'light',
    costNote: '답할 때 곱셈 두 번 · 비교 두 번. 그래프는 문제 40개만 그린다.',
    level: 2,
    must: [
      '정답률은 지수 이동 평균(0.84 / 0.16), 처음 값은 0.78 (몰입 구간 안에서 시작)',
      '올리기 85% 초과 · 내리기 70% 미만 — 두 문턱 사이에서는 그대로',
      '바꾼 뒤 2문제는 쉬기 (cool = 2)',
      '난이도는 1 ~ 10 범위를 넘지 않게',
      '그래프에 몰입 구간 띠(70~85%)와 난이도 계단을 함께 그려, 왜 바뀌었는지 보이게',
    ],
    done: [
      '연달아 맞히면 정답률 선이 85% 위로 올라가고 난이도 계단이 한 칸 올라간다',
      '연달아 틀리면 70% 밑으로 내려가며 한 칸 내려간다, 바뀐 순간 ▲ · ▼ 표시',
      '자동 재생에서 실력이 오르는 학생은 계단을 오르면서도 정답률 선이 띠 안에 머문다',
      '「고정 난이도」 선과 나란히 보면 고정 쪽은 띠 밖으로 벗어난다',
    ],
    code: {
      lang: 'ts',
      title: '답할 때마다 정답률 갱신 → 문턱 넘으면 난이도 한 칸',
      from: 'demos/demosLearn.ts i402 submit() · makeQ() 를 정리 (makeQ 는 10단계 중 셋만)',
      body: `const S = { rate: 0.78, level: 3, cool: 0 };
let q = makeQ(S.level, Math.random); // makeQ(단계, 난수) → { text, ans }

function submit(answer: string): 'up' | 'down' | '' {
  const ok = +answer.trim() === q.ans;
  // 지수 이동 평균 — 최근 답일수록 무겁게
  S.rate = S.rate * 0.84 + (ok ? 1 : 0) * 0.16;
  let change: 'up' | 'down' | '' = '';
  if (S.cool > 0) S.cool--; // 바꾼 뒤 2문제는 그대로
  else if (S.rate > 0.85 && S.level < 10) {
    S.level++;
    S.cool = 2;
    change = 'up';
  } else if (S.rate < 0.7 && S.level > 1) {
    S.level--;
    S.cool = 2;
    change = 'down';
  }
  q = makeQ(S.level, Math.random);
  return change;
}

// 난이도별 문제 — 예: 1단계 한 자리 덧셈, 7단계 구구단
function makeQ(lv: number, r: () => number): { text: string; ans: number } {
  const ri = (a: number, b: number): number => a + Math.floor(r() * (b - a + 1));
  if (lv === 1) { const a = ri(1, 5); const b = ri(1, 9 - a); return { text: a + ' + ' + b, ans: a + b }; }
  if (lv === 7) { const a = ri(3, 9); const b = ri(3, 9); return { text: a + ' × ' + b, ans: a * b }; }
  const a = ri(12, 39); const b = ri(12, 29);
  return { text: a + ' × ' + b, ans: a * b };
}`,
    },
    pitfalls: [
      { title: '쉬는 문제 없이 바로바로 바꾸면 난이도가 한 문제마다 출렁인다', fix: '바꾼 뒤 2문제는 그대로 두고(cool), 올리기 · 내리기 문턱 사이에 빈 구간(70~85%)을 둔다.' },
      { title: '최근 몇 개의 단순 평균을 쓰면 오래된 실수가 갑자기 빠지며 튄다', fix: '지수 이동 평균은 옛 답의 무게가 서서히 줄어 선이 매끈하다.' },
      { title: '난이도가 바뀐 것을 안 보여 주면 아이가 갑자기 어려워졌다고 느낀다', fix: '바뀐 순간 ▲ · ▼ 와 단계 이름(「구구단」)을 잠깐 보여 준다.' },
    ],
    prev: ['i400'],
    next: ['i403'],
    refs: [{ name: 'Wikipedia — Flow (psychology)', url: 'https://en.wikipedia.org/wiki/Flow_(psychology)' }],
  },

  i403: {
    id: 'i403',
    summary: '틀린 문제를 1일 · 3일 · 7일 뒤에 다시 내서, 잊을 때쯤 복습할 때마다 기억이 100%로 돌아오고 더 천천히 잊게 한다.',
    terms: [
      { en: 'Spaced repetition', ko: '간격 반복 — 간격을 늘려 가며 다시 보기' },
      { en: 'Forgetting curve', ko: '기억 곡선 — 시간이 지나며 기억이 줄어드는 모양 e^(−t/S)' },
      { en: 'Memory stability', ko: '기억 안정도 S — 클수록 천천히 잊음' },
      { en: 'Review schedule (Leitner system)', ko: '복습 날짜표 (상자 옮기기 방식)' },
    ],
    goal: '{target}에 간격 반복을 넣어 줘 — 틀린 문제를 1일 · 3일 · 7일 뒤 다시 내고, 기억 곡선(복습할 때마다 100%로 돌아와 더 천천히 줄어듦)을 {style} 그래프로 보여 줘.',
    targets: ['구구단 복습', '단원 복습 · 오답 노트', '단어 · 공식 외우기'],
    styles: ['따뜻한 갈색 공책', '어두운 칠판', '밝은 달력'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '기억은 마지막 복습 뒤 지난 날 수 d 에 따라 e^(−d / S) 로 줄어든다.',
      '복습할 때마다 기억은 100% 로 돌아오고, 안정도 S 가 커진다 — 견본은 2 → 5 → 12 → 30 → 60 → 90.',
      '그래서 복습 간격을 1일 · 3일 · 7일처럼 점점 늘려도 기억이 「잊기 시작(60%)」 선 위에 머문다.',
      '틀린 문제에 다음 복습 날짜를 적어 두고, 그날 문제 목록에 섞어 낸다.',
    ],
    when: ['구구단 · 단어처럼 외워야 하는 것이 많을 때', '오답 노트 — 틀린 문제를 언제 다시 낼지 정할 때'],
    avoid: ['한 번 풀면 끝나는 퍼즐 · 이야기 — 다시 볼 이유가 없다', '날짜를 저장할 수 없는 손님 모드 — 대신 같은 날 안에서 몇 문제 뒤 다시'],
    cost: 'light',
    costNote: '문제마다 날짜 하나 · 단계 하나만 저장. 그래프는 점 280개.',
    level: 2,
    must: [
      '기억 = e^(−(오늘 − 마지막 복습일) / S[복습 횟수]), S = [2, 5, 12, 30, 60, 90]',
      '추천 복습일은 1 · 3 · 7일 — 사용자가 날짜를 넣고 뺄 수 있게',
      '「잊기 시작」 60% 점선을 그어, 복습이 그 선 위에 머무는지 보이게',
      '복습 안 한 곡선(점선)을 함께 그려 비교',
      '복습 날짜는 저장소(Storage)에 문제별로 — 날짜는 하루 단위로 반올림',
    ],
    done: [
      '추천 1 · 3 · 7일이면 곡선이 복습 날마다 100% 로 튀어 오르고, 14일째에도 60% 위에 있다',
      '복습을 모두 빼면 곡선이 2일 만에 60% 아래로 떨어진다 (복습 안 한 점선과 같음)',
      '그래프를 눌러 복습 날을 넣고 빼면 곡선이 바로 다시 그려진다',
    ],
    code: {
      lang: 'ts',
      title: '복습 날짜에 따른 기억 정도',
      from: 'demos/demosLearn.ts i403 retention() · 아래 due · reviewed 는 새로 씀 (같은 1 · 3 · 7일 간격)',
      body: `// 복습할 때마다 안정도가 커진다 (클수록 천천히 잊음)
const SVAL = [2, 5, 12, 30, 60, 90];
let reviews = [1, 3, 7]; // 추천 복습일

/** d 일째 기억에 남은 정도 (0~1) */
function retention(d: number, rv: number[]): number {
  let last = 0; // 마지막 복습일
  let k = 0;    // 지금까지 복습한 횟수
  for (const r of rv) if (r <= d) {
    last = r;
    k++;
  }
  return Math.exp(-(d - last) / SVAL[Math.min(k, SVAL.length - 1)]);
}

// 오늘 낼 복습 문제 고르기 — 다음 복습일이 오늘 이하인 것
interface Card { id: string; next: number; step: number }
const GAPS = [1, 2, 4]; // 1일 → 3일 → 7일 (간격이 1 · 2 · 4 일씩 늘어남)
function due(cards: Card[], today: number): Card[] {
  return cards.filter((c) => c.next <= today);
}
function reviewed(c: Card, today: number, ok: boolean): void {
  c.step = ok ? Math.min(c.step + 1, GAPS.length - 1) : 0; // 또 틀리면 처음부터
  c.next = today + GAPS[c.step];
}`,
    },
    pitfalls: [
      { title: '복습 간격을 늘 같게 하면 외운 것도 계속 나와 지루하다', fix: '맞힐 때마다 간격을 늘리고(1 → 3 → 7일), 틀리면 처음 간격으로 되돌린다.' },
      { title: '시각을 그대로 저장하면 밤 11시에 푼 문제가 다음 날 아침에 안 나온다', fix: '날짜는 하루 단위(자정 기준 날 수)로 반올림해 저장한다.' },
      { title: '기억 곡선 모양을 지어낸 숫자로 정확한 과학처럼 보여 주면 오해한다', fix: '안정도 값(2 · 5 · 12 …)은 모양을 보여 주는 견본 값임을 그래프 설명에 적는다.' },
    ],
    prev: ['i402'],
    next: ['i400'],
    refs: [
      { name: 'Wikipedia — Spaced repetition', url: 'https://en.wikipedia.org/wiki/Spaced_repetition' },
      { name: 'Wikipedia — Forgetting curve', url: 'https://en.wikipedia.org/wiki/Forgetting_curve' },
    ],
  },

  i67: {
    id: 'i67',
    summary: '삼각형을 경계 상자 나무(BVH)에 나눠 담아, 광선이 맞을 만한 상자 속 삼각형만 검사해 큰 모델에서도 누른 곳을 빨리 찾는다.',
    terms: [
      { en: 'Bounding volume hierarchy (BVH)', ko: '경계 상자 나무 — 상자 안에 작은 상자들' },
      { en: 'three-mesh-bvh (computeBoundsTree · acceleratedRaycast)', ko: 'three.js 용 BVH 라이브러리' },
      { en: 'Ray–AABB slab test', ko: '광선과 축 정렬 상자가 만나는지 (판 사이 구간 겹치기)' },
      { en: 'Raycasting', ko: '광선을 쏘아 맞는 면 찾기' },
    ],
    goal: '{target}에서 광선 검사를 BVH 로 빠르게 해 줘 — 삼각형을 경계 상자 나무에 나눠 담고, 광선이 상자를 안 지나면 그 안은 통째로 건너뛰기. 검사한 삼각형 수를 전부 검사와 나란히 {style}(으)로 보여 줘.',
    targets: ['삼각형이 많은 3D 모델 고르기', '지형 위 클릭 · 발 디딤', '총알 · 레이저 충돌'],
    styles: ['상자 나무가 보이는 설명 그림', '실제 게임 장면 + 숫자 HUD', '어두운 개발자 화면'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 MeshCollider + Physics.Raycast 가 이미 가속 구조를 쓴다 — 직접 만들 일은 드물다.',
      godot: 'Godot 은 ConcavePolygonShape3D 충돌 모양이 내부 BVH 를 쓴다 — PhysicsDirectSpaceState3D.intersect_ray 로 묻는다.',
    },
    principle: [
      '모든 삼각형을 검사하면 광선 하나에 N 번 — 삼각형 10만 개면 프레임마다 10만 번.',
      '삼각형 묶음을 감싸는 상자를 만들고, 긴 축을 따라 가운데서 둘로 나누기를 반복한다 (한 칸에 6개 이하면 멈춤).',
      '광선이 상자를 안 지나면 그 안 삼각형은 통째로 건너뛴다 — 보통 log N 단계만 내려간다.',
      'three.js 에서는 three-mesh-bvh 의 geometry.computeBoundsTree() 와 Mesh.prototype.raycast = acceleratedRaycast 로 같은 일을 한다.',
    ],
    when: ['삼각형 수만 개 넘는 모델을 누르거나 끌 때 Raycaster 가 느릴 때', '매 프레임 여러 광선(발 디딤 · 시야 검사)을 쏠 때'],
    avoid: ['물체가 몇 개뿐인 판 게임 — 상자 · 보이지 않는 판으로 고르는 편이 쉽다', '모양이 매 프레임 바뀌는 메시 — 나무를 다시 만드는 비용이 크다 (대신 단순한 충돌 모양)'],
    cost: 'light',
    costNote: '나무 만들기는 처음 한 번(삼각형 N log N). 검사는 전부 검사의 수십분의 일 — 견본 110개 중 맞을 만한 칸만.',
    level: 2,
    must: [
      '나무는 처음 한 번만 만들고, 모양이 바뀔 때만 다시',
      '나누기는 상자의 긴 축을 따라 가운데(정렬 후 절반)에서, 잎 하나에 삼각형 6개 이하',
      '상자 검사는 판 사이 구간(slab) 방식 — 광선 방향 성분이 0 이면 따로 처리',
      '전부 검사와 BVH 검사의 「검사한 삼각형 수」를 나란히 보여 줘 효과를 숫자로',
    ],
    done: [
      '광선이 움직일 때 BVH 쪽은 지나가는 상자만 밝게, 나머지 상자는 흐리게 보인다',
      '맞은 삼각형(빨강)은 두 쪽이 같고, 검사한 삼각형 수는 BVH 쪽이 훨씬 적다',
      '삼각형 수를 늘려도 BVH 쪽 검사 수는 조금만 는다',
    ],
    code: {
      lang: 'ts',
      title: '2D 경계 상자 나무 만들기 + 광선으로 걸러 검사하기',
      from: 'demos/demosSystem.ts i67 build() · boxHit() 와 draw 의 walk 를 정리',
      body: `type Box = [number, number, number, number]; // x0 y0 x1 y1
interface Node { b: Box; items: number[]; kids: Node[] }

// tris[i] = [ax, ay, bx, by, cx, cy] , bounds(ids) = 그 삼각형들을 감싸는 상자
function build(ids: number[]): Node {
  const b = bounds(ids);
  if (ids.length <= 6) return { b, items: ids, kids: [] };
  const ax = b[2] - b[0] > b[3] - b[1] ? 0 : 1; // 긴 축
  const sorted = [...ids].sort((p, q) => tris[p][ax] + tris[p][ax + 2] - (tris[q][ax] + tris[q][ax + 2]));
  const m = sorted.length >> 1;
  return { b, items: [], kids: [build(sorted.slice(0, m)), build(sorted.slice(m))] };
}

// 선분 (ax,ay)→(bx,by) 이 상자를 지나는지 — 판 사이 구간 겹치기
function boxHit(b: Box, ax: number, ay: number, bx: number, by: number): boolean {
  let t0 = 0, t1 = 1;
  const d = [bx - ax, by - ay], o = [ax, ay];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < b[k] || o[k] > b[k + 2]) return false; continue; }
    let a1 = (b[k] - o[k]) / d[k], a2 = (b[k + 2] - o[k]) / d[k];
    if (a1 > a2) [a1, a2] = [a2, a1];
    t0 = Math.max(t0, a1); t1 = Math.min(t1, a2);
    if (t0 > t1) return false;
  }
  return true;
}

// 맞을 만한 삼각형만 모으기 — 상자를 안 지나면 그 아래는 통째로 건너뜀
function candidates(n: Node, ax: number, ay: number, bx: number, by: number, out: number[]): void {
  if (!boxHit(n.b, ax, ay, bx, by)) return;
  out.push(...n.items);
  for (const k of n.kids) candidates(k, ax, ay, bx, by, out);
}`,
    },
    pitfalls: [
      { title: '매 프레임 나무를 다시 만들면 전부 검사보다 느려진다', fix: '나무는 모양이 바뀔 때만. 물체가 움직이기만 하면 광선을 물체 좌표로 바꿔서 같은 나무로 묻는다.' },
      { title: '광선 방향 성분이 0 일 때 나누기를 하면 무한대 · NaN 이 나온다', fix: '방향 성분이 아주 작으면 시작점이 그 축 범위 안인지만 본다 (견본 boxHit).' },
      { title: '외곽선 껍데기 · 그림자용 복제까지 광선 대상에 넣으면 엉뚱한 것이 잡힌다', fix: '고를 대상 배열을 따로 두거나 껍데기의 raycast 를 빈 함수로 둔다.' },
    ],
    prev: ['u79'],
    next: ['i391'],
    refs: [
      { name: 'three-mesh-bvh (GitHub)', url: 'https://github.com/gkjohnson/three-mesh-bvh' },
      { name: 'Wikipedia — Bounding volume hierarchy', url: 'https://en.wikipedia.org/wiki/Bounding_volume_hierarchy' },
    ],
  },

  i232: {
    id: 'i232',
    summary: '먼 나무를 8방향에서 한 번 찍어 그림 한 장(아틀라스)에 구워 두고, 보는 각도에 맞는 그림을 골라 섞은 판 하나로 그려 숲 수백 그루를 가볍게 만든다.',
    terms: [
      { en: 'Impostor (billboard impostor)', ko: '빌보드 대역 — 입체처럼 보이는 그림 판' },
      { en: 'Render to texture atlas (WebGLRenderTarget + viewport)', ko: '여러 방향 그림을 한 장에 굽기' },
      { en: 'Cylindrical (Y-axis) billboard', ko: '세로축만 돌아 카메라를 보는 판' },
      { en: 'InstancedBufferGeometry', ko: '판 하나를 수백 번 — 위치 · 돌림 · 크기는 인스턴스 속성' },
    ],
    goal: '{target}을(를) 빌보드 대역으로 그려 줘 — 진짜 모델을 8방향에서 한 번 찍어 한 장에 굽고, 판 수백 개가 보는 각도에 맞는 그림 두 장을 골라 섞기. 가까운 몇 개만 진짜 모델로. 분위기는 {style}.',
    targets: ['먼 숲의 나무', '경기장 관중', '먼 건물 · 바위'],
    styles: ['밝은 낮 들판', '안개 낀 아침', '동화책 그림'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 LODGroup 의 마지막 단계에 BillboardRenderer(BillboardAsset) 를 두거나, 대역 굽기 에셋을 쓴다.',
      godot: 'Godot 은 굽는 기능이 없어 직접 — SubViewport 로 찍고, 판은 StandardMaterial3D 의 billboard_mode = Y-Billboard + MultiMeshInstance3D.',
    },
    principle: [
      '진짜 나무 하나는 삼각형 수백~수천 개, 대역 판 하나는 삼각형 2개.',
      '처음 그릴 때 한 번, 직교 카메라로 나무를 8방향(45°마다)에서 찍어 128×256 칸 8개(1024×256 한 장)에 굽는다.',
      '정점 셰이더가 판을 세로축으로 돌려 카메라를 보게 하고, 카메라 쪽 각도 − 나무마다 돌림을 8칸으로 나눠 어느 그림을 쓸지 고른다.',
      '사이 각도는 이웃 두 그림을 fract 만큼 섞는다 — 끄면 걸을 때 그림이 툭툭 바뀐다.',
      '알파가 0.5 미만이면 discard, 안개는 셰이더에서 거리로 직접 섞는다.',
    ],
    when: ['멀리 보이는 같은 모양이 수백 그루 넘을 때 (숲 · 관중)', '카메라가 땅 높이에서 수평으로 돌아보는 장면'],
    avoid: ['바로 위에서 내려다보는 구도 — 옆에서 찍은 판이 납작하게 보인다 (대신 인스턴싱 진짜 모델)', '가까이 다가가는 물체 — 가까운 것은 진짜 모델로 (견본도 6그루는 진짜)'],
    cost: 'light',
    costNote: '대역 900그루 = 삼각형 1,800개 · 그리기 1번. 굽기는 처음 한 번(1024×256 렌더 타깃 하나, 약 1MB).',
    level: 2,
    must: [
      '굽기는 처음 render 때 한 번 — 굽는 장면의 빛을 본 장면과 같게 (안 그러면 대역만 밝기가 다르다)',
      '굽는 동안 clearColor 알파 0, autoClear 끄고 viewport 를 칸마다 바꿔 한 장에',
      '판은 세로축만 돈다 (위아래로 기울지 않게) — right = normalize(toC.z, 0, −toC.x)',
      '이웃 두 방향 그림을 섞어 바뀌는 순간이 안 보이게, 섞기 켬/끔 조절',
      '대역 판의 frustumCulled = false (인스턴스가 넓게 퍼져 경계 상자가 맞지 않음)',
    ],
    done: [
      '카메라가 숲을 돌아도 먼 나무가 입체처럼 옆모습이 바뀌어 보인다',
      '「대역 판 드러내기」를 켜면 분홍 사각형 판이 보여 그림 한 장임을 알 수 있다',
      '「각도 사이 섞기」를 끄면 그림이 툭툭 바뀌고, 켜면 부드럽다',
      '대역 나무 수 슬라이더를 1,400 까지 올려도 프레임이 거의 그대로다',
    ],
    code: {
      lang: 'ts',
      title: '8방향 굽기 + 각도로 그림 고르는 정점 셰이더',
      from: 'demos/demosLook2.ts makeImpostor() bake() · vertexShader',
      body: `const FR = 8; // 방향 수
const atlas = new THREE.WebGLRenderTarget(FR * 128, 256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const bakeCam = new THREE.OrthographicCamera(-0.75, 0.75, 2.6, -0.4, 0.1, 20);

function bake(r: THREE.WebGLRenderer, bakeScene: THREE.Scene): void {
  r.setRenderTarget(atlas);
  r.setClearColor(0x000000, 0); // 빈 곳은 투명
  r.clear();
  const ac = r.autoClear;
  r.autoClear = false;
  for (let k = 0; k < FR; k++) {
    const a = (k / FR) * Math.PI * 2;
    bakeCam.position.set(Math.sin(a) * 6, 1.1, Math.cos(a) * 6);
    bakeCam.lookAt(0, 1.1, 0);
    atlas.viewport.set(k * 128, 0, 128, 256); // k 번째 칸에
    r.setRenderTarget(atlas);
    r.render(bakeScene, bakeCam);
  }
  r.autoClear = ac;
  atlas.viewport.set(0, 0, FR * 128, 256);
  r.setRenderTarget(null);
}

// 인스턴스 속성 aI = (x, z, 돌림, 크기)
const vertexShader = [
  'attribute vec4 aI; varying vec2 vUv; varying float vF;',
  'void main(){',
  '  vec3 base = vec3(aI.x, 0.0, aI.y);',
  '  vec3 toC = cameraPosition - base;',
  '  float ang = atan(toC.x, toC.z) - aI.z;',
  '  vF = mod(ang / 6.2831853 * 8.0, 8.0);            // 몇 번째 그림인가 (소수 = 섞기)',
  '  vec3 right = normalize(vec3(toC.z, 0.0, -toC.x)); // 세로축만 돌기',
  '  vec3 p = base + right * (position.x * 1.5 * aI.w) + vec3(0.0, (position.y * 3.0 - 0.4) * aI.w, 0.0);',
  '  vUv = uv;',
  '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
  '}',
].join('\\n');
// 조각 셰이더: f0 = floor(vF), f1 = f0 + 1 칸을 texture2D 로 읽어 mix(a, b, fract(vF)), 알파 0.5 미만 discard`,
    },
    pitfalls: [
      { title: '굽기 장면의 빛이 본 장면과 다르면 대역만 어둡거나 밝다', fix: '굽는 장면에 같은 반구광 · 해(같은 세기 · 방향)를 넣는다. 견본은 둘 다 반구광 1.3 · 해 2.4.' },
      { title: '칸 가장자리까지 읽으면 이웃 칸 그림이 번져 보인다', fix: 'u 좌표를 0.02 ~ 0.98 로 잘라 읽는다 (밉맵이 이웃 칸을 섞기 때문).' },
      { title: '판이 카메라를 완전히 바라보게(구형 빌보드) 하면 내려다볼 때 나무가 눕는다', fix: '세로축만 돌게 하고, 너무 위에서 보는 구도는 진짜 모델 · 인스턴싱으로.' },
      { title: '렌더러 clearColor 를 되돌리지 않으면 본 장면 배경이 투명해진다', fix: '굽기 전 getClearColor · getClearAlpha 를 기억했다가 끝나면 setClearColor 로 되돌린다.' },
    ],
    prev: ['u36'],
    next: ['i478'],
  },

  i303: {
    id: 'i303',
    summary: '흩어진 작은 그림 수십 장을 큰 것부터 「가장 낮은 빈자리」에 꾸려 넣어 한 장으로 합쳐, 그리기 한 번 · 텍스처 바꾸기 0번으로 그린다.',
    terms: [
      { en: 'Texture atlas (sprite sheet packing)', ko: '텍스처 아틀라스 — 그림 여러 장을 한 장에' },
      { en: 'Skyline bin packing', ko: '스카이라인 꾸리기 — 칸마다 쌓인 높이를 보고 가장 낮은 곳에' },
      { en: 'Draw call batching', ko: '그리기 호출 묶기' },
      { en: 'UV rect (source rectangle)', ko: '아틀라스 안 그림 자리 (x · y · w · h)' },
    ],
    goal: '{target}을(를) 텍스처 아틀라스로 꾸려 줘 — 높이가 큰 것부터 스카이라인 방식으로 가장 낮은 빈자리에 넣고, 그림마다 아틀라스 안 자리(x · y · w · h)를 적어 한 장으로. 꾸려 넣는 과정을 {style}(으)로 한 장씩 보여 줘.',
    targets: ['아이콘 · 스티커 그림 수십 장', '2D 게임 캐릭터 프레임', '글자 · 숫자 그림'],
    styles: ['밤하늘 판 위 색 카드', '밝은 작업대', '도트 그림'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Sprite Atlas 에셋(2D Sprite 패키지)이 빌드 때 저절로 꾸린다.',
      godot: 'Godot 은 AtlasTexture 로 한 장의 일부를 잘라 쓴다 — 꾸리기는 가져오기 설정 Texture Atlas 모드.',
    },
    principle: [
      '판 폭만큼 칸마다 「지금 쌓인 높이」 배열(스카이라인)을 둔다. 처음은 모두 0.',
      '그림을 높이 → 폭 큰 순으로 정렬한다 (큰 것부터 넣어야 빈틈이 적다).',
      '그림 폭만큼 걸치는 모든 자리를 훑어, 걸친 칸들의 최대 높이가 가장 낮은 x 에 놓는다.',
      '놓은 칸들의 높이를 「그 높이 + 그림 높이」로 올린다. 판을 넘치면 장 수를 줄여 다시 꾸린다.',
    ],
    when: ['작은 그림이 수십 장 넘어 그릴 때마다 텍스처를 바꾸는 장면', '스프라이트를 한 번에 그리고 싶을 때 (인스턴싱 · 한 메시)'],
    avoid: ['그림이 몇 장뿐이거나 아주 큰 그림 — 한 장 최대 크기(폰 4096)를 넘는다', '실행 중 계속 그림이 바뀌는 것 — 대신 그림마다 텍스처'],
    cost: 'light',
    costNote: '꾸리기는 그림 수 × 판 폭 번 비교 — 40장 · 폭 32 면 순식간. 빌드 때 미리 해 두면 실행 중 비용 0.',
    level: 2,
    must: [
      '정렬은 높이 큰 순, 같으면 폭 큰 순',
      '자리마다 걸친 칸의 최대 높이를 보고 가장 낮은 곳 — 같으면 왼쪽',
      '판을 넘치면 실패로 알리고 판을 키우거나 장 수를 줄여 다시',
      '그림마다 아틀라스 안 자리를 저장하고, 밉맵을 쓰면 그림 사이에 1~2px 여백(번짐 막기)',
      '쓴 넓이 ÷ 판 넓이(채움률)를 보여 주기',
    ],
    done: [
      '흩어진 카드가 한 장씩 날아와 판 아래쪽부터 빈틈 적게 쌓인다',
      '스카이라인 선(칸마다 쌓인 높이)이 놓을 때마다 올라간다',
      '「새 그림 묶음」을 누르면 다른 크기 묶음으로 다시 꾸리고 채움률이 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '스카이라인 꾸리기 — 가장 낮은 빈자리에',
      from: 'demos/demos2dLook.ts mkI303() build() 를 정리',
      body: `interface It { w: number; h: number; x: number; y: number }

/** AW × AW 판(칸 단위)에 꾸려 넣기 — 성공하면 true, 넘치면 false */
function pack(items: It[], AW: number): boolean {
  items.sort((a, b) => b.h - a.h || b.w - a.w); // 큰 것부터
  const hs = new Array<number>(AW).fill(0);      // 칸마다 쌓인 높이 (스카이라인)
  for (const it of items) {
    let best = 1e9;
    let bx = 0;
    for (let x = 0; x + it.w <= AW; x++) {
      let m = 0;
      for (let k = x; k < x + it.w; k++) m = Math.max(m, hs[k]); // 걸친 칸 중 가장 높은 곳에 얹힌다
      if (m < best) {
        best = m;
        bx = x;
      }
    }
    it.x = bx;
    it.y = best;
    for (let k = bx; k < bx + it.w; k++) hs[k] = best + it.h;
  }
  return Math.max(...hs) <= AW;
}

// 그리기: drawImage(atlas, it.x * cell, it.y * cell, it.w * cell, it.h * cell, 화면 x, y, w, h)
// three 면 UV = (it.x / AW, it.y / AW) ~ ((it.x + it.w) / AW, (it.y + it.h) / AW)`,
    },
    pitfalls: [
      { title: '그림 사이 여백 없이 붙이면 축소될 때 이웃 그림 색이 번진다', fix: '밉맵 · 선형 필터를 쓰면 1~2px 여백을 두고, 가장자리 픽셀을 한 칸 늘려 둔다.' },
      { title: '들어온 순서대로 넣으면 큰 그림이 들어갈 자리가 없어진다', fix: '높이 · 폭 큰 순으로 정렬한 뒤 넣는다.' },
      { title: '판보다 높이 쌓여도 그대로 쓰면 그림이 잘린다', fix: '최대 높이가 판을 넘으면 실패 — 견본은 장 수를 2장씩 줄여 다시 꾸린다.' },
    ],
    prev: ['i391'],
    next: ['u36'],
    refs: [{ name: 'Wikipedia — Texture atlas', url: 'https://en.wikipedia.org/wiki/Texture_atlas' }],
  },

  i384: {
    id: 'i384',
    summary: '프레임 시간을 0.05초로 잘라 버리던 것을, 0.25초까지 받아 0.05초 조각으로 여러 번 갱신해, 느린 폰에서도 게임이 슬로모션이 되지 않게 한다.',
    terms: [
      { en: 'Fixed timestep with substeps', ko: '고정 조각으로 나눠 여러 번 갱신' },
      { en: 'Delta time clamping', ko: '프레임 시간 상한 — 너무 길면 자르기' },
      { en: 'Spiral of death', ko: '갱신이 밀려 점점 더 느려지는 것 (상한 0.25초로 막음)' },
      { en: 'Game clock vs wall clock', ko: '게임 시계와 실제 시간' },
    ],
    goal: '{target}의 게임 루프를 시간 조각 방식으로 바꿔 줘 — 프레임 시간은 0.25초까지 받고, 0.05초 조각으로 나눠 갱신을 여러 번, 그리기는 한 번. {style} 환경에서도 게임 시계가 실제 시간과 같게.',
    targets: ['공 · 말이 움직이는 게임', '물리 · 애니메이션 루프', '타이머가 있는 게임'],
    styles: ['느린 폰 (12fps)', '보통 폰 (30fps)', '빠른 PC (60fps)'],
    platforms: ['web', 'three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 FixedUpdate 가 같은 방식 — Time.fixedDeltaTime 조각, 상한은 Time 설정의 Maximum Allowed Timestep(기본 0.3333).',
      godot: 'Godot 은 _physics_process 가 고정 틱, 한 프레임 최대 틱 수는 physics/common/max_physics_steps_per_frame.',
    },
    principle: [
      '옛 방식: dt = Math.min(dt, 0.05) — 12fps(한 프레임 0.083초)면 0.033초를 버려 게임이 60% 속도로 흐른다.',
      '고친 방식: 남은 시간 = min(dt, 0.25), 0.05초 이하 조각으로 나눠 update 를 여러 번 부른다.',
      '그리기는 프레임에 한 번 — 갱신만 여러 번이라 비용이 크지 않다.',
      '0.25초 상한은 탭을 오래 숨겼다 돌아올 때 수백 번 갱신하는 것을 막는다.',
    ],
    when: ['느린 폰에서 게임이 느려진다(슬로모션)는 말을 들을 때', '이동 · 물리가 dt 에 따라 움직이는 모든 루프 — 새 게임은 처음부터'],
    avoid: ['차례제 판 게임처럼 dt 를 안 쓰는 화면 — 바꿀 것이 없다', '결정론이 꼭 필요한 물리(되감기 · 온라인 동기) — 대신 늘 같은 크기 조각 + 남은 시간 누적(accumulator)'],
    cost: 'light',
    costNote: '느린 프레임에서만 갱신이 2~5번으로 는다. 갱신이 무거운 게임은 조각 수를 HUD 로 확인.',
    level: 1,
    must: [
      '프레임 시간 상한은 0.25초, 조각 크기는 0.05초 이하',
      '갱신(update)만 여러 번, 그리기(render)는 한 번',
      '조각마다 dt 는 그 조각 길이(마지막 조각은 남은 만큼)',
      '게임 시계와 실제 시간을 나란히 보여 줘 차이가 없음을 확인',
    ],
    done: [
      '흉내 12fps 에서 위 칸(옛 방식)은 공이 늦게 도착하고 「60% 속도 — 슬로모션」, 아래 칸은 제시간에 도착',
      '아래 칸에 「이번 프레임: 갱신 2번 · 그리기 1번」처럼 조각 수가 보인다',
      'fps 슬라이더를 5 ~ 60 으로 바꿔도 아래 칸 도착 시간은 2초 그대로',
    ],
    code: {
      lang: 'ts',
      title: '0.25초까지 받아 0.05초 조각으로 갱신',
      from: 'demos/demosPerf.ts demo384() stepNew() 를 게임 루프 꼴로',
      body: `let last = performance.now();

function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  // 옛 방식: update(Math.min(dt, 0.05)) — 20fps 아래에서 남는 시간을 버려 슬로모션
  let rem = Math.min(dt, 0.25); // 너무 긴 프레임(탭 숨김 등)만 자른다
  let steps = 0;
  while (rem > 1e-6) {
    const s = Math.min(0.05, rem);
    update(s); // 게임 시계 · 이동 · 물리
    rem -= s;
    steps++;
  }
  render(); // 그리기는 한 번
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);`,
    },
    pitfalls: [
      { title: '프레임 시간을 0.05초로 자르면 20fps 아래에서 게임이 느리게 흐른다', fix: '이 사이트 게임 대부분이 그랬다 — 실제 시간(0.25초까지) + 0.05초 조각으로 고쳤다. 새 게임은 처음부터 이 방식.', seen: true },
      { title: '상한 없이 받으면 탭을 오래 숨겼다 돌아올 때 한꺼번에 수백 번 갱신한다', fix: '0.25초 상한을 둔다 — 그 넘은 시간은 버려도 사람이 못 느낀다.' },
      { title: 'update 안에서 그리기까지 하면 조각마다 그려 더 느려진다', fix: '갱신과 그리기를 나눠, 그리기는 루프 끝에서 한 번만.' },
    ],
    next: ['i394', 'i387'],
    refs: [{ name: 'Gaffer On Games — Fix Your Timestep!', url: 'https://gafferongames.com/post/fix_your_timestep/' }],
  },

  i386: {
    id: 'i386',
    summary: '첫 터치 때 소리 장치를 만들며 0.3~0.4초 멈추던 것을, 홈에서 미리 만들어 두고 게임 카드를 누를 때 깨워 첫 터치 멈춤 · 첫 소리 늦음을 없앤다.',
    terms: [
      { en: 'AudioContext warm-up (resume on user gesture)', ko: '소리 장치 미리 깨우기' },
      { en: 'Autoplay policy', ko: '사용자 몸짓 안에서만 소리를 켤 수 있는 브라우저 규칙' },
      { en: 'AudioContext.state (suspended · running)', ko: '소리 장치 상태' },
      { en: 'requestIdleCallback', ko: '쉬는 틈에 일하기' },
    ],
    goal: '{target}에서 첫 터치가 멈칫하지 않게 소리 장치를 미리 깨워 줘 — 앱이 쉬는 틈에 AudioContext 를 만들어 두고(멈춘 채), 게임을 여는 누름 안에서 resume, 게임을 닫으면 suspend. {style}.',
    targets: ['게임 모음 사이트의 모든 게임', '첫 화면에 「시작」 단추가 있는 게임', '효과음이 많은 퍼즐'],
    styles: ['카드를 눌러 게임을 여는 홈', '시작 화면 단추', '로딩 없이 바로 시작'],
    platforms: ['webaudio', 'web'],
    principle: [
      '브라우저는 소리 장치를 처음 열 때(소리 상자가 처음 돌기 시작할 때) 멈춘다 — 윈도 크롬에서 0.3 ~ 0.4초.',
      '게임이 첫 클릭 때 new AudioContext() 를 하면 그 멈춤이 첫 수와 겹쳐 「게임이 굼뜨다」로 느껴진다.',
      '몸짓 없이 만든 상자는 멈춘(suspended) 채라 비용이 없다 — 쉬는 틈에 미리 만든다.',
      '게임 카드를 누르는 몸짓 안에서 resume() 하면 장치가 열리는 일이 화면 넘김 뒤에 숨는다 (비동기라 누른 순간도 안 멈춤).',
      '장치는 돌고 있는 상자가 하나라도 있으면 열린 채 — 게임의 새 상자는 0초.',
    ],
    when: ['어느 게임이든 첫 클릭 · 첫 수가 0.3초쯤 멈칫할 때', '효과음이 첫 터치보다 늦게 날 때'],
    avoid: ['소리가 전혀 없는 화면 — 장치를 열 이유가 없다', '홈 화면이 뜨자마자 resume — 몸짓 밖이라 막히고 경고만 남는다'],
    cost: 'light',
    costNote: '멈춘 상자 하나는 비용 0. 게임이 떠 있는 동안 장치를 열어 두는 전기만 든다 (닫을 때 suspend).',
    level: 1,
    must: [
      '상자 만들기는 앱 시작 1.5초 뒤 requestIdleCallback(최대 4초 기다림) 안에서',
      'resume 은 게임 카드를 누르는 이벤트 처리 안에서만 (사용자 몸짓)',
      '게임을 닫으면 suspend — 장치를 놓아 준다',
      'AudioContext 가 없거나 만들다 실패하면 조용히 넘어가기 (게임은 소리 없이)',
      '효과가 있는지 첫 터치 프레임 시간을 전/후로 재서 보여 주기',
    ],
    done: [
      '「끔」 줄은 첫 터치 때 「멈칫」과 함께 첫 소리가 150ms 쯤 늦게 난다',
      '「켬」 줄은 깨우기가 화면 넘김 구간에 숨고 첫 소리가 바로 난다',
      '「진짜로 재기」를 누르면 이 기기의 new AudioContext() 시간과 resume() 시간이 나온다',
    ],
    code: {
      lang: 'ts',
      title: '쉬는 틈에 만들고 · 카드 누를 때 깨우고 · 닫을 때 재우기',
      from: 'src/game/core/audioWarm.ts',
      body: `let ctx: AudioContext | null = null;

function make(): AudioContext | null {
  if (!ctx && typeof AudioContext !== 'undefined') {
    try { ctx = new AudioContext(); } catch { ctx = null; } // 소리를 못 쓰는 환경 — 조용히
  }
  return ctx;
}

/** 앱 시작 뒤 쉬는 틈에 상자만 만들어 둔다 (몸짓 밖이라 멈춘 채 — 비용 없음) */
export function warmAudioDevice(): void {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  const run = (): void => {
    if (ctx) return;
    const c = make();
    if (c?.state === 'running') void c.suspend(); // 혹시 돌고 있으면 게임을 열 때까지 재운다
  };
  window.setTimeout(() => (idle ? idle(run, { timeout: 4000 }) : run()), 1500);
}

/** 게임을 열 때 — 게임 카드를 누른 이벤트 안에서 부른다 */
export function wakeAudio(): void {
  const c = make();
  if (c?.state === 'suspended') void c.resume().catch(() => undefined);
}

/** 게임을 닫을 때 — 장치를 놓아 준다 */
export function sleepAudio(): void {
  if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
}`,
    },
    pitfalls: [
      { title: '게임마다 첫 클릭에 소리 상자를 만들면 첫 수가 0.3~0.4초 언다', fix: '이 사이트 모든 게임이 그랬다 — core/audioWarm.ts 로 홈에서 만들고 카드 누를 때 깨우게 고쳤다.', seen: true },
      { title: '몸짓 밖에서 resume 하면 아무 일도 안 일어난다', fix: '자동 재생 규칙 때문 — 반드시 클릭 · 터치 이벤트 처리 함수 안에서 부른다.' },
      { title: 'await resume() 을 기다린 뒤 화면을 넘기면 그만큼 늦어진다', fix: 'resume 은 void 로 던져 두고 화면은 바로 넘긴다 (비동기).' },
    ],
    next: ['i394'],
    refs: [{ name: 'MDN — AudioContext.resume()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume' }],
  },

  i387: {
    id: 'i387',
    summary: '풀이표 · 해법 표를 한 번에 만들어 화면이 0.4초 멈추던 것을, 프레임마다 10ms 씩 나눠 만들어 60fps 를 그대로 지키며 진행 막대를 보여 준다.',
    terms: [
      { en: 'Time slicing (chunked work)', ko: '일을 잘게 나눠 프레임마다 조금씩' },
      { en: 'Frame budget', ko: '한 프레임에 쓸 시간 예산 (10ms)' },
      { en: 'Generator function (yield)', ko: '멈췄다 이어 하는 함수 — 나눠 하기에 알맞다' },
      { en: 'Web Worker', ko: '다른 스레드에서 미리 만들기' },
    ],
    goal: '{target}을(를) 만드는 일을 프레임마다 10ms 씩 나눠 줘 — 한 조각이 끝나면 다음 프레임에 이어 하고, 그동안 화면은 60fps 로 움직이며 「{style}」 진행 표시를 보여 주기.',
    targets: ['게임 해법 표 · 풀이표', '퍼즐 판 만들기 (풀이기로 확인)', '큰 지도 · 길찾기 표'],
    styles: ['진행 막대 + 도는 표시', '「만드는 중」 글씨', '채워지는 칸 격자'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 코루틴에서 Stopwatch 로 시간을 재다 10ms 가 넘으면 yield return null, 또는 Job System 으로 다른 스레드에서.',
      godot: 'Godot 은 같은 루프에서 Time.get_ticks_usec() 로 재다 await get_tree().process_frame, 또는 WorkerThreadPool.',
    },
    principle: [
      '한 프레임은 16.7ms — 그 안에 그리기까지 끝나야 60fps 다. 400ms 짜리 일은 화면을 24프레임 동안 멈춘다.',
      '일을 작은 단위(칸 하나 · 상태 하나)로 쪼개 반복하고, 10ms 가 지나면 멈춘 뒤 다음 requestAnimationFrame 에 이어 한다.',
      '전체 일은 같다 — 400ms 일이면 40프레임에 걸쳐 끝난다. 대신 화면은 내내 살아 있다.',
      '더 무거우면 Web Worker 에서 미리 만들고 결과만 받는다.',
    ],
    when: ['게임을 열 때 · 판을 바꿀 때 표를 만드느라 화면이 멈출 때', '진행 막대를 보여 줄 수 있는 준비 시간'],
    avoid: ['10ms 안에 끝나는 일 — 나눌 필요 없다', '사람 차례마다 바로 답이 필요한 짧은 AI 계산 — 대신 미리 생각하기(i389) · 워커'],
    cost: 'light',
    costNote: '전체 일은 그대로, 가장 긴 프레임만 일 크기 → 10ms + 그리기로 준다. 조각 사이 이어 하기 비용은 거의 없다.',
    level: 2,
    must: [
      '한 조각 예산은 10ms (performance.now 로 재기) — 고정 횟수가 아니라 시간으로',
      '조각 사이에는 requestAnimationFrame 으로 화면에 차례를 넘긴다',
      '진행률을 보여 주고, 다 만들기 전에 표를 쓰지 않게 (Promise 로 끝을 알림)',
      '중간에 화면을 닫으면 멈출 수 있게 (취소 표시)',
      '전/후 가장 긴 프레임 ms 를 재서 보여 주기',
    ],
    done: [
      '「한 번에」 줄은 일하는 동안 도는 표시가 멈추고 프레임 그래프에 400ms 막대 하나 + 빈칸이 생긴다',
      '「나눠서」 줄은 프레임마다 +10ms 씩, 도는 표시가 계속 돌고 표 칸이 차례로 채워진다',
      '「진짜로 나눠서」를 누르면 가장 긴 프레임이 수십 ms 안으로 재진다',
    ],
    code: {
      lang: 'ts',
      title: '10ms 예산으로 나눠 만드는 도우미 (제너레이터)',
      from: '새로 씀 (demos/demosPerf.ts demo387 runChunks — 10ms 조각마다 requestAnimationFrame 과 같은 방식)',
      body: `/** 제너레이터 일을 프레임마다 budget ms 씩 — 끝나면 결과로 풀린다 */
function runSliced<T>(work: Generator<number, T>, onProgress: (p: number) => void, budget = 10): Promise<T> {
  return new Promise((resolve) => {
    const tick = (): void => {
      const t0 = performance.now();
      let r = work.next();
      while (!r.done && performance.now() - t0 < budget) r = work.next();
      if (r.done) resolve(r.value);
      else {
        onProgress(r.value); // yield 한 값 = 진행률 0~1
        requestAnimationFrame(tick); // 화면에 차례를 넘기고 다음 프레임에 이어서
      }
    };
    requestAnimationFrame(tick);
  });
}

// 쓰기 — 상태 하나 계산할 때마다 yield
function* buildTable(n: number): Generator<number, Float32Array> {
  const table = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    table[i] = solveState(i); // 무거운 계산 하나
    yield i / n;
  }
  return table;
}

const table = await runSliced(buildTable(50000), (p) => (bar.style.width = (p * 100).toFixed(0) + '%'));`,
    },
    pitfalls: [
      { title: '「100개씩」처럼 고정 횟수로 나누면 느린 폰에서는 조각이 다시 길어진다', fix: '횟수가 아니라 시간(10ms)으로 끊는다 — 기기 빠르기에 맞춰 조각 수가 저절로 바뀐다.' },
      { title: '조각 사이에 setTimeout(0) 만 쓰면 그리기 차례가 안 올 수 있다', fix: 'requestAnimationFrame 으로 넘겨야 그 사이 화면이 한 번 그려진다.' },
      { title: '표가 다 만들어지기 전에 AI 가 표를 읽으면 엉뚱한 수를 둔다', fix: 'Promise 가 풀린 뒤에만 쓰고, 그 전엔 「만드는 중」 표시.' },
    ],
    prev: ['i394'],
    next: ['i389', 'i384'],
    refs: [{ name: 'MDN — Web Workers API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API' }],
  },

  i389: {
    id: 'i389',
    summary: '사람 말이 움직이기 시작하는 순간 컴퓨터가 생각을 시작해, 말 이동 연출과 계산이 겹치게 하고 체감 대기를 계산 시간만큼 줄인다.',
    terms: [
      { en: 'Concurrent AI thinking (overlap with animation)', ko: '연출과 동시에 생각하기' },
      { en: 'Web Worker', ko: '다른 스레드 — 메인 화면을 막지 않고 계산' },
      { en: 'Perceived latency', ko: '체감 대기 — 사용자가 실제로 기다린다고 느끼는 시간' },
      { en: 'Promise.all', ko: '둘 다 끝날 때까지 기다리기' },
    ],
    goal: '{target}에서 컴퓨터가 「사람 말이 움직이기 시작하는 순간」 생각을 시작하게 바꿔 줘 — 계산은 워커에서, 이동 연출과 동시에. 둘 다 끝나면 컴퓨터 수를 두기. 기다리는 동안 {style}.',
    targets: ['체스 · 오목 같은 대결 게임', '컴퓨터와 두는 보드게임', '퍼즐 힌트 계산'],
    styles: ['「생각 중」 점 세 개', '말이 살짝 떠 있는 연출', '아무 표시 없이 자연스럽게'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Task.Run 으로 계산을 시작하고 이동 코루틴이 끝나면 결과를 기다린다 (Unity API 는 메인 스레드에서만).',
      godot: 'Godot 은 Thread 또는 WorkerThreadPool.add_task 로 계산을 시작하고, 이동 Tween 이 끝난 뒤 결과를 쓴다.',
    },
    principle: [
      '옛 순서: 말 이동(0.6초) → 끝난 뒤 계산(0.9초) — 체감 대기 0.9초.',
      '새 순서: 말이 움직이기 시작할 때 계산도 시작 — 체감 대기 = max(0, 계산 − 이동) = 0.3초.',
      '계산은 이동 연출을 막지 않게 워커(다른 스레드)에서 한다 — 메인에서 하면 연출이 멈춘다.',
      '둘 다 끝날 때(Promise.all) 컴퓨터 수를 보여 준다.',
    ],
    when: ['컴퓨터 차례마다 기다림이 길게 느껴질 때', '사람 수에 이동 · 잡기 연출이 있는 게임'],
    avoid: ['계산이 아주 짧은 게임(수십 ms) — 이미 연출 안에 끝난다', '사람 수가 확정되기 전(끌기 중)에 시작 — 수가 바뀌면 헛일 (대신 놓는 순간 시작)'],
    cost: 'light',
    costNote: '계산 양은 그대로, 순서만 바꾼다. 워커 하나를 띄우는 비용(처음 한 번)만 든다.',
    level: 1,
    must: [
      '사람 수가 확정되는 순간(놓기 · 누르기) 계산을 시작 — 연출을 기다리지 않기',
      '계산은 워커에서 (메인 스레드에서 하면 이동 연출이 멈춘다)',
      '이동 연출과 계산이 둘 다 끝나야 컴퓨터 수를 보이기',
      '판 상태는 복사해 넘기기 — 연출 중 판이 바뀌어도 계산이 흔들리지 않게',
      '전/후 체감 대기(이동이 끝난 뒤 기다린 시간)를 숫자로',
    ],
    done: [
      '위 줄(끝난 뒤 계산)은 「체감 대기 0.9초」, 아래 줄(동시에)은 「0.3초」로 보인다',
      '이동 · 계산 슬라이더를 바꾸면 아래 줄 대기 = max(0, 계산 − 이동) 으로 바뀐다',
      '계산이 이동보다 짧으면 아래 줄 대기가 0초가 된다',
    ],
    code: {
      lang: 'ts',
      title: '이동 연출과 생각을 동시에 시작',
      from: '새로 씀 (demos/demosPerf.ts demo389 의 「이동과 동시에 계산 (워커)」 순서)',
      body: `const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });

function think(board: number[]): Promise<number> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent<number>) => resolve(e.data);
    worker.postMessage(board.slice()); // 판을 복사해서 넘긴다
  });
}

async function onHumanMove(move: number): Promise<void> {
  board = apply(board, move);
  // 옛 순서: await animateMove(move); const reply = await think(board);  → 대기 = 계산 시간 전부
  const thinking = think(board);          // 1) 말이 움직이기 시작할 때 생각도 시작
  await animateMove(move);                // 2) 연출 (0.6초) — 그동안 워커가 계산
  showThinking(true);                     // 3) 남은 시간에만 「생각 중」
  const reply = await thinking;           //    대기 = max(0, 계산 − 연출)
  showThinking(false);
  board = apply(board, reply);
  await animateMove(reply);
}`,
    },
    pitfalls: [
      { title: '계산을 메인 스레드에서 동시에 돌리면 이동 연출이 멈춘다', fix: '「동시에」는 다른 스레드여야 한다 — 워커에서 돌린다.' },
      { title: '판 배열을 그대로 넘기고 연출 중 바꾸면 계산이 엉뚱한 판을 본다', fix: '복사본(slice)을 넘긴다. postMessage 도 복사하지만 메인 쪽 공유 배열은 조심.' },
      { title: '생각 중 표시를 처음부터 띄우면 오히려 더 오래 기다린 느낌이 든다', fix: '연출이 끝났는데 아직 계산 중일 때만 보여 준다.' },
    ],
    prev: ['i387'],
    next: ['i393'],
    refs: [{ name: 'MDN — Using Web Workers', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers' }],
  },

  i391: {
    id: 'i391',
    summary: '움직이지 않는 메시를 같은 재질끼리 한 덩어리로 합쳐, 물체 1,500개 · 그리기 1,500번을 재질 수만큼으로 줄인다 — 모양 · 색은 그대로.',
    terms: [
      { en: 'Static mesh merging (geometry batching)', ko: '고정 물체 합치기' },
      { en: 'Draw call', ko: '그리기 호출 — 물체 · 재질 하나마다 한 번' },
      { en: 'BufferGeometryUtils.mergeGeometries', ko: 'three.js 기하 합치기 도구' },
      { en: 'renderer.info.render.calls', ko: '그리기 호출 수 재기' },
    ],
    goal: '{target}의 움직이지 않는 메시를 같은 재질끼리 하나로 합쳐 줘 — 위치는 세계 좌표로 구워 넣고, 이름 · userData 가 있는 움직일 물체는 건드리지 말기. 그리기 호출 수 · 한 장면 CPU ms 를 전/후로 {style}.',
    targets: ['3D 퍼즐 무대 (판 · 담 · 장식)', '블록으로 쌓은 마을', '숲 · 울타리 · 돌 같은 배경'],
    styles: ['숫자 표로 보여 주기', '합친 묶음마다 색을 칠해 보여 주기', '화면 구석 작은 HUD'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 물체를 Static 으로 표시하면 Static Batching 이 빌드 때 합친다 (실행 중엔 StaticBatchingUtility.Combine).',
      godot: 'Godot 은 SurfaceTool 로 메시를 직접 합치거나, 같은 모양이면 MultiMeshInstance3D 로.',
    },
    principle: [
      'three.js 는 물체마다 행렬 갱신 · 화면 안 검사 · 재질 바꾸기 · 그리기 호출을 한다 — 물체 수가 CPU 시간이다.',
      '고정된 메시의 꼭짓점을 세계 행렬로 옮겨 하나의 BufferGeometry 에 이어 붙이면 물체 하나가 된다 (법선은 법선 행렬로).',
      '재질이 다르면 합칠 수 없다 — 재질(+ 그림자 설정)마다 한 덩어리.',
      '견본: 상자 1,500개 · 재질 8가지 → 메시 8개, 그리기 호출 1,500 → 8.',
      '이 사이트는 shared/bake.ts mergeStatic(root, keep) 으로 퍼즐 무대마다 합친다.',
    ],
    when: ['같은 재질의 작은 고정 물체가 수백 개 넘는 무대', 'renderer.info.render.calls 가 수백 ~ 천을 넘을 때'],
    avoid: ['따로 움직이거나 고를 물체 — 합치면 하나만 움직일 수 없다 (userData.dynamic 으로 빼기)', '같은 모양이 수천 개면 — 대신 인스턴싱(InstancedMesh)이 메모리가 적다'],
    cost: 'light',
    costNote: '합치기는 판을 지을 때 한 번(꼭짓점 복사). 메모리는 같은 모양을 여럿 복사한 만큼 늘어난다.',
    level: 2,
    must: [
      '합치는 묶음 열쇠 = 재질 + castShadow · receiveShadow + 꼭짓점 속성 종류',
      '위치는 matrixWorld 로, 법선은 getNormalMatrix 로 옮겨 넣고 normalize',
      '이름 · userData 가 있는 물체 · 인스턴스 · 뼈대 · 투명 · 직접 짠 셰이더 재질은 건드리지 않기',
      '전/후 그리기 호출 수와 한 장면 CPU 시간을 재서 보여 주기 (화면은 픽셀까지 같아야)',
    ],
    done: [
      '끔 쪽은 칸이 하나씩 차례로 밝아지고(1,500번), 켬 쪽은 재질 묶음째 한 번에 밝아진다(80번)',
      '「진짜로 재기」를 누르면 이 기기에서 그리기 호출 1500 → 8, 한 장면 CPU ms 가 줄어든 값이 나온다',
      '합친 뒤 화면을 찍어 전과 비교하면 같다',
    ],
    code: {
      lang: 'ts',
      title: '메시 여러 개 → 세계 좌표로 구워 하나로',
      from: 'demos/demosPerf.ts mergeMeshes() · measureMerge()',
      body: `function mergeMeshes(meshes: THREE.Mesh[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  let off = 0;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    nm.getNormalMatrix(m.matrixWorld); // 법선은 법선 행렬로 (늘인 물체도 맞게)
    const p = m.geometry.getAttribute('position');
    const n = m.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
    }
    const ix = m.geometry.getIndex();
    if (ix) for (let j = 0; j < ix.count; j++) idx.push(ix.getX(j) + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  return out;
}

// 재질마다 한 덩어리: 1,500개(재질 8) → 메시 8개
for (let k = 0; k < mats.length; k++) {
  const group = meshes.filter((m) => m.material === mats[k]);
  group.forEach((m) => m.removeFromParent());
  scene.add(new THREE.Mesh(mergeMeshes(group), mats[k]));
}
// 확인: renderer.render(scene, cam); console.log(renderer.info.render.calls);`,
    },
    pitfalls: [
      { title: '물체 1,000 ~ 1,700개를 하나씩 그리면 CPU 가 막혀 느리다', fix: '이 사이트 새 퍼즐 게임 대부분이 그랬다 — mergeStatic 으로 합쳐 그리기 호출이 594 → 324, 887 → 262 처럼 줄었다.', seen: true },
      { title: '움직일 물체까지 합치면 코드가 찾던 물체가 사라진다', fix: '이름 · userData 가 있는 물체와 그 아래는 건드리지 않는다. 움직이는 묶음은 userData.dynamic 으로 표시하고 그 안만 따로.', seen: true },
      { title: '물체 자기 좌표를 쓰는 셰이더 재질을 합치면 무늬가 어긋난다', fix: '직접 짠 셰이더는 빼고, 세계 좌표만 쓰는 것만 material.userData.mergeSafe 로 표시해 합친다.', seen: true },
      { title: '합친 기하를 판을 바꿀 때 안 버리면 메모리가 계속 는다', fix: '새로 만든 기하는 목록에 모았다가 판을 바꿀 때 dispose (mergeStatic 의 keep).' },
    ],
    prev: ['u36'],
    next: ['u81', 'i478'],
    refs: [{ name: 'three.js 문서 — BufferGeometryUtils', url: 'https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils' }],
  },

  i393: {
    id: 'i393',
    summary: '컴퓨터 차례에 누른 것을 버리지 않고 줄에 세워 두었다가, 차례가 오자마자 처리해 「다시 눌러야 하는」 답답함을 없앤다.',
    terms: [
      { en: 'Input buffering (input queue)', ko: '입력 줄 세우기 — 잠긴 동안 누른 것 기억' },
      { en: 'Input lock', ko: '입력 잠금 — 상대 차례 · 연출 중' },
      { en: 'Turn-based state machine', ko: '차례 상태 기계' },
    ],
    goal: '{target}에서 컴퓨터 차례(입력 잠금) 동안 누른 것을 버리지 말고 마지막 하나를 기억해 줘 — 「상대가 생각 중이에요」를 보여 주고, 차례가 오면 바로 그 수를 처리. 분위기는 {style}.',
    targets: ['컴퓨터와 두는 대결 게임', '연출이 긴 카드 게임', '빠른 손 퍼즐'],
    styles: ['기억한 칸에 옅은 표시', '짧은 안내 띠', '아무 표시 없이 조용히'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '잠긴 동안 누름을 그냥 버리면, 사용자는 눌렀는데 안 됐다고 느끼고 차례가 온 뒤 다시 눌러야 한다.',
      '잠긴 동안 누른 것을 「대기 줄」에 하나 기억하고, 「상대가 생각 중이에요」를 보여 준다.',
      '차례가 오는 순간 대기 줄을 꺼내 바로 처리한다 — 그 수가 이제도 둘 수 있는지 다시 검사.',
      '견본: 생각 1.2초 · 0.6초에 누름 — 끔은 다시 누르기까지 기다림, 켬은 생각이 끝나자 0.05초 뒤 바로.',
    ],
    when: ['빠르게 누르는 사용자가 「씹혔다」고 느낄 때', '상대 차례 · 연출이 0.5초 넘게 걸리는 게임'],
    avoid: ['상대 수를 보고 판단해야 하는 수 — 미리 누른 수가 위험할 수 있다 (대신 기억한 수를 표시만 하고 확정은 한 번 더)', '실시간 액션 — 대신 짧은 입력 버퍼(몇 프레임)'],
    cost: 'light',
    costNote: '변수 하나 · 검사 한 번. 비용 없음.',
    level: 1,
    must: [
      '잠긴 동안 누름은 마지막 하나만 기억 (여러 개 쌓지 않기)',
      '차례가 오면 기억한 수가 아직 둘 수 있는지 다시 검사하고, 안 되면 조용히 버리기',
      '기억하는 동안 「상대가 생각 중이에요」 같은 안내와 기억한 칸 표시',
      '판을 새로 시작하거나 게임을 닫으면 대기 줄을 비우기',
    ],
    done: [
      '끔 줄은 생각 중 누른 손가락이 무시되고 「다시 누름」 뒤에야 말이 움직인다',
      '켬 줄은 「기억해 둠」 막대가 생기고 생각이 끝나자마자 말이 움직인다',
      '누르는 때 슬라이더를 생각 시간보다 늦게 하면 둘이 같아진다',
    ],
    code: {
      lang: 'ts',
      title: '잠긴 동안 누른 것을 기억했다가 차례가 오면 처리',
      from: '새로 씀 (demos/demosPerf.ts demo393 의 「눌러 둔 것을 줄에 세워 두고 차례가 오면 바로」)',
      body: `let locked = false;            // 컴퓨터 차례 · 연출 중
let queued: number | null = null; // 잠긴 동안 누른 칸 (마지막 하나만)

function onTap(cell: number): void {
  if (locked) {
    queued = cell;
    showHint('상대가 생각 중이에요');
    markQueued(cell); // 기억한 칸에 옅은 표시
    return;
  }
  play(cell);
}

async function computerTurn(): Promise<void> {
  locked = true;
  const reply = await think(board);
  board = apply(board, reply);
  await animateMove(reply);
  locked = false;
  // 차례가 오자마자 — 아직 둘 수 있는 칸인지 다시 검사
  const q = queued;
  queued = null;
  markQueued(-1);
  if (q !== null && isLegal(board, q)) play(q);
}

function resetGame(): void {
  queued = null; // 새 판에는 넘기지 않는다
}`,
    },
    pitfalls: [
      { title: '잠긴 동안 누름을 모두 쌓으면 차례가 오자 여러 수가 한꺼번에 나간다', fix: '마지막 하나만 기억한다.' },
      { title: '기억한 칸이 컴퓨터 수로 차 버렸는데 그대로 두면 오류가 난다', fix: '꺼낼 때 isLegal 로 다시 검사하고, 안 되면 버린다.' },
      { title: '이유 없이 입력을 막으면 사용자는 고장이라고 느낀다', fix: '막힌 입력에는 까닭(「상대가 생각 중이에요」)을 보여 준다 — 이 사이트의 「차례는 판 위에 크게」 규칙.', seen: true },
    ],
    prev: ['i389'],
    next: ['i418'],
  },

  i394: {
    id: 'i394',
    summary: 'PerformanceObserver 로 50ms 넘는 긴 작업을 잡아 프레임 시간 그래프 아래 빨간 막대로 그려, 무엇이 화면을 멈추는지 눈으로 찾게 한다.',
    terms: [
      { en: 'Long Tasks API (PerformanceObserver "longtask")', ko: '50ms 넘는 메인 스레드 작업 알림' },
      { en: 'Frame time graph', ko: '프레임마다 걸린 ms 막대' },
      { en: 'Jank / hitch', ko: '화면 멈칫' },
      { en: 'performance.now', ko: '정밀 시계' },
    ],
    goal: '{target}에 긴 작업 찾기 도구를 붙여 줘 — 프레임마다 걸린 ms 를 막대 그래프(16.7 · 50 · 200ms 기준선)로, PerformanceObserver 로 잡은 50ms 넘는 긴 작업을 그 아래 빨간 칸으로. 최근 5초, {style}.',
    targets: ['개발 중인 게임 화면 구석', '성능 점검 페이지', '느린 폰 시험'],
    styles: ['어두운 개발자 그래프', '작은 HUD', '크게 보는 분석 화면'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Profiler 창(CPU Usage) 의 Timeline 보기 — 폰은 Development Build + Autoconnect Profiler.',
      godot: 'Godot 은 디버거의 Profiler · Monitors 탭 (프레임 시간 · 물리 시간).',
    },
    principle: [
      '60fps 면 프레임마다 16.7ms. requestAnimationFrame 사이 시간을 재서 막대로 그리면 멈춘 프레임이 높이 솟는다.',
      '브라우저는 메인 스레드 일이 50ms 를 넘으면 「longtask」 기록을 남긴다 — PerformanceObserver 로 시작 시각 · 길이를 받는다.',
      '프레임 막대와 긴 작업 칸을 같은 시간 축(최근 5초)에 그리면 어느 일이 멈춤을 만들었는지 맞대 볼 수 있다.',
      '40ms 일 열 번은 긴 작업이 아니다 — 하나하나가 50ms 를 안 넘기 때문 (프레임은 그래도 떨어진다).',
    ],
    when: ['화면이 가끔 멈칫하는데 원인을 모를 때', '고친 뒤 정말 나아졌는지 전/후로 잴 때'],
    avoid: ['배포판 화면에 늘 띄우기 — 개발 모드에서만', '사파리 — longtask 를 지원하지 않는다 (supportedEntryTypes 로 확인하고 프레임 그래프만)'],
    cost: 'light',
    costNote: '관찰자 하나 · 최근 5초 기록. 그래프 그리기만 프레임마다 조금.',
    level: 1,
    must: [
      'PerformanceObserver.supportedEntryTypes 에 longtask 가 있을 때만 observe — 없으면 프레임 그래프만',
      '기록은 최근 5초만 남기고 지우기',
      '기준선 16.7 · 50 · 200ms 와 50ms 넘는 막대 위에 ms 숫자',
      '화면을 닫을 때 observer.disconnect()',
    ],
    done: [
      '「0.3초 멈추기」를 누르면 프레임 그래프에 300ms 막대가 솟고, 아래에 빨간 긴 작업 칸이 같은 자리에 생긴다',
      '「40ms 열 번」은 막대가 여럿 솟지만 긴 작업 칸은 안 생긴다',
      'longtask 를 모르는 브라우저에서도 오류 없이 프레임 그래프는 그려진다',
    ],
    code: {
      lang: 'ts',
      title: '긴 작업 잡기 + 프레임 시간 기록',
      from: 'demos/demosPerf.ts demo394() 를 정리',
      body: `const WIN = 5000; // 최근 5초
const frames: { t: number; d: number }[] = [];
const longs: { s: number; d: number }[] = [];
let lastNow = 0;
let obs: PerformanceObserver | null = null;

try {
  if ((PerformanceObserver.supportedEntryTypes ?? []).includes('longtask')) {
    obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longs.push({ s: e.startTime, d: e.duration }); // 50ms 넘는 일
    });
    obs.observe({ type: 'longtask', buffered: false });
  }
} catch { /* 지원 안 함 — 프레임 그래프만 */ }

function sample(): void {
  const tn = performance.now();
  if (lastNow) frames.push({ t: tn, d: tn - lastNow }); // 이번 프레임에 걸린 ms
  lastNow = tn;
  while (frames.length && frames[0].t < tn - WIN) frames.shift();
  while (longs.length && longs[0].s + longs[0].d < tn - WIN) longs.shift();
  // 그리기: x = (t − (tn − WIN)) / WIN, 막대 높이 = d (16.7 · 50 · 200ms 기준선)
  requestAnimationFrame(sample);
}
requestAnimationFrame(sample);

// 닫을 때: obs?.disconnect();`,
    },
    pitfalls: [
      { title: '사파리에서 observe({ type: \'longtask\' }) 를 바로 부르면 오류가 난다', fix: 'supportedEntryTypes 로 먼저 확인하고 try 로 감싼다.' },
      { title: '긴 작업 칸만 보면 40ms 짜리 잦은 멈춤을 놓친다', fix: '프레임 시간 그래프를 함께 본다 — 33ms 넘는 막대가 줄지어 있으면 그것도 문제.' },
      { title: '헤드리스 측정값은 다른 일 때문에 흔들린다', fix: '두 번 재서 비교한다 (이 사이트 perfscan 측정에서 겪음).', seen: true },
    ],
    prev: ['i384'],
    next: ['i387', 'i386'],
    refs: [
      { name: 'MDN — PerformanceLongTaskTiming', url: 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming' },
      { name: 'MDN — PerformanceObserver', url: 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver' },
    ],
  },

  i478: {
    id: 'i478',
    summary: '거리에 따라 정밀 → 중간 → 단순 모델로 바꾸고 텍스처 크기를 정해, 폰에서도 삼각형 수 · GPU 메모리 · 받을 크기를 예산 안에 맞춘다.',
    terms: [
      { en: 'Level of detail (THREE.LOD)', ko: '거리별 모델 단계' },
      { en: 'Texture memory budget', ko: '텍스처 메모리 예산 — 너비 × 높이 × 4바이트 × 밉맵 4/3' },
      { en: 'renderer.info.render.triangles', ko: '이번 장면에 그린 삼각형 수' },
      { en: 'Mipmaps', ko: '멀리 볼 때 쓰는 작은 그림 단계' },
    ],
    goal: '{target}에 LOD 와 텍스처 예산을 넣어 줘 — 모델을 정밀 · 중간 · 단순 3단계로 만들어 거리 0 · 9 · 22 에서 바꾸고, 텍스처는 256 · 512 · 1024 중 고르게. 삼각형 수 · GPU 메모리 · 받을 크기 표를 {style}(으)로.',
    targets: ['기둥이 늘어선 복도', '나무 · 바위가 많은 들판', '폰용 3D 게임 장면'],
    styles: ['단계마다 색(초록 · 노랑 · 빨강)', '실제 재질 그대로', '숫자 표만 크게'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 LODGroup 컴포넌트(화면 비율로 단계), 텍스처는 가져오기 설정 Max Size · 플랫폼별 덮어쓰기.',
      godot: 'Godot 4 는 메시 가져올 때 자동 LOD 를 만들고, 직접 바꾸려면 GeometryInstance3D 의 visibility_range_begin / end.',
    },
    principle: [
      '멀리 있는 물체는 화면에서 몇 픽셀뿐 — 삼각형 수천 개가 필요 없다.',
      'THREE.LOD 에 단계를 addLevel(메시, 거리) 로 넣으면, 렌더러가 카메라 거리로 하나만 보이게 한다 (autoUpdate).',
      '견본 기둥: 정밀(둘레 96 · 세로 40 · 홈 16) · 중간(20 · 8) · 단순(6 · 1), 거리 0 · 9 · 22.',
      '텍스처 GPU 메모리 = 너비 × 높이 × 4바이트 × 4/3(밉맵). 1024² 한 장 ≈ 5.3MB, 6장이면 32MB — 512² 로 줄이면 1/4.',
    ],
    when: ['같은 모델이 멀리까지 수십 개 늘어선 장면', '폰에서 메모리 부족 · 다운로드가 큰 3D 게임'],
    avoid: ['위에서 내려다보는 판 게임 — 모든 물체가 거의 같은 거리라 바뀔 일이 없다', '단계가 바뀌는 순간이 눈에 띄는 아주 가까운 물체 — 대신 처음부터 가벼운 모델'],
    cost: 'light',
    costNote: 'LOD 는 거리 계산뿐. 메모리는 단계 모델만큼 조금 늘지만, 그리는 삼각형 · 텍스처 메모리는 크게 준다.',
    level: 2,
    must: [
      '단계는 3개 — 정밀 · 중간 · 단순, 바꾸는 거리는 화면에서 크기가 반쯤 줄 때마다',
      '모든 단계의 겉모양(크기 · 색 · 위치)이 같아야 바뀌는 순간이 안 보인다',
      '텍스처는 폰에서 1024 이하, 한 장면 GPU 메모리를 숫자로 표시 (너비 × 높이 × 4 × 4/3)',
      '「LOD 쓰기」 끔이면 모두 정밀 — 전/후 삼각형 수 비교',
      '텍스처를 바꿀 때 예전 것을 dispose',
    ],
    done: [
      '단계 색 보기를 켜면 가까운 기둥은 초록 · 중간은 노랑 · 먼 것은 빨강으로, 카메라가 움직이면 색이 바뀐다',
      '「LOD 쓰기」를 끄면 삼각형 수가 크게 늘어난다 (표에 「LOD 끄면 기둥만 …개」)',
      '텍스처 크기 0 · 1 · 2 를 바꾸면 GPU MB · 받을 MB 가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '3단계 LOD + 텍스처 메모리 계산',
      from: 'demos/demosRender.ts makeLod() 를 정리',
      body: `// 정밀 · 중간 · 단순 기하 (lodColumn(둘레 칸, 세로 칸, 홈 수))
const geos = [lodColumn(96, 40, 16), lodColumn(20, 8, 0), lodColumn(6, 1, 0)];
const DIST = [0, 9, 22];

for (let k = 0; k < 22; k++) {
  const lod = new THREE.LOD();
  lod.position.set(k % 2 ? 3.8 : -3.8, 0, 6 - Math.floor(k / 2) * 5.6);
  for (let i = 0; i < 3; i++) lod.addLevel(new THREE.Mesh(geos[i], mats[i]), DIST[i]);
  scene.add(lod); // 렌더러가 카메라 거리로 단계를 고른다 (lod.autoUpdate = true)
}

// 텍스처 GPU 메모리 — RGBA 4바이트 × 밉맵 4/3
const gpuMB = (size: number, count: number): number => (count * size * size * 4 * (4 / 3)) / 1048576;
console.log(gpuMB(1024, 6).toFixed(1), 'MB'); // 32.0
console.log(gpuMB(512, 6).toFixed(1), 'MB');  // 8.0

// 그린 뒤 확인
renderer.render(scene, camera);
const { triangles, calls } = renderer.info.render;`,
    },
    pitfalls: [
      { title: '단계마다 색 · 크기가 조금씩 다르면 바뀌는 순간 「툭」 튄다', fix: '같은 재질 · 같은 바깥 크기로 만들고, 바꾸는 거리를 화면 크기가 충분히 작아진 뒤로.' },
      { title: '텍스처를 다 받기 전에 그리면 첫 프레임이 멈칫한다', fix: '받은 뒤 GPU 에 올리고(텍스처 업로드) · 셰이더를 데운 뒤 보이게 (견본은 「텍스처 올리는 중 · 셰이더 굽는 중」 단계).', seen: true },
      { title: '텍스처 크기만 보고 메모리를 어림하면 밉맵 몫을 빠뜨린다', fix: '× 4/3 을 곱한다 — 1024² 는 4MB 가 아니라 약 5.3MB.' },
    ],
    prev: ['i391', 'i232'],
    next: ['u81'],
    refs: [
      { name: 'three.js 예제 — webgl_lod', url: 'https://threejs.org/examples/#webgl_lod' },
      { name: 'three.js 문서 — LOD', url: 'https://threejs.org/docs/#api/en/objects/LOD' },
    ],
  },

  i439: {
    id: 'i439',
    summary: '온라인 대전에서 내 수를 누르자마자 흐리게 판에 보여 주고 서버 확인이 오면 진하게, 거절되면 되돌려 지연을 느끼지 않게 한다.',
    terms: [
      { en: 'Optimistic update (client-side prediction)', ko: '먼저 보여 주고 확인 — 지연 숨기기' },
      { en: 'Server authority / acknowledgement', ko: '서버가 정하고 확인을 보냄' },
      { en: 'Rollback', ko: '거절되면 되돌리기' },
      { en: 'Round-trip time (RTT)', ko: '왕복 지연 = 한 방향 지연 × 2' },
    ],
    goal: '{target}에서 내 수를 낙관적으로 먼저 보여 줘 — 누르자마자 흐리게(확인 대기) 판에 놓고, 서버 확인이 오면 진하게, 거절되면 되돌리며 짧은 안내. 지연 50 ~ 800ms 에서 {style}.',
    targets: ['온라인 틱택토 · 오목', '온라인 카드 게임', '함께 칠하는 그림판'],
    styles: ['보통 와이파이', '느린 모바일 데이터', '아주 느린 연결'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '서버 답을 기다렸다 그리면 누른 뒤 왕복 지연(한 방향 × 2)만큼 아무 일도 없다 — 260ms 면 0.5초.',
      '누르는 순간 내 수를 「확인 대기」 상태(흐리게)로 판에 놓고, 서버로 보낸다.',
      '서버가 받아 순서를 매기면 「확인」을 보내고, 그때 진하게 굳힌다.',
      '그 사이 상대 수가 서버에 먼저 도착해 칸이 찼다면 서버는 「거절」 — 흐린 수를 지우고 상대 수를 놓는다.',
    ],
    when: ['차례제 온라인 대전에서 누른 뒤 반응이 굼뜰 때', '거절될 일이 드문 수 (내 차례에 빈칸 두기)'],
    avoid: ['돈 · 아이템처럼 되돌리면 안 되는 일 — 대신 확인 뒤에만 보여 주고 「보내는 중」 표시', '거절이 잦은 실시간 경쟁 — 되돌림이 자주 보여 오히려 혼란 (대신 서버 순서 정하기 i442)'],
    cost: 'light',
    costNote: '수마다 「대기 중」 표시 하나. 네트워크 양은 같다.',
    level: 2,
    must: [
      '누르는 순간 판에 흐리게(대기) 놓기 — 서버 답을 기다리지 않기',
      '서버 확인이 오면 진하게, 거절이 오면 지우고 「거절 → 되돌렸어요」 안내',
      '판 상태의 진짜 주인은 서버 — 거절 뒤에는 서버가 보낸 수로 맞추기',
      '지연 슬라이더(50 ~ 800ms) 와 「지연 숨기기」 켬/끔으로 비교',
    ],
    done: [
      '켬: 누르자마자 X 가 흐리게 보이고, 지연 뒤 「확인됨 ✓」과 함께 진해진다',
      '끔: 누른 뒤 모래시계만 돌다 왕복 지연 뒤에야 X 가 보인다',
      '거절 상황에서는 흐린 X 가 사라지고(되돌림 ↶) 상대 O 가 놓인다, 오른쪽 메시지 흐름 그림에 순서가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '먼저 보여 주고 · 확인 · 거절이면 되돌리기',
      from: '새로 씀 (demos/demosMusicNet.ts demoPredict() 의 흐름: set(wait=true) → 확인 ✓ / 거절 ✕ → undo)',
      body: `type Cell = { p: 'X' | 'O'; wait: boolean } | null;
const board: Cell[] = Array(9).fill(null);

function onTap(i: number): void {
  if (board[i] || !myTurn) return;
  board[i] = { p: 'X', wait: true }; // 1) 바로 흐리게 — 확인 대기
  render();
  send({ type: 'move', cell: i });   // 2) 서버로
}

// 3) 서버 답
function onServer(msg: { type: 'ack' | 'reject' | 'move'; cell: number; p?: 'X' | 'O' }): void {
  const c = board[msg.cell];
  if (msg.type === 'ack' && c?.wait) board[msg.cell] = { p: c.p, wait: false }; // 진하게 굳히기
  if (msg.type === 'reject' && c?.wait) {
    board[msg.cell] = null;            // 되돌리기
    toast('거절 → 되돌렸어요');
  }
  if (msg.type === 'move' && msg.p) board[msg.cell] = { p: msg.p, wait: false }; // 서버가 정한 수가 진짜
  render(); // wait 인 칸은 옅게 (globalAlpha 0.45 등)
}`,
    },
    pitfalls: [
      { title: '거절됐는데 흐린 수를 그대로 두면 두 화면의 판이 달라진다', fix: '거절이 오면 반드시 지우고, 서버가 보낸 수로 판을 맞춘다 — 판의 주인은 서버.' },
      { title: '확인 대기 수를 진한 수와 똑같이 그리면 거절될 때 「버그」로 보인다', fix: '대기 중엔 흐리게 · 작은 시계 표시로 구별한다.' },
      { title: '지연 0 인 개발 서버에서만 시험하면 문제를 못 본다', fix: '지연을 일부러 넣어(200 ~ 800ms) 두 탭으로 시험한다.', seen: true },
    ],
    next: ['i442', 'i440'],
  },

  i440: {
    id: 'i440',
    summary: '연결이 끊긴 사이 놓친 수가 있어도, 다시 접속할 때 서버에서 판 전체와 차례를 받아 화면을 맞추고 이어 하게 한다.',
    terms: [
      { en: 'Reconnection with state resync', ko: '다시 접속 + 상태 다시 맞추기' },
      { en: 'Authoritative snapshot', ko: '서버가 가진 판 전체 사진' },
      { en: 'Move sequence number', ko: '수 번호 — 어디까지 받았는지 (#3)' },
      { en: 'online / offline events', ko: '브라우저 연결 상태 알림' },
    ],
    goal: '{target}에 다시 접속을 넣어 줘 — 끊기면 판을 흐리게 덮고 「연결 중…」, 다시 붙으면 마지막으로 받은 수 번호를 보내고 서버에서 판 전체 + 차례를 받아 그대로 맞추기. 끊김 0.6 ~ 3초에서 {style}.',
    targets: ['온라인 보드게임 방', '긴 대국 (체스 · 바둑)', '여럿이 하는 카드 게임'],
    styles: ['잠깐 끊긴 와이파이', '지하철 같은 잦은 끊김', '앱을 내렸다 올림'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '끊긴 사이에도 상대는 둔다 — 그 수를 서버는 받았지만 내 화면은 못 받는다.',
      '다시 붙었을 때 「연결 OK」만 받으면 내 판은 서버 판과 다른 채로 남는다 (판 어긋남).',
      '다시 접속하면 「마지막으로 받은 수 #3」을 알리고, 서버는 판 전체 + 지금 차례를 보낸다.',
      '받은 판으로 내 화면을 통째로 덮어쓴 뒤에야 입력을 연다.',
    ],
    when: ['폰으로 하는 온라인 대전 — 와이파이 · 데이터 바뀜이 잦다', '한 판이 몇 분 넘게 걸리는 게임'],
    avoid: ['아주 짧은 판(몇 초) — 대신 끊기면 판을 끝내고 새로 매칭', '서버가 판을 저장하지 않는 구조 — 먼저 서버(데이터베이스)에 판을 두어야 한다'],
    cost: 'light',
    costNote: '다시 접속할 때만 판 전체(작은 JSON) 한 번. 평소 비용 없음.',
    level: 2,
    must: [
      '끊긴 동안 판을 흐리게 덮고 「끊김… / 연결 중…」 표시, 입력 막기',
      '다시 접속하면 판 전체 + 차례를 받아 통째로 맞추기 (놓친 수를 하나씩 맞추려 하지 않기)',
      '맞춘 뒤 「이어서 ✓ 내 차례」처럼 지금 누구 차례인지 크게',
      '「판 전체 받기」 켬/끔으로 어긋남 비교',
    ],
    done: [
      '켬: 끊긴 사이 상대가 둔 수(✕로 놓친 메시지)가 다시 접속하자 판에 나타나고 「판 맞춤 ✓」',
      '끔: 다시 접속해도 상대 수가 없고 「판이 서버와 달라요!」',
      '큰 화면에서는 내 화면과 서버 판을 나란히 보여 줘 같아지는 순간이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '끊김 → 연결 중 → 판 전체 받아 맞추기',
      from: '새로 씀 (demos/demosMusicNet.ts demoReconnect() 의 흐름: 다시 접속 · 마지막 #3 → 판 전체 + 차례 → copyFrom)',
      body: `let lastSeq = 0;          // 마지막으로 받은 수 번호
let status: 'on' | 'off' | 'connecting' = 'on';

function onMove(msg: { seq: number; cell: number; p: 'X' | 'O' }): void {
  board[msg.cell] = msg.p;
  lastSeq = msg.seq;
  render();
}

function onDisconnect(): void {
  status = 'off';
  showVeil('끊김…'); // 판을 흐리게 덮고 입력 막기
}

async function onReconnect(): Promise<void> {
  status = 'connecting';
  showVeil('연결 중…');
  // 놓친 수를 하나씩 맞추지 말고, 서버 판 전체를 받아 덮어쓴다
  const snap = await request({ type: 'resync', since: lastSeq }); // → { board, turn, seq }
  board = snap.board.slice();
  myTurn = snap.turn === me;
  lastSeq = snap.seq;
  status = 'on';
  hideVeil();
  toast(myTurn ? '이어서 ✓ 내 차례' : '이어서 ✓ 상대 차례');
  render();
}`,
    },
    pitfalls: [
      { title: '다시 접속 때 「연결됨」만 확인하면 놓친 수 때문에 판이 어긋난다', fix: '판 전체 + 차례를 받아 통째로 맞춘다.' },
      { title: '판을 맞추기 전에 입력을 열면 옛 판 위에 수를 둔다', fix: '판을 덮어쓴 뒤에 입력을 연다. 그동안은 흐린 덮개 + 「연결 중…」.' },
      { title: '공유 개발 서버는 다른 작업 때문에 자꾸 다시 불러와져 끊김 시험이 엉킨다', fix: '고정된 사본 · HMR 끈 서버 · 두 탭으로 시험한다 (이 사이트 두 탭 시험법).', seen: true },
    ],
    prev: ['i439'],
    next: ['i441', 'i443'],
    refs: [{ name: 'MDN — Window: online event', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event' }],
  },

  i441: {
    id: 'i441',
    summary: '핑 · 퐁으로 내 기기 시계와 서버 시계 차이를 재서, 차례 남은 시간을 서버 마감 시각 기준으로 보여 주고 초과하면 서버가 자동 처리한다.',
    terms: [
      { en: 'Clock offset estimation (Cristian\'s algorithm)', ko: '시계 차이 재기 — 서버 시각 − (보낸 때 + 받은 때) / 2' },
      { en: 'Server-authoritative deadline', ko: '서버 시각으로 정한 마감' },
      { en: 'Turn timer / timeout', ko: '차례 시계 · 시간 초과' },
      { en: 'Clock skew', ko: '기기마다 다른 시계 어긋남' },
    ],
    goal: '{target}에 차례 시계를 넣어 줘 — 서버가 마감 시각을 정해 보내고, 내 화면은 핑 · 퐁으로 잰 시계 차이로 보정해 남은 시간을 보여 주기. 시간이 다 되면 서버가 자동 수를 두고 두 화면에 알리기. {style}.',
    targets: ['온라인 빠른 대국', '온라인 퀴즈 대결', '차례제 카드 게임'],
    styles: ['둥근 시계 고리', '줄어드는 막대', '숫자만 크게'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Netcode for GameObjects 는 NetworkManager.ServerTime(NetworkTime) 이 서버 시각을 맞춰 준다.',
    },
    principle: [
      '기기 시계는 몇 초씩 어긋나 있을 수 있다 — 내 시계로 마감을 세면 화면마다 남은 시간이 다르다.',
      '핑: 보낸 때 t1(내 시계) → 서버가 자기 시각 S 를 담아 퐁 → 받은 때 t2. 차이 = S − (t1 + t2) / 2.',
      '서버는 「마감 = 서버 지금 + 5초」를 보낸다. 내 화면 남은 시간 = 마감 − (내 시계 + 차이).',
      '시간 초과 판정은 서버만 한다 — 서버가 자동 수를 두고 두 쪽에 알린다. 내 화면이 0초여도 스스로 처리하지 않는다.',
    ],
    when: ['차례마다 제한 시간이 있는 온라인 게임', '두 사람 화면의 남은 시간이 달라 다툼이 날 때'],
    avoid: ['혼자 하는 게임 — 내 시계(performance.now)면 충분', '프레임 단위 동기가 필요한 실시간 액션 — 더 정밀한 시간 동기(여러 번 재서 평균)가 필요'],
    cost: 'light',
    costNote: '핑 · 퐁 한 번(작은 메시지 둘). 여러 번 재서 왕복이 가장 짧은 것을 쓰면 더 정확.',
    level: 2,
    must: [
      '마감은 서버 시각으로 정해 보내기 — 「남은 5초」가 아니라 「마감 시각」',
      '시계 차이 = S − (t1 + t2) / 2, 차이를 재기 전에는 「맞추는 중…」',
      '시간 초과 처리는 서버만 — 내 화면은 0초에서 멈춰 기다리기',
      '「서버 시각으로 보정」 켬/끔과 「내 기기 시계 차이 −3 ~ +3초」 조절로 비교',
    ],
    done: [
      '시계 차이 +1.5초에서 보정 끔이면 내 화면 고리가 서버 고리보다 1.5초 먼저 0 이 되고 「내 화면만 0초?」',
      '보정 켬이면 두 고리가 함께 줄고 함께 0 이 된다',
      '시간이 다 되면 서버가 「시간 초과 → 자동 수」를 두 쪽에 보내고 판에 자동 수가 놓인다',
    ],
    code: {
      lang: 'ts',
      title: '핑 · 퐁으로 시계 차이 재기 + 서버 마감 기준 남은 시간',
      from: 'demos/demosMusicNet.ts demoClock() 의 offset 계산 · myLeft 를 정리',
      body: `let offset: number | null = null; // 서버 시각 − 내 시계 (초)
let deadline = -1;                  // 서버 시각으로 정한 마감

const myClock = (): number => Date.now() / 1000;

async function syncClock(): Promise<void> {
  const t1 = myClock();
  const S = await request({ type: 'ping' }); // 서버가 자기 시각을 담아 퐁
  const t2 = myClock();
  offset = S - (t1 + t2) / 2; // 왕복의 가운데에 서버가 S 였다고 본다
}

function onTurn(msg: { deadline: number }): void {
  deadline = msg.deadline; // 「남은 5초」가 아니라 「서버 시각 몇 초까지」
}

function secondsLeft(): number {
  const serverNow = myClock() + (offset ?? 0);
  return Math.max(0, deadline - serverNow); // 0 이 돼도 스스로 처리하지 않는다
}

// 시간 초과는 서버가 판단해 { type: 'timeout', autoMove } 를 두 쪽에 보낸다`,
    },
    pitfalls: [
      { title: '「남은 5초」를 보내면 받는 데 걸린 지연만큼 화면마다 다르다', fix: '남은 시간이 아니라 서버 시각으로 된 마감을 보낸다.' },
      { title: '내 화면이 0초가 됐다고 스스로 수를 두면 서버와 판이 갈린다', fix: '시간 초과는 서버만 판단하고, 화면은 서버 알림을 기다린다.' },
      { title: '핑을 한 번만 재면 그때 지연이 길었을 때 차이가 크게 틀린다', fix: '여러 번 재서 왕복(t2 − t1)이 가장 짧았던 것을 쓴다.' },
    ],
    prev: ['i440'],
    next: ['i442'],
    refs: [{ name: 'Wikipedia — Cristian\'s algorithm', url: 'https://en.wikipedia.org/wiki/Cristian%27s_algorithm' }],
  },

  i442: {
    id: 'i442',
    summary: '두 사람이 거의 동시에 같은 칸에 둔 수를 서버에 먼저 「도착한」 순서로 정해, 늦은 쪽은 거절 · 되돌려 두 화면의 판을 같게 만든다.',
    terms: [
      { en: 'Server-side ordering (first-arrival wins)', ko: '서버 도착 순서로 정하기' },
      { en: 'Race condition', ko: '거의 동시에 일어나 결과가 순서에 달린 상황' },
      { en: 'Transaction / compare-and-set', ko: '「비어 있으면 쓰기」를 한 번에 — Firebase runTransaction 등' },
      { en: 'Reject and rollback', ko: '늦은 쪽 거절 · 되돌림' },
    ],
    goal: '{target}에서 두 사람이 거의 동시에 같은 칸에 두면 서버 하나가 순서를 정하게 해 줘 — 먼저 도착한 수만 받고, 늦은 쪽은 「거절 · 이미 차지됨」으로 되돌리기. 두 화면과 서버 순서표를 {style}(으)로.',
    targets: ['온라인 칸 차지 게임', '선착순 단추 · 빠른 퀴즈', '함께 놓는 블록 판'],
    styles: ['두 화면 나란히', '메시지 흐름 그림', '간단한 순서표'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '두 사람이 0.04초 차이로 같은 칸을 누르면 각자 화면에는 자기 수가 먼저 보인다 (낙관적 표시).',
      '누가 먼저 「보냈는지」가 아니라 서버에 먼저 「도착한」 것이 이긴다 — 지연이 짧은 쪽이 유리할 수 있다.',
      '서버는 도착하는 대로 칸이 비었는지 보고 차지(#1 ✓), 이미 찼으면 거절(#2 ✕).',
      '이긴 쪽에는 「확인」, 진 쪽에는 「거절」 + 이긴 수를 보내 두 화면을 같게 맞춘다.',
    ],
    when: ['차례 없이 동시에 두는 실시간 게임', '선착순 · 먼저 누르기 대결'],
    avoid: ['차례제 게임 — 차례 검사로 충분하다 (상대 차례 수는 처음부터 거절)', '서버 없이 두 기기끼리만(P2P) — 순서를 정할 주인이 없다'],
    cost: 'light',
    costNote: '수마다 서버 검사 한 번 · 거절 메시지 하나. 데이터베이스 트랜잭션이면 다툼이 있을 때 다시 시도가 생긴다.',
    level: 2,
    must: [
      '순서는 서버 하나가 정한다 — 「비어 있으면 차지」를 한 번에(트랜잭션)',
      '늦은 쪽은 거절 메시지를 받고 흐린 수를 지운 뒤 이긴 수를 놓기',
      '이긴 쪽 · 진 쪽 화면이 끝에 같은 판이 되는지 나란히 보여 주기',
      '내 지연 · 상대 지연 슬라이더로 「먼저 보낸 쪽이 지는」 경우도 보이게',
    ],
    done: [
      '두 화면 모두 ⑤ 칸에 자기 수를 흐리게 놓았다가, 서버 순서표 #1 ✓ · #2 ✕ 에 따라 같은 수로 바뀐다',
      '내 지연을 길게 하면 내가 먼저 보내도 상대가 이긴다',
      '진 쪽 화면에 「되돌림 ↶」이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '서버 — 먼저 도착한 수만 받기',
      from: '새로 씀 (demos/demosMusicNet.ts demoRace() 의 arrive() 와 같은 규칙)',
      body: `// 서버 쪽 (한 방의 판). 메시지는 도착한 순서대로 하나씩 처리된다
const cells: ('X' | 'O' | null)[] = Array(9).fill(null);
let seq = 0;

function onArrive(from: Player, cell: number): void {
  if (cells[cell] === null) {
    cells[cell] = from.mark;
    seq++;
    sendTo(from, { type: 'ack', cell, seq });                     // 이긴 쪽: 확인 ✓
    sendTo(other(from), { type: 'move', cell, p: from.mark, seq }); // 상대에게 알림
  } else {
    // 늦게 도착 — 이미 차지됨. 이긴 수를 함께 보내 화면을 맞추게
    sendTo(from, { type: 'reject', cell, p: cells[cell] });
  }
}

// Firebase 실시간 DB 라면 같은 일을 트랜잭션으로:
// runTransaction(ref(db, 'rooms/' + id + '/cells/' + cell), (cur) => (cur === null ? mark : undefined));
// undefined 를 돌려주면 쓰기를 그만둔다 → 진 쪽`,
    },
    pitfalls: [
      { title: '각자 화면에서 「내가 먼저 눌렀다」로 정하면 두 화면이 서로 다른 판이 된다', fix: '순서는 서버 하나가 정하고, 화면은 서버 결과로 맞춘다.' },
      { title: '「읽고 → 비었으면 쓰기」를 두 번에 나눠 하면 둘 다 비었다고 읽고 둘 다 쓴다', fix: '트랜잭션(compare-and-set) 한 번으로 한다.' },
      { title: '진 쪽에 거절만 보내고 이긴 수를 안 보내면 그 칸이 빈 채로 남는다', fix: '거절과 함께 그 칸의 진짜 수를 보낸다.' },
    ],
    prev: ['i439', 'i441'],
    next: ['i443'],
  },

  i443: {
    id: 'i443',
    summary: '상대가 보내는 숨결(0.8초마다)과 상태 신호로 「보는 중 · 생각 중 · 자리 비움 · 나감」을 점과 글로 보여 줘, 상대가 사라졌는지 기다리는지 알게 한다.',
    terms: [
      { en: 'Presence (online status)', ko: '상대 상태 — 접속 · 활동 여부' },
      { en: 'Heartbeat', ko: '숨결 — 살아 있다는 짧은 신호를 주기적으로' },
      { en: 'onDisconnect (Firebase)', ko: '끊기면 서버가 대신 「나감」을 적는 예약' },
      { en: 'Visibility API (document.hidden)', ko: '탭이 숨었는지 — 자리 비움 판단' },
    ],
    goal: '{target}에 상대 상태 표시를 넣어 줘 — 보는 중(초록) · 생각 중(노랑, 상대가 보는 칸에 옅은 표시) · 자리 비움(회색) · 나감(빨강)을 상대 카드의 점과 글로. 창을 닫으면 서버가 끊김을 알아채 「상대 나감」. {style}.',
    targets: ['온라인 대전 방', '함께 푸는 퍼즐', '여럿이 하는 보드게임'],
    styles: ['상대 카드 위 점', '판 옆 작은 띠', '말풍선'],
    platforms: ['web', 'unity', 'godot'],
    principle: [
      '상대 기기는 상태가 바뀔 때마다 서버에 알린다 — 생각 중(판을 보며 고민) · 자리 비움(탭 숨김) · 다시 보는 중.',
      '연결된 동안 0.8초마다 숨결(♥)을 보내, 서버가 「살아 있다」를 안다.',
      '창을 닫으면 알릴 틈이 없다 — 서버가 연결이 끊긴 것을 알아채(Firebase onDisconnect 처럼) 「나감」을 대신 알린다.',
      '내 화면은 받은 상태를 점 색 · 글로 보여 주고, 생각 중일 땐 상대가 보는 칸에 옅은 표시.',
    ],
    when: ['온라인 대전에서 상대가 안 둘 때 기다릴지 나갈지 몰라 답답할 때', '방에서 누가 준비됐는지 보여야 할 때'],
    avoid: ['개인 정보 — 상대가 보는 칸까지 보여 주는 것은 게임에 따라 「훔쳐보기」가 될 수 있다 (켜고 끄기)', '숨결을 너무 자주(매 프레임) — 서버 요금 · 배터리'],
    cost: 'light',
    costNote: '0.8초마다 작은 숨결 하나 + 상태가 바뀔 때만 알림.',
    level: 1,
    must: [
      '상태 네 가지 — 보는 중 #7dffb2 · 생각 중 #ffd36b · 자리 비움 #8d97b8 · 나감 #ff5d6c, 점 + 글로',
      '연결된 동안 0.8초마다 숨결, 끊기면 서버가 「나감」을 대신 알림',
      '살아 있는 상태(보는 중 · 생각 중)는 점이 숨 쉬듯 깜빡',
      '「상대가 보는 칸 보여 주기」 켜고 끄기',
    ],
    done: [
      '상대가 생각 중이면 점이 노랗게 깜빡이고 빈칸 위에 옅은 표시가 돌아다닌다',
      '자리 비움이면 회색, 「상대 나가기」를 누르면 지연 뒤 서버의 「끊김 감지」를 거쳐 빨간 「나감」',
      '메시지 흐름 그림에 숨결 ♥ 가 0.8초마다 보이다 나가면 멈춘다',
    ],
    code: {
      lang: 'ts',
      title: '상태 알리기 · 숨결 · 끊기면 서버가 「나감」',
      from: '새로 씀 (demos/demosMusicNet.ts demoPresence() 의 tell · 숨결 0.8초 · leave 흐름)',
      body: `type Pres = 'watch' | 'think' | 'away' | 'gone';
const PRES: Record<Pres, { label: string; col: string }> = {
  watch: { label: '보는 중', col: '#7dffb2' },
  think: { label: '생각 중', col: '#ffd36b' },
  away: { label: '자리 비움', col: '#8d97b8' },
  gone: { label: '나감', col: '#ff5d6c' },
};

// 내 상태 알리기 (바뀔 때만)
let mine: Pres = 'watch';
const tell = (p: Pres): void => {
  if (p === mine) return;
  mine = p;
  send({ type: 'presence', p });
};
document.addEventListener('visibilitychange', () => tell(document.hidden ? 'away' : 'watch'));
board.addEventListener('pointermove', () => tell('think')); // 판 위에서 고민 중

// 숨결 — 연결된 동안 0.8초마다
const beat = setInterval(() => send({ type: 'beat' }), 800);

// Firebase 실시간 DB 라면 끊김은 서버가 대신 적는다:
// onDisconnect(ref(db, 'rooms/' + id + '/presence/' + me)).set('gone');

// 상대 상태 받기 → 카드의 점 색 · 글
function onPresence(p: Pres): void {
  dot.style.background = PRES[p].col;
  label.textContent = PRES[p].label;
}`,
    },
    pitfalls: [
      { title: '창을 닫을 때 「나감」을 보내려 하면 대부분 못 보낸다', fix: '서버 쪽 끊김 감지(onDisconnect · 숨결이 끊긴 지 몇 초)로 대신 알린다.' },
      { title: '마우스가 움직일 때마다 상태를 보내면 메시지가 폭주한다', fix: '상태가 실제로 바뀔 때만 보내고, 칸 위치는 0.5초에 한 번쯤으로 줄인다.' },
      { title: '「나감」을 바로 판 끝으로 처리하면 잠깐 끊긴 사람이 진다', fix: '나감 뒤 몇 초는 다시 접속(i440)을 기다린다.' },
    ],
    prev: ['i440', 'i442'],
    next: ['i439'],
    refs: [{ name: 'MDN — Page Visibility API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API' }],
  },

  u51: {
    id: 'u51',
    summary: '폰은 devicemotion 센서의 중력 방향으로 화면 속 중력을 바꾸고 흔들림을 받아, PC 는 끌기 · 방향키 · 빠른 손짓으로 같은 값을 만들어 준다.',
    terms: [
      { en: 'DeviceMotionEvent.accelerationIncludingGravity', ko: '중력을 포함한 기기 가속도 (m/s²)' },
      { en: 'Tilt control', ko: '기울이기 조작 — 중력 방향으로 굴리기' },
      { en: 'Shake detection', ko: '흔들기 — 가속도가 크게 튀는 것' },
      { en: 'DeviceMotionEvent.requestPermission (iOS)', ko: '아이폰은 누름 안에서 센서 허락 받기' },
    ],
    goal: '{target}에 기기 기울이기 · 흔들기를 넣어 줘 — 폰은 devicemotion 의 중력 방향으로 화면 속 중력을 바꾸고, 센서가 없는 PC 는 누른 채 끌기 · 방향키로 기울이고 빠르게 흔드는 손짓으로 흔들기. {style}.',
    targets: ['구슬 굴리기 퍼즐', '물이 기울어지는 체험', '흔들어 섞는 레벨'],
    styles: ['세워 든 폰', '책상에 눕힌 폰', 'PC 마우스 · 방향키'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Input.acceleration (단위 g, 세워 들면 (0, −1, 0)) — 이 사이트의 SEVEN 이식이 이 값을 그대로 흉내 낸다.',
      godot: 'Godot 은 Input.get_accelerometer() / Input.get_gravity() (모바일).',
    },
    principle: [
      'accelerationIncludingGravity 는 m/s² — 9.81 로 나누면 g. 안드로이드 크롬은 유니티와 부호가 반대라 −1/9.81, 아이폰 사파리는 +1/9.81.',
      '기울기 = 중력 방향. 화면 속 물체에 그 방향으로 힘을 준다 (견본: gx = sin(기울기) × 2.4).',
      '센서가 1.5초 넘게 안 오면 PC 로 보고 흉내를 켠다: 누른 자리에서 끈 쪽(300px 이면 한껏) · 방향키로 기울기.',
      '흔들기는 최근 손 자리 3개로 속도 두 개를 구해 그 차이 ÷ 시간 = 가속도, 8000 px/s² 를 1g 로.',
      '목표 기울기로 부드럽게 따라간다 (프레임마다 차이의 1/6) — 진짜 폰처럼.',
    ],
    when: ['폰을 기울여 굴리는 퍼즐 · 체험', '원작(유니티)이 Input.acceleration 을 쓰는 게임을 옮길 때'],
    avoid: ['PC 가 주 사용자인 게임에 센서만 — 반드시 PC 대체 조작을 함께', '가로 고정 화면에서 x · y 를 그대로 쓰기 — 화면 방향(screen.orientation.angle)에 맞게 돌려야 한다'],
    cost: 'light',
    costNote: '센서 이벤트는 초당 60번쯤 · 계산 몇 줄. 배터리 영향 작음.',
    level: 2,
    must: [
      '아이폰은 첫 누름 안에서 DeviceMotionEvent.requestPermission() — 몸짓 밖에서 부르면 막힌다',
      '부호 맞추기: 안드로이드 −1/9.81, iOS +1/9.81 (세워 들면 (0, −1, 0) 이 되게)',
      '센서가 1.5초 안 오면 PC 흉내 — 끌기 300px = 한껏 기울임, 방향키, 놓으면 기본 자세로',
      '기울기는 목표로 부드럽게 따라가기 (한 번에 튀지 않게)',
      'PC 에서 쓰는 방법을 화면에 안내 (「누른 채 끌기 · 방향키」)',
    ],
    done: [
      '폰을 기울이면 화면 속 구슬이 그쪽으로 구르고 벽에 닿으면 튕긴다',
      '흔들면 구슬이 튀고 「흔들!」 표시',
      'PC 에서 방향키 · 누른 채 끌기로 같은 기울기, 빠르게 문지르면 흔들기',
    ],
    code: {
      lang: 'ts',
      title: '센서 → g 단위 가속도 · PC 는 끌기 · 방향키 · 손짓 흔들기',
      from: 'src/game/games/seven/engine/motion.ts Motion 을 줄임',
      body: `const PX_PER_G = 8000; // 화면 px/초² → g
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
let sensorAt = 0;
let accel = { x: 0, y: -1 };          // 결과 (세워 든 폰 = 0, −1)
const tilt = { x: 0, y: -1 };
const samples: { x: number; y: number; t: number }[] = []; // 누른 동안 손 자리

window.addEventListener('devicemotion', (e) => {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null) return;
  sensorAt = performance.now();
  const k = ios ? 1 / 9.81 : -1 / 9.81; // 브라우저마다 부호가 반대
  accel = { x: a.x * k, y: a.y * k };
});

// 첫 누름 안에서 — 아이폰 허락
const askPermission = (): void => {
  const D = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  if (D?.requestPermission) void D.requestPermission().catch(() => undefined);
};

function update(held: boolean, start: { x: number; y: number } | null, keys: Set<string>): void {
  if (performance.now() - sensorAt < 1500) return; // 센서가 있으면 흉내는 쉰다
  let ax = 0, ay = 0;
  if (held && samples.length >= 3) { // 흔들기: 속도 두 개의 차이 ÷ 시간
    const [a, b, c] = samples.slice(-3);
    const t1 = Math.max(1e-3, b.t - a.t), t2 = Math.max(1e-3, c.t - b.t);
    ax = ((c.x - b.x) / t2 - (b.x - a.x) / t1) / ((t1 + t2) / 2) / PX_PER_G;
    ay = ((c.y - b.y) / t2 - (b.y - a.y) / t1) / ((t1 + t2) / 2) / PX_PER_G;
  }
  let want = { x: 0, y: -1 };
  const last = samples[samples.length - 1];
  if (held && start && last) { // 끈 방향 (300px 이면 한껏)
    const dx = (last.x - start.x) / 300, dy = (last.y - start.y) / 300, len = Math.hypot(dx, dy);
    if (len > 0.05) want = { x: dx / Math.max(1, len), y: dy / Math.max(1, len) };
  }
  const kx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const ky = (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
  if (kx || ky) want = { x: kx / Math.hypot(kx, ky), y: ky / Math.hypot(kx, ky) };
  tilt.x += (want.x - tilt.x) / 6; // 부드럽게 따라가기
  tilt.y += (want.y - tilt.y) / 6;
  accel = { x: tilt.x + ax, y: tilt.y + ay };
}`,
    },
    pitfalls: [
      { title: '아이폰에서 아무 값도 안 온다', fix: 'iOS 13+ 는 DeviceMotionEvent.requestPermission() 을 사용자 누름 안에서 불러야 센서가 켜진다.', seen: true },
      { title: '브라우저마다 가속도 부호가 반대라 구슬이 거꾸로 구른다', fix: '안드로이드 크롬은 −1/9.81, 아이폰 사파리는 +1/9.81 로 맞춘다 (SEVEN 이식에서 겪음).', seen: true },
      { title: 'PC 에는 센서가 없어 기울이기 레벨을 못 깬다', fix: '누른 채 끌기 · 방향키 · 빠르게 문지르기로 같은 값을 만든다. 레벨마다 기본 자세(세움/눕힘)도 정한다.', seen: true },
      { title: '센서 값을 바로 쓰면 손 떨림으로 화면이 덜덜 떤다', fix: '목표 값으로 프레임마다 조금씩 따라가게(1/6) 부드럽게.' },
    ],
    prev: ['u79'],
    next: ['i422'],
    refs: [{ name: 'MDN — DeviceMotionEvent', url: 'https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent' }],
  },

  u79: {
    id: 'u79',
    summary: '누른 화면 점에서 카메라 광선(Raycaster)을 쏘아 맞은 3D 말을 고르고, setPointerCapture 로 손가락이 판 밖에 나가도 끌기가 이어지게 한다.',
    terms: [
      { en: 'Pointer Events + setPointerCapture', ko: '포인터 이벤트 · 붙잡기 — 밖으로 나가도 move · up 을 계속 받음' },
      { en: 'THREE.Raycaster.setFromCamera', ko: '화면 점 → 카메라 광선' },
      { en: 'NDC (normalized device coordinates)', ko: '화면 좌표를 −1 ~ 1 로' },
      { en: 'Ray–plane intersection', ko: '광선이 판(바닥) 높이와 만나는 점' },
    ],
    goal: '{target}에서 3D 말 고르기 · 끌기를 만들어 줘 — pointerdown 에서 Raycaster 로 맞은 말을 고르고 setPointerCapture, pointermove 에서는 광선이 판 높이와 만나는 점으로 칸 좌표를 구해 옮기고, pointerup 에서 가까운 칸에 붙이기. 조작감은 {style}.',
    targets: ['3D 판 위 차 · 블록 밀기', '3D 체스 말 옮기기', '3D 장면의 물체 고르기'],
    styles: ['칸에 착 붙는 퍼즐', '자유롭게 끄는 체험', '마우스 · 터치 모두'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Camera.ScreenPointToRay + Physics.Raycast, 끌기는 IBeginDragHandler · IDragHandler (EventSystem 이 붙잡기를 해 준다).',
      godot: 'Godot 은 Camera3D.project_ray_origin · project_ray_normal 로 광선을 만들고 PhysicsDirectSpaceState3D.intersect_ray.',
    },
    principle: [
      '화면 점을 NDC 로: x = (clientX − left) / width × 2 − 1, y = −((clientY − top) / height × 2 − 1).',
      'raycaster.setFromCamera(ndc, camera) 후 intersectObjects(고를 것들) — 첫 번째가 가장 가까운 것.',
      '끄는 동안은 물체 대신 판 높이(y = 0.4) 평면과 광선이 만나는 점을 쓴다: t = (0.4 − 원점.y) / 방향.y.',
      'pointerdown 에서 setPointerCapture(pointerId) 하면 손가락이 캔버스 밖으로 나가도 move · up 이 그 요소로 온다.',
      'pointerId 를 기억해 다른 손가락의 move · up 은 무시한다.',
    ],
    when: ['3D 판 위 물체를 누르고 끄는 모든 게임', '판 밖으로 손이 나가도 끌기가 끊기면 안 될 때'],
    avoid: ['물체가 아주 많고 삼각형이 많은 모델 — 대신 보이지 않는 단순 상자로 고르거나 BVH(i67)', '2D 캔버스 게임 — 광선 없이 좌표 계산으로'],
    cost: 'light',
    costNote: '누를 때 광선 한 번 · 끌 때 평면 계산 한 번. 고를 대상만 배열로 넘기면 빠르다.',
    level: 1,
    must: [
      'pointer 이벤트(pointerdown · move · up · cancel)로 마우스 · 터치를 함께 — touch / mouse 이벤트 따로 쓰지 않기',
      'pointerdown 에서 setPointerCapture, pointerId 로 같은 손가락만 받기',
      '이미 끄는 손가락이 있으면 두 번째 손가락은 무시 (끌던 것이 칸 사이에 멈추지 않게)',
      '광선 대상은 고를 메시 배열만 (외곽선 껍데기 · 장식 제외)',
      '캔버스 CSS 에 touch-action: none (브라우저 스크롤 · 확대가 끌기를 가로채지 않게)',
    ],
    done: [
      '말을 누르면 광선이 그 말에 닿아 들리고, 끌면 손가락을 따라간다',
      '끄는 도중 판 밖(캔버스 밖)으로 나갔다 돌아와도 끌기가 끊기지 않는다',
      '놓으면 가장 가까운 칸에 착 붙는다',
      '폰에서 두 손가락이 닿아도 끌던 말이 멈추지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '광선으로 고르기 · 붙잡기 · 판 높이 평면으로 끌기',
      from: 'src/game/games/parking/ParkingGame.ts onDown · onMove · onUp + parking/stage.ts setRay · groundCell 을 줄임',
      body: `const ray = new THREE.Raycaster();
const hits: THREE.Object3D[] = []; // 고를 메시만 (userData.car = 번호)

function setRay(clientX: number, clientY: number): void {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
}
function pick(clientX: number, clientY: number): number {
  setRay(clientX, clientY);
  const h = ray.intersectObjects(hits, false)[0];
  return h ? (h.object.userData['car'] as number) : -1;
}
/** 화면 점 → 판 위(y = 0.4) 점 */
function ground(clientX: number, clientY: number): THREE.Vector3 | null {
  setRay(clientX, clientY);
  const t = (0.4 - ray.ray.origin.y) / ray.ray.direction.y;
  return t > 0 ? ray.ray.at(t, new THREE.Vector3()) : null;
}

let drag: { car: number; id: number; grab: THREE.Vector3; start: THREE.Vector3 } | null = null;
const el = renderer.domElement;
el.style.touchAction = 'none';
el.addEventListener('pointerdown', (e) => {
  if (drag) return; // 이미 끄는 손가락이 있으면 무시
  const car = pick(e.clientX, e.clientY);
  const g = ground(e.clientX, e.clientY);
  if (car < 0 || !g) return;
  drag = { car, id: e.pointerId, grab: g, start: cars[car].position.clone() };
  el.setPointerCapture(e.pointerId); // 밖으로 나가도 move · up 을 받는다
});
el.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const g = ground(e.clientX, e.clientY);
  if (g) cars[drag.car].position.copy(drag.start).add(g.sub(drag.grab));
});
el.addEventListener('pointerup', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  snapToCell(drag.car); // 가까운 칸에 붙이기
  drag = null;
});`,
    },
    pitfalls: [
      { title: '두 번째 손가락이 끌기를 덮어쓰면 끌던 차가 칸 사이에 멈춘다', fix: '이미 끄는 중이면 다른 pointerId 는 무시한다 (빵빵 주차장에서 겪음).', seen: true },
      { title: 'setPointerCapture 없이 끌면 손가락이 캔버스 밖으로 나가는 순간 끌기가 끊긴다', fix: 'pointerdown 에서 붙잡는다 — up · cancel 때 저절로 풀린다.' },
      { title: '합성 이벤트로만 시험하면 실제 손가락 · 마우스에서 생기는 버그를 놓친다', fix: '실제 클릭 · 끌기(Playwright mouse · 실제 폰)로 끝까지 풀어 본다.', seen: true },
      { title: 'touch-action 을 안 끄면 폰에서 끌 때 화면이 스크롤된다', fix: '캔버스에 touch-action: none.' },
    ],
    prev: ['i425'],
    next: ['i67', 'i419'],
    refs: [
      { name: 'three.js 문서 — Raycaster', url: 'https://threejs.org/docs/#api/en/core/Raycaster' },
      { name: 'MDN — Element.setPointerCapture()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture' },
    ],
  },

  i418: {
    id: 'i418',
    summary: '보이는 단추보다 누름 영역을 넓히고 그 안에서 가장 가까운 단추 하나를 골라, 작은 칸이 많은 폰 화면에서도 손가락이 놓치지 않게 한다.',
    terms: [
      { en: 'Touch target expansion (hit slop)', ko: '누름 영역 넓히기' },
      { en: 'Nearest-target picking', ko: '가장 가까운 것 고르기' },
      { en: 'Minimum touch target size (44pt · 48dp)', ko: '권장 최소 누름 크기' },
      { en: 'Fitts\'s law', ko: '목표가 작고 멀수록 누르기 어렵다' },
    ],
    goal: '{target}의 누름 판정을 넓혀 줘 — 보이는 단추 반지름 11px 에 누름 영역을 +14px 더하고, 누른 점에서 가장 가까운 단추 하나만 고르기. 넓힌 영역은 점선 테두리로 {style}.',
    targets: ['작은 칸이 많은 폰 퍼즐', '점 잇기 · 별 누르기', '작은 아이콘 단추 줄'],
    styles: ['보이게 (설명용)', '숨기고 (실제 게임)', '누를 때만 잠깐'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 Image 의 Raycast Padding(음수면 넓어짐)으로 누름 영역만 키운다.',
      godot: 'Godot 은 Control 의 크기를 키우고 그림은 가운데 작게 두거나, 직접 가장 가까운 것을 찾는다.',
    },
    principle: [
      '손가락이 누르는 넓이는 지름 1cm 쯤 — 반지름 11px 단추는 화면에서 너무 작다.',
      '누른 점에서 모든 단추 가운데까지 거리를 재고 가장 가까운 하나를 고른다.',
      '그 거리가 「보이는 반지름 + 넓힌 만큼(pad)」 안이면 잡음, 아니면 놓침.',
      '단추 사이가 가까우면 영역이 겹쳐도 「가장 가까운 것 하나」라 둘이 같이 눌리지 않는다.',
    ],
    when: ['폰에서 칸 · 점이 작아 자꾸 빗나갈 때', '어린 아이가 하는 게임'],
    avoid: ['단추가 서로 아주 붙어 있고 둘 다 위험한 동작(지우기 · 확인) — 대신 단추 자체를 크게, 간격을 넓게', '넓힌 영역이 판 밖 다른 단추와 겹칠 때 — 영역을 판 안으로 자르기'],
    cost: 'light',
    costNote: '누를 때 단추 수만큼 거리 계산. 단추 수백 개도 순식간.',
    level: 1,
    must: [
      '판정은 「가장 가까운 것 하나」 + 「거리 ≤ 반지름 + pad」 — 사각형 겹침 판정 아님',
      '누른 순간(down)에 고르고, 뗄 때(up) 확정',
      '넓힌 영역 크기를 조절할 수 있게 (0 ~ 30px, 기본 14)',
      '놓쳤을 때 ✕ 를 누른 자리에 잠깐 보여 주기',
    ],
    done: [
      '끔: 단추 그림 밖을 누르면 ✕ 「놓침 — 단추 밖」',
      '켬: 단추 둘레 점선 안을 누르면 가장 가까운 단추가 잡히고, 누른 점에서 단추로 점선이 이어진다',
      '「가장 가까운 단추 가운데까지 …px · 누름 영역 반지름 25px」 숫자가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '가장 가까운 단추 + 넓힌 반지름 판정',
      from: 'demos/demosInput.ts i418 pick() · down · up',
      body: `const R = 11;   // 보이는 단추 반지름
let pad = 14;  // 넓힌 만큼
const buttons: { x: number; y: number }[] = [];

function pick(x: number, y: number): { i: number; d: number } {
  let best = -1;
  let bd = 1e9;
  buttons.forEach((b, i) => {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return { i: bd <= R + pad ? best : -1, d: bd }; // 영역 밖이면 놓침
}

let pressed = -1;
canvas.addEventListener('pointerdown', (e) => {
  const p = toCanvas(e); // 캔버스 좌표로
  pressed = pick(p.x, p.y).i;
});
canvas.addEventListener('pointerup', (e) => {
  const p = toCanvas(e);
  if (pressed >= 0) toggle(pressed);
  else showMiss(p.x, p.y); // 누른 자리에 ✕
  pressed = -1;
});`,
    },
    pitfalls: [
      { title: '영역을 넓혀 사각형 겹침으로 판정하면 두 단추가 함께 눌린다', fix: '가장 가까운 하나만 고른다.' },
      { title: '넓힌 영역이 보이지 않아 사용자가 「엉뚱한 게 눌렸다」고 느낀다', fix: '누를 때 잡힌 단추를 바로 빛내 어느 것이 골라졌는지 보여 준다.' },
      { title: '폰 화면 크기에서 확인하지 않으면 PC 에선 괜찮던 단추가 폰에서 너무 작다', fix: '가로 폰 844×390 에서 단추 · 글씨 크기를 꼭 확인한다 (이 사이트 규칙).', seen: true },
    ],
    prev: ['i393'],
    next: ['i425', 'i421'],
    refs: [{ name: 'Wikipedia — Fitts\'s law', url: 'https://en.wikipedia.org/wiki/Fitts%27s_law' }],
  },

  i419: {
    id: 'i419',
    summary: '끌기를 시작해 8px 움직인 순간 가로 · 세로 중 많이 움직인 쪽으로 축을 잠가, 손이 비스듬히 휘어도 블록이 다른 줄로 엇나가지 않게 한다.',
    terms: [
      { en: 'Drag axis locking', ko: '끌기 축 잠금' },
      { en: 'Drag threshold', ko: '축을 정하는 문턱 거리 (8px)' },
      { en: 'Grid snapping', ko: '놓으면 칸에 맞추기' },
      { en: 'Damped spring', ko: '감쇠 스프링으로 칸에 착' },
    ],
    goal: '{target}에 끌기 축 잠금을 넣어 줘 — 누른 뒤 8px 움직이는 순간 |dx| ≥ |dy| 면 가로, 아니면 세로로 잠그고 그 축으로만 따라가기. 놓으면 가장 가까운 칸에 스프링으로 착. 잠긴 축은 {style}.',
    targets: ['슬라이드 퍼즐 블록', '줄 칠하기 (한 줄 끌기)', '주차장 차 · 장난감 상자 블록'],
    styles: ['점선 띠로 보여 주기', '블록 위 「가로 잠금 →」 글씨', '표시 없이 조용히'],
    platforms: ['canvas', 'three', 'web', 'unity', 'godot'],
    principle: [
      '사람 손은 옆으로 끌어도 아래로 조금씩 휜다 — 축이 없으면 블록이 비스듬히 다른 줄로 간다.',
      '누른 점에서 움직인 거리가 문턱(8px)을 넘는 순간, 그때까지 많이 움직인 쪽을 축으로 정한다.',
      '그 뒤로는 축 성분만 따른다: 가로면 x = 시작 x + dx, y 는 그대로.',
      '놓으면 가장 가까운 칸으로 감쇠 스프링(k = 260, 감쇠비 0.72)으로 끌려가 착 붙는다.',
    ],
    when: ['가로 · 세로로만 움직이는 블록 · 차', '한 줄을 따라 칠하는 퍼즐'],
    avoid: ['자유롭게 끄는 카드 · 조각 — 대신 놓을 자리 미리 보기(i424)', '대각선도 되는 판 — 축을 넷 이상으로 나누거나 잠그지 않기'],
    cost: 'light',
    costNote: '움직일 때 비교 몇 번. 비용 없음.',
    level: 1,
    must: [
      '축은 문턱(기본 8px, 2 ~ 30 조절)을 처음 넘는 순간 한 번만 정하고, 놓을 때까지 바꾸지 않기',
      '|dx| ≥ |dy| 면 가로 — 같으면 가로',
      '판 범위로 자르기 (첫 칸 ~ 마지막 칸)',
      '놓으면 반올림한 칸으로 스프링 착 — 순간 이동 아님',
    ],
    done: [
      '끔: 옆으로 끄는데 손이 아래로 휘면 블록이 기울며 「비스듬히!」, 놓으면 「엇나감 — 다른 줄로」',
      '켬: 8px 뒤 「가로 잠금 →」 점선 띠가 생기고 블록이 같은 줄에서만 움직인다',
      '「처음 움직임 dx · dy」 숫자로 왜 그 축이 됐는지 보인다',
    ],
    code: {
      lang: 'ts',
      title: '문턱을 넘는 순간 축 정하기 → 그 축으로만',
      from: 'demos/demosInput.ts i419 move() · up() · step()',
      body: `let lock = 8; // 축을 정하는 문턱 (px)
let drag: { id: number; sx: number; sy: number; bx0: number; by0: number; axis: 'x' | 'y' | null } | null = null;

function onMove(id: number, x: number, y: number): void {
  if (!drag || drag.id !== id) return;
  const dx = x - drag.sx;
  const dy = y - drag.sy;
  if (!drag.axis && Math.hypot(dx, dy) > lock) drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'; // 한 번만
  const nx = drag.axis === 'x' ? drag.bx0 + dx : drag.bx0;
  const ny = drag.axis === 'y' ? drag.by0 + dy : drag.by0;
  block = { x: clamp(nx, cx(0), cx(N - 1)), y: clamp(ny, cy(0), cy(N - 1)) };
}

function onUp(): void {
  const col = clamp(Math.round((block.x - cx(0)) / CS), 0, N - 1);
  const row = clamp(Math.round((block.y - cy(0)) / CS), 0, N - 1);
  target = { x: cx(col), y: cy(row) };
  drag = null;
}

// 프레임마다 — 감쇠 스프링으로 칸에 착
function step(dt: number): void {
  if (!target || drag) return;
  const k = 260;
  const c = 2 * Math.sqrt(k) * 0.72; // 감쇠비 0.72 — 살짝 튕기고 멈춤
  vel.x += (k * (target.x - block.x) - c * vel.x) * dt;
  vel.y += (k * (target.y - block.y) - c * vel.y) * dt;
  block = { x: block.x + vel.x * dt, y: block.y + vel.y * dt };
  if (Math.hypot(target.x - block.x, target.y - block.y) < 0.3 && Math.hypot(vel.x, vel.y) < 2) {
    block = { ...target };
    target = null;
    vel = { x: 0, y: 0 };
  }
}`,
    },
    pitfalls: [
      { title: '축을 매 move 마다 다시 정하면 끄는 도중 가로 ↔ 세로가 바뀌어 덜컹인다', fix: '처음 문턱을 넘을 때 한 번만 정한다.' },
      { title: '문턱이 너무 작으면(1~2px) 손 떨림으로 엉뚱한 축이 정해진다', fix: '8px 안팎 — 손 떨림 문턱(i425)과 비슷하게.' },
      { title: '차 · 블록처럼 원래 한 축만 되는 것은 축 잠금 대신 그 축 성분만 쓴다', fix: '빵빵 주차장은 차 방향(horiz)으로 정해진 성분만 읽는다 — 장난감 상자는 처음 움직인 쪽이 축.', seen: true },
    ],
    prev: ['i425', 'u79'],
    next: ['i420', 'i424'],
  },

  i420: {
    id: 'i420',
    summary: '카드를 놓을 때의 속도로 미끄러질 도착점을 미리 계산해 가장 가까운 칸을 고르고, 미끄러지다 스프링으로 그 칸에 착 붙게 한다.',
    terms: [
      { en: 'Inertial fling with snap points', ko: '관성 던지기 + 착 붙는 자리' },
      { en: 'Release velocity (from recent samples)', ko: '놓을 때 속도 — 최근 0.09초 손 자리로' },
      { en: 'Exponential friction (v·e^(−f·dt))', ko: '지수 마찰 — 미끄러질 거리 ≈ 속도 ÷ 마찰' },
      { en: 'Critically damped spring', ko: '감쇠 스프링 — 칸에 끌려가 멈춤' },
    ],
    goal: '{target}에 관성 던지기와 칸 붙기를 넣어 줘 — 놓을 때 최근 0.09초 손 자리로 속도를 재고, 도착 예상점(자리 + 속도 ÷ 마찰)에 가장 가까운 칸을 골라, 미끄러지다 스프링으로 착. 손맛은 {style}.',
    targets: ['카드 · 조각 퍼즐', '메뉴 카드 넘기기', '판 위 말 던져 놓기'],
    styles: ['미끄럽고 멀리 (마찰 작게)', '묵직하게 (마찰 크게)', '통통 튀는 스프링'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '놓는 순간 속도 = (마지막 손 자리 − 0.09초 전 손 자리) ÷ 그 시간. 놓기 전에 0.08초 넘게 멈춰 있었으면 0.',
      '마찰은 지수로: 속도 × e^(−마찰 × dt). 그러면 미끄러질 거리 ≈ 속도 ÷ 마찰 (견본 마찰 4).',
      '놓을 때 도착 예상점 = 지금 자리 + 속도 ÷ 마찰 → 가장 가까운 칸이 목표.',
      '속도가 140px/초 아래로 떨어지면 미끄러짐을 멈추고, 스프링(k = 170, 감쇠비 0.55)으로 목표 칸에 끌려간다.',
      '너무 빠른 던지기는 1,300px/초로 자른다.',
    ],
    when: ['카드 · 조각을 툭 던져 놓는 손맛이 필요할 때', '칸이 정해진 판에서 끌기가 「칸 사이에 멈춤」으로 끝날 때'],
    avoid: ['정확한 자리가 중요한 퍼즐 — 던지기가 실수를 부른다 (대신 끈 자리에서 가장 가까운 칸)', '칸이 아주 촘촘할 때 — 예상점이 조금만 틀려도 엉뚱한 칸'],
    cost: 'light',
    costNote: '프레임마다 곱셈 몇 번. 비용 없음.',
    level: 2,
    must: [
      '놓을 때 속도는 최근 0.09초 손 자리로 — 놓기 직전 0.08초 넘게 멈췄으면 0',
      '목표 칸은 놓는 순간 한 번 정한다: 가장 가까운 칸(자리 + 속도 ÷ 마찰)',
      '미끄러짐(지수 마찰) → 속도 140 아래면 스프링으로 — 두 단계',
      '속도 상한 1,300px/초, 판 벽에 닿으면 −0.4 로 살짝 튕김',
      '마찰 · 스프링 단단함 조절판',
    ],
    done: [
      '끔: 놓은 자리에 그냥 멈춰 「칸 사이에 멈춤」',
      '켬: 툭 던지면 미끄러지다 점선으로 미리 표시된 칸에 스프링으로 착 붙는다',
      '「놓을 때 속도 …px/초 · 미끄러질 거리 ≈ 속도 ÷ 마찰 = …px」 숫자가 보인다',
      '마찰을 작게 하면 더 멀리 간다',
    ],
    code: {
      lang: 'ts',
      title: '놓을 때 속도 → 도착 칸 고르기 → 미끄러짐 → 스프링',
      from: 'demos/demosInput.ts i420 move() · up() · step()',
      body: `let fr = 4;    // 마찰
let k = 170;   // 스프링 단단함
let samples: { x: number; y: number; t: number }[] = [];
let phase: 'rest' | 'drag' | 'glide' | 'spring' = 'rest';

function onMove(x: number, y: number, t: number): void {
  pos = { x: x + grab.ox, y: y + grab.oy };
  samples.push({ x, y, t });
  while (samples.length > 2 && t - samples[0].t > 0.09) samples.shift(); // 최근 0.09초만
}

function onUp(now: number): void {
  let vx = 0, vy = 0;
  const a = samples[0], b = samples[samples.length - 1];
  if (a && b && b.t - a.t > 0.005 && now - b.t < 0.08) { // 놓기 직전 멈췄으면 0
    vx = (b.x - a.x) / (b.t - a.t);
    vy = (b.y - a.y) / (b.t - a.t);
  }
  const raw = Math.hypot(vx, vy);
  if (raw > 1300) { vx *= 1300 / raw; vy *= 1300 / raw; }
  target = nearest({ x: pos.x + vx / fr, y: pos.y + vy / fr }); // 미끄러질 거리 ≈ 속도 ÷ 마찰
  vel = { x: vx, y: vy };
  phase = Math.hypot(vx, vy) > 140 ? 'glide' : 'spring';
}

function step(dt: number): void {
  if (phase === 'glide') {
    const f = Math.exp(-fr * dt);
    vel = { x: vel.x * f, y: vel.y * f };
    pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
    if (Math.hypot(vel.x, vel.y) < 140) phase = 'spring';
  } else if (phase === 'spring' && target) {
    const c = 2 * Math.sqrt(k) * 0.55;
    vel.x += (k * (target.x - pos.x) - c * vel.x) * dt;
    vel.y += (k * (target.y - pos.y) - c * vel.y) * dt;
    pos = { x: pos.x + vel.x * dt, y: pos.y + vel.y * dt };
    if (Math.hypot(target.x - pos.x, target.y - pos.y) < 0.3 && Math.hypot(vel.x, vel.y) < 3) { pos = { ...target }; phase = 'rest'; }
  }
}`,
    },
    pitfalls: [
      { title: '놓기 직전 손을 멈췄는데 오래된 속도가 남아 카드가 날아간다', fix: '마지막 손 자리가 0.08초보다 오래됐으면 속도를 0 으로.' },
      { title: '처음 두 점만으로 속도를 재면 끄는 내내의 평균이 돼 던진 느낌이 없다', fix: '최근 0.09초 손 자리만 남기고 잰다.' },
      { title: '도착 칸을 멈춘 뒤에 고르면 스프링이 엉뚱한 쪽으로 되돌아간다', fix: '놓는 순간 예상점으로 칸을 정하고, 미끄러지는 동안 그 칸을 미리 보여 준다.' },
    ],
    prev: ['i419'],
    next: ['i424'],
  },

  i421: {
    id: 'i421',
    summary: '누른 시간과 앞 누름과의 간격으로 한 번 · 두 번 · 길게를 가려, 한 칸에서 열기 · ✕ 표시 · 깃발을 따로 할 수 있게 하고 길게 누르는 동안 원 진행을 보여 준다.',
    terms: [
      { en: 'Gesture disambiguation (tap · double-tap · long-press)', ko: '누름 몸짓 구별' },
      { en: 'Long-press threshold', ko: '길게 누르기 기준 (500ms)' },
      { en: 'Double-tap interval', ko: '두 번 누르기 간격 (300ms)' },
      { en: 'Movement tolerance (cancel on move)', ko: '14px 넘게 움직이면 취소' },
    ],
    goal: '{target}에서 한 번 · 두 번 · 길게 누르기를 구별해 줘 — 500ms 넘게 누르면 길게(누르는 동안 원 진행), 뗀 뒤 300ms 안에 또 누르면 두 번, 아니면 300ms 기다린 뒤 한 번으로 확정. 14px 넘게 움직이면 취소. 화면은 {style}.',
    targets: ['지뢰 찾기 같은 칸 (열기 · ✕ · 깃발)', '그림 칸 칠하기 · 엑스 표시', '아이콘 메뉴 (길게 = 더 보기)'],
    styles: ['시간 띠로 누른 구간 보여 주기', '원 진행 표시만', '둥근 메뉴가 펼쳐지는'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 PointerEventData.clickCount 로 두 번을, 길게는 OnPointerDown 시각을 재서 Update 에서 판정.',
      godot: 'Godot 은 InputEventMouseButton.double_click 이 있고, 길게는 Timer 로 직접 잰다 (터치는 InputEventScreenTouch).',
    },
    principle: [
      '누르면 시계를 켠다. 떼기 전에 500ms 가 지나면 그 자리에서 「길게」 — 뗄 때를 기다리지 않는다.',
      '떼었을 때 길게가 아니면 「한 번 후보」로 300ms 기다린다.',
      '그 안에 다시 누르면 「두 번」, 300ms 가 지나면 그제서야 「한 번」 확정 — 그래서 한 번은 조금 늦다.',
      '누른 채 14px 넘게 움직이면 끌기로 보고 취소한다.',
    ],
    when: ['한 칸에 동작이 둘 셋 필요한데 단추를 더 둘 자리가 없을 때', '폰에서 오른쪽 클릭 대신 길게 누르기'],
    avoid: ['아이 · 처음 하는 사람이 주로 쓰는 게임 — 숨은 몸짓을 모른다 (대신 도구 단추로 바꾸기)', '한 번 누름이 빨라야 하는 게임 — 두 번을 기다리느라 300ms 늦어진다 (두 번을 쓰지 않으면 바로 확정)'],
    cost: 'light',
    costNote: '시계 비교 몇 번. 비용 없음.',
    level: 1,
    must: [
      '길게: 누른 채 500ms — 뗄 때가 아니라 그 순간 바로 실행, 누르는 동안 원 진행 표시',
      '두 번: 앞 누름이 끝난 뒤 300ms 안에 다음 누름 시작',
      '한 번: 두 번 기다림(300ms)이 끝나야 확정 — 두 번을 안 쓰는 칸이면 바로',
      '누른 채 14px 넘게 움직이면 취소',
      '두 기준(250 ~ 1000ms · 150 ~ 500ms)을 조절할 수 있게',
    ],
    done: [
      '한 번 누르면 잠시 「기다리는 중… (두 번?)」 뒤 칸이 열린다',
      '빠르게 두 번 누르면 ✕, 꾹 누르면 원이 차오른 뒤 깃발 + 둥근 메뉴',
      '아래 시간 띠에 누른 구간 · 두 번 기다림(노랑) · 길게 기준선(보라)이 보인다',
      '끔이면 모두 「누름」 하나로 뒤죽박죽',
    ],
    code: {
      lang: 'ts',
      title: '누른 시간 · 간격으로 한 번 · 두 번 · 길게',
      from: 'demos/demosInput.ts i421 down · move · up · step',
      body: `let LONG = 0.5; // 초
let DBL = 0.3;
let held: { t0: number; x0: number; y0: number; fired: boolean; moved: boolean } | null = null;
let pendingT: number | null = null; // 「한 번」 후보가 된 때 (뗀 시각)

function down(x: number, y: number, now: number): void {
  held = { t0: now, x0: x, y0: y, fired: false, moved: false };
}
function move(x: number, y: number): void {
  if (held && Math.hypot(x - held.x0, y - held.y0) > 14) held.moved = true; // 끌기 → 취소
}
function up(now: number): void {
  const h = held;
  held = null;
  if (!h || h.fired) return; // 길게는 이미 실행됨
  if (h.moved) { pendingT = null; return; }
  if (pendingT !== null && h.t0 - pendingT <= DBL) {
    pendingT = null;
    fire('double');
  } else pendingT = now; // 두 번인지 기다린다
}
// 프레임마다
function step(now: number): void {
  if (held && !held.fired && !held.moved && now - held.t0 >= LONG) {
    held.fired = true; // 떼기 전에 바로
    pendingT = null;
    fire('long');
  }
  if (pendingT !== null && !held && now - pendingT > DBL) {
    pendingT = null;
    fire('tap'); // 두 번 기다림이 끝나야 한 번 확정
  }
  // 원 진행: held ? (now − held.t0) / LONG : 0
}`,
    },
    pitfalls: [
      { title: '한 번 누름을 바로 실행하면 두 번 누를 때 한 번 + 두 번이 함께 일어난다', fix: '두 번 기다림이 끝난 뒤에 한 번을 확정한다 — 두 번을 안 쓰는 칸만 바로.' },
      { title: '길게를 뗄 때 판정하면 「언제 떼야 하지?」 하고 손을 계속 누르고 있다', fix: '500ms 가 되는 순간 실행하고 진동 · 원 진행으로 알린다.' },
      { title: '폰 브라우저의 길게 누르기 메뉴(글자 고르기 · 그림 저장)가 뜬다', fix: '판 요소에 user-select: none · -webkit-touch-callout: none, contextmenu 이벤트 막기.' },
    ],
    prev: ['i418', 'i425'],
    next: ['i422'],
  },

  i422: {
    id: 'i422',
    summary: '두 손가락 거리 비로 확대, 각도 차로 회전하되 중심을 두 손가락 가운데로 잡아, 손가락 밑 그림 점이 손가락을 그대로 따라오게 한다.',
    terms: [
      { en: 'Pinch-zoom and two-finger rotate', ko: '두 손가락 확대 · 회전' },
      { en: 'Gesture centroid (midpoint)', ko: '몸짓 중심 — 두 손가락 가운데' },
      { en: 'Similarity transform', ko: '옮기기 + 확대 + 돌리기 한 번에' },
      { en: 'Wheel zoom at cursor', ko: '마우스 자리를 중심으로 휠 확대' },
    ],
    goal: '{target}에 두 손가락 확대 · 회전을 넣어 줘 — 시작할 때 두 점의 가운데 · 거리 · 각도를 기억하고, 배율 = 지금 거리 / 처음 거리, 회전 = 각도 차, 중심은 두 손가락 가운데. PC 는 휠 = 마우스 자리 중심 확대, Shift + 휠 = 회전. 화면은 {style}.',
    targets: ['보물 지도 · 큰 그림', '2D 판 보기', '3D 물체 돌려 보기'],
    styles: ['손가락 밑 점 표시', '표시 없이 매끈하게', '배율 · 각도 숫자 함께'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Input.GetTouch(0) · (1) 의 위치로 같은 계산 (Input System 이면 Touchscreen.current.touches).',
      godot: 'Godot 은 InputEventScreenDrag 로 손가락마다 직접 계산하거나, 트랙패드는 InputEventMagnifyGesture.',
    },
    principle: [
      '시작할 때 기억: 두 손가락 가운데 m0, 거리 d0, 각도 a0, 그림의 자리 · 배율 · 회전.',
      '지금 배율 k = 지금 거리 / d0, 회전 da = 지금 각도 − a0.',
      '그림 자리 = 지금 가운데 m + 회전(da) × (처음 그림 자리 − m0) × k — 가운데를 기준으로 확대 · 돌리면 손가락 밑 점이 그대로다.',
      '그림 가운데를 기준으로 하면(끔) 배율만 맞고 자리가 어긋나 손가락 밑 점이 빠져나간다.',
      '한 손가락은 옮기기. 손가락 수가 바뀌면 그 순간 다시 시작값을 잡는다.',
    ],
    when: ['큰 지도 · 그림을 폰에서 확대해 볼 때', '3D 보기에서 확대 · 회전을 손으로'],
    avoid: ['작은 판 퍼즐 — 확대가 필요 없고 실수만 늘린다', '브라우저 확대와 겹칠 때 — 캔버스에 touch-action: none 을 꼭'],
    cost: 'light',
    costNote: '움직일 때 삼각 함수 몇 번. 비용 없음.',
    level: 2,
    must: [
      '중심은 두 손가락 가운데 — 그림 가운데 아님',
      '손가락이 늘거나 줄면 시작값(가운데 · 거리 · 각도 · 그림 상태)을 다시 잡기 (튀지 않게)',
      '배율 범위 0.3 ~ 4, 거리는 최소 4px 로 (0 나누기 막기)',
      'PC: 휠 = 마우스 자리 중심 확대(e^(−dy × 0.0018)), Shift + 휠 = 회전',
      'touch-action: none, pointer 이벤트로 손가락마다 pointerId',
    ],
    done: [
      '켬: 두 손가락으로 벌리며 돌리면 처음 짚은 그림 위 점(네모)이 손가락 밑에 그대로 있다',
      '끔: 같은 몸짓에 점이 손가락에서 빠져나가며 빨간 점선과 「…px 어긋남」',
      '「배율 ×… · 회전 …°」 숫자, PC 휠로도 같은 동작',
    ],
    code: {
      lang: 'ts',
      title: '두 손가락 가운데를 중심으로 확대 · 회전',
      from: 'demos/demosInput.ts i422 startGest() · apply() · zoomAt()',
      body: `const rot = (p: V2, a: number): V2 => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
let pic = { x: 150, y: 172, s: 0.74, r: 0 }; // 그림 자리 · 배율 · 회전
const touches = new Map<number, V2>();
let gest: { a: number; b: number; m0: V2; d0: number; a0: number; pic0: typeof pic } | null = null;

function startGest(): void { // 손가락이 둘이 되는 순간 (줄었다 늘 때도 다시)
  const [a, b] = [...touches.keys()];
  const pa = touches.get(a)!, pb = touches.get(b)!;
  gest = { a, b, m0: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
    d0: Math.max(4, Math.hypot(pb.x - pa.x, pb.y - pa.y)), a0: Math.atan2(pb.y - pa.y, pb.x - pa.x), pic0: { ...pic } };
}

function apply(): void {
  if (!gest) return;
  const pa = touches.get(gest.a), pb = touches.get(gest.b);
  if (!pa || !pb) return;
  const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const k = Math.max(4, Math.hypot(pb.x - pa.x, pb.y - pa.y)) / gest.d0; // 거리 비 = 배율
  const da = Math.atan2(pb.y - pa.y, pb.x - pa.x) - gest.a0;             // 각도 차 = 회전
  const s = Math.min(4, Math.max(0.3, gest.pic0.s * k));
  const kk = s / gest.pic0.s;
  const q = rot({ x: (gest.pic0.x - gest.m0.x) * kk, y: (gest.pic0.y - gest.m0.y) * kk }, da);
  pic = { x: m.x + q.x, y: m.y + q.y, s, r: gest.pic0.r + da }; // 가운데 기준 → 손가락 밑 점이 그대로
}

// PC 휠: 마우스 자리 (cx, cy) 중심
function zoomAt(cx: number, cy: number, k: number, da: number): void {
  const s = Math.min(4, Math.max(0.3, pic.s * k));
  const kk = s / pic.s;
  const q = rot({ x: (pic.x - cx) * kk, y: (pic.y - cy) * kk }, da);
  pic = { x: cx + q.x, y: cy + q.y, s, r: pic.r + da };
}
// 휠: zoomAt(x, y, Math.exp(-dy * 0.0018), 0) · Shift + 휠: zoomAt(x, y, 1, dy * 0.004)`,
    },
    pitfalls: [
      { title: '그림 가운데를 기준으로 확대하면 손가락 밑 점이 빠져나간다', fix: '두 손가락 가운데를 기준으로 — 견본 「끔」이 바로 이 실수다.' },
      { title: '한 손가락을 떼었다 다시 대면 그림이 확 튄다', fix: '손가락 수가 바뀌는 순간마다 시작값을 다시 잡는다 (startGest · startPan).' },
      { title: '두 손가락 몸짓을 하면 브라우저 페이지가 확대된다', fix: '캔버스에 touch-action: none.' },
    ],
    prev: ['u51', 'i421'],
    next: ['i424'],
    refs: [{ name: 'MDN — Pinch zoom gestures (Pointer events)', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures' }],
  },

  i424: {
    id: 'i424',
    summary: '조각을 끄는 동안 칸에 맞춰 반올림한 놓일 자리를 그림자로 미리 그려, 놓을 수 있으면 초록 · 겹치거나 판 밖이면 빨강으로 알려 준다.',
    terms: [
      { en: 'Drop preview (ghost / placement shadow)', ko: '놓일 자리 미리 보기' },
      { en: 'Grid snap (round to cell)', ko: '칸에 맞춰 반올림' },
      { en: 'Placement validation', ko: '놓을 수 있는지 검사 — 겹침 · 판 밖' },
      { en: 'Return-to-origin spring', ko: '못 놓으면 제자리로 스프링' },
    ],
    goal: '{target}에 놓일 자리 미리 보기를 넣어 줘 — 끄는 동안 조각의 칸 자리를 반올림해 그림자로 그리고, 칸마다 겹침 · 판 밖을 검사해 되면 초록 · 안 되면 빨강(막힌 칸 표시). 초록에서 놓으면 착, 빨강이면 흔들리며 제자리로. 분위기는 {style}.',
    targets: ['L 조각 · 블록 퍼즐', '카드 놓기 게임', '가구 · 건물 배치'],
    styles: ['반투명 그림자 (진하기 0.5)', '점선 테두리만', '도트 블록'],
    platforms: ['canvas', 'three', 'web', 'unity', 'godot'],
    principle: [
      '끄는 동안 조각 왼쪽 위 자리를 칸 크기로 나눠 반올림 → 놓일 칸 (c, r).',
      '조각 모양의 칸마다 (c + dc, r + dr) 가 판 안인지 · 비었는지 본다. 하나라도 막히면 못 놓음.',
      '그 칸들에 반투명 그림자를 그린다 — 되면 초록, 안 되면 빨강, 막힌 칸은 더 진하게.',
      '놓을 때 같은 검사로: 되면 그 칸으로 스프링(k = 320) 착, 안 되면 흔들고 제자리로.',
    ],
    when: ['조각 · 카드를 판 칸에 놓는 모든 게임', '놓아 봐야 아는 실수가 잦을 때'],
    avoid: ['자유 자리에 놓는 그림 · 스티커 — 칸이 없으면 그림자 대신 손가락 아래 바로', '칸이 아주 작은 판 — 그림자가 조각에 가려 안 보인다 (조각을 손가락 위로 띄워 그리기)'],
    cost: 'light',
    costNote: '움직일 때 조각 칸 수만큼 검사. 비용 없음.',
    level: 1,
    must: [
      '놓일 자리 = 조각 자리를 칸 크기로 나눠 반올림 (끄는 그대로가 아니라 칸에 맞춘 자리)',
      '미리 보기 검사와 놓을 때 검사가 같은 함수여야 한다 (초록이었는데 안 놓이는 일 금지)',
      '되면 초록 · 안 되면 빨강, 막힌 칸은 따로 표시',
      '판 밖에서 놓으면 그림자 없이 제자리로',
      '그림자 진하기 조절(0.15 ~ 1)',
    ],
    done: [
      '끔: 끄는 동안 아무 표시 없고 놓은 뒤에야 「갑자기 돌아감 — 왜?」',
      '켬: 판 위에서 놓일 세 칸이 초록 · 빨강 그림자로 보이고 「여기 놓을 수 있어요 / 겹쳐요」',
      '초록에서 놓으면 착 붙어 판에 남고, 빨강에서 놓으면 흔들리며 제자리로',
    ],
    code: {
      lang: 'ts',
      title: '놓일 칸 반올림 + 칸마다 검사 (미리 보기 · 놓기 같은 함수)',
      from: 'demos/demosInput.ts i424 evalAt() · up()',
      body: `const CS = 42;           // 칸 크기
const NC = 5, NR = 4;    // 판 칸 수
const SHAPE: [number, number][] = [[0, 0], [0, 1], [1, 1]]; // L 조각
const occ = new Map<string, string>(); // 'c,r' → 찬 칸

function evalAt(x: number, y: number): { c: number; r: number; ok: boolean; bad: Set<string> } {
  const c = Math.round((x - GX) / CS); // 칸에 맞춰 반올림
  const r = Math.round((y - GY) / CS);
  const bad = new Set<string>();
  for (const [dc, dr] of SHAPE) {
    const cc = c + dc, rr = r + dr;
    if (cc < 0 || cc >= NC || rr < 0 || rr >= NR || occ.has(cc + ',' + rr)) bad.add(dc + ',' + dr);
  }
  return { c, r, ok: bad.size === 0, bad };
}

// 끄는 동안: 그림자
function drawPreview(g: CanvasRenderingContext2D, a: ReturnType<typeof evalAt>, alpha = 0.5): void {
  for (const [dc, dr] of SHAPE) {
    const blocked = a.bad.has(dc + ',' + dr);
    g.globalAlpha = blocked ? Math.min(1, alpha * 1.6) : alpha;
    g.fillStyle = a.ok ? '#3ddc97' : '#ff5d6c';
    g.fillRect(GX + (a.c + dc) * CS, GY + (a.r + dr) * CS, CS, CS);
  }
  g.globalAlpha = 1;
}

// 놓을 때: 같은 검사
function onUp(): void {
  const a = evalAt(pos.x, pos.y);
  if (a.ok) target = { x: GX + a.c * CS, y: GY + a.r * CS }; // 스프링으로 착 → 다 오면 occ 에 적기
  else { target = { ...HOME }; shake = 0.4; }                 // 흔들며 제자리로
}`,
    },
    pitfalls: [
      { title: '미리 보기와 놓기 검사가 다르면 초록인데 안 놓인다', fix: '같은 evalAt 하나로 둘 다 판정한다.' },
      { title: '그림자를 조각 밑에 그리면 손가락 · 조각에 가려 안 보인다', fix: '그림자는 판 위 칸 자리에, 끄는 조각은 살짝 띄워(그림자 · 크게) 손가락 위쪽에.' },
      { title: '손가락 자리 기준으로 반올림하면 잡은 곳에 따라 한 칸씩 어긋난다', fix: '잡을 때 조각과 손가락의 차이(ox · oy)를 기억해 조각 자리 기준으로 반올림한다.' },
    ],
    prev: ['i419', 'i420'],
    next: ['i425'],
  },

  i425: {
    id: 'i425',
    summary: '누른 점에서 몇 px(기본 10) 안의 움직임은 누름으로 보고 그 문턱을 넘어야 끌기로 바꿔, 아이 손 · 폰의 떨림 때문에 누름이 끌기로 사라지지 않게 한다.',
    terms: [
      { en: 'Touch slop (drag threshold)', ko: '누름 vs 끌기 문턱' },
      { en: 'Tap vs drag disambiguation', ko: '누름과 끌기 가르기' },
      { en: 'EventSystem.pixelDragThreshold (Unity)', ko: '유니티의 같은 문턱 설정' },
      { en: 'Jitter', ko: '손 떨림 — 몇 px 흔들림' },
    ],
    goal: '{target}에 손 떨림 걸러내기를 넣어 줘 — 누른 점에서 10px 안의 움직임은 누름 후보로 두고, 넘는 순간부터 끌기(넘긴 그 자리 기준이라 튀지 않게). 뗄 때 끌기가 아니면 처음 누른 자리로 누름 판정. {style}.',
    targets: ['옆으로 넘기는 카드 줄', '누르기 · 끌기가 함께 있는 판', '모든 터치 게임'],
    styles: ['문턱 원 · 손 자취 보여 주기', '확대 창으로 떨림 보여 주기', '표시 없이 조용히'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity UI 는 EventSystem.pixelDragThreshold (기본 10px) — 폰은 화면 밀도에 맞게 키운다.',
      godot: 'Godot 은 직접 — InputEventScreenTouch 의 누른 자리를 기억했다가 InputEventScreenDrag 거리로 판정.',
    },
    principle: [
      '사람 손가락은 누르고 있는 동안 몇 px 씩 떨린다 — 1px 만 움직여도 끌기로 보면 누름이 사라진다.',
      '누른 점을 기억하고, 거기서 거리가 문턱(10px)을 넘기 전까지는 누름 후보.',
      '처음 문턱을 넘는 순간 끌기로 바꾸고, 끌기의 기준점을 그 순간의 손 자리로 — 그래야 넘는 순간 10px 툭 튀지 않는다.',
      '뗄 때 끌기가 아니었다면 처음 누른 자리에서 누름 판정 (떨린 자리 아님).',
    ],
    when: ['누르기와 끌기가 같은 곳에서 일어나는 모든 화면 (카드 줄 · 판 · 목록)', '아이 · 폰 사용자'],
    avoid: ['그림 그리기 · 선 긋기 — 처음 몇 px 이 사라지면 선이 늦게 시작된다 (대신 문턱을 작게, 넘으면 처음 자리부터 선)', '정밀한 1px 끌기 (자 · 눈금) — 대신 확대 보기'],
    cost: 'light',
    costNote: '움직일 때 거리 한 번. 비용 없음.',
    level: 1,
    must: [
      '문턱 기본 10px (2 ~ 30 조절) — 폰은 화면 밀도(devicePixelRatio)를 생각해 CSS px 로',
      '문턱을 넘는 순간 끌기 기준점 = 그때 손 자리 (튀지 않게)',
      '누름 판정은 처음 누른 자리로',
      '한 번 끌기가 되면 다시 누름으로 돌아가지 않기',
    ],
    done: [
      '끔: 손 떨림 흉내를 켜고 누르면 줄이 조금 밀리며 「끌기로 판정 — 누름 사라짐」',
      '켬: 같은 떨림에도 문턱 원 안이라 「누름 → n번 고름」, 크게 끌면 줄이 넘어간다',
      '확대 창(×3)에 손 자취와 문턱 원이 보이고 「최대 움직임 …px (문턱 10px)」',
    ],
    code: {
      lang: 'ts',
      title: '문턱 안은 누름 · 넘는 순간부터 끌기',
      from: 'demos/demosInput.ts i425 handle() · up()',
      body: `let slop = 10; // 누름 문턱 (px)
let press: { x0: number; y0: number; drag: boolean; ox: number; sx0: number; maxD: number } | null = null;

function down(x: number, y: number): void {
  press = { x0: x, y0: y, drag: false, ox: x, sx0: scrollX, maxD: 0 };
}

function move(x: number, y: number): void {
  if (!press) return;
  const d = Math.hypot(x - press.x0, y - press.y0);
  press.maxD = Math.max(press.maxD, d);
  if (!press.drag && d > slop) {
    press.drag = true;   // 한 번 끌기가 되면 끝까지 끌기
    press.ox = x;        // 기준점 = 넘는 순간의 손 자리 → 10px 툭 튀지 않음
    press.sx0 = scrollX;
  }
  if (press.drag) scrollX = clamp(press.sx0 + (x - press.ox), minScroll, 0);
}

function up(): void {
  const p = press;
  press = null;
  if (!p) return;
  if (!p.drag) {
    const i = tileAt(p.x0); // 떨린 자리가 아니라 처음 누른 자리로
    if (i >= 0) select(i);
  }
}`,
    },
    pitfalls: [
      { title: '1px 만 움직여도 끌기로 보면 폰에서 누름이 자주 사라진다', fix: '문턱 10px 안은 누름으로.' },
      { title: '문턱을 넘는 순간 기준점을 처음 자리로 두면 화면이 10px 툭 튄다', fix: '넘는 순간의 손 자리를 끌기 기준점으로 삼는다.' },
      { title: '안내용 움직임 문턱이 너무 작으면 살짝 누르기만 해도 「막혔어요」 소리가 난다', fix: '빵빵 주차장은 6px 넘게 움직였을 때만 「막힌 차를 끌려 했다」로 보고 막힌 소리를 낸다 — 누름 · 끌기 문턱과 같은 생각.', seen: true },
    ],
    prev: ['i418'],
    next: ['i419', 'i421', 'u79'],
  },

  u81: {
    id: 'u81',
    summary: '그리기 직전 화면에 영향을 주는 값(물체 자리 · 색 · 빛 · 카메라 · 크기)을 모두 적어 지난번과 맞대 보고, 같으면 그리지 않아 멈춘 화면에서 배터리 · 열을 줄인다.',
    terms: [
      { en: 'Render on demand (dirty checking)', ko: '바뀔 때만 그리기' },
      { en: 'FrameGate', ko: '이 사이트의 「그릴까 말까」 문 (shared/frameGate.ts)' },
      { en: 'shadowMap.autoUpdate / needsUpdate', ko: '그림자 지도도 바뀔 때만 다시' },
      { en: 'Float64Array snapshot compare', ko: '값을 숫자 배열로 적어 하나하나 비교' },
    ],
    goal: '{target}에 바뀔 때만 그리기를 넣어 줘 — 매 프레임 렌더 전에 화면 크기 · 톤 매핑 · 카메라 행렬 · 보이는 물체의 행렬 · 재질 색 · 빛을 숫자 배열에 적고 지난번과 비교해, 같으면 renderer.render 를 건너뛰기. 그림자 지도도 그림자에 영향 있는 것이 바뀔 때만. {style}.',
    targets: ['3D 보드게임 (생각하는 시간이 긴)', '3D 퍼즐 무대', '메뉴 · 고르기 화면'],
    styles: ['배터리 아끼기', '폰 발열 줄이기', '그린 프레임을 띠로 보여 주기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 OnDemandRendering.renderFrameInterval 로 그리는 간격을 늘린다 (입력 · 화면 갱신은 그대로).',
      godot: 'Godot 은 프로젝트 설정 application/run/low_processor_mode — 화면이 바뀔 때만 다시 그린다.',
    },
    principle: [
      '보드게임은 대부분 생각하는 시간이라 장면이 멈춰 있다 — 그때도 매 프레임 판 · 그림자를 그리면 폰이 뜨거워진다.',
      '그리기 직전에 화면을 바꿀 수 있는 값을 빠짐없이 Float64Array 에 적는다: 캔버스 크기 · 픽셀 비율 · 톤 매핑 · 지우는 색 · 카메라 행렬 · 보이는 물체 행렬 · 재질 값 · 텍스처 · 빛 · 셰이더 uniform.',
      '지난번 배열과 숫자 하나하나 비교(상대 오차 1e-7 까지는 같음) — 같으면 그리지 않는다. 캔버스는 지난 그림을 그대로 보여 준다.',
      '그림자는 따로 적어, 말 · 판이 그대로면 shadowMap.needsUpdate = false (빛나는 표시만 깜빡일 때).',
      'setSize · 문맥 복구 때는 캔버스가 지워지므로 invalidate() 로 다음엔 무조건 그린다.',
    ],
    when: ['차례제 3D 게임 — 화면 대부분이 멈춰 있다', '폰에서 오래 켜 두는 화면'],
    avoid: ['입자 · 흐르는 물 같이 계속 움직이는 것이 있는 무대 — 매번 바뀌어 이득이 없다', '값 적기를 빠뜨린 효과(시간 uniform 등)가 있는 장면 — 화면이 멈춘 채로 남는다'],
    cost: 'light',
    costNote: '값 적기 · 비교 비용(물체 수에 비례)이 그리기보다 훨씬 싸다. 멈춘 동안 GPU 일은 0.',
    level: 2,
    must: [
      '화면을 바꿀 수 있는 값은 빠짐없이 — 행렬 · 색 · 투명도 · 텍스처 · 빛 · 카메라 · 화면 크기 · 셰이더 uniform',
      '해시가 아니라 값 자체를 비교 (바뀐 것을 놓치지 않게), 소수점 흔들림 1e-7 은 같은 것으로',
      '한 프레임에 여러 장면을 그리면 하나라도 바뀌면 모두 그리기',
      'setSize · webglcontextrestored · 캔버스를 베낄 때는 invalidate',
      '그린 프레임 수를 띠로 보여 줘 멈춘 동안 0 인지 확인',
    ],
    done: [
      '말이 움직일 때만 아래 줄(FrameGate)에 그린 프레임 칸이 켜지고, 가만히 있을 땐 꺼진다',
      '위 줄(늘 그리기)은 내내 켜져 있다 — 「최근 60프레임 중 그린 수」 비교',
      '창 크기를 바꾸거나 다른 탭에서 돌아와도 화면이 비지 않는다',
    ],
    code: {
      lang: 'ts',
      title: 'FrameGate 쓰기 + 핵심 비교',
      from: 'src/game/games/shared/frameGate.ts FrameGate.changed() 를 줄임',
      body: `import { FrameGate } from '../shared/frameGate';

const gate = new FrameGate();
function loop(): void {
  update();
  // 바뀌었을 때만 그린다 — 같으면 캔버스는 지난 그림 그대로
  if (gate.changed(renderer, camera, [scene])) renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* changed() 안에서 하는 일 (줄임):
   n = 0;
   w(canvas.width); w(canvas.height); w(renderer.getPixelRatio()); w(renderer.toneMapping); w(renderer.toneMappingExposure);
   color(renderer.getClearColor(tmp));
   camera.updateMatrixWorld(); mat(camera.matrixWorld); mat(camera.projectionMatrix);
   for (const root of roots) { root.updateMatrixWorld(); root.traverseVisible(o => object(o)); } // 행렬 · 재질 · 빛 · uniform
   if (n === prev.length && near(prev, cur, n)) return false;   // 같으면 그리지 않음
   prev = cur.slice(0, n);
   renderer.shadowMap.autoUpdate = false;
   renderer.shadowMap.needsUpdate = !shadowSame;                // 그림자도 바뀔 때만
   return true; */

// 상대 오차 1e-7 까지는 같은 값 (매 프레임 다시 계산하는 회전의 끝자리 흔들림)
function near(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i += 1) {
    const x = a[i], y = b[i];
    if (x !== y && Math.abs(x - y) > 1e-7 * (1 + Math.abs(x))) return false;
  }
  return true;
}`,
    },
    pitfalls: [
      { title: 'setSize 를 부르면 크기가 같아도 캔버스가 지워져 빈 화면이 남는다', fix: 'FrameGate 는 renderer.setSize 를 감싸 부를 때마다 invalidate 한다 (문맥 복구도).', seen: true },
      { title: '판 사진을 베끼는 프레임에 안 그리면 베낄 그림이 없다', fix: 'WebGL 캔버스는 화면에 낸 뒤 버퍼를 비운다 — 셸은 game:redraw 이벤트로 다음 프레임 강제 그리기.', seen: true },
      { title: '시간으로 움직이는 셰이더 uniform 을 안 적으면 물결이 멈춘다', fix: 'uniform 값도 적는다. 계속 움직이는 무대는 FrameGate 를 붙이지 않는다.' },
    ],
    prev: ['i391'],
    next: ['i478', 'u86'],
  },

  u84: {
    id: 'u84',
    summary: '빌드 때 만든 파일 목록으로 서비스 워커가 첫 화면 파일을 미리 받아 두고, 한 번 해 본 게임 파일은 저장해 인터넷이 끊겨도 다시 열리게 한다.',
    terms: [
      { en: 'Service worker (offline cache)', ko: '서비스 워커 — 페이지 대신 요청을 받아 저장본을 꺼내 줌' },
      { en: 'Precache manifest', ko: '빌드 때 미리 받을 파일 목록' },
      { en: 'Cache-first / network-first / stale-while-revalidate', ko: '저장본 먼저 · 네트워크 먼저 · 저장본 보이고 뒤에서 새로' },
      { en: 'Cache Storage API (caches.open)', ko: '브라우저 저장 창고' },
    ],
    goal: '{target}에 오프라인을 넣어 줘 — 빌드 때 이번 파일 목록(shell · all)을 서비스 워커에 넣고, 설치할 때 첫 화면 파일을 미리 받기. 페이지는 네트워크 먼저, 해시가 붙은 /assets/ 는 저장본 먼저, 글꼴 CDN 은 저장본을 보이고 뒤에서 새로. 로그인 · 기록은 건드리지 않기. {style}.',
    targets: ['게임 모음 사이트', '학교에서 쓰는 수학 앱', '한 번 받아 두고 쓰는 체험 페이지'],
    styles: ['한 번 해 본 게임만 저장', '첫 화면만 미리', '새 버전은 탭을 모두 닫은 뒤'],
    platforms: ['web'],
    principle: [
      '서비스 워커는 페이지와 따로 도는 스크립트 — 페이지의 fetch 를 가로채 저장본(Cache Storage)을 줄 수 있다.',
      '빌드 도구가 sw.js 의 __SW_MANIFEST__ 자리를 이번 빌드 파일 목록으로 바꾼다: shell(첫 화면에 꼭) · all(이번 /assets/ 전부).',
      'install: shell 과 첫 페이지를 미리 받는다. activate: all 에 없는 옛 /assets/ 파일을 지운다.',
      'fetch: 페이지는 네트워크 먼저(안 되면 저장본), 해시 붙은 /assets/ 는 저장본 먼저(내용이 안 바뀜), 글꼴은 저장본 먼저 + 뒤에서 새로.',
      '새 버전은 skipWaiting 하지 않고 열린 탭이 모두 닫힌 뒤 켜진다 — 열린 탭이 쓰던 옛 파일을 지우지 않게.',
    ],
    when: ['학교 · 행사장처럼 인터넷이 불안한 곳에서 쓰는 사이트', '같은 게임을 여러 번 여는 사용자 — 두 번째부터 빨리 열림'],
    avoid: ['개발 서버 — 파일이 계속 바뀌어 옛 저장본이 남는다 (배포판에서만 등록)', '로그인 · 기록 올리기 · 온라인 대전 요청 — 늘 네트워크로 (가로채지 않기)'],
    cost: 'light',
    costNote: '첫 설치 때 shell 파일만 받는다. 게임은 해 본 것만 저장 — 저장 용량은 해 본 게임 수만큼.',
    level: 2,
    must: [
      '배포판(import.meta.env.PROD) · https 에서만 등록, 앱(네이티브)에서는 쓰지 않기',
      '등록은 첫 화면이 다 뜬 뒤(load 이벤트) — 첫 로딩과 겨루지 않게',
      '/assets/ 는 저장본 먼저, 페이지는 네트워크 먼저 — 페이지까지 저장본 먼저면 새 버전이 안 보인다',
      'activate 에서 이번 빌드에 없는 옛 /assets/ 만 지우기',
      'GET 이 아닌 요청 · Firebase 같은 다른 출처는 건드리지 않기',
    ],
    done: [
      '한 번 열어 본 뒤 비행기 모드에서 새로 고침해도 첫 화면과 해 본 게임이 열린다',
      '개발자 도구 Application → Cache Storage 에 mm-assets · mm-pages · mm-ext 가 보인다',
      '새로 배포하면 탭을 모두 닫고 다시 열 때 새 버전이 뜨고, 옛 /assets/ 파일이 지워진다',
    ],
    code: {
      lang: 'js',
      title: '설치 · 정리 · 요청마다 전략 고르기',
      from: 'sw/sw.js 를 줄임 (등록은 src/services/offline.ts)',
      body: `const MANIFEST = __SW_MANIFEST__; // 빌드 때 { shell: [...], all: [...] } 로 바뀐다
const ASSETS = 'mm-assets';
const PAGES = 'mm-pages';
const ROOT = new URL(self.registration.scope).href;
const abs = (p) => new URL(p, ROOT).href;
const ALL = new Set(MANIFEST.all.map(abs));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const assets = await caches.open(ASSETS);
    await assets.addAll(MANIFEST.shell.map((p) => new Request(abs(p), { cache: 'reload' })));
    await (await caches.open(PAGES)).add(new Request(ROOT, { cache: 'reload' }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const assets = await caches.open(ASSETS);
    for (const req of await assets.keys())
      if (req.url.startsWith(abs('assets/')) && !ALL.has(req.url)) await assets.delete(req); // 옛 빌드 파일
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) event.respondWith(page(req)); // 네트워크 먼저
  else if (url.origin === location.origin && url.pathname.startsWith(new URL('assets/', ROOT).pathname))
    event.respondWith(cacheFirst(req, ASSETS)); // 해시 붙은 파일 — 저장본 먼저
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}`,
    },
    pitfalls: [
      { title: '페이지(index.html)를 저장본 먼저로 두면 새로 배포해도 옛 화면이 계속 뜬다', fix: '페이지는 네트워크 먼저, 해시가 붙어 내용이 안 바뀌는 /assets/ 만 저장본 먼저.' },
      { title: 'skipWaiting 으로 바로 켜면 열린 탭이 쓰던 옛 파일이 지워져 게임이 깨진다', fix: '새 버전은 탭이 모두 닫힌 뒤 켜지게 둔다.' },
      { title: '서비스 워커가 생기기 전에 받은 첫 방문 파일은 저장되지 않는다', fix: '등록 뒤 performance.getEntriesByType(\'resource\') 의 주소를 postMessage 로 보내 저장하게 한다 (offline.ts).' },
      { title: '개발 서버에 등록하면 고친 파일 대신 저장본이 떠 헷갈린다', fix: 'import.meta.env.PROD 일 때만 등록한다.' },
    ],
    prev: ['u86'],
    refs: [
      { name: 'MDN — Service Worker API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API' },
      { name: 'MDN — Cache', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Cache' },
    ],
  },

  u86: {
    id: 'u86',
    summary: '「움직임 줄이기」를 켠 기기에서는 튀고 도는 연출을 살짝 나타나기로 바꾸고, 그림 단추에는 aria-label 을 달아 화면 읽기가 이름을 소리로 읽게 한다.',
    terms: [
      { en: 'prefers-reduced-motion', ko: '기기 설정 「움직임 줄이기」를 읽는 미디어 쿼리' },
      { en: 'aria-label', ko: '화면 읽기용 이름 — 글씨 없는 단추에' },
      { en: 'Focus indicator (:focus-visible)', ko: '키보드로 고른 단추 테두리' },
      { en: 'matchMedia', ko: 'JS 에서 미디어 쿼리 읽기' },
    ],
    goal: '{target}에 접근성을 넣어 줘 — prefers-reduced-motion: reduce 이면 통통 · 빙글 · 흔들 연출을 흐려졌다 또렷해지는 정도로 줄이고, 글씨 없는 단추에 aria-label, 키보드 초점 테두리를 또렷하게. {style}.',
    targets: ['게임 메뉴 · 단추', '성공 · 실패 연출', '사이트 전체'],
    styles: ['CSS 한 곳에서 한꺼번에', '게임 연출 코드에서도', '설정 화면에 켜고 끄기'],
    platforms: ['web', 'canvas', 'three'],
    principle: [
      '어지럼을 느끼는 사람은 기기 설정에서 「움직임 줄이기」를 켠다 — 브라우저는 prefers-reduced-motion: reduce 로 알려 준다.',
      'CSS 는 한 곳에서: 그 미디어 쿼리 안에서 animation · transition 시간을 0.01ms 로 (이 사이트 base.css).',
      '캔버스 · 3D 연출은 JS 에서 matchMedia 로 읽어 — 튀기 · 돌기 대신 투명도만 살짝 바꾼다.',
      '그림 · 아이콘 단추는 aria-label 로 이름을 준다 — 화면 읽기가 「시작하기, 단추」처럼 읽는다.',
      '키보드로 고를 수 있게 초점 테두리를 지우지 않는다.',
    ],
    when: ['모든 공개 화면 — 기본으로', '흔들림 · 번쩍 · 빠른 회전이 있는 성공 연출'],
    avoid: ['움직임 자체가 정보인 것(공이 굴러가는 물리 체험)까지 멈추기 — 정보는 남기고 장식만 줄이기', '번쩍이는 화면 전체 깜빡임 — 줄이기 설정이 없어도 피한다'],
    cost: 'light',
    costNote: '비용 없음. 연출 코드에 갈래 하나.',
    level: 1,
    must: [
      'CSS: @media (prefers-reduced-motion: reduce) 안에서 animation-duration · transition-duration 0.01ms !important',
      'JS 연출: matchMedia(\'(prefers-reduced-motion: reduce)\').matches 면 튀기 · 돌기 · 흔들기 대신 투명도만',
      '글씨 없는 단추 · 아이콘에 aria-label (번역되는 글로)',
      ':focus-visible 테두리를 없애지 않기',
      '설정이 바뀌면(change 이벤트) 바로 따라가기',
    ],
    done: [
      '보통 기기는 공이 통통 · 별이 빙글 · 카드가 흔들, 움직임 줄이기 기기는 셋 다 살짝 흐려졌다 또렷해지기만',
      '키보드 Tab 으로 단추를 고르면 주황 테두리가 보인다',
      '화면 읽기가 단추를 「시작하기, 단추」 · 「게임 방법 보기, 단추」처럼 읽는다',
    ],
    code: {
      lang: 'ts',
      title: 'CSS 한꺼번에 줄이기 + JS 연출 갈래 + aria-label',
      from: 'src/styles/base.css 의 미디어 쿼리 + 새로 씀 (JS 갈래 · aria-label 은 같은 방식)',
      body: `// CSS (base.css) — 사이트 전체 애니메이션을 한꺼번에
const css = [
  '@media (prefers-reduced-motion: reduce) {',
  '  *, *::before, *::after {',
  '    animation-duration: 0.01ms !important;',
  '    animation-iteration-count: 1 !important;',
  '    transition-duration: 0.01ms !important;',
  '  }',
  '}',
].join('\\n');

// 캔버스 · 3D 연출 — 튀기 대신 투명도만
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = mq.matches;
mq.addEventListener('change', (e) => (reduce = e.matches));

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const by = reduce ? y : y - Math.abs(Math.sin(t * 4)) * 22;            // 보통: 통통
  g.globalAlpha = reduce ? 0.5 + 0.5 * Math.abs(Math.sin(t * 1.05)) : 1;  // 줄이기: 살짝 흐려졌다 또렷
  g.beginPath();
  g.arc(x, by, 13, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
}

// 글씨 없는 단추 — 화면 읽기용 이름 (번역되는 글로)
soundBtn.setAttribute('aria-label', t('소리 켜기'));`,
    },
    pitfalls: [
      { title: '「움직임 줄이기」에서 연출을 아예 없애면 무엇이 일어났는지 모른다', fix: '움직임만 줄이고 결과는 투명도 · 색 변화로 남긴다.' },
      { title: 'CSS 만 고치면 캔버스 · 3D 연출은 그대로 흔들린다', fix: 'JS 에서도 matchMedia 로 읽어 갈래를 둔다.' },
      { title: 'aria-label 을 한국어로 박아 두면 다른 언어 사용자의 화면 읽기가 한국어를 읽는다', fix: '번역 함수(t)를 거친 글로 넣는다 — 이 사이트는 한국어가 번역 키.', seen: true },
    ],
    prev: ['u81'],
    next: ['u84'],
    refs: [
      { name: 'MDN — prefers-reduced-motion', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion' },
      { name: 'MDN — aria-label', url: 'https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label' },
    ],
  },
};

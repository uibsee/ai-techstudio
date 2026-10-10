import type { TechDoc } from './types';

/**
 * 제품 UI · 흐름도 · 코드 움직임 (2026-10-10) — i548 ~ i555.
 * 견본은 demos/demosMotionC.ts (UI 4개) · demosMotionD.ts (흐름도 · 코드 4개) + 공용 무대 demos/lib/stage.ts.
 * prompt-motion.com 의 분류(Product UI · Diagrams · Code)에서 이 사이트에 빈 곳을 찾아 새로 쓴 것.
 */
export const DOCS: Record<string, TechDoc> = {
  i548: {
    id: 'i548',
    summary: '목록의 카드를 누르면 그 그림 · 제목이 제자리에서 커져 상세 화면이 된다 — 처음 · 끝 위치를 재고 거꾸로 돌려 놓은 뒤 풀어 「같은 물건」으로 이어 보이게.',
    terms: [
      { en: 'FLIP animation (First, Last, Invert, Play)', ko: '처음 재기 → 배치 바꾸고 끝 재기 → 차이만큼 거꾸로 transform → 0 으로 풀기' },
      { en: 'Shared element transition', ko: '두 화면에 같이 있는 요소가 이어서 움직이는 전환' },
      { en: 'View Transitions API (view-transition-name)', ko: '브라우저가 FLIP 을 대신 해 주는 표준 — document.startViewTransition' },
      { en: 'Spring easing', ko: '살짝 지나쳤다 돌아오는 감쇠 진동 곡선' },
    ],
    goal: '{target}에서 카드를 누르면 그 카드의 그림 · 제목이 제자리에서 커져 상세 화면이 되는 공유 요소 전환(FLIP)을 만들어 줘. 느낌은 {style}.',
    targets: ['게임 고르기 목록 → 게임 상세', '상점 아이템 목록 → 아이템 자세히', '도감 카드 → 캐릭터 소개'],
    styles: ['밝은 카드 · 살짝 출렁이는 스프링', '차분한 앱 (출렁임 없이 빠르게)', '통통 튀는 게임 메뉴'],
    platforms: ['dom', 'unity', 'godot'],
    platformHints: {
      dom: '배치(left · top · width · height 또는 클래스)는 실제로 바꾸고, 움직임은 transform · opacity 로만. 지원 브라우저에선 document.startViewTransition + view-transition-name 으로 같은 효과를 낼 수 있다.',
      unity: 'UI Toolkit 이면 바뀌기 전 · 후 worldBound 를 재서 style.translate · scale 로 거꾸로 놓고 풀기. uGUI 는 RectTransform 의 처음 · 끝 값을 트윈.',
      godot: 'Control 의 처음 · 끝 global_position · size 를 재서 Tween 으로 position · scale 을 풀기.',
    },
    principle: [
      'First: 바꾸기 전에 그림 · 제목의 위치와 크기를 잰다. Last: 배치를 상세 화면으로 실제로 바꾸고 다시 잰다.',
      'Invert: 이제 요소는 이미 상세 자리에 있다. transform 으로 「처음 자리 · 크기」로 돌려 놓는다 — 이동 = 처음 − 끝, 배율 = 처음 크기 ÷ 끝 크기.',
      'Play: transform 을 0(이동) · 1(배율)로 풀면 요소가 처음 자리에서 끝 자리로 날아간다. 배치 계산은 한 번뿐이고 움직이는 동안은 transform 만 바뀌어 가볍다.',
      '글자는 가로 · 세로를 같은 배율로 — 따로 늘리면 찌그러진다. 나머지 카드는 흐려지며 물러나고, 상세 내용은 조금 늦게 차례로 나타난다.',
    ],
    when: ['목록 → 상세처럼 「같은 물건을 크게 본다」는 느낌이 중요할 때', '레이아웃이 바뀌는 순간(칸 정렬 · 줄 추가 · 순위 바뀜)을 부드럽게 이어 줄 때'],
    avoid: ['두 화면에 같은 요소가 없을 때 — 대신 밀기 · 덮기 전환(i99 마스크 와이프)', '움직임을 싫어하는 사람(prefers-reduced-motion) — 대신 짧은 흐려짐 전환'],
    cost: 'light',
    costNote: '배치 측정은 전환 순간 두 번뿐. 움직이는 동안은 transform · opacity 만 바뀌어 합성 단계에서 처리된다 — 폰에서도 60fps.',
    level: 2,
    must: [
      'FLIP 네 단계를 지킬 것: 바꾸기 전 측정 → 배치 실제로 바꾸기 → 다시 측정 → 차이를 transform 으로 거꾸로 놓고 풀기',
      '움직이는 동안 left · top · width · height 를 매 프레임 바꾸지 말 것 — transform · opacity 만',
      'transform-origin 은 왼쪽 위(0 0) — 이동 · 배율 계산과 맞게',
      '글자 요소는 같은 배율(높이 비율)로만 키울 것. 그림 · 제목을 따로 FLIP 해야 글자가 찌그러지지 않는다',
      '닫을 때도 같은 방법으로 거꾸로 (상세 → 목록). 열기 0.6~0.8초, 닫기는 조금 더 빠르게',
    ],
    done: [
      '카드를 누르면 그 카드의 그림이 끊김 없이 커져 화면 위쪽을 꽉 채우고, 제목이 그 아래 큰 글씨 자리로 날아간다',
      '전환 켜기/끄기를 바꾸면 끈 쪽은 화면이 뚝 바뀌고, 켠 쪽은 어느 카드를 눌렀는지 눈으로 따라갈 수 있다',
      '제목 글자가 움직이는 동안 가로로 늘어나거나 찌그러지지 않는다',
      '「← 목록」을 누르면 그림 · 제목이 원래 카드 자리로 정확히 돌아가 들어간다',
    ],
    code: {
      lang: 'ts',
      title: 'FLIP — 재고, 바꾸고, 다시 재고, 거꾸로 놓고 풀기',
      from: 'demos/demosMotionC.ts i548 의 go() 를 정리',
      body: `function flip(el: HTMLElement, change: () => void, dur = 700, keepAspect = false) {
  const f = el.getBoundingClientRect();          // First
  change();                                      // 배치를 실제로 바꾼다 (클래스 · 부모 바꾸기)
  const l = el.getBoundingClientRect();          // Last
  const sy = f.height / l.height;
  const s = keepAspect ? [sy, sy] : [f.width / l.width, sy];  // 글자는 같은 배율로
  el.style.transformOrigin = '0 0';
  el.animate(
    [
      { transform: 'translate(' + (f.left - l.left) + 'px,' + (f.top - l.top) + 'px) scale(' + s[0] + ',' + s[1] + ')' }, // Invert
      { transform: 'none' },                                                                                              // Play
    ],
    { duration: dur, easing: 'cubic-bezier(.2,1.25,.35,1)' },  // 살짝 지나쳤다 돌아옴
  );
}

// 카드를 누르면 그림과 제목을 따로 FLIP
card.onclick = () => {
  flip(thumb, () => thumb.classList.add('open'));
  flip(title, () => title.classList.add('open'), 700, true);
};`,
    },
    pitfalls: [
      { title: '측정 사이에 배치를 안 바꾸면 차이가 0 이 된다', fix: 'First 와 Last 사이에 실제 배치 변경(클래스 · 스타일)이 있어야 한다. 바꾸는 코드를 requestAnimationFrame 뒤로 미루면 두 측정 값이 같아져 아무 일도 없다.' },
      { title: '글자를 가로 · 세로 다른 배율로 키우면 찌그러진다', fix: '상자 비율이 바뀌면 sx ≠ sy 다. 견본처럼 그림과 제목을 따로 FLIP 하고 제목은 높이 비율 하나로 키운다.', seen: true },
      { title: '모서리 둥글기도 같이 늘어난다', fix: 'scale 은 border-radius 까지 늘린다. 둥근 모서리가 중요하면 clip-path: inset(… round r) 를 따로 애니하거나 안쪽 요소에 반대 배율을 준다.' },
      { title: '움직이는 중에 다시 누르면 엉뚱한 자리에서 시작한다', fix: '진행 중인 애니를 먼저 끝내고(transform 지우기) 측정한다. 견본은 go() 첫 줄에서 finish() 를 부른다.', seen: true },
      { title: '닫힐 때 다른 카드 밑으로 숨는다', fix: '움직이는 동안 z-index 를 올려 두고 끝나면 되돌린다.', seen: true },
    ],
    prev: ['i293', 'i292'],
    next: ['i551', 'i116'],
    refs: [
      { name: 'Paul Lewis — FLIP Your Animations', url: 'https://aerotwist.com/blog/flip-your-animations/' },
      { name: 'MDN — View Transition API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API' },
      { name: 'MDN — Element.animate()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Element/animate' },
    ],
  },

  i549: {
    id: 'i549',
    summary: '대본(시각 · 위치 · 동작)대로 가짜 커서가 곡선을 그리며 가서 멈칫 · 딸깍 — 단추가 눌리고 물결이 퍼지며, 화면은 누르는 곳으로 다가갔다 물러나 결과를 보여 준다.',
    terms: [
      { en: 'Scripted cursor / product demo animation', ko: '사람 손 대신 시간표로 움직이는 커서 — 제품 소개 영상의 기본' },
      { en: 'Click ripple · press state', ko: '누른 자리에서 퍼지는 고리 · 단추가 살짝 눌리는 상태' },
      { en: 'Auto zoom / camera follow (screen studio style)', ko: '누르기 직전 커서 쪽으로 확대, 누른 뒤 물러남' },
    ],
    goal: '{target} 화면 위에서 가짜 커서가 대본대로 움직이며 단추를 누르는 시연 애니메이션을 만들어 줘 — 곡선 이동 · 멈칫 · 딸깍 물결 · 커서 따라 확대. 분위기는 {style}.',
    targets: ['게임 아이템 상점 (담기 → 구매)', '게임 설정 화면 (켜기 · 끄기 · 저장)', '퀴즈 화면 (답 고르기 → 제출)'],
    styles: ['어두운 바탕 위 밝은 앱 창', '밝은 제품 소개 영상', '손가락 동그라미(폰 터치 시연)'],
    platforms: ['dom', 'unity', 'godot'],
    platformHints: {
      dom: '커서 · 물결 · 카메라 상자는 transform 으로. 대본은 [시각, 위치, 동작] 배열로 두고 지금 시각에서 바로 계산하면 되감기 · 영상 굽기(i82)와 맞는다.',
      unity: 'Timeline 에 커서 RectTransform 위치 트랙 + Signal 로 클릭 이벤트. 확대는 Cinemachine 또는 Canvas 의 scale.',
      godot: 'AnimationPlayer 트랙으로 커서 position · 메서드 호출(클릭). 확대는 Camera2D zoom · position.',
    },
    principle: [
      '대본 = [언제, 어디서, 어디로] 이동 목록 + [언제, 무엇을] 클릭 목록. 매 프레임 「지금 몇 초째인가」로 커서 자리 · 단추 상태 · 배지 숫자를 바로 계산한다.',
      '사람 손은 곧게 가지 않는다 — 출발 · 도착을 천천히(inOut), 길은 옆으로 살짝 휜 호(sin(πk) × 10px), 누르기 전 0.1~0.2초 멈칫.',
      '딸깍 = 커서가 0.14초 작아짐 + 단추가 1px 눌림 + 누른 자리에서 커지며 사라지는 고리. 결과(배지 +1 · 알림)는 조금 늦게 따라와야 원인과 결과가 읽힌다.',
      '확대: 목표 배율을 누르기 0.45초 전에 1.35, 누른 뒤 1 로. 실제 배율 · 초점은 지수 감쇠로 따라가고, 화면 밖 빈 곳이 보이지 않게 가둔다.',
    ],
    when: ['게임 · 앱 소개 영상, 사용법 안내, 튜토리얼 첫 화면', '「여기를 누르세요」를 말 대신 보여 줄 때'],
    avoid: ['실제 사용자가 조작하는 화면 위 — 진짜 커서와 헷갈린다. 대신 손가락 아이콘과 반투명 안내층', '긴 과정 전체 — 핵심 2~3번 누르기만 보여 주고 나머지는 컷'],
    cost: 'light',
    costNote: 'DOM 몇 개의 transform 만 바뀐다. 영상으로 구울 때(i82 · i89)는 시간을 1/30초씩 옮겨 찍으면 된다.',
    level: 2,
    must: [
      '커서 움직임 · 클릭 · 결과를 모두 「대본의 시각」에서 계산할 것 (setTimeout 을 줄줄이 걸지 않는다 — 되감기 · 속도 조절 · 영상 굽기가 깨진다)',
      '이동은 곧은 선 대신 살짝 휜 호 + inOut 이징, 누르기 전 짧게 멈춤',
      '누름 표시 3가지: 커서 작아짐 · 단추 눌림 · 퍼지는 고리. 결과는 0.3~0.5초 뒤',
      '확대는 누르는 순간 근처에만, 누른 뒤엔 물러나 결과가 화면에 다 들어오게. 화면 밖 빈 곳이 보이지 않게 이동 범위 가두기',
    ],
    done: [
      '커서가 곡선으로 가서 멈칫한 뒤 누르고, 단추가 눌리며 노란 고리가 퍼진다',
      '「담기」를 누르면 점이 장바구니로 날아가고 배지 숫자가 통 튀며 올라간다',
      '확대를 켜면 누르는 곳으로 다가갔다가 물러나고, 끄면 화면이 그대로다 — 어느 쪽이든 창 밖 빈 곳이 드러나지 않는다',
      '속도를 바꿔도 순서(누름 → 결과)가 어긋나지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '대본에서 커서 자리 계산 (휜 호 + inOut)',
      from: 'demos/demosMotionC.ts i549 의 cursorAt() 을 정리',
      body: `type P2 = [number, number];
// [시작 초, 끝 초, 출발, 도착]
const MOVES: [number, number, P2, P2][] = [
  [0.25, 1.0, [262, 166], [228, 56]],
  [1.35, 1.95, [228, 56], [228, 112]],
];
const CLICKS = [1.15, 2.1];

const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function cursorAt(p: number): P2 {
  let pos: P2 = MOVES[0][2];
  for (const [t0, t1, a, b] of MOVES) {
    if (p < t0) break;                       // 아직 시작 안 한 이동
    const k = inOut(seg(p, t0, t1));
    const nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    const arc = Math.sin(Math.PI * k) * 10;  // 사람 손처럼 옆으로 살짝 휜 길
    pos = [a[0] + (b[0] - a[0]) * k + (nx / nl) * arc, a[1] + (b[1] - a[1]) * k + (ny / nl) * arc];
  }
  return pos;
}

// 확대: 누르기 직전에만 목표 1.35, 실제 값은 부드럽게 따라감
const zt = CLICKS.some((c) => p > c - 0.45 && p < c + 0.2) ? 1.35 : 1;
z += (zt - z) * (1 - Math.exp(-dt * 6));`,
    },
    pitfalls: [
      { title: '계속 확대해 두면 결과가 화면 밖에 있다', fix: '처음엔 줄곧 1.5 배로 따라갔더니 장바구니 배지가 잘려 보이지 않았다. 누르는 순간 근처에만 확대하고 물러나 결과를 보여 준다.', seen: true },
      { title: 'setTimeout 으로 이어 붙이면 속도 · 되감기가 깨진다', fix: '탭을 숨겼다 오면 타이머가 몰려 터진다. 대본을 시각 목록으로 두고 매 프레임 지금 시각으로 계산한다.' },
      { title: '결과가 누름과 같은 순간에 나오면 원인이 안 읽힌다', fix: '날아가는 점 · 배지 변화를 0.3~0.5초 늦게 — 눈이 커서에서 결과로 옮겨 갈 시간.', seen: true },
      { title: '확대 초점이 커서를 딱 붙어 따라가면 어지럽다', fix: '초점 · 배율 모두 지수 감쇠(1 − e^(−dt·k))로 늦게 따라가게 하고, 이동 범위를 화면 안으로 가둔다.' },
    ],
    prev: ['i292', 'i89'],
    next: ['i82', 'i127'],
    refs: [{ name: 'MDN — Using the Web Animations API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API' }],
  },

  i550: {
    id: 'i550',
    summary: '맨 위 카드를 끄는 만큼 기울고 도장이 비치며, 문턱을 넘겨 놓으면 속도를 이어 날아가고 뒤 카드가 통 올라온다 — 못 넘기면 스프링으로 제자리.',
    terms: [
      { en: 'Swipe card stack (Tinder-style swipe)', ko: '좌우로 넘겨 고르는 카드 더미' },
      { en: 'Pointer events + drag threshold', ko: '끈 거리(또는 놓을 때 속도)가 문턱을 넘었는지로 결정' },
      { en: 'Fling with release velocity', ko: '놓는 순간 속도를 이어 받아 날아감' },
      { en: 'Spring back (damped oscillation)', ko: '문턱 아래면 감쇠 진동으로 제자리' },
    ],
    goal: '{target}을(를) 좌우로 끌어 넘기는 카드 더미로 만들어 줘 — 끄는 만큼 기울고 도장이 비치고, 문턱을 넘겨 놓으면 날아가며 뒤 카드가 올라오고, 못 넘기면 스프링으로 돌아오게. 분위기는 {style}.',
    targets: ['캐릭터 카드 (좋아요 · 패스)', '문제 카드 (알아요 · 몰라요)', '오늘의 보상 고르기'],
    styles: ['보라 바탕 · 둥근 카드', '종이 카드 · 손그림 도장', '밝은 앱'],
    platforms: ['dom', 'unity', 'godot'],
    platformHints: {
      dom: 'pointerdown · pointermove · pointerup 과 setPointerCapture. 카드에 touch-action: none 을 줘야 폰에서 화면이 같이 스크롤되지 않는다.',
      unity: 'IDragHandler · IEndDragHandler 로 끈 거리 · 속도를 받고 RectTransform 위치 · 회전을 바꾼다.',
      godot: 'Control 의 _gui_input 에서 InputEventScreenDrag 의 relative · velocity 를 쓴다.',
    },
    principle: [
      '끄는 동안: 카드 위치 = 손가락이 옮겨 간 거리 dx, 회전 = dx × 0.13°(아래쪽 축 기준이라 손잡이처럼 기운다). 도장 투명도 = |dx| ÷ 문턱.',
      '놓을 때: |dx| 가 문턱(카드 폭의 절반쯤)을 넘거나 놓는 속도가 빠르면 그 방향으로 날려 보낸다. 날아가는 속도는 놓는 순간 속도를 이어 받아 가속.',
      '문턱 아래면 dx = 처음 거리 × e^(−7t) × cos(11t) 로 출렁이며 제자리 — 「아깝다」가 느껴진다.',
      '뒤 카드는 등수 r 마다 아래로 9px · 5% 작게. 앞 카드를 끄는 동안 조금(20%) 올라오고, 날아가면 한 칸 올라와 맨 위 자리에 딱 맞는다.',
    ],
    when: ['하나씩 보고 두 갈래로 고르는 화면 (좋아요/패스, 알아요/몰라요)', '카드 수집 · 뽑기 결과를 한 장씩 넘겨 볼 때'],
    avoid: ['고를 것이 셋 이상이면 — 대신 단추 · 목록', '접근성이 중요하면 끌기만 두지 말 것 — 같은 일을 하는 단추(✕ · ♥)를 함께'],
    cost: 'light',
    costNote: '카드 4장만 DOM 에 두고 내용을 갈아 끼운다(가상화). 움직임은 transform · opacity 만.',
    level: 2,
    must: [
      '카드는 보이는 3~4장만 만들고, 넘어가면 내용을 갈아 끼울 것 (수백 장을 다 만들지 않는다)',
      '문턱은 거리 또는 놓는 속도 둘 중 하나라도 넘으면 넘김 — 빠르게 튕겨도 넘어가게',
      '문턱 아래로 놓으면 스프링(감쇠 진동)으로 제자리, 뒤 카드도 같이 내려감',
      '폰: touch-action: none, setPointerCapture 로 손가락이 카드 밖으로 나가도 끌기 유지',
      '끌기 말고 단추로도 같은 동작',
    ],
    done: [
      '끄는 만큼 카드가 기울고, 오른쪽이면 「좋아요」 왼쪽이면 「패스」 도장이 진해진다',
      '문턱을 넘겨 놓으면 카드가 그 방향으로 가속하며 날아가고 뒤 카드가 통 올라와 맨 위 자리에 딱 맞는다',
      '문턱 전에 놓으면 출렁이며 제자리로 돌아오고 아무 일도 없다',
      '문턱 눈금을 켜면 지금 끈 거리 점과 문턱이 보이고, 넘으면 노랗게 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '끌기 · 문턱 · 날리기 · 스프링 복귀',
      from: '새로 씀 (demos/demosMotionC.ts i550 의 식을 실제 손 입력에 붙인 꼴)',
      body: `const TH = 50;                          // 문턱 (px)
let x0 = 0, dx = 0, lastX = 0, lastT = 0, vx = 0;
card.style.touchAction = 'none';
card.onpointerdown = (e) => { card.setPointerCapture(e.pointerId); x0 = e.clientX; lastX = x0; lastT = e.timeStamp; };
card.onpointermove = (e) => {
  if (!card.hasPointerCapture(e.pointerId)) return;
  dx = e.clientX - x0;
  vx = (e.clientX - lastX) / Math.max(1, e.timeStamp - lastT);  // px/ms
  lastX = e.clientX; lastT = e.timeStamp;
  card.style.transform = 'translateX(' + dx + 'px) rotate(' + dx * 0.13 + 'deg)';
  yes.style.opacity = String(Math.min(1, Math.max(0, dx / TH)));
  no.style.opacity = String(Math.min(1, Math.max(0, -dx / TH)));
};
card.onpointerup = () => {
  const dir = Math.sign(dx || vx);
  if (Math.abs(dx) > TH || Math.abs(vx) > 0.6) {
    // 놓는 속도를 이어 받아 날아감
    card.animate([{ transform: card.style.transform }, { transform: 'translate(' + dir * 500 + 'px, 60px) rotate(' + dir * 40 + 'deg)', opacity: 0 }],
      { duration: 380, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).onfinish = nextCard;
  } else {
    // 문턱 아래 — 출렁이며 제자리 (감쇠 진동)
    const a = dx, t0 = performance.now();
    const step = (now: number) => {
      const s = (now - t0) / 1000, x = a * Math.exp(-7 * s) * Math.cos(11 * s);
      card.style.transform = 'translateX(' + x + 'px) rotate(' + x * 0.13 + 'deg)';
      if (s < 0.6) requestAnimationFrame(step); else card.style.transform = '';
    };
    requestAnimationFrame(step);
  }
};`,
    },
    pitfalls: [
      { title: '폰에서 끌면 화면이 같이 스크롤된다', fix: '카드에 touch-action: none 을 주고 pointer 이벤트를 쓴다. touchmove 의 preventDefault 는 passive 리스너에서 무시된다.' },
      { title: '문턱 표시를 카드 아래 두면 카드에 가려 안 보인다', fix: '견본도 처음엔 문턱 세로선을 카드 뒤에 그렸다가 가려졌다 — 위쪽에 작은 눈금(끈 거리 점 + 문턱 표시)으로 옮겼다.', seen: true },
      { title: '거리만 보면 빠르게 튕긴 손짓이 안 넘어간다', fix: '놓기 직전 속도도 함께 본다 (|vx| > 0.6 px/ms 정도).' },
      { title: '뒤 카드가 날아간 뒤에야 올라오면 굼뜨다', fix: '끄는 동안 이미 조금 올라오게(끈 비율 × 20%) — 앞 카드를 놓는 순간 남은 거리만 채운다.', seen: true },
    ],
    prev: ['i293', 'i420'],
    next: ['i548', 'i425'],
    refs: [
      { name: 'MDN — Pointer events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events' },
      { name: 'MDN — touch-action', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action' },
    ],
  },

  i551: {
    id: 'i551',
    summary: '알림은 옆에서 밀고 들어와 먼저 온 것을 아래로 밀고, 창은 뒤를 흐리며 출렁 커진 뒤 내용이 차례로 나온다 — 나갈 땐 들어올 때보다 빠르게.',
    terms: [
      { en: 'Toast notification stack', ko: '잠깐 떴다 사라지는 알림 — 쌓이면 서로 밀어냄' },
      { en: 'Modal dialog with backdrop blur (backdrop-filter)', ko: '뒤 화면을 흐리고 어둡게 덮는 창' },
      { en: 'Staggered entrance', ko: '내용을 0.05~0.1초씩 차례로 등장' },
      { en: 'Asymmetric enter / exit timing', ko: '들어올 땐 느긋하게 · 나갈 땐 빠르게' },
    ],
    goal: '{target} 화면에 쌓이는 알림과 보상 창 등장 연출을 만들어 줘 — 알림은 밀고 들어와 서로 밀어내고, 창은 뒤를 흐리며 출렁 커지고 내용이 차례로. 분위기는 {style}.',
    targets: ['게임 플레이 화면 (레벨 업 · 보상)', '앱 홈 화면 (업적 · 친구 알림)', '퀴즈 결과 화면'],
    styles: ['밝은 게임 UI · 통통 튀게', '어두운 반투명 알림 · 차분하게', '종이 · 스티커 느낌'],
    platforms: ['dom', 'unity', 'godot'],
    platformHints: {
      dom: '뒤 흐림은 backdrop-filter: blur() + 반투명 바탕. 흐림 값을 매 프레임 바꾸지 말고 고정해 두고 opacity 로만 나타나게.',
      unity: 'UI 알림은 VerticalLayoutGroup 없이 직접 위치 트윈(레이아웃 그룹은 튕기며 밀어내기를 못 함). 뒤 흐림은 URP 블러 패스 또는 미리 흐린 스크린샷.',
      godot: 'VBoxContainer 대신 직접 position 트윈. 뒤 흐림은 BackBufferCopy + 블러 셰이더.',
    },
    principle: [
      '알림마다 「있음」 = 들어옴(0→1) × (1 − 나감). 내 세로 자리 = 위 여백 + 알림 높이 × (나보다 늦게 온 알림들의 있음 합) — 새 알림이 들어오는 만큼 부드럽게 밀려 내려간다.',
      '알림 아래 막대가 줄어들어 「곧 사라짐」을 보여 준다. 오래된 것(맨 아래)부터 옆으로 빠져나간다.',
      '창: 뒤 흐림층이 0.3초 나타나고, 창은 0.8 → 1 배로 출렁(outBack), 내용은 0.08초 간격으로 차례로 튀어나온다.',
      '나갈 때는 0.18초로 들어올 때(0.45초)보다 빠르게 — 사용자가 닫기로 한 순간부터는 기다리게 하지 않는다.',
    ],
    when: ['레벨 업 · 보상 · 업적처럼 「축하」 순간', '여러 알림이 짧은 사이에 몰려올 때'],
    avoid: ['중요한 오류 · 확인이 필요한 일을 저절로 사라지는 알림으로 — 대신 닫기 단추 있는 창', '매 판마다 같은 큰 창 — 반복되면 짜증. 대신 작은 알림'],
    cost: 'light',
    costNote: 'backdrop-filter 는 덮는 면적만큼 비싸다(화면 전체 흐림 = 폰에서 몇 ms). 흐림 반경을 작게(3~6px) 두고 애니는 opacity 로.',
    level: 1,
    must: [
      '알림 세로 자리를 「목록 순서 × 높이」로 뚝 바꾸지 말고, 들어오고 나가는 정도(이어진 값)로 계산해 미끄러지게',
      '알림에 남은 시간 막대 + 저절로 사라짐. 같은 알림이 겹치면 하나로 묶기(×2)',
      '창: 뒤 흐림층 → 창 출렁 → 내용 차례로 (간격 0.05~0.1초). 나갈 때는 0.2초 안에',
      'backdrop-filter 의 blur 값은 고정하고 opacity 만 애니',
      'prefers-reduced-motion 이면 출렁임 · 차례 등장을 끄고 흐려지기만',
    ],
    done: [
      '알림 셋이 차례로 들어오며 먼저 온 것이 부드럽게 아래로 밀리고, 오래된 것부터 옆으로 빠진다',
      '알림 아래 막대가 줄어 사라질 때를 알 수 있다',
      '창이 뜰 때 뒤 화면이 흐려지고, 보상 칸 셋이 차례로 통통 튀어나온다 — 간격 조절을 0 으로 하면 한꺼번에 나온다',
      '「받기」를 누르면 창이 들어올 때보다 눈에 띄게 빨리 사라진다',
    ],
    code: {
      lang: 'ts',
      title: '알림 쌓기 — 「있음」 합으로 세로 자리',
      from: 'demos/demosMotionC.ts i551 의 update 를 정리',
      body: `const H = 26, TOP = 8, LIFE = 2.4;
const outCubic = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const seg = (p: number, a: number, b: number) => Math.min(1, Math.max(0, (p - a) / (b - a)));

// toasts: { el, born } — born = 들어온 시각(초). now = 지금 시각
function layout(toasts: { el: HTMLElement; born: number }[], now: number) {
  const pres = toasts.map((t) => outCubic(seg(now, t.born, t.born + 0.4)) * (1 - seg(now, t.born + LIFE, t.born + LIFE + 0.3)));
  toasts.forEach((t, j) => {
    let below = 0;
    for (let k = j + 1; k < toasts.length; k++) below += pres[k];   // 나보다 늦게 온 것만큼 아래로
    const enter = outCubic(seg(now, t.born, t.born + 0.45));
    const leave = seg(now, t.born + LIFE, t.born + LIFE + 0.3);
    t.el.style.transform = 'translate(' + ((1 - enter) * 130 + leave * 130) + 'px,' + (TOP + H * below) + 'px)';
    t.el.style.opacity = String(1 - leave);
  });
}

// 창 내용 차례로: i 번째는 open + 0.3 + i × stagger 에 시작
items.forEach((el, i) => el.animate(
  [{ opacity: 0, transform: 'translateY(8px) scale(.6)' }, { opacity: 1, transform: 'none' }],
  { delay: 300 + i * 80, duration: 350, easing: 'cubic-bezier(.34,1.8,.64,1)', fill: 'backwards' }));`,
    },
    pitfalls: [
      { title: '새 알림이 오면 기존 알림이 뚝 한 칸 내려간다', fix: '순서 번호로 자리를 정하면 그렇다. 늦게 온 알림들의 「있음」(0~1 이어진 값)을 더해 자리로 쓰면 미끄러진다.', seen: true },
      { title: 'backdrop-filter 의 blur 를 애니하면 폰에서 버벅인다', fix: '흐림 반경이 바뀔 때마다 다시 계산한다. 반경은 고정, 층의 opacity 만 바꾼다.', seen: true },
      { title: '들어올 때와 나갈 때를 같은 길이로 하면 굼뜨다', fix: '닫기는 사용자가 정한 일 — 0.15~0.2초로 빠르게, 출렁임 없이.' },
      { title: '차례 등장이 길면 내용을 기다려야 한다', fix: '간격 × 개수가 0.4초를 넘지 않게. 항목이 많으면 간격을 줄이거나 앞 몇 개만.' },
    ],
    prev: ['i102', 'i293'],
    next: ['i208', 'i438'],
    refs: [
      { name: 'MDN — backdrop-filter', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter' },
      { name: 'MDN — prefers-reduced-motion', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion' },
    ],
  },

  i552: {
    id: 'i552',
    summary: '순서도 상자가 차례로 튀어나오고 선이 그려져 화살촉이 꽂힌 뒤, 데이터 점이 선을 따라 돌며 지나간 상자가 반짝 — 규칙 · 과정이 「흐름」으로 읽힌다.',
    terms: [
      { en: 'Animated flowchart / diagram', ko: '상자 · 선이 차례로 나타나고 흐름이 움직이는 도표' },
      { en: 'SVG stroke-dashoffset line drawing', ko: '대시 길이 = 선 길이로 두고 오프셋을 줄여 선을 그려 나가기' },
      { en: 'getTotalLength · getPointAtLength', ko: 'SVG 경로 길이 · 길이 위치의 점 — 점을 선 따라 움직이기' },
      { en: 'Traveling packet / data flow dots', ko: '선을 따라 흐르는 점 — 무엇이 어디로 가는지' },
    ],
    goal: '{target}을(를) 움직이는 순서도로 만들어 줘 — 상자가 차례로 튀어나오고 선이 그려져 화살촉이 꽂힌 뒤, 데이터 점이 선을 따라 돌며 지나간 상자가 반짝이게. 분위기는 {style}.',
    targets: ['퀴즈 진행 규칙 (입력 → 판정 → 점수/힌트)', '게임 한 판의 흐름 (시작 → 턴 → 승패)', '정렬 · 길찾기 알고리즘 단계'],
    styles: ['밝은 모눈 바탕 · 파란 선', '어두운 칠판 · 분필 색', '손그림 화이트보드'],
    platforms: ['dom', 'canvas', 'unity', 'godot'],
    platformHints: {
      dom: 'SVG path 마다 stroke-dasharray = 길이, stroke-dashoffset 을 길이 → 0. 화살촉은 marker 대신 따로 그린 삼각형(marker 는 대시와 상관없이 처음부터 보인다).',
      canvas: 'setLineDash([L, L]) + lineDashOffset 로 같은 효과. 곡선 위 점은 베지어 식으로 직접 계산.',
      unity: 'LineRenderer 의 positionCount 를 늘리거나 셰이더에서 UV.x 로 잘라 그리기. 점은 경로 점 목록을 거리로 보간.',
      godot: 'Line2D 의 points 를 늘리거나 Path2D + PathFollow2D(progress_ratio)로 점 이동.',
    },
    principle: [
      '선 그리기: 경로 길이 L 을 재서 stroke-dasharray 를 「L L」로 — 대시 하나가 선 전체. dashoffset 을 L → 0 으로 줄이면 시작에서 끝으로 그려진다.',
      '차례: 상자 → 그 상자에서 나가는 선 → 다음 상자. 상자는 outBack 으로 통, 선이 85% 쯤 그려졌을 때 화살촉이 나타난다.',
      '흐름: 점마다 「지금까지 걸은 시간」으로 어느 선 위 어디인지 계산한다 — 선 길이 ÷ 빠르기 = 걸리는 시간, 상자에서 0.15초 머묾. 갈림길은 정해 둔 무늬(예/아니오)로.',
      '점이 상자에 닿은 뒤 0.4초 동안 상자 테두리가 굵고 노랗게 — 「여기서 처리됨」. 갈림길 선은 예 = 초록, 아니오 = 빨강으로 잠깐 물든다.',
    ],
    when: ['게임 규칙 · 진행 순서를 말 대신 보여 줄 때', '알고리즘 · 과정 설명 영상, 튜토리얼'],
    avoid: ['상자가 20개 넘는 큰 도표 — 한 번에 다 그리면 눈이 못 따라간다. 대신 부분씩 확대(i104)', '선이 서로 많이 겹치는 그래프 — 대신 나무 구조(i553) 나 층 배치'],
    cost: 'light',
    costNote: 'SVG 요소 수십 개. getPointAtLength 는 매 프레임 점 몇 개만. 길이 측정은 처음 한 번.',
    level: 2,
    must: [
      '선은 stroke-dasharray = 경로 길이, stroke-dashoffset 을 줄여 그리기 (길이는 getTotalLength 로 한 번 재 두기)',
      '화살촉은 선이 거의 다 그려진 뒤에 나타나게 — marker-end 를 쓰면 처음부터 끝에 보이므로 따로 그린다',
      '흐르는 점의 자리는 「지금 시각」에서 계산 (선 길이 ÷ 빠르기, 상자에서 잠깐 머묾) — 속도가 바뀌어도 어긋나지 않게',
      '지나간 상자 반짝 · 갈림길 색(예 초록 · 아니오 빨강)으로 어느 길로 갔는지 보이게',
      '글자 크기는 폰(390px 폭)에서도 읽히게 — 상자 글 최소 11px',
    ],
    done: [
      '상자가 시작부터 차례로 통 튀어나오고, 상자 사이 선이 시작에서 끝 방향으로 그려진 뒤 화살촉이 꽂힌다',
      '노란 점이 「답 입력 → 맞았나? → 예/아니오 → 다시」를 돌고, 지나간 상자 테두리가 잠깐 노랗게 굵어진다',
      '「예」로 가면 그 선이 초록, 「아니오」면 빨강으로 물든다',
      '흐르는 점 수를 1 → 3 으로 바꾸면 점이 셋 돌고, 속도를 바꿔도 점이 선을 벗어나지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '선 그리기 + 선 따라 점 옮기기',
      from: 'demos/demosMotionD.ts i552 의 measure · update 를 정리',
      body: `const paths = [...svg.querySelectorAll<SVGPathElement>('path.edge')];
const lens = paths.map((p) => p.getTotalLength());
paths.forEach((p, i) => (p.style.strokeDasharray = lens[i] + ' ' + lens[i]));

// 화살촉: 끝 바로 앞 점 → 끝 점 방향으로 돌려 끝에 놓기
paths.forEach((p, i) => {
  const a = p.getPointAtLength(lens[i] - 1.5), b = p.getPointAtLength(lens[i]);
  heads[i].setAttribute('transform', 'translate(' + b.x + ' ' + b.y + ') rotate(' + Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + ')');
});

function drawEdge(i: number, k: number) {             // k: 0 → 1
  paths[i].style.strokeDashoffset = String(lens[i] * (1 - k));
  heads[i].style.opacity = String(Math.min(1, Math.max(0, (k - 0.85) / 0.15)));
}

// 점: 경로 목록을 따라 걷기 (V = 빠르기, WAIT = 상자에서 머묾)
function dotAt(t: number, route: number[]): DOMPoint | null {
  for (const ei of route) {
    const dur = lens[ei] / V;
    if (t < dur) return paths[ei].getPointAtLength(lens[ei] * t / dur);
    t -= dur;
    if (t < WAIT) return paths[ei].getPointAtLength(lens[ei]);  // 상자에서 잠깐 머묾
    t -= WAIT;
  }
  return null;
}`,
    },
    pitfalls: [
      { title: 'marker-end 화살촉은 선이 그려지기 전부터 끝에 떠 있다', fix: 'marker 는 대시와 상관없이 경로 끝에 그려진다. 화살촉을 따로 그리고 선이 85% 넘게 그려지면 나타나게 했다.', seen: true },
      { title: '화면에 붙기 전에 getTotalLength 를 부르면 0 이 나올 수 있다', fix: '요소가 문서에 들어간 뒤 재고, 0 이면 다음 프레임에 다시 잰다 (견본은 update 첫머리에서 확인).', seen: true },
      { title: '모양을 확대 · 축소하면 dasharray 가 안 맞는다', fix: 'vector-effect 나 transform 으로 크기가 바뀌면 길이도 바뀐다. 길이를 다시 재거나 pathLength="1" 로 정규화한다.' },
      { title: '점을 setInterval 로 한 칸씩 옮기면 속도 · 되감기가 깨진다', fix: '지금 시각에서 걸은 거리를 계산해 바로 자리를 구한다.' },
    ],
    prev: ['i80', 'i79'],
    next: ['i553', 'i81'],
    refs: [
      { name: 'MDN — stroke-dashoffset', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset' },
      { name: 'MDN — SVGGeometryElement.getPointAtLength()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement/getPointAtLength' },
    ],
  },

  i553: {
    id: 'i553',
    summary: '자식 마디가 부모 자리에서 나와 제자리로 가며 가지가 늘어나고, 열린 길을 따라 금빛이 번지며, 가지를 접으면 부모 속으로 쏙 들어간다.',
    terms: [
      { en: 'Tree layout expand / collapse animation', ko: '나무 구조 펼치기 · 접기' },
      { en: 'Skill tree / mind map', ko: '기술 나무 · 생각 지도' },
      { en: 'Animate from parent position (enter / exit transitions)', ko: '새 마디는 부모 자리에서 나오고, 없어질 땐 부모로 돌아감' },
      { en: 'pathLength="1" normalized dash', ko: '경로 길이를 1 로 정해 대시 오프셋을 0~1 로 다루기' },
    ],
    goal: '{target}을(를) 펼쳐지는 나무 구조로 만들어 줘 — 자식이 부모 자리에서 나와 제자리로 가며 가지가 늘어나고, 열린 길을 따라 금빛이 번지고, 가지를 접으면 부모 속으로 들어가게. 분위기는 {style}.',
    targets: ['게임 기술 나무 (공격 · 방어 · 이동)', '단원 지도 (큰 단원 → 작은 주제)', '분류 설명 (동물 → 무리 → 종)'],
    styles: ['어두운 남색 · 가지마다 다른 색', '밝은 마인드맵 · 둥근 상자', '양피지 · 금빛'],
    platforms: ['dom', 'canvas', 'unity', 'godot'],
    platformHints: {
      dom: '마디는 SVG g 의 transform(translate · scale), 가지는 매 프레임 부모 · 자식 현재 자리로 path d 를 다시 만든다.',
      canvas: '매 프레임 마디 자리를 계산해 베지어 선 · 원을 그린다 — 같은 식.',
      unity: '마디 위치를 부모 위치와 목표 사이에서 트윈, 가지는 LineRenderer 두 끝을 매 프레임 갱신.',
      godot: '마디 position 을 Tween, 가지는 Line2D points 를 _process 에서 갱신.',
    },
    principle: [
      '배치는 먼저 고정해 둔다(깊이마다 줄, 잎 수만큼 가로 나눔). 애니는 「펼침 k」 하나로: 자식 자리 = lerp(부모의 지금 자리, 제자리, k), 크기 = k.',
      '부모도 움직이면 자식은 「부모의 지금 자리」를 따라가므로 접힐 때 손자까지 한꺼번에 딸려 들어간다.',
      'k 는 outBack — 제자리를 살짝 지나쳤다 돌아온다. 깊이마다 · 형제마다 0.05~0.1초씩 늦춰 물결처럼 퍼진다.',
      '가지는 부모 아래 → 자식 위를 잇는 S 자 베지어. 열린 길은 같은 경로를 금빛으로 한 번 더 그리고 pathLength="1" 대시 오프셋 1 → 0 으로 번지게, 닿은 마디는 고리가 퍼지며 금빛.',
    ],
    when: ['기술 나무 · 업그레이드 화면', '분류 · 계층을 차근차근 펼쳐 설명할 때'],
    avoid: ['마디가 수백 개 — 대신 한 가지만 펼치고 나머지는 접어 두기', '이어짐이 나무가 아닌 그물(여러 부모) — 대신 흐름도(i552) · 힘 배치 그래프'],
    cost: 'light',
    costNote: '마디 수십 개의 transform 과 가지 path 문자열을 매 프레임 갱신 — 100개 아래면 폰에서도 1ms 안팎.',
    level: 2,
    must: [
      '자식은 늘 「부모의 지금 자리」에서 제자리 사이를 보간할 것 (부모의 원래 자리가 아니라) — 접힐 때 손자가 따라 들어가게',
      '펼침 · 접힘은 깊이 순서대로(펼칠 땐 위에서 아래, 접을 땐 아래에서 위) 0.05~0.1초 차례',
      '가지는 매 프레임 두 마디의 지금 자리로 다시 그리기 — 마디와 가지가 어긋나지 않게',
      '접힌 마디에는 숨은 자식 수 표시(+2)',
      '열린 길은 금빛이 부모에서 자식 쪽으로 번지고, 닿은 마디에 고리 퍼짐',
    ],
    done: [
      '뿌리가 통 나오고 자식들이 뿌리 자리에서 쏙 나와 제자리로 가며 가지가 늘어난다 (살짝 지나쳤다 돌아옴)',
      '「기본기 → 이동 → 이단 뛰기」 길로 금빛이 번지고, 닿은 마디에 고리가 퍼지며 금색이 된다',
      '「공격」 가지를 접으면 연타 · 강타가 공격 속으로 들어가고 +2 표시가 생기며, 다시 펴면 나온다',
      '마지막에 전체가 아래에서부터 뿌리로 모여 사라진다',
    ],
    code: {
      lang: 'ts',
      title: '부모의 지금 자리에서 펼치기 + 가지 다시 그리기',
      from: 'demos/demosMotionD.ts i553 의 update 를 정리',
      body: `// N: [x, y, 부모 번호] — 부모가 자식보다 앞에 오게 (깊이 순)
const pos: number[][] = [];
N.forEach((n, i) => {
  const k = K[i];                                   // 펼침 정도 (outBack, 1 을 살짝 넘음)
  if (n[2] < 0) pos[i] = [n[0], n[1]];
  else {
    const pp = pos[n[2]];                           // 부모의 「지금」 자리
    pos[i] = [pp[0] + (n[0] - pp[0]) * k, pp[1] + (n[1] - pp[1]) * k];
  }
  nodes[i].setAttribute('transform', 'translate(' + pos[i][0] + ' ' + pos[i][1] + ') scale(' + Math.max(0, k) + ')');
});

// 가지: 부모 아래 → 자식 위, 가운데 높이에서 꺾이는 S 자
function link(a: number[], b: number[], ra: number, rb: number) {
  const my = (a[1] + b[1]) / 2;
  return 'M' + a[0] + ' ' + (a[1] + ra) + ' C' + a[0] + ' ' + my + ' ' + b[0] + ' ' + my + ' ' + b[0] + ' ' + (b[1] - rb);
}
N.forEach((n, i) => { if (i) links[i - 1].setAttribute('d', link(pos[n[2]], pos[i], 10 * K[n[2]], 10 * K[i])); });

// 금빛 길: <path pathLength="1" stroke-dasharray="1 1"> 의 오프셋 1 → 0
gold.style.strokeDashoffset = String(1 - g);`,
    },
    pitfalls: [
      { title: '자식이 부모의 원래 자리에서 보간하면 접힐 때 허공으로 간다', fix: '부모가 접히며 움직이는 중이면 자식도 「부모의 지금 자리」를 기준으로 해야 같이 빨려 든다. 그래서 부모를 먼저 계산하는 깊이 순서로 돈다.', seen: true },
      { title: '가지를 처음 한 번만 그리면 마디와 어긋난다', fix: '마디가 움직이는 동안은 매 프레임 path d 를 다시 만든다 — 문자열 몇 개라 가볍다.', seen: true },
      { title: '금빛 길 길이를 매번 재면 번거롭다', fix: 'pathLength="1" 을 주면 dasharray "1 1" 과 오프셋 0~1 로 길이와 상관없이 번지게 할 수 있다.', seen: true },
      { title: 'outBack 의 1 넘는 값으로 크기를 키우면 마디가 순간 커 보인다', fix: '자리는 1 을 넘어도 되지만(지나쳤다 돌아옴) 크기는 1.1 정도로 막거나 그대로 두고 확인한다.' },
    ],
    prev: ['i552', 'i292'],
    next: ['i548', 'i101'],
    refs: [
      { name: 'MDN — pathLength', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/pathLength' },
      { name: 'Wikipedia — Tree drawing', url: 'https://en.wikipedia.org/wiki/Tree_drawing' },
    ],
  },

  i554: {
    id: 'i554',
    summary: '코드가 사람 박자로 한 글자씩 쳐지며 바로 색이 입혀진다 — 글자 간격이 들쭉날쭉하고 줄바꿈 앞에서 쉬며, 오타를 냈다 지우고 고친다.',
    terms: [
      { en: 'Typewriter code animation (typing effect)', ko: '코드가 한 글자씩 쳐지는 연출' },
      { en: 'Syntax highlighting (tokenizer)', ko: '낱말 종류(예약어 · 숫자 · 문자열 · 주석 · 함수)마다 색' },
      { en: 'Keystroke timeline (human typing rhythm)', ko: '글쇠마다 시각을 정한 시간표 — 지우기 포함' },
      { en: 'Blinking caret', ko: '치는 동안 켜져 있고 멈추면 깜박이는 커서' },
    ],
    goal: '{target}을(를) 코드 편집기에서 사람이 치는 것처럼 보여 줘 — 사람 박자 · 오타 고치기 · 치는 즉시 문법 색 · 커서 깜박임. 분위기는 {style}.',
    targets: ['짧은 함수 (점수 계산)', '게임 설정 JSON', '터미널 명령 · 해커 연출'],
    styles: ['어두운 편집기 (보라 · 파랑 · 주황 색)', '밝은 편집기', '초록 글자 터미널'],
    platforms: ['dom', 'canvas', 'unity', 'godot'],
    platformHints: {
      dom: '글이 바뀐 프레임에만 innerHTML 을 다시 만든다. white-space: pre + 고정폭 글꼴.',
      canvas: '줄마다 낱말을 색별로 fillText — measureText 로 x 를 이어 간다.',
      unity: 'TextMeshPro 의 리치 텍스트(<color=#…>) + maxVisibleCharacters 대신 글 자체를 시간표로 바꾸기(지우기 때문).',
      godot: 'RichTextLabel 의 BBCode [color] + text 를 시간표로 갱신.',
    },
    principle: [
      '시간표 만들기: 글자마다 「언제 칠지」를 미리 정한다. 기본 간격 30~75ms 를 글자마다 다르게, 띄어쓰기 · 괄호 뒤 조금 더, 새 줄 앞 0.28초(생각), 오타는 틀린 글자 → 0.38초 멈칫 → 지우기 → 바르게.',
      '지금 시각까지의 글쇠를 차례로 적용해 글을 만든다 (지우기 = 끝 글자 하나 빼기). 이렇게 하면 되감기 · 속도 조절 · 영상 굽기가 그대로 된다.',
      '색은 줄마다 정규식 하나로 낱말을 나눠 종류별 span. 치는 도중의 반쪽 낱말(「functio」)은 아직 이름 색이다가 다 치는 순간 예약어 색 — 진짜 편집기처럼.',
      '커서는 마지막 글쇠 뒤 0.45초 동안 켜져 있고, 그 뒤 0.53초 간격 깜박. 지금 줄은 바탕을 살짝 밝게.',
    ],
    when: ['코딩 설명 영상 · 개발 일지 · 게임 속 해커 · 컴퓨터 장면', '「이 코드가 이렇게 생겼다」를 차근차근 보여 줄 때'],
    avoid: ['긴 코드 전체 — 지루하다. 대신 핵심 몇 줄만 치고 나머지는 코드 모양 바꾸기(i555)', '읽어야 하는 설명문 — 대신 한 번에 보여 주고 강조'],
    cost: 'light',
    costNote: '글이 바뀐 프레임에만 몇 줄의 HTML 을 다시 만든다 (초당 15~30번). 커서 깜박임은 opacity 만.',
    level: 1,
    must: [
      '글쇠 시간표(글자 · 지우기 · 시각)를 미리 만들고, 지금 시각까지 적용해 글을 만들 것 — setInterval 로 한 글자씩 붙이지 않는다',
      '간격은 일정하지 않게(30~75ms), 새 줄 앞에서 쉬기, 오타 한 번 → 멈칫 → 지우기 → 고치기',
      '문법 색은 치는 동안에도 입혀질 것 (반쪽 낱말 포함). 꺾쇠 < > & 는 HTML 이스케이프',
      '커서: 치는 중엔 켜짐, 멈추면 깜박. 지금 줄 바탕 강조',
      '글이 바뀐 프레임에만 다시 그리기',
    ],
    done: [
      '글자가 일정하지 않은 박자로 쳐지고 줄이 바뀔 때 잠깐 쉰다',
      '「bonus」를 치다 「bou」로 틀린 뒤 멈칫하고 지워서 바르게 고친다',
      '「function」이 다 쳐지는 순간 보라색으로 바뀌고, 숫자 · 주석 · 함수 이름이 각자 색이다',
      '「사람 같은 박자」를 끄면 일정한 간격에 오타 없이 쳐진다 — 둘을 비교하면 켠 쪽이 사람 같다',
    ],
    code: {
      lang: 'ts',
      title: '글쇠 시간표 만들기 (사람 박자 + 오타)',
      from: 'demos/demosMotionD.ts i554 의 build() 를 정리',
      body: `type Op = { ch: string | null; at: number };   // ch = null 이면 지우기
function buildOps(src: string, typoAt: number, wrong: string): Op[] {
  const ops: Op[] = [];
  let t = 0.4;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    let d = 0.03 + ((i * 0.618) % 1) * 0.045;      // 글자마다 다른 간격
    if (ch === ' ') d += 0.03;
    if (src[i - 1] === '\\n') d += 0.28;             // 새 줄 앞에서 생각
    if ('(){};'.includes(ch)) d += 0.04;
    if (i === typoAt) {
      for (const c of wrong) ops.push({ ch: c, at: (t += 0.06) });   // 예: 'bou'
      t += 0.38;                                     // 틀린 걸 알아챔
      ops.push({ ch: null, at: (t += 0.1) });        // 지우기
      t += 0.12;
      i += wrong.length - 2;                         // 맞게 친 글자만큼 건너뛰기
      continue;
    }
    ops.push({ ch, at: (t += d) });
  }
  return ops;
}

// 지금 시각 p 까지 적용
let text = '';
for (const op of ops) { if (op.at > p) break; text = op.ch === null ? text.slice(0, -1) : text + op.ch; }`,
    },
    pitfalls: [
      { title: '매 프레임 innerHTML 을 다시 만들면 커서 깜박임이 끊긴다', fix: '글쇠 수가 바뀐 프레임에만 다시 그리고, 깜박임은 커서 요소의 opacity 로만.', seen: true },
      { title: '한글은 고정폭 글꼴에서 두 칸 폭이라 줄이 어긋나 보인다', fix: '주석의 한글은 대체 글꼴로 그려져 칸이 맞지 않는다. 칸 맞춤이 중요한 곳(i555)은 영어만, 여기선 흐름대로 둔다.', seen: true },
      { title: '꺾쇠를 이스케이프하지 않으면 「p.combo > 2」에서 화면이 깨진다', fix: '낱말을 span 에 넣기 전에 & < > 를 바꾼다.', seen: true },
      { title: '일정한 간격은 기계 같다', fix: '간격을 글자마다 다르게 하고 줄 앞에서 쉬기 · 오타 한 번이면 확 사람 같아진다.' },
    ],
    prev: ['i90', 'i93'],
    next: ['i555', 'i82'],
    refs: [{ name: 'MDN — white-space', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/white-space' }],
  },

  i555: {
    id: 'i555',
    summary: '코드가 바뀔 때 두 판의 낱말을 짝지어 같은 것은 새 자리로 미끄러지고, 없어진 것은 녹고 새것만 피어난다 — 무엇이 바뀌었는지 한눈에.',
    terms: [
      { en: 'Magic Move (Keynote) / shiki-magic-move', ko: '같은 요소를 짝지어 새 자리로 옮기는 전환' },
      { en: 'Longest common subsequence (LCS) token diff', ko: '순서를 지키는 가장 긴 공통 낱말 줄 — 짝짓기' },
      { en: 'Monospace grid positioning', ko: '고정폭 글꼴이라 자리 = (칸 × 글자 폭, 줄 × 줄 높이)' },
      { en: 'Enter / exit / move transitions', ko: '새것은 나타남 · 없어진 것은 사라짐 · 남은 것은 이동' },
    ],
    goal: '{target}을(를) 단계별로 바꾸는 코드 모양 바꾸기 애니메이션을 만들어 줘 — 같은 낱말은 남아서 새 자리로 미끄러지고, 없어진 것은 녹고, 새것만 피어나게. 분위기는 {style}.',
    targets: ['HP 계산 코드 3단계 (빼기 → 변수 → 함수)', '반복문을 함수로 바꾸기', '설정 값 추가 · 이름 바꾸기'],
    styles: ['어두운 편집기 · 새것 초록 · 없어진 것 빨강', '밝은 슬라이드', '발표 화면 · 큰 글씨'],
    platforms: ['dom', 'canvas', 'unity', 'godot'],
    platformHints: {
      dom: '낱말마다 absolute span 을 transform 으로. 실제 작업은 shiki-magic-move 라이브러리가 같은 일을 한다(문법 색까지).',
      canvas: '낱말을 매 프레임 보간한 자리에 fillText.',
      unity: '낱말마다 TextMeshPro 하나를 두고 RectTransform 트윈.',
      godot: '낱말마다 Label 을 두고 position 트윈.',
    },
    principle: [
      '두 판을 낱말(이름 · 숫자 · 기호)로 자르고 줄 · 칸을 적어 둔다. 고정폭 글꼴이라 자리 = (칸 × 글자 폭, 줄 × 줄 높이).',
      'LCS(가장 긴 공통 부분 수열)로 순서를 지키며 같은 글자의 낱말끼리 짝짓는다 — 표 L[i][j] = 같으면 L[i+1][j+1]+1, 아니면 큰 쪽.',
      '짝 있는 낱말: 같은 span 하나가 옛 자리 → 새 자리로 이동. 옛 판에만 있는 것: 빨갛게 물들며 녹음(앞 35%). 새 판에만 있는 것: 이동이 거의 끝날 때(55% 뒤) 초록으로 피어남.',
      '이동 · 사라짐 · 나타남이 겹치지 않게 시간을 나누면 눈이 「무엇이 남고 무엇이 새로 왔는지」 따라간다. 줄 번호 개수도 함께 늘고 준다.',
    ],
    when: ['코드 고치기 · 리팩터링 전후 설명', '강의 · 발표에서 코드를 단계별로 키울 때'],
    avoid: ['완전히 다른 두 코드 — 짝이 없어 그냥 사라졌다 나타남. 대신 장면 전환', '한 줄이 아주 긴 코드 — 낱말이 멀리 날아 어지럽다. 줄을 나눠 두기'],
    cost: 'light',
    costNote: '낱말 span 수십 개의 transform. LCS 는 판마다 한 번(낱말 40개면 표 1600칸).',
    level: 2,
    must: [
      '짝짓기는 LCS 로 (같은 글자 낱말을 순서대로) — 단순히 같은 글자를 아무거나 짝지으면 낱말이 엇갈려 날아다닌다',
      '짝 있는 낱말은 같은 요소 하나가 이동할 것 (사라졌다 새로 나타나지 않게)',
      '시간 나누기: 사라짐(0~35%) · 이동(15~85%) · 나타남(55~100%)',
      '고정폭 글꼴, 글자 폭은 실제로 재서 쓸 것 (글꼴마다 다르다)',
      '새것은 잠깐 초록, 없어진 것은 빨강으로 물들여 바뀐 곳을 보여 주기',
    ],
    done: [
      '「hp = hp - 3」에서 「hp = Math.max(0, hp - dmg)」로 바뀔 때 hp · = · - 는 제자리를 찾아 미끄러지고 Math.max(0, · dmg 만 새로 피어난다',
      '없어지는 낱말은 빨갛게 물들며 위로 녹고, 새 낱말은 초록 바탕으로 나타났다가 바탕이 빠진다',
      '짝짓기를 끄면 모든 낱말이 통째로 겹쳐 바뀌어, 켠 쪽이 무엇이 바뀌었는지 훨씬 잘 보인다',
      '줄 수가 3 → 4 → 6 줄로 바뀔 때 줄 번호도 따라 늘고 준다',
    ],
    code: {
      lang: 'ts',
      title: '낱말 자르기 + LCS 짝짓기',
      from: 'demos/demosMotionD.ts 의 toks() · lcs() 를 정리',
      body: `type Tok = { s: string; line: number; col: number };
function toks(src: string): Tok[] {
  const out: Tok[] = [];
  src.split('\\n').forEach((ln, line) => {
    for (const m of ln.matchAll(/[A-Za-z_$][\\w$]*|\\d+|[^\\s\\w]/g)) out.push({ s: m[0], line, col: m.index! });
  });
  return out;
}

// 순서를 지키는 가장 긴 공통 부분 수열 — [옛 번호, 새 번호] 짝 목록
function lcs(a: Tok[], b: Tok[]): [number, number][] {
  const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      L[i][j] = a[i].s === b[j].s ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i].s === b[j].s) pairs.push([i++, j++]);
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

// 자리 = (칸 × 글자 폭, 줄 × 줄 높이)
const at = (t: Tok) => [X0 + t.col * charW, Y0 + t.line * LH];`,
    },
    pitfalls: [
      { title: '같은 글자를 아무거나 짝지으면 낱말이 엇갈려 날아다닌다', fix: '「hp」가 여러 번 나오면 첫 것끼리만 짝지어도 순서가 꼬인다. LCS 로 순서를 지키는 짝만 쓴다.', seen: true },
      { title: '글자 폭을 어림값으로 두면 낱말이 겹치거나 벌어진다', fix: '고정폭 글꼴도 글꼴마다 폭이 다르다. 숨긴 span 에 M 20개를 넣어 offsetWidth ÷ 20 으로 잰다.', seen: true },
      { title: '사라짐 · 이동 · 나타남을 동시에 하면 무엇이 새것인지 안 보인다', fix: '사라짐 먼저, 이동 가운데, 나타남 마지막으로 시간을 나누고 색(빨강 · 초록)으로 한 번 더 알린다.', seen: true },
      { title: '판이 바뀔 때 화면이 한 번 깜박인다', fix: '바뀜 s 의 끝 상태와 바뀜 s+1 의 시작 상태가 같아야 한다 — 견본은 바뀜마다 span 묶음을 따로 두고 끝 상태를 그대로 이어 받는다.' },
    ],
    prev: ['i554', 'i117'],
    next: ['i548', 'i127'],
    refs: [
      { name: 'shiki-magic-move', url: 'https://github.com/shikijs/shiki-magic-move' },
      { name: 'Wikipedia — Longest common subsequence', url: 'https://en.wikipedia.org/wiki/Longest_common_subsequence' },
    ],
  },
};

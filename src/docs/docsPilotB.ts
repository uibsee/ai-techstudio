import type { TechDoc } from './types';

/**
 * 시범 문서 (2/2) — i341 알파베타 · i360 등적 변형 · i499 효과음 합성 · i323 선 들끓기 · i477 쿼터뷰 던전 조명
 */
export const DOCS: Record<string, TechDoc> = {
  i341: {
    id: 'i341',
    summary: '미니맥스 탐색에서 「더 봐도 결과가 안 바뀌는 가지」를 잘라, 같은 답을 훨씬 적게 보고 찾는다.',
    terms: [
      { en: 'Alpha-beta pruning', ko: '알파베타 가지치기' },
      { en: 'Minimax', ko: '내 차례는 최댓값 · 상대 차례는 최솟값' },
      { en: 'Move ordering', ko: '좋은 수부터 보기 — 더 많이 잘린다' },
      { en: 'Negamax · iterative deepening', ko: '부호만 바꾼 한 줄 판 · 깊이를 1씩 늘리며 찾기' },
    ],
    goal: '{target}의 컴퓨터 상대를 알파베타 가지치기로 만들어 줘. 탐색 과정은 {style}.',
    targets: ['틱택토 · 커넥트4', '오목 · 체스 같은 보드게임', '숫자 트리 설명 화면'],
    styles: ['나무 그림으로 한 단계씩 보여 주는 설명', '보이지 않게 빠르게 두는 AI', '난이도별로 깊이가 다른 AI'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 재귀 함수. 무거우면 코루틴이나 Task 로 나눠 화면을 멈추지 않게.',
      godot: 'GDScript 로 같은 재귀. 깊은 탐색은 WorkerThreadPool 로.',
    },
    principle: [
      'α = 내가 이미 확보한 가장 좋은 값, β = 상대가 허락할 가장 나쁜 값.',
      '어떤 가지에서 α ≥ β 가 되면, 상대(또는 나)는 그 가지로 오지 않으니 남은 형제는 볼 필요가 없다.',
      '결과(고르는 수 · 값)는 미니맥스와 똑같고, 보는 잎의 수만 줄어든다.',
      '좋은 수를 먼저 보면 더 일찍 잘린다 — 최선이면 잎 수가 대략 제곱근으로 준다.',
    ],
    when: ['두 사람이 번갈아 두는 완전 정보 게임 (틱택토 · 오목 · 체스 · 커넥트4)', '「컴퓨터가 어떻게 생각하나」를 보여 주는 수학 설명'],
    avoid: ['주사위 · 카드처럼 운이 섞인 게임 — 기댓값 탐색(expectimax)이나 몬테카를로 트리 탐색이 맞다', '경우의 수가 너무 많은 바둑 같은 판'],
    cost: 'medium',
    costNote: '깊이에 따라 지수로 늘어난다. 깊이 4~6 이 보통 한계 — 시간 제한(예: 50ms)과 반복 깊이 늘리기를 함께.',
    level: 2,
    must: [
      '게임 규칙(수 목록 · 두기 · 평가)과 탐색 함수를 나눠서 — 탐색은 어떤 게임에도 쓸 수 있게',
      '결과가 미니맥스와 같은지 자동 검사 (무작위 판 100개에서 값 비교)',
      '보는 잎 수를 세어 미니맥스 대비 몇 % 인지 표시',
      '한 수에 쓰는 시간 제한 (화면이 멈추지 않게)',
    ],
    done: [
      '같은 판에서 가지치기 켬/끔의 결과 값은 같고, 본 잎 수는 켬이 확실히 적다',
      '설명 화면에서는 α · β 값이 바뀌는 과정과 잘린 가지(회색 · 가위)가 한 단계씩 보인다',
      '수 정렬을 켜면 잘리는 가지가 더 많아진다',
    ],
    code: {
      lang: 'ts',
      title: '알파베타 탐색 (어떤 게임에도 끼우는 꼴)',
      from: 'demos/demosGameAI.ts alphaBetaEvents() 의 탐색 부분을 일반 게임용으로',
      body: `interface Game<S, M> {
  moves(s: S): M[];
  play(s: S, m: M): S;
  over(s: S): boolean;
  score(s: S): number; // 내(최댓값 쪽) 입장 점수
}

function alphaBeta<S, M>(g: Game<S, M>, s: S, depth: number, a: number, b: number, max: boolean, stat: { leaves: number }): number {
  if (depth === 0 || g.over(s)) {
    stat.leaves++;
    return g.score(s);
  }
  let v = max ? -Infinity : Infinity;
  for (const m of g.moves(s)) {            // 좋은 수부터 정렬해 두면 더 많이 잘린다
    const c = alphaBeta(g, g.play(s, m), depth - 1, a, b, !max, stat);
    if (max) { v = Math.max(v, c); a = Math.max(a, v); }
    else { v = Math.min(v, c); b = Math.min(b, v); }
    if (a >= b) break;                     // 가지치기 — 남은 형제는 결과를 못 바꾼다
  }
  return v;
}

/** 가장 좋은 수 고르기 */
function bestMove<S, M>(g: Game<S, M>, s: S, depth: number): { move: M | undefined; leaves: number } {
  const stat = { leaves: 0 };
  let best: M | undefined, a = -Infinity;
  for (const m of g.moves(s)) {
    const v = alphaBeta(g, g.play(s, m), depth - 1, a, Infinity, false, stat);
    if (v > a) { a = v; best = m; }
  }
  return { move: best, leaves: stat.leaves };
}`,
    },
    pitfalls: [
      { title: '가지치기를 켰더니 고르는 수가 달라졌다', fix: '결과는 미니맥스와 같아야 한다 — 달라지면 α · β 를 자식에 잘못 넘긴 버그. 무작위 판으로 둘을 비교하는 검사를 둔다.' },
      { title: '평가 점수를 「지금 차례」 기준으로 주면 부호가 뒤섞인다', fix: '한쪽(최댓값 쪽) 기준으로 고정하거나, 네가맥스로 매번 부호를 뒤집는다 — 섞지 않는다.' },
      { title: '깊이를 고정하면 판에 따라 수십 초 걸린다', fix: '깊이를 1씩 늘리며 시간 제한 안에서 끝난 가장 깊은 결과를 쓴다 (iterative deepening).' },
      { title: '같은 점수 수가 여럿이면 늘 첫 수만 둔다', fix: '아이들 게임에선 같은 점수 중 무작위로 — 늘 같은 수는 금방 질린다.' },
    ],
    prev: ['i340'],
    next: ['i344', 'i343'],
    refs: [
      { name: 'Wikipedia — Alpha–beta pruning', url: 'https://en.wikipedia.org/wiki/Alpha%E2%80%93beta_pruning' },
      { name: 'Chessprogramming wiki — Alpha-Beta', url: 'https://www.chessprogramming.org/Alpha-Beta' },
    ],
    source: [{ file: 'demosGameAI.ts', symbol: 'alphaBetaEvents' }],
  },

  i360: {
    id: 'i360',
    summary: '도형을 조각으로 잘라 미끄러지듯 옮겨 다른 모양으로 맞추는 애니메이션 — 예: 평행사변형의 삼각형을 옮겨 직사각형으로.',
    terms: [
      { en: 'Equal-area transformation (dissection)', ko: '등적 변형 — 잘라 옮겨 붙이기' },
      { en: 'Parallelogram area = base × height', ko: '평행사변형 넓이 = 밑변 × 높이' },
      { en: 'Canvas 2D path animation', ko: '캔버스 2D 도형 움직임' },
      { en: 'Easing (ease-in-out)', ko: '천천히 시작 · 천천히 끝나는 움직임' },
    ],
    goal: '{target} 장면에 도형 조각 잘라 옮기기 애니메이션을 만들어 줘 — 도형을 조각으로 나누고, 조각이 미끄러지듯 움직여 새 모양으로 딱 맞게. 그림체는 {style}.',
    targets: ['평행사변형 → 직사각형 (넓이 설명)', '칠교 조각 맞추기', '퍼즐 정답 보여 주기'],
    styles: ['모눈종이 위 색종이', '깔끔한 교과서 그림', '칠판 분필'],
    platforms: ['canvas', 'web', 'unity'],
    principle: [
      '평행사변형의 왼쪽 끝 꼭짓점에서 수직으로 자르면 직각삼각형 하나가 떨어진다.',
      '그 삼각형을 밑변 길이만큼 옆으로 옮기면 빈 자리에 꼭 맞아 직사각형이 된다.',
      '자르고 옮기기만 했으니 넓이는 그대로 — 직사각형 넓이(밑변 × 높이)가 곧 평행사변형 넓이.',
      '모눈 칸 위에 정수 좌표로 그리면 아이가 칸 수를 직접 세어 확인할 수 있다.',
    ],
    when: ['넓이 공식이 「왜」 그런지 보여 줄 때', '삼각형 넓이 = 평행사변형의 절반 (두 장을 돌려 붙이기)'],
    avoid: ['기울기가 밑변보다 큰 평행사변형 — 수직 한 번 자르기로는 직사각형이 안 된다 (여러 번 잘라야 함)'],
    cost: 'light',
    costNote: '도형 몇 개 — 폰에서도 아주 가볍다.',
    level: 1,
    must: [
      '좌표는 모눈 칸 단위 정수 (밑변 6 · 높이 4 처럼) — 칸을 세어 확인 가능',
      '움직임은 단계별: 자르는 선 → 들어 올려 옮기기 → 맞춰 넣기 → 「넓이 같음 ✓」',
      '빈 자리를 점선으로 남겨 어디서 왔는지 보이게',
      '기울기 슬라이더는 밑변보다 작은 범위로만',
    ],
    done: [
      '평행사변형 → 직사각형 장면이 저절로 반복되고, 끝에 「넓이 = 밑변 × 높이 = 24」와 칸 수가 보인다',
      '삼각형 두 장을 돌려 붙여 평행사변형이 되는 두 번째 장면이 있다',
      '기울기 슬라이더를 바꿔도 넓이 숫자는 그대로다',
      '폰 폭(390px)에서도 글씨 · 도형이 잘리지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '삼각형 조각을 옮겨 직사각형 만들기 (캔버스 2D)',
      from: 'demos/demosMathA.ts i360 draw() 의 첫 장면을 정리',
      body: `type P = [number, number];
const B = 6, H = 4, s = 2;                   // 밑변 · 높이 · 윗변을 민 칸 (s < B)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

function poly(g: CanvasRenderingContext2D, pts: P[], fill?: string, stroke?: string) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
}

function draw(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cell = Math.min((w * 0.86) / 10.4, (h * 0.47) / H);
  const ox = w / 2 - ((B + s) * cell) / 2, oy = h * 0.79;
  const S = ([x, y]: P): P => [ox + x * cell, oy - y * cell];   // 칸 → 화면
  const mv = easeIO(clamp01((t - 1.2) / 1.25));                // 옮기기 진행 0 → 1
  const lift = Math.sin(mv * Math.PI) * 0.6;                    // 옮기는 동안 살짝 들어 올림
  g.setLineDash([4, 4]);
  poly(g, ([[0, 0], [s, 0], [s, H]] as P[]).map(S), undefined, 'rgba(239,91,60,0.55)'); // 빈 자리
  g.setLineDash([]);
  poly(g, ([[s, 0], [B, 0], [B + s, H], [s, H]] as P[]).map(S), '#f3e3c8', '#3a3020');  // 남는 부분
  const tri = ([[0, 0], [s, 0], [s, H]] as P[]).map(([x, y]) => S([x + B * mv, y + lift]));
  g.save();
  g.shadowColor = 'rgba(80,40,20,0.35)';
  g.shadowBlur = 12 * Math.sin(mv * Math.PI);
  poly(g, tri, 'rgba(239,91,60,0.86)', '#a8361f');               // 잘라 옮기는 조각
  g.restore();
  if (mv >= 1) {
    g.fillStyle = '#3a3020';
    g.font = '800 16px Pretendard, sans-serif';
    g.textAlign = 'center';
    g.fillText('넓이 = 밑변 × 높이 = ' + B * H + '칸', w / 2, 28);
  }
}`,
    },
    pitfalls: [
      { title: '기울기를 밑변보다 크게 하면 수직 한 번 자르기로 안 맞는다', fix: '윗변 꼭짓점이 밑변 밖으로 나가 잘린 삼각형이 빈 자리에 안 맞는다. 슬라이더 범위를 s < B 로 묶는다.', seen: true },
      { title: '소수 좌표로 그리면 칸을 셀 수 없다', fix: '꼭짓점은 칸 단위 정수로, 화면 변환은 한 함수(S)로만.' },
      { title: '조각이 순간 이동하면 「잘라 옮겼다」가 안 보인다', fix: '들어 올림(그림자) → 옮김 → 내려놓기를 이징으로 0.8~1.2초.' },
      { title: '폰에서 글씨가 너무 작다', fix: '글씨 크기를 화면 크기 비율(u = min(w/280, h/175))로 키운다.', seen: true },
    ],
    next: ['i365', 'i362'],
    refs: [{ name: 'Wikipedia — Parallelogram (Area)', url: 'https://en.wikipedia.org/wiki/Parallelogram' }],
  },

  i499: {
    id: 'i499',
    summary: '소리 파일 없이 발진기 · 잡음 · 필터 · 소리 크기 봉투를 엮어 동전 · 점프 · 폭발 같은 효과음을 코드로 만든다.',
    terms: [
      { en: 'Procedural SFX synthesis (Web Audio API)', ko: '코드로 효과음 합성' },
      { en: 'OscillatorNode · noise buffer', ko: '발진기(사인 · 네모 · 톱니) · 잡음' },
      { en: 'ADSR envelope (GainNode ramps)', ko: '소리 크기 봉투 — 어택 · 유지 · 감쇠' },
      { en: 'BiquadFilterNode · pitch sweep', ko: '필터 · 음 높이 미끄러짐' },
    ],
    goal: '{target} 효과음을 소리 파일 없이 Web Audio 로 합성해 줘. 느낌은 {style}.',
    targets: ['동전 줍기 「딩딩!」', '점프 · 레이저 · 폭발 묶음', '단추 클릭 · 성공 차임 같은 화면 소리'],
    styles: ['8비트 오락실', '부드럽고 귀여운', '묵직한 실사풍'],
    platforms: ['webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 OnAudioFilterRead 로 직접 파형을 쓰거나, 합성한 샘플을 AudioClip.Create 로 만들어 재생한다.',
      godot: 'Godot 은 AudioStreamGenerator 에 프레임을 밀어 넣어 합성한다.',
    },
    principle: [
      '효과음은 「음원(발진기 · 잡음) → 필터 → 소리 크기 봉투 → 출력」 사슬이다.',
      '동전: 네모파가 한 박자(0.075초) 뒤 4도 위로 뛰는 두 음. 점프: 음 높이가 위로 미끄러짐. 폭발: 저역 필터를 지난 잡음.',
      '봉투는 GainNode 의 exponentialRamp 로 — 빠른 어택(2ms) · 짧은 유지 · 지수 감쇠가 「또렷한」 소리를 만든다.',
      '모든 시간은 AudioContext.currentTime 기준으로 미리 예약하므로 화면 프레임과 상관없이 정확하다.',
    ],
    when: ['소리 파일을 구하거나 만들기 어려울 때 · 용량을 줄일 때', '같은 소리를 높이 · 길이만 바꿔 여러 번 쓸 때 (콤보 · 점수 올라가기)'],
    avoid: ['목소리 · 악기처럼 복잡한 실제 소리 — 녹음 파일이 낫다'],
    cost: 'light',
    costNote: '노드 몇 개를 만들고 버린다. 수십 개가 한꺼번에 울려도 가볍다. 잡음 버퍼는 한 번 만들어 돌려 쓴다.',
    level: 1,
    must: [
      'AudioContext 는 사용자가 처음 누를 때 만들거나 resume() — 그 전엔 소리가 안 난다 (특히 폰)',
      '소리마다 매개변수(음 높이 · 꼬리 길이)를 받아 같은 함수로 여러 소리를 만들 수 있게',
      '마지막에 주 GainNode 하나로 전체 크기를 제한해 겹쳐도 찢어지지 않게',
      '소리 파일 · 외부 라이브러리 없이',
    ],
    done: [
      '단추를 누르면 바로(지연 없이) 동전 「딩딩!」 소리가 난다',
      '음 높이 · 꼬리 길이 슬라이더를 바꾸면 소리가 그에 맞게 바뀐다',
      '연타해도 소리가 찢어지거나 끊기지 않는다',
      '폰에서 첫 터치 뒤 소리가 난다',
    ],
    code: {
      lang: 'ts',
      title: '동전 「딩딩!」 — 네모파 두 음 + 소리 크기 봉투',
      from: 'demos/demosSfx.ts recCoin · envG 를 이어 붙임',
      body: `let ctx: AudioContext | null = null;
const st2 = (semi: number) => Math.pow(2, semi / 12); // 반음 → 배수

/** 0 → peak (a초) → 유지(hold) → 지수 감쇠(d초). exponentialRamp 는 0 으로 못 가서 0.0001 */
function envG(c: AudioContext, out: AudioNode, t0: number, a: number, hold: number, d: number, peak: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + Math.max(0.0005, a));
  g.gain.setValueAtTime(peak, t0 + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + d);
  g.connect(out);
  return g;
}

function coin(c: AudioContext, out: AudioNode, t0: number, pitch = 0, tail = 0.35) {
  const f1 = 987.77 * st2(pitch);                       // B5
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(f1, t0);
  o.frequency.setValueAtTime(f1 * st2(5), t0 + 0.075);  // 한 박자 뒤 4도 위
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7000;                            // 네모파의 날카로운 고역 다듬기
  o.connect(lp).connect(envG(c, out, t0, 0.002, 0.07, tail, 0.3));
  o.start(t0);
  o.stop(t0 + 0.08 + tail + 0.05);
}

button.onclick = async () => {
  ctx ??= new AudioContext();                           // 사용자가 누른 뒤에 만든다
  await ctx.resume();
  coin(ctx, ctx.destination, ctx.currentTime + 0.01);
};`,
    },
    pitfalls: [
      { title: '페이지가 열리자마자 소리를 내려 하면 아무 소리도 안 난다', fix: '브라우저 자동 재생 정책 — 첫 클릭 · 터치 안에서 AudioContext 를 만들거나 resume().' },
      { title: 'exponentialRampToValueAtTime(0) 은 오류', fix: '지수 곡선은 0 에 닿을 수 없다. 0.0001 로 줄이고 끝나면 stop().' },
      { title: '여러 소리가 겹치면 찢어진다 (클리핑)', fix: '모든 소리를 주 GainNode(0.5 안팎) 하나로 모으고, 필요하면 DynamicsCompressorNode.' },
      { title: '파형 그림만 보고 고르면 실제로 들으면 어색하다', fix: '이 사이트에서 이름 · 모양만 보고 골랐다가 지적받았다. 반드시 들어 보고, 가장 큰 소리를 타격 순간에 맞춘다.', seen: true },
      { title: '같은 소리를 똑같이 반복하면 금방 거슬린다', fix: '음 높이를 ±1~2반음 · 크기를 조금씩 무작위로 (라운드 로빈).' },
    ],
    prev: ['i141'],
    next: ['i148', 'i147'],
    refs: [
      { name: 'MDN — Web Audio API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API' },
      { name: 'MDN — OscillatorNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode' },
      { name: 'sfxr (브라우저판 jsfxr)', url: 'https://sfxr.me/' },
    ],
    source: [{ file: 'demosSfx.ts', symbol: 'recCoin' }, { file: 'demosSfx.ts', symbol: 'envG' }, { file: 'demosSfx.ts', symbol: 'osc' }],
  },

  i323: {
    id: 'i323',
    summary: '같은 그림을 살짝 다르게 떨리는 선으로 2~4장 그려 10fps 로 번갈아 보여 줘, 손으로 매번 다시 그린 애니처럼 선이 살아 움직이게 한다.',
    terms: [
      { en: 'Line boil', ko: '선 들끓기 — 손그림 애니의 꿈틀거리는 선' },
      { en: 'Hand-drawn jitter (seeded noise)', ko: '씨앗이 정해진 무작위로 떨림' },
      { en: 'Frame stepping (animate on twos)', ko: '매 프레임이 아니라 몇 프레임마다 장 바꾸기' },
      { en: 'Offscreen canvas cache', ko: '화면 밖 캔버스에 미리 구워 두기' },
    ],
    goal: '{target}에 선 들끓기 효과를 넣어 줘 — 같은 그림을 살짝 다르게 떨린 선으로 3장 구워 두고 10fps 로 번갈아. 그림체는 {style}.',
    targets: ['손그림 캐릭터 · 소품', '게임 제목 글씨', '설명 그림 전체'],
    styles: ['연필 스케치', '크레파스 동화책', '볼펜 낙서'],
    platforms: ['canvas', 'three', 'unity'],
    platformHints: {
      three: 'three.js 라면 같은 떨림을 정점 셰이더에서 floor(time × 10) 씨앗으로 주거나, 캔버스로 구운 3장을 텍스처로 번갈아 쓴다.',
      unity: 'Unity 는 Sprite 3장을 Animator 로 번갈아(샘플 10) 쓰거나, 셰이더에서 floor(_Time.y × 10) 씨앗으로 UV 를 흔든다.',
    },
    principle: [
      '손그림 애니는 장마다 사람이 다시 그려서 선이 조금씩 다르다 — 그게 「살아 있는」 느낌을 준다.',
      '선의 점마다 씨앗(seed)이 정해진 작은 무작위 떨림을 주면, 같은 씨앗은 늘 같은 장이 나온다.',
      '씨앗만 바꾼 2~4장을 미리 구워 두고, 8~12fps 로 순서대로 번갈아 보여 준다.',
      '매 프레임 새로 떨리게 하면 「지글지글」 소음이 되므로, 장 수와 바꾸는 빠르기를 제한하는 것이 핵심.',
    ],
    when: ['손그림 · 동화책 그림체 게임에서 멈춘 화면도 생기 있게', '정지 그림이 많은 설명 화면'],
    avoid: ['글씨를 읽어야 하는 작은 UI — 떨리면 읽기 힘들다', '이미 많이 움직이는 화면 — 산만해진다'],
    cost: 'light',
    costNote: '장을 미리 구워 두면 매 프레임 drawImage 한 번. 굽는 비용은 처음 한 번 (크기 바뀔 때만 다시).',
    level: 1,
    must: [
      '떨림은 씨앗이 정해진 의사 난수(mulberry32 등) — Math.random 금지 (장마다 늘 같은 그림이어야 한다)',
      '장 2~4장을 화면 밖 캔버스에 미리 구워 두고, 그리기는 drawImage 만',
      '바꾸는 빠르기 8~12fps (화면은 60fps 로 돌아도 장은 천천히)',
      '켬/끔 비교 — 왼쪽 한 장 그대로, 오른쪽 번갈아',
    ],
    done: [
      '오른쪽 그림의 선이 꿈틀거리며 「손으로 다시 그린」 느낌이 나고, 왼쪽은 그대로다',
      '장 수 · 빠르기(fps) · 떨림 세기 슬라이더로 느낌을 바꿀 수 있다',
      '떨림 세기를 바꾸면 다시 굽고, 그 외에는 매 프레임 그리기 비용이 거의 없다',
    ],
    code: {
      lang: 'ts',
      title: '씨앗 떨림 선을 3장 구워 10fps 로 번갈아',
      from: '새로 씀 (demos/demosHandA.ts bakeBoilFrame · Bakery 와 같은 방식, 연필 질감은 뺌)',
      body: `type P = [number, number];
/** 씨앗이 같으면 늘 같은 수열 */
function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 선을 잘게 나눠 점마다 살짝 흔든 손그림 선 */
function wobblyLine(g: CanvasRenderingContext2D, pts: P[], seed: number, jit: number) {
  const r = mulberry(seed);
  g.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!;
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n + (r() - 0.5) * 2 * jit;
      const y = y0 + ((y1 - y0) * k) / n + (r() - 0.5) * 2 * jit;
      i || k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  }
  g.stroke();
}
/** 장 f 를 화면 밖 캔버스에 굽기 */
function bake(lines: P[][], w: number, h: number, f: number, jit = 1.2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#2b2734'; g.lineWidth = 2.2; g.lineCap = g.lineJoin = 'round';
  lines.forEach((l, i) => wobblyLine(g, l, f * 131 + i * 17, jit));
  return c;
}
const frames = [0, 1, 2].map((f) => bake(LINES, 400, 300, f));
function draw(g: CanvasRenderingContext2D, t: number) {
  g.drawImage(frames[Math.floor(t * 10) % frames.length]!, 0, 0); // 10fps 로 번갈아
}`,
    },
    pitfalls: [
      { title: '매 프레임 Math.random 으로 떨면 지글지글 소음이 된다', fix: '씨앗 고정 · 장 2~4장 · 8~12fps. 이 세 가지가 「들끓기」와 「잡음」의 차이.', seen: true },
      { title: '매 프레임 떨린 선을 새로 그리면 폰에서 무겁다', fix: '장마다 한 번 구워 두고 drawImage 만. 크기 · 떨림 세기가 바뀔 때만 다시 굽는다.', seen: true },
      { title: '떨림이 선 굵기보다 크면 그림이 무너진다', fix: '떨림은 선 굵기의 0.5~1배 정도. 큰 화면에선 화면 비율에 맞춰 키운다.' },
      { title: '칠한 색과 선이 같이 안 떨리면 어색하다', fix: '칠도 장마다 1~2px 어긋나게 (견본은 칠을 장마다 조금 밀어 손으로 칠한 느낌).', seen: true },
    ],
    prev: ['i324'],
    next: ['i325', 'i330'],
    source: [{ file: 'demosHandA.ts', symbol: 'bakeBoilFrame' }],
  },

  i477: {
    id: 'i477',
    summary: '내려다보는 카메라와 아주 어두운 바탕 위에 일렁이는 횃불 점광원 · 그림자 하나 · 같은 색 안개로, 어둠 속 빛이 주인공인 던전을 만든다.',
    terms: [
      { en: 'Isometric / three-quarter view camera', ko: '쿼터뷰 — 비스듬히 내려다보는 좁은 화각 카메라' },
      { en: 'Point light shadows (cube shadow map)', ko: '점광원 그림자 — 6방향으로 그리는 그림자 지도' },
      { en: 'Light flicker', ko: '횃불 일렁임 — 사인 몇 개를 섞은 세기 변화' },
      { en: 'Distance fog · PBR textures', ko: '배경색과 같은 안개 · 실사 재질(색 · 법선 · AO/거칠기/금속)' },
    ],
    goal: '{target}을(를) 쿼터뷰 던전 조명으로 꾸며 줘 — 어둠은 아주 어둡게, 횃불 점광원만 따뜻하게 일렁이고, 그림자는 주인공 횃불 하나. 분위기는 {style}.',
    targets: ['돌바닥 · 벽돌 벽 던전 방', '횃불 든 주인공이 걷는 복도', '보물 상자 방'],
    styles: ['어둡고 묵직한 실사풍', '따뜻한 모험', '으스스한 공포'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 에서는 Point Light 의 그림자를 하나만 켜고(Additional Lights Shadows), Fog 는 Lighting 창의 Linear Fog · 배경색과 같은 색.',
      godot: 'Godot 4 는 OmniLight3D (shadow_enabled 는 하나만) · WorldEnvironment 의 Fog · 카메라는 좁은 FOV 로.',
    },
    principle: [
      '바탕 빛(반구광)은 0.2 정도로 아주 어둡게 두고, 따뜻한 점광원(횃불)이 화면의 밝은 곳을 정한다.',
      '점광원 그림자는 큐브 6면을 그리므로 비싸다 — 그림자는 주인공 횃불 하나만, 나머지 횃불은 그림자 없이.',
      '횃불 세기에 빠르기가 다른 사인 3개를 섞으면 불규칙하게 일렁인다.',
      '안개 색을 배경색과 같게 하면 먼 곳이 어둠에 자연스럽게 묻힌다.',
      '좁은 화각(30°) 카메라를 고정 오프셋으로 주인공 뒤에 두면 쿼터뷰가 된다.',
    ],
    when: ['던전 · 동굴 · 밤 장면처럼 어둠과 빛의 대비가 분위기의 핵심일 때', '쿼터뷰 액션 · 탐험 게임'],
    avoid: ['밝은 낮 장면 — 반구광 · 해 · 환경 반사 틀이 맞다', '점광원 그림자를 여러 개 켜야 하는 장면 (폰에서 무겁다)'],
    cost: 'heavy',
    costNote: '그림자 켠 점광원 하나 = 그림자 지도 6장. 실사 텍스처는 1k 로 · GPU 업로드는 나눠서. 폰에선 그림자 지도 512.',
    level: 3,
    must: [
      '그림자를 켜는 점광원은 하나만 (나머지는 castShadow = false)',
      '안개 색 = 배경색, 반구광은 0.2 안팎으로 어둡게',
      '첫 화면 전에 renderer.compileAsync 로 셰이더를 미리 굽고, 그동안 「준비 중」 표시',
      '실사 텍스처는 1k, 색 지도는 SRGBColorSpace, 법선 지도는 OpenGL(_gl) 방식',
      '가장자리 흐림 · 비네트로 어둠을 흉내 내지 않기 — 빛 배치로 만든다',
    ],
    done: [
      '횃불 주변만 따뜻하게 밝고 일렁이며, 그 밖은 거의 검게 묻힌다',
      '주인공이 걸으면 주인공 횃불 그림자가 벽 · 기둥에 움직인다',
      '「그림자」 켬/끔 · 「횃불 세기」 · 「안개 거리」 조절로 차이를 볼 수 있다',
      '처음 열 때 멈칫 없이 「준비 중」 → 장면으로 넘어간다',
    ],
    code: {
      lang: 'ts',
      title: '어두운 바탕 + 일렁이는 횃불 3개 (그림자는 하나) + 안개 + 쿼터뷰 카메라',
      from: 'demos/demosRender.ts makeDungeon() 의 빛 · 카메라 부분',
      body: `const BG = 0x040305;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 20, 40);                     // 안개 색 = 배경색 → 먼 곳이 어둠에 묻힘
scene.add(new THREE.HemisphereLight(0x33405e, 0x0a0605, 0.2)); // 바탕 빛은 아주 어둡게
const moon = new THREE.DirectionalLight(0x6c88c8, 0.42);
moon.position.set(-4, 10, 3);
scene.add(moon);

const BASE = [16, 16, 30];                                  // 벽 횃불 둘 · 주인공 횃불
const torches = BASE.map((b, i) => {
  const l = new THREE.PointLight(i === 2 ? 0xffa64e : 0xff8a3a, b, i === 2 ? 14 : 12, 2);
  scene.add(l);
  return l;
});
const hero = torches[2]!;
hero.castShadow = true;                                     // 그림자는 이 하나만 (점광원 그림자 = 6면)
hero.shadow.mapSize.set(512, 512);
hero.shadow.camera.near = 0.1;
hero.shadow.camera.far = 14;
hero.shadow.bias = -0.004;
hero.shadow.normalBias = 0.03;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const flick = (t: number, ph: number) => 0.84 + 0.08 * Math.sin(t * 11 + ph) + 0.05 * Math.sin(t * 23.7 + ph * 1.7) + 0.03 * Math.sin(t * 5.3 + ph * 0.3);
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 80); // 좁은 화각 = 쿼터뷰
const OFF = new THREE.Vector3(8.6, 12.4, 9.8);

await renderer.compileAsync(scene, cam);                    // 첫 그리기 멈칫 막기
function update(t: number, heroPos: THREE.Vector3) {
  torches.forEach((l, i) => (l.intensity = BASE[i]! * flick(t, i * 2.1)));
  cam.position.copy(heroPos).add(OFF);
  cam.lookAt(heroPos);
}`,
    },
    pitfalls: [
      { title: '그림자 켠 점광원을 여러 개 두면 폰에서 프레임이 무너진다', fix: '점광원 그림자 하나 = 장면을 6번 더 그린다. 그림자는 주인공 횃불 하나, 나머지는 빛만.', seen: true },
      { title: '첫 장면에서 몇 초 멈칫', fix: '그림자 · 실사 재질 셰이더가 처음 그릴 때 컴파일된다. compileAsync 로 미리 굽고 그동안 「셰이더 굽는 중」을 보여 준다.', seen: true },
      { title: '실사 텍스처 여러 장을 한 프레임에 올리면 멈칫', fix: 'GPU 업로드(renderer.initTexture)를 프레임당 3ms 예산 안에서 나눠 올린다. 무거운 장면 짓기도 같은 3ms 예산으로.', seen: true },
      { title: '바닥에 줄무늬 그림자 얼룩 (shadow acne)', fix: 'shadow.bias 를 조금 음수로, normalBias 0.02~0.04.' },
      { title: '어둠을 비네트 · 가장자리 흐림으로 만들면 답답하고 흐려 보인다', fix: '이 사이트에서 금지한 효과. 어둠은 빛 배치 · 안개로 만든다.', seen: true },
    ],
    prev: ['i474', 'i475', 'i385'],
    next: ['i488', 'i487', 'i481'],
    refs: [
      { name: 'three.js 예제 — webgl_shadowmap_pointlight', url: 'https://threejs.org/examples/#webgl_shadowmap_pointlight' },
      { name: 'Poly Haven — CC0 텍스처', url: 'https://polyhaven.com/textures' },
    ],
    source: [{ file: 'demosRender.ts', symbol: 'makeDungeon' }, { file: 'demosRender.ts', symbol: 'flick' }],
  },
};

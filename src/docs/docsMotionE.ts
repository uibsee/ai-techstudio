import type { TechDoc } from './types';

/**
 * 입자 글자 · 음악 반응 · 사진 시차 · 폰 목업 (2026-10-10) — i556 ~ i559.
 * 견본은 demos/demosMotionE.ts. prompt-motion.com 분류(2D 입자 · 음악 · 사진 · 폰)에서 빈 곳을 찾아 새로 쓴 것.
 */
export const DOCS: Record<string, TechDoc> = {
  i556: {
    id: 'i556',
    summary: '글자를 보이지 않는 캔버스에 그려 칠해진 픽셀 자리를 뽑고, 입자 수백 개가 스프링으로 그 자리에 모였다가 흩어져 다음 글자로 건너간다.',
    terms: [
      { en: 'Particle text / text-to-particles', ko: '글자 모양을 점 구름으로 — 점이 글자를 이룸' },
      { en: 'getImageData pixel sampling', ko: '숨은 캔버스에 글자를 그리고 알파가 있는 픽셀 자리를 일정 간격으로 뽑기' },
      { en: 'Damped spring (stiffness · damping ratio)', ko: '목표로 당기는 힘 − 속도에 비례한 마찰 — 감쇠비 1 미만이면 살짝 출렁' },
      { en: 'Target reassignment (morph)', ko: '입자는 그대로 두고 목표 자리만 다음 글자 것으로 바꾸기' },
    ],
    goal: '{target}에 쓸 2D 입자 글자를 만들어 줘 — 글자가 입자 수백 개로 이루어지고, 흩어졌다가 스프링으로 모여 다음 글자로 바뀐다. 분위기는 {style}.',
    targets: ['게임 시작 화면 제목 → 「START」', '결과 화면 「CLEAR!」 · 점수 숫자', '카운트다운 3 · 2 · 1 · GO!'],
    styles: ['어두운 바탕에 무지개 빛 점 (더하기 섞기)', '밝은 바탕에 색종이 조각', '네온 · 사이버'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      canvas: '숨은 캔버스에 fillText → getImageData 로 자리 뽑기. 입자는 Float32Array 여러 개(x · y · vx · vy · tx · ty)로, 그리기는 색 묶음별 fillRect. 입자가 수천 개를 넘으면 three 로.',
      three: '자리는 캔버스 2D 로 뽑고, 입자는 Points 하나 + position 버퍼를 매 프레임 갱신. 수만 개면 목표 자리를 텍스처에 넣고 셰이더(GPGPU)로 스프링.',
      unity: 'TextMeshPro 로 RenderTexture 에 글자를 그려 픽셀을 읽거나, 폰트 메시 꼭짓점에서 자리를 뽑고 ParticleSystem.SetParticles 로 위치를 매 프레임.',
      godot: 'SubViewport 에 Label 을 그려 get_image() 로 자리를 뽑고, MultiMeshInstance2D 로 입자를 그리며 _process 에서 스프링.',
    },
    principle: [
      '자리 뽑기: 보이지 않는 캔버스에 글자를 꽉 차게 그리고 getImageData 로 알파 > 128 인 픽셀만 고른다. 간격 = √(칠해진 넓이 ÷ 입자 수) 로 두면 어느 글자든 점 수가 비슷하다.',
      '짝짓기: 입자 i 의 목표 = 섞은 순서의 i 번째 자리. 점이 모자라면 돌려 쓰고 남으면 버린다. 섞어서 짝지으면 건너갈 때 소용돌이처럼 엇갈려 보기 좋다 (x 순서로 짝지으면 옆으로 미끄러짐).',
      '움직임: 매 프레임 속도 += (k·(목표 − 자리) − c·속도)·dt, 자리 += 속도·dt. c = 2√k × 0.55 면 살짝 지나쳤다 돌아온다.',
      '바뀌는 순간 입자마다 무작위 방향 속도를 더해 주면 「터졌다가 모이는」 느낌. 빠른 입자는 조금 크게 그려 속도감을 준다.',
    ],
    when: ['게임 제목 · 결과 · 카운트다운처럼 글자가 주인공인 순간', '숫자가 바뀌는 순간을 크게 보여 줄 때 (점수 · 레벨)'],
    avoid: ['읽어야 하는 긴 문장 — 입자 글자는 4~6자까지', '작은 화면 구석 — 점 간격보다 글자가 작으면 알아볼 수 없다'],
    cost: 'medium',
    costNote: '입자 1,000개 스프링은 캔버스 2D 로 1ms 안. 자리 뽑기(getImageData)는 글자 · 화면 크기가 바뀔 때만 — 매 프레임 하면 안 된다. 5,000개를 넘으면 three Points 나 셰이더로.',
    level: 2,
    must: [
      '글자 자리는 화면 크기가 바뀔 때만 다시 뽑고 결과를 기억해 둘 것 (매 프레임 getImageData 금지)',
      '입자 상태는 Float32Array 로 — 객체 배열 수천 개 만들지 않기',
      'dt 는 1/30 초로 막을 것 — 탭을 다녀오면 큰 dt 로 입자가 화면 밖으로 튄다',
      '글자 크기는 화면 폭에 맞춰 줄일 것 (measureText 로 재서 폭 86% 안)',
      '색 바꾸기는 몇 묶음으로 — 입자마다 fillStyle 을 바꾸면 느리다',
    ],
    done: [
      '글자가 점으로 또렷하게 읽히고, 2~3초마다 점들이 흩어졌다가 다음 글자로 모인다',
      '「흩어졌다 모이기」를 끄면 점들이 곧장 다음 자리로 흐르고, 켜면 한 번 터진 뒤 모인다',
      '스프링 세기를 낮추면 느긋하게 출렁이며 모이고, 높이면 빠르게 딱 붙는다',
      '한글 · 영문 · 기호(★) 모두 점 수가 비슷해 한 글자만 성기거나 빽빽하지 않다',
    ],
    code: {
      lang: 'ts',
      title: '글자 → 점 자리 뽑기 + 스프링',
      from: 'demos/demosMotionE.ts 의 sampleWord() · particleText() 를 정리',
      body: `function sampleWord(word: string, w: number, h: number, n: number): number[] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  let size = h * 0.6;
  g.font = '900 ' + size + 'px sans-serif';
  const tw = g.measureText(word).width;
  if (tw > w * 0.86) size *= (w * 0.86) / tw;           // 폭에 맞춰 줄이기
  g.font = '900 ' + size + 'px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(word, w / 2, h / 2);
  const d = g.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => d[((y | 0) * w + (x | 0)) * 4 + 3] > 128;
  let area = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) area++;
  const step = Math.max(1, Math.sqrt(area / n));         // 어느 글자든 점 수 ≈ n
  const pts: number[] = [];
  for (let y = step / 2; y < h; y += step)
    for (let x = step / 2; x < w; x += step) if (on(x, y)) pts.push(x, y);
  return pts;
}

// 매 프레임 — k: 스프링 세기, c: 마찰 (감쇠비 0.55 → 살짝 출렁)
const c = 2 * Math.sqrt(k) * 0.55;
for (let i = 0; i < N; i++) {
  vx[i] += (k * (tx[i] - px[i]) - c * vx[i]) * dt;
  vy[i] += (k * (ty[i] - py[i]) - c * vy[i]) * dt;
  px[i] += vx[i] * dt;
  py[i] += vy[i] * dt;
}`,
    },
    pitfalls: [
      { title: '글자마다 점 수가 크게 달라 어떤 글자는 성기다', fix: '간격을 고정하면 「★」는 점이 적고 「스튜디오」는 넘친다. 칠해진 넓이를 먼저 세어 간격 = √(넓이 ÷ n) 으로 글자마다 정한다.', seen: true },
      { title: '바뀔 때 점들이 한쪽으로 줄지어 미끄러져 심심하다', fix: '자리 순서(왼쪽 → 오른쪽)대로 짝지으면 모두 같은 방향으로 움직인다. 섞은 순서로 짝지으면 엇갈려 건너간다.', seen: true },
      { title: '탭을 다녀오면 입자가 화면 밖으로 튀어 나간다', fix: 'dt 가 몇 초가 되면 스프링이 폭발한다. dt 를 1/30 초로 막는다.', seen: true },
      { title: '글꼴이 늦게 내려오면 첫 글자만 기본 글꼴로 뽑힌다', fix: 'document.fonts.ready 뒤에 자리를 뽑거나, 글꼴이 바뀌면 다시 뽑는다.' },
    ],
    prev: ['i90', 'i302'],
    next: ['i22', 'i97'],
    refs: [
      { name: 'MDN — CanvasRenderingContext2D.getImageData()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData' },
      { name: 'Wikipedia — Damping (감쇠 진동)', url: 'https://en.wikipedia.org/wiki/Damping' },
    ],
  },

  i557: {
    id: 'i557',
    summary: '음악을 주파수 띠로 나눠 저 · 중 · 고 세기를 「오를 땐 빠르게, 내릴 땐 천천히」 따라가고 — 저음은 원이 숨쉬고, 박마다 고리가 퍼지고, 고음은 반짝인다. 영상으로 구울 땐 소리를 미리 분석해 표로.',
    terms: [
      { en: 'AnalyserNode · getByteFrequencyData', ko: 'Web Audio 가 실시간으로 주는 주파수별 세기' },
      { en: 'Log-spaced frequency bands', ko: '귀처럼 낮은 쪽은 촘촘히, 높은 쪽은 넓게 묶은 띠' },
      { en: 'Envelope follower (attack · release)', ko: '오를 땐 빨리, 내릴 땐 천천히 따라가는 부드러운 값' },
      { en: 'Spectral flux onset', ko: '저음 세기가 한 프레임 사이에 훅 오르면 「박」' },
      { en: 'Offline analysis (OfflineAudioContext)', ko: '영상 굽기용 — 소리를 미리 그려 프레임마다 세기 표를 만들어 둠' },
    ],
    goal: '{target}에 음악 반응 시각화를 만들어 줘 — 주파수를 저 · 중 · 고로 나눠 엔벨로프로 부드럽게 따라가고, 저음은 크게 숨쉬고, 박마다 고리가 퍼지고, 고음은 반짝이게. 분위기는 {style}.',
    targets: ['리듬 게임 배경', '게임 배경음악 플레이어 화면', '뮤직비디오 · 쇼츠 영상'],
    styles: ['어두운 바탕에 네온 원형 막대', '밝은 파스텔 물결', '레트로 막대 이퀄라이저'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      canvas: '실시간: AudioContext → AnalyserNode(fftSize 2048, smoothingTimeConstant 0) → getFloatFrequencyData 로 dB 를 받아 띠로 묶기. 첫 터치 뒤에만 소리가 난다. 영상 굽기: OfflineAudioContext 로 미리 분석해 프레임별 표로.',
      three: '띠 세기를 uniform 배열이나 1×32 DataTexture 로 넘겨 셰이더가 막대 · 물결을 그리게. 저음 = 크기 · 빛 번짐 세기, 박 = 카메라 흔들림.',
      unity: 'AudioSource.GetSpectrumData(512, FFTWindow.BlackmanHarris) 를 로그 띠로 묶고 같은 엔벨로프. 영상은 미리 분석한 값을 AnimationCurve 로 구워 Timeline 에.',
      godot: 'AudioEffectSpectrumAnalyzer 를 버스에 달고 get_magnitude_for_frequency_range(lo, hi) 로 띠마다 세기.',
    },
    principle: [
      '띠 나누기: 40Hz ~ 8kHz 를 로그 간격 32띠로 (fc = 40 × 200^((b+0.5)/32)). 세기는 dB 로 바꿔 −54 ~ 0 dB 를 0 ~ 1 로 — 그대로 쓰면 저음만 크고 고음은 안 보인다. 높은 띠는 조금 올려 준다.',
      '엔벨로프: 값 += (새 값 − 값) × (오를 땐 1 − e^(−dt/10ms), 내릴 땐 1 − e^(−dt/릴리스)). 날것은 바들바들 떨리고, 릴리스 0.2초쯤이면 「쿵 — 스르르」 음악처럼 보인다.',
      '역할 나누기: 저음 → 크기 · 숨쉬기 · 번쩍, 중음 → 회전 · 흐름 속도, 고음 → 반짝이 · 작은 입자. 같은 값을 모든 데 쓰면 화면 전체가 한 덩어리로 출렁여 어지럽다.',
      '박: 저음 세기의 증가량(flux)이 문턱을 넘으면 고리 하나를 퍼뜨린다. 평균보다 큰지 보는 방식(i163)보다 박 시작에 더 빨리 반응한다.',
      '영상으로 구울 땐(i82) 프레임을 실시간보다 느리게 찍으므로 AnalyserNode 를 못 쓴다 — 소리를 OfflineAudioContext 로 그려 프레임마다 띠 세기를 표로 만들고, 프레임 시각으로 표를 읽는다. 견본은 늘 이 방식이라 소리를 켜도 그림과 맞는다.',
    ],
    when: ['리듬 게임 · 음악 플레이어 · 배경 연출', '음악에 맞춘 소개 영상 · 쇼츠 — 미리 분석해 굽기'],
    avoid: ['게임 판 자체가 출렁이면 안 될 때 — 배경 층에만', '깜박임에 민감한 사람 — 바탕 번쩍은 세기를 낮추고 1초에 3번 넘게 번쩍이지 않게'],
    cost: 'light',
    costNote: '실시간 분석은 브라우저가 해 줘 거의 공짜. 그리기는 막대 64개 · 원 몇 개. 미리 분석(4초, 프레임 240 × 띠 32)은 처음 한 번 수십 ms.',
    level: 2,
    must: [
      'AudioContext 는 사용자가 누른 뒤에 만들거나 resume 할 것 (폰 · 크롬 자동 재생 막힘)',
      '세기는 dB 로 바꾼 뒤 0 ~ 1 로 — 날것 진폭을 그대로 쓰지 않기',
      '띠는 로그 간격으로 — 고르게 나누면 막대 대부분이 고음에 몰려 거의 안 움직인다',
      '엔벨로프는 오름 · 내림 시간을 따로. 내림(릴리스)은 0.1 ~ 0.4초',
      '저 · 중 · 고에 서로 다른 움직임을 맡길 것',
      '영상 굽기용이면 미리 분석한 표를 쓰고, 프레임 시각 = 소리 시각이 되게',
    ],
    done: [
      '킥이 칠 때마다 가운데 원이 커졌다 스르르 줄고 고리가 하나 퍼진다',
      '하이햇이 칠 때 작은 반짝이가 늘고, 막대가 원 둘레로 주파수 순서대로 움직인다',
      '「엔벨로프 따라가기」를 끄면 막대 · 원이 바들바들 떨리고, 켜면 부드럽다',
      '「▶ 소리 듣기」를 누르면 실제 소리와 그림의 박이 맞는다',
      '오른쪽 저 · 중 · 고 막대에서 날것(흰 선)과 엔벨로프(색 막대)의 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '실시간 띠 세기 + 엔벨로프 + 박',
      from: '새로 씀 (demos/demosMotionE.ts i557 은 같은 식을 미리 분석한 표에 씀)',
      body: `const ana = ac.createAnalyser();
ana.fftSize = 2048;
ana.smoothingTimeConstant = 0;            // 부드럽게는 직접 (오름 · 내림 따로)
source.connect(ana);
const db = new Float32Array(ana.frequencyBinCount);
const NB = 32, env = new Float32Array(NB);
let prevBass = 0;

function frame(dt: number) {
  ana.getFloatFrequencyData(db);         // 칸마다 dB (−∞ ~ 0)
  const hz = ac.sampleRate / ana.fftSize; // 칸 하나의 폭
  const up = 1 - Math.exp(-dt / 0.01), dn = 1 - Math.exp(-dt / 0.22);
  for (let b = 0; b < NB; b++) {
    const lo = 40 * Math.pow(200, b / NB), hi = 40 * Math.pow(200, (b + 1) / NB);
    let s = -100, n = 0;
    for (let k = Math.floor(lo / hz); k <= Math.ceil(hi / hz); k++) { s = Math.max(s, db[k]); n++; }
    const v = Math.min(1, Math.max(0, (s + 54 + b * 0.45) / 54));
    env[b] += (v - env[b]) * (v > env[b] ? up : dn);
  }
  const bass = (env[0] + env[1] + env[2] + env[3] + env[4] + env[5]) / 6;
  if (bass - prevBass > 0.08) spawnRing();  // 박 = 저음이 훅 오름
  prevBass = bass;
}`,
    },
    pitfalls: [
      { title: '막대가 대부분 안 움직이고 왼쪽 몇 개만 춤춘다', fix: 'FFT 칸은 주파수가 고르게 나뉘어 음악 에너지가 몰린 저음 쪽은 몇 칸뿐이다. 로그 간격 띠로 묶고 dB 로 바꾼다.', seen: true },
      { title: '그림이 바들바들 떨려 어지럽다', fix: 'smoothingTimeConstant 하나로는 오름도 느려진다. 오름 10ms · 내림 0.2초짜리 엔벨로프를 직접 둔다.', seen: true },
      { title: '구운 영상에서 그림과 소리가 어긋난다', fix: '프레임 찍기는 실시간보다 느려 AnalyserNode 가 다른 순간을 준다. OfflineAudioContext 로 미리 분석한 표를 프레임 시각으로 읽는다.', seen: true },
      { title: '폰에서 소리 · 그림이 안 움직인다', fix: 'AudioContext 가 suspended 상태다. 첫 터치에서 ac.resume().' },
      { title: '바탕 번쩍임이 너무 잦다', fix: '박 사이 최소 간격(0.15초)을 두고 번쩍 세기를 낮춘다 — 광과민 안전.' },
    ],
    prev: ['i52', 'i163'],
    next: ['i438', 'i82'],
    refs: [
      { name: 'MDN — AnalyserNode', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode' },
      { name: 'MDN — Visualizations with Web Audio API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API' },
      { name: 'MDN — OfflineAudioContext', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext' },
    ],
  },

  i558: {
    id: 'i558',
    summary: '그림 한 장과 흑백 깊이 지도(흰색 = 가까움)로 가까운 것은 많이, 먼 것은 조금 밀어 정지 그림 속으로 카메라가 들어간 듯 — 셰이더가 깊이 층을 훑어 가림까지 맞추고, 가장자리 찢김은 깊이를 넓혀 막는다.',
    terms: [
      { en: '2.5D parallax / depth parallax (3D photo)', ko: '그림 한 장 + 깊이 지도로 만드는 입체 카메라 움직임' },
      { en: 'Depth map', ko: '픽셀마다 가까운 정도를 밝기로 — AI 깊이 추정(Depth Anything 등)으로도 얻음' },
      { en: 'Parallax occlusion mapping (ray march)', ko: '가까운 층부터 훑어 「이 깊이의 점이 여기로 밀려왔나」를 찾아 가림까지 맞추기' },
      { en: 'Depth dilation', ko: '깊이 지도의 가까운 쪽을 몇 픽셀 넓혀, 경계에서 배경이 늘어나게' },
      { en: 'Dolly zoom', ko: '앞으로 다가갈 때 가까운 층이 더 크게 커지는 원근' },
    ],
    goal: '{target}을(를) 그림 한 장과 깊이 지도로 2.5D 시차 효과를 만들어 줘 — 카메라가 옆으로 흔들리고 앞으로 다가가면 가까운 것은 많이, 먼 것은 조금 움직인다. 분위기는 {style}.',
    targets: ['이야기 장면 그림 (노을 들판)', '게임 시작 화면 배경', '옛날 사진 회상 장면'],
    styles: ['천천히 숨쉬듯 (켄 번스처럼)', '뮤직비디오처럼 빠르게', '꿈속처럼 흐린 초점'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: '화면을 덮는 평면 하나 + ShaderMaterial. 그림 · 깊이를 텍스처로, 카메라 이동은 uniform 하나. 깊이 지도는 그림과 같은 크기 · 같은 자리로.',
      unity: 'URP Full Screen Pass 또는 Quad 에 셰이더 그래프 — Parallax Occlusion Mapping 노드에 깊이 지도를 높이 지도로 넣어도 된다.',
      godot: 'TextureRect 에 canvas_item 셰이더 — 같은 층 훑기 반복문. 깊이 지도는 uniform sampler2D.',
    },
    principle: [
      '깊이 d(0 먼 ~ 1 가까움)인 점은 화면에서 off × (d − 초점) 만큼 밀린다. 초점 깊이의 층은 제자리, 그보다 가까우면 카메라 반대로, 멀면 같은 쪽으로 — 이 차이가 입체감이다.',
      '셰이더는 거꾸로 푼다: 화면 자리 uv 에서 가까운 층(1)부터 먼 층(0)으로 훑으며 p = uv − off × (층 − 초점) 의 깊이를 읽고, 깊이 ≥ 층 인 첫 자리를 쓴다. 가까운 것부터 보므로 앞 물체가 뒤를 가린다.',
      '층 사이를 그냥 끊으면 계단이 보인다 — 이전 층과 이 층의 차이로 선형 보간해 만나는 점을 찾는다 (패럴랙스 오클루전 매핑과 같다).',
      '앞으로 다가가기(돌리): 자리를 가운데 기준 1 + 세기 × (층 − 초점) 으로 나눠 가까운 층일수록 크게 키운다.',
      '경계 찢김: 앞 물체 가장자리의 깊이가 흐리면 물체가 늘어나 찢어져 보인다. 깊이 지도의 밝은 쪽을 3~5px 넓히면(최댓값 필터) 대신 뒤 배경이 늘어나 눈에 덜 띈다. 그림 가장자리는 10~16% 잘라 밀려도 밖이 안 보이게.',
    ],
    when: ['정지 그림 · 사진을 영상처럼 살릴 때 (이야기 장면 · 회상 · 썸네일 영상)', '3D 모델 없이 시작 화면에 입체감을 줄 때'],
    avoid: ['카메라가 크게 움직여야 할 때 — 가려졌던 뒤가 없어서 늘어난 자국이 보인다. 그땐 층을 따로 그린 시차(i104)나 진짜 3D', '얇고 복잡한 경계(머리카락 · 나뭇잎)가 많은 그림 — 깊이 지도가 틀리면 바로 티 난다'],
    cost: 'light',
    costNote: '화면 픽셀마다 텍스처 40번 읽기 — 폰에서도 전체 화면 60fps. 무거우면 층 수를 20으로.',
    level: 2,
    must: [
      '깊이 지도는 그림과 같은 크기 · 같은 자리 (흰색 = 가까움)',
      '셰이더는 가까운 층부터 먼 층으로 훑고, 층 사이는 선형 보간',
      '깊이 지도의 가까운 쪽을 3~5px 넓혀서 쓸 것 (경계 찢김 막기)',
      '그림을 10~16% 잘라 쓰기 — 밀려도 그림 밖이 안 보이게',
      '움직임은 작게: 옆 이동은 화면 폭의 4~9%, 오래 보는 화면이면 더 작게',
    ],
    done: [
      '카메라가 옆으로 흔들리면 앞 바위 · 사람은 많이, 나무 · 집은 덜, 산 · 하늘은 거의 안 움직인다',
      '「깊이 지도 보기」를 켜면 흰 앞쪽 · 검은 하늘이 그림과 같은 모양으로 보인다',
      '「깊이 가장자리 넓히기」를 끄면 사람 · 나무 가장자리가 찢어져 늘어나고, 켜면 대신 뒤 배경이 살짝 늘어난다',
      '「앞으로 다가가기」를 켜면 가까운 것이 더 크게 다가온다',
      '초점 깊이를 바꾸면 안 움직이는 층이 바뀐다 (사람 고정 → 뒤가 반대로 흐름)',
    ],
    code: {
      lang: 'glsl',
      title: '깊이 층 훑기 + 층 사이 보간 (조각 셰이더)',
      from: 'demos/demosMotionE.ts 의 FRAG558 을 정리',
      body: `uniform sampler2D uCol, uDep;   // 그림 · 깊이 (흰색 = 가까움)
uniform vec2 uOff;               // 카메라 옆 이동
uniform float uFocus, uDolly;    // 안 움직이는 깊이 · 다가가기 세기
varying vec2 vUv;
void main() {
  vec2 uv = (vUv - 0.5) * 0.86 + 0.5;          // 가장자리 여유
  vec2 hit = uv, prevP = uv;
  float prevD = -1.0;
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float layer = 1.0 - float(i) / float(N - 1);  // 가까운 층부터
    float k = layer - uFocus;
    vec2 p = 0.5 + (uv - 0.5) / (1.0 + uDolly * k) - uOff * k;
    float diff = texture2D(uDep, p).r - layer;
    hit = p;
    if (diff >= 0.0) {                            // 이 깊이의 점이 여기로 왔다
      if (i > 0) hit = mix(p, prevP, diff / (diff - prevD));
      break;
    }
    prevP = p; prevD = diff;
  }
  gl_FragColor = vec4(texture2D(uCol, hit).rgb, 1.0);
}`,
    },
    pitfalls: [
      { title: '앞 물체 가장자리가 찢어져 늘어난다', fix: '깊이 지도 경계가 흐리거나 그림보다 안쪽이면 물체 테두리 픽셀이 뒤 깊이로 읽힌다. 깊이의 밝은 쪽을 몇 px 넓혀(최댓값 필터) 경계를 물체 바깥으로 민다.', seen: true },
      { title: '경계에 계단 같은 줄무늬가 보인다', fix: '층 수가 적으면 층마다 끊긴다. 이전 층과의 차이로 보간하면 층 32 ~ 40개로도 매끈하다.', seen: true },
      { title: '그림 가장자리에 늘어난 띠 · 빈 곳이 보인다', fix: 'uv 를 0.84 ~ 0.9 로 줄여 여유를 두고, ClampToEdge 로 둔다.' },
      { title: '움직임이 너무 작아 정지 그림처럼 보인다', fix: '옆 이동을 화면 폭의 3% 안으로 두면 거의 안 보인다. 견본은 8.5% + 위아래 2% 의 8자 길.', seen: true },
      { title: '색이 탁하거나 너무 밝다', fix: 'ShaderMaterial 은 톤 매핑 · 색 공간 변환을 안 한다. 캔버스 텍스처를 색 공간 지정 없이 넣고 그대로 내보내면 원래 색이 나온다 (toneMapped: false).' },
    ],
    prev: ['i104', 'i105'],
    next: ['i125', 'i82'],
    refs: [
      { name: 'Depthy — 3D photo viewer (깊이 지도 시차)', url: 'https://depthy.stamina.pl/' },
      { name: 'Depth Anything (깊이 지도 추정)', url: 'https://github.com/LiheYoung/Depth-Anything' },
      { name: 'LearnOpenGL — Parallax Mapping', url: 'https://learnopengl.com/Advanced-Lighting/Parallax-Mapping' },
    ],
  },

  i559: {
    id: 'i559',
    summary: '3D 로 살짝 기운 폰 틀 속에서 화면이 손가락을 따라 밀리고 놓으면 관성으로 흐르며, 맨 위에서 당기면 고무줄처럼 덜 따라오다 새로고침 — 유리 반사 · 그림자가 기울기를 따라간다.',
    terms: [
      { en: 'Device mockup (perspective · rotateY)', ko: 'CSS 3D 로 기울인 폰 틀 — 소개 영상 · 스토어 그림의 기본' },
      { en: 'Momentum scrolling (exponential decay)', ko: '놓은 속도 × τ × (1 − e^(−t/τ)) 만큼 더 흐르다 멈춤' },
      { en: 'Rubber-band overscroll', ko: '끝을 넘겨 당기면 점점 덜 따라오는 넘침 — (1 − 1/(x·0.55/d + 1))·d' },
      { en: 'Pull to refresh', ko: '위에서 끌어내리면 도는 표시가 나오고 놓으면 새로고침' },
      { en: 'Touch indicator', ko: '시연 영상에서 손가락 자리를 보여 주는 반투명 동그라미' },
    ],
    goal: '{target}을(를) 보여 주는 폰 틀 목업 애니메이션을 만들어 줘 — 기울어진 폰 화면에서 손가락이 밀면 관성으로 흐르고, 눌러 고르고, 위에서 당기면 고무줄처럼 늘어나 새로고침. 분위기는 {style}.',
    targets: ['게임 소개 영상의 폰 화면', '앱 스토어 그림 (움직이는 미리 보기)', '사용법 안내 (어디를 미는지)'],
    styles: ['어두운 보라 바탕 · 밝은 앱', '밝은 단색 바탕 · 그림자 깊게', '손에 든 폰처럼 크게 흔들림'],
    platforms: ['dom', 'three', 'unity'],
    platformHints: {
      dom: '틀은 perspective 를 준 부모 안에서 rotateY · rotateX, 화면 속 내용은 translateY 만. 대본(시각 → 스크롤 · 손가락)을 함수 하나로 두면 영상 굽기(i82)와 맞는다.',
      three: '폰은 둥근 상자 메시, 화면은 CanvasTexture(또는 HTML 을 그린 캔버스)를 붙인 평면. 반사는 화면 위 얇은 투명 판에 환경맵.',
      unity: '폰 모델 화면에 RenderTexture 를 붙이고 UI 를 따로 그린다. 스크롤 관성은 ScrollRect 의 decelerationRate, 고무줄은 MovementType.Elastic.',
    },
    principle: [
      '틀: perspective 를 준 부모 안에서 폰을 rotateY −16° ± 10°, rotateX 6° 로 천천히 흔든다. 그림자는 기울기 반대로 밀고 가로로 조금 줄여 바닥에 붙은 느낌.',
      '반사: 화면 위 투명 판에 대각 밝은 띠(그라디언트)를 두고, 기울기에 따라 background-position 을 옮긴다 — 유리가 빛을 받는 듯.',
      '관성: 손가락이 D 만큼 끌다 놓은 순간 속도 V 로, 스크롤 = 놓은 자리 + V·τ·(1 − e^(−t/τ)). τ 0.3 ~ 0.5초면 폰처럼 스르르 멈춘다. 끝을 넘으면 막는다.',
      '고무줄: 맨 위에서 x 만큼 당기면 화면은 (1 − 1/(x·0.55/d + 1))·d 만 내려온다 (d = 화면 높이). 놓으면 새로고침 표시 높이에서 돌다가 스프링으로 제자리.',
      '모든 움직임을 「대본 시각 p」에서 바로 계산한다 — 손가락 자리 · 스크롤 · 표시 단계가 늘 맞고, 되감기 · 영상 굽기가 된다.',
    ],
    when: ['게임 · 앱 소개 영상, 스토어 미리 보기, 사용법 안내', '폰 화면 녹화 대신 깔끔하게 다시 그린 시연이 필요할 때'],
    avoid: ['실제 기기 녹화가 더 믿음직한 곳 (리뷰 · 버그 재현)', '진짜 상표 폰 모양을 그대로 베끼기 — 둥근 상자 + 섬 모양 정도로 일반적으로'],
    cost: 'light',
    costNote: 'transform 몇 개만 바뀐다. 3D 기울기는 합성 단계에서 처리돼 폰에서도 가볍다. 화면 속 내용이 무거우면 이미지 한 장으로 구워 넣는다.',
    level: 2,
    must: [
      '폰 기울기는 작게 (rotateY 30° 안) — 화면 내용이 읽혀야 한다',
      '화면 속 움직임은 translateY 로만, 내용은 overflow:hidden 인 둥근 화면 안에',
      '관성은 지수 감쇠, 맨 위 넘침은 고무줄 식 — 직선 감속 · 딱 멈춤 쓰지 않기',
      '손가락 표시: 누르는 동안 작아지고, 고를 땐 물결 + 고른 칸 강조',
      '진행 단계(밀기 · 누르기 · 맨 위로 · 당기기)를 옆 글로 함께 밝히기',
    ],
    done: [
      '폰이 천천히 기울며 흔들리고, 그림자와 유리 반사 띠가 기울기를 따라 움직인다',
      '손가락이 밀어 올렸다 놓으면 화면이 스르르 더 흐르다 멈춘다',
      '보이는 카드를 누르면 물결이 퍼지고 그 카드가 잠깐 파랗게 강조된다',
      '맨 위에서 당기면 손가락보다 덜 내려오며 새로고침 표시가 돌고, 놓으면 제자리로 튕긴다',
      '「고무줄 넘침」을 끄면 당겨도 화면이 꿈쩍 안 한다 (차이 비교)',
    ],
    code: {
      lang: 'ts',
      title: '관성 · 고무줄 식 + 폰 기울기',
      from: 'demos/demosMotionE.ts i559 의 at() · update 를 정리',
      body: `// 놓은 뒤 t 초 동안 더 흐른 거리 (지수 감쇠)
const fling = (v: number, t: number, tau = 0.45) => v * tau * (1 - Math.exp(-t / tau));

// 끝을 넘겨 x 만큼 당겼을 때 실제로 내려오는 거리 (d = 화면 높이)
const rubber = (x: number, d: number) => (1 - 1 / ((x * 0.55) / d + 1)) * d;

function frame(clock: number) {
  const s = script(clock % CYCLE);              // 대본 시각 → 스크롤 · 손가락 · 단계
  feed.style.transform = 'translateY(' + (-s.scroll) + 'px)';
  const ry = -16 + Math.sin(clock * 0.55) * 10; // 천천히 흔들리는 기울기
  phone.style.transform = 'rotateY(' + ry + 'deg) rotateX(6deg)';
  shadow.style.transform = 'translateX(' + (-ry * 0.35) + 'px)';
  glare.style.backgroundPosition = (50 + ry * 3.2) + '% 0'; // 반사 띠가 미끄러짐
  finger.style.opacity = String(s.fingerAlpha);
  finger.style.transform = 'scale(' + (s.pressed ? 0.82 : 1) + ')';
}`,
    },
    pitfalls: [
      { title: '폰 위쪽이 화면 밖으로 잘린다', fix: 'rotateX 로 기울이면 원근 때문에 위가 커진다. 폰 둘레에 여백(위아래 5% 넘게)을 둔다.', seen: true },
      { title: '누르는 카드가 이미 화면 밖이다', fix: '스크롤된 뒤의 자리를 계산하지 않고 원래 자리를 누르면 손가락이 허공을 누른다. 손가락 y = 카드 자리 − 그 순간 스크롤.', seen: true },
      { title: '관성이 끝에서 딱 끊긴다', fix: '직선으로 줄이면 멈추는 순간이 티 난다. 지수 감쇠는 끝으로 갈수록 저절로 느려진다.' },
      { title: '3D 기울기에서 글자가 흐려진다', fix: '변형 중엔 래스터 한 장을 늘려 그리기도 한다. 멈춘 장면을 오래 보여 줄 땐 기울기를 0 으로 풀거나 will-change 를 끈다.' },
    ],
    prev: ['i549', 'i548'],
    next: ['i82', 'i127'],
    refs: [
      { name: 'MDN — perspective (CSS)', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/perspective' },
      { name: 'Ariya Hidayat — Kinetic scrolling (지수 감쇠)', url: 'https://ariya.io/2013/11/javascript-kinetic-scrolling-part-2' },
    ],
  },
};

import type { TechDoc } from './types';

/**
 * 픽셀 그림 문서 (2026-10-07) — i500 AI 픽셀풍 그림 정리 · i501 픽셀 그림 한 장 살리기
 * 원혼 그림(surado 자료)으로 실제로 해 보며 겪은 것을 흔한 실수에 넣었다.
 */
export const DOCS: Record<string, TechDoc> = {
  i500: {
    id: 'i500',
    summary: 'AI 가 그린 픽셀풍 그림에서 격자 간격을 찾아 칸마다 대표 색을 뽑고 색을 수십 가지로 줄여, 번진 그림을 진짜 도트 그림으로 되돌린다.',
    terms: [
      { en: 'Pixel art cleanup (grid detection · downsampling)', ko: '픽셀 그림 정리 — 격자 찾기 · 칸 단위로 줄이기' },
      { en: 'Color quantization (k-means in CIELAB)', ko: '색 줄이기 — 사람 눈 기준 색 공간에서 k-평균' },
      { en: 'Median cell sampling', ko: '칸 가운데 화소들의 중앙값으로 대표 색' },
      { en: 'Background removal (flood fill · halo cleanup)', ko: '배경 지우기 — 가장자리에서 채우기 · 흰 테두리 찌꺼기 걷기' },
    ],
    goal: '{target}을(를) 진짜 도트 그림으로 정리하는 도구를 만들어 줘 — 격자를 찾아 칸 크기로 줄이고, 색을 줄이고, 배경을 지운다. 결과는 {style}.',
    targets: ['AI 로 뽑은 캐릭터 도트 그림', 'AI 로 뽑은 아이템 · 아이콘 묶음', '게임 배경 도트 그림'],
    styles: ['칸 크기 그대로 PNG (게임에서 정수 배로 키워 쓰기)', '원래 크기로 다시 키운 깨끗한 PNG', '팔레트 표까지 함께 내보내기'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: '정리는 에디터 스크립트(Texture2D.GetPixels)로 하고, 가져오기 설정은 Filter Mode = Point · Compression = None.',
      godot: '정리는 Image.get_pixel 로, 가져오기는 Filter Nearest · 압축 끔(Lossless).',
    },
    principle: [
      'AI 픽셀풍 그림은 큰 그림(예: 2048px)에 칸(예: 8px)을 흉내 낸 것이라, 칸 경계가 번지고 색이 수천 가지로 섞여 있다.',
      '격자 찾기: 이웃 화소 색 차이를 세로줄 · 가로줄마다 더하면 칸 경계에서 값이 튄다 — 간격 p · 시작 o 를 바꿔 가며 경계 세기가 가장 큰 것을 고른다.',
      '칸 대표 색: 칸 가장자리(번진 곳)를 버리고 가운데 화소들의 중앙값 — 평균은 탁해진다.',
      '색 줄이기: 그림 칸만 놓고 CIELAB 공간에서 k-평균. 채도가 큰 칸에 무게를 주면 금빛 · 초록 장식처럼 수가 적은 색도 살아남는다.',
      '배경: 가장자리에서 이어진 밝은 칸 + 고리 안쪽에 갇힌 밝은 덩어리 + 배경에 닿은 밝은 테두리(흰 바탕 찌꺼기)를 지운다.',
    ],
    when: ['AI 이미지 도구로 뽑은 도트 캐릭터 · 아이템을 게임에 넣기 전', '도트 그림을 애니메이션(i501)하기 전 — 칸이 고르지 않으면 움직일 때 깨진다'],
    avoid: ['처음부터 사람이 칸 단위로 그린 그림 — 이미 깨끗하다', '사진 · 매끈한 그림을 도트로 바꾸기 — 그건 픽셀화(모자이크 + 디더)라는 다른 일이다'],
    cost: 'light',
    costNote: '한 번만 하는 정리. 2048px 그림 격자 찾기는 수십 ms, 256×256 칸 k-평균(40색 · 12번)은 1초 안쪽. 게임 실행 중이 아니라 미리 해 두는 일.',
    level: 2,
    must: [
      '칸 크기를 사람이 넣지 않아도 되게 격자 간격 · 시작점을 자동으로 찾기 (4~16px 범위를 모두 시험)',
      '대표 색은 칸 가장자리를 버린 중앙값으로 (평균 금지 — 탁해진다)',
      '색 줄이기는 배경을 뺀 그림 칸만으로, RGB 가 아니라 CIELAB 거리로',
      '흰 배경 찌꺼기(테두리 · 갇힌 흰 칸)까지 지우되, 옷깃 · 눈 흰자 같은 작은 밝은 칸은 남기기',
      '단계별 결과를 나란히 보여 주기 (원본 · 격자 · 칸 · 색 줄임 · 배경 지움)',
    ],
    done: [
      '찾은 격자 선을 원본 위에 겹치면 칸 경계와 정확히 맞는다',
      '결과 그림을 정수 배로 키우면 칸 크기가 모두 같고 경계가 번지지 않는다',
      '색 수 슬라이더를 줄여도 금빛 · 초록 같은 작은 장식 색이 회색으로 빠지지 않는다',
      '어두운 바탕 위에 올려도 흰 점 테두리가 보이지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '격자 간격 · 시작점 찾기 (세로 경계 기준)',
      from: 'demos/demosPixelArt.ts findGrid() 를 정리',
      body: `// d: RGBA 화소, w · h: 크기. 세로줄마다 「왼쪽 이웃과의 색 차이」 합
function findGridX(d: Uint8ClampedArray, w: number, h: number) {
  const col = new Float64Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      col[x] += Math.abs(d[i] - d[i + 4]) + Math.abs(d[i + 1] - d[i + 5]) + Math.abs(d[i + 2] - d[i + 6]);
    }
  const mean = col.reduce((a, b) => a + b, 0) / w;
  let best = { p: 8, o: 0, score: 0 };
  for (let p = 4; p <= 16; p++)
    for (let o = 0; o < p; o++) {
      let s = 0, k = 0;
      for (let x = o; x < w - 1; x += p) { s += col[x]; k++; }
      const score = s / k / mean; // 경계가 칸 사이에 몰려 있으면 평균보다 몇 배 크다
      if (score > best.score) best = { p, o, score };
    }
  // 경계는 칸 끝 화소와 다음 칸 첫 화소 사이 → 칸 시작은 o + 1
  return { p: best.p, start: (best.o + 1) % best.p, score: best.score };
}`,
    },
    pitfalls: [
      { title: '흰 배경을 가장자리에서만 채우면 고리 안쪽 흰 칸이 남는다', fix: '팔 · 띠 고리 안쪽처럼 갇힌 밝은 덩어리도 8칸 이상이면 배경으로. 작은 덩어리(눈 흰자 · 옷깃)는 남긴다.', seen: true },
      { title: '배경을 지워도 머리카락 끝에 흰 점 테두리가 남는다', fix: 'AI 가 흰 바탕 위에 그려 경계 칸이 밝게 섞였다 — 배경에 닿은 아주 밝은 칸을 한두 번 더 걷는다.', seen: true },
      { title: 'RGB 로 색을 줄이면 금빛 · 초록 장식이 회색으로 빠진다', fix: 'CIELAB 거리 + 채도에 무게를 준 k-평균, 그리고 배경 칸은 빼고 계산한다.', seen: true },
      { title: '칸 평균색을 쓰면 그림이 탁해진다', fix: '번진 가장자리를 버리고 가운데 화소들의 중앙값을 쓴다.' },
    ],
    prev: ['i304'],
    next: ['i501', 'i296', 'i236'],
    refs: [
      { name: 'Wikipedia — Color quantization', url: 'https://en.wikipedia.org/wiki/Color_quantization' },
      { name: 'Wikipedia — CIELAB color space', url: 'https://en.wikipedia.org/wiki/CIELAB_color_space' },
    ],
  },
  i501: {
    id: 'i501',
    summary: '도트 그림 한 장을 부위별로 오려 겹으로 나누고 통째로 칸 단위로 옮겨, 외곽선을 깨지 않고 가만히 · 걸음 · 공격 · 맞음 · 사라지기까지 움직인다.',
    terms: [
      { en: 'Cutout animation for pixel art (part layers)', ko: '부위 오려 내기 애니메이션 — 픽셀 그림용' },
      { en: 'Integer pixel offsets · stepped timing (8–12 fps)', ko: '칸 단위 이동 · 끊어서 움직이기' },
      { en: 'Palette cycling (color cycling)', ko: '색 순환 — 칸은 그대로, 색만 흘러 연기 · 불꽃' },
      { en: 'Hit flash · dither dissolve · afterimage', ko: '맞음 번쩍 · 칸 흩어짐 사라지기 · 디더 잔상' },
    ],
    goal: '{target}을(를) 그림 한 장만으로 움직이게 해 줘 — 부위를 오려 겹으로 나누고 칸 단위로 통째로 옮기고, 연기 · 불꽃은 색 순환으로. 상태는 {style}.',
    targets: ['정면을 보는 보스 · 적 도트 캐릭터', '이야기 게임에 나오는 인물 도트 그림', '움직이는 도트 배경 소품 (깃발 · 횃불 · 물레방아)'],
    styles: ['가만히 · 공격 · 맞음 · 사라지기 · 분노 상태 세트', '가만히 숨쉬기 하나만 (반복)', '등장 · 퇴장 연출만'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 2D Animation 패키지의 스프라이트 스키닝 대신, 부위마다 SpriteRenderer 를 겹치고 위치를 1/PPU 단위로 반올림해 움직인다. 카메라는 Pixel Perfect Camera.',
      godot: '부위마다 Sprite2D 를 겹치고 position 을 정수로 반올림. 프로젝트 설정 Snap 2D Transforms to Pixel 을 켠다.',
    },
    principle: [
      '도트 그림을 칸마다 휘게(warp) 하면 휘는 양이 다른 곳에서 칸이 겹치거나 빠져 1칸짜리 외곽선이 끊긴다 — 도트는 「통째로 · 칸 단위로」 움직여야 한다.',
      '부위를 몸 뒤(띠 · 머리카락 끝)와 몸 앞(손 · 장식 · 꽃)으로 나눈다. 뒤 부위는 몸통 아래에 그리고, 앞 부위가 비킨 자리는 옆 칸으로 메운다.',
      '이음매는 가려지는 곳에 둔다 — 띠는 소매 뒤를 기준으로 위 고리 · 아래 가닥으로 나누면 끊김이 소매에 숨는다.',
      '연기 · 불꽃처럼 모양이 흐르는 것은 칸을 옮기지 말고 색만 돌린다(색 순환): 밝기 단계 + (높이 + 시간) 의 물결.',
      '1초에 8장처럼 끊어서 움직이고, 모든 주기를 한 바퀴 장 수의 약수로 맞추면 스프라이트 시트가 이음새 없이 돈다.',
    ],
    when: ['그림을 한 장만 받았고 프레임을 따로 그릴 수 없을 때', '정면 전투의 적 · 보스, 이야기 장면의 인물처럼 크게 움직이지 않는 캐릭터'],
    avoid: ['걷기 · 달리기처럼 팔다리가 크게 움직이는 캐릭터 — 자세마다 따로 그린 프레임이 필요하다', '옆모습이 필요한 옆 스크롤 게임 — 정면 그림 하나로는 방향을 못 바꾼다'],
    cost: 'light',
    costNote: '256×256 칸 한 장을 부위마다 옮겨 합치는 일 — 화면 크기와 상관없이 가볍다. 미리 스프라이트 시트로 구우면 실행 중 비용은 0.',
    level: 2,
    must: [
      '그림을 휘지(warp · mesh deform) 말 것 — 부위마다 통째로, 정수 칸 단위로만 옮긴다',
      '부위 영역은 그림 칸 단위 마스크(부위 번호 그림)로, 몸 뒤 · 몸 앞을 나눠서',
      '연기 · 불꽃은 색 순환으로 (칸 위치는 그대로)',
      '1초에 8~12장으로 끊고, 모든 움직임 주기를 한 바퀴 장 수에 맞춰 시트가 이어지게',
      '효과(음파 고리 · 음표 · 불티)도 같은 팔레트 · 같은 칸 크기로 그리기 — 매끈한 선 · 반투명 금지',
    ],
    done: [
      '한 장씩 넘겨 봐도 외곽선이 끊기거나 칸 크기가 달라지는 곳이 없다',
      '「나눈 부위 보기」로 띠 · 머리카락 · 장식 · 손 · 연기 영역이 색으로 보인다',
      '상태 단추(가만히 · 공격 · 맞음 · 사라지기 · 나타나기 · 분노)를 누르면 바로 바뀌고, 한 번짜리 상태는 끝나면 가만히로 돌아온다',
      '스프라이트 시트로 구워 8장/초로 돌리면 이음새 없이 반복된다',
    ],
    code: {
      lang: 'ts',
      title: '부위 겹 합치기 — 뒤 부위 → 몸통 → 앞 부위, 모두 정수 칸 이동',
      from: 'demos/demosPixelArt.ts charLayer() 를 정리',
      body: `// src: 원본 RGBA(256×256), base: 앞 부위 자리를 메우고 뒤 부위를 비운 몸통, parts[k]: 부위 k 의 칸 번호 목록
// off[k] = [dx, dy] (정수) — 매 장 sin 을 반올림해 -1 · 0 · 1 로
function compose(out: Uint8ClampedArray, src: Uint8ClampedArray, base: Uint8ClampedArray,
                 parts: Record<number, number[]>, off: Record<number, [number, number]>,
                 back: number[], front: number[], N = 256) {
  out.fill(0);
  const put = (x: number, y: number, s: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const p = (y * N + x) * 4;
    out[p] = src[s * 4]; out[p + 1] = src[s * 4 + 1]; out[p + 2] = src[s * 4 + 2]; out[p + 3] = 255;
  };
  for (const k of back) for (const i of parts[k] ?? []) put((i % N) + off[k][0], ((i / N) | 0) + off[k][1], i);
  for (let i = 0; i < N * N; i++) if (base[i * 4 + 3]) out.set(base.subarray(i * 4, i * 4 + 4), i * 4); // 몸통이 뒤 부위를 덮는다
  for (const k of front) for (const i of parts[k] ?? []) put((i % N) + off[k][0], ((i / N) | 0) + off[k][1], i);
}
const sq = (f: number, period: number, ph = 0) => Math.round(Math.sin((2 * Math.PI * f) / period + ph)); // -1 · 0 · 1`,
    },
    pitfalls: [
      { title: '그림을 칸마다 휘게 하면 외곽선이 끊기고 지글거린다', fix: '처음 시험판이 이랬다 — 휘는 양이 다른 곳에서 칸이 겹치거나 빠진다. 부위를 오려 통째로 정수 칸만큼 옮긴다.', seen: true },
      { title: '긴 부위를 두 조각으로 나누면 이음매가 찢어진다', fix: '이음매를 소매 · 몸통 뒤처럼 가려지는 곳에 둔다. 띠는 위 고리 · 아래 가닥으로.', seen: true },
      { title: '부위 상자를 네모로 잡으면 뒤의 치마까지 같이 움직인다', fix: '상자 안에서도 그 부위 색 · 이어진 덩어리만 고른다(연꽃 상자가 치마를 같이 잡았던 일).', seen: true },
      { title: '사라지기를 무작위 칸으로 흩으면 모래알처럼 지저분하다', fix: '아래 → 위 순서에 작은 무작위만 섞어 경계선이 보이게 하고, 날아가는 알갱이는 일부 칸만.', seen: true },
      { title: '0.5 칸처럼 소수점 위치에 그리면 칸 크기가 제각각이 된다(믹셀)', fix: '모든 위치를 정수 칸으로 반올림하고, 화면 확대도 정수 배로.' },
    ],
    prev: ['i500', 'i59'],
    next: ['i236', 'i295', 'i201', 'i296'],
    refs: [
      { name: 'Wikipedia — Color cycling', url: 'https://en.wikipedia.org/wiki/Color_cycling' },
      { name: 'Wikipedia — Cutout animation', url: 'https://en.wikipedia.org/wiki/Cutout_animation' },
    ],
  },
};

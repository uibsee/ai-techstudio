import type { TechDoc } from './types';

/**
 * 기술 문서 B06 — 화려한 효과(부피 불 · 2D 불 · 플립북 · 충격파 · 아지랑이 · 포털 · 리본 · 은신),
 * 3D 게임 기본기(작은 행성 · 캐릭터 조작기 · 카메라 충돌 · 적 AI · 천 · 부서짐 · 시야 안개 · 가리는 벽),
 * 게임 AI(미니맥스 · 반복 심화 · 전치표 · 정지 탐색 · 평가 함수 · MCTS · 기대값 · 후퇴 분석 · 님합 · BFS · 백트래킹 · GF(2) · 미니맥스 추측 · 온도 · 워커)
 * 코드는 견본(demos/*.ts)의 실제 코드에서 발췌 · 정리했다 (from 에 출처). 견본이 그림 설명뿐인 것은 「새로 씀」.
 */
export const DOCS: Record<string, TechDoc> = {
  i57: {
    id: 'i57',
    summary: '3D 잡음으로 만든 밀도를 화면 픽셀마다 광선으로 40걸음 훑으며 빛을 모아, 속이 꽉 찬 불 · 구름을 그린다.',
    terms: [
      { en: 'Volumetric ray marching', ko: '광선을 조금씩 나아가며 부피 속 밀도를 더하기' },
      { en: 'Beer-Lambert transmittance', ko: '지나온 밀도만큼 빛이 줄어드는 비율 T = exp(−밀도 × 거리)' },
      { en: 'fbm 3D noise density', ko: '여러 겹 3D 잡음으로 만든 불 · 구름 모양' },
      { en: 'Ray-sphere bounding', ko: '부피가 있는 구 안에서만 걸음을 쓰기' },
    ],
    goal: '{target}을(를) 3D 잡음 밀도를 광선으로 훑는 부피 렌더링으로 그려 줘. 분위기는 {style}.',
    targets: ['모닥불 · 횃불 불꽃', '뭉게구름 한 덩이', '필살기 불덩이 · 연기 폭발'],
    styles: ['밤하늘 아래 따뜻한 불빛', '파스텔 하늘의 뭉게구름', '어둡고 강렬한 마법 불'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP · HDRP 는 Shader Graph 의 Custom Function 노드에 같은 반복문을 넣는다. 큰 구름은 HDRP Volumetric Clouds · Local Volumetric Fog 가 있다.',
      godot: 'Godot 4 는 spatial 셰이더의 fragment() 에서 같은 반복문을, 넓은 안개는 FogVolume 노드로.',
    },
    principle: [
      '화면 픽셀마다 카메라에서 광선을 쏘고, 부피를 감싼 구와 만나는 구간만 40 걸음으로 나눈다.',
      '걸음마다 3D 잡음(fbm)으로 밀도 d 를 구하고, 밝기 = 색 × d × 걸음 길이 를 「아직 남은 빛 T」만큼 곱해 더한다.',
      'T 는 걸음마다 exp(−d × dt × k) 로 줄어든다 — T 가 0.02 아래면 뒤는 안 보이니 멈춘다.',
      '불은 높이에 따라 좁아지는 기둥 모양에서 잡음을 빼 깎고, 색은 밀도에 따라 검정 → 빨강 → 주황 → 노랑 → 흰색 띠로.',
      '구름은 해 쪽으로 0.22 만큼 한 번 더 밀도를 읽어 그늘(li = exp(−dl × 2.6))을 만든다.',
    ],
    when: ['불 · 연기 · 구름이 화면 가운데서 크게 보이는 주인공일 때', '돌아가며 봐도 속이 꽉 찬 덩어리로 보여야 할 때'],
    avoid: ['작게 여러 개 나오는 불씨 · 연기 — 2D 불 셰이더(i58)나 플립북(i59)이 훨씬 싸다', '폰에서 화면 전체를 덮는 구름 — 구름 그림을 붙인 판(빌보드)으로'],
    cost: 'heavy',
    costNote: '픽셀마다 40걸음 × fbm 잡음 여러 겹. 1080p 전체 화면이면 한 장면에 수억 번 잡음 계산 — 폰은 해상도를 반으로 낮춰 그리거나 부피를 화면 일부로.',
    level: 3,
    must: [
      '부피는 구(또는 상자)로 감싸 그 안에서만 걸음을 쓴다 — 빈 하늘에 걸음을 낭비하지 않기',
      '걸음 시작점을 픽셀마다 무작위로 조금 밀어(jitter) 줄무늬(banding)를 없앤다',
      'T < 0.02 이면 반복문을 빠져나온다 (앞이 꽉 막히면 뒤는 계산하지 않기)',
      '잡음은 반복문 안에서 여러 번 부르지 말고 미리 구운 3D 잡음 텍스처(Data3DTexture)를 읽는다 — 윈도 셰이더 컴파일 멈춤 방지',
      '걸음 수는 uniform 이 아닌 상수로 (GLSL 반복문 한계) — 품질 단계는 셰이더를 따로 만들어',
    ],
    done: [
      '불은 아래가 넓고 위로 갈수록 좁아지며 위로 흘러 일렁이고, 가운데는 흰빛 · 가장자리는 빨갛게 보인다',
      '구름은 해 쪽이 밝고 반대쪽 아래가 푸르스름하게 어둡다 (속이 꽉 찬 덩어리)',
      '걸음 수를 바꿔 보면 적을수록 줄무늬가 생기는데, jitter 를 켜면 사라진다',
      '켤 때 셰이더 컴파일 멈춤이 1초를 넘지 않는다',
    ],
    code: {
      lang: 'glsl',
      title: '부피 불 — 구 안에서 40걸음 훑으며 빛 모으기',
      from: 'demos/demosShader.ts volumeDemo() 의 fire() 를 정리',
      body: `bool sph(vec3 ro, vec3 rd, vec3 c, float r, out float t0, out float t1){
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) return false; h = sqrt(h); t0 = -b - h; t1 = -b + h; return t1 > 0.0;
}
vec3 fire(vec3 ro, vec3 rd, vec3 bg, vec2 p){
  float t0, t1; vec3 acc = vec3(0.0); float T = 1.0;          // T = 아직 남은 빛
  if (sph(ro, rd, vec3(0.0, 0.2, 0.0), 1.15, t0, t1)){
    t0 = max(t0, 0.0); float dt = (t1 - t0) / 40.0;
    float t = t0 + dt * rnd(p * 91.7);                          // 시작점 흔들기 — 줄무늬 없애기
    for (int i = 0; i < 40; i++){
      vec3 x = ro + rd * t;
      float hgt = clamp((x.y + 0.75) / 1.9, 0.0, 1.0);
      float w = 0.5 * (1.0 - hgt * 0.8) + 0.03;                // 위로 갈수록 좁은 기둥
      float n = fbm3(x * 2.4 - vec3(0.0, uTime * 2.0, 0.0));    // 위로 흐르는 잡음
      float d = clamp((1.0 - length(x.xz) / w) * 1.3 + (n - 0.5) * 1.7 - hgt * 0.55, 0.0, 1.0) * step(-0.75, x.y);
      if (d > 0.001){
        acc += T * fireRamp(d * (1.2 - hgt * 0.75)) * d * dt * 9.0;
        T *= exp(-d * dt * 4.0);                                // 비어-람베르트
        if (T < 0.02) break;
      }
      t += dt;
    }
  }
  return bg * T + acc;                                          // 남은 빛만큼 뒤 배경이 비친다
}`,
    },
    pitfalls: [
      { title: '반복문 안에서 fbm 잡음을 부르면 셰이더 컴파일이 수십 초 멈춘다', fix: '윈도 D3D 는 반복문 × 잡음을 펼쳐서 컴파일한다. 잡음은 미리 구운 3D 텍스처로 읽고, 첫 사용 전 compileAsync 로 데운다.', seen: true },
      { title: '걸음 시작점이 모두 같으면 동심원 줄무늬가 보인다', fix: '픽셀마다 무작위(0~1) × dt 만큼 시작을 민다. 견본은 rnd(p · 91.7).' },
      { title: '부피 밖 빈 공간까지 걸으면 같은 걸음 수로 흐릿해진다', fix: '구와 광선의 교점(t0 · t1) 사이만 나눈다 — 같은 40걸음이 부피 안에 다 쓰인다.' },
      { title: '밀도에 곱하는 수를 크게 하면 하얗게 타 버린다', fix: '빛 모으기(× 9)와 막힘(× 4)을 따로 조절한다. 구름은 둘 다 7 로 맞췄다.' },
    ],
    prev: ['i56', 'u54'],
    next: ['i58', 'i497'],
    refs: [{ name: 'Wikipedia — Volume ray casting', url: 'https://en.wikipedia.org/wiki/Volume_ray_casting' }],
    source: [{ file: 'demosShader.ts', symbol: 'volumeDemo' }],
  },

  i58: {
    id: 'i58',
    summary: '위로 흐르는 잡음을 불꽃 모양으로 깎고 밝기에 따라 색 띠를 입혀, 판 하나로 일렁이는 불을 만든다.',
    terms: [
      { en: 'Procedural 2D fire shader', ko: '그림 없이 코드로 만드는 불' },
      { en: 'Scrolling fbm noise', ko: '시간에 따라 위로 흘러가는 여러 겹 잡음' },
      { en: 'Color ramp (gradient map)', ko: '밝기 0~1 을 검정 → 빨강 → 주황 → 노랑 → 흰색으로' },
    ],
    goal: '{target}에 잡음을 위로 흘려 불꽃 모양으로 깎은 2D 불 셰이더를 넣어 줘. 분위기는 {style}.',
    targets: ['모닥불 · 촛불', '로켓 엔진 불꽃', '불꽃 강속구 꼬리'],
    styles: ['따뜻하고 아늑한 밤', '만화처럼 또렷한 불', '어둡고 무서운 지옥불'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Shader Graph 에서 Tiling And Offset(시간 × 위쪽) → Simple Noise, 마스크와 곱한 뒤 Sample Gradient 로 색.',
      godot: 'Godot 은 canvas_item 또는 spatial 셰이더에서 TIME 으로 UV 를 올리고 noise 텍스처(NoiseTexture2D)를 읽는다.',
    },
    principle: [
      '① 잡음: fbm 잡음의 y 좌표에서 시간을 빼면 무늬가 위로 흘러간다 (빠른 잔잡음 30% 를 섞어 날름거림).',
      '② 모양: 아래는 넓고 위로 갈수록 좁은 마스크(폭 = 0.26 × (1 − 높이)^0.6)를 만들고, 잡음이 낮은 곳은 깎아 낸다.',
      '③ 색: 남은 세기 I(0~1)를 색 띠에 넣는다 — 0 검정, 0.3 짙은 빨강, 0.6 주황, 0.85 노랑, 1 흰색.',
      '높이에 비례해 좌우로 살짝 흔들면(sin) 바람에 휘는 불꽃이 된다.',
    ],
    when: ['횃불 · 촛불처럼 작은 불이 여러 개일 때', '정면에서만 보는 2D 화면 · 카메라를 보는 판(빌보드)'],
    avoid: ['돌아가며 봐도 덩어리여야 하는 큰 불 — 부피 불(i57)', '터지는 한순간 — 플립북(i59)이나 입자(i170)가 더 쉽다'],
    cost: 'light',
    costNote: '픽셀마다 잡음 몇 번이면 끝. 판 크기만큼만 계산하니 폰에서도 여러 개 OK.',
    level: 1,
    must: [
      '잡음 · 마스크 · 색 띠 세 단계를 나눠서 (설명 화면이면 셋을 나란히)',
      '빠르기 · 불꽃 높이를 uniform 으로 조절',
      '판에 쓸 땐 가산 섞기(AdditiveBlending) · depthWrite 끔',
      '잡음은 반복문 없이 정해진 겹 수로 (또는 잡음 텍스처)',
    ],
    done: [
      '잡음 무늬가 아래에서 위로 흐르는 것이 보인다',
      '불꽃 끝이 날름거리며 끊어지고, 가운데는 노랗고 가장자리는 빨갛다',
      '「흐르는 빠르기」 · 「불꽃 높이」 슬라이더가 바로 반영된다',
      '판 10개를 띄워도 폰에서 60fps',
    ],
    code: {
      lang: 'glsl',
      title: '위로 흐르는 잡음 → 불꽃 모양 → 색 띠',
      from: 'demos/demosShader.ts fire2dDemo() 의 셰이더를 정리',
      body: `uniform float uTime; uniform float uSpeed; uniform float uH; // uH = 불꽃 높이 0.62
vec3 ramp(float x){
  vec3 c = mix(vec3(0.0), vec3(0.7, 0.06, 0.02), smoothstep(0.0, 0.3, x));
  c = mix(c, vec3(1.0, 0.45, 0.05), smoothstep(0.3, 0.6, x));
  c = mix(c, vec3(1.0, 0.85, 0.3), smoothstep(0.6, 0.85, x));
  return mix(c, vec3(1.0, 1.0, 0.92), smoothstep(0.85, 1.0, x));
}
vec3 fire(vec2 p){ // p.x = 가운데 0, p.y = 아래 0 ~ 위 1
  float tt = uTime * uSpeed;
  // ① 잡음을 위로 흘린다
  float n = fbm(vec2(p.x * 5.0, p.y * 3.5 - tt * 1.8)) * 0.7 + noise(vec2(p.x * 11.0, p.y * 8.0 - tt * 3.2)) * 0.3;
  // ② 아래 넓고 위로 좁은 불꽃 모양으로 깎는다
  float base = 0.12;
  float vv = (p.y - base) / uH;
  float wd = 0.26 * pow(1.0 - clamp(vv, 0.0, 1.0), 0.6) + 0.005;
  float sway = 0.03 * sin(p.y * 6.0 - tt * 4.0) * clamp(vv, 0.0, 1.0);
  float mask = clamp(1.0 - abs(p.x + sway) / wd, 0.0, 1.0) * smoothstep(-0.1, 0.05, vv) * smoothstep(1.05, 0.8, vv);
  float I = clamp(mask * 1.8 - (1.0 - smoothstep(0.2, 0.8, n)) * 1.15 - max(vv, 0.0) * 0.5, 0.0, 1.0);
  // ③ 밝기 → 색 띠
  return ramp(clamp(I * 1.6, 0.0, 1.0));
}`,
    },
    pitfalls: [
      { title: '잡음을 그냥 위로만 흘리면 연기처럼 보인다', fix: '불꽃 모양 마스크에서 잡음이 낮은 곳을 「빼야」 끝이 날름거린다. 곱하기만 하면 뭉개진다.' },
      { title: '색 띠 대신 한 색에 밝기만 바꾸면 밋밋하다', fix: '세기별로 빨강 → 주황 → 노랑 → 흰색을 지나야 진짜 불처럼 뜨거워 보인다.' },
      { title: '판 가장자리에서 불이 잘린다', fix: '마스크를 판 안쪽(폭 0.26, 높이 uH 까지)으로 줄이고, 위 끝은 smoothstep 으로 사라지게.' },
    ],
    prev: ['u54'],
    next: ['i57', 'i59', 'i170'],
    refs: [{ name: 'greentec — Shadertoy fire shader 설명', url: 'https://greentec.github.io/shadertoy-fire-shader-en/' }],
    source: [{ file: 'demosShader.ts', symbol: 'fire2dDemo' }],
  },

  i59: {
    id: 'i59',
    summary: '폭발 그림 16칸을 한 장에 모아 두고 시간에 따라 칸을 넘겨, 계산 없이 화려한 폭발 · 연기를 싸게 보여 준다.',
    terms: [
      { en: 'Flipbook animation (sprite sheet)', ko: '그림 칸을 차례로 넘기는 애니메이션' },
      { en: 'Texture atlas', ko: '여러 그림을 한 장에 모은 텍스처' },
      { en: 'Frame accumulator', ko: '흐른 시간 × 초당 장 수를 모아 1 이 넘을 때마다 다음 칸' },
    ],
    goal: '{target}을(를) 4×4 그림 칸 플립북으로 보여 줘 — 1초에 12장씩 넘기기. 분위기는 {style}.',
    targets: ['상자가 터지는 폭발', '연기 · 먼지 뭉게', '정답 순간 반짝 효과'],
    styles: ['만화처럼 통통 튀는', '귀엽고 아기자기', '묵직한 액션'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 는 texture.repeat.set(1/4, 1/4) 와 texture.offset 을 칸마다 바꾸거나, 스프라이트 재질에 같은 텍스처를 쓴다.',
      unity: 'Particle System 의 Texture Sheet Animation 모듈 (Tiles 4×4), VFX Graph 는 Flipbook Player 블록.',
      godot: 'Godot 은 AnimatedSprite2D + SpriteFrames, 입자는 CanvasItemMaterial 의 Particles Animation (H/V Frames).',
    },
    principle: [
      '폭발의 16 순간을 128px 칸 4×4 에 미리 그려 한 장(512px)으로 둔다 — 견본은 캔버스로 직접 그렸다.',
      '매 장면 「흐른 초 × 초당 장 수」를 모아, 1 이 넘을 때마다 다음 칸으로 넘긴다 (장면 빠르기와 상관없이 같은 빠르기).',
      'k 번째 칸은 가로 k % 4, 세로 floor(k / 4) 자리 — drawImage 의 원본 사각형만 바꿔 그린다.',
      '견본은 16칸 + 6박 쉬기 = 22박을 돌며, 쉬는 동안은 터지기 전 상자를 보여 준다.',
    ],
    when: ['폭발 · 연기처럼 계산하면 비싼 모양을 싸게 보여 줄 때', '같은 효과가 여러 곳에서 동시에 터질 때'],
    avoid: ['카메라가 가까이 돌아가며 보는 큰 효과 — 판이 납작한 게 드러난다. 입자 층 쌓기(i171)로', '모양이 판마다 달라야 할 때 — 코드 생성 효과로'],
    cost: 'light',
    costNote: '그림 한 장 + 사각형 하나 그리기. 계산은 거의 없고 텍스처 메모리 512×512 하나.',
    level: 1,
    must: [
      '칸 넘기기는 시간 누적(acc += dt × fps)으로 — 장면마다 한 칸씩 넘기면 기기마다 빠르기가 다르다',
      '「1초에 넘기는 장 수」를 조절 가능하게 (견본 2~30, 기본 12)',
      '그림 칸 사이에 1~2px 여백을 둬 이웃 칸이 번져 들어오지 않게',
      '설명 화면이면 왼쪽에 시트 전체 + 지금 칸 노란 테두리, 오른쪽에 넘겨 보이는 큰 화면',
    ],
    done: [
      '시트에서 노란 테두리가 1 → 16 칸을 지나가고, 오른쪽 화면에서 폭발이 커졌다 연기로 사그라든다',
      '「1초에 넘기는 장 수」를 2 로 낮추면 뚝뚝 끊기고 30 이면 매끈하다',
      '느린 기기에서도 1초에 넘기는 장 수가 같다',
    ],
    code: {
      lang: 'ts',
      title: '시간 누적으로 칸 넘기기 + 칸 하나 그리기',
      from: 'demos/demosShader.ts flipbookDemo() 를 정리',
      body: `const CELL = 128;           // 시트 = 128px 칸 4 × 4 (512px 한 장)
const sheet = makeSheet();  // 캔버스나 그림 파일
let fps = 12;
let acc = 0;
let frame = 0;

function draw(g: CanvasRenderingContext2D, dt: number, x: number, y: number, size: number): void {
  acc += dt * fps;                       // 장면 빠르기와 상관없이 1초에 fps 장
  while (acc >= 1) {
    acc -= 1;
    frame = (frame + 1) % 22;            // 16칸 + 쉬는 6박
  }
  if (frame >= 16) return;               // 쉬는 중 (터지기 전 상자 등을 그린다)
  const sx = (frame % 4) * CELL;
  const sy = Math.floor(frame / 4) * CELL;
  g.drawImage(sheet, sx, sy, CELL, CELL, x - size / 2, y - size / 2, size, size);
}`,
    },
    pitfalls: [
      { title: '장면마다 한 칸씩 넘기면 기기마다 빠르기가 다르다', fix: '흐른 시간을 모아 넘긴다 — 120Hz 화면에선 두 배 빨라지는 실수를 막는다.' },
      { title: '칸 경계에 옆 칸 그림이 살짝 비친다', fix: '텍스처 필터가 이웃 픽셀을 섞기 때문. 칸마다 여백을 두거나 원본 사각형을 0.5px 안쪽으로.' },
      { title: '끝 칸에서 첫 칸으로 바로 돌면 같은 폭발이 기계처럼 반복된다', fix: '쉬는 박자를 두거나(견본 6박) 크기 · 회전을 조금씩 바꿔 그린다.' },
    ],
    next: ['i170', 'i171'],
    refs: [{ name: 'MDN — CanvasRenderingContext2D.drawImage()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage' }],
    source: [{ file: 'demosShader.ts', symbol: 'flipbookDemo' }],
  },

  i60: {
    id: 'i60',
    summary: '장면을 텍스처로 먼저 그리고 퍼지는 고리 띠 안의 픽셀만 바깥쪽으로 밀어 읽어, 터지는 순간 화면이 출렁이게 한다.',
    terms: [
      { en: 'Shockwave distortion (screen-space)', ko: '화면 좌표에서 고리 모양으로 밀어 읽기' },
      { en: 'Render target post-process', ko: '장면을 텍스처에 그린 뒤 화면 전체 판으로 다시 그리기' },
      { en: 'Chromatic aberration', ko: '빨강 · 초록 · 파랑을 조금씩 다르게 밀어 색이 갈라짐' },
    ],
    goal: '{target} 순간에 고리가 퍼지며 화면을 밀어 일그러뜨리는 충격파 후처리를 넣어 줘. 분위기는 {style}.',
    targets: ['별이 터지는 순간', '홈런 · 정답 순간', '소닉붐 · 큰 착지'],
    styles: ['밝고 신나는 사탕 장난감 세상', '묵직한 액션', '만화처럼 과장된'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 는 Full Screen Pass Renderer Feature + Shader Graph 의 URP Sample Buffer(BlitSource) 노드를 고리만큼 밀어 읽는다.',
      godot: 'Godot 4 는 화면 전체 MeshInstance 나 ColorRect 셰이더에서 hint_screen_texture 를 밀어 읽는다.',
    },
    principle: [
      '1) 장면을 화면 크기 렌더 타깃에 그린다. 2) 화면을 덮는 판에서 그 텍스처를 읽어 다시 그린다.',
      '터진 곳(화면 좌표 uC)에서의 거리 r 과 고리 반지름 R = 나이 × 1.15 를 비교해, 두께 0.13 띠 안에서만 band = 1 − x² 로 세기를 준다.',
      '띠 안 픽셀은 바깥 방향으로 0.06 × 세기 만큼 밀린 곳을 읽는다 — 나이가 1.3 초가 되면 사라진다(fade).',
      '빨강 1.25배 · 초록 1배 · 파랑 0.75배로 밀면 가장자리에 무지갯빛 갈라짐이 생긴다.',
      '화면 비율(asp)을 곱해 거리를 재야 고리가 타원이 아닌 원이 된다.',
    ],
    when: ['정답 · 득점 · 폭발처럼 한순간을 크게 강조할 때', '진동 · 히트스톱과 함께 손맛을 줄 때'],
    avoid: ['계속 켜 두는 효과 — 눈이 피곤하다. 0.5~1.3초 한 번', '후처리를 아예 안 쓰는 가벼운 장면 — 고리 판 메시(i178)로 흉내'],
    cost: 'medium',
    costNote: '장면을 한 번 텍스처로 그리고 화면 전체 판을 한 번 더 그린다(텍스처 읽기 3번). 장면 비용은 같고 화면 크기만큼 더해진다.',
    level: 2,
    must: [
      '터진 곳의 3D 위치를 화면 좌표(0~1)로 바꿔 uniform 으로 (y 는 위아래 뒤집기)',
      '거리 계산에 화면 비율을 곱해 고리가 원으로 보이게',
      '고리 나이에 따라 반지름은 커지고 세기는 줄어 1.3초 안에 사라지게',
      '세기 슬라이더(0~3)와 「한 번씩 끄고 비교」',
      '렌더 타깃은 화면 크기가 바뀌면 다시 만든다',
    ],
    done: [
      '별이 터질 때 고리가 퍼지며 고리 위 장난감 · 바닥 무늬가 바깥으로 휘어 보인다',
      '고리 가장자리에 빨강 · 파랑 색 갈라짐이 살짝 보인다',
      '「한 번씩 끄고 비교」로 켬/끔이 번갈아 나와 차이가 분명하다',
      '창 크기를 바꿔도 고리가 원 모양 그대로',
    ],
    code: {
      lang: 'glsl',
      title: '충격파 후처리 (화면 판의 조각 셰이더)',
      from: 'demos/demosShader.ts shockDemo() 의 후처리 셰이더를 정리',
      body: `// TS 쪽: renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
//        uC = 터진 곳 화면 좌표(y 뒤집기), uAge = 터진 뒤 초, 그다음 화면 판을 그린다
uniform sampler2D tScene; uniform vec2 uRes; uniform float uAge; uniform vec2 uC; uniform float uAmt;
varying vec2 vUv;
void main(){
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 d = (vUv - uC) * asp; float r = length(d);           // 비율을 곱해야 고리가 원
  float R = uAge * 1.15; float th = 0.13;                     // 고리 반지름 · 두께
  float x = (r - R) / th;
  float band = abs(x) < 1.0 ? 1.0 - x * x : 0.0;              // 띠 안에서만 세기
  float prof = abs(x) < 1.0 ? (1.0 - x * x) * sign(-x + 0.0001) * -1.0 : 0.0;
  float fade = clamp(1.0 - uAge / 1.3, 0.0, 1.0);
  vec2 dir = normalize(d + 1e-5) / asp;
  vec2 off = dir * band * fade * 0.06 * uAmt * (0.6 + 0.4 * prof);
  vec3 col;
  col.r = texture2D(tScene, vUv - off * 1.25).r;              // 색마다 조금씩 다르게 → 갈라짐
  col.g = texture2D(tScene, vUv - off).g;
  col.b = texture2D(tScene, vUv - off * 0.75).b;
  col += vec3(1.0, 0.95, 0.8) * band * fade * 0.18;           // 고리 위 옅은 빛
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '화면 비율을 안 곱하면 고리가 옆으로 늘어난 타원이 된다', fix: 'UV 차이에 (가로/세로, 1) 을 곱해 거리를 재고, 미는 방향은 다시 나눈다.' },
      { title: '3D 위치를 화면 좌표로 바꿀 때 y 가 뒤집힌다', fix: 'project() 결과를 0~1 로 바꾼 뒤 1 − y. 견본은 toScreen 결과로 uC.set(x, 1 − y).' },
      { title: '렌더 타깃을 한 번만 만들면 창을 키울 때 흐려진다', fix: '그릴 때마다 (w, h) 가 바뀌었는지 보고 setSize. 픽셀 비율도 곱한다.' },
      { title: '후처리 패스에서 톤 매핑 · 색 공간을 빠뜨리면 색이 달라진다', fix: '직접 짠 화면 판 셰이더 끝에 tonemapping · colorspace 처리를 넣거나, 장면 쪽과 같은 설정을 쓴다.' },
    ],
    prev: ['u21'],
    next: ['i61', 'i178'],
    refs: [{ name: 'three.js 문서 — WebGLRenderTarget', url: 'https://threejs.org/docs/#api/en/renderers/WebGLRenderTarget' }],
    source: [{ file: 'demosShader.ts', symbol: 'shockDemo' }],
  },

  i61: {
    id: 'i61',
    summary: '장면을 텍스처로 그린 뒤 불 위 기둥 · 지평선 띠 안에서만 잡음만큼 읽는 자리를 흔들어, 뜨거운 공기가 일렁이게 한다.',
    terms: [
      { en: 'Heat haze (heat distortion)', ko: '뜨거운 공기 때문에 뒤가 일렁여 보임' },
      { en: 'Screen-space UV distortion', ko: '화면 텍스처를 읽는 좌표를 조금씩 흔들기' },
      { en: 'Mirage band', ko: '먼 땅 위 지평선 띠의 신기루' },
    ],
    goal: '{target} 위로 뜨거운 공기가 일렁이는 아지랑이 후처리를 넣어 줘. 분위기는 {style}.',
    targets: ['모닥불 위 공기', '사막 지평선 신기루', '로켓 · 엔진 배기'],
    styles: ['한낮의 뜨거운 사막', '따뜻한 캠핑 밤', '공장 · 용광로'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 는 Opaque Texture 를 켜고 투명 재질 Shader Graph 에서 Scene Color 노드의 UV 를 잡음만큼 민다.',
      godot: 'Godot 4 는 불 위에 놓은 판 셰이더에서 hint_screen_texture 를 잡음 UV 로 읽는다.',
    },
    principle: [
      '장면을 텍스처에 그린 뒤, 화면 판이 그 텍스처를 읽는 UV 를 잡음 두 겹(가로 · 세로 따로)만큼 흔든다.',
      '흔드는 곳은 마스크로 정한다: 불 위로 올라가는 가우스 기둥 exp(−(Δx/0.11)²) + 지평선 띠 exp(−(Δy/0.07)²) × 0.55.',
      '잡음은 y 에서 시간 × 3 을 빼 위로 흘러가게 — 열기가 올라가는 느낌.',
      '흔드는 양은 0.028 × 마스크 × 세기, 일렁이는 곳은 살짝 따뜻한 색(빨강 1.06 · 파랑 0.94)을 섞는다.',
    ],
    when: ['불 · 엔진 · 사막처럼 「뜨겁다」를 그림만으로 보여 줄 때', '굴절 · 신기루 같은 빛의 원리 설명'],
    avoid: ['화면 전체를 계속 흔들기 — 어지럽다. 마스크로 좁은 곳만', '후처리 없는 가벼운 장면 — 불 위에 화면 텍스처를 읽는 작은 판 하나로'],
    cost: 'medium',
    costNote: '장면을 텍스처로 한 번 더 그리고, 화면 판에서 잡음 2번 + 텍스처 1번. 화면 크기에 비례.',
    level: 2,
    must: [
      '흔드는 곳은 마스크(불 위 기둥 · 지평선 띠)로 제한 — 나머지 화면은 그대로',
      '불 · 지평선의 3D 위치를 매 장면 화면 좌표로 바꿔 uniform 으로',
      '잡음은 위로 흐르게, 흔드는 양은 화면의 3% 이하',
      '「반씩 비교」(왼쪽 끔 · 오른쪽 켬)와 세기 슬라이더',
    ],
    done: [
      '모닥불 위 공기만 위로 흐르며 일렁이고, 바닥 · 하늘의 먼 곳은 흔들리지 않는다',
      '먼 지평선 띠의 선인장 · 바위가 신기루처럼 물결친다',
      '반씩 비교에서 왼쪽은 또렷하고 오른쪽만 일렁인다',
    ],
    code: {
      lang: 'glsl',
      title: '마스크 안에서만 UV 흔들기 (화면 판 조각 셰이더)',
      from: 'demos/demosShader.ts hazeDemo() 의 후처리 셰이더를 정리',
      body: `// uF = 불 화면 좌표, uHor = 지평선 화면 높이 (매 장면 3D 위치를 화면 좌표로 바꿔 넣는다)
uniform sampler2D tScene; uniform vec2 uRes; uniform float uTime;
uniform vec2 uF; uniform float uHor; uniform float uAmt;
varying vec2 vUv;
void main(){
  float asp = uRes.x / uRes.y;
  // 불 위로 올라가는 기둥 + 땅 위 신기루 띠
  float colm = exp(-pow((vUv.x - uF.x) * asp / 0.11, 2.0))
             * smoothstep(uF.y - 0.04, uF.y + 0.04, vUv.y) * smoothstep(1.0, uF.y, vUv.y);
  float band = exp(-pow((vUv.y - uHor) / 0.07, 2.0)) * 0.55;
  float m = clamp(colm + band, 0.0, 1.0);
  // 위로 흐르는 잡음 두 겹 (가로 · 세로 흔들기)
  vec2 n = vec2(noise(vec2(vUv.x * 14.0 * asp, vUv.y * 20.0 - uTime * 3.0)),
                noise(vec2(vUv.x * 28.0 * asp + 3.0, vUv.y * 34.0 - uTime * 4.5))) - 0.5;
  vec2 uv = vUv + n * 0.028 * m * uAmt;
  vec3 col = texture2D(tScene, uv).rgb;
  col = mix(col, col * vec3(1.06, 1.0, 0.94), m * 0.4);       // 뜨거운 곳은 살짝 따뜻하게
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '마스크 없이 화면 전체를 흔들면 물속처럼 보인다', fix: '열이 나는 곳 위쪽 기둥과 먼 지평선 띠만 흔든다.' },
      { title: '흔드는 양이 크면 물체가 찢어져 보인다', fix: '화면의 2~3% 이내(견본 0.028). 세기는 슬라이더로 0~3 배.' },
      { title: '잡음이 제자리에서 떨리면 아지랑이가 아니라 화면 고장처럼 보인다', fix: '잡음 y 에서 시간을 빼 위로 흘러가게 한다.' },
    ],
    prev: ['i60'],
    next: ['u07', 'i473'],
    source: [{ file: 'demosShader.ts', symbol: 'hazeDemo' }],
  },

  i64: {
    id: 'i64',
    summary: '다른 세상을 같은 카메라로 텍스처에 그린 뒤 문 모양 판에 화면 좌표로 붙이고, 가장자리를 소용돌이치게 해 진짜 다른 곳이 보이는 문을 만든다.',
    terms: [
      { en: 'Portal (render-to-texture, screen-space UV)', ko: '다른 장면을 텍스처로 그려 화면 좌표로 붙이기' },
      { en: 'WebGLRenderTarget', ko: 'three.js 에서 화면 대신 텍스처에 그리기' },
      { en: 'Swirl edge distortion', ko: '문 가장자리를 각도 방향으로 비틀어 소용돌이' },
    ],
    goal: '{target}에 다른 세상이 보이는 포털 문을 만들어 줘 — 가장자리는 소용돌이. 분위기는 {style}.',
    targets: ['다음 단계로 가는 문', '장면 전환 문', '마법 거울'],
    styles: ['낮 풀밭 → 보랏빛 밤하늘', '귀엽고 신비로운', '어둡고 무서운 차원문'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 두 번째 Camera 의 Target Texture(RenderTexture)를 문 재질에 넣고, Shader Graph 에서 Screen Position 으로 읽는다.',
      godot: 'Godot 은 SubViewport + 카메라로 다른 장면을 그려 ViewportTexture 를 문 재질에, SCREEN_UV 로 읽는다.',
    },
    principle: [
      '다른 세상은 따로 만든 장면(other)이다. 매 장면 같은 카메라로 other 를 렌더 타깃에 먼저 그린다.',
      '문(원판)의 조각 셰이더는 자기 UV 가 아니라 화면 좌표(gl_FragCoord / 화면 크기)로 그 텍스처를 읽는다 — 그래서 카메라가 돌면 문 안 풍경도 시점이 맞게 바뀐다.',
      '문 반지름 0.45 바깥부터 각도 방향(a + 90°)으로 읽는 자리를 밀면 가장자리가 소용돌이친다.',
      '나선 무늬 sin(a × 5 + r × 12 − 시간 × 4) 로 보라 · 하늘색 빛을 섞고, 맨 가장자리는 밝은 테두리.',
    ],
    when: ['다음 단계 · 다른 방으로 넘어가는 문', '「저 너머가 보인다」가 연출의 핵심일 때'],
    avoid: ['문으로 걸어 들어가 시점까지 이어져야 할 때 — 문 위치 기준 가상 카메라(경사 투영)가 필요하다', '폰에서 문이 여러 개 — 장면을 문 수만큼 더 그린다. 정지 그림 텍스처로'],
    cost: 'medium',
    costNote: '다른 세상을 한 번 더 그린다 (그 장면 물체 수만큼 비용). 문이 하나면 대체로 OK, 둘 이상이면 무겁다.',
    level: 2,
    must: [
      '문 셰이더는 화면 좌표로 텍스처를 읽는다 (자기 UV 로 읽으면 그림이 붙은 판처럼 보인다)',
      '다른 세상은 같은 카메라로, 문보다 먼저 렌더 타깃에 그린다',
      '렌더 타깃 크기 = 화면 크기, 창이 바뀌면 다시',
      '소용돌이 세기 슬라이더(0~2)',
      '문 둘레 빛 알갱이는 가산 섞기 · depthWrite 끔',
    ],
    done: [
      '카메라가 좌우로 돌면 문 안 행성 · 수정의 보이는 각도도 함께 바뀐다 (그림 판이 아니다)',
      '문 가장자리가 돌아가는 소용돌이 빛으로 일렁이고, 가운데는 또렷하다',
      '소용돌이 0 이면 깨끗한 둥근 창, 2 면 크게 비틀린다',
    ],
    code: {
      lang: 'ts',
      title: '다른 세상을 텍스처로 → 문은 화면 좌표로 읽기',
      from: 'demos/demosShader.ts portalDemo() 를 정리',
      body: `const rt = new THREE.WebGLRenderTarget(1, 1);
const pu = { tWorld: { value: rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uSwirl: { value: 1 } };
const door = new THREE.Mesh(new THREE.CircleGeometry(1.08, 64), new THREE.ShaderMaterial({
  uniforms: pu,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tWorld; uniform vec2 uRes; uniform float uTime; uniform float uSwirl; varying vec2 vUv;',
    'void main(){',
    '  vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);',
    '  vec2 suv = gl_FragCoord.xy / uRes;                     // 자기 UV 가 아니라 화면 좌표',
    '  float sw = smoothstep(0.45, 1.0, r) * uSwirl;',
    '  suv += vec2(cos(a + 1.57), sin(a + 1.57)) * sw * 0.035 * (0.6 + 0.4 * sin(r * 18.0 - uTime * 5.0));',
    '  vec3 col = texture2D(tWorld, suv).rgb;',
    '  float spiral = 0.5 + 0.5 * sin(a * 5.0 + r * 12.0 - uTime * 4.0);',
    '  col = mix(col, mix(vec3(0.6, 0.2, 1.0), vec3(0.2, 0.9, 1.0), spiral) * 2.0, sw * sw * (0.35 + 0.65 * spiral));',
    '  col += vec3(0.9, 0.7, 1.0) * smoothstep(0.85, 1.0, r) * 1.5;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}',
  ].join('\\n'),
}));
scene.add(door);

function render(renderer: THREE.WebGLRenderer, w: number, h: number): void {
  if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
  renderer.setRenderTarget(rt);
  renderer.render(otherScene, camera);   // 같은 카메라로 저쪽 세상 먼저
  renderer.setRenderTarget(null);
  pu.uRes.value.set(w, h);
  renderer.render(scene, camera);        // 이쪽 세상 (문이 그 텍스처를 읽는다)
}`,
    },
    pitfalls: [
      { title: '문 UV 로 텍스처를 읽으면 그림 붙인 판처럼 납작하다', fix: '화면 좌표(gl_FragCoord / 화면 크기)로 읽어야 카메라가 돌 때 저쪽 풍경 시점이 맞는다.' },
      { title: 'uRes 를 CSS 크기로 넣으면 문 안 그림이 어긋난다', fix: 'gl_FragCoord 는 실제 픽셀이다 — 그리기 버퍼 크기(픽셀 비율 곱한 값)를 넣는다.' },
      { title: '문 둘레 알갱이가 문 그림을 가린다', fix: '가산 섞기 + depthWrite: false 로 빛만 더한다.' },
    ],
    prev: ['u21'],
    next: ['i530'],
    refs: [{ name: 'three.js 문서 — WebGLRenderTarget', url: 'https://threejs.org/docs/#api/en/renderers/WebGLRenderTarget' }],
    source: [{ file: 'demosShader.ts', symbol: 'portalDemo' }],
  },

  i65: {
    id: 'i65',
    summary: '움직이는 점의 지난 위치를 시간과 함께 모아 카메라를 보는 띠로 이어, 꼬리가 점점 가늘고 옅어지며 사라지게 한다.',
    terms: [
      { en: 'Trail ribbon (motion trail)', ko: '지난 위치를 이은 띠' },
      { en: 'Camera-facing strip', ko: '진행 방향 × 시선 방향으로 띠 옆을 정해 늘 카메라를 보게' },
      { en: 'Age-based fade', ko: '나이(지금 − 찍은 시각) / 수명 으로 폭 · 투명도 줄이기' },
    ],
    goal: '{target}의 지나간 길을 시간 따라 사라지는 빛 리본으로 그려 줘. 분위기는 {style}.',
    targets: ['굴러가는 바퀴 위 한 점 (사이클로이드)', '튀는 공 (포물선)', '도는 혜성 (타원 궤도)'],
    styles: ['밤하늘에 빛나는 선', '만화처럼 굵고 또렷한', '부드러운 파스텔'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Trail Renderer 컴포넌트(Time · Width 곡선 · Color 그러데이션), 입자는 Particle System 의 Trails 모듈.',
      godot: 'Godot 4 는 GPUParticles3D 의 Trails, 직접 만들 땐 ImmediateMesh 나 ArrayMesh 로 같은 띠를.',
    },
    principle: [
      '매 장면 지금 위치와 시각을 목록 맨 앞에 넣는다 (직전 점과 0.02 보다 가까우면 건너뛴다).',
      '수명(견본 2.2초)보다 오래된 점과 최대 개수(220)를 넘는 점은 뒤에서 버린다.',
      '점마다 진행 방향(앞뒤 점 차이)과 카메라 쪽 방향을 외적해 「옆」을 구하고, 위치 ± 옆 × 폭 으로 두 꼭짓점을 만든다.',
      '폭은 나이에 따라 1 → 0.15 배로, 밝기는 (1 − 나이)^1.4 로 줄어든다. 가운데는 밝고 가장자리는 어둡게(1 − s²).',
    ],
    when: ['포물선 · 사이클로이드 같은 「자취」를 보여 주는 수학 설명', '빠르게 움직이는 공 · 칼끝 · 미사일의 손맛'],
    avoid: ['아주 많은 물체에 각각 — 띠마다 정점 갱신이 CPU 비용. 입자 늘이기(i173)로', '정지된 곡선 — 굵은 선(Line2) 하나면 된다'],
    cost: 'light',
    costNote: '띠 하나 = 정점 440개를 매 장면 다시 씀. 띠 몇 개는 아무 부담 없음, 수백 개면 CPU 가 바빠진다.',
    level: 1,
    must: [
      '정점 버퍼는 최대 개수로 한 번 만들고 값만 바꾼다 (매 장면 새로 만들지 않기)',
      '띠 옆 방향 = 진행 방향 × (카메라 − 점) — 어느 각도에서 봐도 띠가 납작하게 사라지지 않게',
      '수명(초)을 조절 가능하게 (견본 0.3~5)',
      '가산 섞기 · depthWrite 끔 · 양면 · frustumCulled = false',
      '한 바퀴 돌아 처음 자리로 순간 이동하면 꼬리를 지운다 (화면을 가로지르는 선 방지)',
    ],
    done: [
      '바퀴 위 점이 사이클로이드, 튀는 공이 포물선, 혜성이 타원을 그리며 꼬리가 끝으로 갈수록 가늘고 옅어진다',
      '「꼬리 길이」를 늘리면 자취가 더 길게 남는다',
      '카메라를 옆으로 돌려도 띠가 선처럼 얇아지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '점 모으기 + 카메라를 보는 띠로 펴기',
      from: 'demos/demosShader.ts Ribbon 클래스의 push · build 를 정리',
      body: `const MAX = 220;
const pts: { p: THREE.Vector3; t: number }[] = [];
const pos = new Float32Array(MAX * 2 * 3);   // 점 하나 = 띠 양쪽 두 꼭짓점
const al = new Float32Array(MAX * 2);        // 밝기 (셰이더 aA)

function push(p: THREE.Vector3, t: number, life: number): void {
  const last = pts[0];
  if (!last || last.p.distanceToSquared(p) > 0.0004) pts.unshift({ p: p.clone(), t });
  while (pts.length > MAX || (pts.length > 1 && t - pts[pts.length - 1]!.t > life)) pts.pop();
}

const tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();
function build(cam: THREE.Camera, t: number, life: number, width: number): void {
  const n = pts.length;
  for (let i = 0; i < MAX; i++) {
    const k = Math.min(i, Math.max(0, n - 1));
    const q = pts[k];
    if (!q) { pos.fill(0, i * 6, i * 6 + 6); al[i * 2] = al[i * 2 + 1] = 0; continue; }
    tan.subVectors(pts[Math.max(0, k - 1)]!.p, pts[Math.min(n - 1, k + 1)]!.p);
    if (tan.lengthSq() < 1e-8) tan.set(1, 0, 0);
    view.subVectors(cam.position, q.p);
    side.crossVectors(tan, view).normalize();          // 늘 카메라를 보는 옆 방향
    const age = Math.min(1, Math.max(0, (t - q.t) / life));
    const w = width * (1 - age * 0.85);                 // 끝으로 갈수록 가늘게
    pos.set([q.p.x + side.x * w, q.p.y + side.y * w, q.p.z + side.z * w,
             q.p.x - side.x * w, q.p.y - side.y * w, q.p.z - side.z * w], i * 6);
    al[i * 2] = al[i * 2 + 1] = i < n ? Math.pow(1 - age, 1.4) : 0;
  }
  geo.attributes.position!.needsUpdate = true;
  geo.attributes.aA!.needsUpdate = true;
}`,
    },
    pitfalls: [
      { title: '띠를 늘 같은 방향(위쪽)으로 펴면 옆에서 볼 때 사라진다', fix: '진행 방향과 「점 → 카메라」를 외적해 옆을 구한다.' },
      { title: '처음 자리로 순간 이동할 때 화면을 가로지르는 긴 선이 생긴다', fix: '한 바퀴가 끝나는 순간 점 목록을 비운다 (견본 clear()).' },
      { title: '매 장면 BufferGeometry 를 새로 만들면 메모리가 샌다', fix: '최대 개수로 한 번 만들고 값만 바꿔 needsUpdate.' },
      { title: '띠가 화면 밖으로 나가면 통째로 안 그려진다', fix: '경계 구가 갱신되지 않으니 frustumCulled = false.' },
    ],
    prev: ['u37'],
    next: ['i173', 'i170'],
    source: [{ file: 'demosShader.ts', symbol: 'Ribbon' }],
  },

  i516: {
    id: 'i516',
    summary: '몸을 뺀 배경을 먼저 텍스처로 그리고 몸 표면 방향만큼 밀어 읽어 일렁이는 투명 몸을 만들고, 발끝부터 올라가는 전기 경계로 은신을 켜고 끈다.',
    terms: [
      { en: 'Refraction cloak (screen-space refraction)', ko: '뒤 배경을 법선만큼 밀어 읽는 투명 몸' },
      { en: 'Dissolve edge (height threshold + noise)', ko: '높이 기준선 + 잡음으로 경계를 정해 바꾸기' },
      { en: 'Chromatic dispersion', ko: '빨강 · 파랑을 다르게 밀어 색 갈라짐' },
      { en: 'Fresnel rim', ko: '비스듬한 가장자리일수록 밝은 테두리' },
    ],
    goal: '{target}에 뒤 배경이 일렁이며 비치는 투명 은신을 넣어 줘 — 발끝부터 전기 경계가 올라가며 켜지고 꺼지게. 분위기는 {style}.',
    targets: ['갑옷 입은 숨은 적', '투명 망토를 쓴 주인공', '은신 기술을 쓰는 로봇'],
    styles: ['차가운 하늘빛 전기', '어두운 던전의 침입자', '만화 같은 반짝임'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 는 Opaque Texture 를 켜고 Shader Graph 에서 Scene Color 노드 UV 에 View Space Normal 을 더한다. 경계는 Position(Object) y 와 Step.',
      godot: 'Godot 4 는 spatial 셰이더에서 hint_screen_texture 를 SCREEN_UV + NORMAL.xy × 세기 로 읽는다.',
    },
    principle: [
      '1) 몸을 숨기고(visible = false) 장면을 렌더 타깃에 그린다. 2) 몸을 보이게 하고 화면에 다시 그린다.',
      '몸 셰이더는 그 텍스처를 화면 좌표 + 시점 공간 법선.xy × 0.055 만큼 밀어 읽는다 — 몸 모양대로 뒤가 휘어 보인다. 잡음 0.012 를 더해 일렁임.',
      '빨강은 1.3배 · 파랑은 0.7배 밀어 색이 갈라지고, 프레넬(1 − N·V)³ 로 가장자리에 옅은 빛.',
      '경계: 높이 y − (기준선 + 잡음) 이 0 보다 크면 갑옷, 작으면 투명. 기준선을 −0.3 → 2.0 으로 1.1초에 올리면 발끝부터 사라진다.',
      '경계선 자리 exp(−(d × 28)²) 에 육각 무늬 전기빛 · 불티를 내고, 은신 중엔 발걸음마다 먼지만 남긴다.',
    ],
    when: ['숨은 적 · 투명 망토처럼 「보일 듯 말 듯」이 놀이의 핵심일 때', '굴절 원리를 장면으로 보여 줄 때'],
    avoid: ['투명한 것이 여러 겹 겹치는 장면 — 한 번 그린 배경만 읽으니 뒤 투명체는 안 비친다', '폰에서 큰 몸 여러 개 — 장면을 한 번 더 그리는 비용. 실루엣 반투명으로'],
    cost: 'medium',
    costNote: '장면을 한 번 더 그린다(HalfFloat 렌더 타깃, 화면 크기). 몸 셰이더는 텍스처 3번 + 잡음 텍스처 2번이라 가볍다.',
    level: 3,
    must: [
      '배경을 그릴 때는 몸을 숨기고 그린다 (자기 자신을 읽으면 검은 얼룩)',
      '미는 방향은 시점 공간 법선(normalMatrix × normal) — 세계 법선이 아니라',
      '경계 잡음은 몸의 로컬 좌표로 읽어 걸어도 무늬가 몸에 붙어 있게',
      '굴절 세기(0~2.5) · 색 갈라짐 · 발밑 먼지 켜고 끄기',
      '잡음은 미리 구운 잡음 텍스처를 읽는다 (반복문 잡음 금지)',
    ],
    done: [
      '은신 중 몸 뒤 벽화 · 바닥 바둑무늬가 몸 모양대로 휘어 일렁이며 비친다',
      '켤 때 발끝에서 머리로, 끌 때 머리에서 발끝으로 전기 경계가 지나가며 불티가 튄다',
      '굴절 세기 0 이면 거의 안 보이는 유리, 2.5 면 크게 휜다',
      '은신 중에도 걸음마다 발밑 먼지가 일어 위치를 짐작할 수 있다',
    ],
    code: {
      lang: 'glsl',
      title: '굴절 투명 몸 + 높이 경계 (몸 재질의 조각 셰이더)',
      from: 'demos/demosVfx3.ts i516 의 cloakMat 셰이더 · render() 를 정리',
      body: `// TS 쪽: fig.visible = false; renderer.setRenderTarget(rt); renderer.render(scene, cam);
//        renderer.setRenderTarget(null); fig.visible = true; renderer.render(scene, cam);
uniform sampler2D uRT, uNoise; uniform vec2 uRes; uniform float uCut, uStr, uChroma, uTime, uY0; uniform vec3 uCol;
varying vec3 vW; varying vec3 vN; varying vec3 vVN; varying vec3 vL; // 세계 · 세계 법선 · 시점 법선 · 로컬
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); float ndv = max(dot(N, V), 0.0);
  vec3 sh = armorColor(N, V);                                     // 보일 때 갑옷 색 (빛 계산)
  // 굴절: 몸을 뺀 배경을 시점 법선만큼 밀어 읽기
  vec2 suv = gl_FragCoord.xy / uRes;
  float wob = texture2D(uNoise, vW.xy * 1.3 + vec2(uTime * 0.12, -uTime * 0.2)).r - 0.5;
  vec2 off = normalize(vVN).xy * 0.055 * uStr + vec2(wob) * 0.012 * uStr;
  float ch = 0.3 * uChroma;
  vec3 refr = vec3(texture2D(uRT, suv + off * (1.0 + ch)).r, texture2D(uRT, suv + off).g, texture2D(uRT, suv + off * (1.0 - ch)).b);
  vec3 cloak = refr * 0.94 + vec3(0.7, 0.9, 1.0) * pow(1.0 - ndv, 3.0) * 0.25;
  // 경계: 높이 − (기준선 + 잡음). 기준선 uCut 을 -0.3 → 2.0 으로 올리면 발끝부터 사라진다
  float n = texture2D(uNoise, vec2(vL.x * 2.0 + vL.z * 1.3, vL.y * 0.4)).r * 0.14 - 0.07;
  float d = (vW.y - uY0) - (uCut + n);
  float k = smoothstep(-0.015, 0.015, d);
  vec3 col = mix(cloak, sh, k);
  float hex = step(0.5, fract((vL.y + vL.x) * 22.0)) * step(0.5, fract((vL.y - vL.x) * 22.0));
  col += uCol * exp(-pow(d * 28.0, 2.0)) * (3.0 + 2.0 * hex) * (0.7 + 0.3 * sin(uTime * 40.0 + vW.x * 30.0));
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '배경을 그릴 때 몸을 숨기지 않으면 몸이 자기 자신을 읽어 검게 얼룩진다', fix: '렌더 타깃에 그릴 땐 visible = false, 화면에 그릴 땐 true.' },
      { title: '세계 법선으로 밀면 몸이 돌 때 굴절 방향이 엉뚱하다', fix: '화면에서 미는 것이니 시점 공간 법선(normalMatrix × normal)의 xy 를 쓴다.' },
      { title: '경계 잡음을 세계 좌표로 읽으면 걸을 때 무늬가 몸 위를 미끄러진다', fix: '로컬 좌표(position)로 읽는다. 걷기 출렁임(uY0)도 빼 준다.' },
      { title: '렌더 타깃을 8비트로 하면 밝은 횃불 빛이 잘린다', fix: '견본은 HalfFloatType — 밝은 빛 그대로 비친다.' },
    ],
    prev: ['i12', 'u07'],
    next: ['i10'],
    source: [{ file: 'demosVfx3.ts', symbol: 'i516' }],
  },

  i536: {
    id: 'i536',
    summary: '발밑을 늘 행성 중심 쪽으로 두고 한 걸음마다 접평면으로 옮긴 뒤 구 위로 되돌려, 작은 행성을 어디서나 똑바로 서서 걷게 한다.',
    terms: [
      { en: 'Spherical gravity (planet walking)', ko: '아래 = 행성 중심 쪽 — 어디서나 서 있기' },
      { en: 'Tangent-plane step + reprojection', ko: '접평면으로 한 걸음 → 길이를 맞춰 구 위로 되돌리기' },
      { en: 'Parallel transport of forward', ko: '앞 방향을 새 위쪽의 접평면으로 실어 나르기 (setFromUnitVectors)' },
      { en: 'Camera up follows player', ko: '카메라 위쪽(camera.up)도 캐릭터의 위쪽으로 부드럽게' },
    ],
    goal: '{target}에서 캐릭터가 어디서나 발밑을 행성 중심으로 두고 걷는 구면 중력 산책을 만들어 줘. 분위기는 {style}.',
    targets: ['작은 풀밭 행성', '지구본 위 여행', '구 위 좌표 놀이'],
    styles: ['파스텔 동화 행성', '귀엽고 아기자기', '밤하늘 우주 탐험'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Rigidbody 중력을 끄고 (중심 − 위치) 방향으로 AddForce, 자세는 Quaternion.FromToRotation(transform.up, 새 위쪽) × rotation.',
      godot: 'Godot 은 CharacterBody3D 의 up_direction 을 매 장면 (위치 − 중심).normalized() 로 바꾸고 velocity 에 중심 쪽 중력을 더한다.',
    },
    principle: [
      '캐릭터 상태는 「위쪽 up(단위 벡터) · 앞쪽 fwd · 땅에서 뜬 높이 hOff」 셋뿐 — 위치는 up × 땅 높이(up) 로 만든다.',
      '한 걸음: 지금 위치 + fwd × 속도 × dt 를 다시 정규화하면 새 up 이다 (접평면으로 갔다가 구 위로 되돌림).',
      '앞 방향은 「옛 up → 새 up」 회전(setFromUnitVectors)을 똑같이 돌리고 새 up 성분을 빼서 접평면에 다시 눕힌다 — 이렇게 해야 돌지 않았는데 방향이 틀어지지 않는다.',
      '점프는 hOff 만 바꾼다: 속도 3.6 으로 올라 중력 9.5 로 떨어짐 — 「아래」는 늘 행성 중심.',
      '카메라는 캐릭터 위 2.3 · 뒤 4.2 에서 따라가고, camera.up 을 캐릭터 up 쪽으로 천천히 돌려 행성 밑에서도 화면이 뒤집히지 않는다.',
    ],
    when: ['작은 행성 · 지구본 위를 걸어 다니는 탐험', '구면 좌표 · 위도 경도를 몸으로 느끼는 수학 체험'],
    avoid: ['넓고 평평한 땅 — 보통 캐릭터 조작기(i480)', '물리 엔진 강체와 부딪힘이 많을 때 — 엔진의 사용자 중력(Unity AddForce · Godot up_direction)으로'],
    cost: 'light',
    costNote: '걸음 계산은 벡터 몇 개. 견본의 무거운 부분은 행성 정점(구 6번 쪼갬)과 나무 · 바위 · 꽃 흩뿌리기 5200 후보 — 인스턴싱 4묶음으로 그린다.',
    level: 2,
    must: [
      '위치는 up · fwd · hOff 로만 정하고 매 걸음 정규화한다 (수치 오차로 행성에서 떠오르지 않게)',
      '앞 방향은 위쪽이 바뀐 만큼 같이 돌리고 접평면으로 다시 눕힌다',
      '카메라 위쪽을 캐릭터 위쪽으로 부드럽게 맞추는 켬/끔 (끄면 세상 위쪽 고정 → 행성 아래에서 화면이 뒤집힘을 비교)',
      '카메라가 언덕 속으로 들어가지 않게 카메라 아래 땅보다 0.7 위로',
      '바다로는 못 들어가게 다음 칸 높이를 먼저 보고 막히면 돌아서기',
    ],
    done: [
      '행성 반대편까지 걸어가도 캐릭터가 늘 똑바로 서 있고 화면도 뒤집히지 않는다',
      '「카메라 위쪽 맞추기」를 끄면 행성 아래쪽에서 화면이 뒤집혀 차이가 분명하다',
      '스페이스로 점프하면 어디서든 행성 중심 쪽으로 떨어진다',
      '땅을 누르면 그곳으로 걸어간다',
    ],
    code: {
      lang: 'ts',
      title: '구 위 한 걸음 — 접평면 이동 · 구 위로 되돌림 · 앞 방향 실어 나르기',
      from: 'demos/demosPlanet.ts makeWalk() 의 step() 을 정리',
      body: `const up = spawn.clone();                               // 단위 벡터 = 발밑 반대쪽
const fwd = new THREE.Vector3(-up.z, 0, up.x).normalize();
let hOff = 0, vr = 0;
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function step(dt: number, turn: number, go: number, jump: boolean): void {
  if (turn) fwd.applyAxisAngle(up, turn * 2.6 * dt).normalize();
  if (go) {
    const next = tmp.copy(up).multiplyScalar(surface(up)).addScaledVector(fwd, go * 2.1 * dt).normalize();
    if (surface(next) - SEA > 0.1) {                    // 바다면 못 감
      const q = new THREE.Quaternion().setFromUnitVectors(up, next);
      up.copy(next);
      fwd.applyQuaternion(q);                           // 앞 방향도 같은 만큼 돌리고
      fwd.addScaledVector(up, -fwd.dot(up)).normalize(); // 새 접평면에 다시 눕힌다
    }
  }
  if (jump && hOff <= 0.0001) vr = 3.6;
  vr -= 9.5 * dt;                                       // 아래 = 늘 행성 중심 쪽
  hOff = Math.max(0, hOff + vr * dt);
  if (hOff === 0 && vr < 0) vr = 0;
  // 몸 놓기: 위치 = up × (땅 높이 + 뜬 높이), 자세 = (옆, 위, 앞) 기저
  body.position.copy(up).multiplyScalar(surface(up) + hOff - 0.02);
  const m = new THREE.Matrix4().makeBasis(tmp2.crossVectors(up, fwd).normalize(), up, fwd);
  body.quaternion.setFromRotationMatrix(m);
}

// 카메라: 위쪽을 캐릭터 위쪽으로 천천히 → 행성 밑에서도 화면이 안 뒤집힌다
camUp.lerp(up, 1 - Math.exp(-dt * 3)).normalize();
camera.up.copy(camUp);`,
    },
    pitfalls: [
      { title: '앞 방향을 그대로 두면 걸을수록 옆으로 틀어진다', fix: '위쪽이 바뀐 회전을 앞 방향에도 똑같이 적용하고 접평면 성분만 남긴다 (평행 이동).' },
      { title: 'camera.up 을 (0,1,0) 에 두면 행성 아래쪽에서 화면이 뒤집힌다', fix: '카메라 위쪽을 캐릭터 위쪽으로 lerp 한다. 견본에 켬/끔 비교가 있다.' },
      { title: '위치를 벡터 더하기로만 쌓으면 조금씩 행성에서 떠오른다', fix: '위치는 매번 up × 땅 높이 로 새로 만든다 — 오차가 쌓이지 않는다.' },
      { title: '흩뿌린 나무가 행성 위에서 비스듬히 선다', fix: 'setFromUnitVectors((0,1,0), 방향) 으로 법선에 세운 뒤 그 축으로만 무작위 회전.' },
    ],
    prev: ['i480'],
    next: ['i537', 'i539'],
    source: [{ file: 'demosPlanet.ts', symbol: 'makeWalk' }],
  },

  i480: {
    id: 'i480',
    summary: '캡슐을 바닥 · 벽 삼각형과 맞대어 겹친 만큼 밀어내고, 닿은 면 기울기로 바닥 · 가파른 경사 · 벽을 나눠 계단 오르기 · 땅 붙기 · 코요테 점프까지 처리한다.',
    terms: [
      { en: 'Kinematic character controller (capsule)', ko: '물리 강체 없이 직접 움직이고 밀어내는 캡슐' },
      { en: 'Depenetration by contact normal', ko: '캡슐 뼈대 선분 ↔ 삼각형 가장 가까운 점으로 겹친 깊이만큼 밀기' },
      { en: 'Slope limit · step offset · ground snap', ko: '오를 수 있는 경사 · 계단 높이 · 내리막 붙기' },
      { en: 'Coyote time · jump buffer', ko: '떨어진 직후에도 점프 · 땅 닿기 전에 누른 점프 기억' },
    ],
    goal: '{target}에 캡슐 캐릭터 조작기를 만들어 줘 — 경사 한계 · 계단 오르기 · 땅 붙기 · 벽 미끄러지기 · 코요테 점프 포함. 분위기는 {style}.',
    targets: ['쿼터뷰 던전의 기사', '3D 탐험 게임 주인공', '플랫폼 점프 게임'],
    styles: ['돌 던전 · 횃불', '밝은 장난감 세상', '설명용 (닿은 면 화살표 표시)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 CharacterController (slopeLimit · stepOffset · Move 의 isGrounded). 코요테 · 버퍼는 직접 타이머로.',
      godot: 'Godot 4 는 CharacterBody3D.move_and_slide() — floor_max_angle · floor_snap_length, 계단은 따로 시험 이동(test_move)으로.',
    },
    principle: [
      '고정 1/60초로 나눠 돈다: ① 입력 → 수평 속도(땅 가속 28, 공중 9) ② 점프 ③ 중력 18 ④ 위치 이동 ⑤ 밀어내기 ⑥ 계단 ⑦ 땅 붙기.',
      '밀어내기: 캡슐 뼈대 선분과 근처 삼각형의 가장 가까운 두 점 거리 d 가 반지름 R(0.32) 보다 작으면 겹친 깊이 R − d 만큼 그 방향(법선)으로 민다 — 최대 4번 되풀이.',
      '닿은 법선의 y 로 나눈다: y ≥ cos(경사 한계 45°) 면 바닥(위로만 밀기 · 착지), 0.08 보다 크면 가파른 경사(옆으로만 밀어 미끄러짐), −0.3 보다 크면 벽(벽 쪽 속도만 지우기 = 벽 따라 미끄러지기), 그 아래는 천장.',
      '계단: 바닥에 있는데 낮은 턱(0.3 이하)에 막히면 턱 높이만큼 올려 앞으로 옮겨 보고 겹치지 않으면 그 위로 올라선다.',
      '땅 붙기: 방금까지 땅이었는데 떠 있으면 아래로 광선을 쏴 계단 높이 + 0.12 안에 바닥이 있으면 붙인다. 점프는 버퍼 0.15초 · 코요테 0.12초 안이면 허락.',
    ],
    when: ['걸어 다니는 3D 게임의 주인공 (물리 엔진 강체보다 조작감이 정확함)', '경사 · 계단 · 점프가 섞인 지형'],
    avoid: ['밀리고 굴러야 하는 물체 — 물리 엔진 강체로', '격자 위를 한 칸씩 움직이는 퍼즐 — 칸 이동이면 충분'],
    cost: 'medium',
    costNote: '한 걸음마다 근처 삼각형만(격자 칸으로 걸러) 선분 ↔ 삼각형 검사 × 최대 4번. 삼각형 수천 개 던전도 1ms 안. 고정 1/60초라 느린 기기에선 한 장면에 몇 걸음 돈다(0.07초까지).',
    level: 3,
    must: [
      '고정 시간 걸음(1/60초)으로 돌리고 한 장면에 쌓이는 시간은 최대 0.07초로 자른다',
      '충돌 삼각형은 격자 칸에 미리 나눠 담고 캡슐 둘레 칸만 본다',
      '밀어내기는 한 번이 아니라 여러 번(최대 4) — 구석에서 두 벽에 동시에 닿을 때',
      '경사 한계 · 계단 높이 · 코요테 시간 · 점프 버퍼 4개를 슬라이더로',
      '설명 화면이면 닿은 면 법선을 화살표(바닥 초록 · 경사 주황 · 벽 하늘 · 천장 분홍)로',
    ],
    done: [
      '45° 보다 완만한 경사는 걸어 오르고, 가파른 경사에선 미끄러져 내려온다',
      '0.3 이하 계단은 점프 없이 올라서고, 내리막 · 계단 내려갈 때 붕 뜨지 않는다',
      '벽에 비스듬히 부딪히면 멈추지 않고 벽을 따라 미끄러진다',
      '모서리를 지나 0.12초 안에 누른 점프가 된다 (코요테)',
    ],
    code: {
      lang: 'ts',
      title: '밀어내기 — 닿은 면 기울기로 바닥 · 경사 · 벽 · 천장 나누기',
      from: 'demos/demosGame3dA.ts CtrlDemo.stepSim() 의 4) 밀어내기를 정리',
      body: `const cosMax = Math.cos((maxSlope * Math.PI) / 180);   // 경사 한계 45°
let ground = false;
for (let it = 0; it < 4; it++) {                         // 구석에선 여러 번
  setSegment(pos);                                       // 캡슐 뼈대 A(아래 구 중심) · B(위 구 중심)
  col.near(pos.x - R, pos.y - 0.05, pos.z - R, pos.x + R, pos.y + H, pos.z + R, near);
  let moved = false;
  for (const i of near) {
    setSegment(pos);
    const d2 = col.segTri(i, A, B, cs, ct);               // 선분 ↔ 삼각형 가장 가까운 두 점
    if (d2 >= R * R - 1e-6) continue;
    const d = Math.sqrt(d2);
    const nx = (cs[0] - ct[0]) / d, ny = (cs[1] - ct[1]) / d, nz = (cs[2] - ct[2]) / d;
    const depth = R - d;
    if (ny >= cosMax) {                                   // 바닥: 위로만 올리고 착지
      pos.y += depth / ny;
      if (vel.y < 0) vel.y = 0;
      ground = true;
    } else if (ny > 0.08) {                               // 가파른 경사: 옆으로만 밀어 미끄러짐
      const hl = Math.hypot(nx, nz) || 1;
      pos.x += (nx / hl) * depth * 1.02;
      pos.z += (nz / hl) * depth * 1.02;
      const vn = vel.x * (nx / hl) + vel.z * (nz / hl);
      if (vn < 0) { vel.x -= (nx / hl) * vn; vel.z -= (nz / hl) * vn; }
    } else {                                              // 벽 · 천장: 법선 쪽으로 밀고 그쪽 속도만 지움
      pos.x += nx * depth; pos.y += ny * depth; pos.z += nz * depth;
      if (ny > -0.3) { const vn = vel.x * nx + vel.z * nz; if (vn < 0) { vel.x -= nx * vn; vel.z -= nz * vn; } }
      else if (vel.y > 0) vel.y = 0;
    }
    moved = true;
  }
  if (!moved) break;
}
// 점프 허락: 버퍼(누른 뒤 0.15초) 안 + (땅이거나 떨어진 지 0.12초 안)
if (bufT > 0 && !jumped && (wasGrounded || sinceGround <= coyote)) { vel.y = 6.8; jumped = true; bufT = 0; }`,
    },
    pitfalls: [
      { title: '경사도 벽처럼 법선 방향으로 밀면 오르막에서 뒤로 밀려난다', fix: '바닥 판정(ny ≥ cos 한계)이면 위로만 depth / ny 만큼 올린다.' },
      { title: '가파른 경사를 바닥처럼 다루면 벽을 타고 오른다', fix: '한계를 넘는 면은 수평으로만 밀고 그쪽 속도를 지워 미끄러지게 한다.' },
      { title: '내리막 · 계단을 내려갈 때 매번 공중 판정이 나 점프가 막힌다', fix: '방금까지 땅이었으면 아래로 광선을 쏴 계단 높이 + 0.12 안의 바닥에 붙인다.' },
      { title: '장면 시간으로 바로 돌리면 느린 기기에서 벽을 뚫는다', fix: '1/60초 고정 걸음으로 나눠 여러 번 돌리고, 쌓이는 시간은 0.07초로 자른다.' },
    ],
    next: ['i481', 'i536', 'i484'],
    source: [{ file: 'demosGame3dA.ts', symbol: 'CtrlDemo' }],
  },

  i481: {
    id: 'i481',
    summary: '주인공에서 바라는 카메라 자리까지 작은 구를 쓸어 벽에 닿는 곳을 찾고, 그 앞까지 바로 당겼다가 벗어나면 천천히 되돌아가게 한다.',
    terms: [
      { en: 'Camera collision (sphere cast)', ko: '구를 쓸어 카메라가 벽 뒤로 가지 않게' },
      { en: 'Spring arm', ko: '주인공에 달린 늘어나고 줄어드는 카메라 팔' },
      { en: 'Asymmetric smoothing', ko: '당길 땐 빠르게(30) · 되돌릴 땐 천천히(2.2)' },
    ],
    goal: '{target}의 3인칭 카메라가 벽을 뚫지 않게 구 쓸기로 당겨 오고, 벗어나면 부드럽게 되돌아가게 해 줘. 분위기는 {style}.',
    targets: ['쿼터뷰 · 3인칭 던전', '좁은 미로 탐험', '방 안 캐릭터 따라가기'],
    styles: ['돌 던전 · 횃불', '밝은 장난감 방', '설명용 (켬 · 끔 나란히)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Physics.SphereCast(주인공 → 카메라), Cinemachine 을 쓰면 Collider 확장(3.x 는 Deoccluder).',
      godot: 'Godot 은 SpringArm3D (shape 에 SphereShape3D, spring_length) — 자식 카메라가 저절로 당겨진다.',
    },
    principle: [
      '카메라는 주인공 등 뒤를 늦게 따라간다: 바라는 자리 = 주인공 − 바라보는 방향 × 거리(4.6), 높이 2.45.',
      '주인공 가슴(1.35) → 바라는 자리를 22 조각으로 나눠 반지름 0.28 구가 벽과 겹치는지 차례로 본다.',
      '처음 겹친 조각 앞뒤를 이분 탐색 6번으로 좁혀 「막히기 직전 거리」를 얻는다.',
      '목표 거리 = max(0.55, 그 거리). 지금보다 짧아지면 빠르게(30), 길어지면 천천히(2.2) 따라간다 — 벽 뒤로는 절대 안 가고, 벗어날 땐 덜컥거리지 않는다.',
    ],
    when: ['벽 · 기둥이 많은 실내에서 3인칭으로 따라갈 때', '카메라를 플레이어가 돌릴 수 있을 때'],
    avoid: ['위에서 내려다보는 고정 쿼터뷰 — 카메라를 당기기보다 가리는 벽을 비우는 쪽(i488)이 자연스럽다', '벽이 거의 없는 바깥 들판 — 필요 없다'],
    cost: 'light',
    costNote: '한 장면에 구 겹침 검사 최대 22 + 6 번 (근처 삼각형만). 1ms 미만.',
    level: 2,
    must: [
      '광선 하나가 아니라 구(반지름 0.25~0.3)로 쓸기 — 광선은 모서리 틈으로 빠져 벽이 화면에 걸린다',
      '당길 때와 되돌릴 때 빠르기를 다르게 (당김은 즉시에 가깝게, 되돌림은 천천히)',
      '최소 거리(0.55)를 둬 주인공 몸 속으로 들어가지 않게',
      '켬/끔 나란히 비교 화면 + 카메라 거리 · 되돌아가는 빠르기 슬라이더',
    ],
    done: [
      '주인공이 벽 쪽으로 돌아서도 카메라가 벽 앞에 머물러 주인공이 늘 보인다 (끔 쪽은 벽 뒤로 가 가려진다)',
      '벽에서 벗어나면 카메라가 덜컥 튀지 않고 부드럽게 원래 거리로 돌아간다',
      '「되돌아가는 빠르기」를 바꾸면 돌아가는 빠르기만 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '구 쓸기 + 이분 탐색 + 당김 · 되돌림 빠르기 다르게',
      from: 'demos/demosGame3dA.ts CamDemo.sweep() · tick() 을 정리',
      body: `const damp = (a: number, b: number, k: number, dt: number): number => a + (b - a) * (1 - Math.exp(-k * dt));
const SR = 0.28;                          // 쓸어 보는 구 반지름

/** 주인공 → 바라는 카메라 자리를 구로 쓸어 처음 닿는 거리 */
function sweep(from: THREE.Vector3, to: THREE.Vector3): number {
  const len = from.distanceTo(to);
  const N = 22;
  let free = 0;
  for (let i = 1; i <= N; i++) {
    const k = i / N;
    if (col.sphereHit(lerp3(from, to, k), SR)) {
      let lo = free, hi = k;
      for (let j = 0; j < 6; j++) {        // 막힌 조각 앞뒤를 이분 탐색으로 좁힌다
        const m = (lo + hi) / 2;
        if (col.sphereHit(lerp3(from, to, m), SR)) hi = m; else lo = m;
      }
      return lo * len;
    }
    free = k;
  }
  return len;
}

// 매 장면
pivot.set(hero.x, 1.35, hero.z);
desired.set(hero.x - Math.sin(camYaw) * dist, 2.45, hero.z - Math.cos(camYaw) * dist);
const full = pivot.distanceTo(desired);
const tgt = Math.max(0.55, sweep(pivot, desired));
curD = tgt < curD ? damp(curD, tgt, 30, dt) : damp(curD, tgt, back, dt);   // 당김은 빠르게, 되돌림은 천천히(2.2)
curD = Math.min(curD, full);
camera.position.copy(pivot).lerp(desired, curD / full);`,
    },
    pitfalls: [
      { title: '광선 하나로만 검사하면 모서리 틈으로 빠져 벽 면이 화면에 걸린다', fix: '카메라 가까운 면(near)보다 조금 큰 구로 쓸어 본다.' },
      { title: '당김 · 되돌림을 같은 빠르기로 하면 벽 뒤가 잠깐 보이거나 덜컥거린다', fix: '짧아질 땐 거의 즉시(30), 길어질 땐 천천히(2.2).' },
      { title: '바라는 자리까지 너무 성기게 나누면 얇은 기둥을 건너뛴다', fix: '구 반지름보다 촘촘하게 조각을 나누고, 막힌 곳은 이분 탐색으로 다듬는다.' },
    ],
    prev: ['i480'],
    next: ['i488'],
    source: [{ file: 'demosGame3dA.ts', symbol: 'CamDemo' }],
  },

  i483: {
    id: 'i483',
    summary: '경비의 행동을 순찰 · 의심 · 추격 · 공격 · 귀환 상태로 나누고, 매 장면 행동 나무를 위에서부터 훑어 처음 성공하는 가지를 고른다 — 시야 원뿔과 발소리로 주인공을 알아챈다.',
    terms: [
      { en: 'Finite state machine (FSM)', ko: '지금 상태 하나 + 바뀌는 조건' },
      { en: 'Behavior tree (selector)', ko: '위에서부터 조건을 보고 처음 성공한 가지를 실행' },
      { en: 'Vision cone + line of sight', ko: '시야 각 · 거리 안이고 벽에 안 가리면 보임' },
      { en: 'Noise perception · breadcrumbs', ko: '발소리 반경 안이면 들음 · 지나온 길 점을 따라 귀환' },
    ],
    goal: '{target}에 순찰 → 의심 → 추격 → 공격 → 귀환 상태를 가진 적 AI 를 만들어 줘 — 시야 원뿔 · 발소리 · 지금 상태 표시 포함. 분위기는 {style}.',
    targets: ['던전 고블린 경비', '숨바꼭질 술래', '마을 NPC 경비병'],
    styles: ['돌 던전 · 횃불', '밝은 장난감 세상', '설명용 (행동 나무 마디 불 켜기)'],
    platforms: ['three', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 상태를 enum + switch 로, 길은 NavMeshAgent. 행동 나무는 Behavior 패키지(Unity Behavior)로도 그린다.',
      godot: 'Godot 은 상태를 enum + match 로, 길은 NavigationAgent3D, 시야는 RayCast3D 나 PhysicsDirectSpaceState3D.intersect_ray.',
    },
    principle: [
      '보기: 주인공까지 거리 < 6.2 이고, 바라보는 방향과의 각이 반각 36° 안이고, 그 방향 광선이 벽에 먼저 막히지 않으면 「보임」.',
      '듣기: 주인공이 뛸 때 0.33초마다 소리 고리, 적이 반경 3.6 안이면 그 자리를 4.5초 기억한다.',
      '행동 나무(선택자): 공격 중이거나 1.15 안에서 보이면 공격 → 0.3초 넘게 보이면 추격 → 기억이 있으면 의심(그곳에 가서 두리번) → 순찰 길에서 벗어났으면 귀환 → 아니면 순찰.',
      '추격 · 의심 중엔 0.45 마다 길 점(빵 부스러기)을 떨어뜨리고, 귀환은 그 점을 거꾸로 따라 순찰 길로 돌아온다.',
      '상태마다 색(순찰 초록 · 의심 노랑 · 추격 빨강 · 공격 주황 · 귀환 파랑)으로 머리 위 표시 · 바닥 시야 부채꼴을 칠한다.',
    ],
    when: ['몰래 지나가기 · 숨바꼭질처럼 「들킬까 말까」가 놀이일 때', '적이 여럿이고 각자 다르게 움직여야 할 때'],
    avoid: ['보드게임 상대 — 탐색 AI(i340 · i347)가 맞다', '상태가 수십 개로 늘어날 때 — 상태 기계 대신 행동 나무 데이터로 나눠 관리'],
    cost: 'light',
    costNote: '적 하나당 시야 광선 1개 + 부채꼴 그리기 광선 40개(벽 선분과 교차). 적 수십 개도 가볍다 — 부채꼴은 보일 때만 그린다.',
    level: 2,
    must: [
      '「보임」은 각도 · 거리 · 벽 가림 세 가지를 모두 검사',
      '행동 고르기(나무)와 행동 하기(이동 · 휘두르기)를 나눈다',
      '상태가 바뀔 때만 말풍선(「들켰다!」 「놓쳤다…」)을 띄운다',
      '시야 부채꼴은 벽에서 잘리게 (광선 끝을 이은 다각형)',
      '시야 반각 · 시야 거리 · 발소리 반경 슬라이더 + 「살금살금」(뛰어도 소리 없음)',
    ],
    done: [
      '주인공이 기둥 뒤에 있으면 시야 부채꼴이 기둥에서 잘리고 들키지 않는다',
      '주인공이 뛰면 소리 고리가 퍼지고, 반경 안의 적이 그 자리로 와 두리번거린다',
      '추격하다 놓치면 지나온 길을 되짚어 순찰 길로 돌아간다',
      '오른쪽 행동 나무에서 지금 실행 중인 마디에 불이 들어온다',
    ],
    code: {
      lang: 'ts',
      title: '보기 (원뿔 + 벽 광선) · 행동 나무 선택자',
      from: 'demos/demosGame3dA.ts AIDemo.tick() 을 정리',
      body: `type AState = 'patrol' | 'suspect' | 'chase' | 'attack' | 'return';

// ── 보기: 거리 · 각도 · 벽 가림
const dx = hero.x - ex, dz = hero.z - ez;
const d = Math.hypot(dx, dz) || 1e-6;
const ca = (Math.sin(eyaw) * dx + Math.cos(eyaw) * dz) / d;               // 바라보는 방향과의 cos
const inCone = d < range && ca > Math.cos((fov * Math.PI) / 180);        // range 6.2 · fov 36°
const block = ray2(wallSegs, ex, ez, dx / d, dz / d, d);                  // 벽까지 거리
seen = inCone && block >= d - 0.05;
if (seen) { seenT = Math.min(1, seenT + dt); memory = { x: hero.x, z: hero.z }; memT = 3; }
else seenT = Math.max(0, seenT - dt * 0.6);
memT -= dt;
if (memT <= 0) memory = null;

// ── 행동 나무: 위에서부터 처음 성공하는 가지
const swinging = st === 'attack' && atkT < 0.85;
let pick: AState;
if (swinging || (seen && d < 1.15)) pick = 'attack';
else if (seen && (seenT > 0.3 || st === 'chase' || st === 'attack')) pick = 'chase';
else if (memory) pick = 'suspect';                                         // 본 곳 · 들은 곳으로 가서 두리번
else if (crumbs.length || patrolDist() > 0.3) pick = 'return';            // 길 점을 거꾸로 따라
else pick = 'patrol';
if (pick !== st) { onEnter(pick, st); st = pick; }

// ── 행동
if (st === 'patrol') { if (moveEnemy(PATROL[pi]!.x, PATROL[pi]!.z, 1.3, dt) < 0.15) pi = (pi + 1) % PATROL.length; }
else if (st === 'chase') moveEnemy(hero.x, hero.z, 2.9, dt);
else if (st === 'return') { const c = crumbs[crumbs.length - 1]; if (c && moveEnemy(c.x, c.z, 1.6, dt) < 0.2) crumbs.pop(); }`,
    },
    pitfalls: [
      { title: '각도 · 거리만 보면 벽 너머로 주인공을 알아챈다', fix: '적 → 주인공 광선이 벽 선분에 먼저 닿는지 본다.' },
      { title: '한 장면 보였다고 바로 추격하면 스치기만 해도 들킨다', fix: '보인 시간(seenT)이 0.3초를 넘어야 추격. 안 보이면 0.6배 빠르기로 줄어든다.' },
      { title: '추격 뒤 순찰 길로 곧장 돌아가면 벽을 뚫고 지나간다', fix: '쫓는 동안 길 점을 남기고 귀환할 때 거꾸로 따라간다 (또는 길찾기).' },
      { title: '상태가 바뀌는 매 장면 말풍선을 띄우면 깜빡인다', fix: '바뀌는 순간(pick ≠ st)에만 띄운다.' },
    ],
    prev: ['i480'],
    next: ['i487', 'i347'],
    source: [{ file: 'demosGame3dA.ts', symbol: 'AIDemo' }],
  },

  i485: {
    id: 'i485',
    summary: '천을 점 격자로 두고 지난 위치와의 차이로 움직인 뒤(베를레) 이웃 점 사이 거리를 여러 번 되맞춰, 망토 · 깃발이 바람과 걸음에 펄럭이게 한다.',
    terms: [
      { en: 'Verlet cloth (position-based dynamics)', ko: '위치 · 지난 위치만으로 움직이고 거리 제약을 되맞추는 천' },
      { en: 'Distance constraints (structural · shear · bend)', ko: '가로세로 이웃 · 대각선 · 한 칸 건너 이웃 거리 지키기' },
      { en: 'Pinned vertices', ko: '어깨 · 깃대에 고정한 점' },
      { en: 'Wind on normals · capsule collision', ko: '천 법선 방향으로 받는 바람 · 몸 캡슐 밖으로 밀기' },
    ],
    goal: '{target}을(를) 베를레 점 격자 천으로 만들어 줘 — 바람에 펄럭이고 몸에 부딪히게. 분위기는 {style}.',
    targets: ['걷는 기사의 망토', '성벽 위 깃발', '창문 커튼'],
    styles: ['밤 성벽 · 횃불', '밝은 동화 마을', '설명용 (격자 선 보기)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Cloth 컴포넌트 (Skinned Mesh Renderer 에 붙이고 Capsule Colliders · External/Random Acceleration 으로 바람).',
      godot: 'Godot 4 는 SoftBody3D (pinned points 로 고정, 바람은 Area3D 의 wind 설정).',
    },
    principle: [
      '점마다 지금 위치 p 와 지난 위치 o 만 둔다. 속도 = (p − o) × 0.988(감쇠), 새 p = p + 속도 + 가속 × h².',
      '바람은 「바람 − 점 속도」(상대 기류)를 천 법선에 투영한 만큼 받는다 — 천이 바람을 마주 볼수록 세게 밀린다. 중력 9.8.',
      '제약: 가로세로 이웃(강도 1) · 대각선(0.6) · 한 칸 건너(0.25, 접힘 저항). 길이가 처음과 다르면 차이만큼 두 점을 반씩 당기거나 민다 — 고정 점은 움직이지 않는다.',
      '제약 풀기를 8번 되풀이하며 그때마다 몸 캡슐 안으로 들어간 점을 밖으로 밀고, 바닥(0.02) 아래로는 못 가게.',
      '고정 1/60초 걸음, 끝나면 법선을 다시 계산해 그림자 · 빛이 펄럭임을 따라간다.',
    ],
    when: ['망토 · 깃발 · 리본처럼 가볍게 펄럭이는 천 하나둘', '바람 · 탄성 원리를 보여 주는 체험'],
    avoid: ['옷 전체 · 치마처럼 몸에 꼭 붙는 천 — 뼈대 애니메이션 + 스프링 뼈(u45)가 싸고 안정적', '천이 수십 장 — 점 수 × 제약 × 반복이라 무겁다'],
    cost: 'medium',
    costNote: '견본 망토 12×17 + 깃발 16×10 ≈ 360 점 · 제약 약 2,000 × 8번 = 한 걸음 1.6만 번 계산 (0.2~0.5ms). 격자를 22 로 키우면 4배.',
    level: 3,
    must: [
      '고정 시간 걸음(1/60초), 한 장면에 쌓이는 시간은 3걸음까지',
      '제약 3종(이웃 · 대각선 · 한 칸 건너)을 강도를 달리해서 — 대각선이 없으면 마름모로 찌그러진다',
      '어깨 고정 점은 매 걸음 몸 뼈 위치로 옮긴다 (지난 위치도 같이 갱신)',
      '정점 버퍼는 DynamicDrawUsage, 매 걸음 뒤 computeVertexNormals',
      '격자 크기 · 바람 · 반복 횟수 슬라이더 + 계산 시간(ms) · 점 · 제약 수 표시',
    ],
    done: [
      '기사가 걸으면 망토가 뒤로 날리고, 멈추면 천천히 내려와 등에 붙는다',
      '망토가 몸을 뚫고 앞으로 넘어오지 않는다',
      '반복 횟수를 1 로 낮추면 천이 고무처럼 늘어나고, 20 이면 빳빳해진다',
      '바람을 0 으로 하면 깃발이 축 처진다',
    ],
    code: {
      lang: 'ts',
      title: '베를레 적분 + 거리 제약 되맞추기',
      from: 'demos/demosGame3dB.ts Cloth.step() 을 정리',
      body: `// p · o = 지금 · 지난 위치 (점 n 개 × 3), ca · cb · rest · stiff = 제약 (두 점 · 원래 길이 · 강도)
function step(h: number, iters: number, wind: THREE.Vector3, windK: number, drag: number): void {
  const h2 = h * h, damp = 0.988;
  for (let k = 0; k < n; k++) {
    const j = k * 3;
    if (pin[k]) { o[j] = p[j]; o[j+1] = p[j+1]; o[j+2] = p[j+2]; p[j] = target[j]; p[j+1] = target[j+1]; p[j+2] = target[j+2]; continue; }
    const vx = (p[j] - o[j]) * damp, vy = (p[j+1] - o[j+1]) * damp, vz = (p[j+2] - o[j+2]) * damp;
    const rx = wind.x - vx / h, ry = wind.y - vy / h, rz = wind.z - vz / h;      // 상대 기류
    const dn = (nrm[j] * rx + nrm[j+1] * ry + nrm[j+2] * rz) * windK;          // 천 법선 쪽으로 받는 만큼
    o[j] = p[j]; o[j+1] = p[j+1]; o[j+2] = p[j+2];
    p[j]   += vx + (nrm[j] * dn + rx * drag) * h2;
    p[j+1] += vy + (nrm[j+1] * dn + ry * drag - 9.8) * h2;
    p[j+2] += vz + (nrm[j+2] * dn + rz * drag) * h2;
  }
  for (let it = 0; it < iters; it++) {                                        // 견본 8번
    for (let c = 0; c < cons; c++) {
      const a = ca[c] * 3, b = cb[c] * 3;
      const dx = p[b] - p[a], dy = p[b+1] - p[a+1], dz = p[b+2] - p[a+2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const wa = pin[ca[c]] ? 0 : 1, wb = pin[cb[c]] ? 0 : 1, ws = wa + wb;
      if (!ws) continue;
      const f = ((d - rest[c]) / d) * stiff[c];                                // 이웃 1 · 대각 0.6 · 건너 0.25
      p[a] += dx * f * wa / ws; p[a+1] += dy * f * wa / ws; p[a+2] += dz * f * wa / ws;
      p[b] -= dx * f * wb / ws; p[b+1] -= dy * f * wb / ws; p[b+2] -= dz * f * wb / ws;
    }
    pushOutOfCapsules(p);                                                      // 몸 캡슐 · 바닥 밖으로
  }
}`,
    },
    pitfalls: [
      { title: '이웃 제약만 두면 천이 마름모로 찌그러지고 구겨진다', fix: '대각선(0.6)과 한 칸 건너(0.25) 제약을 더한다.' },
      { title: '고정 점의 지난 위치를 안 바꾸면 걸을 때 망토가 튕긴다', fix: '고정 점은 o = p, p = 목표 로 함께 옮긴다.' },
      { title: '장면 시간으로 바로 적분하면 끊길 때 천이 폭발한다', fix: '1/60초 고정 걸음, 쌓인 시간은 3걸음까지로 자른다.' },
      { title: '바람을 그냥 더하면 천이 한 덩어리로 날아간다', fix: '바람 − 점 속도를 천 법선에 투영해 받는다 — 바람과 나란한 천은 거의 안 밀린다.' },
    ],
    next: ['u45'],
    refs: [{ name: 'Wikipedia — Verlet integration', url: 'https://en.wikipedia.org/wiki/Verlet_integration' }],
    source: [{ file: 'demosGame3dB.ts', symbol: 'Cloth' }],
  },

  i486: {
    id: 'i486',
    summary: '물체 안에 씨앗 점을 뿌리고 씨앗마다 이웃 씨앗과의 수직 이등분면으로 잘라 보로노이 조각을 미리 구워 두었다가, 맞으면 조각으로 바꿔 튕겨 흩어지게 한다.',
    terms: [
      { en: 'Voronoi fracture (pre-fractured)', ko: '씨앗마다 가장 가까운 영역으로 미리 조각내기' },
      { en: 'Convex polyhedron clipping by planes', ko: '볼록 다면체를 평면으로 잘라 한쪽만 남기기' },
      { en: 'Cap faces (inner material)', ko: '잘린 단면은 다른 재질(그룹 1)로' },
      { en: 'Time-sliced baking', ko: '조각 굽기를 한 장면 1.5ms 씩 나눠서' },
    ],
    goal: '{target}을(를) 보로노이로 미리 조각내 두고, 맞으면 조각이 튕겨 흩어지게 해 줘 — 잘린 안쪽 면은 다른 색. 분위기는 {style}.',
    targets: ['나무 상자 · 항아리 · 돌기둥', '퍼즐의 깨지는 블록', '맞으면 부서지는 벽'],
    styles: ['돌 던전 · 횃불', '밝은 장난감 세상', '묵직한 액션'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 조각을 미리 만든 프리팹(Blender Cell Fracture 등)으로 바꿔 넣고 각 조각에 Rigidbody, 터질 때 AddExplosionForce.',
      godot: 'Godot 은 미리 쪼갠 조각 메시를 RigidBody3D 로 바꿔 넣고 apply_impulse 로 흩는다.',
    },
    principle: [
      '물체 겉면을 볼록 다각형 면 목록(Face)으로 둔다 — 상자 · 돌림체(항아리 · 기둥) 모양 함수.',
      '물체 안에 씨앗 12개를 뿌린다. 40% 는 맞을 쪽(기사 쪽) 가까이 몰아 그쪽이 잘게 깨진다.',
      '씨앗 i 의 조각 = 원래 모양을 「다른 씨앗 j 와의 수직 이등분면(법선 = j − i, 지나는 점 = 가운데)」으로 차례로 잘라 i 쪽만 남긴 것.',
      '자를 때 평면 위에 놓인 점들을 모아 각도 순으로 이으면 단면(뚜껑 면)이 된다 — 그룹 1 로 안쪽 재질을 칠한다. 조각은 0.965 배로 줄여 금 틈을 둔다.',
      '맞으면 원래 물체를 숨기고 조각을 보인다: 바깥 · 옆 · 위로 무작위 속도와 회전, 중력 9.8, 바닥에 닿으면 0.32 배 튀고 미끄러지며 구르다 가라앉아 사라진다.',
    ],
    when: ['상자 · 항아리 · 벽이 맞아서 부서지는 손맛', '자르기 · 단면 같은 도형 설명'],
    avoid: ['아주 많은 물체가 동시에 — 조각 수 × 물체 수만큼 메시가 늘어난다. 작은 것은 입자 파편(i170)으로', '다시 붙거나 정확한 물리 쌓기가 필요한 장면 — 물리 엔진 강체로'],
    cost: 'medium',
    costNote: '조각 굽기는 씨앗 n 개 × 평면 n 번 자르기 = n² — 12조각이면 가볍고 30조각이면 무겁다. 그래서 한 장면 1.5ms 씩 나눠 굽는다. 터진 뒤엔 조각 수만큼 그리기 호출.',
    level: 3,
    must: [
      '조각은 맞기 전에 미리 굽는다 (맞는 순간 계산하면 멈칫한다) — 한 장면 1.5ms 씩 나눠서 「굽는 중」 표시',
      '단면은 그룹을 나눠 다른 재질로 (돌 겉 · 밝은 속)',
      '조각을 0.965 배로 줄여 금 틈이 보이게',
      '조각 수(4~30) · 부수는 힘 · 안쪽 면 강조 · 다시 부수기',
      '조각은 구르다 1초 동안 가라앉아 사라지고 메시는 숨기기만 (다시 쓰기)',
    ],
    done: [
      '칼이 지나가면 항아리 · 상자 · 기둥이 조각으로 바뀌어 튕겨 흩어지고 바닥에서 구른다',
      '잘린 단면은 겉과 다른 색이다 (항아리 속 주황 · 상자 속 밝은 나무)',
      '맞은 쪽 조각이 더 잘다',
      '조각 수를 바꿔도 화면이 멈추지 않는다 (나눠 굽기)',
    ],
    code: {
      lang: 'ts',
      title: '씨앗 사이 수직 이등분면으로 잘라 조각 하나 굽기',
      from: 'demos/demosGame3dB.ts clipPoly() · bakeOne() 을 정리',
      body: `interface Face { p: THREE.Vector3[]; n: THREE.Vector3; inner: boolean }

/** 볼록 다면체를 평면 n·x = d 로 잘라 n·x ≤ d 쪽만 남김 (+ 단면) */
function clipPoly(faces: Face[], n: THREE.Vector3, d: number): Face[] {
  const out: Face[] = [], cap: THREE.Vector3[] = [], E = 1e-7;
  for (const f of faces) {
    const np: THREE.Vector3[] = [];
    for (let i = 0; i < f.p.length; i++) {
      const a = f.p[i]!, b = f.p[(i + 1) % f.p.length]!;
      const da = n.dot(a) - d, db = n.dot(b) - d;
      if (da <= E) np.push(a);
      if (Math.abs(da) <= E) cap.push(a);
      if ((da < -E && db > E) || (da > E && db < -E)) { const q = a.clone().lerp(b, da / (da - db)); np.push(q); cap.push(q); }
    }
    if (np.length >= 3) out.push({ p: np, n: f.n, inner: f.inner });
  }
  // 단면: 평면 위 점을 가운데 기준 각도 순으로 이으면 뚜껑 면
  const uniq = cap.filter((q, i) => cap.findIndex((u) => u.distanceToSquared(q) < 1e-10) === i);
  if (uniq.length >= 3) {
    const c = uniq.reduce((s, q) => s.add(q), new THREE.Vector3()).divideScalar(uniq.length);
    const u = (Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).cross(n).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    const ang = (q: THREE.Vector3): number => { const t = q.clone().sub(c); return Math.atan2(t.dot(w), t.dot(u)); };
    uniq.sort((a, b) => ang(a) - ang(b));
    out.push({ p: uniq, n: n.clone(), inner: true });         // inner = 안쪽 재질
  }
  return out;
}

/** 씨앗 i 의 보로노이 조각 = 다른 씨앗마다 이등분면으로 잘라 i 쪽만 */
function bakeOne(faces: Face[], seeds: THREE.Vector3[], i: number): Face[] {
  const si = seeds[i]!;
  for (let j = 0; j < seeds.length && faces.length; j++) {
    if (j === i) continue;
    const n = seeds[j]!.clone().sub(si).normalize();
    faces = clipPoly(faces, n, n.dot(si.clone().add(seeds[j]!).multiplyScalar(0.5)));
  }
  return faces; // facesToGeo(faces, 가운데, 0.965) 로 메시 — 그룹 0 겉면 · 1 단면
}`,
    },
    pitfalls: [
      { title: '맞는 순간 조각을 계산하면 화면이 멈칫한다', fix: '미리 굽되 한 장면 1.5ms 씩 나눠 굽고 「굽는 중」을 보여 준다.', seen: true },
      { title: '단면을 겉과 같은 재질로 칠하면 조각이 속 빈 껍데기처럼 보인다', fix: '잘린 면은 그룹 1 로 모아 다른 재질(밝은 속 색)을 준다.' },
      { title: '씨앗을 고르게만 뿌리면 맞은 쪽도 큰 덩어리로 깨진다', fix: '씨앗 40% 를 맞는 쪽 가까이 몰아 그쪽을 잘게.' },
      { title: '오목한 모양(항아리 입구 안쪽 등)을 그대로 자르면 구멍이 생긴다', fix: '평면 자르기는 볼록 다면체 전용이다 — 견본 항아리는 볼록한 돌림 모양으로 만들고 입구는 어두운 원판을 얹어 표현했다.' },
    ],
    prev: ['i484'],
    next: ['i170', 'i479'],
    refs: [{ name: 'Wikipedia — Voronoi diagram', url: 'https://en.wikipedia.org/wiki/Voronoi_diagram' }],
    source: [{ file: 'demosGame3dB.ts', symbol: 'demoFracture' }],
  },

  i487: {
    id: 'i487',
    summary: '주인공 시야를 칸마다 광선으로 재 「지금 보임 · 가 본 곳」 두 값을 작은 텍스처에 쓰고, 모든 재질이 그 텍스처로 밝게 · 푸르스름하게 · 검게 칠한다.',
    terms: [
      { en: 'Fog of war (visibility grid)', ko: '안 가 본 곳은 검게, 가 본 곳은 어둡게, 보이는 곳만 밝게' },
      { en: 'Line of sight per cell', ko: '주인공 → 칸 가운데 직선이 벽에 막히는지' },
      { en: 'DataTexture (R = visible, G = explored)', ko: '격자 값을 텍스처로 올려 셰이더가 읽게' },
      { en: 'onBeforeCompile material patch', ko: '표준 재질 마지막 색에 시야를 곱하는 코드 끼워 넣기' },
    ],
    goal: '{target}에 시야 안개를 넣어 줘 — 지금 보이는 곳 · 가 본 곳 · 모르는 곳 세 단계 어둠과 같은 텍스처를 쓰는 미니맵. 분위기는 {style}.',
    targets: ['방 9개 던전 탐험', '전략 게임 지도', '미로 찾기'],
    styles: ['횃불 하나 든 어두운 던전', '밝은 보물 찾기', '설명용 (광선 부채 보기)'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 격자 값을 Texture2D(SetPixels32 · Apply)로 올리고 셰이더에서 월드 xz 로 읽는다. 미니맵은 같은 텍스처를 RawImage 에.',
      godot: 'Godot 은 Image.set_pixel 로 격자를 쓰고 ImageTexture.update, 셰이더에서 월드 좌표로 읽는다.',
    },
    principle: [
      '던전은 28×18 칸 격자. 매 장면 주인공 둘레 반지름(6.5칸) 안 칸마다 주인공 → 칸 가운데를 0.18 간격으로 걸어 벽 칸에 막히는지 본다 (벽 칸은 주인공 쪽 면을 본다).',
      '보이면 목표 1 (가장자리 1.6칸은 부드럽게 줄임). 지금 보임 vis 는 목표로 빠르게 따라가고(× 9), 가 본 곳 seen 은 보인 동안 쌓이기만 한다(× 3, 줄지 않음).',
      'vis · seen 을 RGBA DataTexture 의 R · G 에 쓰고 needsUpdate — 텍스처 하나가 지도 전체.',
      '바닥 · 벽 · 소품 재질에 onBeforeCompile 로 끼워 넣기: 세계 xz 로 텍스처를 읽어 「가 본 곳 = 흑백에 가까운 푸른 기억 색 × G」, 「보임 = 원래 빛 색」을 R 로 섞는다.',
      '미니맵은 같은 시야 텍스처 + 벽 지도 텍스처를 판 하나에 그린다.',
    ],
    when: ['던전 · 미로처럼 「가 본 곳」이 정보인 탐험', '전략 게임의 정찰'],
    avoid: ['벽이 없는 넓은 들판 — 거리만으로 원형 안개면 충분', '칸 수가 수만 개 — 칸마다 광선은 무겁다. 그림자 그리기(광선 각도 훑기)로'],
    cost: 'light',
    costNote: '반지름 안 칸(약 150칸) × 광선 걸음 수십 번 + 28×18 텍스처 업로드. 1ms 미만. 재질은 텍스처 한 번 더 읽을 뿐.',
    level: 2,
    must: [
      '시야는 칸 격자로 계산하고 결과는 작은 DataTexture 하나로 (칸마다 물체 색을 바꾸지 않는다)',
      '「가 본 곳」은 줄지 않고 「지금 보임」만 오르내린다',
      '벽 칸은 칸 가운데가 아니라 주인공 쪽 면으로 시야를 잰다 (안 그러면 벽이 늘 어둡다)',
      '바닥 · 벽 · 소품 모든 재질에 같은 시야 패치를, 인스턴스 벽은 instanceMatrix 까지 곱해서',
      '시야 반지름 슬라이더 · 광선 부채 보기 · 미니맵 · 지도 지우기',
    ],
    done: [
      '주인공 둘레만 횃불빛으로 밝고, 지나온 방은 푸르스름한 흑백으로 남고, 안 가 본 곳은 검다',
      '벽 모퉁이 뒤는 밝아지지 않는다 (광선 부채가 벽에서 잘린다)',
      '미니맵이 큰 화면과 똑같이 밝은 곳 · 가 본 곳 · 모르는 곳을 보여 준다',
      '「지도 지우기」를 누르면 다시 모두 검어진다',
    ],
    code: {
      lang: 'ts',
      title: '칸마다 시야 재기 → 텍스처 R · G → 재질에서 섞기',
      from: 'demos/demosGame3dB.ts demoFog() 의 update · fogPatch() · FOG_FS 를 정리',
      body: `const fogData = new Uint8Array(MW * MH * 4);                 // R = 지금 보임, G = 가 본 곳
const fogTex = new THREE.DataTexture(fogData, MW, MH, THREE.RGBAFormat);
fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter;

function updateFog(dt: number, R2: number): void {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const c = y * MW + x;
    let tx = cellX(x), ty = cellY(y);
    const d = Math.hypot(tx - hero.x, ty - hero.y);
    let tgt = 0;
    if (d < R2 + 0.5) {
      if (grid[c]) { const s = Math.min(0.48, d) / Math.max(d, 1e-3); tx += (hero.x - tx) * s; ty += (hero.y - ty) * s; } // 벽은 주인공 쪽 면
      if (sees(tx, ty, c)) tgt = Math.min(1, Math.max(0, (R2 + 0.5 - d) / 1.6));
    }
    vis[c] += (tgt - vis[c]) * Math.min(1, dt * 9);
    if (tgt > 0.2) seen[c] = Math.min(1, seen[c] + dt * 3);          // 가 본 곳은 쌓이기만
    fogData[c * 4] = Math.round(vis[c] * 255);
    fogData[c * 4 + 1] = Math.round(seen[c] * 255);
  }
  fogTex.needsUpdate = true;
}

// 모든 재질에: 빛 계산이 끝난 색(gl_FragColor)에 시야를 섞는다
function fogPatch(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFogT = { value: fogTex };
    sh.uniforms.uGrid = { value: new THREE.Vector2(MW, MH) };
    sh.vertexShader = 'varying vec3 vFogW;\\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\\nvec4 fogP = vec4(transformed, 1.0);\\n#ifdef USE_INSTANCING\\nfogP = instanceMatrix * fogP;\\n#endif\\nvFogW = (modelMatrix * fogP).xyz;');
    sh.fragmentShader = 'uniform sampler2D uFogT; uniform vec2 uGrid; varying vec3 vFogW;\\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      '#include <opaque_fragment>\\nvec4 fg = texture2D(uFogT, (vFogW.xz + uGrid * 0.5) / uGrid); vec3 lit = gl_FragColor.rgb;' +
      ' vec3 mem = mix(vec3(dot(lit, vec3(0.299, 0.587, 0.114))), lit, 0.3) * vec3(0.62, 0.72, 1.0) * 1.15;' +
      ' gl_FragColor.rgb = mix(mem * fg.g, lit, fg.r);');
  };
  m.customProgramCacheKey = () => 'fog487';
  return m;
}`,
    },
    pitfalls: [
      { title: '벽 칸을 칸 가운데로 재면 벽이 늘 「안 보임」이 된다', fix: '벽 칸은 주인공 쪽으로 0.48 당긴 면 위 점으로 시야를 잰다.' },
      { title: '인스턴스로 그린 벽만 안개가 엉뚱한 자리에 덮인다', fix: '정점 셰이더에서 USE_INSTANCING 이면 instanceMatrix 를 곱한 세계 좌표를 쓴다.' },
      { title: '같은 패치 재질마다 프로그램이 따로 컴파일된다', fix: 'customProgramCacheKey 를 같은 값으로 — 셰이더 하나를 함께 쓴다.' },
      { title: '「가 본 곳」을 검게만 칠하면 기억이 정보가 안 된다', fix: '흑백에 가까운 푸른 색으로 어둡게 남겨 지형은 알아보게 한다.' },
    ],
    prev: ['u08'],
    next: ['i488', 'i477'],
    source: [{ file: 'demosGame3dB.ts', symbol: 'demoFog' }],
  },

  i488: {
    id: 'i488',
    summary: '카메라에서 주인공 발 · 가슴 · 머리로 쏜 광선에 걸리는 벽 · 기둥만 골라, 주인공 둘레 화면 원 안을 바이어 점무늬로 비우고 벽 너머엔 윤곽선을 그린다.',
    terms: [
      { en: 'Occluder fade (dithered cutout)', ko: '가리는 것만 점무늬로 구멍 내 반투명처럼' },
      { en: 'Ordered dithering (Bayer 4×4)', ko: '정해진 4×4 문턱 무늬로 픽셀을 버려 투명도 흉내' },
      { en: 'X-ray silhouette (depthFunc GreaterDepth)', ko: '벽 뒤에 가린 부분만 단색 윤곽으로' },
      { en: 'Ray vs bounding box', ko: '카메라 → 주인공 광선과 벽 상자 교차' },
    ],
    goal: '{target}에서 카메라와 주인공 사이를 가리는 벽 · 기둥만 주인공 둘레를 점무늬로 비우고, 벽 너머엔 윤곽선을 그려 줘. 분위기는 {style}.',
    targets: ['쿼터뷰 던전', '빽빽한 숲 · 마을', '건물 안 탐험'],
    styles: ['횃불 던전 · 디아블로 꼴', '밝은 장난감 마을', '설명용 (끔 · 켬 나란히)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 는 Shader Graph 에서 Screen Position 과 Dither 노드로 Alpha Clip, 벽 너머 윤곽은 Render Objects 기능(Depth Test Greater).',
      godot: 'Godot 4 표준 재질의 Distance Fade(Pixel Dither) 나 셰이더에서 FRAGCOORD 바이어 무늬로 discard, 윤곽은 depth_test 를 바꾼 두 번째 패스.',
    },
    principle: [
      '벽 · 기둥 상자마다 「비울 정도 fade(0~1)」를 정점 속성(aFade)으로 둔다.',
      '매 장면 카메라에서 주인공 발(0.3) · 가슴(1.1) · 머리(1.75)로 광선을 쏴 0.16 키운 상자와 주인공보다 앞에서 만나면 목표 1, 아니면 0 — fade 는 0.11초 시간 상수로 따라간다.',
      '조각 셰이더: 주인공 화면 자리에서의 거리(세로는 0.78 배)로 원 안(inside)을 구하고, 주인공보다 카메라 쪽(front)인 조각만 k = fade × inside × front.',
      '바이어 4×4 문턱이 남길 비율(keep)보다 크면 discard — 반투명 방식은 66% 만 비우고, 둥글게 비우기는 다 비운다. 투명 정렬 문제 없이 깊이도 그대로.',
      '주인공은 두 번 더 그린다: 벽보다 뒤인 곳만(GreaterDepth) 파란 가산 윤곽 → 그다음 보통으로.',
    ],
    when: ['위에서 비스듬히 내려다보는 쿼터뷰 · 3인칭에서 벽이 주인공을 가릴 때', '방 · 건물이 촘촘한 지도'],
    avoid: ['카메라를 당겨 해결되는 좁은 3인칭 — 카메라 충돌(i481)', '벽 전체를 반투명 재질로 바꾸기 — 투명 정렬이 엉키고 그림자가 사라진다'],
    cost: 'light',
    costNote: '상자마다 광선 3개 검사 + 셰이더 몇 줄. 주인공 윤곽 때문에 주인공만 한 번 더 그린다.',
    level: 2,
    must: [
      '가리는 것만 비운다 (광선에 걸린 상자) — 다른 벽은 그대로',
      '진짜 투명(transparent) 대신 바이어 점무늬 discard — 깊이 · 그림자 유지',
      '주인공보다 카메라 쪽 조각만 비운다 (주인공 뒤 벽은 그대로)',
      'fade 는 부드럽게 오르내려 깜빡이지 않게',
      '방식 바꾸기(끔 · 점무늬 반투명 · 둥글게 비우기) · 윤곽선 · 화면 반경 · 끔/켬 나란히',
    ],
    done: [
      '기사가 벽 뒤로 걸어 들어가면 그 벽만 기사 둘레가 둥글게 비어 기사가 보인다',
      '벽에 살짝 가린 순간엔 벽 너머로 파란 윤곽선이 보인다',
      '기사가 벽에서 나오면 구멍이 0.1초 남짓 동안 부드럽게 메워진다',
      '끔/켬 나란히에서 왼쪽은 기사가 가려지고 오른쪽은 보인다',
    ],
    code: {
      lang: 'glsl',
      title: '주인공 둘레 화면 원 안을 바이어 점무늬로 비우기 (벽 재질에 끼워 넣기)',
      from: 'demos/demosDiablo.ts CUT_FH · CUT_FB · cutify() · updateOcc() 를 정리',
      body: `// TS 쪽 (매 장면):
//  updateOcc — 상자마다 카메라 → 주인공 (발 0.3 · 가슴 1.1 · 머리 1.75) 광선이 0.16 키운 상자와
//              주인공보다 앞에서 만나면 목표 1. fade += (목표 − fade) × (1 − exp(−dt / 0.11)) → aFade 속성
//  uHero = (주인공 화면 픽셀 x, y, 시점 깊이 − 0.3), uRad = 화면 반경 0.22 × 화면 높이, uMode 0 끔 · 1 반투명 · 2 비우기
//  cutify(m): onBeforeCompile 로 아래를 '#include <clipping_planes_fragment>' 뒤에 넣는다
uniform vec3 uHero; uniform float uRad; uniform float uMode;
varying float vFade;                                // 정점 속성 aFade
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }

void cutOccluder(){
  if (uMode > 0.5 && vFade > 0.002) {
    vec2 d = (gl_FragCoord.xy - uHero.xy) / uRad;
    float rr = length(d * vec2(1.0, 0.78));
    float inside = 1.0 - smoothstep(0.62, 1.0, rr);   // 주인공 둘레 화면 원
    float front = step(vViewPosition.z, uHero.z);     // 주인공보다 카메라 쪽만
    float k = vFade * inside * front;
    float keep = uMode < 1.5 ? 1.0 - k * 0.66 : 1.0 - k;
    if (bayer4(gl_FragCoord.xy) >= keep - 0.001) discard;
  }
}
// 벽 너머 윤곽: 주인공 층만 MeshBasicMaterial({ depthFunc: THREE.GreaterDepth, depthWrite: false,
//   transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }) 로 한 번, 그다음 보통으로 한 번`,
    },
    pitfalls: [
      { title: '벽을 transparent 반투명 재질로 바꾸면 그림자 · 정렬이 엉킨다', fix: '불투명 그대로 두고 바이어 점무늬로 discard — 깊이가 살아 있어 정렬 문제가 없다.' },
      { title: '광선 하나(가슴)만 쏘면 발이나 머리만 가린 벽을 놓친다', fix: '발 · 가슴 · 머리 세 높이로 쏜다.' },
      { title: '주인공 뒤쪽 벽까지 비우면 방이 뻥 뚫려 보인다', fix: '시점 깊이를 비교해 주인공보다 카메라 쪽 조각만 비운다.' },
      { title: 'fade 를 바로 0/1 로 바꾸면 경계에서 깜빡인다', fix: '0.11초 시간 상수로 부드럽게 따라가게.' },
    ],
    prev: ['i481', 'i477'],
    next: ['i487'],
    refs: [{ name: 'Wikipedia — Ordered dithering', url: 'https://en.wikipedia.org/wiki/Ordered_dithering' }],
    source: [{ file: 'demosDiablo.ts', symbol: 'makeOccluder' }],
  },

  i340: {
    id: 'i340',
    summary: '게임을 끝까지 다 둬 본 결과(승 +1 · 무 0 · 패 −1)를 내 차례엔 가장 큰 값, 상대 차례엔 가장 작은 값으로 위로 올려 최선의 수를 고른다.',
    terms: [
      { en: 'Minimax (game tree search)', ko: '내 차례 최댓값 · 상대 차례 최솟값으로 올리기' },
      { en: 'Game tree', ko: '판 하나 = 마디, 둘 수 하나 = 가지' },
      { en: 'Terminal evaluation (+1 / 0 / −1)', ko: '끝난 판의 점수 — 내 승 · 무승부 · 내 패' },
      { en: 'Depth-first recursion', ko: '한 가지를 끝까지 내려갔다 올라오며 값 정하기' },
    ],
    goal: '{target}의 컴퓨터 상대를 미니맥스로 만들어 줘. 탐색 과정은 {style}.',
    targets: ['틱택토 끝판', '님 · 작은 숫자 게임', '게임 나무 설명 화면'],
    styles: ['나무 그림으로 한 마디씩 보여 주는 설명', '보이지 않게 바로 두는 AI', '값이 위로 올라가는 애니메이션'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 재귀 함수 (판은 int[] 복사). 깊은 탐색은 Task.Run 으로 화면 밖에서.',
      godot: 'GDScript 로 같은 재귀. 판은 PackedInt32Array.duplicate(), 무거우면 WorkerThreadPool.',
    },
    principle: [
      '지금 판에서 둘 수 있는 수마다 판을 하나씩 만들고, 그 판에서 또 상대의 수마다 … 끝날 때까지 펼친다.',
      '끝난 판(잎)은 내 승 +1 · 무 0 · 내 패 −1.',
      '위로 올라오며: 내 차례 마디 = 자식 값 중 가장 큰 값, 상대 차례 마디 = 가장 작은 값 (상대도 최선을 둔다고 가정).',
      '뿌리에서 가장 큰 값을 준 자식이 고를 수 — 견본은 빈칸 3~4개 틱택토 끝판으로 나무 전체를 그린다.',
    ],
    when: ['틱택토 · 님처럼 끝까지 다 볼 수 있는 작은 게임', '「컴퓨터는 이렇게 생각한다」 수학 설명'],
    avoid: ['경우의 수가 큰 게임(체스 · 오목) — 알파베타(i341) + 깊이 제한 + 평가 함수(i346)', '주사위 · 카드처럼 운이 있는 게임 — 기대값 탐색(i348)'],
    cost: 'light',
    costNote: '틱택토 빈 판부터 끝까지 = 약 55만 잎. 빈칸 3개 끝판은 잎 몇 개 ~ 십여 개라 설명용으로 딱. 깊이마다 지수로 늘어난다.',
    level: 1,
    must: [
      '게임 규칙(수 목록 · 두기 · 끝 판정 · 점수)과 탐색 함수를 나눈다',
      '점수는 늘 한쪽(AI) 기준으로 — 차례마다 기준이 바뀌지 않게',
      '판은 복사해서 두거나 두고 되돌리기 — 원래 판을 망가뜨리지 않게',
      '설명 화면은 「들어감 · 잎 값 · 올림」 사건을 차례로 재생, 빈칸 수(나무 깊이) 3~4 조절',
    ],
    done: [
      '나무의 잎에 +1 · 0 · −1 이 붙고, 마디 값이 차례(최대 · 최소)에 맞게 위로 올라간다',
      '뿌리에서 고른 수가 실제로 지지 않는 수다 (무작위 판 100개로 확인)',
      '「다른 판」을 누르면 새 끝판으로 다시 펼친다',
    ],
    code: {
      lang: 'ts',
      title: '틱택토 미니맥스 — 끝까지 펼치고 최대 · 최소로 올리기',
      from: 'demos/demosGameAI.ts buildMinimax() 의 mk() 를 정리',
      body: `// b: 9칸 (0 빈칸 · 1 X · 2 O), win(b): 0 진행 중 · 1 · 2 이긴 쪽 · 3 무승부
function minimax(b: number[], mover: number, me: number): number {
  const term = win(b);
  if (term) return term === 3 ? 0 : term === me ? 1 : -1;     // 잎: 승 +1 · 무 0 · 패 -1
  const vals: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    const nb = b.slice();                                     // 판 복사
    nb[i] = mover;
    vals.push(minimax(nb, 3 - mover, me));
  }
  return mover === me ? Math.max(...vals) : Math.min(...vals); // 내 차례 최대 · 상대 차례 최소
}

function bestMove(b: number[], me: number): number {
  let best = -1, bv = -Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    const nb = b.slice();
    nb[i] = me;
    const v = minimax(nb, 3 - me, me);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}`,
    },
    pitfalls: [
      { title: '점수를 「지금 둔 사람」 기준으로 주면 최대 · 최소가 뒤섞인다', fix: '점수는 늘 AI(뿌리) 기준, 차례에 따라 최대 · 최소만 바꾼다.' },
      { title: '빈 판부터 매번 다 펼치면 첫 수가 느리다', fix: '틱택토는 괜찮지만 큰 게임은 깊이 제한 · 알파베타 · 같은 판 기억(i344)이 필요하다.' },
      { title: '같은 값 수가 여럿이면 늘 첫 칸만 둔다', fix: '같은 값 중 무작위로 고르거나, 빨리 이기는 수를 조금 더 높게(+1 대신 +10 − 깊이).' },
    ],
    next: ['i341', 'i343', 'i346'],
    refs: [{ name: 'Wikipedia — Minimax', url: 'https://en.wikipedia.org/wiki/Minimax' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'buildMinimax' }],
  },

  i343: {
    id: 'i343',
    summary: '깊이 1, 2, 3 … 차례로 끝까지 탐색하며 끝난 깊이의 최선 수를 늘 들고 있다가, 시간이 다 되면 하던 깊이는 버리고 그 수를 둔다.',
    terms: [
      { en: 'Iterative deepening', ko: '깊이를 1씩 늘리며 처음부터 다시 찾기' },
      { en: 'Time budget (time management)', ko: '한 수에 쓸 시간 — 넘으면 멈춤' },
      { en: 'Anytime algorithm', ko: '언제 멈춰도 그때까지의 가장 좋은 답이 있다' },
    ],
    goal: '{target}의 AI 에 반복 심화 + 시간 예산을 넣어 줘 — 정해진 시간 안에 늘 수를 두게. 분위기는 {style}.',
    targets: ['오목 · 체스 AI', '난이도별 생각 시간', '헥스 · 커넥트4'],
    styles: ['시간 줄로 깊이마다 막대를 보여 주는 설명', '보이지 않게 빠르게 두는 AI', '난이도별로 예산이 다른 AI'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 반복문 + System.Diagnostics.Stopwatch 로 시간 검사, 탐색은 Task.Run 안에서.',
      godot: 'GDScript 는 Time.get_ticks_msec() 로 시간 검사, 탐색은 WorkerThreadPool 로.',
    },
    principle: [
      '깊이 1 을 끝까지 → 최선 수 저장 → 깊이 2 를 끝까지 → 저장 … 을 시간이 남는 동안 되풀이한다.',
      '탐색 중 시간이 다 되면 하던 깊이는 결과가 반쪽이니 버리고, 마지막으로 끝난 깊이의 수를 둔다.',
      '깊이가 1 늘면 시간이 대략 가지 수배로 는다 (견본은 × 3) — 그래서 앞 깊이들을 다시 하는 비용은 전체의 일부뿐.',
      '앞 깊이의 최선 수를 다음 깊이에서 먼저 보면 알파베타가 더 많이 잘라 오히려 빨라진다.',
    ],
    when: ['판마다 경우의 수가 크게 달라 고정 깊이로는 시간이 들쭉날쭉할 때', '난이도를 「생각 시간」으로 나눌 때 (유아 0.3초 ~ 고수 2초)'],
    avoid: ['틱택토처럼 끝까지 바로 보는 작은 게임 — 그냥 미니맥스(i340)', '몬테카를로 트리 탐색 — 그건 반복 횟수 자체가 시간 예산이라 따로 필요 없다(i347)'],
    cost: 'medium',
    costNote: '앞 깊이를 다시 하는 비용은 가지 수가 3 이면 약 50%, 10 이면 약 11% 더. 시간 검사는 마디 수천 개마다 한 번만.',
    level: 1,
    must: [
      '시간 검사는 탐색 안에서도 (깊이 사이에서만 보면 마지막 깊이가 예산을 크게 넘긴다)',
      '시간이 다 되면 하던 깊이 결과는 버리고 끝난 깊이의 수를 쓴다',
      '앞 깊이의 최선 수를 다음 깊이에서 가장 먼저 탐색',
      '예산은 난이도별로 (견본 0.7 · 2.0 · 4.6초 자동 순환, 0.3~5 슬라이더)',
      '탐색은 워커에서 — 생각하는 동안 화면이 멈추지 않게(i359)',
    ],
    done: [
      '시간 줄에 깊이 1 · 2 · 3 … 막대가 점점 길게 쌓이고, 예산 선을 넘은 막대는 「버림」으로 표시된다',
      '둔 수는 마지막으로 끝난 깊이의 ★ 수와 같다',
      '예산을 늘리면 끝난 깊이가 커진다',
      '어떤 판에서도 예산 + 소량 안에 수를 둔다',
    ],
    code: {
      lang: 'ts',
      title: '반복 심화 + 시간 예산 (알파베타를 감싸는 꼴)',
      from: '새로 씀 (demos/demosGameAI.ts i343 견본의 「깊이 +1 → 시간 ×3 · 끝난 깊이의 수를 둔다」 규칙과 같은 방식)',
      body: `class TimeUp extends Error {}

function think<S, M>(g: Game<S, M>, s: S, budgetMs: number): { move: M | undefined; depth: number } {
  const deadline = performance.now() + budgetMs;
  let nodes = 0;
  let best: M | undefined;
  let done = 0;
  const search = (st: S, depth: number, a: number, b: number, max: boolean): number => {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw new TimeUp();  // 탐색 안에서도 시간 검사
    if (depth === 0 || g.over(st)) return g.score(st);
    let v = max ? -Infinity : Infinity;
    for (const m of g.moves(st)) {
      const c = search(g.play(st, m), depth - 1, a, b, !max);
      if (max) { v = Math.max(v, c); a = Math.max(a, v); } else { v = Math.min(v, c); b = Math.min(b, v); }
      if (a >= b) break;
    }
    return v;
  };
  try {
    for (let depth = 1; depth <= 64; depth++) {
      // 앞 깊이의 최선 수를 맨 앞으로 — 더 많이 잘린다
      const ms = g.moves(s).sort((x, y) => (x === best ? -1 : y === best ? 1 : 0));
      let bm: M | undefined, a = -Infinity;
      for (const m of ms) {
        const v = search(g.play(s, m), depth - 1, a, Infinity, false);
        if (v > a) { a = v; bm = m; }
      }
      best = bm;                     // 이 깊이를 끝까지 마쳤을 때만 바꾼다
      done = depth;
    }
  } catch (e) {
    if (!(e instanceof TimeUp)) throw e; // 시간 끝 — 하던 깊이는 버림
  }
  return { move: best, depth: done };
}`,
    },
    pitfalls: [
      { title: '깊이 사이에서만 시간을 보면 마지막 깊이가 예산을 몇 배 넘긴다', fix: '탐색 안에서 마디 1024개마다 시간을 보고 넘으면 바로 빠져나온다.' },
      { title: '시간이 끝난 깊이의 반쪽 결과를 쓰면 엉뚱한 수를 둔다', fix: '그 깊이는 버리고 마지막으로 끝까지 마친 깊이의 수를 쓴다.' },
      { title: '깊이 1 조차 못 끝내면 둘 수가 없다', fix: '깊이 1 은 시간과 상관없이 끝내거나, 수 목록의 첫 수를 기본값으로 들고 시작한다.' },
    ],
    prev: ['i341'],
    next: ['i344', 'i359'],
    refs: [
      { name: 'Chessprogramming wiki — Iterative Deepening', url: 'https://www.chessprogramming.org/Iterative_Deepening' },
      { name: 'Wikipedia — Iterative deepening depth-first search', url: 'https://en.wikipedia.org/wiki/Iterative_deepening_depth-first_search' },
    ],
  },

  i344: {
    id: 'i344',
    summary: '칸 · 말마다 무작위 비트를 정해 두고 놓인 말의 비트를 XOR 로 모은 값을 판의 이름표로 써서, 다른 순서로 온 같은 판의 결과를 표에서 바로 꺼낸다.',
    terms: [
      { en: 'Zobrist hashing', ko: '칸 × 말마다 무작위 수 — 판 이름표 = 놓인 것들의 XOR' },
      { en: 'Transposition table', ko: '판 이름표 → 이미 계산한 값 · 깊이 · 최선 수 표' },
      { en: 'Incremental hash update', ko: '말 하나 놓거나 빼면 그 칸 수 하나만 XOR' },
    ],
    goal: '{target}의 탐색에 조브리스트 해시 전치표를 넣어 줘 — 같은 판은 다시 계산하지 않게. 분위기는 {style}.',
    targets: ['체스 · 오목 AI', '퍼즐 풀이기 (방문한 판 기억)', '틱택토 설명 화면'],
    styles: ['비트가 XOR 되는 과정을 보여 주는 설명', '보이지 않게 빠르게 두는 AI', '아낀 계산 수를 숫자로 보여 주는'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 은 ulong 64비트 무작위 수 표 + Dictionary<ulong, Entry> (또는 크기 고정 배열 [hash & mask]).',
      godot: 'GDScript 의 int 는 64비트 — 같은 XOR 해시, 표는 Dictionary 로.',
    },
    principle: [
      '시작할 때 칸 i · 말 종류 p 마다 무작위 수 Z[i][p] 를 정한다 (빈 판 = 0).',
      '판의 이름표 = 놓인 말들의 Z 를 모두 XOR. XOR 은 순서와 상관없으니 「X→1, O→5, X→9」 와 「X→9, O→5, X→1」 이 같은 이름표가 된다.',
      '말을 놓거나 뺄 때 그 칸의 Z 하나만 XOR 하면 이름표가 바로 갱신된다 (판 전체를 다시 볼 필요 없음).',
      '이름표의 아래 몇 비트를 표의 칸 번호로 쓰고(견본은 아래 3비트 = 8칸), 거기에 계산한 값을 저장한다. 같은 판이 또 나오면 꺼내 쓰고 계산을 건너뛴다.',
    ],
    when: ['다른 순서로 같은 판에 자주 닿는 게임 (체스 · 오목 · 슬라이딩 퍼즐)', '반복 심화(i343)와 함께 — 앞 깊이의 최선 수를 표에서 꺼내 먼저 보기'],
    avoid: ['같은 판이 거의 안 겹치는 작은 탐색 — 표 관리 비용만 든다', '판을 문자열로 바꿔 Map 열쇠로 쓰기 — 느리다. 정수 해시로'],
    cost: 'light',
    costNote: '갱신은 XOR 한 번. 표 메모리는 칸 수 × 항목 크기 — 2^20 칸이면 몇십 MB 이니 폰은 2^16 정도로.',
    level: 2,
    must: [
      '무작위 수는 판마다가 아니라 게임 시작 때 한 번 (같은 판 = 늘 같은 이름표)',
      '말을 둘 때 · 뺄 때 이름표를 XOR 로 갱신 (차례도 Z 하나로 넣는다)',
      '표 항목에 이름표 전체를 같이 저장해 다른 판이 같은 칸에 온 것(충돌)을 걸러낸다',
      '저장한 깊이가 지금 필요한 깊이보다 얕으면 값을 그대로 쓰지 않는다 (최선 수만 참고)',
      '전치표 켬/끔 비교로 아낀 계산 수를 보여 주기',
    ],
    done: [
      '두 길(다른 순서)로 같은 판에 닿으면 이름표 비트가 똑같다',
      '켬이면 두 번째 판은 「찾았다! 계산 0」, 끔이면 다시 계산한다',
      '같은 깊이 탐색에서 켬일 때 본 마디 수가 확실히 적다',
    ],
    code: {
      lang: 'ts',
      title: '조브리스트 이름표 + 전치표',
      from: '새로 씀 (demos/demosGameAI.ts i344 견본의 칸 × 말 무작위 수 XOR · 해시 아래 비트 = 표 칸 방식)',
      body: `const CELLS = 225, PIECES = 2;                       // 예: 15×15 오목, 흑 · 백
const rnd32 = (): number => (Math.random() * 0x100000000) >>> 0;
// 32비트 두 개를 이어 충돌을 줄인다 (hi 는 확인용, lo 는 칸 번호용)
const Zlo = Array.from({ length: CELLS * PIECES }, rnd32);
const Zhi = Array.from({ length: CELLS * PIECES }, rnd32);
const Zturn = [rnd32(), rnd32()];

let lo = 0, hi = 0;                                   // 빈 판 = 0
function toggle(cell: number, piece: number): void {  // 놓기 · 빼기 모두 같은 XOR
  lo ^= Zlo[cell * PIECES + piece]!;
  hi ^= Zhi[cell * PIECES + piece]!;
}
function flipTurn(): void { lo ^= Zturn[0]!; hi ^= Zturn[1]!; }

interface Entry { hi: number; lo: number; depth: number; value: number; best: number }
const BITS = 16;
const table: (Entry | undefined)[] = new Array(1 << BITS);

function probe(depth: number): Entry | undefined {
  const e = table[lo & ((1 << BITS) - 1)];             // 아래 비트 = 칸 번호
  if (!e || e.hi !== hi || e.lo !== lo) return undefined; // 다른 판이 같은 칸 (충돌)
  return e.depth >= depth ? e : undefined;             // 얕게 본 값은 그대로 쓰지 않기
}
function store(depth: number, value: number, best: number): void {
  table[lo & ((1 << BITS) - 1)] = { hi, lo, depth, value, best };
}`,
    },
    pitfalls: [
      { title: '해시 비트가 적으면 다른 판이 같은 이름표가 된다', fix: '64비트(32비트 두 개)로 만들고 항목에 이름표 전체를 저장해 확인한다.' },
      { title: '차례를 해시에 안 넣으면 「같은 판 · 다른 차례」 값을 섞어 쓴다', fix: '차례 전용 무작위 수를 차례가 바뀔 때마다 XOR.' },
      { title: '얕은 깊이로 저장한 값을 깊은 탐색에 그대로 쓰면 수읽기가 짧아진다', fix: '저장 깊이 ≥ 필요한 깊이일 때만 값을 쓰고, 아니면 최선 수만 먼저 보기에 쓴다.' },
      { title: '알파베타의 잘린 값(하한 · 상한)을 정확한 값처럼 저장하면 틀린다', fix: '항목에 「정확 · 하한 · 상한」 표시를 같이 두고 꺼낼 때 α · β 와 비교한다.' },
    ],
    prev: ['i341', 'i343'],
    next: ['i345'],
    refs: [
      { name: 'Wikipedia — Zobrist hashing', url: 'https://en.wikipedia.org/wiki/Zobrist_hashing' },
      { name: 'Chessprogramming wiki — Transposition Table', url: 'https://www.chessprogramming.org/Transposition_Table' },
    ],
    source: [{ file: 'demosGameAI.ts', symbol: 'I344' }],
  },

  i345: {
    id: 'i345',
    summary: '깊이 끝에서 바로 평가하지 않고 잡기가 끝나 판이 조용해질 때까지 잡는 수만 더 봐서, 「공짜 룩!」 같은 수평선 착각을 막는다.',
    terms: [
      { en: 'Quiescence search', ko: '조용한 판이 될 때까지 잡기만 더 보기' },
      { en: 'Horizon effect', ko: '탐색 깊이 바로 너머의 손해를 못 보는 착각' },
      { en: 'Stand pat', ko: '「안 잡고 지금 점수로 멈춤」도 고를 수 있다는 기준값' },
    ],
    goal: '{target}의 알파베타 끝에 정지 탐색을 넣어 줘 — 깊이 끝에서 잡기가 끝날 때까지 더 보게. 분위기는 {style}.',
    targets: ['체스 · 장기 AI', '고누 · 잡기가 있는 보드게임', '수평선 효과 설명 화면'],
    styles: ['깊이 1 에서 멈춤 vs 정지 탐색을 나란히 보여 주는 설명', '보이지 않게 강하게 두는 AI', '평가 막대가 오르내리는 연출'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 재귀 — 잡는 수만 만드는 함수를 따로 둔다.',
      godot: 'GDScript 로 같은 재귀 — 잡는 수 목록만 돌려주는 함수를 따로.',
    },
    principle: [
      '깊이 1 에서 멈춘 AI 는 「퀸으로 룩을 잡으면 +5」 만 보고, 다음 수에 폰이 퀸(−9)을 잡는 걸 못 본다 — 수평선 너머라서.',
      '정지 탐색은 깊이 0 에 닿아도 바로 평가하지 않고, 잡는 수만 계속 펼친다. 잡을 게 없으면(조용한 판) 그때 평가한다.',
      '각 마디에서 「안 잡고 멈춤(stand pat)」 = 지금 평가값을 기본으로 깔고, 잡는 수가 그보다 좋을 때만 바꾼다 — 잡기를 억지로 하지 않는다.',
      '견본 결과: 룩 잡기는 끝까지 보면 −4, 나이트 잡기는 다시 잡을 것이 없어 +3 → 안전한 나이트를 고른다.',
    ],
    when: ['잡기 · 맞바꾸기가 있는 게임(체스 · 장기 · 고누)', '깊이 제한 탐색이 「다 잡고 끝」에서 자꾸 손해를 볼 때'],
    avoid: ['잡기가 없는 게임(틱택토 · 커넥트4) — 대신 「위협(3줄)」을 평가 함수에 넣는다', '잡기가 끝없이 이어지는 게임 — 정지 탐색에도 깊이 상한을 둔다'],
    cost: 'medium',
    costNote: '잡는 수만 보니 가지는 적지만 마디 수가 전체의 절반을 넘기도 한다. 「잡는 말이 싼 것부터(MVV-LVA)」 정렬로 줄인다.',
    level: 2,
    must: [
      '알파베타의 깊이 0 자리에서 평가 대신 정지 탐색을 부른다',
      'stand pat 으로 시작해 α · β 가지치기를 정지 탐색 안에서도',
      '정지 탐색에도 최대 깊이(예: 8)를 둔다',
      '잡는 수는 「큰 말을 싼 말로 잡기」부터 정렬',
      '설명 화면이면 왼쪽 깊이 1 · 오른쪽 정지 탐색을 같은 판에서 나란히',
    ],
    done: [
      '왼쪽(깊이 1)은 룩을 잡고 다음 수에 퀸을 잃어 평가가 +5 → −4 로 떨어진다',
      '오른쪽(정지 탐색)은 룩 줄을 끝까지 보고 −4 를 알아내 나이트(+3)를 고른다',
      '같은 깊이에서 정지 탐색을 켜면 공짜처럼 보이는 미끼에 덜 걸린다',
    ],
    code: {
      lang: 'ts',
      title: '정지 탐색 (알파베타 깊이 0 에서 부르기)',
      from: '새로 씀 (demos/demosGameAI.ts i345 견본 「잡기가 끝날 때까지 더 봄」과 같은 방식, 네가맥스 꼴)',
      body: `// 점수는 「지금 둘 차례」 기준 (네가맥스): 상대 점수 = -내 점수
function quiesce(s: Board, a: number, b: number, qdepth = 0): number {
  const standPat = evaluate(s);              // 안 잡고 여기서 멈춰도 이만큼
  if (standPat >= b) return b;               // 이미 상대가 허락 안 할 만큼 좋다
  if (standPat > a) a = standPat;
  if (qdepth >= 8) return a;                 // 잡기가 끝없이 이어지는 판 대비
  for (const m of captures(s).sort(mvvLva)) { // 큰 말을 싼 말로 잡는 수부터
    const v = -quiesce(play(s, m), -b, -a, qdepth + 1);
    if (v >= b) return b;
    if (v > a) a = v;
  }
  return a;
}

function alphaBeta(s: Board, depth: number, a: number, b: number): number {
  if (isOver(s)) return terminalScore(s);
  if (depth === 0) return quiesce(s, a, b);  // 평가 대신 조용해질 때까지 더
  for (const m of moves(s)) {
    const v = -alphaBeta(play(s, m), depth - 1, -b, -a);
    if (v >= b) return b;
    if (v > a) a = v;
  }
  return a;
}`,
    },
    pitfalls: [
      { title: 'stand pat 없이 잡기를 강제하면 손해 보는 잡기까지 하게 된다', fix: '「안 잡고 멈춤」의 평가값을 기본으로 두고 잡기가 더 좋을 때만 바꾼다.' },
      { title: '정지 탐색에 상한이 없으면 잡기가 이어지는 판에서 멈추지 않는다', fix: 'qdepth 상한(8 정도)을 둔다.' },
      { title: '장군 · 진급 같은 큰 수를 빼면 여전히 수평선 착각이 남는다', fix: '게임에 따라 「장군 피하기」 · 「승급」도 정지 탐색에 넣는다.' },
    ],
    prev: ['i341', 'i346'],
    next: ['i344'],
    refs: [
      { name: 'Chessprogramming wiki — Quiescence Search', url: 'https://www.chessprogramming.org/Quiescence_Search' },
      { name: 'Wikipedia — Horizon effect', url: 'https://en.wikipedia.org/wiki/Horizon_effect' },
    ],
  },

  i346: {
    id: 'i346',
    summary: '판 점수를 「가운데 × w₁ + 내 3줄 × w₂ − 상대 3줄 × w₃」 처럼 특징 × 가중치의 합으로 매겨, 가중치만 바꿔도 AI 성격이 달라지게 한다.',
    terms: [
      { en: 'Evaluation function (weighted features)', ko: '판의 좋음 = 특징 값 × 가중치의 합' },
      { en: 'Feature: center control · threats', ko: '가운데 차지 · 4칸 창 안의 내 3개 + 빈칸 1' },
      { en: 'Sliding windows (4 in a row)', ko: '가로 · 세로 · 두 대각선 4칸 창 모두 훑기' },
    ],
    goal: '{target}의 판 평가 함수를 특징 × 가중치 합으로 만들어 줘 — 가중치 슬라이더로 AI 성격이 바뀌게. 분위기는 {style}.',
    targets: ['커넥트4', '오목 · 오델로', '체스 (말 값 + 위치)'],
    styles: ['칸마다 점수 막대가 오르내리는 설명', '보이지 않게 두는 AI', '성격이 다른 AI 여럿 (공격형 · 수비형)'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 함수 — 가중치는 ScriptableObject 로 두면 인스펙터에서 AI 성격을 바꿀 수 있다.',
      godot: 'GDScript 로 같은 함수 — 가중치는 @export 변수 · Resource 로.',
    },
    principle: [
      '판을 숫자 몇 개(특징)로 요약한다: 가운데 줄 점수(열마다 0 · 1 · 2 · 3 · 2 · 1 · 0), 내 3줄 수, 상대 3줄 수.',
      '「3줄」 = 가로 · 세로 · 두 대각선 4칸 창 가운데 한쪽 말 3개 + 빈칸 1개인 창의 수.',
      '수 하나를 둬 본 판마다 점수 = 가운데 × w₁ + 내 3줄 × 3 × w₂ − 상대 3줄 × 3 × w₃ 을 매기고 가장 큰 칸을 고른다.',
      '가중치가 성격이다: w₁ 크면 가운데 욕심, w₂ 크면 공격, w₃ 크면 막기. 견본은 (1, 0.15, 0.1) → (0.25, 1, 0.1) → (0.2, 0.3, 1) 을 오가며 고르는 칸이 바뀐다.',
    ],
    when: ['끝까지 다 볼 수 없는 게임에서 깊이 끝 판을 점수로 바꿀 때 (알파베타 · 정지 탐색과 함께)', '난이도 · 성격이 다른 AI 를 여럿 만들 때'],
    avoid: ['끝까지 볼 수 있는 작은 게임 — 승 · 무 · 패면 충분(i340)', '좋은 특징을 모를 때 — 평가 없이 강해지는 몬테카를로 트리 탐색(i347)'],
    cost: 'light',
    costNote: '커넥트4 4칸 창 69개 × 4칸 훑기 = 수백 번. 탐색 잎마다 부르니 탐색 비용의 대부분 — 미리 창 목록을 만들어 둔다.',
    level: 1,
    must: [
      '4칸 창 목록은 처음에 한 번만 만든다 (가로 · 세로 · 두 대각선)',
      '점수는 늘 AI 기준 하나로 (상대 특징은 빼기)',
      '가중치 3개 슬라이더 + 칸마다 점수 막대 + 고른 칸 금빛',
      '고른 까닭(가운데 차지 · 내 3줄 만들기 · 상대 4줄 막기)을 한 줄로 보여 주기',
    ],
    done: [
      '가중치를 바꾸면 칸마다 점수 막대가 오르내리고 고르는 칸(금빛)이 바뀐다',
      'w₃ 를 키우면 상대 3줄을 막는 칸을, w₁ 을 키우면 가운데를 고른다',
      '같은 판에서 결과가 늘 같다 (무작위 없음)',
    ],
    code: {
      lang: 'ts',
      title: '커넥트4 평가 — 4칸 창 훑기 + 가중치 합',
      from: 'demos/demosGameAI.ts I346 의 windows · count3 · scores 를 정리',
      body: `// B[c][r]: 7열 × 6줄 (r = 0 아래), 0 빈칸 · 1 나 · 2 상대
const colW = [0, 1, 2, 3, 2, 1, 0];                    // 가운데일수록 좋다
const windows: [number, number][][] = [];
for (let c = 0; c < 7; c++) for (let r = 0; r < 6; r++)
  for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]] as [number, number][]) {
    const w: [number, number][] = [];
    for (let k = 0; k < 4; k++) w.push([c + dc * k, r + dr * k]);
    if (w.every(([a, b]) => a >= 0 && a < 7 && b >= 0 && b < 6)) windows.push(w);
  }

/** 한쪽 말 3개 + 빈칸 1개인 4칸 창의 수 */
function count3(B: number[][], who: number): number {
  let n = 0;
  for (const w of windows) {
    let m = 0, e = 0;
    for (const [a, b] of w) { const v = B[a]![b]!; if (v === who) m++; else if (v === 0) e++; }
    if (m === 3 && e === 1) n++;
  }
  return n;
}

/** 열 c 에 둬 본 판의 점수 (w = [가운데, 내 3줄, 상대 3줄]) */
function scoreMove(B: number[][], c: number, w: [number, number, number]): number {
  const row = B[c]!.indexOf(0);
  if (row < 0) return -Infinity;                       // 꽉 찬 열
  const nb = B.map((col) => col.slice());
  nb[c]![row] = 1;
  return colW[c]! * w[0] + count3(nb, 1) * 3 * w[1] - count3(nb, 2) * 3 * w[2];
}`,
    },
    pitfalls: [
      { title: '특징 값의 크기가 제각각이면 가중치가 뜻대로 안 먹힌다', fix: '특징을 비슷한 크기로 맞춘다 — 견본은 3줄 수에 3 을 곱해 가운데(0~3)와 맞췄다.' },
      { title: '내 3줄만 세면 상대 4줄을 못 막는다', fix: '상대 위협을 빼는 항을 꼭 넣는다 (w₃).' },
      { title: '평가 함수만으로 두면 한 수 앞만 본다', fix: '알파베타(i341)의 잎에서 이 점수를 쓰면 몇 수 앞까지 같은 성격으로 본다.' },
    ],
    prev: ['i340'],
    next: ['i341', 'i345', 'i358'],
    refs: [{ name: 'Chessprogramming wiki — Evaluation', url: 'https://www.chessprogramming.org/Evaluation' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'I346' }],
  },

  i347: {
    id: 'i347',
    summary: '고르기 → 펼치기 → 끝까지 아무렇게나 둬 보기 → 결과 올리기를 수백 번 되풀이해, 평가 함수 없이도 많이 이긴 가지를 찾고 방문 수로 수를 고른다.',
    terms: [
      { en: 'Monte Carlo tree search (MCTS)', ko: '무작위로 끝까지 둬 본 결과로 자라는 탐색 나무' },
      { en: 'UCT (UCB1 for trees)', ko: '승률 + C × √(ln 부모 방문 / 내 방문) 가 큰 자식 고르기' },
      { en: 'Selection · expansion · simulation · backpropagation', ko: '고르기 · 펼치기 · 끝까지 두기 · 결과 올리기' },
      { en: 'Exploration constant C', ko: '클수록 덜 가 본 가지도 넓게 본다' },
    ],
    goal: '{target}의 AI 를 몬테카를로 트리 탐색(UCT)으로 만들어 줘 — 평가 함수 없이. 분위기는 {style}.',
    targets: ['틱택토 · 헥스 · 하바나', '도트 앤 박스 · 바둑 꼴', '탐색 나무가 자라는 설명 화면'],
    styles: ['많이 이긴 가지가 굵게 자라는 설명', '보이지 않게 두는 AI', '반복 횟수로 난이도를 나눈 AI'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 노드 클래스. 반복을 시간만큼(Stopwatch) 돌리고 Task.Run 으로 화면 밖에서.',
      godot: 'GDScript 로 같은 노드 클래스(RefCounted). 반복은 WorkerThreadPool 에서 시간만큼.',
    },
    principle: [
      '① 고르기: 뿌리에서 「다 펼친 마디」를 따라 UCT 값 = W/N + C·√(ln N부모 / N) 가 가장 큰 자식으로 내려간다 (견본 C = 1.2).',
      '② 펼치기: 아직 안 둬 본 수가 있는 마디에서 그 수 하나로 새 자식을 만든다.',
      '③ 끝까지 아무렇게나: 새 마디 판에서 무작위로 끝까지 둬 승 · 무 · 패를 얻는다 (평가 함수가 필요 없다).',
      '④ 올리기: 지나온 길의 마디마다 N + 1, 그 마디로 둔 사람이 이겼으면 W + 1 (무승부 0.5).',
      '다 돌면 뿌리 자식 중 방문 수 N 이 가장 큰 수를 둔다 — 견본은 700번 반복하며 칸마다 방문 수를 보여 준다.',
    ],
    when: ['좋은 평가 함수를 만들기 어려운 게임 (헥스 · 바둑 꼴 · 하바나)', '생각 시간(반복 수)만으로 난이도를 나눌 때'],
    avoid: ['한 수 실수가 바로 지는 날카로운 전술 게임(체스) — 알파베타 + 평가가 더 정확', '끝까지 두는 데 아주 오래 걸리는 게임 — 무작위 대국을 짧게 끊고 평가로 대신'],
    cost: 'medium',
    costNote: '반복 1번 = 고르기(깊이만큼) + 무작위 끝까지 두기. 틱택토 700번은 순식간, 헥스 11×11 은 수만 번이 필요해 워커에서 0.5~1초.',
    level: 2,
    must: [
      'W 는 「그 마디로 수를 둔 사람」 기준으로 올린다 (차례마다 관점이 바뀐다)',
      '마지막 선택은 승률이 아니라 방문 수 N 이 가장 큰 수',
      '반복은 횟수가 아니라 시간 예산으로 끊을 수 있게',
      '탐험 상수 C 슬라이더(0.2~3) · 반복 수 표시 · 칸마다 방문 수',
      '난수는 시드를 줄 수 있게 (시험 재현)',
    ],
    done: [
      '반복이 쌓일수록 좋은 수 쪽 가지가 굵고 깊게 자라고, 그 칸 방문 수가 가장 커진다',
      'C 를 크게 하면 나무가 넓게, 작게 하면 좁고 깊게 자란다',
      '틱택토에서 700번 반복한 AI 가 지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: 'UCT 한 번 — 고르기 · 펼치기 · 끝까지 · 올리기',
      from: 'demos/demosGameAI.ts I347 의 iterate() 를 정리',
      body: `interface MC { b: number[]; mover: number; move: number; kids: MC[]; untried: number[]; N: number; W: number }
let Cexp = 1.2;

function iterate(root: MC): void {
  let n = root;
  const path: MC[] = [root];
  // ① 고르기: 다 펼친 마디는 UCT 가 큰 자식으로
  while (!n.untried.length && n.kids.length) {
    let best = n.kids[0]!, bv = -Infinity;
    for (const k of n.kids) {
      const v = k.W / k.N + Cexp * Math.sqrt(Math.log(n.N) / k.N);
      if (v > bv) { bv = v; best = k; }
    }
    n = best;
    path.push(n);
  }
  // ② 펼치기: 안 둬 본 수 하나
  if (n.untried.length) {
    const m = n.untried.pop()!;
    const nb = n.b.slice();
    nb[m] = n.mover;
    const c = mkNode(nb, 3 - n.mover, m);
    n.kids.push(c);
    n = c;
    path.push(n);
  }
  // ③ 끝까지 아무렇게나
  const b = n.b.slice();
  let mover = n.mover;
  let res = win(b);                                   // 0 진행 · 1 · 2 · 3 무승부
  while (!res) {
    const em = legal(b);
    b[em[Math.floor(Math.random() * em.length)]!] = mover;
    mover = 3 - mover;
    res = win(b);
  }
  // ④ 올리기: 그 마디로 「둔 사람」 기준 승 1 · 무 0.5
  for (const p of path) {
    p.N++;
    const justMoved = 3 - p.mover;
    p.W += res === 3 ? 0.5 : res === justMoved ? 1 : 0;
  }
}
// 다 돌면: root.kids 중 N 이 가장 큰 수를 둔다`,
    },
    pitfalls: [
      { title: 'W 를 늘 뿌리 기준으로 올리면 상대 차례에서도 내게 좋은 수를 고른다', fix: '마디마다 「그 마디로 둔 사람」 기준으로 올린다.' },
      { title: '마지막에 승률이 가장 높은 수를 고르면 두세 번 운 좋은 수를 고른다', fix: '방문 수 N 이 가장 큰 수 — 많이 확인된 수.' },
      { title: '반복 수가 적으면 뻔한 실수를 한다', fix: '틱택토도 수백 번은 필요. 바로 이기는 수 · 바로 막을 수는 먼저 검사하면 적은 반복에서도 단단하다.' },
    ],
    prev: ['i340'],
    next: ['i358', 'i359'],
    refs: [{ name: 'Wikipedia — Monte Carlo tree search', url: 'https://en.wikipedia.org/wiki/Monte_Carlo_tree_search' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'I347' }],
  },

  i348: {
    id: 'i348',
    summary: '주사위 마디는 나올 수 있는 결과마다 확률을 곱해 평균을 내서, 「굴릴까 · 멈출까」를 기대 점수로 비교한다.',
    terms: [
      { en: 'Expectimax (chance nodes)', ko: '내 마디 최댓값 · 주사위 마디 확률 평균' },
      { en: 'Expected value', ko: '결과 × 확률의 합' },
      { en: 'Pig dice hold/roll decision', ko: '돼지 주사위 — 이번 판 점수를 지킬까 더 굴릴까' },
    ],
    goal: '{target}의 AI 에 기대값 탐색을 넣어 줘 — 주사위 마디는 확률 평균으로. 분위기는 {style}.',
    targets: ['돼지 주사위 (굴리기 · 멈추기)', '야찌 · 주사위 포커', '백개먼'],
    styles: ['확률 나무와 그래프로 보여 주는 설명', '보이지 않게 두는 AI', '모험형 · 조심형 AI 여럿'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 재귀 — 주사위 마디는 결과마다 확률 × 값을 더한다.',
      godot: 'GDScript 로 같은 재귀 함수.',
    },
    principle: [
      '나무에 마디가 세 종류: 내 선택(최댓값), 상대 선택(최솟값), 주사위(확률 평균).',
      '돼지 주사위: 이번 판에 쌓은 점수 T. 「멈추기」 = T 를 확정. 「굴리기」 = 1 이 나오면 이번 판 0, 2~6 이면 T + 눈.',
      '굴리기의 기대값 = (0 + (T+2) + (T+3) + (T+4) + (T+5) + (T+6)) / 6 = (5T + 20) / 6.',
      '이게 T 보다 크려면 T < 20 — 「이번 판 20점이 될 때까지 굴려라」 규칙이 계산으로 나온다 (한 번 굴리기만 볼 때).',
    ],
    when: ['주사위 · 카드 뽑기처럼 운이 섞인 게임', '「위험을 감수할까」를 수학으로 보여 주는 설명'],
    avoid: ['운이 없는 게임 — 미니맥스 · 알파베타(i340 · i341)', '결과 가지가 아주 많은 주사위 여러 개 — 깊이를 줄이거나 몬테카를로 표본으로'],
    cost: 'light',
    costNote: '주사위 마디마다 결과 수(6)배로 가지가 는다. 한두 수 앞은 순식간, 깊어지면 표로 미리 계산(동적 계획).',
    level: 1,
    must: [
      '주사위 마디는 최대 · 최소가 아니라 확률 × 값의 합',
      '확률은 결과마다 정확히 (공정한 주사위 1/6, 두 주사위 합은 1/36 ~ 6/36)',
      '목표 점수 · 상대 점수가 있으면 「이길 확률」을 값으로 쓰는 쪽이 더 정확하다고 밝히기',
      '설명 화면: 쌓은 점수 T 슬라이더 + 굴리기 · 멈추기 기대값 그래프(교차점 20)',
    ],
    done: [
      'T 가 20 보다 작으면 「굴리기!」, 크면 「멈추기!」로 판정이 바뀐다',
      '여섯 눈의 값이 하나씩 켜지며 합 → ÷ 6 평균이 계산된다',
      '그래프에서 멈추기(대각선)와 굴리기(기울기 5/6 직선)가 T = 20 에서 만난다',
    ],
    code: {
      lang: 'ts',
      title: '기대값 탐색 — 돼지 주사위 굴리기 · 멈추기',
      from: 'demos/demosGameAI.ts I348 의 vals · roll 계산을 일반 꼴로 (재귀 부분은 새로 씀)',
      body: `/** 한 번만 굴려 볼 때: 굴리기 기대값 vs 멈추기 */
function rollOrHold(T: number): 'roll' | 'hold' {
  const vals = [0, T + 2, T + 3, T + 4, T + 5, T + 6];   // 눈 1 은 이번 판 0
  const roll = vals.reduce((a, b) => a + b, 0) / 6;      // = (5T + 20) / 6
  return roll > T ? 'roll' : 'hold';                     // T < 20 이면 굴리기
}

/** 몇 번 더 굴릴 수 있을 때: 기대값 탐색 (내 선택 = 최대, 주사위 = 평균) */
function bestValue(T: number, rollsLeft: number): number {
  if (rollsLeft === 0) return T;
  const hold = T;
  let roll = 0;
  for (let face = 1; face <= 6; face++) {
    const v = face === 1 ? 0 : bestValue(T + face, rollsLeft - 1);
    roll += v / 6;                                       // 확률 1/6 씩
  }
  return Math.max(hold, roll);                           // 내 마디는 더 좋은 쪽
}`,
    },
    pitfalls: [
      { title: '주사위 마디를 최솟값으로 두면 AI 가 겁쟁이가 된다', fix: '주사위는 적이 아니다 — 확률 평균으로 계산한다.' },
      { title: '점수 기대값만 보면 지고 있을 때도 조심스럽다', fix: '목표가 있는 게임은 「이길 확률」을 값으로 쓰면 지고 있을 때 더 과감해진다.' },
      { title: '같은 상태를 재귀로 계속 다시 계산한다', fix: '(T, 남은 횟수) 를 열쇠로 결과를 기억한다 (동적 계획).' },
    ],
    prev: ['i340'],
    next: ['i349'],
    refs: [{ name: 'Wikipedia — Expectiminimax', url: 'https://en.wikipedia.org/wiki/Expectiminimax' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'I348' }],
  },

  i349: {
    id: 'i349',
    summary: '끝난 자리부터 거꾸로 — 지는 칸으로 갈 수 있으면 이기는 칸, 모든 수가 이기는 칸으로만 가면 지는 칸 — 으로 모든 자리의 승패 표를 만든다.',
    terms: [
      { en: 'Retrograde analysis', ko: '끝에서 거꾸로 모든 자리의 승패 정하기' },
      { en: 'P-position / N-position', ko: '지는 자리(앞사람 승) · 이기는 자리(둘 차례 승)' },
      { en: 'Wythoff game', ko: '퀸을 왼쪽 · 아래 · 왼아래로 옮겨 구석에 넣는 게임' },
    ],
    goal: '{target}의 모든 자리 승패를 끝에서 거꾸로 푸는 후퇴 분석으로 구해 줘. 분위기는 {style}.',
    targets: ['퀸 구석으로 (위토프 게임)', '님 꼴 게임 · 고누', '작은 판 끝내기 표'],
    styles: ['칸이 하나씩 금빛 · 초록으로 칠해지는 설명', '보이지 않게 완벽하게 두는 AI', '규칙(황금비)을 발견하는 수학 체험'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 반복문 — 결과는 byte[] 표로 저장해 두고 게임에서 읽기만.',
      godot: 'GDScript 로 같은 반복문 — 결과는 PackedByteArray 로.',
    },
    principle: [
      '끝난 자리(더 둘 수 없음 = 앞사람이 이김)는 「지는 칸」이다 — 견본은 구석 (0, 0).',
      '구석에서 가까운 칸부터(x + y 가 작은 순) 차례로: 한 번에 갈 수 있는 칸 중 지는 칸이 하나라도 있으면 「이기는 칸」 — 거기로 가면 된다.',
      '갈 수 있는 칸이 모두 이기는 칸이면 「지는 칸」.',
      '모든 칸을 정하면 완벽한 AI 가 된다: 이기는 칸에선 지는 칸으로 옮기기만 하면 된다.',
      '위토프 게임의 지는 칸은 기울기 φ ≈ 1.618 과 1/φ 두 선 위에 늘어선다 — 견본은 다 풀고 그 선을 그린다.',
    ],
    when: ['자리 수가 표로 담길 만큼 작은 게임 (수천 ~ 수백만)', '「이기는 규칙」을 발견하는 수학 체험'],
    avoid: ['자리 수가 너무 큰 게임 — 탐색 AI(i341 · i347)', '수가 순환하는 게임(같은 자리로 돌아옴) — 「모든 자식이 정해질 때까지」 세는 방식으로 바꿔야 한다'],
    cost: 'light',
    costNote: '칸마다 갈 수 있는 수를 한 번씩 본다. 18×11 판 = 198칸 × 최대 수십 수 — 순식간. 결과 표는 미리 구워 둘 수 있다.',
    level: 2,
    must: [
      '순서가 핵심: 어떤 칸을 정할 때 그 칸에서 갈 수 있는 칸은 이미 다 정해져 있어야 한다 (견본은 x + y 순)',
      '이기는 칸마다 「어디로 가면 되는지」(목표 칸)도 저장',
      '설명 화면: 칸이 하나씩 정해지는 애니메이션 + 지금 칸에서 갈 수 있는 길 + 다 풀면 규칙선',
      '판 크기 슬라이더 (견본 가로 10~34)',
    ],
    done: [
      '구석(⌂)부터 대각선 순으로 칸이 금빛(지는 칸) · 초록(이기는 칸)으로 칠해진다',
      '이기는 칸에서 금빛 칸으로 가는 화살표가 늘 하나 이상 있다',
      '다 풀면 금빛 칸이 φ 기울기 두 선 위에 놓인 것이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '퀸 구석으로 — 구석부터 거꾸로 승패 표 만들기',
      from: 'demos/demosGameAI.ts I349 의 build() 를 정리',
      body: `// stat: 0 모름 · 1 이기는 칸 · 2 지는 칸, target: 이기는 칸에서 갈 지는 칸
function solveWythoff(W: number, H: number): { stat: Int8Array; target: Int32Array } {
  const stat = new Int8Array(W * H);
  const target = new Int32Array(W * H).fill(-1);
  // 구석에서 가까운 순 (x + y 가 작은 칸부터) — 갈 수 있는 칸은 늘 먼저 정해져 있다
  for (let s = 0; s < W + H; s++) for (let x = 0; x < W; x++) {
    const y = s - x;
    if (y < 0 || y >= H) continue;
    const id = y * W + x;
    let tg = -1;
    for (let k = 1; k <= Math.max(x, y) && tg < 0; k++) {
      if (x - k >= 0 && stat[y * W + x - k] === 2) tg = y * W + x - k;                         // 왼쪽
      else if (y - k >= 0 && stat[(y - k) * W + x] === 2) tg = (y - k) * W + x;                 // 아래
      else if (x - k >= 0 && y - k >= 0 && stat[(y - k) * W + x - k] === 2) tg = (y - k) * W + x - k; // 왼아래
    }
    stat[id] = tg >= 0 ? 1 : 2;     // 지는 칸으로 갈 수 있으면 이기는 칸, 아니면 지는 칸 (구석 = 지는 칸)
    target[id] = tg;
  }
  return { stat, target };
}
// AI: stat[지금] === 1 이면 target[지금] 으로 옮긴다. 2 면 아무 수나 (지는 자리)`,
    },
    pitfalls: [
      { title: '칸을 아무 순서로 정하면 아직 모르는 칸을 「지는 칸 아님」으로 착각한다', fix: '갈 수 있는 칸이 모두 먼저 정해지는 순서(여기선 x + y)로 돈다.' },
      { title: '수가 순환하는 게임에 그대로 쓰면 틀린다', fix: '「아직 안 정해진 자식 수」를 세어 0 이 되면 지는 칸으로 정하는 큐 방식으로 바꾼다.' },
      { title: '지는 자리에서 AI 가 늘 같은 수를 둔다', fix: '지는 자리에선 상대가 실수할 여지가 큰 수(오래 버티는 수)를 고르면 더 사람 같다.' },
    ],
    prev: ['i340'],
    next: ['i350'],
    refs: [
      { name: 'Wikipedia — Retrograde analysis', url: 'https://en.wikipedia.org/wiki/Retrograde_analysis' },
      { name: 'Wikipedia — Wythoff’s game', url: 'https://en.wikipedia.org/wiki/Wythoff%27s_game' },
    ],
    source: [{ file: 'demosGameAI.ts', symbol: 'I349' }],
  },

  i350: {
    id: 'i350',
    summary: '더미 크기를 이진수로 써서 자리마다 XOR 한 님합이 0 이면 지는 자리 — 님합을 0 으로 만드는 수를 두면 늘 마지막 돌을 가져간다.',
    terms: [
      { en: 'Nim-sum (bitwise XOR)', ko: '더미 크기들의 XOR — 자리마다 1 의 개수가 짝수면 0' },
      { en: 'Bouton’s theorem', ko: '님합 0 = 지는 자리, 0 아님 = 이기는 자리' },
      { en: 'Sprague–Grundy number', ko: '님 꼴 게임을 님 더미 하나로 바꾼 값 (그런디 수)' },
    ],
    goal: '{target}의 AI 를 님합(이진수 XOR)으로 만들어 줘 — 이기는 수를 바로 찾게. 분위기는 {style}.',
    targets: ['님 (돌 더미 4개)', '님 꼴 게임 (그런디 수)', '이진수 설명 화면'],
    styles: ['이진수 표로 자리마다 1 을 세는 설명', '보이지 않게 완벽하게 두는 AI', '돌을 집어 가는 연출'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 은 ^ 연산자로 같은 계산 (int).',
      godot: 'GDScript 도 ^ 가 비트 XOR.',
    },
    principle: [
      '더미 크기를 이진수로 쓰고 자리(1 · 2 · 4 …)마다 1 의 개수를 센다. 모든 자리가 짝수면 님합 = 0.',
      '님합이 0 인 자리에서 어떤 수를 둬도 0 이 아니게 된다. 0 이 아닌 자리에서는 늘 0 으로 만드는 수가 있다.',
      '이기는 수: X = 님합. 크기 h 가 h XOR X < h 인 더미를 찾아 h XOR X 개만 남긴다.',
      '그래서 님합 0 을 상대에게 넘기는 쪽이 끝까지 그렇게 할 수 있고, 마지막 돌을 가져간다.',
      '다른 님 꼴 게임도 자리마다 그런디 수(갈 수 있는 자리 값에 없는 가장 작은 수)를 구해 같은 XOR 로 합친다.',
    ],
    when: ['님 · 님 꼴 게임의 완벽한 AI', '이진수 · XOR 을 게임으로 가르칠 때'],
    avoid: ['님 꼴이 아닌 게임 — 후퇴 분석(i349)이나 탐색', '아이용 쉬운 난이도 — 늘 완벽하면 못 이긴다. 온도 실수(i358)를 섞는다'],
    cost: 'light',
    costNote: 'XOR 몇 번. 비용 없음.',
    level: 1,
    must: [
      '이기는 수 찾기는 h XOR X < h 인 더미 — 더미를 h XOR X 개로 줄인다',
      '님합이 0 이면 (지는 자리) 무작위로 조금만 가져가 시간을 끈다',
      '설명 화면: 더미마다 이진수 줄, 자리마다 1 의 개수 짝 · 홀 표시, 님합 0 이 되는 순간 강조',
      '마지막 돌을 가져가는 쪽이 이기는지(보통 님) 지는지(미제르 님) 규칙을 분명히',
    ],
    done: [
      'AI 차례가 지나면 이진수 표의 모든 자리가 짝수(님합 0)가 된다',
      '처음 님합이 0 이 아니면 AI 가 늘 마지막 돌을 가져간다',
      '「새 판」을 눌러도 같은 규칙으로 이긴다',
    ],
    code: {
      lang: 'ts',
      title: '님합으로 이기는 수 찾기',
      from: 'demos/demosGameAI.ts I350 의 gen() 을 정리',
      body: `/** 더미들(hs)에서 둘 수: 어느 더미를 몇 개로 줄일지 */
function nimMove(hs: number[]): { heap: number; to: number } {
  const X = hs.reduce((a, b) => a ^ b, 0);             // 님합
  if (X) {
    const heap = hs.findIndex((v) => (v ^ X) < v);     // 늘 하나는 있다
    return { heap, to: hs[heap]! ^ X };                 // 이렇게 두면 님합 = 0
  }
  // 님합 0 = 지는 자리: 아무 더미에서 조금 가져가며 상대 실수를 기다린다
  const ne = hs.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const heap = ne[Math.floor(Math.random() * ne.length)]!;
  return { heap, to: Math.floor(Math.random() * hs[heap]!) };
}

// 예) [3, 5, 6] → 3 ^ 5 ^ 6 = 0 (지는 자리), [3, 4, 5] → X = 2, 3 ^ 2 = 1 → 첫 더미를 1 개로`,
    },
    pitfalls: [
      { title: '더하기로 님합을 구하면 틀린다', fix: '자리 올림이 없는 XOR 이어야 한다 — 「자리마다 1 의 개수가 짝수인가」.' },
      { title: '미제르 님(마지막 돌을 가져가면 짐)에 그대로 쓰면 끝에서 진다', fix: '더미가 모두 1 개 이하가 되는 순간만 규칙을 뒤집는다 (1 짜리 더미 수를 홀수로 남기기).' },
      { title: '늘 완벽하게 두면 아이들이 금방 그만둔다', fix: '난이도별로 일정 확률로 아무 수나 두게 한다 (i358).' },
    ],
    prev: ['i349'],
    next: ['i358'],
    refs: [
      { name: 'Wikipedia — Nim', url: 'https://en.wikipedia.org/wiki/Nim' },
      { name: 'Wikipedia — Sprague–Grundy theorem', url: 'https://en.wikipedia.org/wiki/Sprague%E2%80%93Grundy_theorem' },
    ],
    source: [{ file: 'demosGameAI.ts', symbol: 'I350' }],
  },

  i354: {
    id: 'i354',
    summary: '처음 판에서 한 번 · 두 번 … 움직여 닿는 판을 겹겹이 넓혀 가서, 목표 판에 처음 닿은 겹이 가장 짧은 풀이가 되게 한다.',
    terms: [
      { en: 'Breadth-first search (BFS)', ko: '가까운 판부터 겹겹이 넓혀 가는 탐색' },
      { en: 'State space', ko: '퍼즐이 될 수 있는 모든 판 — 마디 = 판, 가지 = 한 번 움직임' },
      { en: 'Visited set · parent links', ko: '이미 본 판은 건너뛰기 · 어디서 왔는지 기록해 길 되짚기' },
    ],
    goal: '{target}을(를) 너비 우선 탐색으로 풀어 줘 — 가장 짧은 풀이와 겹마다 판 수를 보여 주게. 분위기는 {style}.',
    targets: ['2×3 슬라이딩 퍼즐', '주차장 탈출 · 장난감 상자', '퍼즐 판 만들기 (가장 먼 판 찾기)'],
    styles: ['겹이 동심원처럼 퍼지는 설명', '보이지 않게 힌트를 주는 풀이기', '금빛 길을 따라 퍼즐이 풀리는 연출'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 은 Queue<T> + HashSet<T> (판을 문자열이나 long 으로 묶어 열쇠로).',
      godot: 'GDScript 는 Array 를 큐로(앞 인덱스만 늘리기) + Dictionary 를 방문 표로.',
    },
    principle: [
      '처음 판을 큐에 넣는다. 큐에서 판을 하나씩 꺼내, 한 번 움직여 갈 수 있는 판 중 처음 보는 것만 큐 뒤에 넣는다.',
      '그러면 큐에는 「0번 움직인 판 → 1번 → 2번 …」 순서로 쌓인다 — 겹(깊이)이 고르게 넓어진다.',
      '목표 판이 처음 나온 순간의 겹 수 = 가장 적은 움직임 수. 부모 기록을 따라 거꾸로 가면 풀이 길.',
      '목표에서 거꾸로 한 번 돌리면(견본 SL_DIST) 모든 판까지의 거리 표가 생겨 — 판 만들기(가장 먼 판 고르기) · 힌트에 쓴다.',
    ],
    when: ['움직임 한 번 비용이 모두 같은 퍼즐 (주차장 · 장난감 상자 · 얼음 별 · 창고지기)', '가장 짧은 풀이 · 힌트 · 「몇 수 만에 풀 수 있나」가 필요할 때'],
    avoid: ['판 수가 수억이 넘는 퍼즐 — A* (거리 짐작) 나 양쪽에서 탐색', '움직임마다 비용이 다를 때 — 다익스트라'],
    cost: 'light',
    costNote: '본 판 수만큼 메모리. 2×3 퍼즐 360판, 주차장 단계는 수만 판 — 판을 짧은 문자열 · 정수로 묶어야 가볍다.',
    level: 1,
    must: [
      '방문 표(Set)로 같은 판을 두 번 넣지 않는다',
      '큐는 shift() 대신 앞 인덱스만 늘려 쓴다 (shift 는 느리다)',
      '판은 문자열 · 정수 열쇠로 묶는다',
      '부모 기록으로 풀이 길을 되짚기',
      '설명 화면: 겹마다 판 수 막대 + 처음 판(가운데)에서 겹이 퍼지는 그림 + 금빛 풀이 길',
    ],
    done: [
      '찾은 풀이의 움직임 수가 거리 표(목표에서 거꾸로 BFS)의 값과 같다',
      '겹마다 판 수 막대가 보이고 목표에 닿은 겹에서 멈춘다',
      '금빛 길을 따라 퍼즐이 실제로 풀린다',
    ],
    code: {
      lang: 'ts',
      title: '2×3 슬라이딩 퍼즐 너비 우선 풀이',
      from: 'demos/demosGameAI.ts slNext() · I354 gen() 을 정리',
      body: `const GOAL = '123450';                       // 0 = 빈칸
function next(s: string): string[] {
  const z = s.indexOf('0'), r = Math.floor(z / 3), c = z % 3;
  const out: string[] = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as [number, number][]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr > 1 || nc < 0 || nc > 2) continue;
    const j = nr * 3 + nc, a = s.split('');
    a[z] = a[j]!; a[j] = '0';
    out.push(a.join(''));
  }
  return out;
}

function solve(start: string): string[] | null {
  const parent = new Map<string, string | null>([[start, null]]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {        // shift 대신 인덱스
    const s = q[i]!;
    if (s === GOAL) {
      const path: string[] = [];
      for (let p: string | null = s; p; p = parent.get(p)!) path.unshift(p);
      return path;                             // 처음 닿은 겹 = 가장 짧은 풀이
    }
    for (const n of next(s)) if (!parent.has(n)) { parent.set(n, s); q.push(n); }
  }
  return null;                                 // 닿지 못함 (풀 수 없는 판)
}`,
    },
    pitfalls: [
      { title: '방문 표 없이 넓히면 같은 판을 수없이 다시 넣어 멈춘다', fix: '넣을 때 바로 방문 표에 기록한다 (꺼낼 때가 아니라).' },
      { title: '큐를 shift() 로 꺼내면 판이 많을 때 느리다', fix: '배열 앞 인덱스만 늘린다 — 견본 for (i = 0; i < q.length; i++).' },
      { title: '판을 배열 그대로 열쇠로 쓰면 Set 이 같은 판을 못 알아본다', fix: '문자열 · 정수로 묶는다. 같은 크기 블록은 구별하지 않게 묶으면 판 수도 준다.', seen: true },
    ],
    next: ['i355', 'i344'],
    refs: [{ name: 'Wikipedia — Breadth-first search', url: 'https://en.wikipedia.org/wiki/Breadth-first_search' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'slNext' }],
  },

  i355: {
    id: 'i355',
    summary: '한 줄씩 안전한 칸에 여왕을 놓다가 놓을 곳이 없으면 바로 윗줄로 돌아가 다음 칸을 시도해, 모든 답을 빠짐없이 찾는다.',
    terms: [
      { en: 'Backtracking', ko: '놓아 보고 막히면 되돌아가 다음 칸' },
      { en: 'Eight queens puzzle', ko: '8×8 판에 서로 공격하지 않는 여왕 8개 (답 92가지)' },
      { en: 'Constraint check (column · diagonal)', ko: '같은 열 · 같은 대각선(|열 차| = 줄 차)이면 안 됨' },
    ],
    goal: '{target}을(를) 백트래킹으로 풀어 줘 — 놓기 · 되돌리기를 한 걸음씩 보여 주게. 분위기는 {style}.',
    targets: ['8 여왕 (공주 정원)', '스도쿠 꼴 숫자 채우기', '답이 하나뿐인 판 만들기'],
    styles: ['노려지는 칸을 빨갛게 보여 주는 설명', '보이지 않게 바로 푸는 풀이기', '한 걸음씩 · 열 걸음씩 넘겨 보기'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 재귀 — 화면에 보여 줄 땐 IEnumerator 코루틴으로 yield 하며 한 걸음씩.',
      godot: 'GDScript 재귀 — 한 걸음씩 보여 줄 땐 사건 목록을 만들어 재생.',
    },
    principle: [
      '줄 0 부터 한 줄에 하나씩 놓는다. 줄 r 에서 열 0 → n−1 을 차례로 보며 위 줄 여왕들과 같은 열 · 같은 대각선이 아니면 놓고 다음 줄로.',
      '대각선 검사: 줄 rr 의 여왕 열 cc 에 대해 |cc − c| = r − rr 이면 같은 대각선.',
      '다음 줄에서 놓을 곳이 하나도 없으면 돌아와(놓은 여왕을 빼고) 다음 열을 시도한다 — 이게 되돌아가기.',
      '맨 아래 줄까지 놓으면 답 하나. 계속하면 모든 답을 찾는다 (8칸 92가지). 견본은 답 3개까지 사건(놓기 · 빼기 · 답)을 기록해 재생한다.',
    ],
    when: ['조건을 만족하는 배치를 찾는 퍼즐 (여왕 · 스도쿠 · 노노그램 일부)', '「답이 하나뿐인가」 확인 — 답을 2개까지만 세기'],
    avoid: ['가장 짧은 움직임 풀이 — 너비 우선(i354)', '판이 아주 크고 조건이 느슨할 때 — 추론(줄 풀기)으로 먼저 칸을 확정하고 남은 것만 백트래킹'],
    cost: 'light',
    costNote: '8 여왕 모든 답 = 놓기 약 2,000번. 10칸도 순식간. 스도쿠 꼴은 빈칸이 많으면 「후보가 가장 적은 칸부터」로 줄인다.',
    level: 1,
    must: [
      '놓기 → 다음 줄 → 되돌릴 때 빼기를 대칭으로 (상태가 남지 않게)',
      '답 개수 상한을 받는다 (답 하나뿐 확인은 2 에서 멈춤)',
      '설명 화면: 놓기 · 빼기 사건 목록을 만들어 재생 (속도 조절), 노려지는 칸 표시',
      '판 크기 n 슬라이더 (견본 4~10)',
    ],
    done: [
      '여왕이 줄마다 놓이다 막히면 윗줄 여왕이 옆 칸으로 옮겨 가는 것이 보인다',
      '답을 찾으면 「해 찾음!」 과 함께 모든 여왕이 금빛',
      'n = 8 에서 답을 모두 세면 92',
    ],
    code: {
      lang: 'ts',
      title: 'n 여왕 백트래킹 (놓기 · 빼기 사건 기록)',
      from: 'demos/demosGameAI.ts queensEvents() 를 정리',
      body: `type QEv = { k: 'place' | 'remove' | 'sol'; r: number; c: number };

function queens(n: number, maxSol: number): { sols: number[][]; ev: QEv[] } {
  const ev: QEv[] = [];
  const cols: number[] = [];                  // cols[r] = 줄 r 여왕의 열
  const sols: number[][] = [];
  const safe = (r: number, c: number): boolean =>
    cols.every((cc, rr) => cc !== c && Math.abs(cc - c) !== r - rr);   // 같은 열 · 대각선 아님
  const go = (r: number): boolean => {
    if (r === n) {
      sols.push(cols.slice());
      ev.push({ k: 'sol', r: -1, c: -1 });
      return sols.length >= maxSol;           // 답 상한에 닿으면 멈춤
    }
    for (let c = 0; c < n; c++) {
      if (!safe(r, c)) continue;
      cols.push(c);
      ev.push({ k: 'place', r, c });
      if (go(r + 1)) return true;
      cols.pop();                              // 되돌아가기
      ev.push({ k: 'remove', r, c });
    }
    return false;
  };
  go(0);
  return { sols, ev };
}
// 답이 하나뿐인지: queens(n, 2).sols.length === 1`,
    },
    pitfalls: [
      { title: '되돌아갈 때 놓은 것을 안 빼면 다음 시도가 엉킨다', fix: 'push 와 pop 을 짝으로 — 돌아오면 상태가 들어가기 전과 같아야 한다.' },
      { title: '모든 답을 다 세면 큰 판에서 오래 걸린다', fix: '필요한 만큼만 (답 하나뿐 확인 = 2 개에서 멈춤).' },
      { title: '한 걸음씩 보여 주려고 재귀 안에서 기다리면 화면이 멈춘다', fix: '사건 목록을 먼저 다 만들고 화면은 그 목록을 재생한다 (견본 방식).' },
    ],
    prev: ['i354'],
    next: ['i356'],
    refs: [{ name: 'Wikipedia — Eight queens puzzle', url: 'https://en.wikipedia.org/wiki/Eight_queens_puzzle' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'queensEvents' }],
  },

  i356: {
    id: 'i356',
    summary: '「칸 i 를 누르면 어느 불이 바뀌나」를 0 · 1 표로 쓰고 덧셈 대신 XOR 로 줄을 지워 가면, 오른쪽 끝 열이 바로 「누를 칸」이 된다.',
    terms: [
      { en: 'Gaussian elimination over GF(2)', ko: '2 를 법으로 (1 + 1 = 0) 하는 가우스 소거' },
      { en: 'Lights Out as a linear system', ko: '불 끄기 = A·x = b 연립방정식 (x = 누를 칸)' },
      { en: 'Null space (free variables)', ko: '눌러도 불이 그대로인 누름 조합 — 답이 여럿일 때' },
    ],
    goal: '{target}을(를) 2 를 법으로 한 가우스 소거로 풀어 줘 — 누를 칸이 한 번에 나오게. 분위기는 {style}.',
    targets: ['불 끄기 (잠꾸러기 버섯 마을)', '켜고 끄는 퍼즐 힌트', '연립방정식 설명 화면'],
    styles: ['0 · 1 표의 줄이 XOR 로 지워지는 설명', '보이지 않게 힌트를 주는 풀이기', '누를 칸이 하나씩 빛나는 연출'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 은 행마다 bool[] 또는 ulong 비트 묶음 (25칸이면 ulong 하나로 XOR 한 번).',
      godot: 'GDScript 는 PackedByteArray 행이나 int 비트 묶음.',
    },
    principle: [
      '칸이 N 개면 N × (N + 1) 표: 행 i = 「칸 i 의 불을 바꾸는 누름들」(자기 + 위 · 아래 · 옆), 마지막 열 = 지금 칸 i 가 켜졌나.',
      '같은 칸을 두 번 누르면 없던 일이니 덧셈은 XOR(1 + 1 = 0) 이다.',
      '열마다: 그 열이 1 인 행을 찾아(없으면 자유 변수) 위로 올리고, 그 열이 1 인 다른 모든 행에 XOR 해서 지운다.',
      '끝나면 기준 행의 마지막 열이 그 칸을 누를지(1) 말지(0). 견본은 자유 변수를 0 으로 둔다 — 가장 적은 누름이 필요하면 자유 변수 조합(빈 공간)을 모두 넣어 보고 가장 적은 것을 고른다 (버섯 마을 logic.ts 방식).',
    ],
    when: ['불 끄기처럼 누르면 정해진 칸이 뒤집히는 퍼즐', '「선형 대수가 퍼즐을 푼다」 수학 설명'],
    avoid: ['누름 순서가 결과를 바꾸는 퍼즐 — 선형이 아니다. 너비 우선(i354)', '칸 수가 수천 개 — N³ 이 무겁다. 비트 묶음으로'],
    cost: 'light',
    costNote: 'N 칸이면 N³ 정도 XOR. 6×6 = 36칸이면 수만 번 — 순식간. 비트 묶음이면 행 XOR 이 한 번.',
    level: 2,
    must: [
      '덧셈 · 뺄셈 대신 XOR (2 를 법으로)',
      '기준 1 이 없는 열은 자유 변수로 표시하고 건너뛴다',
      '마지막에 어떤 행이 「0 = 1」 이면 풀 수 없는 판이라고 알린다',
      '가장 적은 누름이 필요하면 자유 변수 조합을 모두 시도',
      '설명 화면: 기준 · 줄 바꾸기 · XOR 사건을 한 단계씩, 판 크기 3~5',
    ],
    done: [
      '표의 줄이 하나씩 지워져 왼쪽이 계단 꼴이 되고 오른쪽 끝 열이 남는다',
      '그 열이 1 인 칸을 누르면 모든 불이 꺼진다',
      '자유 변수 조합을 넣은 풀이는 누름 수가 같거나 더 적다',
    ],
    code: {
      lang: 'ts',
      title: '불 끄기 — 2 를 법으로 가우스 소거',
      from: 'demos/demosGameAI.ts lightsPlan() 을 정리',
      body: `function solveLights(n: number, start: Uint8Array): Uint8Array | null {
  const N = n * n;
  const press = (b: Uint8Array, i: number): void => {
    const y = Math.floor(i / n), x = i % n;
    b[i] ^= 1;
    if (x > 0) b[i - 1] ^= 1;
    if (x < n - 1) b[i + 1] ^= 1;
    if (y > 0) b[i - n] ^= 1;
    if (y < n - 1) b[i + n] ^= 1;
  };
  // 행 i = 칸 i 의 불을 바꾸는 누름들 (대칭이라 「누름 i 가 바꾸는 칸」과 같은 꼴) | 지금 불
  const M: Uint8Array[] = [];
  for (let i = 0; i < N; i++) {
    const row = new Uint8Array(N + 1);
    press(row, i);                            // 앞 N 칸에 이웃 표시
    row[N] = start[i]!;
    M.push(row);
  }
  const pivRow = new Array<number>(N).fill(-1);
  let row = 0;
  for (let col = 0; col < N && row < N; col++) {
    let p = -1;
    for (let i = row; i < N; i++) if (M[i]![col]) { p = i; break; }
    if (p < 0) continue;                      // 자유 변수 (0 으로 둠)
    [M[p], M[row]] = [M[row]!, M[p]!];
    for (let i = 0; i < N; i++) {
      if (i === row || !M[i]![col]) continue;
      for (let j = 0; j <= N; j++) M[i]![j] ^= M[row]![j]!;   // 1 + 1 = 0
    }
    pivRow[col] = row++;
  }
  for (let i = row; i < N; i++) if (M[i]![N]) return null;      // 0 = 1 → 풀 수 없는 판
  const x = new Uint8Array(N);
  for (let col = 0; col < N; col++) if (pivRow[col]! >= 0) x[col] = M[pivRow[col]!]![N]!;
  return x;                                   // x[i] = 1 이면 칸 i 를 누른다
}`,
    },
    pitfalls: [
      { title: '보통 가우스 소거(빼기 · 나누기)를 쓰면 분수가 나와 틀린다', fix: '0 · 1 만 쓰는 XOR 이어야 한다 — 같은 칸 두 번 = 안 누름.' },
      { title: '자유 변수를 0 으로만 두면 가장 적은 누름이 아닐 수 있다', fix: '자유 변수 조합(2^k 가지)을 모두 넣어 보고 누름 수가 가장 적은 것을 고른다 (버섯 마을 방식).', seen: true },
      { title: '무작위로 불을 켠 판은 풀 수 없을 수 있다', fix: '판은 「무작위 칸을 눌러서」 만든다 — 견본처럼 누름으로 만든 판은 늘 풀린다.' },
    ],
    prev: ['i350'],
    next: ['i357'],
    refs: [{ name: 'Wikipedia — Lights Out (game)', url: 'https://en.wikipedia.org/wiki/Lights_Out_(game)' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'lightsPlan' }],
  },

  i357: {
    id: 'i357',
    summary: '물어볼 수마다 「대답별로 남는 후보 수」를 세어, 가장 나쁜 대답이 와도 후보가 가장 적게 남는 질문을 고른다.',
    terms: [
      { en: 'Minimax guessing (Knuth strategy)', ko: '최악의 대답에서 남는 후보 수를 가장 작게' },
      { en: 'Candidate partition (buckets)', ko: '대답(○S○B)마다 후보를 나눈 묶음' },
      { en: 'Mastermind-style deduction', ko: '대답으로 후보를 줄여 가는 추리 게임' },
    ],
    goal: '{target}의 컴퓨터가 미니맥스 추측으로 묻게 해 줘 — 가장 나쁜 대답에서도 후보가 가장 적게 남는 수를 부르게. 분위기는 {style}.',
    targets: ['숫자 야구 (504가지)', '가짜 동전 찾기 (저울)', '마스터마인드 꼴'],
    styles: ['대답별 묶음 막대로 보여 주는 설명', '보이지 않게 맞히는 AI', '후보가 줄어드는 연출'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 계산 — 후보는 int[] 로, 묶음은 길이 13 배열로 세면 빠르다.',
      godot: 'GDScript 로 같은 계산 — 묶음 세기는 PackedInt32Array.',
    },
    principle: [
      '숫자 야구: 1~9 서로 다른 세 자리 = 504 후보. 대답은 스트라이크 · 볼 (점수 = S × 4 + B 로 한 수에 묶음).',
      '부를 수 g 마다 남은 후보 c 전부와 비교해 「g 를 부르면 대답이 무엇일지」로 후보를 묶음(bucket)으로 나눈다.',
      '가장 큰 묶음 크기 = 그 질문의 최악. 최악이 가장 작은 g 를 부른다 — 같으면 후보 안의 수를 조금 더 좋게 (맞힐 수도 있으니, 견본 −0.5).',
      '진짜 대답이 오면 그 묶음만 남기고 되풀이. 후보가 많을 땐(120 넘게) 무작위 140개만 시험해 빠르게.',
    ],
    when: ['대답으로 후보를 줄여 가는 추리 게임 (숫자 야구 · 마스터마인드 · 저울)', '「가장 나쁜 경우를 줄인다」는 생각을 보여 주는 수학 설명'],
    avoid: ['평균 횟수를 줄이는 게 목표일 때 — 묶음 크기의 기댓값(또는 정보량)으로 고르기', '후보가 수백만 — 일부만 표본으로 시험'],
    cost: 'light',
    costNote: '질문 후보 × 남은 후보 비교. 첫 수 504 × 504 = 25만 번 — 견본처럼 첫 질문은 140개만 시험하거나 미리 정해 둔다.',
    level: 2,
    must: [
      '대답은 숫자 하나로 묶어(S × 4 + B) 묶음 세기를 빠르게',
      '질문 후보는 「남은 후보 밖의 수」도 포함 (더 잘 나누는 수일 수 있다)',
      '같은 최악이면 남은 후보 안의 수를 고른다',
      '첫 질문 등 후보가 많을 때는 표본으로',
      '미니맥스 켬/끔(끄면 아무 후보나) 비교',
    ],
    done: [
      '대답 묶음 막대에서 고른 수의 가장 큰 묶음이 다른 수들보다 작다',
      '숫자 야구 504 후보를 거의 늘 7번 안에 맞힌다',
      '미니맥스를 끄면 평균 횟수가 늘어난다',
    ],
    code: {
      lang: 'ts',
      title: '숫자 야구 — 최악의 묶음이 가장 작은 질문 고르기',
      from: 'demos/demosGameAI.ts bbScore() · bbBuckets() · I357 choose() 를 정리',
      body: `const CODES: number[][] = [];
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) for (let c = 1; c <= 9; c++)
  if (a !== b && b !== c && a !== c) CODES.push([a, b, c]);           // 504가지

function score(x: number[], y: number[]): number {                    // S × 4 + B
  let s = 0, b = 0;
  for (let i = 0; i < 3; i++) { if (x[i] === y[i]) s++; else if (y.includes(x[i]!)) b++; }
  return s * 4 + b;
}
function worst(guess: number, cands: number[]): number {              // 가장 큰 묶음 크기
  const m = new Map<number, number>();
  for (const c of cands) { const k = score(CODES[guess]!, CODES[c]!); m.set(k, (m.get(k) ?? 0) + 1); }
  return Math.max(0, ...m.values());
}

function choose(cands: number[]): number {
  if (cands.length === 1) return cands[0]!;
  const pool = cands.length > 120 ? Array.from({ length: 140 }, () => Math.floor(Math.random() * 504))
                                  : Array.from({ length: 504 }, (_, i) => i);
  const inCands = new Set(cands);
  let best = cands[0]!, bw = Infinity;
  for (const g of pool) {
    const w = worst(g, cands) - (inCands.has(g) ? 0.5 : 0);          // 같으면 맞힐 수도 있는 수
    if (w < bw) { bw = w; best = g; }
  }
  return best;
}
// 대답이 오면: cands = cands.filter((c) => score(CODES[guess]!, CODES[c]!) === 대답)`,
    },
    pitfalls: [
      { title: '남은 후보 안에서만 질문을 고르면 덜 나뉘는 수를 부른다', fix: '후보 밖의 수도 질문 후보에 넣는다 — 대신 같은 최악이면 후보 안의 수.' },
      { title: '첫 질문에서 504 × 504 를 다 비교하면 멈칫한다', fix: '표본 140개만 보거나 첫 질문은 미리 정해 둔다.' },
      { title: '「최악 줄이기」와 「평균 줄이기」를 헷갈린다', fix: '목표가 「몇 번 안에 꼭」이면 최악, 「보통 빨리」면 묶음 크기 기댓값.' },
    ],
    prev: ['i340'],
    next: ['i358'],
    refs: [{ name: 'Wikipedia — Mastermind (board game)', url: 'https://en.wikipedia.org/wiki/Mastermind_(board_game)' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'I357' }],
  },

  i358: {
    id: 'i358',
    summary: '수마다 매긴 점수를 온도 T 로 확률로 바꿔 뽑아서, T 가 낮으면 늘 최선(고수) · 높으면 그럴듯한 차선도 가끔(유아) 두게 한다.',
    terms: [
      { en: 'Softmax with temperature', ko: 'p ∝ exp((점수 − 최고 점수) / T)' },
      { en: 'Epsilon-greedy', ko: 'ε 확률로 아무 수나, 아니면 최선 — 비교용' },
      { en: 'Difficulty by stochastic play', ko: '실수를 확률로 섞어 난이도 나누기' },
    ],
    goal: '{target}의 난이도를 온도 소프트맥스로 나눠 줘 — 낮은 난이도는 그럴듯한 실수를 하게. 분위기는 {style}.',
    targets: ['모든 대전 게임 AI', '유아 ~ 고수 난이도 4단계', '확률 설명 화면'],
    styles: ['확률 막대 위로 공이 떨어져 고르는 설명', '보이지 않게 사람처럼 두는 AI', 'ε-무작위와 나란히 비교'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'C# 로 같은 계산 — Mathf.Exp, 뽑기는 UnityEngine.Random.value 누적.',
      godot: 'GDScript 로 같은 계산 — exp(), randf() 누적.',
    },
    principle: [
      '탐색 · 평가로 수마다 점수 v 를 얻는다 (견본 7수 −0.9 ~ +0.9).',
      '확률 p = exp((v − v최고) / T) 를 모두 더한 값으로 나눈다. 최고를 빼는 건 수가 너무 커지지 않게.',
      'T 가 작으면(0.03) 최선 수가 거의 100%, 커질수록(3) 점수 차가 무뎌져 차선 · 엉뚱한 수도 나온다 — 하지만 나쁜 수일수록 덜 나온다.',
      'ε-무작위는 ε 확률로 아무 수(아주 나쁜 수도 같은 확률), 아니면 최선 — 실수가 덜 사람답다. 견본에서 둘을 바꿔 비교.',
      '0~1 난수에서 확률을 차례로 빼다 0 이하가 되는 수를 고른다.',
    ],
    when: ['모든 대전 게임의 쉬움 · 보통 단계 (유아가 이길 수 있게)', 'AI 가 늘 같은 수만 두지 않게'],
    avoid: ['어려움 단계 — 거의 완벽해야 한다(T 아주 작게, 빈틈은 드문 차선만)', '점수가 없는 AI(규칙 기반) — 먼저 수마다 점수를 매기는 단계가 필요'],
    cost: 'light',
    costNote: 'exp 몇 번. 비용 없음 — 점수를 매기는 탐색이 비용의 전부.',
    level: 1,
    must: [
      'exp 안에서 최고 점수를 뺀다 (넘침 방지)',
      '점수 크기(척도)를 게임마다 맞춘 뒤 T 를 정한다 — 같은 T 라도 점수 범위가 다르면 성격이 다르다',
      '난이도별 T 표 (견본 기준 고수 < 0.08 · 중수 < 0.4 · 초보 < 1.2 · 유아)',
      '바로 이기는 수 · 바로 지는 것 막기는 쉬움 단계에서도 놓칠지 정책을 정한다',
      '설명 화면: 확률 막대 · 고른 기록 30개 · 최선 수 확률 곡선, ε 방식 토글',
    ],
    done: [
      'T 를 낮추면 최선 수(금빛) 막대가 거의 100% 가 되고, 높이면 막대가 고르게 퍼진다',
      '높은 T 에서도 점수가 아주 나쁜 수(빨강)는 좋은 수보다 덜 뽑힌다',
      'ε 방식으로 바꾸면 나쁜 수도 좋은 수와 같은 비율로 뽑히는 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '온도 소프트맥스 확률 · 뽑기 (ε-무작위 비교)',
      from: 'demos/demosGameAI.ts I358 의 probs() · 뽑기를 정리',
      body: `/** 점수 → 확률. eps 이면 ε-무작위 (ε = T / 2) */
function probs(vals: number[], T: number, eps = false): number[] {
  const best = vals.indexOf(Math.max(...vals));
  if (eps) {
    const e = Math.min(1, Math.max(0, T / 2));
    return vals.map((_, i) => (i === best ? 1 - e : 0) + e / vals.length);
  }
  const ex = vals.map((v) => Math.exp((v - vals[best]!) / T));   // 최고를 빼서 넘침 방지
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

function pick(p: number[], rnd = Math.random): number {
  let x = rnd();
  for (let i = 0; i < p.length; i++) {
    x -= p[i]!;
    if (x <= 0) return i;
  }
  return p.length - 1;
}

// 난이도 → 온도 (점수 −1 ~ +1 기준)
const TEMP = { 유아: 2.2, 초보: 0.7, 중수: 0.18, 고수: 0.04 } as const;
const move = moves[pick(probs(scores, TEMP.초보))];`,
    },
    pitfalls: [
      { title: 'exp(v / T) 를 그대로 쓰면 T 가 작을 때 Infinity 가 나온다', fix: '최고 점수를 빼고 exp — 가장 큰 값이 1 이 된다.' },
      { title: 'ε-무작위로 쉬움을 만들면 「말도 안 되는 수」를 둬 오히려 어색하다', fix: '소프트맥스는 나쁜 수일수록 덜 고르니 실수가 그럴듯하다.' },
      { title: '점수 범위가 게임마다 달라 같은 T 가 다른 난이도가 된다', fix: '점수를 −1 ~ +1 쯤으로 맞춘 뒤 T 표를 쓴다.' },
    ],
    prev: ['i346', 'i347'],
    next: ['i359'],
    refs: [{ name: 'Wikipedia — Softmax function', url: 'https://en.wikipedia.org/wiki/Softmax_function' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'I358' }],
  },

  i359: {
    id: 'i359',
    summary: '무거운 AI 탐색을 화면 그리는 메인 스레드 대신 Web Worker 에 맡기고 결과만 메시지로 받아, 생각하는 동안에도 화면이 멈추지 않게 한다.',
    terms: [
      { en: 'Web Worker', ko: '화면과 따로 도는 계산 일꾼 (다른 스레드)' },
      { en: 'postMessage / onmessage', ko: '일꾼에게 일을 보내고 결과를 받는 통로' },
      { en: 'Main-thread blocking (long task)', ko: '메인에서 오래 계산하면 그동안 그리기 · 입력이 멈춤' },
    ],
    goal: '{target}의 AI 계산을 Web Worker 로 옮겨 줘 — 생각하는 동안에도 화면 · 애니메이션이 멈추지 않게. 분위기는 {style}.',
    targets: ['체스 · 오목 · 헥스 AI', '퍼즐 풀이기 · 판 만들기', '메인 vs 워커 비교 설명 화면'],
    styles: ['도는 공이 멈추는지로 비교하는 설명', '「생각 중…」 표시가 매끄럽게 도는 게임 화면', '느린 폰에서도 부드럽게'],
    platforms: ['web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 async/await + Task.Run 이나 Job System(IJob · Burst). 결과는 메인 스레드에서 적용.',
      godot: 'Godot 4 는 WorkerThreadPool.add_task 또는 Thread, 결과는 call_deferred 로 메인에.',
    },
    principle: [
      '브라우저는 한 줄(메인 스레드)로 그리기 · 입력 · 내 코드를 차례로 한다 — 1.1초 계산하면 1.1초 동안 화면이 얼어붙는다.',
      'Web Worker 는 따로 도는 줄이다. 판을 postMessage 로 보내면 워커가 계산하고, 끝나면 결과만 postMessage 로 돌려준다.',
      '그동안 메인은 계속 그린다 — 견본의 공은 워커 쪽에선 멈추지 않고, 메인 쪽에선 멈췄다가 한꺼번에 튄다.',
      '워커는 DOM · three.js 장면에 손댈 수 없다. 규칙 · 탐색 코드만 워커로, 결과 적용은 메인에서.',
    ],
    when: ['0.1초 넘게 걸리는 탐색 · 풀이 · 판 만들기', '생각하는 척 연출(0.4~0.7초) 중에도 애니메이션이 돌아야 할 때'],
    avoid: ['몇 ms 면 끝나는 계산 — 메시지 왕복 비용만 든다', 'DOM · 캔버스 그리기 자체 — 워커에선 OffscreenCanvas 가 아니면 못 한다'],
    cost: 'light',
    costNote: '워커 하나 만들기 수 ms, 메시지는 판 크기만큼 복사. 계산 비용은 같고 화면 멈춤만 없어진다.',
    level: 1,
    must: [
      '규칙 · 탐색 코드를 DOM 없는 순수 함수로 나눠 워커와 메인이 함께 쓴다',
      '워커는 한 번 만들어 계속 쓴다 (수마다 새로 만들지 않기), 닫을 때 terminate',
      '요청마다 번호를 붙여 늦게 온 옛 결과를 버린다 (그사이 판이 바뀌었을 수 있다)',
      'Vite 에서는 new Worker(new URL(\'./ai.worker.ts\', import.meta.url), { type: \'module\' }) 꼴로',
      '비교 화면: 메인에서 0.6초 · 워커에서 0.7초 진짜 계산 단추',
    ],
    done: [
      '워커에서 계산하는 동안 도는 공 · 「생각 중」 표시가 끊기지 않는다',
      '메인에서 같은 계산을 하면 공이 멈췄다 튀는 차이가 보인다',
      '결과가 오면 수를 둔다 — 그 사이 판을 바꾸면 옛 결과는 버려진다',
    ],
    code: {
      lang: 'ts',
      title: '워커에 계산 맡기기 (번호 붙인 요청 · 옛 결과 버리기)',
      from: 'demos/demosGameAI.ts I359 의 runWorker() 를 일반 꼴로 정리',
      body: `// ai.worker.ts — DOM 없는 순수 계산만
//   import { bestMove } from './search';
//   onmessage = (e) => { const { id, board, ms } = e.data; postMessage({ id, move: bestMove(board, ms) }); };

const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
let reqId = 0;
const waiting = new Map<number, (move: number) => void>();

worker.onmessage = (e: MessageEvent<{ id: number; move: number }>) => {
  const done = waiting.get(e.data.id);
  waiting.delete(e.data.id);
  if (done && e.data.id === reqId) done(e.data.move);   // 늦게 온 옛 결과는 버린다
};

function think(board: number[], ms: number): Promise<number> {
  const id = ++reqId;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ id, board, ms });              // 판은 복사되어 간다
  });
}

// 쓰기: 화면은 계속 돈다
showThinking(true);
const move = await think(board, 700);
showThinking(false);
play(move);
// 게임을 닫을 때: worker.terminate();`,
    },
    pitfalls: [
      { title: '탐색 코드가 DOM · three.js 를 import 하면 워커가 안 뜬다', fix: '규칙 · 탐색을 순수 모듈로 나눠 워커에서는 그것만 import.' },
      { title: '수마다 new Worker 를 만들면 첫 생각이 매번 느리다', fix: '게임을 열 때 한 번 만들어 두고 계속 쓴다, 닫을 때 terminate.' },
      { title: '판을 바꾼 뒤 옛 요청 결과가 와서 엉뚱한 수를 둔다', fix: '요청 번호를 붙여 지금 번호가 아니면 버린다.' },
      { title: 'Blob URL 로 만든 워커를 안 치우면 메모리가 남는다', fix: '견본처럼 URL.createObjectURL 로 만들었으면 닫을 때 terminate + revokeObjectURL.' },
    ],
    prev: ['i343', 'i347'],
    refs: [{ name: 'MDN — Using Web Workers', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers' }],
    source: [{ file: 'demosGameAI.ts', symbol: 'I359' }],
  },
};

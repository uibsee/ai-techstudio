import type { TechDoc } from './types';

/**
 * 블렌더 없이 사진 같은 렌더 (2026-10-09) — i545 GPU 경로 추적 · i546 노이즈 제거 · i547 경로 추적 영상 굽기.
 * 견본은 demos/demosPathTrace.ts + demos/lib/pathtrace.ts (라이브러리 없이 셰이더로 짠 작은 경로 추적기 · à-trous).
 * 실제 작업 길(three-gpu-pathtracer · oidn-web · puppeteer + ffmpeg)은 「도구와 기계의 원리」 유튜브 제작 코드에서 확인한 것.
 */
export const DOCS: Record<string, TechDoc> = {
  i545: {
    id: 'i545',
    summary: '픽셀마다 빛줄을 쏘아 여러 번 튀는 길을 따라가고 샘플을 쌓아 평균 — 반사 · 굴절 · 부드러운 그림자가 저절로, 블렌더 없이 사진 같은 한 장.',
    terms: [
      { en: 'Path tracing (progressive, Monte Carlo)', ko: '빛줄을 무작위로 튀겨 평균 내는 렌더 — 샘플이 쌓일수록 노이즈가 걷힘' },
      { en: 'three-gpu-pathtracer (WebGLPathTracer)', ko: 'three.js 장면을 그대로 경로 추적하는 라이브러리 — BVH · 물리 재질 · 심도' },
      { en: 'Samples per pixel (spp) / bounces', ko: '픽셀당 샘플 수 · 빛이 튀는 횟수' },
      { en: 'Thin lens depth of field (PhysicalCamera fStop · focusDistance)', ko: '렌즈 원판의 아무 점에서 쏘아 초점 밖을 흐리게' },
    ],
    goal: '{target}을(를) three.js 장면 그대로 GPU 경로 추적으로 렌더해 줘 — 샘플을 쌓아 반사 · 굴절 · 부드러운 그림자가 사진처럼 나오게. 분위기는 {style}.',
    targets: ['금속 · 유리 · 니스 칠한 기계 부품 정물', '샤프 · 변기 물탱크 같은 생활 도구 단면', '제품 사진 (스튜디오 바닥 + 띠 조명)'],
    styles: ['어두운 스튜디오 (남색 배경 · 네모 띠 조명)', '밝은 제품 사진 (흰 무한 배경)', '따뜻한 책상 위 (나무 · 종이)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: '예외: 이 기술은 three-gpu-pathtracer(npm, three-mesh-bvh 함께)를 추가해서 쓴다. 60fps 실시간이 아니라 샘플을 쌓는 정지 그림 · 굽기용이다.',
      unity: 'HDRP 의 Path Tracing 볼륨(Ray Tracing 켠 DX12)이 같은 일 — Maximum Samples · Maximum Depth 가 spp · bounces.',
      godot: '엔진에 내장 경로 추적이 없다 — 정지 그림은 Blender Cycles 로 굽거나 실시간은 SDFGI · LightmapGI 로 근사.',
    },
    principle: [
      '실시간 렌더는 빛 하나에서 표면까지 한 번만 계산한다. 경로 추적은 카메라에서 빛줄을 쏘아 부딪힐 때마다 재질대로 방향을 무작위로 골라 다시 튀기고, 하늘 · 조명에 닿으면 지나온 색을 곱해 가져온다.',
      '한 장면 = 픽셀마다 빛줄 하나(1 샘플)라 처음엔 자글자글하다. 장면마다 평균을 쌓는다: 새 평균 = mix(전 평균, 새 샘플, 1/(n+1)). 노이즈는 1/√n 로 줄어 4배 쌓으면 절반.',
      '재질은 「어느 쪽으로 튈 확률」: 거친 면 = 코사인 반구, 금속 = 반사 방향 + 거칠기만큼 흔들기, 유리 = 프레넬 확률로 반사 아니면 굴절(스넬), 니스 = 프레넬로 반사 아니면 밑칠.',
      '튐 횟수 1 = 직접광만(그림자가 새까맣고 유리가 검다), 늘리면 구석까지 빛이 번지고 색이 옆으로 묻어난다(색 번짐).',
      '카메라 · 물체가 움직이면 지난 샘플은 다른 그림이라 버리고 처음부터 — 그래서 정지 그림 · 한 프레임씩 굽는 영상에 맞다.',
    ],
    when: ['유튜브 설명 영상 · 썸네일 · 제품 사진처럼 「멈춘 그림 한 장」의 품질이 중요할 때', '금속 · 유리 · 니스처럼 반사와 굴절이 많은 기계 부품을 블렌더 없이 코드로', '같은 three.js 장면을 실시간 화면과 고화질 렌더 둘 다로 쓰고 싶을 때'],
    avoid: ['60fps 로 움직이는 게임 화면 — 장면마다 처음부터라 늘 자글거린다. 대신 PBR + 환경 반사(u12) + 빛 번짐 · 심도 후처리', '폰에서 실시간 — 대신 미리 구운 그림(라이트맵 · 영상)을 보여 준다'],
    cost: 'heavy',
    costNote: '1920×1080 한 샘플이 픽셀 207만 개 × 튐 5번. 견본(수식 도형)은 844×475 한 샘플 0.9ms(라데온 780M), 메시 장면 + BVH 는 몇 배~몇십 배. 영상 프레임당 32 ~ 수백 샘플.',
    level: 3,
    must: [
      '장면은 three.js 그대로 두고 three-gpu-pathtracer 의 WebGLPathTracer 로 렌더 — 재질은 MeshPhysicalMaterial(metalness · roughness · clearcoat · transmission · ior)',
      'pathTracer.setScene(scene, camera) 는 모형 · 재질이 바뀔 때만 (BVH 를 다시 짓는다). 카메라만 움직이면 updateCamera(), 재질 값만 바뀌면 updateMaterials()',
      'renderSample() 을 원하는 spp 까지 부르고 pathTracer.samples 로 확인 — 몇 장마다 requestAnimationFrame 을 기다려 화면 · 브라우저가 멈추지 않게',
      '톤 매핑은 ACESFilmic, 조명은 환경 지도(HDR 또는 GradientEquirectTexture) + 넓은 면 조명 — 작은 점 조명만 있으면 노이즈가 아주 오래 간다',
      '반딧불(드물게 아주 밝은 점) 막기: 빛줄 밝기 상한 · filterGlossyFactor 로 거친 반사를 부드럽게',
    ],
    done: [
      '처음엔 자글자글하다가 샘플이 쌓일수록 매끈해지고, 32 → 128 샘플에서 노이즈가 눈에 띄게 절반쯤으로 준다',
      '튐 횟수를 1 → 5 로 올리면 그림자 속 · 유리 공 안이 밝아지고 빨간 공 빛이 바닥에 묻어난다',
      '금속 공에 네모난 띠 조명이 비치고, 유리 공 너머 물체가 뒤집혀 보이며, 물체 밑에 부드러운 접촉 그림자가 생긴다',
      '카메라를 움직이면 샘플이 0 부터 다시 쌓이고, 멈추면 계속 맑아진다',
    ],
    code: {
      lang: 'js',
      title: 'three-gpu-pathtracer 로 한 장 렌더 (원하는 spp 까지)',
      from: '새로 씀 — 「도구와 기계의 원리」 pt_intro.html 과 같은 방식',
      body: `import { WebGLPathTracer, PhysicalCamera, GradientEquirectTexture } from 'three-gpu-pathtracer';

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const camera = new PhysicalCamera(30, W / H, 0.1, 100);
camera.fStop = 5.6;                       // 작을수록 배경이 흐림
camera.apertureBlades = 6;                // 흐린 빛 방울이 육각형

const bg = new GradientEquirectTexture();
bg.topColor.set(0xd9d2c6); bg.bottomColor.set(0x6d6052); bg.update();
scene.background = bg; scene.environment = bg;

const pt = new WebGLPathTracer(renderer);
pt.bounces = 5; pt.transmissiveBounces = 4; pt.filterGlossyFactor = 1.0;
pt.renderDelay = 0; pt.fadeDuration = 0; pt.minSamples = 1;
pt.setScene(scene, camera);               // 모형이 바뀔 때만 (BVH 다시 짓기)

async function renderStill(spp) {
  camera.focusDistance = camera.position.distanceTo(target);
  pt.updateCamera();
  while (pt.samples < spp) {
    pt.renderSample();                    // 픽셀마다 1 샘플 더 쌓기
    if (Math.floor(pt.samples) % 8 === 0) await new Promise((r) => requestAnimationFrame(r));
  }
}`,
    },
    pitfalls: [
      { title: '작은 점 조명 하나면 수천 샘플에도 자글거린다', fix: '빛줄이 그 작은 점에 우연히 닿을 확률이 낮아서다. 넓은 면 조명 · 띠 조명 · 환경 지도로 빛을 넓게 준다. 견본도 띠 조명을 넓히자 같은 샘플에서 바닥 노이즈가 크게 줄었다.', seen: true },
      { title: '매 프레임 setScene 을 부르면 몇 초씩 멈춘다', fix: 'setScene 은 BVH 를 새로 짓는다. 카메라만 바뀌면 updateCamera(), 부품이 움직인 프레임에만 setScene — 「도구와 기계의 원리」 렌더도 부품 위치 문자열을 비교해 바뀔 때만 다시 지었다.', seen: true },
      { title: '반쪽 실수(HalfFloat) 평균은 수천 샘플에서 멈춘다', fix: 'mix(전, 새, 1/(n+1)) 의 더하는 양이 반쪽 실수 정밀도 아래로 내려간다. 상한(견본 1024)을 두거나 FloatType 타깃에 합을 쌓고 나눠서 보인다.', seen: true },
      { title: '셰이더 한 줄 주석이 같은 줄 코드를 삼킨다', fix: 'GLSL 에서 // 뒤는 줄 끝까지 주석이다. 견본에서 any = true 가 주석에 먹혀 바닥이 통째로 사라졌다 — 주석은 코드 위 줄에.', seen: true },
      { title: 'smoothstep(큰 값, 작은 값, x) 는 D3D 에서 0 이 나온다', fix: '경계가 거꾸로면 GLSL 명세상 결과가 정해지지 않았다. 1.0 - smoothstep(작은 값, 큰 값, x) 로 쓴다 (견본 바닥이 윈도 크롬에서만 검게 나왔다).', seen: true },
    ],
    prev: ['i450', 'i449', 'i85', 'i84', 'u04'],
    next: ['i546', 'i547'],
    refs: [
      { name: 'three-gpu-pathtracer (GitHub)', url: 'https://github.com/gkjohnson/three-gpu-pathtracer' },
      { name: 'Ray Tracing in One Weekend', url: 'https://raytracing.github.io/books/RayTracingInOneWeekend.html' },
      { name: 'Wikipedia — Path tracing', url: 'https://en.wikipedia.org/wiki/Path_tracing' },
    ],
    source: [{ file: 'demosPathTrace.ts', symbol: 'makeTrace' }],
  },
  i546: {
    id: 'i546',
    summary: '픽셀당 몇 샘플뿐인 자글자글한 경로 추적 그림을 법선 · 깊이 · 바탕색 길잡이로 걸러 — 모서리와 무늬는 지키고 노이즈만 지워 렌더 시간을 몇 분의 일로.',
    terms: [
      { en: 'Denoising (Intel Open Image Denoise, OIDN)', ko: '경로 추적 노이즈를 지우는 AI(U-Net) — 블렌더도 쓰는 그것, 웹은 oidn-web(WebGPU)' },
      { en: 'Edge-avoiding à-trous wavelet filter', ko: '구멍 뚫린 체를 1 · 2 · 4 · 8 · 16칸 간격으로 거듭 — 길잡이가 다르면 무게를 줄여 모서리를 지킴' },
      { en: 'Auxiliary buffers (albedo · normal · depth)', ko: '첫 충돌의 바탕색 · 법선 · 깊이 — 노이즈 없는 길잡이 그림' },
      { en: 'Albedo demodulation', ko: '바탕색으로 나눠 빛만 거른 뒤 다시 곱하기 — 무늬가 뭉개지지 않음' },
    ],
    goal: '{target}을(를) 적은 샘플로 경로 추적하고 노이즈 제거로 깨끗하게 만들어 줘 — 법선 · 바탕색 길잡이로 모서리 · 무늬는 지키게. 분위기는 {style}.',
    targets: ['경로 추적 정지 그림 (32 샘플 → 깨끗하게)', '경로 추적 영상 프레임마다', '카메라가 움직이는 실시간 경로 추적 미리 보기'],
    styles: ['사진처럼 또렷하게 (모서리 · 무늬 지키기)', '부드럽게 (조금 뭉개져도 노이즈 0)', '왼쪽 원본 · 오른쪽 거른 것 비교 화면'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: '예외: 실제 노이즈 제거는 oidn-web(npm, WebGPU)을 추가해서 쓴다. WebGPU 가 없을 때를 위해 à-trous 셰이더 필터를 대신 길로 둔다.',
      unity: 'HDRP Path Tracing 볼륨의 Denoising(Intel Open Image Denoise · NVIDIA OptiX) 을 켠다.',
    },
    principle: [
      '경로 추적 노이즈는 픽셀마다 따로 튀는 「무작위 흔들림」이라, 이웃 픽셀과 평균 내면 준다. 그냥 흐리면 모서리 · 글씨 · 무늬까지 뭉개진다.',
      '길잡이: 첫 충돌의 법선 · 깊이 · 바탕색은 빛줄 하나로도 정확해 노이즈가 없다. 이웃이 법선 · 깊이가 다르면(다른 면) 무게를 거의 0으로 — 모서리를 넘어 섞이지 않는다.',
      'à-trous: 5×5 체(1/16 · 1/4 · 3/8 · 1/4 · 1/16)를 칸 간격 1 · 2 · 4 · 8 · 16 으로 다섯 번 — 25칸만 읽고도 넓게(65칸) 거른다. 단계마다 밝기 기준을 좁혀 처음엔 넓게, 나중엔 경계를 지킨다.',
      '바탕색으로 나누기: 색 = 바탕색 × 빛. 빛만 거르고 다시 바탕색을 곱하면 바둑판 · 나뭇결 무늬는 그대로.',
      'OIDN 은 이 판단을 수많은 렌더로 배운 신경망(U-Net)이 한다 — 같은 길잡이(albedo · normal)를 넣으면 더 정확하다.',
    ],
    when: ['영상 수백 프레임을 프레임당 32 ~ 64 샘플로 줄여 굽고 싶을 때 (몇 배 빨라짐)', '실시간 경로 추적 미리 보기(카메라가 움직여 늘 적은 샘플)', '샘플을 더 쌓아도 남는 잔노이즈를 마지막에 지울 때'],
    avoid: ['머리카락 · 풀 · 작은 글씨처럼 픽셀보다 가는 것이 많은 그림 — 지워질 수 있다. 샘플을 더 쌓는다', '샘플이 1 ~ 2 개뿐인 유리 · 물 속 — 길잡이(첫 충돌)가 유리 표면이라 속 모습이 얼룩진다'],
    cost: 'medium',
    costNote: 'à-trous 는 화면 한 장에 25칸 × 5단계 읽기라 1080p 도 몇 ms. OIDN(WebGPU)은 1080p 한 장 1 ~ 수 초(타일로 나눠), 대신 결과가 훨씬 깨끗.',
    level: 3,
    must: [
      '실제 작업은 oidn-web 의 initUNetFromURL(가중치 .tza, { device }) + tileExecute({ color, albedo, normal, done }) — WebGPU 가 필요하다 (navigator.gpu)',
      '길잡이(albedo · normal)는 픽셀 가운데로 쏜 첫 충돌로 따로 렌더 — 흔들린(지터) 샘플로 만들면 길잡이에도 노이즈가 생긴다',
      '거르기 전에 바탕색으로 나누고, 거른 뒤 다시 곱한다 (무늬 지키기)',
      '하늘 · 배경(아무것도 안 맞은 픽셀)은 법선이 0 — 배경끼리만 섞이게 따로 다룬다',
      '왼쪽 원본 · 오른쪽 거른 것을 분할선으로 비교하는 화면을 둔다',
    ],
    done: [
      '픽셀당 2 ~ 4 샘플의 자글자글한 그림이 오른쪽에서 매끈해지고, 물체 윤곽 · 바둑판 칸 경계가 뭉개지지 않는다',
      '「법선 · 깊이 길잡이」를 끄면 물체 가장자리가 바닥으로 번지고, 「바탕색으로 나누기」를 끄면 바둑판이 흐려진다',
      '카메라를 멈추고 샘플을 쌓으면 원본과 거른 것이 점점 같아진다',
      '배경(하늘)이 까맣게 빠지거나 얼룩지지 않는다',
    ],
    code: {
      lang: 'glsl',
      title: 'à-trous 한 단계 — 법선 · 깊이 · 밝기로 무게 (uStep = 1, 2, 4, 8, 16)',
      from: 'demos/lib/pathtrace.ts ATROUS',
      body: `const float K[3] = float[3](0.375, 0.25, 0.0625);
vec3 c0 = fetch(vUv);                       // fetch = 색 / 바탕색 (첫 단계)
vec4 nd0 = texture2D(uNd, vUv);             // 법선 xyz + 깊이 w
vec3 sum = vec3(0.0); float wsum = 0.0;
for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
  vec2 uv = vUv + vec2(float(x), float(y)) * uStep * uTexel;
  vec3 c = fetch(uv);
  float w = K[abs(x)] * K[abs(y)];
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), l0 = dot(c0, vec3(0.2126, 0.7152, 0.0722));
  float dl = l / (1.0 + l) - l0 / (1.0 + l0);          // 톤을 눌러 비교
  w *= exp(-dl * dl / (uSigC * uSigC));
  vec4 nd = texture2D(uNd, uv);
  bool m0 = dot(nd0.xyz, nd0.xyz) < 0.25, m = dot(nd.xyz, nd.xyz) < 0.25;   // 배경
  w *= m0 || m ? float(m0 == m)
       : pow(max(dot(nd.xyz, nd0.xyz), 0.0), 32.0) * exp(-abs(nd.w - nd0.w) / (0.06 * uStep + 0.02));
  sum += c * w; wsum += w;
}
vec3 o = sum / max(wsum, 1e-6);
if (lastPass) o *= texture2D(uAlb, vUv).rgb;  // 마지막 단계에서 바탕색 다시 곱하기
gl_FragColor = vec4(o, 1.0);`,
    },
    pitfalls: [
      { title: '색(RGB) 차이로 무게를 주면 반짝이는 점이 그대로 남는다', fix: '적은 샘플에서는 노이즈 자체가 큰 색 차이라 이웃 무게가 0 이 된다. 톤을 누른 밝기 차이로 바꾸고 기준을 넉넉히(첫 단계 0.9) — 견본이 이렇게 고쳐서야 걸러졌다.', seen: true },
      { title: '배경 픽셀이 까맣게 빠진다', fix: '하늘은 법선이 0 이라 dot(n, n0) 무게가 모두 0, 나누기가 0/0 이 된다. 법선 0 끼리만 무게 1.', seen: true },
      { title: '바탕색으로 안 나누면 무늬가 뭉개진다', fix: '무늬도 「색 차이」라 체가 지운다. 색 / 바탕색으로 빛만 거르고 다시 곱한다 (OIDN 에 albedo 를 넣는 까닭도 같다).' },
      { title: 'OIDN 이 「navigator.gpu 없음」으로 안 돈다', fix: 'oidn-web 은 WebGPU 가 필요하다. 헤드리스 크롬은 --enable-unsafe-webgpu 와 GPU 옵션이 있어야 하고, 안 되면 견본 같은 à-trous 로 대신한다.' },
    ],
    prev: ['i545'],
    next: ['i547'],
    refs: [
      { name: 'Intel Open Image Denoise', url: 'https://www.openimagedenoise.org/' },
      { name: 'oidn-web (GitHub)', url: 'https://github.com/DennisSmolek/oidn-web' },
      { name: 'Dammertz et al. — Edge-Avoiding À-Trous Wavelet Transform (2010)', url: 'https://jo.dreggn.org/home/2010_atrous.pdf' },
    ],
    source: [{ file: 'demosPathTrace.ts', symbol: 'makeDenoise' }],
  },
  i547: {
    id: 'i547',
    summary: '시각 t 를 프레임마다 정확히 놓고 샘플을 다 모아 찍은 뒤 다음 프레임 — 헤드리스 크롬 + ffmpeg 로 블렌더 없이 사진 같은 설명 영상을 mp4 로.',
    terms: [
      { en: 'Offline frame-by-frame rendering (deterministic time)', ko: '실제 시계 대신 프레임 번호로 시간을 정해 한 장씩 굽기' },
      { en: 'Headless Chrome (puppeteer) screenshot → ffmpeg image2pipe', ko: '보이지 않는 크롬이 찍은 PNG 를 ffmpeg 에 바로 흘려 mp4' },
      { en: 'Motion blur via shutter-time sampling', ko: '빛줄마다 셔터가 열린 동안의 다른 순간 — 평균이 곧 모션 블러' },
      { en: 'Convergence per frame (spp budget)', ko: '프레임마다 정한 샘플 수까지 다 모은 뒤 찍기' },
    ],
    goal: '{target}을(를) 경로 추적으로 한 프레임씩 구워 mp4 로 만들어 줘 — 페이지는 window.__renderAt(t) 로 그 시각 장면을 샘플을 다 모아 그리고, puppeteer 가 찍어 ffmpeg 로 묶게. 분위기는 {style}.',
    targets: ['기계 원리 설명 영상 (부품이 움직이는 단면)', '제품 소개 영상 (카메라가 천천히 돎)', '유튜브 쇼츠 세로 영상'],
    styles: ['어두운 스튜디오 · 자막', '밝은 교과서 도해', '영화처럼 (심도 흐림 · 모션 블러)'],
    platforms: ['three', 'web'],
    platformHints: {
      three: '예외: 페이지는 three-gpu-pathtracer 로 그리고, 굽기는 Node 스크립트(puppeteer-core + ffmpeg)로 한다. 폰 · 60fps 조건은 해당 없음 — 화면 밖에서 한 장씩 굽는다.',
      web: '굽기 스크립트는 Node(puppeteer-core) + ffmpeg. 페이지 쪽은 어떤 렌더러든 window.__renderAt(t) 만 내놓으면 된다.',
    },
    principle: [
      '실시간 녹화는 컴퓨터가 느리면 프레임이 빠지고 노이즈도 덜 걷힌다. 굽기는 시간을 프레임 번호로 정한다: t = i / 30. 한 장에 몇 초가 걸려도 영상은 정확히 30fps.',
      '페이지가 window.__renderAt(t) 를 내놓는다: 그 시각으로 카메라 · 부품을 놓고, 정한 샘플까지 쌓고, (노이즈 제거 후) 다 그리면 끝을 알린다. 바깥 스크립트는 찍기만 한다.',
      'puppeteer 가 1/30초씩 __renderAt 을 부르고 page.screenshot 으로 PNG — ffmpeg 의 표준 입력(image2pipe)에 바로 흘려 libx264 mp4. 중간 파일이 없다.',
      '모션 블러가 공짜: 빛줄마다 셔터가 열린 동안(180° = 프레임 시간의 절반)의 아무 순간에 부품을 놓으면, 평균이 곧 움직임 번짐.',
      '노이즈 제거를 프레임마다 하면 샘플을 몇 분의 일로 — 대신 프레임끼리 노이즈 무늬가 달라 살짝 일렁일 수 있다(시드 고정 · 샘플을 조금 더).',
    ],
    when: ['유튜브 설명 영상 · 기계 원리 애니메이션을 블렌더 없이 코드로', '같은 장면 코드로 실시간 미리 보기(콘티)와 고화질 굽기를 둘 다', '느린 노트북에서도 완벽한 30 · 60fps 영상이 필요할 때'],
    avoid: ['사람이 직접 조작하는 화면 녹화 — 그냥 화면 녹화(OBS)가 낫다', '몇 분짜리 긴 영상을 높은 샘플로 — 프레임당 수십 초면 몇 시간. 장면을 나눠 굽거나 샘플 · 해상도를 낮추고 노이즈 제거'],
    cost: 'heavy',
    costNote: '프레임당 렌더 시간 × 프레임 수. 1080p · 32 샘플 + OIDN 이면 프레임당 몇 초 — 10초(300프레임) 영상이 10 ~ 20분. 화면 밖(헤드리스)에서 돌아 폰과는 무관.',
    level: 2,
    must: [
      '페이지의 시간은 오직 __renderAt(t) 의 t 로 — performance.now · requestAnimationFrame 시간 · Math.random 으로 움직이지 않게 (같은 t 는 언제나 같은 그림)',
      '__renderAt 은 샘플을 다 쌓고, 노이즈 제거 · 자막까지 그린 뒤 requestAnimationFrame 두 번을 기다려 화면이 실제로 바뀐 다음 끝낸다',
      '헤드리스 크롬은 GPU 를 꼭 켠다: --use-angle=d3d11(윈도) --enable-gpu --ignore-gpu-blocklist --enable-unsafe-webgpu, protocolTimeout: 0 — 안 그러면 소프트웨어 렌더로 수십 배 느리다',
      'ffmpeg: -f image2pipe -framerate 30 -c:v png -i - -c:v libx264 -pix_fmt yuv420p -crf 16 -movflags +faststart (유튜브 · 폰에서 재생되게)',
      '진행률(몇 번째 프레임 · 프레임당 초 · 남은 시간)을 찍고, 미리 몇 장만 정지 그림으로 뽑아 확인하는 모드를 둔다',
    ],
    done: [
      '느린 컴퓨터에서 구워도 mp4 가 정확히 30fps 로 끊김 없이 재생되고, 길이가 (끝초 − 시작초)와 같다',
      '같은 t 를 두 번 구우면 같은 그림이 나온다 (시간이 실제 시계에 묶이지 않음)',
      '모션 블러를 켜면 빠르게 움직이는 부품이 진행 방향으로 번지고, 끄면 프레임마다 또렷한 한 순간',
      '프레임마다 노이즈 제거를 하면 32 샘플로도 자글거림이 없다',
    ],
    code: {
      lang: 'js',
      title: 'puppeteer 로 __renderAt(t) 를 1/30초씩 → ffmpeg 로 mp4',
      from: '새로 씀 — 「도구와 기계의 원리」 tools/render_pt.mjs 를 정리',
      body: `import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const FPS = 30;
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(URL + '?spp=32', { waitUntil: 'networkidle0', timeout: 180000 });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });

const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', OUT]);
for (let i = Math.round(T0 * FPS); i < Math.round(T1 * FPS); i++) {
  await page.evaluate((t) => window.__renderAt(t), i / FPS);   // 그 시각 장면 · 샘플 다 쌓기
  const png = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();`,
    },
    pitfalls: [
      { title: '헤드리스 크롬이 소프트웨어로 그려 한 장에 몇 분', fix: '기본 헤드리스는 GPU 를 안 쓸 수 있다. GPU 옵션을 주고 WEBGL_debug_renderer_info 로 실제 그래픽 카드 이름을 찍어 확인한다 (「도구와 기계의 원리」 렌더 스크립트도 시작할 때 GPU 이름을 찍는다).' },
      { title: '그리기 직후 찍으면 지난 프레임이 찍힌다', fix: '화면 합성이 한 박자 늦다. __renderAt 끝에 requestAnimationFrame 두 번을 기다린다.' },
      { title: '탭이 뒤에 있으면 requestAnimationFrame 이 멈춘다', fix: '보통 크롬에서 뒤로 간 탭은 rAF 가 거의 멈춰 굽기가 수십 배 느려진다(이 견본을 자동 시험할 때 겪음). 헤드리스로 굽거나 굽는 동안 탭을 앞에 둔다.', seen: true },
      { title: '프레임마다 노이즈 무늬가 달라 일렁인다', fix: '노이즈 제거 후에도 남는 저주파 얼룩이 프레임마다 다르다. 샘플을 조금 더 쌓거나, 프레임 사이 시드를 고정 · 시간 방향으로 살짝 섞는다.' },
    ],
    prev: ['i545', 'i546', 'i82'],
    next: ['i81', 'i89', 'i38'],
    refs: [
      { name: 'Puppeteer — page.screenshot', url: 'https://pptr.dev/api/puppeteer.page.screenshot' },
      { name: 'FFmpeg Formats Documentation (image2pipe)', url: 'https://ffmpeg.org/ffmpeg-formats.html' },
      { name: 'three-gpu-pathtracer (GitHub)', url: 'https://github.com/gkjohnson/three-gpu-pathtracer' },
    ],
    source: [{ file: 'demosPathTrace.ts', symbol: 'makeBake' }],
  },
};

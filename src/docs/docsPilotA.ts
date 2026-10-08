import type { TechDoc } from './types';

/**
 * 시범 문서 (1/2) — u01 툰 셰이딩 · i385 셰이더 미리 데우기 · i446 SDF 조각 모델링 · i459 두 뼈 IK · i484 전투 판정
 * 코드는 견본 파일의 실제 코드에서 발췌하거나, 같은 방식으로 붙여 넣으면 돌아가게 새로 썼다 (from 에 출처).
 */
export const DOCS: Record<string, TechDoc> = {
  u01: {
    id: 'u01',
    summary: '빛 받는 정도를 2~3단 계단으로 끊어 칠해, 3D 물체를 셀 애니메이션처럼 보이게 한다.',
    terms: [
      { en: 'Toon shading (cel shading)', ko: '만화 그림체 명암' },
      { en: 'MeshToonMaterial + gradientMap', ko: 'three.js 툰 재질 + 계단 텍스처' },
      { en: 'Inverted hull outline', ko: '뒤집은 껍데기 외곽선 (뒷면만 그린 조금 큰 복제)' },
      { en: 'NoToneMapping', ko: '톤 매핑 끄기 — 계단 색이 뭉개지지 않게' },
    ],
    goal: '{target}을(를) {style} 느낌의 툰 셰이딩(3단 명암 + 검은 외곽선)으로 그려 줘.',
    targets: ['공 · 도넛 같은 기본 도형', '내 3D 캐릭터', '3D 게임 장면 전체'],
    styles: ['밝은 애니메이션', '귀엽고 아기자기', '진한 만화책'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 에서는 Shader Graph 로 N·L 을 Ramp 텍스처(Point 필터)에 넣고, 외곽선은 Inverted Hull 두 번째 패스(Cull Front)로.',
      godot: 'Godot 은 ShaderMaterial 의 light() 함수에서 diffuse 를 step/ramp 로 끊고, 외곽선은 Next Pass 재질(cull_front · grow)로.',
    },
    principle: [
      '보통 재질은 빛을 받는 정도(N·L)를 0~1 로 매끈하게 칠한다.',
      '툰 재질은 그 값을 작은 계단 텍스처(gradientMap)로 바꿔, 밝음 · 중간 · 그늘 같은 몇 단계로 끊는다.',
      '계단 텍스처는 NearestFilter 로 읽어야 단계 사이가 섞이지 않는다.',
      '외곽선은 같은 모양을 조금 키워 뒷면만 검게 그리면(BackSide) 물체 가장자리에 테두리가 생긴다.',
      '톤 매핑은 계단 색을 다시 휘게 하므로 끄고, 밝기는 빛 세기로 맞춘다.',
    ],
    when: ['아이들 · 캐주얼 게임에서 밝고 또렷한 그림체가 필요할 때', '저사양 기기에서 PBR 대신 가벼운 재질이 필요할 때', '위에서 내려다보는 판 게임 — 평면이 넓어 계단 명암이 잘 드러남'],
    avoid: ['실사 질감(금속 반사 · 유리 투과)이 중요한 장면', '얇은 판 · 투명한 물체 — 외곽선 껍데기가 지저분하게 보인다'],
    cost: 'light',
    costNote: '재질 자체는 표준 재질보다 가볍다. 외곽선 껍데기는 그리기 횟수를 2배로 늘리니 물체가 수백 개면 합치거나 작은 것은 건너뛴다.',
    level: 1,
    must: [
      'renderer.toneMapping = THREE.NoToneMapping (켜 두면 계단 색이 뭉개진다)',
      '계단 텍스처는 DataTexture + NearestFilter, 단계 값을 바꿀 수 있게',
      '외곽선은 뒤집은 껍데기(BackSide) 방식 — 두께는 물체 크기와 상관없이 같게 보이도록 크기에 반비례해 키우기',
      '얇은 판 · 투명한 것 · 아주 작은 조각에는 외곽선을 붙이지 않기',
      '후처리(외곽선 패스 등) 없이 재질만으로',
    ],
    done: [
      '같은 물체를 왼쪽 일반 재질 · 오른쪽 툰으로 나란히 보여 주면, 오른쪽 명암이 3단 계단으로 끊겨 보인다',
      '물체 가장자리에 고른 두께의 검은 외곽선이 보이고, 물체가 돌아도 끊기지 않는다',
      '「그늘 밝기」 · 「외곽선 굵기」 슬라이더와 「툰 켜기」 단추로 바로 바뀐다',
      '폰에서도 60fps (물체 수십 개 기준)',
    ],
    code: {
      lang: 'ts',
      title: '계단 텍스처 + 툰 재질 + 뒤집은 껍데기 외곽선',
      from: 'src/game/core/toon.ts (makeToonKit) · demos/demosRef.ts u01 을 짧게 정리',
      body: `import * as THREE from 'three';

// 1) 3단 명암 계단 — NearestFilter 가 핵심 (보간하면 계단이 섞여 뭉개진다)
const steps = new Uint8Array([75, 168, 255]); // 그늘 · 중간 · 밝음 (0~255)
const grad = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

// 2) 툰 재질
const ball = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 48, 32),
  new THREE.MeshToonMaterial({ color: 0xe8453c, gradientMap: grad }),
);
scene.add(ball);

// 3) 외곽선 — 같은 모양을 조금 키워 뒷면만 검게. 두께 thick 이 크기와 상관없이 같도록
const ink = new THREE.MeshBasicMaterial({ color: 0x1c1a2e, side: THREE.BackSide });
const thick = 0.035;
const size = new THREE.Vector3();
ball.geometry.computeBoundingBox();
ball.geometry.boundingBox!.getSize(size);
const hull = new THREE.Mesh(ball.geometry, ink);
hull.scale.set(1 + (2 * thick) / size.x, 1 + (2 * thick) / size.y, 1 + (2 * thick) / size.z);
hull.raycast = () => {}; // 클릭 판정에서 빼기
ball.add(hull);

// 4) 톤 매핑은 끄고 빛 세기로 밝기를 맞춘다
renderer.toneMapping = THREE.NoToneMapping;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa86a, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.6);
sun.position.set(-3, 5, 4);
scene.add(sun);

// 단계 바꾸기: grad.image.data.set([v, 168, 255]); grad.needsUpdate = true;`,
    },
    pitfalls: [
      { title: '톤 매핑을 켜 둔 채 쓰면 계단이 흐려진다', fix: 'ACES · Neutral 톤 매핑이 색을 다시 휘게 만든다. 툰 장면은 NoToneMapping 으로 두고 빛 세기를 낮춰 맞춘다.', seen: true },
      { title: '계단 텍스처를 기본 필터로 두면 그러데이션이 된다', fix: 'DataTexture 의 minFilter · magFilter 를 NearestFilter 로.' },
      { title: '얇은 판 · 투명한 것에 외곽선을 붙이면 지저분하다', fix: '바닥 판 · 유리 · 아주 작은 조각(0.1 미만)은 건너뛴다. 이 사이트의 toonify 도구는 크기 · 투명 여부로 거른다.', seen: true },
      { title: '모든 껍데기를 같은 비율로 키우면 큰 물체만 외곽선이 두껍다', fix: '물체 크기에 반비례하게 키워 화면 두께를 맞춘다 (1 + 2·두께 / 크기).', seen: true },
      { title: '위에서 내려다보는 구도에선 외곽선이 가늘어 보인다', fix: '빵빵 주차장은 0.045 로 굵게, 그림자는 PCFShadowMap 으로 또렷하게 해서 맞췄다.', seen: true },
    ],
    prev: ['u14', 'u17'],
    next: ['u02', 'u03'],
    refs: [
      { name: 'three.js 예제 — webgl_materials_variations_toon', url: 'https://threejs.org/examples/#webgl_materials_variations_toon' },
      { name: 'three.js 소스 — MeshToonMaterial', url: 'https://github.com/mrdoob/three.js/blob/dev/src/materials/MeshToonMaterial.js' },
    ],
  },

  i385: {
    id: 'i385',
    summary: '처음 보이는 효과의 셰이더가 그 순간 컴파일되며 화면이 멈칫하는 것을, 로딩 중에 미리 컴파일해 없앤다.',
    terms: [
      { en: 'Shader warm-up (pre-compile)', ko: '셰이더 미리 데우기' },
      { en: 'WebGLRenderer.compileAsync', ko: 'three.js 비동기 컴파일 (r158+)' },
      { en: 'KHR_parallel_shader_compile', ko: '메인 스레드를 막지 않는 병렬 컴파일 확장' },
      { en: 'Frame hitch / stutter', ko: '프레임 멈칫' },
    ],
    goal: '{target}이(가) 처음 나올 때 멈칫하지 않도록, 판을 여는 동안 셰이더를 미리 컴파일해 줘. 화면은 {style}.',
    targets: ['첫 폭발 · 마법 효과', '처음 등장하는 캐릭터', '게임 시작 화면'],
    styles: ['로딩 바가 있는 시작 화면', '로딩 없이 바로 시작', '게임 중 장면 전환'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 ShaderVariantCollection 을 만들어 WarmUp() 하거나 Graphics Settings 의 Preloaded Shaders 에 넣는다.',
      godot: 'Godot 4 는 첫 프레임 전에 효과 노드를 화면 밖에 잠깐 보이게 두거나, 프로젝트 설정의 셰이더 캐시를 켠다.',
    },
    principle: [
      '재질 종류 · 조명 수 · 그림자 · 안개 조합마다 GPU 프로그램(셰이더)이 하나씩 만들어진다.',
      '처음 그 조합이 화면에 나오는 프레임에 컴파일이 일어나 수십~수백 ms 멈춘다 (윈도는 D3D 변환까지 더해져 더 길다).',
      'renderer.compileAsync(scene, camera) 는 장면의 보이는 물체 셰이더를 병렬로 컴파일하고 끝나면 Promise 가 풀린다.',
      '로딩 화면 동안 앞으로 쓸 효과를 장면에 넣고 데운 뒤 숨기면, 게임 중에는 컴파일이 일어나지 않는다.',
    ],
    when: ['첫 폭발 · 첫 피격 · 첫 장면 전환에서 화면이 한 번 멈칫할 때', '물리 재질(clearcoat · transmission)처럼 셰이더가 긴 재질을 쓸 때'],
    avoid: ['재질이 몇 개뿐이고 첫 화면에 모두 보이는 단순한 장면 — 이미 첫 프레임에 컴파일된다'],
    cost: 'light',
    costNote: '게임 중 비용은 없다. 로딩 시간만 조금 늘어난다 (병렬이라 화면은 멈추지 않음).',
    level: 2,
    must: [
      '데울 때의 조명 수 · 그림자 켬/끔 · 안개가 실제 게임 때와 같아야 한다 (다르면 다른 셰이더가 데워진다)',
      'compileAsync 는 보이는(visible) 물체만 컴파일하니, 숨겨 둔 효과는 데우는 동안만 visible = true',
      '데우는 동안에도 화면(로딩 바)이 멈추지 않게 — await 로 기다리기',
      '실제로 효과가 있는지 프레임 시간 그래프(첫 등장 프레임 ms)로 전/후를 재서 보여 주기',
    ],
    done: [
      '「미리 데우기 끔」에서는 첫 효과 순간 프레임 그래프에 큰 막대(수십 ms 이상)가 보인다',
      '「켬」에서는 그 막대가 로딩 구간으로 옮겨 가고, 게임 중엔 모두 16ms 근처다',
      '「진짜로 재기」 단추가 이 기기의 첫 그리기 · 두 번째 그리기 · 데운 뒤 첫 그리기 ms 를 보여 준다',
    ],
    code: {
      lang: 'ts',
      title: '로딩 중에 효과를 데우고, 전/후를 실제로 재기',
      from: 'demos/demosPerf.ts measureShader() 를 정리',
      body: `/** 판을 여는 동안 — 앞으로 쓸 효과 메시를 잠깐 보이게 두고 비동기 컴파일 */
async function prewarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, fx: THREE.Object3D[]) {
  const was = fx.map((o) => o.visible);
  fx.forEach((o) => { o.visible = true; scene.add(o); }); // compileAsync 는 보이는 것만 본다
  await renderer.compileAsync(scene, camera);              // 병렬 컴파일 — 로딩 바는 계속 움직인다
  fx.forEach((o, i) => (o.visible = was[i]!));
}

/** 정말 효과가 있는지 재기 — readPixels 로 GPU 를 기다려야 진짜 시간이 나온다 */
function timeRender(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera): number {
  const gl = r.getContext();
  const px = new Uint8Array(4);
  const t0 = performance.now();
  r.render(scene, cam);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return performance.now() - t0;
}

const cold = timeRender(renderer, scene, cam);  // 새 재질 첫 그리기: 수십~수백 ms
const warm = timeRender(renderer, scene, cam);  // 두 번째: 1ms 안팎
// 다른 새 재질로: await renderer.compileAsync(scene, cam) 뒤 첫 그리기도 1ms 안팎이면 성공`,
    },
    pitfalls: [
      { title: '반복문으로 잡음을 여러 번 부르는 셰이더는 윈도에서 컴파일이 17~20초', fix: '보물 동굴 게임에서 실제로 겪었다. 잡음은 미리 구운 텍스처로 읽고, 값은 uniform 으로 돌려 셰이더 종류를 하나로.', seen: true },
      { title: '데울 때와 놀 때의 그림자 · 조명 설정이 다르면 헛일', fix: '그림자 켬/끔 · 빛 개수 · 안개가 셰이더 열쇠에 들어간다. 이 사이트 견본은 같은 설정으로 감싸서(withShadows) 데운다.', seen: true },
      { title: '숨겨 둔(visible=false) 효과는 데워지지 않는다', fix: 'compile 은 traverseVisible 로 돈다. 데우는 동안만 보이게 했다가 되돌린다.' },
      { title: 'customProgramCacheKey 를 매번 다르게 주면 늘 새로 컴파일', fix: '같은 셰이더는 같은 열쇠를. 무작위 열쇠는 재기 실험에서만.' },
      { title: '데우는 동안 오류 검사가 GPU 를 기다리게 한다', fix: '미리 굽는 동안만 renderer.debug.checkShaderErrors = false 로 두면 병렬 컴파일이 제대로 병렬이 된다.', seen: true },
    ],
    prev: ['u21'],
    next: ['i446', 'i477'],
    refs: [
      { name: 'three.js 소스 — WebGLRenderer (compileAsync)', url: 'https://github.com/mrdoob/three.js/blob/dev/src/renderers/WebGLRenderer.js' },
      { name: 'Khronos — KHR_parallel_shader_compile', url: 'https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/' },
    ],
    source: [{ file: 'demosPerf.ts', symbol: 'measureShader' }, { file: 'demosPerf.ts', symbol: 'demo385' }],
  },

  i446: {
    id: 'i446',
    summary: '구 · 캡슐 · 타원체의 거리 함수를 부드럽게 녹여 붙인 뒤 메시로 바꿔, 점토로 빚은 듯한 캐릭터를 코드로 만든다.',
    terms: [
      { en: 'SDF (signed distance field)', ko: '부호 있는 거리장 — 표면까지 거리, 안쪽은 음수' },
      { en: 'Smooth union (polynomial smin)', ko: '부드럽게 합치기 — 이음매가 둥글게 녹아 붙음' },
      { en: 'Marching cubes', ko: '격자 값에서 표면 삼각형을 뽑는 방법' },
      { en: 'SDF gradient normals', ko: '거리장 기울기로 구한 매끈한 법선' },
    ],
    goal: '{target}을(를) SDF 조각 모델링으로 만들어 줘 — 기본 도형 거리 함수를 smooth union 으로 붙이고 마칭 큐브로 메시. 느낌은 {style}.',
    targets: ['점토 곰돌이 캐릭터', '버섯 · 생물', '말랑한 슬라임'],
    styles: ['말랑한 점토 인형', '반들반들 플라스틱 장난감', '부드러운 파스텔'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 C# 로 같은 거리 함수 · smin 을 쓰고, 마칭 큐브는 Job System + Burst 로 돌려 Mesh 에 넣는다.',
      godot: 'Godot 은 GDScript 대신 C# 또는 GDExtension 으로 마칭 큐브를 돌리고 ArrayMesh 로 만든다 (GDScript 는 느리다).',
    },
    principle: [
      'SDF 는 「이 점에서 표면까지 거리」를 돌려주는 함수다. 구는 |p − c| − r 한 줄.',
      '두 모양의 합은 min(a, b) — 이음매가 각지다. smin(a, b, k) 은 k 만큼 둥글게 녹여 붙인다.',
      '공간을 격자로 나눠 각 점의 거리를 재고, 마칭 큐브가 거리 0 인 곳을 삼각형으로 잇는다.',
      '법선은 거리장의 기울기(조금씩 옮겨 잰 차이)로 구하면 계단 없이 매끈하다.',
      '색도 smin 의 섞기 비율로 같이 섞으면 부위 사이 색이 자연스럽게 번진다.',
    ],
    when: ['블렌더 없이 귀여운 캐릭터 · 생물을 코드로 만들 때', '부위 크기를 슬라이더로 바꾸는 캐릭터 만들기 화면'],
    avoid: ['각진 하드서피스(기계 · 건물) — 박스 모델링이 낫다', '매 프레임 모양이 바뀌는 큰 물체 — 굽는 비용이 크다 (메타볼 셰이더를 고려)'],
    cost: 'heavy',
    costNote: '격자 해상도의 세제곱만큼 계산한다 (64³ = 26만 점 × 부위 수). 한 번 굽고 나면 보통 메시라 가볍다 — 굽기는 프레임마다 1~3ms 씩 나눠서.',
    level: 3,
    must: [
      '굽기는 한 프레임에 몰지 말고 프레임당 1~3ms 예산으로 나눠서 (제너레이터 · yield), 그동안 「빚는 중」 표시',
      '법선은 거리장 중심 차분으로 계산 (computeVertexNormals 의 각진 면 금지)',
      '부위마다 k(녹는 정도)를 따로 — 귀 · 코는 작게, 머리-몸은 크게',
      '외부 라이브러리 없이 (three/examples 의 MarchingCubes 는 사용 가능)',
    ],
    done: [
      '구 · 캡슐 · 타원체가 하나씩 녹아 붙으며 곰돌이 모양이 완성되는 과정이 보인다',
      '이음매에 각진 선이 없고, 「녹는 정도 k」 슬라이더를 올리면 이음매가 두툼해진다',
      '해상도 슬라이더를 바꿔도 화면이 멈추지 않는다 (나눠 굽기)',
      '굽는 동안에도 60fps 유지',
    ],
    code: {
      lang: 'ts',
      title: '거리 함수 + smooth union + 마칭 큐브',
      from: 'demos/demosModelA.ts sdf() · primD() 의 식을 three/examples MarchingCubes 로 짧게 다시 씀',
      body: `import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

type V = [number, number, number];
const sphere = (p: V, c: V, r: number) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
const capsule = (p: V, a: V, b: V, r: number) => {
  const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], pa = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const h = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] ** 2 + ba[1] ** 2 + ba[2] ** 2)));
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
};
// 부드럽게 합치기 — k 가 클수록 이음매가 두툼하게 녹는다
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const bear = (p: V) => {
  let d = sphere(p, [0, -0.35, 0], 0.42);                     // 몸
  d = smin(d, sphere(p, [0, 0.3, 0], 0.34), 0.16);           // 머리
  d = smin(d, sphere(p, [-0.26, 0.6, 0], 0.11), 0.09);       // 귀
  d = smin(d, sphere(p, [0.26, 0.6, 0], 0.11), 0.09);
  d = smin(d, capsule(p, [-0.34, -0.2, 0.05], [-0.5, -0.45, 0.15], 0.1), 0.1); // 팔
  return smin(d, capsule(p, [0.34, -0.2, 0.05], [0.5, -0.45, 0.15], 0.1), 0.1);
};

const N = 64;
const mc = new MarchingCubes(N, new THREE.MeshPhysicalMaterial({ color: 0xf0a35e, roughness: 0.55, sheen: 0.4 }), false, false, 120000);
mc.isolation = 0; // 값 > 0 = 안쪽
for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++)
  mc.field[x + y * N + z * N * N] = -bear([(x * 2) / N - 1, (y * 2) / N - 1, (z * 2) / N - 1]); // 안쪽 좌표 -1..1
mc.update();
scene.add(mc); // 크기는 mc.scale 로`,
    },
    pitfalls: [
      { title: '한 번에 다 구우면 화면이 수백 ms 멈춘다', fix: '이 사이트 견본은 z 층마다 yield 하는 제너레이터로 프레임당 1~3ms 만 굽고, 그동안 이전 해상도 메시를 보여 준다.', seen: true },
      { title: 'k 를 너무 크게 하면 작은 부위(귀 · 코)가 녹아 사라진다', fix: '부위 크기의 절반 이하로. 부위마다 k 를 따로 둔다.' },
      { title: '각진 법선 (computeVertexNormals) 은 점토 느낌을 망친다', fix: '거리장을 ±e 만큼 옮겨 잰 차이(중심 차분)로 법선을 만든다.', seen: true },
      { title: '격자 밖으로 나간 부위는 잘린다', fix: '모델 전체가 격자 안쪽(테두리 한 칸 안)에 들어오게 범위를 잡는다.' },
      { title: '타원체 거리는 정확한 거리가 아니다', fix: '근사식((k0·(k0−1))/k1)을 쓰고, 매우 납작한 타원은 피한다.' },
    ],
    prev: ['i447', 'u30'],
    next: ['i456', 'i457'],
    refs: [
      { name: 'Inigo Quilez — smooth minimum', url: 'https://iquilezles.org/articles/smin/' },
      { name: 'Inigo Quilez — distance functions', url: 'https://iquilezles.org/articles/distfunctions/' },
      { name: 'three.js 예제 — webgl_marchingcubes', url: 'https://threejs.org/examples/#webgl_marchingcubes' },
    ],
    source: [{ file: 'demosModelA.ts', symbol: 'sdf' }, { file: 'demosModelA.ts', symbol: 'primD' }, { file: 'demosModelA.ts', symbol: 'demoSdf' }],
  },

  i459: {
    id: 'i459',
    summary: '위팔 · 아래팔 길이와 목표 위치만으로 어깨 · 팔꿈치 각도를 계산해, 손이 목표를 따라가게 한다.',
    terms: [
      { en: 'Two-bone IK', ko: '뼈 두 개짜리 역운동학 (팔 · 다리)' },
      { en: 'Law of cosines', ko: '코사인 법칙 — 세 변 길이로 각 구하기' },
      { en: 'Pole vector', ko: '팔꿈치 · 무릎이 향할 쪽' },
      { en: 'Quaternion.setFromUnitVectors', ko: '방향 → 방향 회전' },
    ],
    goal: '{target}에 두 뼈 IK 를 넣어 줘 — 목표 점을 움직이면 손(발)이 따라가고, 팔꿈치(무릎) 방향은 pole 로 정해. 화면은 {style}.',
    targets: ['캐릭터 팔이 공을 잡기', '다리가 계단을 딛기', '로봇 팔'],
    styles: ['뼈와 관절이 보이는 설명 화면', '귀여운 캐릭터', '기계 · 로봇'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animation Rigging 패키지의 Two Bone IK Constraint (Target · Hint) 가 같은 일을 한다. 직접 짜려면 같은 코사인 법칙.',
      godot: 'Godot 4 는 SkeletonModifier3D 계열(TwoBoneIK3D 등 버전별 이름 확인) 또는 같은 식을 GDScript 로.',
    },
    principle: [
      '어깨 A, 위팔 길이 a, 아래팔 길이 b, 목표 T 가 있으면 삼각형 세 변(a, b, |T−A|)을 안다.',
      '코사인 법칙 cos∠A = (a² + d² − b²) / (2ad) 로 어깨에서 꺾을 각이 나온다.',
      '그 각만큼 목표 방향에서 pole 쪽으로 돌린 곳이 팔꿈치 자리다.',
      '닿지 않는 거리면 d 를 a+b 로 줄여 팔을 쭉 뻗는다 (떨림 방지로 아주 조금 덜).',
      '뼈에는 「쉼 자세 방향 → 새 방향」 회전(setFromUnitVectors)을 넣는다.',
    ],
    when: ['손으로 물건 잡기 · 문고리 · 발 딛기처럼 끝점이 정확해야 할 때', '애니메이션 파일 없이 캐릭터 동작을 만들 때'],
    avoid: ['관절이 셋 이상인 사슬(꼬리 · 촉수) — FABRIK · CCD 가 맞다'],
    cost: 'light',
    costNote: '팔 하나에 제곱근 · 벡터 몇 번 — 수백 개를 돌려도 가볍다.',
    level: 2,
    must: [
      '닿지 않을 때 d 를 |a−b|+ε ~ a+b−ε 로 묶어 팔이 떨리지 않게',
      'pole 은 목표 방향에 수직인 성분만 써서 팔꿈치가 뒤집히지 않게',
      '부모 뼈 좌표로 바꿔 계산 (부모가 움직여도 맞게)',
      '목표 · 팔꿈치 · pole 을 작은 공 · 선으로 보여 주는 보기 단추',
    ],
    done: [
      '목표 공을 움직이면 손이 정확히 공에 닿고, 팔 길이는 변하지 않는다',
      '공이 너무 멀면 팔을 쭉 뻗어 공 쪽을 가리킨다 (떨림 없음)',
      'pole 을 바꾸면 손은 그대로, 팔꿈치만 다른 쪽으로 꺾인다',
    ],
    code: {
      lang: 'ts',
      title: '코사인 법칙으로 팔꿈치 자리 구하기 + 뼈에 넣기',
      from: 'demos/demosRigA.ts twoBoneIK() 를 세계 좌표 판으로 정리',
      body: `/** A 어깨 · a 위팔 · b 아래팔 · T 목표 · pole 팔꿈치가 향할 쪽 (모두 같은 좌표계) */
function solveTwoBone(A: THREE.Vector3, a: number, b: number, T: THREE.Vector3, pole: THREE.Vector3) {
  const d = T.clone().sub(A);
  const raw = d.length();
  const len = THREE.MathUtils.clamp(raw, Math.abs(a - b) + 1e-4, a + b - 1e-4); // 닿지 않으면 쭉 뻗기
  d.normalize();
  const cosA = THREE.MathUtils.clamp((a * a + len * len - b * b) / (2 * a * len), -1, 1); // 코사인 법칙
  const sinA = Math.sqrt(1 - cosA * cosA);
  const P = pole.clone().addScaledVector(d, -pole.dot(d)).normalize(); // pole 을 d 에 수직으로
  const elbow = A.clone().addScaledVector(d, a * cosA).addScaledVector(P, a * sinA);
  const hand = A.clone().addScaledVector(d, len);
  return { elbow, hand, reached: raw <= a + b };
}

// 뼈에 넣기 (upper · mid 의 쉼 자세 회전이 단위일 때, 좌표는 upper 의 부모 기준)
const { elbow, hand } = solveTwoBone(upper.position, mid.position.length(), handLocal.length(), targetLocal, poleLocal);
const qU = new THREE.Quaternion().setFromUnitVectors(mid.position.clone().normalize(), elbow.clone().sub(upper.position).normalize());
upper.quaternion.copy(qU);
const dirInUpper = hand.clone().sub(elbow).normalize().applyQuaternion(qU.clone().invert());
mid.quaternion.setFromUnitVectors(handLocal.clone().normalize(), dirInUpper);`,
    },
    pitfalls: [
      { title: '쭉 뻗을 때 팔이 부르르 떤다', fix: '거리를 a+b 바로 아래(−1e-4)로 묶는다. 정확히 a+b 면 sin 이 0 근처라 방향이 흔들린다.', seen: true },
      { title: '팔꿈치가 갑자기 반대로 꺾인다', fix: 'pole 이 목표 방향과 거의 나란하면 수직 성분이 0 이 된다. 그럴 땐 다른 기본 축으로 대체.', seen: true },
      { title: '쉼 자세 회전이 있는 뼈(불러온 모델)에선 각도가 틀어진다', fix: '견본은 코드로 세운 뼈라 쉼 회전이 단위다. 불러온 모델은 쉼 회전을 곱해 두고 차이만 돌린다.', seen: true },
      { title: '부모가 움직였는데 세계 좌표로 계산', fix: '목표 · pole 을 upper 의 부모 좌표로 바꿔서 계산한다 (matrixWorld 역행렬).' },
    ],
    prev: ['i456'],
    next: ['i458', 'i462'],
    refs: [
      { name: 'three.js 예제 — webgl_animation_skinning_ik', url: 'https://threejs.org/examples/#webgl_animation_skinning_ik' },
      { name: 'Wikipedia — Law of cosines', url: 'https://en.wikipedia.org/wiki/Law_of_cosines' },
    ],
    source: [{ file: 'demosRigA.ts', symbol: 'twoBoneIK' }],
  },

  i484: {
    id: 'i484',
    summary: '칼이 지난 프레임부터 지금까지 쓸고 간 부채꼴로 맞음을 판정하고, 맞는 순간 잠깐 멈춤 · 번쩍 · 밀려남으로 손맛을 준다.',
    terms: [
      { en: 'Swept hit detection', ko: '쓸기 판정 — 이전 자세 ~ 지금 자세 사이 전체로 판정' },
      { en: 'Hitstop (hit pause)', ko: '맞는 순간 잠깐 멈춤' },
      { en: 'Knockback', ko: '맞고 밀려남 (속도 + 지수 감쇠)' },
      { en: 'Damage popup · screen shake', ko: '데미지 숫자 · 화면 흔들림' },
    ],
    goal: '{target}에 근접 공격 판정을 만들어 줘 — 무기가 쓸고 간 부채꼴로 맞음을 재고, 맞으면 히트스톱 · 번쩍 · 넉백 · 데미지 숫자. 분위기는 {style}.',
    targets: ['쿼터뷰 액션의 칼 휘두르기', '귀여운 슬라임 때리기', '보스 전투'],
    styles: ['통쾌한 액션', '귀엽고 말랑한', '묵직하고 진지한'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Physics.OverlapSphere/CapsuleCast 로 쓸기 판정, 히트스톱은 맞은 쪽 Animator.speed = 0 (Time.timeScale 은 UI 까지 멈춘다).',
      godot: 'Godot 은 ShapeCast3D 로 쓸기, 히트스톱은 AnimationPlayer.speed_scale = 0 을 짧게.',
    },
    principle: [
      '빠른 칼은 한 프레임에 크게 돌아서, 지금 자세만 검사하면 적을 그냥 지나친다 (터널링).',
      '그래서 지난 프레임 각도 ~ 지금 각도 사이 부채꼴 전체와 적의 원이 겹치는지 본다.',
      '한 번 휘두를 때 한 번만 맞게 hit 표시를 둔다.',
      '맞는 순간 때린 쪽 · 맞은 쪽의 시간을 50~100ms 멈추면(히트스톱) 「묵직하게 맞았다」고 느낀다.',
      '넉백은 속도를 주고 매 프레임 지수로 줄인다 (v *= exp(−k·dt)) — 프레임 수와 상관없이 같은 거리.',
    ],
    when: ['칼 · 망치 · 주먹처럼 휘두르는 근접 공격', '맞았는지 잘 모르겠다는 말을 들을 때 — 손맛(주스)을 더할 때'],
    avoid: ['총알처럼 빠른 직선 투사체 — 광선(레이) 쓸기가 맞다', '턴제 · 퍼즐 — 히트스톱은 리듬을 깬다'],
    cost: 'light',
    costNote: '적 하나에 각도 비교 몇 번. 데미지 숫자는 캔버스 텍스처를 돌려 쓰면 가볍다.',
    level: 2,
    must: [
      '판정은 지금 자세 하나가 아니라 이전 프레임 ~ 지금 사이 쓸기로 (프레임이 떨어져도 안 빠지게)',
      '히트스톱은 전체 게임 시간이 아니라 때린 쪽 · 맞은 쪽의 시간만 멈추기 (UI · 다른 적은 계속)',
      '넉백 · 흔들림은 dt 기반 지수 감쇠 — 60 · 120Hz 화면에서 같은 결과',
      '판정 넓이(쓸기 부채꼴)를 눈으로 볼 수 있는 보기 단추',
    ],
    done: [
      '왼쪽(숫자만) · 오른쪽(히트스톱 · 번쩍 · 넉백 · 흔들림)을 나란히 두면, 오른쪽이 확실히 「세게 맞은」 느낌',
      '휘두를 때 부채꼴 판정 영역이 보이고, 겹치는 순간 빨갛게 바뀐다',
      '「히트스톱 (초)」 슬라이더 0 ~ 0.25 로 느낌 차이를 비교할 수 있다',
      '프레임을 일부러 떨어뜨려도(30fps) 맞음이 빠지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '쓸기 판정 + 히트스톱 + 넉백 (한 프레임)',
      from: 'demos/demosGame3dB.ts sweepHits() · demoCombat() update 를 정리',
      body: `const BLADE0 = 0.35, BLADE1 = 1.4; // 칼날이 닿는 거리 (손잡이 ~ 끝)

/** 쓸기 부채꼴 [prev, cur] 가 적의 원(거리 d · 각 phi · 반지름 r)과 겹치나 */
function sweepHits(cur: number, prev: number, d: number, phi: number, r: number): boolean {
  if (d - r > BLADE1 || d + r < BLADE0) return false;
  const del = Math.asin(Math.min(1, r / Math.max(d, 1e-3))); // 원이 차지하는 반각
  return phi + del >= Math.min(cur, prev) && phi - del <= Math.max(cur, prev);
}

let stop = 0, hit = false, kb = 0, kbv = 0, prevYaw = REST;
function update(dt: number, yaw: number, swinging: boolean, enemy: { d: number; phi: number }) {
  const dtl = stop > 0 ? 0 : dt;          // 히트스톱 동안 이 싸움의 시간만 멈춘다
  if (stop > 0) stop -= dt;
  if (swinging && !hit && dtl > 0 && sweepHits(yaw, prevYaw, enemy.d, enemy.phi, 0.42)) {
    hit = true;                            // 한 번 휘두를 때 한 번만
    stop = 0.06;                           // 60ms 멈춤
    kbv = 5.2;                             // 넉백 속도
    flash = 1; shake = 1; squash = 1;      // 번쩍 · 흔들림 · 찌그러짐 (각자 dt 로 줄어듦)
    showDamage(18 + Math.floor(Math.random() * 30));
  }
  kb += kbv * dtl;
  kbv *= Math.exp(-dtl * 7.5);             // 지수 감쇠 — 화면 주사율과 상관없이 같은 거리
  if (dtl > 0) prevYaw = yaw;
  if (!swinging) hit = false;
}`,
    },
    pitfalls: [
      { title: '지금 자세만 검사하면 빠른 칼이 적을 통과한다', fix: '이전 각 ~ 지금 각 부채꼴로 쓸기. 견본은 그 부채꼴을 셰이더로 바닥에 그려 보여 준다.', seen: true },
      { title: 'Time.timeScale 같은 전체 멈춤으로 히트스톱을 하면 UI · 소리까지 멈춘다', fix: '때린 쪽 · 맞은 쪽의 시간(dtl)만 0 으로. 견본은 두 줄이 각자 멈춘다.', seen: true },
      { title: '각도가 ±π 를 넘어가면 부채꼴이 뒤집힌다', fix: '휘두르는 동안 각도를 감지 말고(unwrap) 이어지게 쓰거나, 비교 전에 같은 구간으로 맞춘다.' },
      { title: '넉백을 「프레임마다 0.9 배」로 줄이면 120Hz 화면에서 덜 밀린다', fix: 'exp(−k·dt) 로 줄인다.' },
      { title: '히트스톱이 너무 길면 끊겨 보인다', fix: '보통 0.04 ~ 0.1초. 큰 공격만 길게.' },
    ],
    prev: ['i480', 'u38'],
    next: ['i490', 'i481'],
    source: [{ file: 'demosGame3dB.ts', symbol: 'sweepHits' }, { file: 'demosGame3dB.ts', symbol: 'demoCombat' }],
  },
};

import type { TechDoc } from './types';

/**
 * 기술 문서 Z3 — i498 군중 (구운 뼈 애니메이션 텍스처) 를 다시 만든 견본 기준으로.
 * docsB03.ts 의 같은 id 를 덮는다 (glob 에서 뒤에 모이는 파일이 이긴다).
 * 코드는 demos/demosWebGPU.ts 의 bakeBones · VAT_SKIN · injectVat 에서 발췌했다.
 */
export const DOCS: Record<string, TechDoc> = {
  i498: {
    id: 'i498',
    summary: '뼈 애니메이션을 프레임마다 뼈 행렬 텍스처 한 장에 구워 두고, 정점 셰이더가 사람마다 다른 클립 · 박자로 읽어 스키닝해 수천 명을 그리기 한 번으로 움직인다.',
    terms: [
      { en: 'Baked animation texture (bone-matrix VAT, GPU crowd skinning)', ko: '뼈 행렬을 텍스처에 구워 정점 셰이더에서 스키닝하는 군중 기법' },
      { en: 'InstancedMesh + skinIndex / skinWeight', ko: '같은 캐릭터 수천 개를 한 번에 — 스킨 속성은 그대로 둔다' },
      { en: 'DataTexture (RGBA32F) · texelFetch', ko: '실수 텍스처 한 장 · 정수 좌표로 텍셀 하나를 그대로 읽기' },
      { en: 'AnimationClip · AnimationMixer.setTime', ko: '굽기 때 클립을 원하는 시각의 자세로 맞추는 방법' },
    ],
    goal: '{target}을(를) 뼈 애니메이션 텍스처 굽기로 수천 명 띄워 줘 — 클립(걷기 · 뛰기 · 손 흔들기)을 뼈 행렬 텍스처에 굽고, InstancedMesh 하나가 정점 셰이더에서 사람마다 다른 클립 · 박자로 스키닝. 분위기는 {style}.',
    targets: ['광장을 걷고 뛰고 손 흔드는 블록 사람 군중', '경기장 관중 (앉기 · 환호 · 손뼉)', '행진하는 병사 떼'],
    styles: ['밝은 낮 광장, 알록달록한 블록 장난감', '귀엽고 아기자기', '웅장한 전쟁 영화'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 방식을 직접 짠다 — 뼈 행렬을 Texture2D(RGBAFloat) 에 굽고 Graphics.RenderMeshInstanced + 정점 셰이더에서 읽기 (예: Unity 의 「GPU Animation Instancing」 공개 예제).',
      godot: 'Godot 은 MultiMeshInstance3D + 정점 셰이더(INSTANCE_CUSTOM 으로 클립 · 위상)에서 구운 텍스처를 texelFetch.',
    },
    principle: [
      '캐릭터는 보통 SkinnedMesh 처럼 만든다: 뼈 계층(Bone) + 정점마다 skinIndex · skinWeight. 무릎 · 팔꿈치 둘레는 위 · 아래 뼈에 가중치를 나눠야 굽힐 때 안 찢어진다.',
      '굽기: 클립마다 30fps 로 mixer.setTime(t) → 뼈마다 행렬 = bone.matrixWorld × boneInverse 를 텍스처 한 줄에. 가로 = 뼈 × 4 텍셀(행렬 열 넷), 세로 = 프레임 (클립들을 이어 붙임).',
      '그리기: InstancedMesh 하나 + 사람마다 속성 aAnim(클립 번호 · 시작 위상 · 박자). 정점 셰이더에서 f = fract(시간 × 박자 / 길이 + 위상) × 프레임 수 → 줄 둘을 읽어 사이 비율로 섞는다.',
      '스킨 행렬 = Σ 가중치 × 뼈 행렬, 정점과 법선에 곱한 뒤 instanceMatrix 로 제자리에. 그림자도 같은 식(customDepthMaterial)이라 그리기 1번 + 그림자 1번.',
      '걸음 박자는 실제 이동 속력에 맞춘다: 박자 = 속력 ÷ (한 바퀴에 나아가는 거리) × 클립 길이. 그래야 발이 미끄러지지 않는다.',
    ],
    when: ['관중 · 행진 · 떼처럼 같은 캐릭터가 수백 ~ 수천 명 움직여야 할 때', 'SkinnedMesh 를 사람마다 두면 그리기 호출 · AnimationMixer 계산으로 CPU 가 막힐 때', '동작이 몇 가지 정해진 클립(걷기 · 뛰기 · 손 흔들기)으로 충분할 때'],
    avoid: [
      '가까이서 보는 주인공 — 클립 섞기 · IK · 몸짓 반응이 필요하면 SkinnedMesh + AnimationMixer(i464) 그대로',
      '사람마다 동작이 계속 새로 바뀌는(래그돌 · 손으로 잡기) 장면 — 구운 클립 밖의 자세는 못 낸다. 그때는 가까운 몇 명만 진짜 뼈대로 바꿔 끼운다',
    ],
    cost: 'medium',
    costNote: 'CPU 는 인스턴스 행렬 쓰기뿐 (5,000명 ≈ 0.5ms), 그리기 2번. GPU 는 정점마다 texelFetch 16번(뼈 둘 × 두 프레임 × 4). 텍스처는 44 × 84 × 16바이트 ≈ 59KB. 같은 1,000명을 SkinnedMesh 로 두면 그리기 약 1,900번 · 24fps.',
    level: 3,
    must: [
      '캐릭터는 코드로 SkinnedMesh + Bone 계층, 정점 가중치는 관절(무릎 · 팔꿈치) 둘레에서 위 · 아래 뼈에 나눠 줄 것 — 상자마다 뼈 하나만 주면 굽힐 때 찢어진다',
      '굽는 값은 bone.matrixWorld × skeleton.boneInverses[b] (캐릭터는 원점 · 단위 행렬에서 bind) — matrixWorld 만 구우면 정점이 두 번 옮겨진다',
      '텍스처는 DataTexture(Float32Array, RGBAFormat, FloatType) · NearestFilter · 밉맵 끔, 셰이더에서 texelFetch 로 정수 좌표 읽기 (보간은 셰이더에서 두 프레임을 직접 섞는다)',
      '정점 속성은 16칸뿐 — instanceMatrix 가 4칸을 먹으니 사람마다 값(클립 · 위상 · 박자)은 vec3 하나로 묶는다',
      'InstancedMesh.frustumCulled = false, 그림자는 customDepthMaterial 에도 같은 스키닝 식을 넣기 (안 넣으면 그림자만 차렷 자세)',
    ],
    done: [
      '광장에 5,000명이 걷고 뛰고 손을 흔드는데 화면 구석 그리기 수가 군중 몫 2번(몸 + 그림자)으로 그대로다',
      '「SkinnedMesh 로 그렸다면」을 켜면 1,000명만으로 그리기가 천 단위로 늘고 fps 가 뚝 떨어진다 — 끄면 바로 돌아온다',
      '「구운 텍스처 보기」로 뼈 × 프레임 텍스처가 구석에 확대되고, 흰 줄(사람 하나가 지금 읽는 프레임)이 클립 구간 안에서 움직인다',
      '가까이 보면 무릎 · 팔꿈치가 매끄럽게 굽고, 「박자 모두 똑같이」를 켜기 전에는 이웃끼리 걸음이 다르다',
      '첫 만들기(굽기 포함)가 300ms 안 (견본 약 50ms, 굽기 약 7ms)',
    ],
    code: {
      lang: 'ts',
      title: '뼈 행렬을 텍스처에 굽고, 정점 셰이더에서 두 프레임을 읽어 스키닝',
      from: 'demos/demosWebGPU.ts bakeBones() · VAT_SKIN · injectVat() 를 정리',
      body: `// ① 굽기 — 클립마다 30fps, 한 줄 = 뼈 nb 개 × 행렬 열 4 텍셀
const data = new Float32Array(nb * 4 * rows * 4);
clips.forEach((clip, k) => {
  mixer.stopAllAction();
  mixer.clipAction(clip).play();
  for (let f = 0; f < info[k].frames; f++) {
    mixer.setTime((f / info[k].frames) * clip.duration);
    mesh.updateMatrixWorld(true);
    for (let b = 0; b < nb; b++) {
      m.multiplyMatrices(bones[b].matrixWorld, mesh.skeleton.boneInverses[b]);
      data.set(m.elements, ((info[k].start + f) * nb + b) * 16);
    }
  }
});
const tex = new THREE.DataTexture(data, nb * 4, rows, THREE.RGBAFormat, THREE.FloatType);
tex.minFilter = tex.magFilter = THREE.NearestFilter;
tex.needsUpdate = true;

// ② 정점 셰이더 (onBeforeCompile 로 skinbase_vertex 자리에) — aAnim = (클립, 위상, 박자)
const VAT_SKIN = [
  'vec4 c = uClip[int(aAnim.x + 0.5)];  // 시작 줄 · 프레임 수 · 길이',
  'float f = fract(uTime * aAnim.z / c.z + aAnim.y) * c.y;',
  'float f0 = floor(f); float ft = f - f0;',
  'int r0 = int(c.x + f0); int r1 = int(c.x + mod(f0 + 1.0, c.y));',
  'mat4 vatSkin = skinWeight.x * (vatBone(skinIndex.x, r0) * (1.0 - ft) + vatBone(skinIndex.x, r1) * ft)',
  '             + skinWeight.y * (vatBone(skinIndex.y, r0) * (1.0 - ft) + vatBone(skinIndex.y, r1) * ft);',
].join('\\n');
// skinnormal_vertex → objectNormal = (vatSkin * vec4(objectNormal, 0.0)).xyz;
// skinning_vertex  → transformed  = (vatSkin * vec4(transformed, 1.0)).xyz;
// vatBone(b, row) = mat4(texelFetch(uBones, ivec2(b*4 + 0..3, row), 0) 넷)`,
    },
    pitfalls: [
      { title: '인스턴스 속성을 여러 개 따로 붙이면 셰이더가 「Too many attributes」로 안 만들어진다', fix: '정점 속성은 16칸, instanceMatrix 가 4칸을 쓴다. 클립 · 위상 · 박자를 vec3 하나로, 쓰지 않는 uv 는 셰이더가 안 읽게 둔다.', seen: true },
      { title: '팔다리 상자를 뼈 하나에만 묶으면 무릎 · 팔꿈치에서 찢어지거나 접힌다', fix: '관절 높이 ± 반 칸 사이 정점은 위 · 아래 뼈에 선형으로 가중치를 나누고, 상자를 높이 방향으로 4칸 나눠 그 줄이 생기게 한다.' },
      { title: 'boneInverse 를 빼고 matrixWorld 만 구우면 몸이 두 배로 옮겨져 날아간다', fix: '스키닝 행렬은 「바인드 자세 → 지금 자세」 변환이다. bone.matrixWorld × boneInverse 를 굽는다.' },
      { title: '그림자가 차렷 자세로 남는다', fix: '그림자는 customDepthMaterial 로 그린다. MeshDepthMaterial 에도 같은 onBeforeCompile(스키닝 식)을 넣고 customProgramCacheKey 를 따로 준다.' },
      { title: '모두 같은 박자 · 같은 속력이면 군무처럼 어색하고, 박자와 속력이 안 맞으면 발이 미끄러진다', fix: '사람마다 시작 위상은 무작위, 박자는 이동 속력 ÷ 한 바퀴 거리 × 클립 길이로 맞춘다.' },
    ],
    prev: ['u36', 'i464'],
    next: ['i458', 'i494'],
    refs: [
      { name: 'three.js 소스 — skinning_vertex.glsl.js (기본 스키닝 식)', url: 'https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/skinning_vertex.glsl.js' },
      { name: 'three.js 예제 — webgl_instancing_dynamic', url: 'https://threejs.org/examples/#webgl_instancing_dynamic' },
    ],
    source: [
      { file: 'demosWebGPU.ts', symbol: 'i498' },
      { file: 'demosWebGPU.ts', symbol: 'bakeBones' },
      { file: 'demosWebGPU.ts', symbol: 'crowdGeometry' },
    ],
  },
};

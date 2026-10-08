import type { TechDoc } from './types';

/**
 * 기술 문서 묶음 B02 — 재질 · 그림체(u02 u04 u07 u08 u09 u10 i09~i13 i84 i221 i226 i229~i231)
 * · 후처리(u20 u21 i01~i07 i237~i239 i243 i496).
 * 코드는 견본(demos/demosMaterial · demosLight · demosLook2 · demosAirsup · demosWebGPU)의 실제 코드에서 발췌해 정리했다.
 */
export const DOCS: Record<string, TechDoc> = {
  u02: {
    id: 'u02',
    summary: '같은 모양을 조금 키워 뒷면만 검게 그려, 물체 가장자리에 만화 같은 테두리 선을 두른다.',
    terms: [
      { en: 'Inverted hull outline', ko: '뒤집은 껍데기 외곽선 — 뒷면만 그린 조금 큰 복제' },
      { en: 'side: THREE.BackSide', ko: '뒷면만 그리기 — 앞면은 원래 물체가 가린다' },
      { en: 'Cel / toon outline', ko: '셀 애니메이션 선' },
    ],
    goal: '{target}에 뒤집은 껍데기 방식 외곽선을 둘러 줘 — 조금 큰 같은 모양의 뒷면만 검게. 느낌은 {style}.',
    targets: ['공을 붙여 만든 곰 인형', '내 3D 캐릭터', '판 위 말 · 블록'],
    styles: ['밝은 애니메이션', '귀엽고 아기자기', '진한 만화책'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 두 번째 패스(Cull Front)에서 정점을 법선 쪽으로 밀어 검게 그린다. URP 는 Renderer Feature 의 Render Objects 로 덧그린다.',
      godot: 'Godot 은 재질의 Next Pass 에 Cull Front · Grow(grow_amount) 를 켠 단색 StandardMaterial3D 를 붙인다.',
    },
    principle: [
      '원래 물체와 같은 모양을 아주 조금 키운 「껍데기」를 겹쳐 둔다.',
      '껍데기는 뒷면(BackSide)만 검게 그린다. 앞쪽은 원래 물체가 가리고, 가장자리 밖으로 삐져나온 뒷면만 선으로 보인다.',
      '선 굵기를 고르게 하려면 부위 크기 r 에 반비례해 키운다: 배율 = 1 + 굵기 / r.',
      '눈 · 코 · 볼처럼 작은 조각은 껍데기를 붙이지 않아야 깔끔하다.',
    ],
    when: ['툰 셰이딩과 함께 만화 그림체를 만들 때', '공 · 캡슐을 붙여 만든 귀여운 캐릭터 · 소품', '배경에서 물체를 또렷이 떼어 보이고 싶을 때'],
    avoid: ['얇은 판 · 바닥 · 투명한 물체 — 껍데기가 지저분해진다. 대신 후처리 외곽선(i03)', '모서리가 날카로운 상자 — 크기만 키우면 모서리 선이 벌어진다. 대신 법선으로 미는 셰이더 외곽선'],
    cost: 'light',
    costNote: '재질은 단색이라 가볍지만 그리기 횟수가 물체 수만큼 2배가 된다. 수백 개면 합치거나 작은 조각은 건너뛴다.',
    level: 1,
    must: [
      '껍데기 재질은 MeshBasicMaterial + side: THREE.BackSide (빛 계산 없는 단색)',
      '껍데기는 원래 메시의 자식으로 같은 geometry 를 함께 쓴다 (새 모양을 만들지 않기)',
      '배율은 부위 반지름에 반비례 (1 + 굵기 / r) — 큰 부위만 선이 두꺼워지지 않게',
      '눈 · 코 · 볼 같은 작은 조각 · 투명한 것에는 껍데기를 붙이지 않기',
      '「선 굵기」 슬라이더와 껍데기를 빨간 반투명으로 들춰 보는 단추',
    ],
    done: [
      '왼쪽 선 없는 곰 · 오른쪽 껍데기 곰을 나란히 두면, 오른쪽에만 가장자리를 따라 고른 검은 선이 보인다',
      '곰이 돌고 흔들려도 선이 끊기지 않고 굵기가 같다',
      '「선 굵기」 0 ~ 0.12 슬라이더로 바로 바뀌고, 「들춰 보기」를 켜면 빨간 껍데기가 보인다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '부위마다 껍데기 붙이기 (크기에 반비례)',
      from: 'demos/demosMaterial.ts u02 make() 의 bear() · part() 를 정리',
      body: `const ink = new THREE.MeshBasicMaterial({ color: 0x1c1a2e, side: THREE.BackSide });
let thick = 0.045;                       // 화면에 보이는 선 굵기 (월드 단위)
const shells: THREE.Mesh[] = [];

/** 공 하나를 붙이고, outline 이면 같은 모양 껍데기를 자식으로 */
function part(g: THREE.Group, r: number, mat: THREE.Material, x: number, y: number, z: number, outline = true) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 24), mat);
  s.position.set(x, y, z);
  g.add(s);
  if (!outline) return;                  // 눈 · 코 같은 작은 조각은 건너뛴다
  const sh = new THREE.Mesh(s.geometry, ink);
  sh.userData.r = r;
  sh.scale.setScalar(1 + thick / r);     // 반지름에 반비례 — 모든 부위가 같은 굵기
  s.add(sh);
  shells.push(sh);
}

const fur = new THREE.MeshToonMaterial({ color: 0xc98a52, gradientMap: grad });
const bear = new THREE.Group();
part(bear, 0.82, fur, 0, 0, 0);          // 머리
part(bear, 0.36, fur, -0.55, 0.62, -0.05); // 귀
part(bear, 0.36, fur, 0.55, 0.62, -0.05);
part(bear, 0.09, eyeMat, -0.3, 0.16, 0.74, false);
scene.add(bear);
renderer.toneMapping = THREE.NoToneMapping;

// 굵기 바꾸기
function setThick(v: number) {
  thick = v;
  for (const s of shells) s.scale.setScalar(1 + v / s.userData.r);
}`,
    },
    pitfalls: [
      { title: '모든 껍데기를 같은 배율로 키우면 큰 부위만 선이 두껍다', fix: '배율을 1 + 굵기 / 반지름으로 — 견본은 부위마다 userData 에 반지름을 적어 두고 다시 맞춘다.', seen: true },
      { title: '얇은 판 · 투명한 것에 붙이면 지저분하다', fix: '바닥 판 · 유리 · 작은 조각은 건너뛴다. 이 사이트의 toonify 도구는 크기 · 투명 여부로 거른다.', seen: true },
      { title: '모서리 진 상자는 크기만 키우면 모서리에서 선이 벌어진다', fix: '정점을 법선 쪽으로 미는 셰이더(onBeforeCompile 에서 transformed += normal * 두께)로 바꾼다.' },
      { title: '껍데기가 클릭 판정을 가로챈다', fix: '껍데기 메시는 raycast = () => {} 로 판정에서 빼 둔다.' },
    ],
    prev: ['u01'],
    next: ['i03', 'i226'],
    refs: [{ name: 'three.js 예제 — webgl_materials_variations_toon', url: 'https://threejs.org/examples/#webgl_materials_variations_toon' }],
  },

  u04: {
    id: 'u04',
    summary: '나뭇결 · 색 재질 위에 반짝이는 투명 막을 한 겹 더 얹어, 니스 칠한 나무 · 반들한 플라스틱 말처럼 보이게 한다.',
    terms: [
      { en: 'Clearcoat (PBR coat layer)', ko: '바탕 위 투명 막 한 겹 — 니스 · 코팅' },
      { en: 'MeshPhysicalMaterial.clearcoat · clearcoatRoughness', ko: 'three.js 막 세기 · 막 거칠기' },
      { en: 'Environment map reflection', ko: '환경 반사 — 막에 비칠 주변' },
    ],
    goal: '{target}에 클리어코트(바탕은 거칠고 위에 매끈한 투명 막)를 입혀 줘. 느낌은 {style}.',
    targets: ['나무 판 위 체커 말 · 체스 폰', '플라스틱 장난감', '광택 나는 자동차 몸체'],
    styles: ['니스 칠한 원목', '반들반들 플라스틱', '고급스러운 진열장'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity HDRP Lit 의 Coat Mask, URP 는 Complex Lit 셰이더의 Clear Coat 항목.',
      godot: 'Godot 은 StandardMaterial3D 의 Clearcoat (clearcoat · clearcoat_roughness) 를 켠다.',
    },
    principle: [
      '진짜 니스 칠은 거친 나무 위에 매끈한 투명 층이 있어, 빛이 두 번 반사된다.',
      'MeshPhysicalMaterial 은 바탕(roughness 0.85)과 별도로 막(clearcoat 1, clearcoatRoughness 0.05)을 계산한다.',
      '바탕은 흐릿하게, 막은 또렷한 하이라이트 · 창 반사를 만든다.',
      '막은 비칠 것이 있어야 보이므로 환경 지도(scene.environment)가 꼭 필요하다.',
    ],
    when: ['보드게임 말 · 나무 판 · 장난감처럼 손으로 만지는 물건', '움직이는 빛에 반짝임이 살아 있어야 할 때'],
    avoid: ['흙 · 천 · 종이처럼 광이 없는 것 — 대신 일반 MeshStandardMaterial', '아주 많은 작은 물체를 폰에서 — 물리 재질이 무겁다. 대신 roughness 낮춘 표준 재질'],
    cost: 'medium',
    costNote: 'MeshPhysicalMaterial 은 표준 재질보다 셰이더가 길고, 막 층 계산이 한 번 더 들어간다. 물체가 많은 폰 장면은 꼭 필요한 것만.',
    level: 1,
    must: [
      '바탕 재질과 막 재질을 같은 바탕값(map · roughness 0.85)으로 두고 clearcoat 만 달리해 비교',
      'scene.environment 에 반사할 환경을 넣기 (없으면 막이 안 보인다)',
      '빛 하나를 천천히 돌려 막의 하이라이트가 움직이는 것을 보여 주기',
      '「클리어코트」 0~1 · 「막 거칠기」 0~0.6 슬라이더',
    ],
    done: [
      '왼쪽 일반 재질 · 오른쪽 클리어코트를 나란히 두면, 오른쪽 나뭇결 위에만 또렷한 빛줄 · 창 반사가 보인다',
      '빛이 돌면 오른쪽 하이라이트가 매끄럽게 미끄러진다',
      '「막 거칠기」를 올리면 반사가 뿌옇게 번진다',
      '폰에서도 60fps (말 수십 개 기준)',
    ],
    code: {
      lang: 'ts',
      title: '같은 나뭇결에 막만 더하기',
      from: 'demos/demosMaterial.ts u04 make() 를 정리',
      body: `// 막에 비칠 사진관 환경 (견본은 캔버스로 그린 equirect — RoomEnvironment 도 된다)
scene.environment = studioEnv;
scene.environmentIntensity = 1.8;

const wood = woodTex('#a85a2a');          // 캔버스로 그린 나뭇결 (u09)

// 왼쪽: 바탕만
const plain = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 });
// 오른쪽: 같은 바탕 + 매끈한 막 한 겹
const coated = new THREE.MeshPhysicalMaterial({
  map: wood,
  roughness: 0.85,          // 바탕은 거칠게 — 나무결이 흐릿하게 빛을 받는다
  clearcoat: 1,             // 막 세기
  clearcoatRoughness: 0.05, // 막은 매끈 — 또렷한 창 반사
});

const disc = new THREE.Mesh(discGeo(0.6, 0.24), coated);
scene.add(disc);

// 빛을 천천히 돌려 막의 하이라이트를 보여 준다
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
scene.add(sun);
function update(t: number) {
  sun.position.set(Math.sin(t * 0.7) * 5, 4, Math.cos(t * 0.7) * 3 + 2);
}`,
    },
    pitfalls: [
      { title: '환경 지도 없이 쓰면 막이 거의 안 보인다', fix: 'clearcoat 는 주로 반사로 드러난다. scene.environment 에 RoomEnvironment(PMREM) 나 그린 환경을 넣는다.' },
      { title: '바탕 roughness 까지 낮추면 막과 구분이 안 된다', fix: '바탕은 0.8 안팎으로 거칠게, 막만 매끈하게 해야 「니스 칠」처럼 두 층이 보인다.' },
      { title: '물리 재질을 수십 종 만들면 셰이더 컴파일이 길다', fix: '같은 설정은 재질 하나를 돌려 쓰고, 첫 등장 멈칫은 compileAsync 로 미리 데운다(i385).', seen: true },
    ],
    prev: ['u12'],
    next: ['u07', 'u10'],
    refs: [
      { name: 'three.js 예제 — webgl_materials_physical_clearcoat', url: 'https://threejs.org/examples/#webgl_materials_physical_clearcoat' },
      { name: 'three.js 문서 — MeshPhysicalMaterial', url: 'https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial' },
    ],
  },

  u07: {
    id: 'u07',
    summary: '빛이 물체 속을 지나며 꺾이고 색이 갈라지게 해, 뒤가 휘어 비치는 유리 · 얼음 · 보석을 만든다.',
    terms: [
      { en: 'Transmission (physically based refraction)', ko: '투과 — 뒤 장면이 비쳐 보임' },
      { en: 'IOR · thickness', ko: '굴절률 · 두께 — 얼마나 꺾이나' },
      { en: 'Dispersion', ko: '분산 — 색마다 다르게 꺾여 가장자리에 무지개' },
      { en: 'attenuationColor · attenuationDistance', ko: '속을 지날수록 물드는 색' },
    ],
    goal: '{target}을(를) 투과 · 굴절 재질로 만들어 줘 — 뒤 무늬가 휘어 보이고 가장자리에 무지개 분산. 느낌은 {style}.',
    targets: ['얼음 크리스탈 · 유리 상자', '보석', '물병 · 유리컵'],
    styles: ['맑고 차가운 얼음', '반짝이는 보석', '깨끗한 유리'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity HDRP Lit 의 Refraction Model + Thickness, URP 는 Opaque Texture 를 켜고 굴절 셰이더(Shader Graph Scene Color)로.',
      godot: 'Godot 은 StandardMaterial3D 의 Refraction(refraction_scale) 을 켜고 Transparency 를 쓴다.',
    },
    principle: [
      '그냥 반투명(opacity)은 뒤를 흐릿하게 섞을 뿐, 휘지 않는다.',
      'transmission: 1 은 뒤 장면을 따로 그린 그림을 가져와, 굴절률(ior 1.5)과 두께(thickness 1.2)만큼 어긋나게 읽는다.',
      'dispersion(3)은 빨강 · 초록 · 파랑을 조금씩 다르게 꺾어 가장자리에 무지개를 만든다.',
      'attenuationColor 로 두꺼운 곳일수록 옅은 하늘색으로 물들인다.',
      '뒤에 줄무늬처럼 또렷한 것이 있어야 굴절이 눈에 띈다.',
    ],
    when: ['얼음 · 유리 · 보석처럼 속이 비치는 물체가 주인공일 때', '물체 수가 적고 크게 보일 때'],
    avoid: ['투명한 물체가 수십 개 — 투과 패스 비용이 크다. 대신 opacity + 환경 반사', '폰 저사양 모드 — 대신 매트캡(i09) 얼음 그림'],
    cost: 'heavy',
    costNote: '투과 물체가 하나라도 있으면 장면을 한 번 더(투과용 그림) 그린다. 투과 물체끼리는 서로 안 비친다.',
    level: 2,
    must: [
      'MeshPhysicalMaterial 의 transmission · ior · thickness · dispersion 으로 (opacity 로 흉내 내지 않기)',
      'roughness 는 0.03 처럼 아주 낮게 — 높으면 뒤가 뿌옇게 번진다',
      '뒤에 또렷한 줄무늬 판을 두어 굴절이 보이게',
      '「굴절률」 1~2.4 · 「분산」 0~8 · 「두께」 0~3 슬라이더',
    ],
    done: [
      '왼쪽 그냥 반투명 · 오른쪽 투과 재질을 나란히 두면, 오른쪽만 뒤 줄무늬가 휘고 가장자리에 무지개가 생긴다',
      '굴절률을 올리면 뒤 무늬가 더 크게 꺾인다',
      '분산 0 이면 무지개가 사라진다',
    ],
    code: {
      lang: 'ts',
      title: '반투명과 투과 · 굴절 비교',
      from: 'demos/demosMaterial.ts u07 make() 를 정리',
      body: `// 뒤 줄무늬 판 — 굴절이 눈에 띄게
const [c, g] = cv(256, 128);
const cols = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'];
for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 5]; g.fillRect(i * 16, 0, 16, 128); }
const back = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
back.position.set(0, 0.1, -1.4);
scene.add(back);

// 왼쪽: 그냥 반투명 — 뒤가 휘지 않는다
const glassA = new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.1, transparent: true, opacity: 0.45 });
// 오른쪽: 투과 + 굴절 + 분산
const glassB = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.03,
  transmission: 1,
  ior: 1.5,
  thickness: 1.2,
  dispersion: 3,
  attenuationColor: new THREE.Color(0xc8f0ff),
  attenuationDistance: 3,
});
const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), glassB);
crystal.scale.set(0.8, 1.35, 0.8);
scene.add(crystal);
scene.environment = studioEnv; // 겉면 반사도 함께`,
    },
    pitfalls: [
      { title: 'opacity 만 낮추면 「유리」가 아니라 흐린 비닐처럼 보인다', fix: 'transmission 을 쓰고 transparent 는 켜지 않는다 (투과는 불투명 패스에서 따로 계산).' },
      { title: '투과 물체끼리는 서로 비치지 않는다', fix: '투과용 그림에는 불투명 물체만 들어간다. 겹치는 보석 여러 개는 앞의 것만 투과로.' },
      { title: '뒤가 단색이면 굴절이 안 보인다', fix: '줄무늬 · 격자처럼 또렷한 배경을 둔다. 얼음 별 게임은 속에 금 · 기포를 넣어 굴절을 드러냈다.', seen: true },
    ],
    prev: ['u04', 'u12'],
    next: ['i09'],
    refs: [
      { name: 'three.js 예제 — webgl_materials_physical_transmission', url: 'https://threejs.org/examples/#webgl_materials_physical_transmission' },
      { name: 'three.js 문서 — MeshPhysicalMaterial', url: 'https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial' },
    ],
  },

  u08: {
    id: 'u08',
    summary: '기본 재질의 셰이더 중간에 몇 줄을 끼워 넣어, 빛 · 그림자 계산은 그대로 두고 풀이 흔들리거나 갓이 속에서 빛나게 한다.',
    terms: [
      { en: 'Material.onBeforeCompile (shader injection)', ko: '컴파일 직전에 셰이더 문자열을 고치기' },
      { en: 'ShaderChunk (#include <begin_vertex> 등)', ko: 'three.js 셰이더 조각 — 끼워 넣을 자리 표시' },
      { en: 'Custom uniforms', ko: '시간 · 세기 같은 값을 바깥에서 넘기기' },
    ],
    goal: '{target}의 표준 재질에 onBeforeCompile 로 셰이더 몇 줄을 끼워 넣어 줘 — 빛 · 그림자는 그대로. 느낌은 {style}.',
    targets: ['바람에 흔들리는 풀 · 속에서 빛나는 버섯 갓', '캐릭터 피부 음영', '물결치는 깃발'],
    styles: ['동화 같은 밤 숲', '귀엽고 아기자기', '차분하고 자연스러운'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 로 Lit 그래프에 Vertex Position · Emission 을 이어 붙이거나, URP Lit 셰이더를 복사해 몇 줄을 더한다.',
      godot: 'Godot 은 StandardMaterial3D 를 「Convert to ShaderMaterial」 한 뒤 vertex() · fragment() 에 몇 줄을 더한다.',
    },
    principle: [
      'three.js 표준 재질의 셰이더는 #include <begin_vertex> 같은 조각들로 이어져 있다.',
      'onBeforeCompile 에서 그 조각 문자열을 replace 해 바로 뒤에 내 줄을 넣는다.',
      '정점 쪽: transformed(이 정점 위치)를 높이² 만큼 sin 으로 밀면 풀 끝만 흔들린다.',
      '조각 쪽: emissivemap 다음에 totalEmissiveRadiance 를 더하면 그 부분이 스스로 빛난다.',
      'uniform 객체({ value })를 재질 밖에 두고 공유하면, 매 프레임 value 만 바꿔도 모든 재질이 따라온다.',
    ],
    when: ['표준 재질의 빛 · 그림자 · 안개를 다 살리면서 조금만 바꾸고 싶을 때', '같은 효과를 여러 재질에 넣을 때 (함수 하나로)'],
    avoid: ['모양 전체를 새로 그리는 효과(홀로그램 · 레이마칭) — 대신 ShaderMaterial 로 처음부터', 'three.js 판을 자주 올리는 프로젝트에서 깊은 조각 고치기 — 조각 이름이 바뀔 수 있다'],
    cost: 'light',
    costNote: '몇 줄 덧붙일 뿐이라 거의 공짜. 다만 재질마다 셰이더가 하나씩 따로 컴파일된다.',
    level: 2,
    must: [
      'ShaderMaterial 로 다시 짜지 말고 onBeforeCompile 로 표준 재질에 끼워 넣기 (빛 · 그림자 · 안개 유지)',
      '끼울 자리는 #include <begin_vertex> · #include <emissivemap_fragment> 뒤',
      'uniform 은 재질 밖 객체({ value })로 두고 sh.uniforms 에 연결 — 매 프레임 value 만 바꾸기',
      '흔들림은 높이의 제곱(hh * hh)에 비례 — 뿌리는 그대로',
      '「바람」 · 「갓 속빛」 슬라이더',
    ],
    done: [
      '왼쪽 그대로 · 오른쪽 셰이더 끼움을 나란히 두면, 오른쪽 풀만 끝부분이 물결처럼 흔들린다',
      '오른쪽 버섯 갓은 가장자리부터 따뜻하게 빛나며 천천히 맥박친다',
      '「바람」 0 이면 오른쪽도 멈추고, 그림자 · 빛은 양쪽이 똑같다',
    ],
    code: {
      lang: 'ts',
      title: '풀 흔들기(정점) + 갓 속빛(조각) 끼워 넣기',
      from: 'demos/demosMaterial.ts u08 make() 를 정리',
      body: `const uTime = { value: 0 };
const uWind = { value: 0.35 };
const uGlow = { value: 1.2 };

const grass = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
grass.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = uTime;
  sh.uniforms.uWind = uWind;
  sh.vertexShader = 'uniform float uTime;\\nuniform float uWind;\\n' + sh.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\\n' +
    'vec4 wq = modelMatrix * vec4(position, 1.0);\\n' +
    'float hh = max(position.y, 0.0);\\n' +   // 높이 — 뿌리는 0
    'transformed.x += sin(uTime * 2.2 + wq.x * 2.5 + wq.z * 1.3) * uWind * hh * hh * 1.6;\\n' +
    'transformed.z += cos(uTime * 1.7 + wq.x * 1.5) * uWind * hh * hh * 0.7;',
  );
};

const cap = new THREE.MeshStandardMaterial({ color: 0xd04a6a, roughness: 0.6 });
cap.onBeforeCompile = (sh) => {
  sh.uniforms.uGlow = uGlow;
  sh.uniforms.uTime = uTime;
  sh.fragmentShader = 'uniform float uGlow;\\nuniform float uTime;\\n' + sh.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\\n' +
    'float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);\\n' +
    'float rimL = pow(1.0 - facing, 1.6);\\n' +
    'float pulse = 0.75 + 0.25 * sin(uTime * 2.0);\\n' +
    'totalEmissiveRadiance += vec3(1.0, 0.75, 0.45) * uGlow * pulse * (0.18 + rimL);',
  );
};

function update(t: number) { uTime.value = t; }`,
    },
    pitfalls: [
      { title: 'replace 할 조각 이름이 틀리면 아무 일도 안 일어난다', fix: '오류 없이 조용히 무시된다. 바꾼 뒤 sh.vertexShader 에 내 줄이 들어갔는지 한 번 확인한다.' },
      { title: '그림자는 흔들리지 않고 풀만 흔들린다', fix: '그림자 지도는 깊이 재질로 따로 그린다. 그림자도 흔들려야 하면 customDepthMaterial 에 같은 줄을 넣는다.' },
      { title: '같은 onBeforeCompile 을 쓴 재질 둘이 하나로 합쳐진다', fix: '설정이 같으면 같은 프로그램으로 캐시될 수 있다. 다르게 고친 재질은 customProgramCacheKey 를 따로 준다.' },
      { title: '셰이더 안에서 잡음 반복문을 여러 번 부르면 윈도에서 컴파일이 수십 초', fix: '보물 동굴 게임에서 겪었다. 잡음은 미리 구운 텍스처로 읽는다.', seen: true },
    ],
    prev: ['u21'],
    next: ['i10', 'i13', 'i12'],
    refs: [
      { name: 'three.js 예제 — webgl_materials_modified', url: 'https://threejs.org/examples/#webgl_materials_modified' },
      { name: 'three.js 소스 — ShaderChunk', url: 'https://github.com/mrdoob/three.js/tree/dev/src/renderers/shaders/ShaderChunk' },
    ],
  },

  u09: {
    id: 'u09',
    summary: '2D 캔버스에 얼굴 · 숫자 · 무늬를 그려 텍스처로 붙여, 그림 파일 없이 3D 물체에 글씨와 무늬를 입히고 바로 바꾼다.',
    terms: [
      { en: 'CanvasTexture', ko: '2D 캔버스를 그대로 3D 텍스처로' },
      { en: 'texture.needsUpdate', ko: '다시 그렸으니 GPU 로 다시 올리라는 표시' },
      { en: 'colorSpace = SRGBColorSpace', ko: '색 그림은 sRGB 로 — 색이 바래지 않게' },
      { en: 'Procedural texture', ko: '코드로 만든 무늬' },
    ],
    goal: '{target}에 2D 캔버스로 그린 무늬(CanvasTexture)를 붙여 줘 — 그림이 바뀌면 3D 도 함께. 느낌은 {style}.',
    targets: ['얼굴 · 숫자가 바뀌는 상자', '나뭇결 · 펠트 판', '이름표 · 점수판'],
    styles: ['귀엽고 아기자기', '손으로 그린 듯한', '깔끔한 인쇄물'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Texture2D.SetPixels32 + Apply(), 또는 UI 를 RenderTexture 에 그려 재질에 붙인다.',
      godot: 'Godot 은 Image 를 고친 뒤 ImageTexture.update(), 또는 SubViewport 에 2D 를 그려 ViewportTexture 로 붙인다.',
    },
    principle: [
      'HTML 캔버스에 fillRect · arc · fillText 로 그림을 그린다.',
      'new THREE.CanvasTexture(캔버스) 로 감싸면 그 그림이 그대로 재질의 map 이 된다.',
      '다시 그린 뒤 texture.needsUpdate = true 하면 다음 프레임에 3D 에도 바뀐다.',
      '다시 그리기는 비싸니 매 프레임이 아니라 바뀔 때만(견본은 0.08초마다) 한다.',
    ],
    when: ['글씨 · 숫자 · 얼굴처럼 번역되거나 바뀌는 그림', '나뭇결 · 펠트 같은 무늬를 그림 파일 없이'],
    avoid: ['사진 같은 세밀한 질감 — 대신 그림 파일', '매 프레임 큰 캔버스를 통째로 다시 그리기 — 대신 바뀐 때만, 작은 캔버스로'],
    cost: 'light',
    costNote: '그리기 자체는 가볍지만 needsUpdate 마다 GPU 로 다시 올린다 (256² 는 가볍고 2048² 를 자주 올리면 끊긴다).',
    level: 1,
    must: [
      '색이 든 그림은 texture.colorSpace = THREE.SRGBColorSpace (높이 · 거칠기용은 그대로)',
      '다시 그린 뒤 needsUpdate = true, 다시 그리기는 바뀔 때만 (견본 0.08초 간격)',
      '캔버스 크기는 2의 거듭제곱(256 · 512) 정도로 작게',
      '같은 캔버스를 왼쪽 2D 판 · 오른쪽 3D 상자에 함께 붙여 바로 바뀌는 것을 보여 주기',
    ],
    done: [
      '왼쪽 평면에 보이는 그림과 오른쪽 상자 면의 그림이 똑같고 동시에 바뀐다 (눈 깜박임 · 숫자)',
      '「바탕 색」 슬라이더를 움직이면 양쪽 색이 함께 바뀐다',
      '글씨가 뭉개지지 않고 또렷하다 (anisotropy 4)',
    ],
    code: {
      lang: 'ts',
      title: '캔버스 그림 → 텍스처 → 바뀔 때만 다시 그리기',
      from: 'demos/demosMaterial.ts u09 make() 의 draw() 를 줄여 정리',
      body: `const c = document.createElement('canvas');
c.width = c.height = 256;
const g = c.getContext('2d')!;
const tex = new THREE.CanvasTexture(c);
tex.colorSpace = THREE.SRGBColorSpace;   // 색 그림은 sRGB
tex.anisotropy = 4;

let hue = 200;
function draw(t: number) {
  g.fillStyle = 'hsl(' + hue + ',70%,62%)';
  g.fillRect(0, 0, 256, 256);
  // 얼굴 — 2.6초마다 잠깐 눈 감기
  const blink = t % 2.6 < 0.16;
  g.fillStyle = '#1e1a2e';
  for (const ex of [92, 164]) {
    if (blink) g.fillRect(ex - 14, 118, 28, 6);
    else { g.beginPath(); g.ellipse(ex, 120, 11, 15, 0, 0, Math.PI * 2); g.fill(); }
  }
  // 숫자
  g.fillStyle = '#fff';
  g.font = '900 54px system-ui';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(Math.floor(t) % 10), 128, 58);
  tex.needsUpdate = true;                 // GPU 로 다시 올리기
}

const box = new THREE.Mesh(new RoundedBoxGeometry(1.05, 1.05, 1.05, 4, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
scene.add(box);

let last = -1;
function update(t: number) {
  if (t - last > 0.08) { draw(t); last = t; } // 매 프레임이 아니라 가끔만
}`,
    },
    pitfalls: [
      { title: 'colorSpace 를 안 주면 색이 허옇게 바랜다', fix: '색 그림은 SRGBColorSpace. 반대로 요철 · 거칠기 같은 데이터 그림에는 주지 않는다.' },
      { title: '매 프레임 큰 캔버스를 다시 올리면 폰에서 끊긴다', fix: '바뀔 때만 needsUpdate. 크게 바뀌지 않는 무늬는 한 번만 그린다.' },
      { title: '같은 무늬 캔버스를 물체마다 새로 만들면 시작이 느리다', fix: '얼음 별 게임은 무늬 캔버스를 열쇠(cacheKey)로 돌려 써서 시작 4초를 1초대로 줄였다.', seen: true },
      { title: '글꼴이 늦게 내려오면 첫 그림이 기본 글꼴로 그려진다', fix: 'document.fonts.ready 를 기다린 뒤 한 번 더 그린다.' },
    ],
    next: ['u10', 'i09'],
    refs: [
      { name: 'three.js 문서 — CanvasTexture', url: 'https://threejs.org/docs/#api/en/textures/CanvasTexture' },
      { name: 'MDN — Canvas API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API' },
    ],
  },

  u10: {
    id: 'u10',
    summary: '캔버스로 그린 흑백 높이 그림을 요철 맵으로 붙여, 모양은 매끈한 그대로인데 빛이 돌면 점 · 결이 오돌토돌 솟아 보이게 한다.',
    terms: [
      { en: 'Bump mapping (bumpMap · bumpScale)', ko: '높이 그림으로 법선을 흔들어 요철처럼' },
      { en: 'Normal map', ko: '법선 방향을 색으로 담은 그림 (같은 일, 더 정확)' },
      { en: 'Height map', ko: '흰 곳 = 높은 곳인 흑백 그림' },
    ],
    goal: '{target}에 캔버스로 그린 요철 맵을 넣어 줘 — 색 무늬와 같은 자리에 높이 무늬. 느낌은 {style}.',
    targets: ['점박이 버섯 갓', '뜨개 · 펠트 매트', '돌 · 가죽 표면'],
    styles: ['손으로 만든 소품', '귀엽고 아기자기', '거칠고 낡은'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 흑백 그림의 Texture Type 을 Normal map 으로 두고 「Create from Grayscale」 를 켜면 높이 그림이 노멀 맵이 된다.',
      godot: 'Godot 은 StandardMaterial3D 의 Normal Map 을 켜거나, 흑백 높이 그림을 Heightmap 에 넣는다.',
    },
    principle: [
      '진짜로 정점을 올리지 않고, 빛 계산에 쓰는 법선만 높이 그림의 기울기만큼 기울인다.',
      '그래서 빛이 옆에서 비칠 때 점의 한쪽은 밝고 반대쪽은 어두워져 솟아 보인다.',
      '색 그림(점)과 높이 그림(같은 자리에 흰 원)을 같은 좌표로 그려야 무늬와 요철이 맞는다.',
      'bumpScale 로 세기를 조절한다 (견본 4, 펠트는 3).',
    ],
    when: ['점 · 결 · 바느질처럼 잔 요철이 많아 모양으로 만들기엔 너무 잘 때', '빛이 움직여 질감이 살아야 할 때'],
    avoid: ['옆에서 볼 때 윤곽까지 울퉁불퉁해야 할 때 — 대신 진짜 변위 또는 시차 차폐(i230)', '정면 고정 조명 — 요철이 거의 안 보인다'],
    cost: 'light',
    costNote: '텍스처 한 장을 더 읽을 뿐. 표준 재질에서도 폰 OK.',
    level: 1,
    must: [
      '높이 그림은 흑백, colorSpace 는 그대로 (sRGB 로 바꾸지 않기)',
      '색 무늬와 높이 무늬를 같은 좌표에 함께 그리기',
      '빛을 천천히 돌려 요철이 드러나게',
      '「요철 세기」 0~10 슬라이더, 왼쪽 무늬만 · 오른쪽 + 요철 맵 비교',
    ],
    done: [
      '빛이 돌면 오른쪽 갓의 흰 점들이 볼록하게 솟아 보이고, 왼쪽은 납작하다',
      '오른쪽 매트에는 뜨개 코가 하나하나 솟아 보인다',
      '「요철 세기」 0 이면 양쪽이 같아진다',
    ],
    code: {
      lang: 'ts',
      title: '색 그림과 높이 그림을 같은 자리에 그리기',
      from: 'demos/demosMaterial.ts u10 make() 를 정리',
      body: `const [cc, gc] = cv(512, 256); // 색
const [hc, gh] = cv(512, 256); // 높이 (흑 = 낮음, 백 = 높음)
gc.fillStyle = '#d8384a'; gc.fillRect(0, 0, 512, 256);
gh.fillStyle = '#000';    gh.fillRect(0, 0, 512, 256);
for (let i = 0; i < 2500; i++) {          // 잔 결
  gh.fillStyle = 'rgba(255,255,255,' + Math.random() * 0.12 + ')';
  gh.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
}
for (let i = 0; i < 26; i++) {            // 점: 색과 높이를 같은 자리에
  const x = Math.random() * 512, y = 40 + Math.random() * 120, r = 10 + Math.random() * 16;
  gc.fillStyle = '#fff4e6';
  gc.beginPath(); gc.ellipse(x, y, r, r * 0.9, 0, 0, Math.PI * 2); gc.fill();
  const rg = gh.createRadialGradient(x, y, 0, x, y, r * 1.1);
  rg.addColorStop(0, '#fff'); rg.addColorStop(0.7, '#ddd'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  gh.fillStyle = rg;
  gh.beginPath(); gh.ellipse(x, y, r * 1.1, r, 0, 0, Math.PI * 2); gh.fill();
}
const colT = new THREE.CanvasTexture(cc);
colT.colorSpace = THREE.SRGBColorSpace;   // 색만 sRGB
const bumpT = new THREE.CanvasTexture(hc); // 높이는 그대로

const cap = new THREE.MeshStandardMaterial({ map: colT, roughness: 0.55, bumpMap: bumpT, bumpScale: 4 });

// 빛이 돌아야 요철이 보인다
function update(t: number) { sun.position.set(Math.cos(t * 0.9) * 4, 1.6, Math.sin(t * 0.9) * 2 + 1.5); }`,
    },
    pitfalls: [
      { title: '높이 그림을 sRGB 로 두면 요철 세기가 엉뚱해진다', fix: '높이 · 노멀 · 거칠기 그림은 데이터라 colorSpace 를 바꾸지 않는다.' },
      { title: '정면에서 빛을 비추면 요철이 안 보인다', fix: '빛을 비스듬히, 가능하면 움직이게 둔다.' },
      { title: '높이 그림이 너무 날카로우면 계단 · 지글거림이 생긴다', fix: '원 가장자리를 그러데이션으로 부드럽게 (견본은 0.7 에서 바깥으로 흐려짐).' },
    ],
    prev: ['u09'],
    next: ['i230', 'i84'],
    refs: [
      { name: 'three.js 문서 — MeshStandardMaterial (bumpMap)', url: 'https://threejs.org/docs/#api/en/materials/MeshStandardMaterial' },
      { name: 'three.js 예제 — webgl_materials_bumpmap', url: 'https://threejs.org/examples/#webgl_materials_bumpmap' },
    ],
  },

  i09: {
    id: 'i09',
    summary: '빛 계산 없이 둥근 그림 한 장에서 색을 읽어, 도자기 · 젤리 · 금처럼 보이는 아주 가벼운 재질을 만든다.',
    terms: [
      { en: 'MatCap (material capture)', ko: '재질 사진 한 장 — 둥근 공에 빛이 비친 그림' },
      { en: 'MeshMatcapMaterial', ko: 'three.js 매트캡 재질' },
      { en: 'View-space normal lookup', ko: '화면 쪽 법선 방향으로 그림 좌표를 고르기' },
    ],
    goal: '{target}을(를) 매트캡 재질로 그려 줘 — 조명 없이 동그란 그림 한 장으로. 느낌은 {style}.',
    targets: ['도자기 · 젤리 · 금 장난감', '저사양 폰용 캐릭터', '슬라임 · 말랑한 생물'],
    styles: ['반들반들 장난감', '말랑한 젤리', '번쩍이는 금속'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 에 매트캡 기본 셰이더는 없다. Shader Graph 에서 View 공간 법선 xy × 0.5 + 0.5 를 UV 로 그림을 읽는다.',
      godot: 'Godot 은 ShaderMaterial 의 fragment() 에서 NORMAL(화면 공간).xy × 0.5 + 0.5 로 그림을 읽어 ALBEDO 에 넣는다.',
    },
    principle: [
      '매트캡 그림은 「빛을 받은 공」을 정면에서 찍은 동그란 그림이다.',
      '물체의 각 점이 화면 쪽으로 어느 방향을 보는지(화면 공간 법선 xy)로 그 그림의 같은 자리 색을 읽는다.',
      '그래서 조명 · 그림자 계산이 전혀 없고, 그림만 바꾸면 도자기 · 젤리 · 금이 된다.',
      '빛이 카메라에 붙어 다니는 셈이라, 물체를 돌려도 하이라이트 자리는 늘 같다.',
    ],
    when: ['저사양 폰에서 빛 계산을 줄이고 싶을 때', '젤리 · 도자기처럼 특정 재질감을 그림 한 장으로', '모델 보기 · 조각 도구처럼 형태가 잘 보여야 할 때'],
    avoid: ['장면 조명 · 그림자가 바뀌어야 할 때 (밤낮 · 횃불) — 대신 표준 재질', '환경이 비쳐야 할 때 — 대신 환경 반사(u12)'],
    cost: 'light',
    costNote: '텍스처 한 번 읽기뿐이라 가장 가벼운 재질 중 하나. 조명 수와 상관없다.',
    level: 1,
    must: [
      'MeshMatcapMaterial({ matcap }) 로 — 조명 · 환경은 이 재질에 영향 없음',
      '매트캡 그림은 동그란 원 안에 그리고, 위 왼쪽에 반짝임 점',
      '재질마다 그림만 바꿔 도자기 · 젤리 · 금 셋을 보여 주고, 그림 자체도 물체 위에 작게 보여 주기',
      '「매트캡 켜기」 단추로 조명 계산 재질과 바꿔 비교',
    ],
    done: [
      '같은 장면에 도자기 · 젤리 · 금 세 물체가 보이고, 위에 그 재질의 동그란 그림이 함께 보인다',
      '조명을 바꿔도 매트캡 물체는 그대로다',
      '단추로 끄면 조명 계산 재질로 바뀌어 차이를 비교할 수 있다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '캔버스로 매트캡 그림 그리기 + 재질',
      from: 'demos/demosMaterial.ts i09 make() 의 matcap() 를 정리',
      body: `/** kind 0 도자기 · 1 젤리 · 2 금 */
function matcap(kind: number): THREE.CanvasTexture {
  const [c, g] = cv(256, 256);
  const C = 128;
  if (kind === 0) {
    const rg = g.createRadialGradient(100, 90, 10, C, C, 128);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.45, '#eef2f8');
    rg.addColorStop(0.8, '#9aa8c4'); rg.addColorStop(1, '#3a4664');
    g.fillStyle = rg;
  } else if (kind === 1) {
    const rg = g.createRadialGradient(C, 140, 10, C, C, 128);
    rg.addColorStop(0, '#2fbf5a'); rg.addColorStop(0.6, '#45d870');
    rg.addColorStop(0.88, '#a8ffb8'); rg.addColorStop(1, '#e8fff0'); // 가장자리가 밝으면 젤리
    g.fillStyle = rg;
  } else {
    const lg = g.createLinearGradient(0, 0, 0, 256);              // 금: 밝음-어둠 띠가 번갈아
    [['#fff6c8', 0], ['#e8b84a', 0.3], ['#7a4a12', 0.5], ['#f2c860', 0.62], ['#a06a1c', 0.85], ['#3a2006', 1]]
      .forEach(([col, k]) => lg.addColorStop(k as number, col as string));
    g.fillStyle = lg;
  }
  g.beginPath(); g.arc(C, C, 128, 0, Math.PI * 2); g.fill();
  const hl = g.createRadialGradient(92, 78, 0, 92, 78, kind === 2 ? 34 : 26); // 반짝임
  hl.addColorStop(0, 'rgba(255,255,255,1)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath(); g.arc(92, 78, 40, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const jelly = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 32), new THREE.MeshMatcapMaterial({ matcap: matcap(1) }));
scene.add(jelly); // 빛이 없어도 보인다`,
    },
    pitfalls: [
      { title: '물체를 돌려도 반짝임이 따라오지 않아 이상해 보일 수 있다', fix: '매트캡의 빛은 카메라에 붙어 있다. 카메라가 많이 도는 장면은 표준 재질이 낫다.' },
      { title: '그림을 네모 끝까지 채우면 가장자리에 줄이 생긴다', fix: '원 안에만 그리고, 원 밖은 원 가장자리 색과 비슷하게.' },
      { title: '평평한 넓은 면은 한 색으로 뭉개진다', fix: '법선이 같은 곳은 같은 색이다. 곡면이 많은 물체에 쓴다.' },
    ],
    prev: ['u09'],
    next: ['i10', 'u01'],
    refs: [
      { name: 'three.js 예제 — webgl_materials_matcap', url: 'https://threejs.org/examples/#webgl_materials_matcap' },
      { name: 'three.js 문서 — MeshMatcapMaterial', url: 'https://threejs.org/docs/#api/en/materials/MeshMatcapMaterial' },
    ],
  },

  i10: {
    id: 'i10',
    summary: '카메라에서 옆으로 비껴 보이는 가장자리일수록 빛을 더해, 어두운 배경에서도 캐릭터 윤곽이 또렷하게 떠 보이게 한다.',
    terms: [
      { en: 'Rim light (Fresnel rim)', ko: '테두리 빛 — 가장자리만 빛남' },
      { en: 'Fresnel term pow(1 − N·V, p)', ko: '보는 방향과 면이 비껴 있을수록 커지는 값' },
      { en: 'totalEmissiveRadiance', ko: 'three.js 셰이더의 스스로 빛나는 양' },
    ],
    goal: '{target}에 프레넬 테두리 빛을 넣어 줘 — 가장자리만 빛나 배경에서 떠 보이게. 느낌은 {style}.',
    targets: ['밤 배경 위 동글 캐릭터', '공 · 아이템', '고른 물체 강조'],
    styles: ['신비로운 밤', '귀엽고 아기자기', '네온 사이버'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph 의 Fresnel Effect 노드 출력을 색과 곱해 Emission 에 넣는다.',
      godot: 'Godot StandardMaterial3D 의 Rim(rim · rim_tint) 을 켜거나, ShaderMaterial 에서 pow(1.0 - dot(NORMAL, VIEW), p) 를 EMISSION 에.',
    },
    principle: [
      '면의 법선 N 과 카메라 쪽 방향 V 가 같으면(정면) N·V = 1, 옆으로 비껴 있으면 0 에 가깝다.',
      'fres = pow(1 − N·V, uPow) 는 가장자리에서만 커진다. uPow(2.5)를 올리면 테가 더 좁아진다.',
      '그 값에 색과 세기(1.6)를 곱해 스스로 빛나는 양에 더한다.',
      '조명과 상관없이 늘 가장자리가 밝아, 어두운 배경과 경계가 생긴다.',
    ],
    when: ['어두운 배경 · 밤 장면에서 캐릭터가 묻힐 때', '툰 캐릭터에 「뒤에서 비친 빛」 느낌을 싸게 줄 때'],
    avoid: ['밝은 낮 배경 — 테가 하얗게 떠 보여 부자연스럽다', '평평한 판 · 상자 — 면 전체가 한꺼번에 밝아진다. 대신 진짜 뒤쪽 빛(u14 3점 조명)'],
    cost: 'light',
    costNote: '조각 셰이더에 내적 · pow 한 번. 폰 OK.',
    level: 1,
    must: [
      '표준 재질에 onBeforeCompile 로 끼워 넣기 (빛 · 그림자는 그대로)',
      '#include <emissivemap_fragment> 뒤에 totalEmissiveRadiance += 색 × fres × 세기',
      '세기 · 좁기 · 색은 공유 uniform 으로 — 슬라이더로 바로 바뀌게',
      '어두운 배경에서 왼쪽 없음 · 오른쪽 있음 비교',
    ],
    done: [
      '어두운 밤 배경에서 오른쪽 캐릭터만 가장자리에 하늘빛 테가 보인다',
      '캐릭터가 돌아도 테는 늘 화면에서 본 윤곽을 따라간다',
      '「빛 세기」 0~4 · 「가장자리 좁게」 0.8~6 · 「빛 색」 슬라이더가 바로 반영된다',
    ],
    code: {
      lang: 'ts',
      title: '표준 재질에 프레넬 테두리 빛 끼워 넣기',
      from: 'demos/demosMaterial.ts i10 make() 의 rimify() 를 정리',
      body: `const uRim = { value: 1.6 };                       // 세기
const uPow = { value: 2.5 };                       // 클수록 테가 좁다
const uCol = { value: new THREE.Color(0x7fd8ff) };

function rimify(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const c = m.clone();
  c.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = uRim;
    sh.uniforms.uPow = uPow;
    sh.uniforms.uRimCol = uCol;
    sh.fragmentShader = 'uniform float uRim;\\nuniform float uPow;\\nuniform vec3 uRimCol;\\n' +
      sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\\n' +
        // vViewPosition 은 카메라 → 점 반대 방향: 정면이면 N·V = 1
        'float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uPow);\\n' +
        'totalEmissiveRadiance += uRimCol * fres * uRim;',
      );
  };
  return c;
}

const body = rimify(new THREE.MeshStandardMaterial({ color: 0x3a3a8a, roughness: 0.6 }));
scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), body));

// 색 바꾸기 (색상 0~360)
function setHue(h: number) { uCol.value.setHSL(h / 360, 1, 0.75); }`,
    },
    pitfalls: [
      { title: '평평한 면이 많은 물체는 면 전체가 한꺼번에 번쩍인다', fix: '테두리 빛은 곡면에서 예쁘다. 상자는 모서리를 둥글게(RoundedBox) 하거나 uPow 를 크게.' },
      { title: '빛 번짐(u20)과 같이 쓰면 테가 너무 번진다', fix: '테 세기를 낮추거나 번짐 문턱을 테 밝기보다 높게 둔다.' },
      { title: '양면(DoubleSide) 재질은 뒷면에서 테가 뒤집힌다', fix: '뒷면에선 법선이 반대라 값이 틀린다. 앞면만 쓰거나 abs(dot) 로.' },
    ],
    prev: ['u08'],
    next: ['i226', 'i221'],
    refs: [{ name: 'Wikipedia — Fresnel equations', url: 'https://en.wikipedia.org/wiki/Fresnel_equations' }],
  },

  i11: {
    id: 'i11',
    summary: '빛 받는 정도에 따라 그늘을 화면 격자의 점 크기나 빗금 겹 수로 바꿔, 만화책 망점 · 연필 해칭 그림처럼 그린다.',
    terms: [
      { en: 'Halftone shader', ko: '망점 — 어두울수록 점이 커짐' },
      { en: 'Cross-hatching shader', ko: '빗금 — 어두울수록 겹이 늘어남' },
      { en: 'Screen-space pattern (gl_FragCoord)', ko: '화면 픽셀 좌표로 무늬를 깔기' },
      { en: 'Non-photorealistic rendering (NPR)', ko: '사실이 아닌 그림체 렌더링' },
    ],
    goal: '{target}의 그늘을 {style} 느낌의 망점 또는 빗금으로 그려 줘 — 밝기에 따라 점 크기 · 빗금 겹이 바뀌게.',
    targets: ['꼬인 매듭 · 공 같은 기본 도형', '만화 연출 장면', '그림책 캐릭터'],
    styles: ['만화책 망점', '연필 해칭', '신문 인쇄'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph 의 Screen Position 노드로 격자를 깔고, 빛 밝기와 비교해 점 · 빗금을 고른다.',
      godot: 'Godot ShaderMaterial 의 fragment() 에서 FRAGCOORD.xy 로 격자를 깔고 light() 의 밝기로 점 크기를 정한다.',
    },
    principle: [
      '먼저 빛 밝기 lum = 0.12 + 0.88 × max(N·L, 0) 을 구한다.',
      '망점: 화면 픽셀 좌표를 칸(uCell)으로 나누고 45° 돌린 격자 칸마다 원을 그린다. 반지름 = √(1 − lum) × 0.72.',
      '빗금: 밝기 0.85 · 0.6 · 0.35 아래로 내려갈 때마다 방향이 다른 줄을 한 겹씩 더한다.',
      '무늬를 물체가 아닌 화면 좌표에 깔아 크기가 늘 같고, 외곽선 껍데기를 함께 두르면 만화 같다.',
    ],
    when: ['만화 · 회상 · 그림책 연출 장면', '흑백 · 2색 인쇄물 같은 그림체'],
    avoid: ['카메라가 빨리 움직이는 장면 — 화면에 붙은 무늬가 미끄러져 보인다(샤워 커튼 효과). 대신 물체 좌표 무늬', '작은 화면에서 아주 작은 칸 — 무늬가 뭉개진다'],
    cost: 'light',
    costNote: '조각마다 계산 몇 줄. ShaderMaterial 이라 조명 계산을 직접 해서 오히려 가볍다.',
    level: 2,
    must: [
      '무늬 칸 크기는 화면 높이에 비례 (견본: max(4, 높이/80 × 배율)) — 폰 · PC 에서 같은 느낌',
      '망점 격자는 45° 돌리기 (인쇄 망점처럼)',
      '점 가장자리는 smoothstep 으로 1.5 픽셀 부드럽게 (계단 방지)',
      '렌더러 톤 매핑은 NoToneMapping — 잉크 · 종이 색이 그대로',
      '「점 · 빗금 크기」 · 「빛 도는 빠르기」 슬라이더, 보통 그늘 · 망점 · 빗금 셋을 나란히',
    ],
    done: [
      '세 물체가 나란히 — 보통 그늘 · 망점 · 빗금 — 빛이 돌면 어두운 쪽 점이 커지고 빗금 겹이 늘어난다',
      '점 · 빗금 굵기는 화면 크기를 바꿔도 비슷하게 유지된다',
      '물체 가장자리에 잉크 외곽선이 둘러져 만화책처럼 보인다',
    ],
    code: {
      lang: 'glsl',
      title: '망점 · 빗금 조각 셰이더',
      from: 'demos/demosMaterial.ts i11 make() 의 fragmentShader (uMode 1 · 2)',
      body: `uniform vec3 uLight; uniform float uCell; uniform float uMode; uniform vec3 uCol; uniform vec3 uInk;
varying vec3 vN;
// 줄 하나: fract 로 반복되는 띠
float ln(float x){ float f = abs(fract(x) - 0.5) * 2.0; return smoothstep(0.42, 0.18, f); }
void main(){
  float d = max(dot(normalize(vN), uLight), 0.0);
  float lum = 0.12 + 0.88 * d;
  vec3 col;
  if (uMode < 1.5) {                                   // 망점
    vec2 p = gl_FragCoord.xy / uCell;
    p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;     // 45도 돌린 격자
    vec2 c = fract(p) - 0.5;
    float r = sqrt(max(1.0 - lum, 0.0)) * 0.72;        // 어두울수록 큰 점
    float aa = 1.5 / uCell;
    float dotv = 1.0 - smoothstep(r - aa, r + aa, length(c));
    col = mix(uCol, uInk, dotv * 0.92);
  } else {                                             // 빗금 — 어두울수록 한 겹씩
    vec2 q = gl_FragCoord.xy / uCell;
    float ink = 0.0;
    if (lum < 0.85) ink = max(ink, ln((q.x + q.y) * 0.7));
    if (lum < 0.6)  ink = max(ink, ln((q.x - q.y) * 0.7));
    if (lum < 0.35) ink = max(ink, ln(q.x * 0.7 + 0.25));
    vec3 paper = mix(vec3(1.0, 0.98, 0.93), uCol, 0.25);
    col = mix(paper, uInk, ink * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
}
// 정점: vN = normalize(normalMatrix * normal); — uLight 도 같은 보기 공간 방향으로 넘긴다
// JS: uCell.value = Math.max(4, (화면높이 / 80) * 배율);`,
    },
    pitfalls: [
      { title: '화면에 붙은 무늬는 카메라가 움직이면 물체 위를 미끄러진다', fix: '느린 카메라 장면에서만, 또는 무늬를 물체 좌표(uv · 정점 위치)에 깐다.' },
      { title: '칸 크기를 픽셀 고정으로 두면 고해상도 폰에서 무늬가 깨알만 해진다', fix: '견본처럼 화면 높이에 비례해 정한다.' },
      { title: '톤 매핑이 켜져 있으면 종이 · 잉크 색이 바뀐다', fix: 'NoToneMapping 으로 둔다.', seen: true },
    ],
    prev: ['u01', 'u02'],
    next: ['i237', 'i238'],
  },

  i12: {
    id: 'i12',
    summary: '잡음 값이 진행도보다 작은 곳부터 조각을 버리고 경계를 금빛으로 빛내, 물체가 타들어 가듯 사라졌다 다시 나타나게 한다.',
    terms: [
      { en: 'Dissolve shader (noise threshold + discard)', ko: '잡음 문턱으로 조각 버리기' },
      { en: 'Burn edge', ko: '불탄 가장자리 — 문턱 바로 위 띠를 빛나게' },
      { en: 'Object-space 3D noise (fbm)', ko: '물체 좌표 3D 잡음 — 물체와 함께 돈다' },
    ],
    goal: '{target}이(가) 잡음 무늬를 따라 빛나는 테두리와 함께 사라졌다 나타나게 디졸브 셰이더를 만들어 줘. 분위기는 {style}.',
    targets: ['정답 숫자 블록', '마법으로 소환되는 캐릭터', '깨진 아이템'],
    styles: ['따뜻한 금빛 마법', '불타는 종이', '차가운 푸른 순간이동'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph 에서 Simple Noise 를 Alpha 에, 진행도를 Alpha Clip Threshold 에 넣고, 경계 띠는 Step 차이로 Emission 에.',
      godot: 'Godot ShaderMaterial 에서 잡음 텍스처 값과 진행도를 비교해 discard (또는 ALPHA_SCISSOR_THRESHOLD), 경계 띠는 EMISSION.',
    },
    principle: [
      '물체의 점마다 3D 잡음 값 dn(0~1)을 정한다 — 물체 좌표(position)로 재서 물체가 돌아도 무늬가 붙어 있다.',
      '진행도 uProg 보다 dn 이 작으면 그 조각을 버린다(discard). uProg 를 −0.15 → 1.05 로 올리면 다 사라진다.',
      '문턱 바로 위(폭 uEdge 0.07) 띠는 금빛 색 · 스스로 빛남(2.4배)을 더해 불탄 테두리가 된다.',
      '진행도를 거꾸로 내리면 같은 무늬로 다시 나타난다.',
    ],
    when: ['정답 블록 사라짐 · 아이템 획득 · 소환처럼 「사라짐」 자체가 연출일 때', '투명도 정렬 문제 없이 사라지게 하고 싶을 때 (discard 라 불투명 그대로)'],
    avoid: ['아주 빠른 사라짐(0.1초 미만) — 무늬가 안 보인다. 대신 크기 줄이기 · 번쩍', '폰에서 큰 화면 가득 — 조각마다 잡음 세 번이라 넓으면 무겁다'],
    cost: 'medium',
    costNote: '조각마다 값 잡음 3번(fbm). 블록 몇 개는 가볍지만 화면 가득한 물체는 잡음 텍스처로 바꾸는 편이 낫다.',
    level: 2,
    must: [
      '잡음은 물체 좌표(position)로 — 물체가 움직여도 무늬가 미끄러지지 않게',
      'clipping_planes_fragment 자리에서 discard, 경계 빛은 emissivemap_fragment 뒤에 totalEmissiveRadiance',
      '재질 side: THREE.DoubleSide — 버린 구멍 사이로 안쪽 면이 보이게',
      '진행도는 블록마다 따로 (uProg uniform 은 재질마다), 테 폭 · 잡음 크기 · 빠르기는 공유',
      '잡음은 반복문 없이 펼친 짧은 fbm 3겹 또는 미리 구운 텍스처',
    ],
    done: [
      '숫자 블록 셋이 차례로 잡음 모양 구멍이 번지며 금빛 테와 함께 사라졌다가 다시 채워진다',
      '구멍 사이로 블록 안쪽 면이 보인다',
      '「빛 테두리 폭」 0~0.2 · 「잡음 크기」 0.8~6 · 「빠르기」 슬라이더가 바로 반영된다',
    ],
    code: {
      lang: 'ts',
      title: '표준 재질에 디졸브 끼워 넣기',
      from: 'demos/demosMaterial.ts i12 make() 를 정리',
      body: `const uEdge = { value: 0.07 }, uScale = { value: 2.6 };
const uCol = { value: new THREE.Color(1.0, 0.62, 0.2) };
const NOISE =
  'varying vec3 vObjPos; uniform float uProg; uniform float uEdge; uniform float uScale; uniform vec3 uEdgeCol;\\n' +
  'float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }\\n' +
  'float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);\\n' +
  '  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),\\n' +
  '             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }\\n' +
  'float fbm(vec3 p){ return 0.55 * vn(p) + 0.3 * vn(p * 2.03) + 0.15 * vn(p * 4.1); }\\n'; // 반복문 없이 3겹

function dissolvable(map: THREE.Texture) {
  const prog = { value: 0 };                       // 블록마다 따로
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.45, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uProg: prog, uEdge, uScale, uEdgeCol: uCol });
    sh.vertexShader = 'varying vec3 vObjPos;\\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\\n vObjPos = position;');
    sh.fragmentShader = NOISE + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>',
        'float dn = fbm(vObjPos * uScale + 3.7);\\n if (dn < uProg) discard;\\n#include <clipping_planes_fragment>')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\\n' +
        'float de = 1.0 - smoothstep(0.0, uEdge, dn - uProg);\\n' +
        'diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeCol, de * 0.7);\\n' +
        'totalEmissiveRadiance += uEdgeCol * de * 2.4;');
  };
  return { mat, prog };
}
// 사라지기: prog.value 를 -0.15 → 1.05, 나타나기: 반대로`,
    },
    pitfalls: [
      { title: '잡음을 화면 · 세계 좌표로 재면 물체가 움직일 때 무늬가 흐른다', fix: '정점 셰이더에서 position(물체 좌표)을 넘겨 쓴다.' },
      { title: '진행도 0 에서도 점이 몇 개 뚫려 있다', fix: '잡음 최솟값이 0 근처라서다. 시작을 −0.15 처럼 0 아래로, 끝을 1.05 로 넘긴다.' },
      { title: '그림자는 구멍 없이 그대로 남는다', fix: '그림자 깊이 재질은 따로라 discard 가 안 걸린다. 그림자도 뚫려야 하면 customDepthMaterial 에 같은 줄.' },
      { title: '반복문 잡음을 여러 번 부르면 윈도 컴파일이 수십 초', fix: '보물 동굴에서 겪었다. 견본은 반복문 없이 3겹만 펼쳐 썼다. 더 필요하면 잡음 텍스처로.', seen: true },
    ],
    prev: ['u08'],
    next: ['i243'],
  },

  i13: {
    id: 'i13',
    summary: '정점 셰이더에서 시간 · 위치로 만든 sin 물결만큼 정점을 밀어, 깃발 · 나무가 바람에 일렁이게 한다 — CPU 계산 없이.',
    terms: [
      { en: 'Vertex displacement (wind sway)', ko: '정점 흔들기 — 바람 · 물결' },
      { en: 'Travelling sine wave', ko: '흘러가는 물결 sin(x·k − t·ω)' },
      { en: 'Analytic normal (derivative)', ko: '물결 식을 미분해 법선도 같이 기울이기' },
    ],
    goal: '{target}을(를) 정점 셰이더로 바람에 일렁이게 해 줘 — 뿌리 · 깃대 쪽은 고정, 끝으로 갈수록 크게. 느낌은 {style}.',
    targets: ['깃대에 단 깃발 · 소나무', '풀밭 · 꽃', '물결치는 천막'],
    styles: ['산들바람 부는 맑은 날', '귀엽고 아기자기', '거센 폭풍'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph 에서 Time · Sine 으로 만든 값을 Position 노드에 더해 Vertex Position 에 넣는다.',
      godot: 'Godot ShaderMaterial 의 vertex() 에서 VERTEX.z += sin(VERTEX.x * k - TIME * w) * 세기 · 무게.',
    },
    principle: [
      '깃발 정점의 깃대에서 거리 fx 로 무게를 준다: amp = 0.17 × 바람 × (fx / 1.3). 깃대 쪽은 0.',
      '물결 위상 ph = fx·5 − 시간·5 + y·1.5 — 깃대에서 끝으로 물결이 흘러간다.',
      '정점은 z 로 amp·sin(ph) 만큼 밀고, 법선은 그 식의 기울기(dz/dx)로 다시 계산해 빛이 물결을 따라 바뀐다.',
      '나무는 세계 높이의 제곱(hh²)을 무게로 두 sin 을 섞어 x · z 로 흔든다.',
      '모든 계산이 GPU 라 물체가 아무리 많아도 CPU 부담이 없다.',
    ],
    when: ['깃발 · 나무 · 풀 · 천처럼 배경이 살아 있어야 할 때', '물리 시뮬레이션까지는 필요 없는 흔들림'],
    avoid: ['손으로 잡아당기는 천 — 대신 천 시뮬레이션(질점 · 용수철)', '충돌해야 하는 물체 — 화면에서만 움직이고 판정 위치는 그대로다'],
    cost: 'light',
    costNote: '정점마다 sin 몇 번. 깃발은 정점 수(30×12 칸)가 충분해야 매끈하다.',
    level: 1,
    must: [
      'onBeforeCompile 로 표준 재질의 begin_vertex 뒤에 끼워 넣기 (빛 · 그림자 유지)',
      '깃발은 beginnormal_vertex 에서 법선도 같은 식의 미분으로 고치기 (안 고치면 빛이 납작)',
      '고정된 쪽(깃대 · 뿌리)은 무게 0 — 깃발 판은 translate 로 원점을 깃대 쪽에',
      '깃발 판은 가로 30 · 세로 12 칸 이상으로 쪼개기',
      '「바람」 · 「빠르기」 슬라이더, 같은 장면을 그대로 / 바람 셰이더로 나란히',
    ],
    done: [
      '오른쪽 깃발이 깃대에서 끝으로 물결이 흘러가며 일렁이고, 접힌 곳마다 밝기가 달라진다',
      '오른쪽 소나무 위쪽이 살랑 흔들리고 밑동은 그대로다',
      '「바람」 0 이면 왼쪽과 똑같이 멈춘다',
    ],
    code: {
      lang: 'ts',
      title: '깃발: 정점 밀기 + 법선 고치기',
      from: 'demos/demosMaterial.ts i13 make() 의 flagB.onBeforeCompile',
      body: `const uTime = { value: 0 }, uWind = { value: 1 }, uSpeed = { value: 1 };
const flagG = new THREE.PlaneGeometry(1.3, 0.8, 30, 12); // 충분히 쪼개야 매끈
flagG.translate(0.65, 0, 0);                              // x = 0 이 깃대 쪽
const flag = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 });
flag.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uTime, uWind, uSpeed });
  sh.vertexShader = 'uniform float uTime;\\nuniform float uWind;\\nuniform float uSpeed;\\n' + sh.vertexShader
    .replace('#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\\n' +
      'float fx = position.x;\\n' +
      'float amp = 0.17 * uWind * (fx / 1.3);\\n' +                 // 깃대에서 멀수록 크게
      'float ph = fx * 5.0 - uTime * 5.0 * uSpeed + position.y * 1.5;\\n' +
      'float dzdx = 0.17 * uWind / 1.3 * sin(ph) + amp * 5.0 * cos(ph);\\n' + // 미분
      'objectNormal = normalize(vec3(-dzdx, -amp * 1.5 * cos(ph), 1.0));')
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\\n' +
      'transformed.z += amp * sin(ph);\\n' +
      'transformed.y += -0.04 * uWind * (fx / 1.3) * (fx / 1.3) + 0.02 * uWind * sin(ph * 0.5) * (fx / 1.3);');
};
// 나무 잎: hh = clamp((세계 y + 0.5) / 1.6, 0, 1.5) 의 제곱만큼
//   transformed.x += (sin(t*1.8 + wx*0.8)*0.5 + sin(t*3.7 + wy*3.0)*0.18) * 0.22 * uWind * hh*hh;
function update(t: number) { uTime.value = t; }`,
    },
    pitfalls: [
      { title: '정점만 밀고 법선을 안 고치면 깃발이 휘어도 빛은 납작하다', fix: 'beginnormal_vertex 에서 같은 물결 식의 미분으로 objectNormal 을 다시 만든다.' },
      { title: '판을 너무 적게 쪼개면 물결이 각진다', fix: '견본은 30 × 12 칸. 물결 한 주기에 최소 6~8 정점.' },
      { title: '위치를 세계 좌표로 쓰면 같은 나무 여러 그루가 각자 다르게 흔들린다', fix: '나무는 일부러 세계 x 를 넣어 서로 엇갈리게 했다. 같게 흔들려야 하면 물체 좌표만 쓴다.' },
      { title: '그림자는 흔들리지 않는다', fix: '그림자도 흔들려야 하면 customDepthMaterial 에 같은 줄을 넣는다.' },
    ],
    prev: ['u08'],
    next: ['i84'],
    refs: [{ name: 'three.js 예제 — webgl_materials_modified', url: 'https://threejs.org/examples/#webgl_materials_modified' }],
  },

  i84: {
    id: 'i84',
    summary: '미리 구운 3D 잡음 텍스처 하나로 거칠기 얼룩 · 색 차이 · 그을음 줄 · 열 변색을 물체 좌표에 입혀, 플라스틱 같은 CG 금속을 실제 쓰던 금속처럼 만든다.',
    terms: [
      { en: 'Procedural wear / weathering material', ko: '절차 마모 재질 — 코드로 만든 낡음' },
      { en: 'Baked 3D noise texture (Data3DTexture)', ko: '미리 구운 3D 잡음 — 셰이더는 읽기만' },
      { en: 'Roughness breakup', ko: '거칠기를 고르지 않게 흩뜨리기' },
      { en: 'Heat tint gradient', ko: '열로 변한 색 (파랑 → 보라 → 금색)' },
    ],
    goal: '{target}에 절차 마모 재질을 입혀 줘 — 3D 잡음 텍스처 하나로 거칠기 얼룩 · 색 차이 · 그을음 줄 · 열 변색. 느낌은 {style}.',
    targets: ['로켓 엔진 노즐 · 기계 부품', '보드게임 금속 말', '낡은 무기 · 소품'],
    styles: ['실제 쓰던 금속', '오래된 유물', '깨끗한 새 제품'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 3D 잡음을 Texture3D 로 구워 Shader Graph 의 Sample Texture 3D 로 읽고, 거칠기 · 색에 곱한다.',
      godot: 'Godot 은 NoiseTexture3D 를 ShaderMaterial 의 sampler3D 로 넘겨 ROUGHNESS · ALBEDO 에 곱한다.',
    },
    principle: [
      '시작할 때 64³ 크기의 4겹 값 잡음을 Data3DTexture 로 한 번 굽는다 (반복되게, 선형 필터).',
      '셰이더는 물체 좌표 × detail 로 그 텍스처를 두세 번 읽기만 한다 — 반복문 잡음이 없어 컴파일이 빠르다.',
      '거칠기 ×(1 ± 얼룩), 색 ×(1 ± 색 차이)로 고르지 않게 흩뜨리고, 세로로 늘인 잡음으로 그을음 줄을 그린다.',
      '열 변색: 물체 높이 y 를 0~1 로 바꿔 파랑 → 보라 → 금색으로 섞는다 (잡음으로 경계를 흔든다).',
      'onBeforeCompile 로 표준 재질에 끼워 넣어 빛 · 반사 · 그림자는 그대로다.',
    ],
    when: ['금속 · 기계가 「컴퓨터 그림」처럼 매끈해 보일 때', '여러 소품에 같은 낡음을 일관되게 입히고 싶을 때 (값만 다르게)'],
    avoid: ['아주 귀엽고 깨끗한 그림체 — 낡음이 지저분해 보인다', '폰에서 수백 종 재질 — 재질마다 셰이더가 컴파일된다. 대신 값 몇 가지로 묶기'],
    cost: 'medium',
    costNote: '조각마다 3D 텍스처 3~4번 읽기 (반복문 잡음보다 훨씬 싸다). 시작할 때 64³ = 26만 칸 굽기 한 번.',
    level: 2,
    must: [
      '잡음은 반복문 GLSL 이 아니라 미리 구운 Data3DTexture(RedFormat · LinearFilter · RepeatWrapping) 로',
      '좌표는 물체 좌표 — 물체가 돌아도 얼룩이 붙어 있게',
      '세기 값(거칠기 얼룩 · 색 차이 · 그을음 · 열 변색)은 uniform 으로 — 재질 하나로 여러 값',
      '반사할 환경(PMREM 스튜디오)이 있어야 거칠기 얼룩이 보인다',
      '왼쪽 그냥 금속 · 오른쪽 마모 금속을 같은 모양으로 나란히',
    ],
    done: [
      '오른쪽 금속에는 반사가 고르지 않게 흐려진 얼룩 · 세로 그을음 줄이 보이고, 왼쪽은 고른 거울 같은 금속이다',
      '노즐 끝에서 위로 파랑 → 보라 → 금색 열 변색이 보이고, 경계가 잡음으로 흔들린다',
      '「열」 · 「마모」 값을 바꾸면 바로 반영된다',
      '첫 화면이 멈추지 않는다 (셰이더 컴파일 1초 안쪽)',
    ],
    code: {
      lang: 'glsl',
      title: '구운 3D 잡음으로 거칠기 · 색 · 그을음 · 열 변색',
      from: 'vendor/airsup/core/materials.ts surf() 의 onBeforeCompile 조각 (demos/demosAirsup.ts i84 가 씀)',
      body: `// JS: NOISE3D.value = makeNoise3D(64)  — 64³ 4겹 값 잡음 Data3DTexture (RedFormat, Linear, Repeat)
// uDetail = (detail, roughVar, colorVar, bump) · uTintRange = (y0, y1, strength)
uniform highp sampler3D uNoise3D;
uniform vec4 uDetail; uniform float uStreaks;
uniform vec3 uTintA; uniform vec3 uTintB; uniform vec3 uTintC; uniform vec3 uTintRange;
varying vec3 vObj;                                   // 물체 좌표 (정점에서 넘김)
float n3(vec3 p) { return texture(uNoise3D, p).r; }
float fbm2(vec3 p) { return n3(p) * 0.65 + n3(p * 2.7 + 0.31) * 0.35; }

// ① clipping_planes_fragment 뒤: 잡음 값 둘
vec3 dp = vObj * uDetail.x;
float surfN1 = fbm2(dp);
float surfN2 = n3(dp * 3.3 + vec3(7.3, 1.1, 3.7));
float st = n3(vec3(vObj.x * uDetail.x * 2.2, vObj.y * uDetail.x * 0.18, vObj.z * uDetail.x * 2.2)); // 세로로 늘인 잡음
surfN1 = mix(surfN1, st, 0.55);

// ② color_fragment 뒤: 색 차이 · 열 변색 · 그을음
diffuseColor.rgb *= 1.0 + (surfN1 - 0.5) * uDetail.z * 2.0;
float ty = clamp((vObj.y - uTintRange.x) / (uTintRange.y - uTintRange.x), 0.0, 1.0);
ty = clamp(ty + (surfN2 - 0.5) * 0.18, 0.0, 1.0);
vec3 tc = ty < 0.5 ? mix(uTintA, uTintB, ty * 2.0) : mix(uTintB, uTintC, ty * 2.0 - 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, tc, uTintRange.z);
diffuseColor.rgb *= 1.0 - uStreaks * smoothstep(0.45, 0.8, surfN1);

// ③ metalnessmap_fragment 뒤: 거칠기 얼룩
roughnessFactor = clamp(roughnessFactor * (1.0 + (surfN2 - 0.5) * uDetail.y * 2.0), 0.03, 1.0);
// 견본 노즐 값: detail 1.3 · roughVar 0.28 · colorVar 0.05 · streaks 0.28 · tint 0x34477e → 0x6b5a78 → 0xb58a4a, 세기 0.6`,
    },
    pitfalls: [
      { title: '반복문 fbm 잡음을 셰이더에서 여러 번 부르면 윈도 컴파일이 17~20초 멈춘다', fix: '보물 동굴 게임에서 실제로 겪었다. 잡음은 미리 구운 3D 텍스처로 읽기만 하고, 값은 uniform 으로 돌려 셰이더 종류를 하나로.', seen: true },
      { title: '세계 좌표로 잡음을 읽으면 물체가 움직일 때 얼룩이 흐른다', fix: '정점에서 물체 좌표(vObj)를 넘긴다.' },
      { title: '환경 반사가 없으면 거칠기 얼룩이 안 보인다', fix: '금속은 반사로 드러난다. PMREM 스튜디오 환경을 넣는다.' },
      { title: '마모를 세게 하면 「더러운」 그림이 된다', fix: '견본 색 차이는 0.05 처럼 작게. 거칠기 얼룩이 먼저, 색 얼룩은 아주 조금.' },
    ],
    prev: ['u08', 'u10'],
    next: ['i229'],
    refs: [{ name: 'AirsupHQ/airsup-lab (원본 저장소, MIT)', url: 'https://github.com/AirsupHQ/airsup-lab' }],
    source: [{ file: 'demosAirsup.ts', symbol: 'wearMats' }],
  },

  i221: {
    id: 'i221',
    summary: '푸른 빛을 더하기 섞기로 그리고 가장자리 빛 · 흐르는 주사선 · 깜박임 · 가로 찢김을 얹어, 투사기 위에 뜬 홀로그램처럼 보이게 한다.',
    terms: [
      { en: 'Hologram shader', ko: '홀로그램 셰이더' },
      { en: 'Scanlines', ko: '흐르는 가로 주사선' },
      { en: 'Additive blending', ko: '더하기 섞기 — 겹칠수록 밝아짐, 깊이 쓰기 끔' },
      { en: 'Glitch (vertex slice offset)', ko: '높이 띠마다 정점을 옆으로 튀기는 찢김' },
    ],
    goal: '{target}을(를) 홀로그램 셰이더로 그려 줘 — 반투명 푸른빛 · 가장자리 빛 · 흐르는 주사선 · 깜박임 · 가끔 가로 찢김. 분위기는 {style}.',
    targets: ['투사기 위에 뜬 입체 도형', '단서 · 지도 미리 보기', '통신 화면 속 인물'],
    styles: ['어두운 SF 관제실', '귀여운 미래 로봇', '고장 난 옛 장치'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph(Unlit · Transparent · Additive)에서 Fresnel Effect + Position.y 로 만든 sin 줄을 Emission 에 더한다.',
      godot: 'Godot ShaderMaterial 에 render_mode blend_add, unshaded 를 두고 fragment() 에서 같은 식으로 ALBEDO 를 만든다.',
    },
    principle: [
      '빛 계산 없이 색만 내는 ShaderMaterial 을 더하기 섞기 · 깊이 쓰기 끔 · 양면으로 그린다 — 겹칠수록 밝아지는 빛 덩어리.',
      '가장자리 빛: fr = (1 − |N·V|)² — 윤곽이 가장 밝다.',
      '주사선: 세계 높이 × 촘촘함(46) − 시간 × 5 로 sin 을 5제곱해 가는 줄이 위로 흐른다. 넓은 빛 띠 하나도 천천히 올라간다.',
      '깜박임: 시간을 13칸으로 끊은 난수가 0.8 을 넘으면 0.55 만큼 어둡게.',
      '찢김: 정점 셰이더에서 높이를 16띠로 나눠, 난수에 걸린 띠만 x 로 0.14 만큼 흔든다.',
    ],
    when: ['단서 · 미리 보기 · 통신처럼 「진짜 물건이 아닌」 것을 보여 줄 때', '어두운 배경의 SF · 미래 장면'],
    avoid: ['밝은 낮 배경 — 더하기 섞기가 묻혀 안 보인다', '읽어야 하는 글씨 — 깜박임 · 찢김이 방해된다. 대신 깜박임 없는 패널'],
    cost: 'light',
    costNote: '조명 계산 없는 짧은 셰이더. 더하기 섞기라 겹친 넓이만큼 채우기 비용이 든다.',
    level: 1,
    must: [
      'ShaderMaterial + transparent · AdditiveBlending · depthWrite false · DoubleSide',
      '주사선은 세계 높이(vW.y)로 — 물체가 돌아도 줄이 수평',
      '깜박임 · 찢김은 시간을 칸으로 끊은 난수 (floor(t × 13)) — 매 프레임 깜박이지 않게',
      '투사기 받침 · 빛 원뿔 · 솟는 빛 알갱이를 함께 두어 「투사된」 느낌',
      '「홀로그램 켜기」 · 「주사선 촘촘함」 · 「깜박임」 · 「글리치」 조절',
    ],
    done: [
      '투사기 위의 매듭이 속이 비치는 푸른 빛으로 보이고, 윤곽이 가장 밝다',
      '가는 주사선과 넓은 빛 띠가 위로 흐르고, 가끔 깜박이며 가로로 찢긴다',
      '끄면 그냥 파란 재질로 바뀌어 차이가 분명하다',
    ],
    code: {
      lang: 'ts',
      title: '홀로그램 정점(찢김) · 조각(가장자리 · 주사선 · 깜박임)',
      from: 'demos/demosLook2.ts makeHolo() 를 정리',
      body: `const uni = { uTime: { value: 0 }, uDensity: { value: 46 }, uFlicker: { value: 0.6 }, uGlitch: { value: 1 }, uColor: { value: new THREE.Color(0x3fd8ff) } };
const vert = [
  'uniform float uTime; uniform float uGlitch; varying vec3 vW; varying vec3 vN;',
  'float h1(float n){ return fract(sin(n) * 43758.5453); }',
  'void main(){',
  '  vec4 w = modelMatrix * vec4(position, 1.0);',
  '  float slice = floor(w.y * 16.0);',                       // 높이 띠
  '  float on = step(0.9, h1(slice * 7.13 + floor(uTime * 7.0))) * step(0.55, h1(floor(uTime * 3.0)));',
  '  w.x += on * uGlitch * 0.14 * sin(uTime * 60.0 + slice);', // 걸린 띠만 옆으로
  '  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);',
  '  gl_Position = projectionMatrix * viewMatrix * w;',
  '}'].join(' ');
const frag = [
  'uniform float uTime, uDensity, uFlicker; uniform vec3 uColor; varying vec3 vW; varying vec3 vN;',
  'float h1(float n){ return fract(sin(n) * 43758.5453); }',
  'void main(){',
  '  vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);',
  '  float fr = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 2.0);',
  '  float sl = pow(sin(vW.y * uDensity - uTime * 5.0) * 0.5 + 0.5, 5.0);',
  '  float b = fract(vW.y * 0.42 - uTime * 0.32);',
  '  float band = smoothstep(0.0, 0.05, b) * (1.0 - smoothstep(0.05, 0.22, b));',
  '  float fl = 1.0 - uFlicker * (step(0.8, h1(floor(uTime * 13.0))) * 0.55 + 0.07 * sin(uTime * 95.0));',
  '  float a = (0.035 + fr * 1.2 + sl * 0.22 + band * 0.6) * fl;',
  '  gl_FragColor = vec4(uColor * a + vec3(0.7, 0.95, 1.0) * fr * fr * 0.7 * fl, 1.0);',
  '}'].join(' ');
const holo = new THREE.ShaderMaterial({
  uniforms: uni, vertexShader: vert, fragmentShader: frag,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.46, 0.15, 220, 28, 2, 3), holo);
knot.position.y = 1.2;
scene.add(knot);
function update(t: number) { uni.uTime.value = t; }`,
    },
    pitfalls: [
      { title: '깊이 쓰기를 켜 두면 뒷면 · 그물이 가려진다', fix: 'depthWrite: false 로. 더하기 섞기라 그리는 순서가 상관없다.' },
      { title: '매 프레임 난수로 깜박이면 눈이 아프다', fix: 'floor(시간 × 13)처럼 칸으로 끊고, 어두워지는 칸도 20% 정도만.' },
      { title: '빛 번짐(u20)과 겹치면 하얗게 날아간다', fix: '홀로그램 밝기를 번짐 문턱 근처로 맞추거나 번짐 세기를 낮춘다.' },
    ],
    prev: ['i10'],
    next: ['i226', 'u20'],
  },

  i226: {
    id: 'i226',
    summary: '고른 물체만 조금 큰 뒷면 껍데기 테와 바깥 빛무리를 숨 쉬듯 키웠다 줄여, 「지금 누를 것」이 판 위에서 바로 보이게 한다.',
    terms: [
      { en: 'Selection highlight (pulsing outline)', ko: '선택 강조 — 맥박치는 테' },
      { en: 'Inverted hull + normal extrusion', ko: '법선 쪽으로 민 뒷면 껍데기' },
      { en: 'Fresnel glow shell', ko: '바깥으로 옅어지는 빛무리 껍데기' },
    ],
    goal: '{target} 가운데 고른 것에 숨 쉬듯 맥박치는 빛 테와 빛무리를 둘러 줘 — 고르면 부드럽게 켜지고, 바닥에 물결 고리. 느낌은 {style}.',
    targets: ['판 위 말 · 블록 (지금 누를 것)', '고른 캐릭터', '퀘스트 대상 물건'],
    styles: ['따뜻한 금빛', '귀엽고 아기자기', '차가운 하늘빛'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 메시를 두 번째 재질(Cull Front, 정점을 법선 쪽으로 밀기)로 그리고, 굵기를 sin(Time) 으로 움직인다. URP 는 Renderer Feature 로 덧그리기도 된다.',
      godot: 'Godot 은 재질 Next Pass 에 Cull Front + Grow 재질, grow_amount 를 sin 으로 바꾸거나 ShaderMaterial 의 vertex() 에서 NORMAL 쪽으로 민다.',
    },
    principle: [
      '같은 모양을 뒷면만 그리면서 정점을 법선 쪽으로 uW(0.045)만큼 민다 — 물체를 두른 테가 된다.',
      '두께에 맥박 0.7 + 0.6 × (0.5 + 0.5 sin(t × 4.2)) 을 곱해 숨 쉬듯 굵어졌다 가늘어진다.',
      '바깥에 3.4배 더 민 두 번째 껍데기를 더하기 섞기로 그리고, 가장자리로 갈수록 옅게(1 − 프레넬) — 빛무리.',
      '켜짐 값 uOn 을 0 → 1 로 부드럽게(dt × 9) 옮겨, 고를 때 테가 쑥 자라고 고르지 않으면 줄어든다.',
      '바닥에는 고리 두 개가 커지며 옅어져 「여기!」를 알린다. 고른 것은 살짝 떠오르며 더 빨리 돈다.',
    ],
    when: ['판 게임에서 지금 누를 수 있는 것 · 고른 것을 크게 알려야 할 때', '아이들이 「어디 눌러?」를 묻지 않게'],
    avoid: ['얇은 판 · 카드 — 껍데기가 판 두께만큼만 보인다. 대신 화면 외곽선(i03)이나 테두리 빛(i10)', '수십 개를 동시에 강조 — 맥박이 시끄럽다. 하나 · 둘만'],
    cost: 'light',
    costNote: '고른 물체 하나에 껍데기 두 장 더 그리기. 고르지 않은 것은 visible = false 라 비용 0.',
    level: 1,
    must: [
      '테 · 빛무리 껍데기는 같은 geometry · BackSide · 정점을 normal 쪽으로 밀기 (크기 배율 아님 — 모서리가 벌어지지 않게)',
      '켜짐 값 uOn 은 dt 기반으로 부드럽게, 0.01 아래면 visible = false',
      '빛무리는 AdditiveBlending · depthWrite false',
      '바닥 물결 고리 · 고른 것 살짝 떠오름을 함께',
      '「다음 것 고르기」 · 「저절로 바꾸기」 · 「테 두께」 · 「맥박 빠르기」',
    ],
    done: [
      '물체 다섯 개 중 하나만 금빛 테 + 빛무리가 숨 쉬듯 커졌다 작아지고, 바닥에 고리가 퍼진다',
      '다음 것으로 바꾸면 앞의 테는 줄어들고 새 테가 자라난다 (뚝 끊기지 않음)',
      '상자 · 공 · 고리 · 캡슐 모두 테 굵기가 고르다',
    ],
    code: {
      lang: 'ts',
      title: '맥박치는 껍데기 테 + 빛무리',
      from: 'demos/demosLook2.ts makeSelect() 를 정리',
      body: `const shared = { uTime: { value: 0 }, uW: { value: 0.045 }, uSpeed: { value: 1 } };
// scale 만큼 법선 쪽으로 밀기 (테 1.0 · 빛무리 3.4)
const hullVert = (scale: string) => [
  'uniform float uW, uTime, uSpeed, uOn; varying vec3 vN; varying vec3 vW;',
  'void main(){',
  '  float pulse = 0.5 + 0.5 * sin(uTime * 4.2 * uSpeed);',
  '  vec3 p = position + normal * uW * (' + scale + ') * (0.7 + 0.6 * pulse) * uOn;',
  '  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);',
  '  gl_Position = projectionMatrix * viewMatrix * w;',
  '}'].join(' ');

function addHighlight(g: THREE.Group, geo: THREE.BufferGeometry) {
  const u = { ...shared, uOn: { value: 0 } };   // 켜짐은 물체마다
  const ring = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: hullVert('1.0'), side: THREE.BackSide,
    fragmentShader: 'uniform float uTime, uSpeed, uOn; void main(){ float pulse = 0.5 + 0.5 * sin(uTime * 4.2 * uSpeed);' +
      ' gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.25), vec3(1.0, 1.0, 0.9), pulse) * 1.2, 1.0); }',
  });
  const glow = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: hullVert('3.4'), side: THREE.BackSide,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    fragmentShader: 'uniform float uTime, uSpeed, uOn; varying vec3 vN; varying vec3 vW; void main(){' +
      ' float pulse = 0.5 + 0.5 * sin(uTime * 4.2 * uSpeed); vec3 V = normalize(cameraPosition - vW);' +
      ' float f = pow(1.0 - abs(dot(normalize(vN), V)), 1.5);' +
      ' gl_FragColor = vec4(vec3(1.0, 0.8, 0.3) * (1.0 - f) * (0.25 + 0.35 * pulse) * uOn, 1.0); }',
  });
  const hull = new THREE.Mesh(geo, ring), halo = new THREE.Mesh(geo, glow);
  g.add(halo, hull);
  return { u, hull, halo };
}

// 매 프레임: 고른 것은 1 로, 나머지는 0 으로 부드럽게
function tick(h: ReturnType<typeof addHighlight>, selected: boolean, dt: number) {
  h.u.uOn.value += ((selected ? 1 : 0) - h.u.uOn.value) * Math.min(1, dt * 9);
  h.hull.visible = h.halo.visible = h.u.uOn.value > 0.01;
}`,
    },
    pitfalls: [
      { title: '크기 배율로 껍데기를 키우면 상자 모서리 · 고리 안쪽에서 테가 벌어지거나 사라진다', fix: '정점을 법선 쪽으로 미는 방식으로. 견본은 상자 · 공 · 캡슐 · 고리 · 다면체 모두 같은 셰이더를 쓴다.' },
      { title: '켜고 끌 때 뚝 나타나면 싸 보인다', fix: 'uOn 을 dt × 9 로 쫓아가게 해 쑥 자라고 줄어들게.' },
      { title: '누를 곳이 옆 칸 글씨로만 안내되면 아이들이 모른다', fix: '이 사이트 원칙 — 누를 곳은 판 위에서 빛나게. 맥박 테가 그 방법이다.', seen: true },
    ],
    prev: ['u02', 'i10'],
    next: ['i03'],
  },

  i229: {
    id: 'i229',
    summary: 'UV 대신 물체 좌표의 세 평면(yz · xz · xy)에 무늬를 투영하고 법선 방향으로 섞어, 어떤 모양에도 무늬가 늘어나거나 이음새 없이 고르게 덮는다.',
    terms: [
      { en: 'Triplanar mapping', ko: '삼면 투영 — 세 축 방향에서 비춰 섞기' },
      { en: 'Blend weights = |N|^k normalized', ko: '법선 성분의 k 제곱으로 섞는 비율' },
      { en: 'UV stretching / seams', ko: 'UV 늘어남 · 이음새 — 피하려는 문제' },
    ],
    goal: '{target}에 삼면 투영 무늬를 입혀 줘 — UV 없이 x · y · z 세 방향에서 비춰 법선으로 섞기. 느낌은 {style}.',
    targets: ['울퉁불퉁 덩어리 · 긴 기둥', '지형 · 바위', '쌓기나무 · 블록'],
    styles: ['알록달록 타일', '자연스러운 돌 · 흙', '깔끔한 격자 무늬'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph 의 Triplanar 노드 (Blend 값 = 섞임 날카로움).',
      godot: 'Godot StandardMaterial3D 의 UV1 → Triplanar 를 켜고 Triplanar Sharpness 로 섞임을 정한다.',
    },
    principle: [
      'UV 무늬는 모양을 펴서 붙이므로 울퉁불퉁한 곳은 늘어나고, 펴는 경계에 이음새가 생긴다.',
      '삼면 투영은 물체 좌표 p 로 세 번 읽는다: x 쪽에서 (p.z, p.y), y 쪽에서 (p.x, p.z), z 쪽에서 (p.x, p.y).',
      '섞는 비율 b = |N|^6 을 합이 1 이 되게 나눈다 — 면이 바라보는 축의 그림이 거의 다 차지한다.',
      '지수(날카로움)를 올리면 경계가 또렷하고, 내리면 부드럽게 겹친다.',
    ],
    when: ['UV 를 펴기 어려운 생성 모양 · 지형 · SDF 메시', '크기가 제각각인 블록에 같은 칸 크기 무늬'],
    avoid: ['얼굴 · 글씨처럼 정해진 자리에 붙어야 하는 그림 — 대신 UV + CanvasTexture(u09)', '아주 많은 물체를 폰에서 — 텍스처를 세 번 읽는다'],
    cost: 'light',
    costNote: '조각마다 텍스처 3번 읽기. 보통 재질보다 조금 무겁지만 폰 OK.',
    level: 2,
    must: [
      '좌표는 물체 좌표(position)와 물체 법선(normal) — 물체가 돌아도 무늬가 붙어 있게',
      '섞는 비율은 pow(abs(n), 날카로움) 을 합으로 나누기 (합 1)',
      '무늬 텍스처는 RepeatWrapping',
      '왼쪽 같은 모양 UV 무늬 · 오른쪽 삼면 투영으로 비교, 축 색 보기 단추(빨 x · 초 y · 파 z)',
      '「섞임 날카로움」 1~24 · 「무늬 크기」 슬라이더',
    ],
    done: [
      '왼쪽 덩어리 · 긴 상자는 무늬가 늘어나고 이음새가 보이고, 오른쪽은 어디서나 칸 크기가 같다',
      '「축 색 보기」를 켜면 면 방향마다 빨강 · 초록 · 파랑이 칠해져 어느 축 그림인지 보인다',
      '날카로움을 1 로 내리면 세 그림이 흐릿하게 겹친다',
    ],
    code: {
      lang: 'glsl',
      title: '삼면 투영 조각 셰이더',
      from: 'demos/demosLook2.ts makeTriplanar() 의 triMat',
      body: `// 정점: vO = position; vON = normal; vN = normalize(mat3(modelMatrix) * normal);
uniform sampler2D uMap; uniform float uScale, uSharp, uDebug; uniform vec3 uLight;
varying vec3 vO; varying vec3 vON; varying vec3 vN;
void main(){
  vec3 n = normalize(vON);
  vec3 b = pow(abs(n), vec3(uSharp));          // 바라보는 축일수록 큰 비율
  b /= (b.x + b.y + b.z);                      // 합 = 1
  vec3 p = vO * uScale;
  vec3 cx = texture2D(uMap, p.zy).rgb;         // x 쪽에서 본 그림
  vec3 cy = texture2D(uMap, p.xz).rgb;         // y 쪽 (위)
  vec3 cz = texture2D(uMap, p.xy).rgb;         // z 쪽 (앞)
  vec3 alb = cx * b.x + cy * b.y + cz * b.z;
  if (uDebug > 0.5) alb = mix(alb, b * vec3(1.0, 0.9, 1.2), 0.6); // 축 색 보기
  vec3 N = normalize(vN);
  float diff = max(dot(N, uLight), 0.0);
  vec3 amb = mix(vec3(0.30, 0.24, 0.32), vec3(0.72, 0.78, 1.0), N.y * 0.5 + 0.5) * 0.55;
  gl_FragColor = vec4(alb * (amb + diff * vec3(1.0, 0.95, 0.88) * 1.05), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
// JS: uScale 0.9 · uSharp 6, 무늬 텍스처 wrapS = wrapT = RepeatWrapping`,
    },
    pitfalls: [
      { title: '세계 좌표로 투영하면 물체가 움직일 때 무늬가 흐른다', fix: '물체 좌표 · 물체 법선으로. 지형처럼 고정된 것만 세계 좌표가 편하다.' },
      { title: '45° 기운 면은 두 그림이 반씩 겹쳐 흐릿하다', fix: '날카로움(지수)을 올리면 겹치는 띠가 좁아진다 (견본 6).' },
      { title: 'ShaderMaterial 에 색공간 · 톤 매핑을 안 붙이면 다른 재질과 색이 다르다', fix: '끝에 tonemapping_fragment · colorspace_fragment 를 include 한다.' },
    ],
    prev: ['u09'],
    next: ['i230', 'i84'],
  },

  i230: {
    id: 'i230',
    summary: '평평한 판에서 눈길을 따라 높이 그림 속으로 광선을 한 걸음씩 걸어 들어가 닿은 곳의 색을 읽어, 벽돌 · 타일이 진짜로 움푹 파여 보이고 스스로 그림자까지 진다.',
    terms: [
      { en: 'Parallax occlusion mapping (POM)', ko: '시차 차폐 매핑 — 높이 속으로 광선 걷기' },
      { en: 'Height map ray march', ko: '높이 그림 위를 여러 층으로 나눠 걷기' },
      { en: 'Self-shadowing', ko: '튀어나온 곳이 옆에 드리우는 그림자' },
      { en: 'textureGrad', ko: '어긋난 좌표에서도 밉맵이 튀지 않게 기울기를 직접 주기' },
    ],
    goal: '{target}에 시차 차폐 매핑을 넣어 줘 — 평면인데 높이 그림 속으로 광선을 걸어 움푹 파여 보이고, 빛 쪽으로도 걸어 스스로 그림자. 분위기는 {style}.',
    targets: ['등불 비친 벽돌 바닥', '성벽 · 돌길', '타일 벽'],
    styles: ['어두운 지하 등불', '햇살 비친 성', '깨끗한 욕실 타일'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Shader Graph 의 Parallax Occlusion Mapping 노드, HDRP Lit 은 Displacement Mode 를 Pixel Displacement 로.',
      godot: 'Godot StandardMaterial3D 의 Height(heightmap) 에서 Deep Parallax 를 켜고 최소 · 최대 층 수를 정한다.',
    },
    principle: [
      '노멀 맵은 빛만 바꿔 여전히 납작하다. 비스듬히 보면 튀어나온 벽돌이 뒤를 가려야 하는데 그게 없다.',
      '시차 차폐는 눈 방향을 판의 접선 공간으로 바꿔, 높이 그림 위를 n 층(정면 10 ~ 비스듬 36)으로 나눠 걷는다.',
      '광선의 깊이가 그 자리의 파인 깊이(1 − 높이)를 넘는 첫 층에서 멈추고, 앞 층과 사이를 직선으로 보간해 정확한 자리를 찾는다.',
      '찾은 자리에서 빛 쪽으로 12걸음 다시 걸어, 더 높은 곳이 막고 있으면 그림자(최대 0.9)를 준다.',
      '법선은 찾은 자리의 높이 차이로 새로 만들어 빛도 요철을 따른다.',
    ],
    when: ['바닥 · 벽처럼 넓은 평면을 가까이서 비스듬히 볼 때', '모델 정점을 늘리지 않고 깊은 요철이 필요할 때'],
    avoid: ['물체 윤곽까지 울퉁불퉁해야 할 때 — POM 은 실루엣을 못 바꾼다. 대신 진짜 변위', '폰 저사양 · 화면 가득 — 조각마다 최대 40 + 12 번 텍스처 읽기. 대신 노멀 맵(u10)'],
    cost: 'heavy',
    costNote: '조각마다 높이 그림 최대 40번(광선) + 12번(그림자) + 법선 4번 읽기. 화면 가득 넓은 바닥이면 폰에서 무겁다.',
    level: 3,
    must: [
      '눈 방향 · 빛 방향을 판의 접선 공간으로 바꿔 계산 (견본 바닥은 x · −z · y)',
      '층 수는 보는 각에 따라 mix(36, 10, 정면도) — 정면은 적게, 비스듬하면 많게',
      '반복문 최대 횟수는 상수(40)로 두고 break — 셰이더 컴파일이 길어지지 않게',
      '텍스처 읽기는 textureGrad(원래 좌표의 dFdx · dFdy) — 어긋난 좌표에서 밉맵 경계 줄 방지',
      '「깊이」 0~0.14 · 「스스로 드리운 그림자」 · 나누는 줄(왼쪽 노멀 맵만 · 오른쪽 POM)',
    ],
    done: [
      '등불이 도는 벽돌 바닥 — 나누는 줄 왼쪽은 납작, 오른쪽은 벽돌이 솟고 줄눈이 깊게 파여 보인다',
      '카메라가 비스듬해질수록 오른쪽 벽돌이 뒤 줄눈을 가린다',
      '「스스로 드리운 그림자」를 켜면 벽돌 옆 줄눈에 등불 반대쪽 그림자가 진다',
    ],
    code: {
      lang: 'glsl',
      title: '높이 속으로 광선 걷기 + 보간 (POM 핵심)',
      from: 'demos/demosLook2.ts makePom() 의 floor 조각 셰이더 (pom 부분)',
      body: `uniform sampler2D uH; uniform float uDepth;      // uH: 흰 = 높음, uDepth 0.07
varying vec3 vW;
// ... main() 안
vec2 uv = vec2(vW.x, -vW.z) * 0.32;
vec2 dx = dFdx(uv), dy = dFdy(uv);                 // 원래 좌표의 기울기 — 밉맵용
vec3 V = normalize(cameraPosition - vW);
vec3 vT = vec3(V.x, -V.z, V.y);                    // 바닥 판의 접선 공간
vec2 tuv = uv;
float n = mix(36.0, 10.0, clamp(vT.z, 0.0, 1.0));  // 비스듬할수록 층을 많이
float layer = 1.0 / n; float cur = 0.0;
vec2 P = vT.xy / max(vT.z, 0.12) * uDepth; vec2 d = P / n;
float depth = 1.0 - textureGrad(uH, tuv, dx, dy).r;
for (int i = 0; i < 40; i++) {                     // 상수 최대 + break
  if (cur >= depth || float(i) >= n) break;
  tuv -= d;
  depth = 1.0 - textureGrad(uH, tuv, dx, dy).r;
  cur += layer;
}
vec2 prev = tuv + d;                               // 앞 층과 사이를 직선 보간
float after = depth - cur;
float before = (1.0 - textureGrad(uH, prev, dx, dy).r) - cur + layer;
tuv = mix(tuv, prev, after / (after - before));
// 이 tuv 로 색 · 법선을 읽고, 빛 쪽으로 12 걸음 다시 걸어 그림자:
//   duv = lT.xy / max(lT.z, 0.08) * uDepth * dh;  occ = max(occ, (h(p) - cur) * (1 - i/12));
//   sh = 1.0 - clamp(occ * 9.0, 0.0, 1.0) * 0.9;`,
    },
    pitfalls: [
      { title: '보간 없이 층에서 바로 멈추면 계단 무늬가 보인다', fix: '앞 층과 뒤 층의 깊이 차로 직선 보간한다 (after / (after − before)).' },
      { title: 'texture() 로 어긋난 좌표를 읽으면 벽돌 경계에 밉맵 줄이 생긴다', fix: '원래 좌표의 dFdx · dFdy 를 미리 구해 textureGrad 로 읽는다.' },
      { title: '거의 수평으로 보면 광선이 아주 멀리 뻗어 무늬가 찢어진다', fix: 'vT.z 를 0.12 아래로 내려가지 않게 묶는다.' },
      { title: '반복문 길이가 uniform 이면 일부 GPU 에서 컴파일이 느리거나 실패한다', fix: '최대 횟수는 상수 40 으로 두고 안에서 break.' },
    ],
    prev: ['u10'],
    next: ['i231'],
    refs: [{ name: 'Wikipedia — Parallax occlusion mapping', url: 'https://en.wikipedia.org/wiki/Parallax_occlusion_mapping' }],
  },

  i231: {
    id: 'i231',
    summary: '평평한 벽의 창 칸마다 눈길을 상자 모양 가짜 방 속으로 쏘아 천장 · 바닥 · 옆벽 · 뒷벽 중 먼저 닿는 곳을 칠해, 모델 없이 창마다 진짜 방이 보이는 건물을 만든다.',
    terms: [
      { en: 'Interior mapping', ko: '가짜 방 창문 — 창 안 방을 셰이더로 계산' },
      { en: 'Ray–box intersection (slab method)', ko: '광선과 상자 벽 사이 거리 비교' },
      { en: 'Object-space camera position', ko: '카메라 위치를 물체 좌표로 바꿔 쏘기' },
    ],
    goal: '{target}의 벽에 가짜 방 창문(interior mapping)을 넣어 줘 — 창마다 광선을 방 상자에 쏴 천장 · 바닥 · 벽 · 가구가 보이게. 분위기는 {style}.',
    targets: ['밤의 아파트 건물', '「몇 층 몇 호」 좌표 문제의 건물', '먼 도시 빌딩 숲'],
    styles: ['불 켜진 따뜻한 밤', '낮의 조용한 거리', '네온 도시'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 의 Custom Function 노드에 같은 광선-상자 계산을 넣는다 (방 그림은 큐브맵으로 읽기도 한다).',
      godot: 'Godot 은 ShaderMaterial fragment() 에서 같은 계산 — 카메라는 (inverse(MODEL_MATRIX) * vec4(CAMERA_POSITION_WORLD, 1.0)).xyz.',
    },
    principle: [
      '벽 판의 물체 좌표를 1×1 칸(창 하나 = 방 하나)으로 나눈다. 칸 번호를 난수 열쇠로 써 방마다 색 · 가구 · 불 켜짐이 다르다.',
      '카메라 위치를 물체 좌표로 바꾸고, 그 점에서 이 조각으로 향하는 방향 dir 을 구한다.',
      '방 상자(가로 0~1 · 세로 0~1 · 깊이 0~ −D)의 옆벽 · 천장/바닥 · 뒷벽까지 거리 tw 셋을 구해 가장 작은 것이 처음 닿는 면이다.',
      '닿은 면에 따라 색을 고르고(뒷벽 = 그림 액자, 바닥 = 마루 줄), 천장 등불까지 거리로 밝기를 준다.',
      '중간 깊이에 판 하나를 더 두면 가구 · 커튼 실루엣, 위에 옅은 유리 반사를 더한다.',
    ],
    when: ['멀리 보이는 건물이 많아 방을 하나하나 모델링할 수 없을 때', '창이 「납작한 그림」이 아니라 움직이면 속이 보여야 할 때'],
    avoid: ['방 안에 들어가야 하는 게임 — 진짜 모델이 필요하다', '창 몇 개뿐인 집 — 방 상자 모델 몇 개가 더 쉽다'],
    cost: 'medium',
    costNote: '창 조각마다 나눗셈 · 비교 몇 번과 난수 몇 개. 벽 두 장에 장면 전체가 들어 있어 물체 수는 아주 적다.',
    level: 3,
    must: [
      '카메라 위치는 inverse(modelMatrix) 로 물체 좌표로 바꿔서 — 건물이 돌거나 옮겨져도 맞게',
      '방향 성분이 0 이면 나눗셈이 터지므로 1e-4 로 막기',
      '방마다 다른 값은 칸 번호 hash 로 (색 · 가구 종류 · 불 켜짐 · TV 빛)',
      '불은 시간을 아주 느리게(0.12) 끊어 가끔 바뀌게',
      '「방 깊이」 0.2~2 · 「가구 · 커튼」 · 「방 불 켜기」 조절',
    ],
    done: [
      '카메라가 옆으로 움직이면 창 속 천장 · 바닥 · 옆벽이 원근에 맞게 넓어지고 좁아진다',
      '방마다 벽 색 · 가구 · 커튼 · 불 켜짐이 다르고, 일부는 TV 처럼 푸르게 깜박인다',
      '「방 깊이」를 바꾸면 방이 깊어지고, 「가구」를 끄면 빈 방이 된다',
    ],
    code: {
      lang: 'glsl',
      title: '창 칸마다 광선 → 방 상자의 첫 면 찾기',
      from: 'demos/demosLook2.ts makeInterior() 의 frag (방 계산 부분)',
      body: `// 정점: vL = position; vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
uniform vec2 uSize; uniform float uDepth;
varying vec3 vL; varying vec3 vCam;
// ... main() 안 (hash · hsv · box 도구는 생략)
vec2 g = vL.xy + uSize * 0.5;                  // 벽 왼쪽 아래가 (0,0)
vec2 cell = floor(g); vec2 f = fract(g);       // 칸 = 방 하나
float id = hash(cell + 3.1);                   // 방마다 다른 열쇠
vec3 dir = normalize(vL - vCam);
dir.x = abs(dir.x) < 1e-4 ? 1e-4 : dir.x;      // 0 나눗셈 막기
dir.y = abs(dir.y) < 1e-4 ? 1e-4 : dir.y;
vec3 o = vec3(f, 0.0);                         // 창 유리 위의 점
float D = uDepth;
vec3 tw = vec3(((dir.x > 0.0 ? 1.0 : 0.0) - o.x) / dir.x,   // 옆벽까지
               ((dir.y > 0.0 ? 1.0 : 0.0) - o.y) / dir.y,   // 천장 · 바닥까지
               (-D - o.z) / dir.z);                         // 뒷벽까지
float tt = min(min(tw.x, tw.y), tw.z);         // 처음 닿는 면
vec3 hp = o + dir * tt;
vec3 wc = hsv(fract(id * 3.7), 0.25 + 0.3 * hash(cell + 9.0), 0.62);
vec3 room;
if (tt == tw.z)      room = wc * 0.95;                                  // 뒷벽
else if (tt == tw.y) room = dir.y > 0.0 ? vec3(0.85, 0.83, 0.8)        // 천장
                          : vec3(0.45, 0.28, 0.16) * (0.8 + 0.2 * step(0.5, fract(hp.x * 6.0))); // 마루
else                 room = wc * 0.72;                                  // 옆벽
float ld = length(hp - vec3(0.5, 0.97, -D * 0.5));                      // 천장 등불
room *= vec3(1.25, 1.0, 0.72) * (0.35 + 0.9 / (1.0 + ld * ld * 2.5));
// 가구: 깊이 -D*0.55 판까지 tf 가 tt 보다 작으면 그 판의 실루엣을 칠한다`,
    },
    pitfalls: [
      { title: '카메라 위치를 세계 좌표 그대로 쓰면 건물을 돌리면 방이 틀어진다', fix: '정점에서 inverse(modelMatrix) 로 물체 좌표 카메라를 구해 넘긴다.' },
      { title: '창을 정면에서 보면 dir.x · dir.y 가 0 이 되어 검은 점이 생긴다', fix: '1e-4 로 막는다.' },
      { title: '모든 방이 똑같으면 오히려 가짜 티가 난다', fix: '칸 번호 hash 로 벽 색 · 가구 · 커튼 · 불 · TV 빛을 다르게.' },
    ],
    prev: ['i230'],
    next: ['i232'],
  },

  u20: {
    id: 'u20',
    summary: '그린 화면에서 문턱보다 밝은 곳만 골라 여러 크기로 흐려 다시 더해, 네온 · 전구 · 빛나는 물체 둘레에 빛이 번지게 한다.',
    terms: [
      { en: 'Bloom (UnrealBloomPass)', ko: '빛 번짐 후처리' },
      { en: 'Luminance threshold', ko: '문턱 — 이보다 밝은 곳만 번짐' },
      { en: 'Mip-chain blur', ko: '해상도를 반씩 줄여 가며 흐려 넓게 번지게' },
      { en: 'HDR emissive (emissiveIntensity > 1)', ko: '1 보다 밝은 빛 — 이것만 번지게' },
    ],
    goal: '{target}에 빛 번짐(UnrealBloom)을 넣어 줘 — 문턱보다 밝은 곳만 번지게, 나머지는 또렷하게. 분위기는 {style}.',
    targets: ['네온 고리 · 전구 · 빛나는 공', '홈런 · 정답 연출', '밤 장면의 등불'],
    styles: ['어두운 밤 네온', '반짝이는 축제', '은은한 꿈결'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 Volume 에 Bloom 을 더하고 Threshold · Intensity · Scatter 를 정한다 (카메라 Post Processing 켜기).',
      godot: 'Godot 은 WorldEnvironment 의 Glow 를 켜고 hdr_threshold · intensity · bloom 을 정한다.',
    },
    principle: [
      '장면을 먼저 그림(렌더 타깃)으로 그린 뒤, 밝기가 문턱(1.4)을 넘는 곳만 따로 뽑는다.',
      '그 밝은 그림을 해상도를 반씩 줄여 가며 여러 번 흐린 뒤 합치면 가까이는 진하고 멀리는 넓게 번진다.',
      '원래 그림에 세기(0.8)만큼 더한다.',
      '번질 물체는 emissiveIntensity 를 1 보다 크게(3.5~4) 해 문턱을 넘게, 보통 물체는 넘지 않게 둔다.',
    ],
    when: ['네온 · 전구 · 마법처럼 「빛나는 것」이 있는 장면', '정답 · 홈런 순간을 화려하게'],
    avoid: ['밝은 낮 장면 전체 — 하얀 벽 · 하늘까지 번져 뿌옇다. 문턱을 높이거나 빼기', '폰 저사양 모드 — 흐림 단계가 여러 번이라 채우기 비용이 크다'],
    cost: 'medium',
    costNote: '화면 크기 렌더 타깃 + 반씩 줄인 흐림 5단계. 폰에서는 해상도 배율을 낮추거나 끄는 선택지를 둔다.',
    level: 1,
    must: [
      'EffectComposer: RenderPass → UnrealBloomPass(크기, 세기 0.8, 반경 0.4, 문턱 1.4) → OutputPass',
      '번질 물체만 emissive 를 1 보다 크게 — 보통 물체(흰 상자)는 문턱 아래',
      'composer 는 렌더러마다 하나, 화면 크기가 바뀌면 setSize',
      '같은 장면 왼쪽 끔 · 오른쪽 켬 비교, 「번짐 세기」 0~3 · 「문턱」 0~4 슬라이더',
    ],
    done: [
      '왼쪽은 네온 고리 · 공이 또렷하기만 하고, 오른쪽은 그 둘레에 색 빛이 번진다',
      '가운데 흰 상자는 양쪽 모두 번지지 않는다',
      '문턱을 0 으로 내리면 상자까지 번지고, 4 로 올리면 번짐이 사라진다',
    ],
    code: {
      lang: 'ts',
      title: '번질 것만 밝게 + 빛 번짐 사슬',
      from: 'demos/demosLight.ts u20 make() · postKit() 를 정리',
      body: `import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 번질 것: emissive 를 1 보다 크게 (문턱 1.4 를 넘도록)
const neon = (c: number, k = 4) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k });
scene.add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.055, 16, 96), neon(0xff4fa8)));
// 번지지 않을 것: 보통 재질
scene.add(new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.55, 0.55, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0xdfe6ff, roughness: 0.5 })));

const comp = new EffectComposer(renderer);
comp.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.4, 1.4); // 크기 · 세기 · 반경 · 문턱
comp.addPass(bloom);
comp.addPass(new OutputPass());                 // 톤 매핑 · sRGB 는 맨 끝에서

function resize(w: number, h: number) { comp.setSize(w, h); }
function frame(dt: number) {
  bloom.strength = 0.8;
  bloom.threshold = 1.4;
  comp.render(dt);                              // renderer.render 대신
}`,
    },
    pitfalls: [
      { title: '밝은 배경 장면에서 문턱을 낮게 두면 화면 전체가 하얗게 날아간다', fix: '장난감 상자 게임은 반구광을 낮추고 문턱을 1.25 로 맞췄다. 번질 것만 emissive 로 문턱을 넘게.', seen: true },
      { title: '전광판 · 글씨가 번져 숫자가 안 읽힌다', fix: '숫자 야구는 전광판 화면 색을 문턱 아래(0xd8)로 두어 또렷하게 했다.', seen: true },
      { title: 'composer 를 쓰면 기본 안티앨리어싱이 꺼진다', fix: '렌더 타깃 samples 를 주거나 SMAA 패스(i04)를 더한다.' },
      { title: 'OutputPass 를 빼면 색이 어둡고 칙칙하다', fix: '후처리 중간은 선형 색이다. 사슬 맨 끝에 OutputPass(u21).' },
    ],
    prev: ['u21'],
    next: ['i06', 'i07'],
    refs: [
      { name: 'three.js 예제 — webgl_postprocessing_unreal_bloom', url: 'https://threejs.org/examples/#webgl_postprocessing_unreal_bloom' },
      { name: 'three.js 소스 — UnrealBloomPass', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/UnrealBloomPass.js' },
    ],
  },

  u21: {
    id: 'u21',
    summary: '장면을 바로 화면에 그리지 않고 그림으로 받아 빛 번짐 · 색 보정 같은 단계를 차례로 거친 뒤 마지막에 sRGB 로 바꿔 내보내는 후처리의 기본 틀.',
    terms: [
      { en: 'Post-processing chain (EffectComposer)', ko: '후처리 사슬 — 그림을 단계별로 손보기' },
      { en: 'RenderPass · ShaderPass · OutputPass', ko: '그리기 · 셰이더 한 단계 · 출력(톤 매핑 + sRGB)' },
      { en: 'Linear vs sRGB color', ko: '계산은 선형 색, 화면에 낼 때 sRGB' },
    ],
    goal: '{target}에 후처리 사슬을 짜 줘 — 그리기 → 빛 번짐 → 색 보정 → 출력(sRGB) 순서로, 단계마다 켜고 끌 수 있게. 분위기는 {style}.',
    targets: ['3D 게임 장면 전체', '캐릭터가 있는 무대', '결과 화면 연출'],
    styles: ['따뜻하고 화사한', '차분한 영화 같은', '밝은 애니메이션'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 Volume 프로필에 효과(Bloom · Color Adjustments 등)를 쌓고, 직접 만든 단계는 Full Screen Pass Renderer Feature 로 끼운다.',
      godot: 'Godot 은 WorldEnvironment 의 효과(Glow · Adjustments)를 쓰고, 직접 만든 단계는 CompositorEffect(4.3+)나 화면 덮는 셰이더로.',
    },
    principle: [
      'RenderPass 가 장면을 화면 대신 그림(렌더 타깃)에 그린다. 이 그림은 아직 선형 색이라 어둡고 칙칙해 보인다.',
      '다음 단계들은 앞 그림(tDiffuse)을 받아 손본 그림을 넘긴다 — 빛 번짐, 직접 짠 색 보정(ShaderPass) 등.',
      '맨 끝 OutputPass 가 톤 매핑과 sRGB 변환을 해서 화면에 알맞은 색으로 낸다.',
      '단계마다 pass.enabled 로 켜고 끌 수 있다.',
    ],
    when: ['빛 번짐 · 구석 그늘 · 색 보정을 둘 이상 겹쳐 쓸 때', '게임마다 같은 틀에 세기만 바꿔 쓰고 싶을 때 (이 사이트 shared/post.ts)'],
    avoid: ['효과가 하나도 없는 장면 — renderer.render 가 더 가볍다', '폰에서 단계를 많이 — 단계마다 화면 전체를 한 번씩 더 그린다'],
    cost: 'medium',
    costNote: '단계마다 화면 전체 그리기 한 번. 3~4단계는 PC OK, 폰은 단계를 줄이거나 해상도 배율을 낮춘다.',
    level: 1,
    must: [
      '순서: RenderPass → 효과들 → OutputPass (OutputPass 는 반드시 맨 끝, 하나만)',
      'composer.render(dt) 로 그리기 (renderer.render 를 따로 부르지 않기)',
      '렌더러가 바뀌면 composer 를 새로, 화면 크기가 바뀌면 setSize',
      '직접 만든 색 보정은 ShaderPass(tDiffuse 를 받는 ShaderMaterial)로',
      '단계를 하나씩 켜 보이며 무엇이 바뀌는지 글로 보여 주기',
    ],
    done: [
      '① 그리기만: 어둡고 칙칙 → ② 빛 번짐: 별 · 볼이 빛남 → ③ 색 보정: 따뜻하고 가장자리 어둡게 → ④ 출력: 화면에 알맞은 밝기 — 1.8초마다 차례로 바뀐다',
      '「단계 고정」 슬라이더로 한 단계에 멈춰 볼 수 있다',
      '사슬을 다 켠 결과가 렌더러로 바로 그린 것보다 색이 어긋나지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '그리기 → 빛 번짐 → 색 보정 → 출력',
      from: 'demos/demosLight.ts u21 make() 를 정리',
      body: `import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// 색 보정: 따뜻하게 · 채도 1.25 · 가장자리 어둡게
const GRADE = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv);' +
    ' c.rgb *= vec3(1.12, 1.0, 0.86); float l = dot(c.rgb, vec3(0.3,0.59,0.11)); c.rgb = mix(vec3(l), c.rgb, 1.25);' +
    ' float v = smoothstep(0.85, 0.3, length(vUv - 0.5)); c.rgb *= mix(0.35, 1.0, v); gl_FragColor = c; }',
});

const comp = new EffectComposer(renderer);
comp.addPass(new RenderPass(scene, camera));                 // ① 그리기 (선형 색)
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.35, 1.1);
comp.addPass(bloom);                                         // ② 빛 번짐
const grade = new ShaderPass(GRADE);
comp.addPass(grade);                                         // ③ 색 보정
comp.addPass(new OutputPass());                              // ④ 톤 매핑 + sRGB — 맨 끝

function frame(dt: number) {
  bloom.enabled = true;   // 단계마다 켜고 끄기
  grade.enabled = true;
  comp.render(dt);
}
window.addEventListener('resize', () => comp.setSize(innerWidth, innerHeight));`,
    },
    pitfalls: [
      { title: 'OutputPass 를 빼거나 중간에 두면 색이 어둡거나 두 번 밝아진다', fix: '중간 단계는 선형 색이다. sRGB 변환은 사슬 맨 끝 한 번만.' },
      { title: 'composer 를 쓰면 기본 안티앨리어싱(MSAA)이 꺼진다', fix: '렌더 타깃 samples 를 주거나 SMAA 패스(i04)를 더한다.' },
      { title: '깊이를 다시 그리는 단계(구석 그늘 등)에서 반투명 · 스프라이트가 검은 네모가 된다', fix: '이 사이트 공용 후처리(shared/post.ts)는 깊이 패스 동안 반투명 · 스프라이트를 숨긴다.', seen: true },
      { title: '가장자리 어둡게(비네트) · 심도로 얼버무리면 답답해 보인다', fix: '사용자 결정 — 비네트 · 심도 · 가장자리 흐림은 빼고, 빛 배치로 해결한다.', seen: true },
    ],
    next: ['u20', 'i02', 'i04', 'i07'],
    refs: [
      { name: 'three.js 매뉴얼 — How to use post-processing', url: 'https://threejs.org/manual/#en/how-to-use-post-processing' },
      { name: 'three.js 소스 — EffectComposer', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/EffectComposer.js' },
    ],
  },

  i01: {
    id: 'i01',
    summary: '카메라에서 초점 거리만큼 떨어진 곳은 또렷하게, 앞뒤는 거리만큼 흐리게 해, 사진처럼 주인공만 도드라지게 한다.',
    terms: [
      { en: 'Depth of field (Bokeh)', ko: '피사계 심도 — 초점 밖 흐림' },
      { en: 'BokehPass (focus · aperture · maxblur)', ko: 'three.js 심도 후처리 — 초점 거리 · 조리개 · 최대 흐림' },
      { en: 'Circle of confusion', ko: '초점에서 멀수록 커지는 흐림 원' },
    ],
    goal: '{target}에 피사계 심도(Bokeh)를 넣어 줘 — 초점은 주인공에 맞추고 앞뒤는 흐리게. 분위기는 {style}.',
    targets: ['날아오는 공과 뒤 관중', '연출 카메라 확대 장면', '진열장 속 물건'],
    styles: ['영화 같은 확대', '사진관 접사', '꿈결 같은'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP Volume 의 Depth of Field 를 Bokeh 모드로 두고 Focus Distance · Aperture 를 정한다.',
      godot: 'Godot 은 Camera3D 의 CameraAttributesPractical 에서 dof_blur_far · dof_blur_near 거리와 세기를 정한다.',
    },
    principle: [
      '장면의 깊이 그림을 함께 그려, 각 픽셀이 카메라에서 얼마나 먼지 안다.',
      '초점 거리(focus)와의 차이 × 조리개(aperture 0.006) 만큼 흐림 원의 크기를 정한다. 최대 흐림은 0.014.',
      '견본은 매 프레임 초점을 카메라 ~ 공 거리로 맞춰, 공은 늘 또렷하고 뒤 관중 · 앞 고깔은 흐리다.',
      '화면 비율(aspect)도 매 프레임 넘겨야 흐림 원이 찌그러지지 않는다.',
    ],
    when: ['연출 카메라가 한 물체를 크게 잡을 때 (짧은 순간)', '사진 · 접사 느낌이 필요한 장면'],
    avoid: ['평소 놀이 화면 — 이 사이트는 사용자 결정으로 심도 · 가장자리 흐림을 쓰지 않는다. 대신 빛 배치 · 어두운 배경으로 주인공을 띄운다', '폰 — 깊이 그리기 + 큰 흐림이 무겁다'],
    cost: 'heavy',
    costNote: '장면 깊이를 한 번 더 그리고, 픽셀마다 여러 번 읽어 흐린다. 화면 전체가 대상이라 폰에서 무겁다.',
    level: 2,
    must: [
      '초점 거리는 매 프레임 카메라 ~ 주인공 거리로 다시 넣기 (camera.position.distanceTo)',
      'bokeh.uniforms.aspect 를 화면 비율로 맞추기',
      '조리개는 작게(0.006 안팎) — 크면 주인공까지 번진다',
      '왼쪽 모두 또렷 · 오른쪽 초점만 또렷으로 나눠 비교, 「조리개」 0~0.02 슬라이더',
    ],
    done: [
      '오른쪽에선 가운데 공만 또렷하고, 뒤 관중 줄과 앞 고깔이 거리만큼 흐리다',
      '카메라가 움직여도 공은 계속 또렷하다 (초점 따라감)',
      '조리개 0 이면 왼쪽과 같아진다',
    ],
    code: {
      lang: 'ts',
      title: '주인공을 따라가는 초점',
      from: 'demos/demosLight.ts i01 make() 를 정리',
      body: `import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

const comp = new EffectComposer(renderer);
comp.addPass(new RenderPass(scene, cam));
const bokeh = new BokehPass(scene, cam, { focus: 4.2, aperture: 0.006, maxblur: 0.014 });
comp.addPass(bokeh);
comp.addPass(new OutputPass());

function frame(dt: number, w: number, h: number) {
  const u = bokeh.uniforms as Record<string, { value: number }>;
  u.focus.value = cam.position.distanceTo(ball.position); // 초점 = 공까지 거리
  u.aperture.value = 0.006;                                // 작게 — 크면 공까지 번진다
  u.aspect.value = w / h;                                  // 흐림 원이 찌그러지지 않게
  comp.render(dt);
}`,
    },
    pitfalls: [
      { title: '심도로 화면 가장자리를 흐리면 답답하고 지저분해 보인다', fix: '사용자 결정으로 이 사이트는 심도 · 비네트 · 가장자리 흐림을 쓰지 않는다. 주인공은 빛 배치로 띄운다.', seen: true },
      { title: '초점을 한 번만 정하면 카메라가 움직일 때 주인공이 흐려진다', fix: '매 프레임 카메라 ~ 주인공 거리를 다시 넣는다.' },
      { title: '반투명 · 스프라이트는 깊이 그림에 없어 흐림이 엉뚱하다', fix: '빛 알갱이 · 글씨 스프라이트는 흐림 뒤에 따로 그리거나 깊이를 쓰지 않게 둔다.' },
    ],
    prev: ['u21'],
    next: ['i02'],
    refs: [{ name: 'three.js 예제 — webgl_postprocessing_dof', url: 'https://threejs.org/examples/#webgl_postprocessing_dof' }],
  },

  i02: {
    id: 'i02',
    summary: '화면의 깊이 · 법선으로 각 점 둘레가 얼마나 막혀 있는지 재서 틈 · 구석 · 맞닿은 곳을 어둡게 해, 블록이 붕 떠 보이지 않고 입체감이 산다.',
    terms: [
      { en: 'Ambient occlusion (SSAO / GTAO)', ko: '구석 그늘 — 주변에 막힌 만큼 어둡게' },
      { en: 'GTAOPass', ko: 'three.js 지평선 기반 구석 그늘 후처리' },
      { en: 'blendIntensity · radius · samples', ko: '그늘 세기 · 살필 반경 · 표본 수' },
    ],
    goal: '{target}에 구석 그늘(GTAO)을 넣어 줘 — 틈 · 벽 모서리 · 맞닿은 곳이 어두워지게. 분위기는 {style}.',
    targets: ['쌓은 블록 · 쌓기나무', '방 구석과 가구', '판 위 말 · 장난감'],
    styles: ['밝은 파스텔 방', '부드러운 점토 장난감', '사실적인 실내'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 Renderer 에 Screen Space Ambient Occlusion Renderer Feature 를 더한다 (Intensity · Radius · Samples).',
      godot: 'Godot 은 WorldEnvironment 의 SSAO 를 켜고 radius · intensity 를 정한다.',
    },
    principle: [
      '빛을 고르게 받는 밝은 방에서는 그림자 지도만으로 블록 틈 · 벽 모서리가 어두워지지 않아 납작해 보인다.',
      'GTAO 는 각 픽셀 둘레를 반경(0.5) 안에서 살펴, 주변 깊이가 하늘을 얼마나 가리는지(지평선 각)를 잰다.',
      '많이 가려진 곳일수록 어둡게 곱한다. 표본 16개 + 잡음 지우기.',
      '반구광이 센(1.6) 밝은 장면에서 차이가 가장 크다.',
    ],
    when: ['쌓기나무 · 블록 · 방처럼 맞닿은 면이 많은 장면', '밝고 그림자가 약한 파스텔 장면이 납작해 보일 때'],
    avoid: ['폰 — 깊이 · 법선을 다시 그리고 표본을 여러 번 읽는다. 이 사이트는 짧은 변 500 아래에서 끈다', '움직이는 작은 물체가 많은 장면 — 잡음이 지지직 보일 수 있다. 대신 접촉 그림자(i15)'],
    cost: 'heavy',
    costNote: '깊이 · 법선 그리기 한 번 + 픽셀마다 표본 16개 + 잡음 지우기. 폰에서는 끄는 선택지를 둔다.',
    level: 2,
    must: [
      'GTAOPass(scene, camera, 너비, 높이) 를 RenderPass 뒤에, 끝에 OutputPass',
      'updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1.3, samples: 16 })',
      '그늘 세기는 blendIntensity (0~2)',
      '폰(짧은 변 < 500)에서는 끄기',
      '깊이를 다시 그릴 때 반투명 · 스프라이트는 숨기기',
    ],
    done: [
      '왼쪽 그냥 · 오른쪽 구석 그늘로 나누면, 오른쪽만 블록 사이 틈 · 벽과 바닥이 만나는 선 · 공 밑이 부드럽게 어두워진다',
      '공이 굴러가면 공 밑 그늘도 따라간다',
      '「그늘 세기」 0 이면 왼쪽과 같아진다',
    ],
    code: {
      lang: 'ts',
      title: 'GTAO 후처리',
      from: 'demos/demosLight.ts i02 make() 를 정리',
      body: `import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// 밝고 그림자가 약한 방 — 구석 그늘 차이가 가장 크게 보인다
scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c0b0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
sun.position.set(3, 5, 4);
scene.add(sun);

const comp = new EffectComposer(renderer);
comp.addPass(new RenderPass(scene, cam));
const ao = new GTAOPass(scene, cam, 256, 256);
ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1.3, samples: 16 });
comp.addPass(ao);
comp.addPass(new OutputPass());

function frame(dt: number) {
  ao.blendIntensity = 1;                 // 그늘 세기 0~2
  comp.render(dt);
}
// 폰: if (Math.min(w, h) < 500) ao.enabled = false;`,
    },
    pitfalls: [
      { title: '구석 그늘 잡음이 지지직 떨린다', fix: '빵빵 주차장에서 겪었다. 반경 0.35 · 표본 32 · 잡음 지우기를 넉넉히(updatePdMaterial) 해서 고쳤다.', seen: true },
      { title: '깊이를 다시 그리는 패스에서 반투명 · 스프라이트가 검은 네모가 된다', fix: '공용 후처리(shared/post.ts)는 그 패스 동안 반투명 · 스프라이트를 숨긴다.', seen: true },
      { title: '반경을 크게 하면 물체 둘레에 검은 후광이 생긴다', fix: '반경은 블록 크기의 절반 정도(견본 0.5, 블록 0.5).' },
      { title: '폰에서 켜 두면 프레임이 반으로 떨어진다', fix: '공용 후처리는 짧은 변 500 아래에서 GTAO 를 끈다.', seen: true },
    ],
    prev: ['u21'],
    next: ['i03', 'i15'],
    refs: [
      { name: 'three.js 예제 — webgl_postprocessing_gtao', url: 'https://threejs.org/examples/#webgl_postprocessing_gtao' },
      { name: 'three.js 소스 — GTAOPass', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/GTAOPass.js' },
    ],
  },

  i03: {
    id: 'i03',
    summary: '장면의 깊이 · 법선 그림을 한 번 더 그려 값이 갑자기 바뀌는 곳에 선을 그어, 얇은 표지판 · 바닥 선까지 일정한 굵기의 만화 외곽선을 넣는다.',
    terms: [
      { en: 'Post-process edge detection outline', ko: '후처리 외곽선 — 화면에서 경계 찾기' },
      { en: 'Depth discontinuity (Laplacian)', ko: '깊이가 갑자기 바뀌는 곳 — 물체 윤곽' },
      { en: 'Normal discontinuity', ko: '법선이 갑자기 바뀌는 곳 — 모서리 · 접힌 곳' },
      { en: 'overrideMaterial = MeshNormalMaterial', ko: '장면을 법선 색으로 한 번 더 그리기' },
    ],
    goal: '{target}에 후처리 외곽선을 넣어 줘 — 깊이 · 법선이 갑자기 바뀌는 곳에 일정한 굵기의 선. 느낌은 {style}.',
    targets: ['툰 주차장 장면 (차 · 고깔 · 얇은 표지판)', '블록 퍼즐 판', '3D 게임 장면 전체'],
    styles: ['밝은 애니메이션', '진한 만화책', '깔끔한 설계도'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 Full Screen Pass Renderer Feature 에서 _CameraDepthTexture · _CameraNormalsTexture 를 읽어 같은 계산을 한다.',
      godot: 'Godot 은 화면을 덮는 사각형의 ShaderMaterial 에서 hint_depth_texture · hint_normal_roughness_texture 를 읽어 경계를 찾는다.',
    },
    principle: [
      '장면을 MeshNormalMaterial 로 한 번 더 그려 법선 그림과 깊이 그림(DepthTexture)을 얻는다.',
      '깊이: 1/선형 깊이의 이웃 넷 라플라시안(왼+오−2·가운데, 위+아래−2·가운데)을 가운데 값으로 나눠, 0.02~0.06 을 넘으면 윤곽이다.',
      '법선: 이웃 넷과의 법선 거리 합이 0.5~0.9 를 넘으면 모서리다.',
      '둘 중 큰 값만큼 원래 색을 잉크 색으로 섞는다. 이웃 간격이 굵기라 물체 크기와 상관없이 일정하다.',
      '껍데기 방식이 못 하는 얇은 판(표지판 0.015)에도 선이 생긴다.',
    ],
    when: ['얇은 판 · 바닥 선이 많은 툰 장면', '물체 수가 많아 껍데기(u02)로 그리기 횟수가 두 배가 되는 게 부담일 때'],
    avoid: ['물체마다 선 색 · 굵기를 달리해야 할 때 — 대신 껍데기 외곽선(u02)', '폰 저사양 — 장면을 한 번 더 그린다'],
    cost: 'medium',
    costNote: '법선 · 깊이용으로 장면을 한 번 더 그리고, 화면 픽셀마다 이웃 8번 읽기. 물체 수와는 상관없다.',
    level: 2,
    must: [
      '법선 · 깊이 그리기 동안 scene.background = null · overrideMaterial = MeshNormalMaterial · 투명 지우기, 끝나면 되돌리기',
      '깊이는 선형으로 바꾼 뒤 1/거리 로 비교 — 멀리 있는 것도 같은 문턱',
      '선 굵기(이웃 간격)는 화면 높이에 비례 (thick × max(1, 높이/420))',
      '렌더 타깃 크기는 화면 크기를 따라가게',
      '왼쪽 선 없음 · 오른쪽 후처리 외곽선, 「선 굵기」 0.5~3',
    ],
    done: [
      '오른쪽에선 차 · 고깔 · 바닥 주차선 · 얇은 표지판 모두 같은 굵기의 남색 선이 둘러진다',
      '차의 지붕과 몸체가 꺾이는 곳(법선)에도 선이 보인다',
      '「선 굵기」를 올리면 모든 선이 함께 굵어진다',
    ],
    code: {
      lang: 'ts',
      title: '법선 · 깊이 그리기 + 경계 셰이더',
      from: 'demos/demosLight.ts i03 make() 를 정리',
      body: `const rtN = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
const normalM = new THREE.MeshNormalMaterial();
const EDGE = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, tN: { value: rtN.texture }, tD: { value: rtN.depthTexture },
    res: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 40 }, thick: { value: 1 }, ink: { value: new THREE.Color(0x1d2340) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform sampler2D tN; uniform sampler2D tD; uniform vec2 res; uniform float near; uniform float far; uniform float thick; uniform vec3 ink; varying vec2 vUv;',
    'float iz(vec2 uv){ float z = texture2D(tD, uv).x * 2.0 - 1.0; float lin = (2.0 * near * far) / (far + near - z * (far - near)); return 1.0 / lin; }',
    'vec3 nn(vec2 uv){ return texture2D(tN, uv).rgb * 2.0 - 1.0; }',
    'void main(){ vec4 base = texture2D(tDiffuse, vUv); vec2 px = thick / res; float w0 = iz(vUv);',
    ' float lap = abs(iz(vUv - vec2(px.x, 0.0)) + iz(vUv + vec2(px.x, 0.0)) - 2.0 * w0) + abs(iz(vUv - vec2(0.0, px.y)) + iz(vUv + vec2(0.0, px.y)) - 2.0 * w0);',
    ' float de = smoothstep(0.02, 0.06, lap / max(w0, 1e-4)); vec3 n0 = nn(vUv);',
    ' float ne = distance(nn(vUv - vec2(px.x, 0.0)), n0) + distance(nn(vUv + vec2(px.x, 0.0)), n0) + distance(nn(vUv - vec2(0.0, px.y)), n0) + distance(nn(vUv + vec2(0.0, px.y)), n0);',
    ' float e = max(de, smoothstep(0.5, 0.9, ne));',
    ' gl_FragColor = vec4(mix(base.rgb, ink, e), base.a); }'].join(' '),
});
const edge = new ShaderPass(EDGE); // RenderPass 뒤, OutputPass 앞

function frame(dt: number, w: number, h: number) {
  if (rtN.width !== w || rtN.height !== h) rtN.setSize(w, h);
  const bg = scene.background;               // 법선 · 깊이 한 번 더 그리기
  scene.background = null;
  scene.overrideMaterial = normalM;
  renderer.setRenderTarget(rtN);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
  scene.background = bg;
  (edge.uniforms.res.value as THREE.Vector2).set(w, h);
  edge.uniforms.thick.value = 1.2 * Math.max(1, h / 420);
  comp.render(dt);
}`,
    },
    pitfalls: [
      { title: '깊이를 그대로 비교하면 먼 물체엔 선이 안 생기거나 가까이엔 너무 많다', fix: '선형 깊이로 바꾼 뒤 1/거리 의 라플라시안을 가운데 값으로 나눠 비교한다.' },
      { title: '법선 그리기 때 배경 · 지우기 색을 되돌리지 않으면 다음 그림이 깨진다', fix: '배경 · overrideMaterial · 지우기 색을 저장했다가 끝나면 되돌린다.' },
      { title: '반투명 · 스프라이트가 법선 그림에 검게 찍혀 엉뚱한 선이 생긴다', fix: '그 그리기 동안 반투명 · 스프라이트를 숨긴다 (공용 후처리와 같은 이유).', seen: true },
      { title: '평평한 바닥에서 가까운 곳에 줄무늬 선이 생긴다', fix: '깊이 문턱(0.02)을 조금 올리거나 near 를 키운다.' },
    ],
    prev: ['u02', 'u21'],
    next: ['i239', 'i04'],
    refs: [{ name: 'three.js 예제 — webgl_postprocessing_sobel (화면 경계 찾기)', url: 'https://threejs.org/examples/#webgl_postprocessing_sobel' }],
  },

  i04: {
    id: 'i04',
    summary: '후처리를 쓰면 꺼지는 기본 안티앨리어싱 대신 SMAA 단계를 더해, 가는 바퀴살 · 상자 모서리의 계단을 다시 매끈하게 다듬는다.',
    terms: [
      { en: 'Anti-aliasing (SMAA · FXAA · MSAA)', ko: '계단 줄이기 — 경계 다듬기 · 여러 번 샘플' },
      { en: 'SMAAPass', ko: 'three.js 형태 인식 경계 다듬기 후처리' },
      { en: 'Aliasing / jaggies', ko: '대각선 · 가는 선의 톱니 계단' },
    ],
    goal: '{target}에 SMAA 계단 줄이기를 넣어 줘 — 후처리 사슬에서 꺼진 안티앨리어싱을 되살리기. 분위기는 {style}.',
    targets: ['가는 바퀴살 · 상자 모서리', '툰 외곽선이 있는 장면', '후처리를 쓰는 3D 게임 전체'],
    styles: ['선명하고 깔끔한', '밝은 애니메이션', '어두운 밤 장면'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 카메라 Anti-aliasing 을 SMAA 또는 FXAA 로, URP 에셋의 MSAA 와 함께 고른다.',
      godot: 'Godot 은 프로젝트 설정 Rendering → Anti Aliasing 에서 MSAA 3D · Screen Space AA(FXAA) · TAA 를 고른다.',
    },
    principle: [
      'WebGLRenderer({ antialias: true }) 는 화면에 바로 그릴 때만 MSAA 가 된다. EffectComposer 의 렌더 타깃에 그리면 꺼진다.',
      'SMAA 는 다 그린 그림에서 경계 모양(가로 · 세로 · 대각선)을 찾아, 그 방향으로 이웃 색을 조금 섞어 계단을 지운다.',
      '세 단계(경계 찾기 → 섞을 비율 → 섞기)라 FXAA 보다 조금 비싸지만 글씨 · 가는 선이 덜 뭉개진다.',
      '견본은 확대해서(×3) 차이를 보이게 한다: 낮은 해상도로 그린 뒤 가까운 픽셀 그대로 키운다.',
    ],
    when: ['EffectComposer 로 후처리를 하나라도 쓸 때 (16 게임)', '툰 외곽선 · 가는 선이 계단져 보일 때'],
    avoid: ['후처리 없이 renderer 로 바로 그리는 장면 — antialias: true 면 이미 MSAA 다', '폰에서 고해상도 + MSAA 와 겹쳐 — 둘 중 하나만'],
    cost: 'light',
    costNote: '화면 전체 3단계 가벼운 패스. MSAA(렌더 타깃 samples 4)보다 메모리가 적다.',
    level: 1,
    must: [
      '후처리 사슬에 SMAAPass 를 OutputPass 근처 끝에 (경계 찾기는 색이 다 정해진 뒤가 정확)',
      'composer.setSize 때 SMAA 도 같이 크기가 바뀌는지 확인 (composer 가 해 준다)',
      '확대 보기로 전/후를 비교 — 왼쪽 AA 없음(계단) · 오른쪽 SMAA',
      '「확대 배율」 1~6 슬라이더',
    ],
    done: [
      '×3 확대에서 왼쪽 바퀴살 · 상자 모서리는 톱니 계단, 오른쪽은 경계가 매끈하다',
      '바퀴가 천천히 돌 때 왼쪽은 살이 지글거리고 오른쪽은 덜 지글거린다',
      '확대 1 에서도 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '후처리 사슬에 SMAA 더하기',
      from: 'demos/demosLight.ts i04 make() 를 정리',
      body: `import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

const comp = new EffectComposer(renderer);   // 렌더 타깃에 그리므로 antialias:true 의 MSAA 가 꺼진다
comp.addPass(new RenderPass(scene, cam));
// ... 빛 번짐 · 색 보정 같은 다른 단계
comp.addPass(new SMAAPass());                // 경계 찾기 → 비율 → 섞기
comp.addPass(new OutputPass());

window.addEventListener('resize', () => comp.setSize(innerWidth, innerHeight));
function frame(dt: number) { comp.render(dt); }

// 견본의 확대 보기: 낮은 해상도 lw × lh 로 그린 뒤 가까운 픽셀 그대로 키우기
// 'ivec2 p = ivec2(clamp(floor(vUv * lowRes), vec2(0.0), lowRes - 1.0)); gl_FragColor = texelFetch(tDiffuse, p, 0);'`,
    },
    pitfalls: [
      { title: 'composer 를 쓰는 순간 renderer 의 antialias 가 소용없어진다', fix: '후처리 16 게임 공통 문제. SMAA 를 더하거나, 렌더 타깃을 samples: 4 로 만들어 composer 에 넘긴다 (공용 후처리는 MSAA 4).', seen: true },
      { title: 'SMAA 를 빛 번짐 앞에 두면 번짐이 다시 계단을 만든다', fix: '사슬 끝 쪽(OutputPass 근처)에 둔다.' },
      { title: 'FXAA 는 글씨 · 가는 선까지 뭉갠다', fix: '글씨가 많은 화면은 SMAA 나 MSAA 가 낫다.' },
    ],
    prev: ['u21'],
    next: ['i03'],
    refs: [
      { name: 'three.js 예제 — webgl_postprocessing_smaa', url: 'https://threejs.org/examples/#webgl_postprocessing_smaa' },
      { name: 'three.js 소스 — SMAAPass', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/SMAAPass.js' },
    ],
  },

  i05: {
    id: 'i05',
    summary: '지난 화면을 조금씩 옅게 남겨 지금 화면과 겹쳐, 빠르게 미끄러지는 별 · 도는 공 · 달리는 차 뒤에 꼬리가 생겨 속도감이 난다.',
    terms: [
      { en: 'Afterimage (frame feedback / ghosting)', ko: '잔상 — 이전 화면을 옅게 남기기' },
      { en: 'AfterimagePass (damp)', ko: 'three.js 잔상 후처리 — damp 가 클수록 꼬리가 길다' },
      { en: 'Motion trail', ko: '움직임 꼬리' },
    ],
    goal: '{target}에 잔상(Afterimage) 후처리를 넣어 줘 — 빠른 것 뒤에 꼬리가 남아 속도감이 나게. 분위기는 {style}.',
    targets: ['미끄러지는 별 · 도는 공 · 달리는 차', '필살 투구 순간', '빠른 화면 전환'],
    styles: ['신나는 아케이드', '꿈결 같은 몽환', '만화 속도선 느낌'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 의 Motion Blur 볼륨은 진짜 움직임 흐림이다. 잔상 꼬리는 이전 화면 RenderTexture 를 남겨 섞는 Full Screen 패스로 만든다.',
      godot: 'Godot 은 기본 잔상 효과가 없어, 이전 화면을 담은 텍스처와 지금 화면을 섞는 셰이더(SubViewport 두 장 번갈아)로 만든다.',
    },
    principle: [
      '그림 두 장을 번갈아 쓴다: 「지난 결과」와 「지금 장면」.',
      '새 결과 = max(지금, 지난 결과 × damp) — damp(0.88)가 1 에 가까울수록 이전 모습이 오래 남는다.',
      '그 결과를 다음 프레임의 「지난 결과」로 넘기므로 지난 자리들이 점점 옅어지는 꼬리가 된다.',
      '움직이지 않는 것은 같은 자리에 겹쳐 그대로 보인다.',
    ],
    when: ['필살 투구 · 탈출 · 미끄러짐처럼 짧은 순간 속도감을 줄 때', '어두운 배경에서 빛나는 것이 빠르게 움직일 때'],
    avoid: ['평소 놀이 화면에 늘 켜 두기 — 화면이 번져 답답하다. 순간에만 켠다', '밝은 배경 — max 섞기라 밝은 꼬리만 남아 얼룩진다'],
    cost: 'light',
    costNote: '화면 크기 그림 두 장을 번갈아 쓰고 섞기 한 번. 가볍다.',
    level: 1,
    must: [
      'AfterimagePass(damp) 를 RenderPass 뒤에, 끝에 OutputPass',
      'damp 는 0.5~0.97 사이로 (1 이면 영원히 안 지워진다)',
      '연출 순간에만 enabled = true, 끝나면 끄기',
      '왼쪽 그냥 · 오른쪽 잔상 비교, 「꼬리 길이」 슬라이더',
    ],
    done: [
      '오른쪽에서 왕복하는 별 · 원을 도는 공 · 달리는 차 뒤에 꼬리가 남고, 왼쪽은 없다',
      '「꼬리 길이」를 0.97 로 올리면 꼬리가 길게, 0.5 로 내리면 거의 사라진다',
      '멈춘 바닥 · 배경은 양쪽이 똑같다',
    ],
    code: {
      lang: 'ts',
      title: '잔상 후처리',
      from: 'demos/demosLight.ts i05 make() 를 정리',
      body: `import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';

const comp = new EffectComposer(renderer);
comp.addPass(new RenderPass(scene, cam));
const after = new AfterimagePass(0.88);      // damp — 클수록 꼬리가 길다
comp.addPass(after);
comp.addPass(new OutputPass());

let damp = 0.88;
function frame(dt: number) {
  (after.uniforms as Record<string, { value: number }>).damp.value = damp;
  comp.render(dt);
}
// 연출 순간에만: after.enabled = true; ... 끝나면 after.enabled = false;`,
    },
    pitfalls: [
      { title: 'damp 를 1 에 가깝게 두면 화면에 얼룩이 영원히 남는다', fix: '0.97 아래로. 연출이 끝나면 패스를 꺼서 지운다.' },
      { title: '카메라가 움직이면 화면 전체가 번진다', fix: '잔상은 화면 단위라 배경까지 꼬리가 생긴다. 카메라가 멈춘 순간에만 쓴다.' },
      { title: '밝은 배경에서 꼬리가 거의 안 보인다', fix: '이전 화면과 max 로 섞기 때문 — 어두운 배경 · 빛나는 물체일 때 잘 보인다.' },
    ],
    prev: ['u21'],
    next: ['i07'],
    refs: [{ name: 'three.js 예제 — webgl_postprocessing_afterimage', url: 'https://threejs.org/examples/#webgl_postprocessing_afterimage' }],
  },

  i06: {
    id: 'i06',
    summary: '해만 하얗고 나머지는 검게 그린 그림을 해 쪽으로 60번 끌어 모아 더해, 풍차 · 나무 사이로 빛줄기가 쏟아지게 한다.',
    terms: [
      { en: 'God rays (crepuscular rays)', ko: '빛살 — 가려진 사이로 쏟아지는 빛줄기' },
      { en: 'Screen-space radial blur', ko: '화면에서 빛 중심 쪽으로 끌어 모으는 흐림' },
      { en: 'Occlusion pass (light white, occluders black)', ko: '가림 그림 — 빛은 하양 · 가리는 것은 검정' },
    ],
    goal: '{target}에 빛살(God rays)을 넣어 줘 — 해에서 가리는 물체 사이로 빛줄기가 쏟아지게. 분위기는 {style}.',
    targets: ['해 앞의 풍차 · 나무 · 언덕', '야구장 조명탑', '동굴 천장 틈 · 횃불'],
    styles: ['따뜻한 노을', '신비로운 새벽 안개', '어두운 동굴'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 HDRP Volumetric Fog(빛마다 Volumetrics) 가 진짜 빛살이고, URP 는 같은 화면 방사 흐림을 Full Screen 패스로 만든다.',
      godot: 'Godot 은 WorldEnvironment 의 Volumetric Fog 를 켜고 빛의 volumetric_fog_energy 를 올린다.',
    },
    principle: [
      '절반 크기 그림에 「가림 그림」을 그린다: 해는 하양, 나머지 물체는 모두 검정, 배경도 검정.',
      '해의 화면 위치(project)를 구한다.',
      '화면 각 점에서 해 쪽으로 60걸음 다가가며 가림 그림을 읽어 더한다. 걸음마다 0.975 배씩 약하게.',
      '물체가 가린 곳은 어두운 줄, 사이로 빛이 새는 곳은 밝은 줄이 되어 빛줄기가 생긴다.',
      '그 값에 따뜻한 색 × 세기(3.2)를 곱해 원래 그림에 더한다.',
    ],
    when: ['해 · 조명 앞에 가리는 물체가 있는 역광 장면', '분위기 연출 (노을 · 동굴 · 성당)'],
    avoid: ['빛이 화면 밖에 있거나 등 뒤에 있을 때 — 화면 기법이라 빛살이 사라진다', '폰 — 픽셀마다 60번 읽기. 대신 반투명 빛기둥 메시(u27 꼴)'],
    cost: 'medium',
    costNote: '장면을 절반 해상도로 한 번 더 그리고, 픽셀마다 60번 읽기. PC OK, 폰은 걸음 수를 줄인다.',
    level: 2,
    must: [
      '가림 그림은 절반 해상도 · 검은 배경 · 모든 물체 검정 재질 · 해만 흰 재질 (그린 뒤 재질 · 배경 되돌리기)',
      '해 화면 위치는 매 프레임 sun.position.project(camera) → 0~1 로',
      '걸음 수는 상수(60) — 반복 길이를 uniform 으로 두지 않기',
      '빛살 세기는 부드럽게 켜고 끄기 (amount 를 dt × 5 로 따라가게)',
      '몇 초마다 켬 / 끔 비교, 「자동 켜고 끄기」',
    ],
    done: [
      '해 앞 풍차 날개 · 나무 사이로 빛줄기가 방사형으로 쏟아지고, 날개가 돌면 빛줄기도 돈다',
      '켬 / 끔이 3초마다 부드럽게 바뀌어 차이가 분명하다',
      '카메라를 돌려도 빛살이 해에서 나온다',
    ],
    code: {
      lang: 'ts',
      title: '가림 그림 + 해 쪽으로 끌어 모으기',
      from: 'demos/demosLight.ts i06 make() 를 정리',
      body: `const rtO = new THREE.WebGLRenderTarget(1, 1);
const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
const GOD = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, tOcc: { value: rtO.texture }, lightPos: { value: new THREE.Vector2() }, amount: { value: 1 }, tint: { value: new THREE.Color(1.0, 0.82, 0.55) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; uniform sampler2D tOcc; uniform vec2 lightPos; uniform float amount; uniform vec3 tint; varying vec2 vUv;' +
    ' void main(){ vec4 base = texture2D(tDiffuse, vUv); vec2 d = (vUv - lightPos) * (0.92 / 60.0);' +
    ' vec2 uv = vUv; float il = 1.0; vec3 acc = vec3(0.0);' +
    ' for (int i = 0; i < 60; i++){ uv -= d; acc += texture2D(tOcc, uv).rgb * il; il *= 0.975; }' +
    ' acc /= 60.0; gl_FragColor = vec4(base.rgb + acc * tint * amount * 3.2, base.a); }',
});
// comp: RenderPass → new ShaderPass(GOD) → OutputPass

const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
const pos = new THREE.Vector3();
function frame(dt: number, w: number, h: number) {
  rtO.setSize(Math.round(w / 2), Math.round(h / 2));     // 절반 해상도면 충분
  const bg = scene.background;
  scene.background = null;
  for (const m of occluders) { saved.set(m, m.material); m.material = black; }
  saved.set(sun, sun.material); sun.material = white;
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(rtO); renderer.clear(); renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  for (const [m, mat] of saved) m.material = mat;
  saved.clear();
  scene.background = bg;
  pos.copy(sun.position).project(cam);                  // 해의 화면 위치
  GOD.uniforms.lightPos.value.set(pos.x * 0.5 + 0.5, pos.y * 0.5 + 0.5);
  comp.render(dt);
}`,
    },
    pitfalls: [
      { title: '가림 그림을 그린 뒤 재질 · 배경 · 지우기 색을 안 되돌리면 장면이 검게 나온다', fix: 'Map 에 저장했다가 바로 되돌린다.' },
      { title: '해가 화면 밖으로 나가면 빛살이 엉뚱한 방향으로 뻗는다', fix: '해가 화면 안 · 카메라 앞(pos.z < 1)일 때만 amount 를 올린다.' },
      { title: '빛기둥을 셰이더 반복문 잡음으로 만들면 컴파일이 오래 걸린다', fix: '이 견본은 텍스처 읽기만 반복한다. 보물 동굴의 빛기둥은 반투명 원뿔 메시(lightShaft)로 만들었다.', seen: true },
    ],
    prev: ['u21', 'u20'],
    next: ['i07'],
    refs: [{ name: 'three.js 예제 — webgl_postprocessing_godrays', url: 'https://threejs.org/examples/#webgl_postprocessing_godrays' }],
  },

  i07: {
    id: 'i07',
    summary: '3D 색 표(LUT)로 화면 색을 한 번에 노을 · 밤 · 옛날 필름으로 바꾸고, 필름 결과 「쿵!」 순간 RGB 어긋남을 얹어 분위기와 충격을 준다.',
    terms: [
      { en: 'Color grading LUT (3D lookup table)', ko: '색 보정 표 — 들어온 색 → 바꿀 색' },
      { en: 'LUTPass · Data3DTexture', ko: 'three.js 색 표 후처리 · 3D 텍스처' },
      { en: 'Chromatic aberration (RGBShiftShader)', ko: '색수차 — 빨 · 초 · 파가 어긋남' },
      { en: 'Film grain (FilmPass)', ko: '필름 결 — 잔 알갱이' },
    ],
    goal: '{target}에 색 보정 LUT 로 분위기를 바꾸고, 필름 결 · 충격 순간 색수차를 넣어 줘. 분위기는 {style}.',
    targets: ['작은 마을 장면 전체', '홈런 · 충돌 순간', '게임마다 다른 분위기'],
    styles: ['노을', '밤', '옛날 필름'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP Volume 의 Color Lookup(LUT 텍스처) · Chromatic Aberration · Film Grain.',
      godot: 'Godot 은 WorldEnvironment Adjustments 의 Color Correction 에 3D 텍스처(LUT)를 넣는다. 색수차 · 결은 화면 셰이더로.',
    },
    principle: [
      'LUT 는 빨 · 초 · 파 각각 24칸인 정육면체 표다 (24³ = 13,824칸). 칸마다 「이 색이 오면 이 색으로」를 적는다.',
      '함수 하나(노을 = 빨강 올리고 파랑 낮추고 S 곡선)로 표를 채워 Data3DTexture 로 만든다.',
      'LUTPass 가 픽셀마다 표를 한 번 읽어(선형 보간) 색을 바꾼다 — 효과가 복잡해도 비용은 같다.',
      '색수차: 빨 · 파를 반대쪽으로 조금(0.004) 밀고, 충격 순간 hit 값으로 0.022 더 민다. 필름 결은 잔 잡음을 더한다.',
      '충격 값은 exp(−(시간) × 6) 로 빠르게 줄고, 같은 값으로 카메라도 살짝 흔든다.',
    ],
    when: ['게임마다 · 시간대마다 분위기를 한 번에 바꾸고 싶을 때', '홈런 · 충돌처럼 짧은 충격 순간'],
    avoid: ['색수차 · 필름 결을 늘 켜 두기 — 눈이 피곤하고 글씨가 흐려진다. 순간에만', '색이 정답인 게임(색 맞추기) — LUT 가 색을 바꿔 버린다'],
    cost: 'light',
    costNote: 'LUT 는 픽셀마다 3D 텍스처 한 번 읽기. 색수차 · 결도 가벼운 화면 패스.',
    level: 2,
    must: [
      'LUT 는 출력(OutputPass) 뒤 sRGB 색에 건다 — 표를 sRGB 기준으로 만들었으면 순서를 맞추기',
      '표는 Data3DTexture(RGBA · LinearFilter · ClampToEdge), 크기 24',
      '색수차 양은 평소 0.004, 충격 순간만 hit 로 키우고 빠르게(exp) 줄이기',
      '왼쪽 원본 · 오른쪽 보정 비교, 3초마다 분위기 바꾸기, 「필름 결」 0~1 슬라이더',
    ],
    done: [
      '오른쪽 화면이 3초마다 노을 → 밤 → 옛날 필름으로 바뀌고 왼쪽 원본은 그대로다',
      '4.5초마다 「쿵!」 순간 화면이 흔들리며 가장자리 색이 빨 · 파로 갈라졌다가 금방 돌아온다',
      '「필름 결」을 올리면 잔 알갱이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '함수로 LUT 만들기 + 사슬',
      from: 'demos/demosLight.ts makeLut() · LUTS · i07 make() 를 정리',
      body: `import { LUTPass } from 'three/examples/jsm/postprocessing/LUTPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';

function makeLut(fn: (r: number, g: number, b: number) => [number, number, number], N = 24) {
  const d = new Uint8Array(N * N * N * 4);
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const [R, G, B] = fn(r / (N - 1), g / (N - 1), b / (N - 1));
    const o = (r + g * N + b * N * N) * 4;
    d[o] = Math.round(Math.max(0, Math.min(1, R)) * 255);
    d[o + 1] = Math.round(Math.max(0, Math.min(1, G)) * 255);
    d[o + 2] = Math.round(Math.max(0, Math.min(1, B)) * 255);
    d[o + 3] = 255;
  }
  const t = new THREE.Data3DTexture(d, N, N, N);
  t.format = THREE.RGBAFormat;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}
const sCurve = (x: number, k = 0.6) => x + k * (x - 0.5) * (1 - Math.abs(2 * x - 1)) * 0.5 * 2 * 0.5;
const sunset = makeLut((r, g, b) => [sCurve(r * 1.08 + 0.07), sCurve(g * 0.9 + 0.03), sCurve(b * 0.7 + 0.02)]);

const comp = new EffectComposer(renderer);
comp.addPass(new RenderPass(scene, cam));
comp.addPass(new OutputPass());                      // sRGB 로 바꾼 뒤 색 표
const lut = new LUTPass({ lut: sunset, intensity: 1 });
const shift = new ShaderPass(RGBShiftShader);
const film = new FilmPass(0.35, false);
comp.addPass(lut); comp.addPass(shift); comp.addPass(film);

function frame(t: number, dt: number) {
  const ph = t % 4.5;
  const hit = ph > 3.6 ? Math.exp(-(ph - 3.6) * 6) : 0;  // 쿵! 순간 값
  shift.uniforms.amount.value = 0.004 + 0.022 * hit;
  shift.uniforms.angle.value = t * 2;
  comp.render(dt);
}`,
    },
    pitfalls: [
      { title: 'LUT 를 선형 색 단계에 걸면 표와 색이 어긋난다', fix: '표를 sRGB 기준으로 만들었으면 OutputPass 뒤에 둔다 (견본 순서).' },
      { title: '표 크기를 너무 작게(8 이하) 하면 그러데이션에 띠가 생긴다', fix: '24 정도면 선형 보간으로 매끈하다.' },
      { title: '색수차 · 필름 결을 늘 켜 두면 글씨 · 숫자가 흐려진다', fix: '충격 순간에만 키우고 빠르게 줄인다. 평소는 아주 작게.' },
      { title: '가장자리를 어둡게 하는 비네트를 섞으면 답답하다', fix: '사용자 결정으로 비네트 · 가장자리 흐림은 쓰지 않는다.', seen: true },
    ],
    prev: ['u21'],
    next: ['i05', 'i06'],
    refs: [
      { name: 'three.js 예제 — webgl_postprocessing_3dlut', url: 'https://threejs.org/examples/#webgl_postprocessing_3dlut' },
      { name: 'three.js 소스 — LUTPass', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/LUTPass.js' },
    ],
  },

  i237: {
    id: 'i237',
    summary: '3D 장면을 낮은 해상도로 그려 밝기를 구한 뒤 8×8 Bayer 문턱 표와 비교해 두 색 점으로 바꿔, 흑백 점 밀도로 명암을 그리는 1비트 그림체를 만든다.',
    terms: [
      { en: 'Ordered dithering (Bayer matrix)', ko: '정해진 문턱 표로 점 찍기 — 밝을수록 점이 많음' },
      { en: '1-bit rendering', ko: '두 색만으로 그리기' },
      { en: 'Low-res render target + NearestFilter', ko: '작게 그려 가까운 픽셀 그대로 키우기' },
    ],
    goal: '{target}을(를) Bayer 디더링 화풍으로 그려 줘 — 낮은 해상도로 그리고 밝기를 8×8 문턱 표와 비교해 두 색 점으로. 분위기는 {style}.',
    targets: ['등불 비친 방 속 도형들', '회상 · 추리 장면', '「비율 = 점 밀도」 설명'],
    styles: ['1비트 옛 컴퓨터', '4색 옛 게임기', '신문 인쇄'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 카메라를 작은 RenderTexture(Point 필터)에 그리고, Full Screen 셰이더에서 Bayer 표와 비교한다.',
      godot: 'Godot 은 작은 SubViewport 에 그리고(Nearest 필터) 화면을 덮는 셰이더에서 Bayer 표와 비교한다.',
    },
    principle: [
      '장면을 화면의 1/2 크기(점 크기 2px) 렌더 타깃에 그린다.',
      '각 점의 색을 간단히 톤 매핑(1 − e^(−c·0.75))한 뒤 밝기 L 을 구하고 0.08~0.92 를 0~1 로 늘린다.',
      '8×8 Bayer 표는 0~63 을 고르게 흩어 둔 문턱이다. 점 좌표의 표 값 b 보다 L 이 크면 밝은 색, 아니면 어두운 색.',
      '그래서 밝기 40% 인 넓은 면은 40% 의 점만 밝게 — 멀리서 보면 회색으로 보인다.',
      '문턱만(0.5) 쓰면 계단처럼 뭉개지고, 4색 모드는 floor(L·3 + b)로 단계를 고른다.',
    ],
    when: ['회상 · 추리 · 옛날 느낌의 연출 장면', '「밝기 = 점 비율」을 눈으로 보여 줄 때'],
    avoid: ['색이 정보인 화면 — 두 색으로 줄어든다', '읽어야 할 작은 글씨 — 점 무늬에 묻힌다'],
    cost: 'light',
    costNote: '오히려 작은 해상도로 그려 가볍다. 화면 덮는 사각형 하나의 짧은 셰이더.',
    level: 2,
    must: [
      '장면은 낮은 해상도 렌더 타깃(Nearest 필터)에 그리고, 화면 덮는 사각형 셰이더가 점 좌표로 읽기',
      '점 좌표 = floor(gl_FragCoord.xy / 점 크기) — 문턱 표도 이 좌표로',
      'Bayer 표는 비트 섞기 식으로 계산 (텍스처 없이)',
      '방식(Bayer · 문턱만 · 4색) · 「점 크기」 1~6 · 원래 장면과 나눠 보기',
    ],
    done: [
      '움직이는 나눔 줄 왼쪽은 원래 장면, 오른쪽은 두 색 점 무늬로 명암이 보인다',
      '「문턱만」으로 바꾸면 그러데이션이 덩어리로 뭉개져 디더의 효과가 보인다',
      '「4색」은 초록 네 단계 옛 게임기 화면이 된다',
    ],
    code: {
      lang: 'glsl',
      title: '8×8 Bayer 문턱 디더 (화면 덮는 사각형)',
      from: 'demos/demosLook2.ts BAYER8 · makeDither() 를 정리',
      body: `uniform sampler2D tScene; uniform vec2 uLow; uniform float uPx, uMode;
// 0..63 을 고르게 흩은 8x8 문턱 — 비트 섞기로 계산
float bayer8(vec2 p){
  ivec2 ip = ivec2(mod(p, 8.0)); int x = ip.x; int xc = ip.x ^ ip.y;
  int v = ((xc & 1) << 5) | ((x & 1) << 4) | ((xc & 2) << 2) | ((x & 2) << 1) | ((xc & 4) >> 1) | ((x & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}
void main(){
  vec2 pix = floor(gl_FragCoord.xy / uPx);                 // 점 좌표
  vec3 c = texture2D(tScene, (pix + 0.5) / uLow).rgb;      // 낮은 해상도 장면 (선형 HDR)
  c = pow(1.0 - exp(-c * 0.75), vec3(1.0 / 2.2));          // 간단한 톤 매핑 + 감마
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  L = smoothstep(0.08, 0.92, L);
  float b = bayer8(pix);
  vec3 o;
  if (uMode < 0.5)      o = L > b   ? vec3(0.90, 1.0, 1.0) : vec3(0.20, 0.20, 0.10); // Bayer
  else if (uMode < 1.5) o = L > 0.5 ? vec3(0.90, 1.0, 1.0) : vec3(0.20, 0.20, 0.10); // 문턱만
  else {
    float k = clamp(floor(L * 3.0 + b), 0.0, 3.0);                                  // 4색
    o = k < 0.5 ? vec3(0.06, 0.22, 0.06) : k < 1.5 ? vec3(0.19, 0.38, 0.19) : k < 2.5 ? vec3(0.55, 0.67, 0.06) : vec3(0.61, 0.74, 0.06);
  }
  gl_FragColor = vec4(o, 1.0);
}
// JS: 렌더 타깃 = new THREE.WebGLRenderTarget(ceil(w/px), ceil(h/px), { type: THREE.HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter })
//     renderer.setRenderTarget(rt); renderer.render(scene, cam); → 화면 덮는 사각형을 그린다`,
    },
    pitfalls: [
      { title: '점 좌표 대신 화면 픽셀로 문턱을 고르면 점 크기가 1px 로 깨진다', fix: '문턱 표도 floor(gl_FragCoord / 점 크기) 로 고른다.' },
      { title: '장면 그림을 선형 색 그대로 비교하면 거의 다 어둡게 나온다', fix: '견본처럼 간단한 톤 매핑 · 감마를 먼저 하고 비교한다.' },
      { title: '카메라가 움직이면 점 무늬가 화면에 붙어 지글거린다', fix: '디더의 본래 성질이다. 느린 카메라 · 회상 장면에 쓴다.' },
    ],
    prev: ['u21', 'i11'],
    next: ['i238', 'i239'],
    refs: [{ name: 'Wikipedia — Ordered dithering', url: 'https://en.wikipedia.org/wiki/Ordered_dithering' }],
  },

  i238: {
    id: 'i238',
    summary: '3D 장면을 글자 칸 크기로 작게 그려 칸마다 밝기를 글자 사다리( . : - = + * # % @ )로 바꾸고, 밝기 경계는 기울기 방향에 맞춘 사선 글자로 그려 장면을 글자로 보여 준다.',
    terms: [
      { en: 'ASCII art shader', ko: '아스키 렌더 — 밝기를 글자로' },
      { en: 'Glyph atlas', ko: '글자 그림 한 줄 (16칸)' },
      { en: 'Sobel gradient', ko: '이웃 밝기 차이로 경계 방향 찾기' },
    ],
    goal: '{target}을(를) 아스키 렌더로 그려 줘 — 칸마다 밝기를 글자로, 밝기 경계는 방향에 맞는 사선 글자로. 분위기는 {style}.',
    targets: ['등불 비친 방 속 도형들', '해독 · 해킹 연출', '숫자로만 그린 세계'],
    styles: ['초록 단말기', '장면 색을 살린 글자', '흑백 타자기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 작은 RenderTexture(Point)에 그린 장면을 Full Screen 셰이더에서 칸마다 글자 아틀라스로 바꾼다.',
      godot: 'Godot 은 작은 SubViewport 장면을 화면 덮는 셰이더에서 칸마다 글자 아틀라스로 바꾼다.',
    },
    principle: [
      '장면을 화면 ÷ 칸 크기(10px) 해상도로 작게 그린다 — 한 픽셀이 글자 한 칸이다.',
      '글자 그림(아틀라스)에 빈칸부터 @ 까지 밝기 순서로 10글자, 그 뒤에 | / - \\ 경계 글자 4개를 한 줄로 그려 둔다.',
      '칸 밝기 L × 1.15 를 10단계로 끊어 글자 번호를 고르고, 칸 안 위치로 그 글자 그림을 읽는다.',
      '이웃 8칸의 소벨 기울기가 0.55 를 넘으면 경계 — 기울기 각도를 4방향으로 끊어 경계 글자로 바꾼다.',
      '글자 색은 장면 색을 밝게 하거나 초록 단말기 색으로.',
    ],
    when: ['해독 · 비밀 연출 · 레트로 단말기 화면', '숫자 · 글자로만 이루어진 세계 같은 그림체'],
    avoid: ['작은 물체 · 세밀한 장면 — 한 칸에 뭉개진다. 크고 단순한 도형 장면에', '폰 작은 화면 — 칸이 작으면 글자가 안 읽힌다 (칸 크기를 화면 높이에 비례)'],
    cost: 'light',
    costNote: '작은 해상도로 그리고, 화면 셰이더가 칸마다 장면 9번 · 글자 1번 읽기.',
    level: 2,
    must: [
      '장면 렌더 타깃 크기 = ceil(화면 / 칸 크기), Nearest 필터',
      '글자 아틀라스는 밉맵 끄고 LinearFilter, 밝기 순서로 글자 배치',
      '칸 크기는 화면 높이에 비례 (max(5, round(칸 × max(1, 높이/400))))',
      '경계 글자 켜고 끄기 · 장면 색 / 초록 단말기 · 「글자 칸 크기」 5~18',
    ],
    done: [
      '나눔 줄 오른쪽에서 도형들이 글자로 그려지고, 밝은 면은 # % @, 어두운 곳은 . : 로 보인다',
      '도형 윤곽에는 기울기 방향에 맞는 / \\ | - 가 이어져 선처럼 보인다',
      '「장면 색」을 끄면 초록 단말기 글자가 된다',
    ],
    code: {
      lang: 'glsl',
      title: '밝기 → 글자, 경계 → 사선 글자',
      from: 'demos/demosLook2.ts glyphAtlas() · makeAscii() 의 셰이더',
      body: `// 아틀라스 한 줄 16칸: ' ' . : - = + * # % @ | / - (역슬래시)  (0~9 밝기, 10~13 경계)
uniform sampler2D tScene, tGlyph; uniform vec2 uLow; uniform float uCell, uEdge, uColor;
vec3 S(vec2 cell){ vec3 c = texture2D(tScene, (cell + 0.5) / uLow).rgb; return pow(1.0 - exp(-c * 0.8), vec3(1.0 / 2.2)); }
float Lm(vec2 cell){ return dot(S(cell), vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 inC = fract(gl_FragCoord.xy / uCell);            // 칸 안 위치
  vec3 c = S(cell);
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  float gi = floor(clamp(L * 1.15, 0.0, 0.999) * 10.0); // 밝기 → 글자 번호 0~9
  if (uEdge > 0.5){
    float tl = Lm(cell + vec2(-1, 1)), t = Lm(cell + vec2(0, 1)), tr = Lm(cell + vec2(1, 1));
    float l = Lm(cell + vec2(-1, 0)), r = Lm(cell + vec2(1, 0));
    float bl = Lm(cell + vec2(-1, -1)), b = Lm(cell + vec2(0, -1)), br = Lm(cell + vec2(1, -1));
    float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);   // 소벨
    float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
    if (length(vec2(gx, gy)) > 0.55){
      float a = mod(atan(gy, gx) + 3.14159265 / 8.0, 3.14159265);
      float k = floor(a / (3.14159265 / 4.0));                // 4 방향
      gi = k < 0.5 ? 10.0 : k < 1.5 ? 13.0 : k < 2.5 ? 12.0 : 11.0;
    }
  }
  float gl = texture2D(tGlyph, vec2((gi + inC.x) / 16.0, inC.y)).r;
  vec3 tint = uColor > 0.5 ? clamp(c * 1.7 + 0.18, 0.0, 1.0) : vec3(0.35, 1.0, 0.55);
  gl_FragColor = vec4(vec3(0.02, 0.03, 0.04) + c * 0.16 + tint * gl, 1.0);
}`,
    },
    pitfalls: [
      { title: '글자 아틀라스에 밉맵을 켜면 글자가 흐려진다', fix: 'generateMipmaps = false · minFilter = LinearFilter.' },
      { title: '글꼴마다 글자 굵기가 달라 밝기 순서가 어긋난다', fix: '굵은 고정폭 글꼴(900 Consolas 류)로 그리고, 순서는 눈으로 확인해 맞춘다.' },
      { title: '경계 문턱이 낮으면 화면 전체가 사선 글자로 덮인다', fix: '견본 문턱 0.55. 장면 대비가 약하면 올린다.' },
    ],
    prev: ['i237'],
    next: ['i239'],
    refs: [{ name: 'Wikipedia — ASCII art', url: 'https://en.wikipedia.org/wiki/ASCII_art' }],
  },

  i239: {
    id: 'i239',
    summary: '3D 장면을 화면의 1/4 해상도로 그려 가까운 픽셀 그대로 크게 늘리고, 깊이 차이로 1px 어두운 외곽선 · 법선 차이로 모서리 밝힘을 넣어 도트 그림 같은 3D 를 만든다.',
    terms: [
      { en: 'Low-res pixel-art 3D (pixelation)', ko: '저해상 3D 도트' },
      { en: 'Depth-edge 1px outline', ko: '깊이 차이로 찾은 1픽셀 외곽선' },
      { en: 'Normal-edge highlight', ko: '같은 깊이에서 법선이 꺾이는 모서리를 밝게' },
      { en: 'RenderPixelatedPass', ko: 'three.js 에 있는 같은 계열 도트화 후처리' },
    ],
    goal: '{target}을(를) 저해상 도트 3D 로 그려 줘 — 1/4 해상도로 그려 크게 늘리고 1px 외곽선 · 모서리 밝힘. 분위기는 {style}.',
    targets: ['작은 섬 마을 (집 · 나무 · 꼬마)', '창고 · 주차장 판 레트로 모드', '3D 퍼즐 판'],
    styles: ['따뜻한 레트로 도트', '옛 휴대 게임기', '밝은 툰 도트'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 카메라를 작은 RenderTexture(Point 필터)에 그리고 UI RawImage 로 크게 띄운다. 외곽선은 깊이 · 법선 텍스처를 읽는 Full Screen 셰이더로.',
      godot: 'Godot 은 SubViewport 를 작게(예: 320×180) 두고 TextureRect(Nearest)로 크게, 외곽선은 hint_depth_texture 를 읽는 셰이더로.',
    },
    principle: [
      '장면을 화면 ÷ 4 크기 렌더 타깃에 그리고(깊이 텍스처 포함), 같은 크기에 법선 그림도 한 번 더 그린다.',
      '화면 덮는 사각형 셰이더가 floor(픽셀 / 4) 점 좌표로 읽어, 가까운 픽셀 그대로 커진 도트가 된다.',
      '이웃 넷 중 깊이가 0.004 이상 먼 곳이 있으면 내가 앞쪽 경계 — 색을 0.38 배로 어둡게(1px 외곽선).',
      '깊이는 비슷한데 법선이 꺾인 이웃이 있으면 모서리 — 1.35 배 밝게.',
      '정사영 카메라 · 툰 재질(3단)과 함께 쓰면 또렷한 도트 그림이 된다.',
    ],
    when: ['레트로 · 도트 그림체 모드', '작은 화면에서 또렷한 실루엣이 필요할 때'],
    avoid: ['원근 카메라가 많이 움직이는 장면 — 도트가 지글거린다. 정사영 · 느린 카메라에', '글씨 · 숫자를 3D 로 읽어야 할 때 — 1/4 해상도에서 뭉개진다. 글씨는 화면 위 HTML 로'],
    cost: 'light',
    costNote: '1/4 해상도(픽셀 수 1/16)로 두 번 그리고 화면 셰이더 하나 — 원래 해상도 한 번보다 가볍다.',
    level: 2,
    must: [
      '색 렌더 타깃은 DepthTexture 포함 · Nearest 필터, 법선 렌더 타깃은 같은 크기',
      '법선 그리기 동안 background = null · overrideMaterial = MeshNormalMaterial · 지우기 색 (0x8080ff), 끝나면 되돌리기',
      '도트 크기는 화면 높이에 비례 (round(4 × max(1, 높이/420)))',
      '정사영 카메라 + 툰 재질(3단 [0.35, 0.7, 1])',
      '「도트 크기」 1~8 · 「1px 외곽선 · 모서리 밝힘」 · 「보통 렌더로 비교」',
    ],
    done: [
      '섬 마을이 굵은 도트로 보이고, 집 · 나무 · 꼬마 둘레에 1px 어두운 선이 있다',
      '지붕 모서리 · 상자 모서리는 한 줄 밝게 빛나 입체가 산다',
      '「보통 렌더로 비교」를 켜면 매끈한 원래 3D 가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '작게 그리기(색 · 깊이 · 법선) + 도트 외곽선 셰이더',
      from: 'demos/demosLook2.ts makePixel3D() 를 정리',
      body: `const opts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
const nMat = new THREE.MeshNormalMaterial();
let rt: THREE.WebGLRenderTarget, rn: THREE.WebGLRenderTarget;

const frag = [
  'uniform sampler2D tC, tD, tN; uniform vec2 uLow; uniform float uPx, uOutline;',
  'void main(){',
  '  vec2 pix = floor(gl_FragCoord.xy / uPx); vec2 uv = (pix + 0.5) / uLow; vec2 e = 1.0 / uLow;',
  '  vec3 c = pow(1.0 - exp(-texture2D(tC, uv).rgb * 1.25), vec3(1.0 / 2.2));',
  '  if (uOutline > 0.5){',
  '    float d = texture2D(tD, uv).r; vec3 n = texture2D(tN, uv).rgb * 2.0 - 1.0; float de = 0.0; float ne = 0.0;',
  '    vec2 off[4]; off[0] = vec2(e.x, 0.0); off[1] = vec2(-e.x, 0.0); off[2] = vec2(0.0, e.y); off[3] = vec2(0.0, -e.y);',
  '    for (int i = 0; i < 4; i++){',
  '      float dn = texture2D(tD, uv + off[i]).r; vec3 nn = texture2D(tN, uv + off[i]).rgb * 2.0 - 1.0;',
  '      de += step(0.004, dn - d);',                                           // 이웃이 더 멀다 = 내가 앞 경계
  '      ne += step(abs(dn - d), 0.004) * step(0.0, dn - d) * (1.0 - smoothstep(0.6, 0.9, dot(n, nn)));',
  '    }',
  '    if (de > 0.0) c *= 0.38; else if (ne > 0.0) c = min(c * 1.35 + 0.05, vec3(1.0));',
  '  }',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'].join(' ');
// quad = 화면 덮는 사각형 (vertex: gl_Position = vec4(position.xy, 0.0, 1.0))

function frame(w: number, h: number) {
  const px = Math.max(1, Math.round(4 * Math.max(1, h / 420)));
  const lw = Math.ceil(w / px), lh = Math.ceil(h / px);
  if (!rt || rt.width !== lw || rt.height !== lh) {
    rt = new THREE.WebGLRenderTarget(lw, lh, opts);
    rt.depthTexture = new THREE.DepthTexture(lw, lh);
    rn = new THREE.WebGLRenderTarget(lw, lh, opts);
  }
  renderer.setRenderTarget(rt); renderer.render(scene, cam);          // 색 + 깊이
  const bg = scene.background; scene.background = null; scene.overrideMaterial = nMat;
  renderer.setRenderTarget(rn); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, cam);
  scene.overrideMaterial = null; scene.background = bg; renderer.setRenderTarget(null);
  const u = quad.mat.uniforms;                                        // uniforms: tC · tD · tN · uLow · uPx · uOutline
  u.tC.value = rt.texture; u.tD.value = rt.depthTexture; u.tN.value = rn.texture;
  u.uLow.value.set(lw, lh);
  u.uPx.value = px;
  renderer.render(quad.scene, quad.cam);
}`,
    },
    pitfalls: [
      { title: '렌더 타깃을 기본 Linear 필터로 키우면 도트가 아니라 흐린 그림이 된다', fix: 'NearestFilter 로, 또는 셰이더에서 점 중심(pix + 0.5)만 읽는다.' },
      { title: '원근 카메라가 움직이면 도트가 지글거린다', fix: '정사영 카메라 · 느린 회전에. 꼬마 창고지기 레트로 모드처럼 위에서 보는 판에 잘 맞는다.' },
      { title: '법선 그리기 뒤 지우기 색 · 배경을 안 되돌리면 다음 프레임이 이상하다', fix: '저장했다가 바로 되돌린다.' },
      { title: '도트 크기를 픽셀 고정으로 두면 고해상도 폰에서 도트가 너무 작다', fix: '화면 높이에 비례해 정한다.' },
    ],
    prev: ['i03', 'u01'],
    next: ['i237'],
    refs: [{ name: 'three.js 예제 — webgl_postprocessing_pixel', url: 'https://threejs.org/examples/#webgl_postprocessing_pixel' }],
  },

  i243: {
    id: 'i243',
    summary: '두 장면 그림을 화면 셰이더 하나에서 진행도 p 로 갈아 끼워, 잡음 녹기(불탄 테) · 도트 녹기 · 시계 쓸기 · 동그라미 열기로 장면을 넘긴다.',
    terms: [
      { en: 'Shader transition (gl-transitions style)', ko: '셰이더 장면 전환' },
      { en: 'Noise dissolve · pixelate · clock wipe · iris', ko: '잡음 녹기 · 도트 녹기 · 시계 쓸기 · 동그라미 열기' },
      { en: 'Progress uniform (0 → 1)', ko: '진행도 하나로 전환 전체를 조절' },
    ],
    goal: '{target}에 셰이더 장면 전환을 넣어 줘 — 진행도 하나로 잡음 녹기 · 도트 녹기 · 시계 쓸기 · 동그라미 열기 중 고르게. 분위기는 {style}.',
    targets: ['단계(레벨) 넘김', '월드 · 지도 이동', '결과 화면으로 넘어가기'],
    styles: ['불타는 마법', '레트로 도트', '깔끔한 만화 화면 전환'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 두 화면을 RenderTexture 로 받아 UI RawImage 의 셰이더에서 진행도 값으로 섞는다.',
      godot: 'Godot 은 CanvasLayer 위 ColorRect 에 ShaderMaterial 을 두고, 두 화면 텍스처와 progress uniform 으로 섞는다.',
    },
    principle: [
      '이전 장면 A · 다음 장면 B 그림을 같은 셰이더에 넘기고, 진행도 p 를 1.5초 동안 0 → 1 (부드러운 시작 · 끝)로 올린다.',
      '잡음 녹기: fbm 잡음 값 n 과 문턱 e = p × 1.3 − 0.15 를 비교해 A/B 를 고르고, 문턱 바로 위 띠는 주황 · 금빛으로 태운다.',
      '도트 녹기: 칸 수를 400 → 14 → 400 (sin(p·π))으로 줄였다 늘리며, 칸마다 난수가 p 를 넘으면 B 로.',
      '시계 쓸기: 화면 가운데 기준 각도(0~1)가 p 보다 작으면 B. 동그라미 열기: 가운데 거리가 p × 1.05 보다 작으면 B.',
      '끝나면 A 를 B 로 바꾸고 p 를 0 으로 — 다음 전환 준비.',
    ],
    when: ['단계 넘김 · 월드 이동처럼 장면이 통째로 바뀔 때', '로딩 중 다음 장면을 미리 그려 둘 수 있을 때'],
    avoid: ['짧은 정보 갱신(점수 · 칸 바꾸기) — 바뀌는 부분만 바꾼다 (화면 전체 다시 그리기 금지)', '다음 장면을 그리는 데 오래 걸릴 때 — 전환 전에 미리 그려 두지 않으면 멈칫한다'],
    cost: 'light',
    costNote: '화면 덮는 사각형 하나에 텍스처 2번 + 잡음 몇 번. 전환하는 1.5초 동안만.',
    level: 1,
    must: [
      '전환은 진행도 uniform 하나로 (0 → 1, smoothstep 으로 부드럽게)',
      '두 장면 그림 비율이 화면과 달라도 늘어나지 않게 cover 맞춤 (uRes 로 계산)',
      '방식 번호(uMode)로 한 셰이더에서 네 방식 — 셰이더를 여러 개 만들지 않기',
      '전환 셰이더는 NoToneMapping 으로 그려 장면 그림 색이 바뀌지 않게',
      '「다음 장면으로」 · 「방식 돌아가며」 · 「가장자리 빛」 조절',
    ],
    done: [
      '세 장면이 2.9초마다 넘어가며, 방식이 잡음 녹기 → 도트 녹기 → 시계 쓸기 → 동그라미 열기로 돌아간다',
      '잡음 녹기는 경계가 불탄 종이처럼 주황 · 금빛으로 빛난다',
      '화면 비율을 바꿔도 장면 그림이 찌그러지지 않는다',
    ],
    code: {
      lang: 'glsl',
      title: '네 가지 전환을 셰이더 하나로',
      from: 'demos/demosLook2.ts makeTransition() 의 셰이더 (NOISE 의 hash · fbm 사용)',
      body: `uniform sampler2D tA, tB; uniform float uP, uMode, uGlow; uniform vec2 uRes;
varying vec2 vUv;
// hash(vec2) · fbm(vec2) 는 공용 잡음 조각에서
vec2 cover(vec2 uv){ float sa = uRes.x / uRes.y; if (sa > 1.6) uv.y = (uv.y - 0.5) * 1.6 / sa + 0.5; else uv.x = (uv.x - 0.5) * sa / 1.6 + 0.5; return uv; }
void main(){
  vec2 uv = cover(vUv);
  float p = uP;
  vec3 a = texture2D(tA, uv).rgb, b = texture2D(tB, uv).rgb, col;
  if (uMode < 0.5){                                       // 잡음 녹기
    float n = fbm(uv * vec2(5.0, 3.2));
    float e = p * 1.3 - 0.15;
    col = mix(b, a, smoothstep(e - 0.01, e + 0.01, n));
    float band = smoothstep(e - 0.08, e, n) * (1.0 - smoothstep(e, e + 0.015, n));
    col += vec3(1.0, 0.45, 0.1) * band * 2.2 * uGlow;
    col += vec3(1.0, 0.9, 0.5) * (1.0 - smoothstep(0.0, 0.02, abs(n - e))) * uGlow;
  } else if (uMode < 1.5){                                // 도트 녹기
    float s = sin(p * 3.14159265);
    float cells = mix(400.0, 14.0, s);
    vec2 cuv = vec2(cells * 1.6, cells);
    vec2 pu = (floor(uv * cuv) + 0.5) / cuv;
    float pick = s > 0.15 ? step(hash(floor(uv * cuv) * 1.37), p * 1.2 - 0.1) : step(0.5, p);
    col = mix(texture2D(tA, pu).rgb, texture2D(tB, pu).rgb, pick);
  } else if (uMode < 2.5){                                // 시계 쓸기
    vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float ang = fract(atan(d.x, d.y) / 6.2831853 + 0.5);
    col = mix(b, a, smoothstep(p - 0.004, p + 0.004, ang));
  } else {                                                // 동그라미 열기
    vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    col = mix(b, a, smoothstep(p * 1.05 - 0.004, p * 1.05 + 0.004, length(d)));
  }
  gl_FragColor = vec4(col, 1.0);
}
// JS: p = smoothstep(0, 1.5초, 경과) — 1 이 되면 tA = tB, p = 0`,
    },
    pitfalls: [
      { title: '다음 장면을 전환 도중에 처음 그리면 첫 프레임이 멈칫한다', fix: '전환 전에 다음 장면을 렌더 타깃에 미리 그리고(셰이더도 미리 데우기 i385) 전환을 시작한다.' },
      { title: '화면 전체를 다시 그리는 전환을 탭 · 쪽 넘김에 쓰면 「새로고침 같다」는 말을 듣는다', fix: '사용자 지적 — 탭 · 쪽 넘김은 바뀌는 부분만 갈아 끼운다. 전환 효과는 단계 · 월드가 바뀔 때만.', seen: true },
      { title: '그림 비율이 다르면 전환 중에 장면이 늘어난다', fix: 'cover() 처럼 화면 비율로 좌표를 맞춘다.' },
    ],
    prev: ['i12', 'u21'],
    next: ['i385'],
    refs: [{ name: 'gl-transitions (전환 셰이더 모음)', url: 'https://gl-transitions.com/' }],
  },

  i496: {
    id: 'i496',
    summary: '화면에 이미 그려진 색 · 깊이 · 법선만으로 반사 광선을 화면 위에서 걸어, 젖은 바닥 웅덩이에 횃불 · 기둥 · 푸른 문이 비치게 한다 (WebGPU · TSL).',
    terms: [
      { en: 'Screen-space reflections (SSR)', ko: '화면 반사 — 화면에 보이는 것만 비춤' },
      { en: 'MRT (multiple render targets)', ko: '한 번 그리면서 색 · 법선 · 금속/거칠기를 함께 받기' },
      { en: 'three/tsl ssr() · RenderPipeline', ko: 'three.js WebGPU 노드 후처리의 SSR' },
      { en: 'Roughness-driven reflection mask', ko: '거칠기 낮은(젖은) 곳만 반사' },
    ],
    goal: '{target}에 화면 반사(SSR)를 넣어 줘 — 화면에 보이는 것을 매끈한 곳(웅덩이)에만 비추게. 분위기는 {style}.',
    targets: ['젖은 던전 바닥', '비 온 뒤 거리 · 물웅덩이', '반들한 무대 바닥'],
    styles: ['어둡고 축축한 던전', '네온 비 오는 밤', '깨끗한 전시장'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: 'WebGPURenderer(three/webgpu) + three/tsl 의 ssr(). WebGL 백엔드로 떨어지면 반사가 거의 안 나올 수 있다.',
      unity: 'Unity HDRP 는 Volume 의 Screen Space Reflection 을 켠다.',
      godot: 'Godot 은 WorldEnvironment 의 SSR(ssr_enabled · max_steps)을 켜고, 재질 거칠기를 낮춘 곳이 비친다.',
    },
    principle: [
      '장면을 한 번 그리면서(MRT) 색 · 깊이 · 보기 공간 법선 · 금속/거칠기를 함께 받는다.',
      '반사할 곳의 픽셀마다 법선으로 반사 방향을 구해, 깊이 그림 위를 화면에서 한 걸음씩 걸어 다른 물체에 닿는 곳의 색을 가져온다.',
      '바닥 재질은 거칠기 그림에서 웅덩이(거칠기 낮음)일수록 반사 표시값을 크게 — smoothstep(0.5, 0.12, 거칠기) × 0.9 + 0.06.',
      '최대 거리(12) · 두께(0.06) · 품질(0.5)로 걷는 범위를 정하고, 결과를 원래 색과 섞는다(blendColor).',
      '화면 밖 · 가려진 것은 비치지 않는다 — 화면 기법의 한계.',
    ],
    when: ['젖은 바닥 · 물웅덩이 · 반들한 바닥이 넓게 보이는 장면', '평면 반사(i14)를 쓸 수 없는 울퉁불퉁 · 여러 높이의 바닥'],
    avoid: ['폰 · 저사양 — 화면 걸음이 무겁다', '거울처럼 화면 밖까지 비쳐야 할 때 — 대신 평면 반사(Reflector, i14)나 환경 반사(u12)', 'WebGL 만 쓰는 프로젝트 — 이 견본은 WebGPU 노드 후처리다'],
    cost: 'heavy',
    costNote: 'MRT 로 그림 4장을 받고, 반사 픽셀마다 화면 위 수십 걸음. 해상도 배율(resolutionScale)로 줄일 수 있다.',
    level: 3,
    must: [
      'WebGPURenderer + RenderPipeline: pass(scene, cam).setMRT(mrt({ output, normal: directionToColor(normalView), metalrough }))',
      '반사 여부 · 세기는 재질의 mrtNode 로 — 웅덩이(거칠기 낮은 곳)만 크게, 다른 물체는 metalrough = (0, 1)',
      'ssr(색, 깊이, 법선, { metalnessNode, roughnessNode, reflectNonMetals: false, camera }) 후 blendColor(색, ssr)',
      'maxDistance · thickness · quality · intensity 를 조절값으로, 켬/끔은 outputNode 를 바꾸고 needsUpdate',
      'WebGL 대체일 때는 반사가 약하다는 안내를 화면에',
    ],
    done: [
      '켜면 젖은 웅덩이에 횃불 불꽃 · 기둥 · 안쪽 푸른 문이 거꾸로 비치고, 마른 돌 판에는 비치지 않는다',
      '끄면 바닥이 빛만 받고 비침이 사라진다',
      '「반사 세기」 0~1.5 · 「반사 거리」 2~24 가 바로 반영된다',
    ],
    code: {
      lang: 'ts',
      title: 'MRT + 바닥만 반사 표시 + SSR 노드',
      from: 'demos/demosWebGPU.ts i496 build() 를 정리',
      body: `import * as GPU from 'three/webgpu';
import { pass, mrt, output, normalView, directionToColor, colorToDirection, sample, vec2, smoothstep, roughness, blendColor } from 'three/tsl';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';

// 바닥: 거칠기 그림의 웅덩이(낮은 곳)일수록 반사 표시를 크게
const floorMat = new GPU.MeshStandardNodeMaterial({ map: colorMap, roughnessMap: roughMap, roughness: 1, metalness: 0 });
floorMat.mrtNode = mrt({ metalrough: vec2(smoothstep(0.5, 0.12, roughness).mul(0.9).add(0.06), roughness) });

const pipe = new GPU.RenderPipeline(renderer);
const sp = pass(scene, cam);
sp.setMRT(mrt({ output, normal: directionToColor(normalView), metalrough: vec2(0, 1) })); // 기본: 반사 없음
const col = sp.getTextureNode('output');
const dep = sp.getTextureNode('depth');
const nrmT = sp.getTextureNode('normal');
const mr = sp.getTextureNode('metalrough');
const nrm = sample((u: any) => colorToDirection(nrmT.sample(u)));
const ssrN: any = ssr(col, dep, nrm, { metalnessNode: mr.r, roughnessNode: mr.g, reflectNonMetals: false, camera: cam });
ssrN.maxDistance.value = 12;
ssrN.thickness.value = 0.06;
ssrN.quality.value = 0.5;
const withSSR = blendColor(col, ssrN);

let on = true;
function setOut() { pipe.outputNode = on ? withSSR : col; pipe.needsUpdate = true; }
setOut();
function frame() {
  ssrN.intensity.value = 1;
  pipe.render();                    // renderer.render 대신
}`,
    },
    pitfalls: [
      { title: 'WebGL2 대체 백엔드에서는 이 SSR 노드의 반사가 거의 안 나온다', fix: '견본도 WebGPU 가 없으면 안내 글을 띄운다. 지원 여부를 보고 꺼진 판(환경 반사)으로 바꾼다.', seen: true },
      { title: '모든 물체에 반사를 켜면 벽 · 기둥까지 번들거린다', fix: '기본 metalrough 를 (0, 1)로 두고, 바닥 재질만 mrtNode 로 반사 표시를 준다.' },
      { title: '화면 가장자리 · 가려진 것은 비치지 않아 반사가 뚝 끊긴다', fix: '화면 기법의 한계. 카메라를 바닥 쪽으로 낮게 두지 않고, 끊김은 거리 감쇠로 부드럽게.' },
      { title: '카드처럼 작은 미리 보기에서 WebGPU 렌더러를 여럿 만들면 무겁다', fix: '견본은 카드에서는 그림만, 크게 보기에서만 렌더러를 하나 만든다.', seen: true },
    ],
    prev: ['u21', 'u12'],
    next: ['i14'],
    refs: [
      { name: 'three.js 예제 — webgpu_postprocessing_ssr', url: 'https://threejs.org/examples/#webgpu_postprocessing_ssr' },
      { name: 'three.js 소스 — SSRNode', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/tsl/display/SSRNode.js' },
    ],
    source: [{ file: 'demosWebGPU.ts', symbol: 'i496' }, { file: 'demosWebGPU.ts', symbol: 'wetFloorCanvases' }],
  },
};

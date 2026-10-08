import type { TechDoc } from './types';

/**
 * 기술 문서 B01 — 빛 · 환경 (u12 u14 u15 u17 i14 i15 i431~i434) · 하늘 (i224 i225) · 물 셰이더 (u22 u23 u25 i222) ·
 * 휘는 지평선 (i537) · 우주 표현 (i522~i535).
 * 코드는 견본(demos/)의 실제 코드에서 발췌해 카드용 장치(조절판 · 글씨 · 나란히 비교 · dispose)를 걷어 냈다.
 */
export const DOCS: Record<string, TechDoc> = {
  u12: {
    id: 'u12',
    summary: '스튜디오 조명 장면을 한 번 구워 반사 지도로 깔아, 금속 · 유리 · 니스 칠한 물체에 빛이 비쳐 반짝이게 한다.',
    terms: [
      { en: 'Image-based lighting (environment map)', ko: '둘레 그림으로 비침 · 은은한 빛 주기' },
      { en: 'RoomEnvironment', ko: 'three.js 가 주는 스튜디오 방 장면 (창 · 조명판)' },
      { en: 'PMREMGenerator', ko: '거칠기마다 흐린 반사 지도를 미리 구워 주는 도구' },
      { en: 'scene.environment / environmentIntensity', ko: '장면 전체 반사 지도 · 그 세기' },
    ],
    goal: '{target}에 RoomEnvironment 반사 지도를 깔아 금속 · 유리가 {style} 느낌으로 반짝이게 해 줘.',
    targets: ['금속 공 · 금 고리 · 보석 · 주사위', '보드게임 말 · 판', '3D 마스코트 캐릭터'],
    styles: ['깨끗한 스튜디오 사진', '장난감처럼 반들반들', '고급 진열장'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Lighting 창의 Environment Reflections(스카이박스) 또는 Reflection Probe 를 굽는다.',
      godot: 'Godot 은 WorldEnvironment 의 Environment → Sky(배경 · 반사) 또는 ReflectionProbe 노드.',
    },
    principle: [
      '반들반들한 물체는 빛만 받는 것이 아니라 둘레 풍경을 비춘다. 둘레가 없으면 금속이 시커멓게 보인다.',
      'RoomEnvironment 는 하얀 조명판 · 창이 있는 작은 방 장면이다. 이것을 렌더러로 한 번 찍어 반사 지도로 쓴다.',
      'PMREMGenerator 가 거칠기마다 다르게 흐린 지도를 미리 만들어 둔다 — 매끈하면 또렷한 비침, 거칠면 뿌연 빛.',
      'scene.environment 에 넣으면 표준 · 물리 재질 모두가 같은 지도를 읽는다. 배경(background)은 따로라 그대로 둘 수 있다.',
    ],
    when: ['금속 · 유리 · 클리어코트 재질이 조명만으로 밋밋할 때', '보드게임 말 · 주사위처럼 작은 물체를 고급스럽게', '빛을 여러 개 더하지 않고 은은한 둘레 빛을 주고 싶을 때'],
    avoid: ['툰 그림체 — 계단 명암을 흐린다. 대신 테두리 빛(i10) · 매트캡(i09)', '장면 하늘색 · 분위기에 반사가 맞아야 할 때 — 대신 셰이더 하늘로 구운 반사(u13)'],
    cost: 'light',
    costNote: '굽기는 시작할 때 한 번(수십 ms). 그 뒤에는 재질마다 지도 한 번 읽기라 폰도 가볍다. 지도는 렌더러마다 하나만 만든다.',
    level: 1,
    must: [
      'PMREMGenerator 는 렌더러가 생긴 뒤 한 번만 굽고, 다 구우면 pm.dispose() · room.dispose()',
      '반사는 scene.environment 에만 — scene.background 는 그대로 (스튜디오 방이 배경에 보이면 안 된다)',
      'environmentIntensity 로 세기를 조절 (견본 1, 게임은 0.5 ~ 0.7) — 빛을 끄고 반사로만 밝히지 말 것',
      '반사가 보이는 재질은 roughness 0.05 ~ 0.2 의 금속(metalness 1) 또는 clearcoat 1 물리 재질',
      '렌더러가 바뀌면(다시 만들면) 지도를 다시 굽는다',
    ],
    done: [
      '왼쪽 조명만 · 오른쪽 환경 반사로 나란히 두면, 오른쪽 크롬 공 · 금 고리에 하얀 창 모양 비침이 보인다',
      '빨간 주사위 클리어코트에 또렷한 하이라이트, 하늘색 보석 면마다 다른 밝기가 보인다',
      '「반사 세기」 0 ~ 2 슬라이더로 비침이 줄고 는다 (0 이면 왼쪽과 같아짐)',
      '폰에서도 60fps — 시작 때 한 번 굽고 나면 프레임 비용이 거의 없다',
    ],
    code: {
      lang: 'ts',
      title: 'RoomEnvironment 를 구워 장면 반사 지도로',
      from: 'demos/demosLight.ts u12 make() 의 render 첫 굽기 · build() 재질을 정리',
      body: `import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// 렌더러가 생긴 뒤 한 번만 굽는다
const pm = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const envTex = pm.fromScene(room, 0.04).texture; // 0.04 = 살짝 흐리게
room.dispose();
pm.dispose();

scene.environment = envTex;     // 배경은 그대로, 비침에만 쓰인다
scene.environmentIntensity = 1; // 게임은 0.5 ~ 0.7

// 조명은 그대로 둔다 — 환경은 빛을 대신하지 않고 비침을 준다
scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8aa0, 0.5));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.3);
sun.position.set(3, 5, 4);
scene.add(sun);

// 비침이 잘 보이는 재질 — 매끈한 금속 · 클리어코트
const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 1 });
const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, roughness: 0.2, metalness: 1 });
const dice = new THREE.MeshPhysicalMaterial({ color: 0xe8453c, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
const gem = new THREE.MeshPhysicalMaterial({ color: 0x7fe6ff, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.6, flatShading: true });`,
    },
    pitfalls: [
      { title: '반사 지도 없이 metalness 1 을 쓰면 금속이 검게 보인다', fix: '금속은 둘레를 비추는 재질이라 비출 것이 없으면 까맣다. environment 를 깔거나 metalness 를 낮춘다.' },
      { title: '환경 세기를 1 그대로 두면 장면이 뿌옇게 밝아진다', fix: '빛과 반사가 겹친다. 이 사이트 게임들은 0.5 ~ 0.7 로 낮춰 썼다.', seen: true },
      { title: '프레임마다 PMREMGenerator 로 다시 구우면 느려진다', fix: '지도는 렌더러마다 한 번만. 견본도 렌더러가 바뀔 때만 다시 굽는다.' },
      { title: '툰 장면에 깔면 계단 명암이 흐려진다', fix: '툰 재질(MeshToonMaterial)은 환경을 쓰지 않지만 섞인 표준 재질이 튄다. 툰 장면은 환경을 끄고 빛으로.' },
    ],
    prev: ['u14', 'u04'],
    next: ['u13', 'i14'],
    refs: [
      { name: 'three.js 소스 — RoomEnvironment', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/environments/RoomEnvironment.js' },
      { name: 'three.js 문서 — PMREMGenerator', url: 'https://threejs.org/docs/#api/en/extras/PMREMGenerator' },
    ],
  },

  u14: {
    id: 'u14',
    summary: '반구 빛 · 해 · 뒤쪽 테두리 빛 셋을 겹쳐, 납작하던 캐릭터가 입체로 서고 윤곽이 배경에서 떠오르게 한다.',
    terms: [
      { en: 'Three-point lighting (key · fill · rim)', ko: '주광 · 보조광 · 테두리 빛 세 가지 조명' },
      { en: 'HemisphereLight', ko: '하늘색 위 · 땅색 아래로 고르게 비추는 바탕 빛' },
      { en: 'DirectionalLight (key / rim)', ko: '해처럼 한 방향으로 오는 빛 — 앞 위에서 주광, 뒤에서 테두리' },
    ],
    goal: '{target}에 3점 조명(반구 빛 + 해 + 뒤 테두리 빛)을 넣어 {style} 느낌으로 입체감과 윤곽을 살려 줘.',
    targets: ['동글동글한 캐릭터', '판 위 게임 말', '진열된 상품 모형'],
    styles: ['밝은 장난감 사진', '무대 조명', '밤 배경 위 반짝 윤곽'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Lighting 창 Environment Lighting 을 Gradient(하늘 · 땅 색)로, Directional Light 두 개(앞 위 · 뒤).',
      godot: 'Godot 은 Environment 의 Ambient Light(Sky 또는 Color) + DirectionalLight3D 두 개.',
    },
    principle: [
      '반구 빛(바탕)만 있으면 어디서나 밝기가 같아 그림자 없는 스티커처럼 보인다.',
      '해(주광)를 앞 위 비스듬히 더하면 한쪽은 밝고 반대쪽은 어두워져 둥근 모양이 드러난다.',
      '뒤에서 오는 빛(테두리)은 물체 가장자리만 스친다. 어두운 배경에서 윤곽이 반짝 떠오른다.',
      '테두리 빛은 가장자리 몇 픽셀만 밝히므로 세기를 주광보다 훨씬 세게(견본 7 · 4) 둔다.',
    ],
    when: ['캐릭터 · 말이 배경에 묻혀 보일 때', '어두운 배경에 밝은 물체를 세울 때', '어느 3D 장면이든 처음 조명을 잡을 때 — 기본 틀'],
    avoid: ['빛이 하나뿐이어야 하는 장면(달밤 · 촛불) — 대신 밤 장면(i432)', '테두리를 셰이더로 그려야 할 때(툰) — 대신 테두리 빛 셰이더(i10)'],
    cost: 'light',
    costNote: '빛 4개(반구 1 + 방향 3)는 그림자를 끄면 폰도 가볍다. 그림자는 주광 하나에만 켠다.',
    level: 1,
    must: [
      '반구 빛 하늘색 · 땅색을 다르게 (견본 0xbfe3ff 위 · 0x5a4630 아래) — 같은 색이면 바탕이 납작하다',
      '해를 더하면 반구 세기를 낮춘다 (견본 1.4 → 0.9) — 합쳐서 하얗게 날아가지 않게',
      '테두리 빛은 물체 뒤쪽(z 음수)에서, 주광과 다른 색(하늘색 · 분홍)으로 두 개',
      '그림자는 주광 하나에만 (테두리 빛은 그림자 끔)',
    ],
    done: [
      '세 칸을 나란히 — 반구만 · + 해 · + 테두리 — 두면 칸마다 입체감이 한 단계씩 는다',
      '세 번째 칸에서 캐릭터 가장자리에 하늘색 · 분홍 빛 테가 보인다',
      '캐릭터가 돌아도 테두리는 늘 윤곽 쪽에 남는다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '반구 + 해 + 테두리 두 개',
      from: 'demos/demosLight.ts u14 build(n) 을 정리',
      body: `import * as THREE from 'three';

// 1) 바탕 — 위는 하늘색, 아래는 흙빛 (해가 있으니 0.9 로 낮춤, 반구만이면 1.4)
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x5a4630, 0.9));

// 2) 주광 — 앞 왼쪽 위에서 따뜻하게
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.position.set(-2.2, 3, 2.5);
scene.add(sun);

// 3) 테두리 빛 — 뒤(z 음수)에서 가장자리만 스친다. 몇 픽셀만 밝히니 세게
const rim = new THREE.DirectionalLight(0x9fe0ff, 7);
rim.position.set(2.6, 1.2, -3.5);
const rim2 = new THREE.DirectionalLight(0xffd0f0, 4);
rim2.position.set(-2.6, 1.0, -3.5);
scene.add(rim, rim2);`,
    },
    pitfalls: [
      { title: '해를 더하고 반구 세기를 그대로 두면 하얗게 날아간다', fix: '빛은 더해진다. 해를 넣으면 반구를 낮춘다 (견본 1.4 → 0.9).' },
      { title: '테두리 빛을 카메라 쪽에 두면 앞면이 납작하게 밝아진다', fix: '테두리는 물체 뒤에서 카메라 쪽을 향해 — 견본은 z = -3.5.' },
      { title: '빛마다 그림자를 켜면 느려지고 그림자가 겹친다', fix: '그림자는 주광 하나만. 방향 빛 하나 = 그림자 지도 한 장.' },
    ],
    prev: ['u17'],
    next: ['i10', 'u12', 'u15'],
    refs: [
      { name: 'three.js 문서 — HemisphereLight', url: 'https://threejs.org/docs/#api/en/lights/HemisphereLight' },
      { name: 'Wikipedia — Three-point lighting', url: 'https://en.wikipedia.org/wiki/Three-point_lighting' },
    ],
  },

  u15: {
    id: 'u15',
    summary: '원뿔 스포트라이트로 탁자를 훑고, 촛불 점광은 사인 두세 개로 일렁이고, 가끔 번쩍 하는 빛으로 장면에 숨결을 준다.',
    terms: [
      { en: 'SpotLight', ko: '원뿔 모양으로 비추는 빛 (angle · penumbra · target)' },
      { en: 'PointLight flicker', ko: '점광 세기를 흔들어 촛불 · 횃불처럼' },
      { en: 'Visible light cone (additive volume fake)', ko: '빛 원뿔을 옅은 더하기 메시로 보이게' },
      { en: 'Light flash (exponential decay)', ko: '번쩍 — 세기를 지수로 빠르게 줄이기' },
    ],
    goal: '{target}에 움직이는 원뿔 스포트라이트 · 일렁이는 촛불 · 가끔 번쩍 빛을 넣어 {style} 분위기로 만들어 줘.',
    targets: ['어두운 방 탁자 위 동전 · 주사위', '무대 위 캐릭터', '횃불이 있는 동굴'],
    styles: ['어둡고 신비한 보물 방', '무대 위 한 사람 조명', '아늑한 촛불 밤'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Spot Light(Spot Angle · Inner Spot Angle) · Point Light, 일렁임은 스크립트로 intensity 를 바꾼다.',
      godot: 'Godot 은 SpotLight3D(spot_angle · spot_attenuation) · OmniLight3D 의 light_energy 를 스크립트로.',
    },
    principle: [
      '스포트라이트는 위치 · 과녁(target) · 원뿔 반각(angle) · 가장자리 흐림(penumbra) 넷으로 정한다. 과녁만 옮기면 빛이 훑는다.',
      '빛 원뿔은 원래 안 보인다. 같은 각도의 열린 원뿔 메시를 아주 옅게(0.045) 더하기로 그려 공기 속 빛처럼 보이게 한다.',
      '촛불은 빠른 사인 몇 개를 곱하고 더해 불규칙하게: 0.75 + 0.25·sin(13t)·sin(7.3t+1) + 0.1·sin(29t).',
      '번쩍은 5초마다 한 번, 마지막 1초 동안 exp(-(경과)·7) 로 세기를 빠르게 줄인다.',
    ],
    when: ['어두운 장면에서 시선을 한곳으로 모을 때', '촛불 · 횃불 · 등불처럼 살아 있는 빛이 필요할 때', '번개 · 사진기 플래시 같은 순간 연출'],
    avoid: ['밝은 낮 장면 — 해 하나로 충분하다. 대신 3점 조명(u14)', '그림자 켠 점광 여러 개 — 점광 그림자 하나 = 지도 6장. 그림자는 스포트 하나만'],
    cost: 'medium',
    costNote: '스포트 그림자 지도 512² 한 장 + 점광 2개(그림자 없음). 점광에 그림자를 켜면 하나에 6장이라 폰에서 무겁다.',
    level: 2,
    must: [
      '그림자는 스포트라이트 하나에만 (shadow.mapSize 512, bias -0.0005) — 촛불 · 번쩍 점광은 그림자 끔',
      '보이는 원뿔은 MeshBasicMaterial · AdditiveBlending · opacity 0.045 · depthWrite false · DoubleSide',
      '원뿔 각도를 바꾸면 보이는 원뿔 크기도 tan(각)/tan(처음 각) 비율로 함께 바꾼다',
      'spot.target 을 scene 에 넣어야 과녁 위치가 반영된다',
      '빛 개수는 늘 같게 — 번쩍은 세기 0 으로 두었다 올리기 (빛을 넣었다 뺐다 하면 셰이더를 다시 굽는다)',
    ],
    done: [
      '원뿔 빛 무늬가 탁자 위를 천천히 훑고 그 아래 동전 · 주사위 그림자가 따라 움직인다',
      '촛불 주변 탁자가 불규칙하게 일렁이고 불꽃 모양도 같이 늘었다 줄었다 한다',
      '5초마다 장면 전체가 한 번 번쩍했다가 빠르게 어두워진다',
      '「원뿔 넓이」 · 「촛불 일렁임」 조절이 바로 바뀌고, 폰에서도 부드럽다',
    ],
    code: {
      lang: 'ts',
      title: '훑는 스포트 + 보이는 원뿔 + 촛불 일렁임 + 번쩍',
      from: 'demos/demosLight.ts u15 make() 를 정리',
      body: `import * as THREE from 'three';

const spot = new THREE.SpotLight(0xfff3d0, 45, 12, 0.32, 0.45, 1.4); // 세기 · 거리 · 반각 · 흐림 · 감쇠
spot.position.set(0, 4, 0.6);
spot.castShadow = true;
spot.shadow.mapSize.set(512, 512);
spot.shadow.bias = -0.0005;
scene.add(spot, spot.target); // target 도 장면에

// 보이는 원뿔 — 꼭짓점이 빛 자리, 열린 원뿔을 아주 옅게 더하기
const len = 4.4;
const coneGeo = new THREE.ConeGeometry(Math.tan(0.32) * len, len, 40, 1, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2);
const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
cone.position.copy(spot.position);
scene.add(cone);

const candleL = new THREE.PointLight(0xff9a40, 2, 4.5, 1.6);
candleL.position.set(-1.6, 0.85, 0.7);
const flash = new THREE.PointLight(0xe8f0ff, 0, 10, 1.2); // 처음부터 넣어 두고 세기만
flash.position.set(0.5, 2.2, 1.5);
scene.add(candleL, flash);

function update(t: number, ang = 0.32): void {
  spot.target.position.set(Math.sin(t * 0.8) * 1.5, 0, Math.cos(t * 0.55) * 0.7);
  spot.angle = ang;
  cone.lookAt(spot.target.position);
  const ck = spot.position.distanceTo(spot.target.position) / len;
  const cr = (ck * Math.tan(ang)) / Math.tan(0.32);
  cone.scale.set(cr, cr, ck);
  const f = 0.75 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1) + 0.1 * Math.sin(t * 29);
  candleL.intensity = 2.2 * f;
  const ph = t % 5;
  flash.intensity = 60 * (ph > 4 ? Math.exp(-(ph - 4) * 7) : 0);
}`,
    },
    pitfalls: [
      { title: '그림자 켠 점광을 여러 개 두면 프레임이 무너진다', fix: '점광 그림자 하나는 그림자 지도 6장이다. 그림자는 스포트 하나만.', seen: true },
      { title: 'spot.target 을 장면에 안 넣으면 과녁을 옮겨도 빛이 안 움직인다', fix: 'scene.add(spot.target) 또는 target 을 장면 안 물체로.' },
      { title: '빛을 그때그때 만들었다 지우면 화면이 멈칫한다', fix: '빛 개수가 바뀌면 모든 재질 셰이더를 다시 굽는다. 번쩍 빛도 처음부터 두고 세기만 바꾼다 (보물 동굴은 점광을 늘 12개로 채웠다).', seen: true },
      { title: '보이는 원뿔을 진하게 하면 뿌연 원뿔 덩어리가 된다', fix: '더하기 섞기에 opacity 0.04 ~ 0.06 정도로 아주 옅게.' },
    ],
    prev: ['u14', 'u17'],
    next: ['i06', 'i433'],
    refs: [
      { name: 'three.js 예제 — webgl_lights_spotlight', url: 'https://threejs.org/examples/#webgl_lights_spotlight' },
      { name: 'three.js 문서 — SpotLight', url: 'https://threejs.org/docs/#api/en/lights/SpotLight' },
    ],
  },

  u17: {
    id: 'u17',
    summary: '해에서 본 깊이를 그림자 지도에 찍어, 물체가 바닥에 그림자를 드리우게 한다 — 반지름으로 또렷하게(만화) · 부드럽게 고른다.',
    terms: [
      { en: 'Shadow mapping', ko: '빛 쪽에서 본 깊이 그림으로 그림자 정하기' },
      { en: 'PCFShadowMap / PCFSoftShadowMap', ko: '가장자리를 여러 번 읽어 매끈하게 하는 방식' },
      { en: 'shadow.radius · mapSize · bias · normalBias', ko: '흐림 반지름 · 지도 크기 · 줄무늬 막기 값' },
      { en: 'Shadow camera frustum', ko: '그림자를 찍는 상자 범위 (left · right · top · bottom)' },
    ],
    goal: '{target}에 해 그림자를 넣어 줘 — {style} 그림자로, 해가 돌면 그림자도 따라 돌게.',
    targets: ['판 위 캐릭터 · 블록', '보드게임 판과 말', '작은 마을 장면'],
    styles: ['또렷한 만화 그림자', '부드러운 사진 그림자', '긴 저녁 그림자'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Light 의 Shadow Type(Hard · Soft Shadows) · URP Asset 의 Shadow Resolution · Depth/Normal Bias.',
      godot: 'Godot 은 DirectionalLight3D 의 shadow_enabled · shadow_blur · shadow_bias / shadow_normal_bias.',
    },
    principle: [
      '빛 자리에 카메라를 두고 장면 깊이를 그림(그림자 지도)으로 찍는다. 화면의 각 점이 그 깊이보다 멀면 그늘이다.',
      '방향 빛(해)은 직교 상자로 찍는다. 상자를 판 크기에 딱 맞게 줄일수록 같은 지도 크기에서 그림자가 또렷하다.',
      'PCF 는 가장자리 주변 지도를 여러 번 읽어 평균 낸다. shadow.radius 를 1 로 두면 또렷, 10 이면 부드럽다.',
      '자기 몸에 줄무늬(그림자 여드름)가 생기면 bias 를 조금 음수로, normalBias 를 조금 양수로 민다.',
    ],
    when: ['물체가 바닥에서 떠 보이는 것을 막을 때', '해 방향 · 시간 흐름을 보여 줄 때', '판 게임에서 말 위치를 또렷하게'],
    avoid: ['폰에서 캐릭터 몇 개 발밑만 필요할 때 — 대신 접촉 그림자(i15)', '모든 빛에 그림자 — 그림자는 주광 하나만'],
    cost: 'medium',
    costNote: '그림자 켠 방향 빛 하나 = 장면을 한 번 더 그림 (지도 512² ~ 2048²). 게임들은 2048² 하나, 폰에서는 1024² 가 무난.',
    level: 2,
    must: [
      'renderer.shadowMap.enabled = true, 물체마다 castShadow · 바닥은 receiveShadow',
      '그림자 상자를 판 크기에 맞게 (견본 left/right/top/bottom ±2.2, near 0.5 · far 14)',
      'bias -0.0008 · normalBias 0.02 부터 — 줄무늬가 보이면 조금씩',
      '또렷한 그림자는 PCFShadowMap + radius 1, 부드러운 그림자는 radius 를 키운다 (견본 10)',
      '그림자는 해 하나에만',
    ],
    done: [
      '세 칸 — 없음 · 또렷하게 · 부드럽게 — 을 나란히 보면 둘째는 날 선 그림자, 셋째는 번진 그림자',
      '해가 돌면 캐릭터 · 쌓은 블록 · 공 그림자가 같이 돈다',
      '캐릭터 몸에 줄무늬 얼룩(그림자 여드름)이 없다',
      '「부드러움」 1 ~ 20 으로 가장자리 흐림이 바뀌고, 폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '해 그림자 — 상자 범위 · 줄무늬 막기 · 또렷/부드럽게',
      from: 'demos/demosLight.ts u17 build(mode) · withShadows() 를 정리',
      body: `import * as THREE from 'three';

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // radius 로 흐림을 조절할 수 있는 방식

const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); // 또렷하게는 1024, 부드럽게는 512 로도 충분
sun.shadow.radius = 1;              // 1 = 또렷한 만화 그림자, 10 = 부드럽게
sun.shadow.bias = -0.0008;          // 자기 몸 줄무늬 막기
sun.shadow.normalBias = 0.02;
// 그림자 찍는 상자를 판 크기에 딱 맞게 — 좁을수록 또렷하다
Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2, near: 0.5, far: 14 });
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// 그림자를 드리울 물체마다: mesh.castShadow = true;

function update(t: number): void {
  const a = t * 0.5; // 해가 둘레를 돈다
  sun.position.set(Math.cos(a) * 3, 4, Math.sin(a) * 3);
}`,
    },
    pitfalls: [
      { title: '그림자 상자를 너무 크게 잡으면 그림자가 뭉개진다', fix: '지도 한 장을 넓은 범위에 펴는 셈이다. 판 크기에 맞게 left/right/top/bottom 을 줄인다.' },
      { title: 'bias 를 0 으로 두면 물체 표면에 줄무늬가 생긴다', fix: 'bias 를 조금 음수(-0.0005 ~ -0.001), normalBias 를 조금 양수(0.02 ~ 0.03)로.' },
      { title: '위에서 내려다보는 툰 장면에 부드러운 그림자를 쓰면 흐리멍덩하다', fix: '빵빵 주차장은 PCFShadowMap 의 또렷한 그림자로 맞췄다.', seen: true },
      { title: '그림자 지도를 매 장면 안 그리게 하면 움직이는 그림자가 늦는다', fix: '속도를 위해 그림자 갱신을 건너뛰는 꾀는 고정 장면에만. 이 사이트는 움직이는 그림자 때문에 쓰지 않았다.', seen: true },
    ],
    prev: ['u14'],
    next: ['i15', 'i431'],
    refs: [
      { name: 'three.js 예제 — webgl_shadowmap', url: 'https://threejs.org/examples/#webgl_shadowmap' },
      { name: 'three.js 문서 — LightShadow', url: 'https://threejs.org/docs/#api/en/lights/shadows/LightShadow' },
    ],
  },

  i14: {
    id: 'i14',
    summary: '바닥 아래에서 본 장면을 한 장 더 그려 바닥에 붙여, 얼음 · 거울 · 젖은 바닥에 물체가 거꾸로 비치게 한다.',
    terms: [
      { en: 'Planar reflection', ko: '평평한 면에 비친 모습' },
      { en: 'three.js Reflector', ko: '거울 카메라로 렌더 타깃에 그려 붙여 주는 물체 (addons)' },
      { en: 'clipBias / textureWidth', ko: '거울 면 아래를 자르는 여유 · 비친 그림 해상도' },
    ],
    goal: '{target} 바닥에 Reflector 평면 반사를 넣어 물체가 {style} 느낌으로 거꾸로 비치게 해 줘.',
    targets: ['얼음 바닥 위 캐릭터 · 별', '거울 무대', '비 온 뒤 젖은 광장'],
    styles: ['반들반들 얼음', '맑은 거울', '옅게 비치는 젖은 바닥'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 에는 평면 반사 부품이 따로 없다 — 거울 위치에 카메라를 하나 더 두고 RenderTexture 로 그리거나, Reflection Probe(Box Projection) 로 흉내.',
      godot: 'Godot 은 SubViewport + Camera3D 로 거울 카메라를 만들어 바닥 재질에 붙이거나, ReflectionProbe 로 흉내.',
    },
    principle: [
      '바닥 면을 거울로 삼아 카메라를 면 아래로 뒤집은 자리에 하나 더 둔다.',
      '그 거울 카메라로 장면을 렌더 타깃(견본 512 × 512)에 그리고, 그 그림을 바닥에 화면 좌표로 붙인다.',
      '면 아래에 있는 것까지 비치면 이상하므로 clipBias 로 면 근처를 잘라 낸다 (견본 0.003).',
      '거울만 있으면 너무 맑다. 위에 반투명 얇은 막(opacity 0.38)을 덮어 얼음 빛깔을 낸다.',
    ],
    when: ['얼음 · 거울 · 대리석처럼 평평한 바닥 하나가 주인공일 때', '물웅덩이 · 젖은 광장에 등불이 비치는 장면'],
    avoid: ['울퉁불퉁하거나 여러 방향의 면 — 대신 환경 반사(u12)', '물결치는 물 — 대신 하늘색 반사를 셰이더로(u22)', '폰에서 거울이 여럿 — 거울 하나마다 장면을 한 번 더 그린다'],
    cost: 'heavy',
    costNote: '거울 하나 = 장면 한 번 더 그리기 (512² 타깃). 물체가 많은 장면이면 그리기 호출이 두 배가 된다. 폰은 256² 로.',
    level: 2,
    must: [
      'Reflector 는 three/examples/jsm/objects/Reflector.js 에서, 평면 모양(CircleGeometry 등)으로',
      'textureWidth · textureHeight 512 (폰 256), clipBias 0.003',
      '거울 위에 반투명 막(MeshStandardMaterial opacity 0.38, y +0.004)을 덮어 빛깔 · 흐림을 낸다',
      '거울은 장면에 하나만, 끝나면 reflector.dispose()',
    ],
    done: [
      '왼쪽 그냥 얼음 · 오른쪽 거울 얼음을 나란히 두면 오른쪽 바닥에 별 · 펭귄 · 눈사람이 거꾸로 비친다',
      '별이 통통 뛰면 비친 별도 바닥에서 멀어졌다 가까워진다',
      '카메라가 살짝 돌아도 비친 모습이 어긋나지 않는다',
      '거울 끄고 켜기로 그리기 호출 수가 약 두 배가 되는 것을 확인 (폰에서 30fps 아래로 떨어지면 해상도를 낮춘다)',
    ],
    code: {
      lang: 'ts',
      title: 'Reflector 얼음 바닥 + 얼음빛 막',
      from: 'demos/demosLight.ts i14 build(true) 를 정리',
      body: `import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

// 거울 바닥 — 아래 거울 카메라로 512² 에 그려 붙인다
const refl = new Reflector(new THREE.CircleGeometry(2.4, 64), {
  textureWidth: 512,
  textureHeight: 512,
  color: 0xa8c4dc,   // 비친 그림에 곱하는 색 (얼음빛)
  clipBias: 0.003,   // 면 아래 것이 비치지 않게
});
refl.rotation.x = -Math.PI / 2;
scene.add(refl);

// 맑은 거울 위에 반투명 얇은 막 — 얼음 빛깔 · 살짝 흐린 느낌
const film = new THREE.Mesh(
  new THREE.CircleGeometry(2.4, 64),
  new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.2, transparent: true, opacity: 0.38 }),
);
film.rotation.x = -Math.PI / 2;
film.position.y = 0.004; // 거울과 겹쳐 깜빡이지 않게 조금 위
scene.add(film);

// 정리: refl.dispose();`,
    },
    pitfalls: [
      { title: '막을 거울과 같은 높이에 두면 깜빡인다', fix: '두 면이 같은 깊이라 서로 이긴다. 막을 조금(0.004) 올린다.' },
      { title: '거울을 여러 개 두면 프레임이 반 토막 난다', fix: '거울 하나마다 장면을 한 번 더 그린다. 장면에 하나, 폰은 해상도를 256 으로.' },
      { title: '물결 있는 물에 Reflector 를 쓰면 판유리처럼 보인다', fix: '평면 반사는 평평한 면 전용. 물은 셰이더에서 하늘색 반사(u22)로.' },
    ],
    prev: ['u12'],
    next: ['i434', 'u22'],
    refs: [
      { name: 'three.js 예제 — webgl_mirror', url: 'https://threejs.org/examples/#webgl_mirror' },
      { name: 'three.js 소스 — Reflector', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Reflector.js' },
    ],
  },

  i15: {
    id: 'i15',
    summary: '바닥 아래에서 위로 깊이를 한 장 찍어 두 번 흐려 바닥에 깔아, 발밑에 부드러운 그림자가 생기고 높이 뛰면 옅어지게 한다.',
    terms: [
      { en: 'Contact shadow (baked depth shadow)', ko: '닿은 곳 그림자 — 아래에서 찍은 깊이를 흐린 판' },
      { en: 'OrthographicCamera from below', ko: '바닥에서 위를 보는 직교 카메라' },
      { en: 'MeshDepthMaterial + onBeforeCompile', ko: '깊이를 검은색 투명도로 바꿔 찍기' },
      { en: 'HorizontalBlurShader / VerticalBlurShader', ko: '가로 · 세로 두 번 흐리기' },
    ],
    goal: '{target} 발밑에 접촉 그림자(아래에서 찍어 흐린 판)를 깔아 {style} 느낌으로 바닥에 붙어 보이게 해 줘.',
    targets: ['뛰는 캐릭터 셋', '판 위 게임 말', '진열대 위 상품'],
    styles: ['부드러운 스튜디오 사진', '파스텔 장난감', '폰에서 가볍게'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 Decal Projector 에 흐린 그림자 그림을 붙여 블롭 그림자로 흉내 낸다.',
      godot: 'Godot 은 Decal 노드에 흐린 원 그림을 붙여 발밑 그림자로.',
    },
    principle: [
      '바닥 바로 위에 직교 카메라를 두고 위를 보게 해, 장면을 깊이로 찍는다 (견본 판 5 × 5, 높이 1.4 까지).',
      '깊이 재질을 고쳐 「가까울수록 진한 검정」 투명도로 찍는다 — 바닥에 닿은 곳일수록 진하다.',
      '그 그림을 가로 · 세로로 두 번 흐린다 (세기 3.5 와 그 0.4배). 그러면 높이 뜬 것일수록 넓고 옅게 번진다.',
      '흐린 그림을 바닥 판에 붙여 반투명(0.85)으로 깐다. 그림자 지도 없이 바닥 한 장으로 끝난다.',
    ],
    when: ['폰에서 그림자 지도 없이 「붙어 있는 느낌」만 필요할 때', '캐릭터 · 말이 바닥에 떠 보일 때', '해 방향이 중요하지 않은 진열 · 메뉴 화면'],
    avoid: ['해 방향 · 긴 그림자가 보여야 할 때 — 대신 그림자 지도(u17)', '물체가 넓은 판 전체에 흩어진 큰 장면 — 판 해상도가 모자란다'],
    cost: 'light',
    costNote: '512² 깊이 한 장 + 흐리기 4번(가로 · 세로 × 2). 그림자 지도(장면 다시 그리기 + 비교)보다 가볍다. 움직임이 없으면 다시 찍지 않아도 된다.',
    level: 2,
    must: [
      '찍을 때 장면 배경을 null · 바닥과 그림자 판은 숨기고 overrideMaterial 로 깊이 재질 — 끝나면 모두 되돌리기',
      '깊이 재질은 gl_FragColor 를 vec4(vec3(0.0), (1.0 - fragCoordZ) * darkness) 로 (견본 진하기 1.4)',
      '흐리기는 가로 · 세로 두 렌더 타깃을 오가며 두 번 (세기 / 256)',
      '그림자 판은 scale.y = -1 (아래서 찍어 뒤집힘), depthWrite false, renderOrder 1, 바닥보다 0.002 위',
      '클리어 색을 투명(0x000000, 0)으로 바꿨다 되돌리기',
    ],
    done: [
      '왼쪽 그림자 없음 · 오른쪽 접촉 그림자를 나란히 두면, 오른쪽 캐릭터만 바닥에 서 있어 보인다',
      '캐릭터가 높이 뛸수록 발밑 그림자가 넓어지고 옅어진다',
      '「흐림」 0 ~ 10 · 「진하기」 0.2 ~ 3 슬라이더로 바로 바뀐다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '아래에서 깊이 찍기 → 흐리기 → 바닥에 깔기',
      from: 'demos/demosLight.ts i15 make() 를 정리 (three.js contact shadows 예제 방식)',
      body: `import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

const SW = 5, CH = 1.4; // 판 크기 · 찍는 높이
const rt = new THREE.WebGLRenderTarget(512, 512), rtB = new THREE.WebGLRenderTarget(512, 512);
const group = new THREE.Group();
group.position.y = 0.002;
const planeGeo = new THREE.PlaneGeometry(SW, SW).rotateX(Math.PI / 2);
const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: rt.texture, opacity: 0.85, transparent: true, depthWrite: false }));
plane.renderOrder = 1;
plane.scale.y = -1; // 아래에서 찍어 뒤집힌 그림
const blurPlane = new THREE.Mesh(planeGeo);
blurPlane.visible = false;
const shadowCam = new THREE.OrthographicCamera(-SW / 2, SW / 2, SW / 2, -SW / 2, 0, CH);
shadowCam.rotation.x = Math.PI / 2; // 위를 본다
group.add(plane, blurPlane, shadowCam);
scene.add(group);

// 깊이 → 가까울수록 진한 검정 투명도
const dark = { value: 1.4 };
const depthM = new THREE.MeshDepthMaterial();
depthM.onBeforeCompile = (sh) => {
  sh.uniforms['darkness'] = dark;
  sh.fragmentShader = 'uniform float darkness;' + sh.fragmentShader.replace(
    'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
    'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );');
};
const hB = new THREE.ShaderMaterial(HorizontalBlurShader), vB = new THREE.ShaderMaterial(VerticalBlurShader);
function blurOnce(amount: number): void {
  blurPlane.visible = true;
  blurPlane.material = hB; hB.uniforms['tDiffuse']!.value = rt.texture; hB.uniforms['h']!.value = amount / 256;
  renderer.setRenderTarget(rtB); renderer.render(blurPlane, shadowCam);
  blurPlane.material = vB; vB.uniforms['tDiffuse']!.value = rtB.texture; vB.uniforms['v']!.value = amount / 256;
  renderer.setRenderTarget(rt); renderer.render(blurPlane, shadowCam);
  blurPlane.visible = false;
}
// 매 장면: 배경 null · 바닥/판 숨김 · scene.overrideMaterial = depthM · 투명 클리어 → rt 에 render
// → overrideMaterial = null → blurOnce(3.5) → blurOnce(3.5 * 0.4) → 모두 되돌리고 본 장면 그리기`,
    },
    pitfalls: [
      { title: '찍을 때 바닥을 숨기지 않으면 판 전체가 까맣다', fix: '바닥도 「가까운 것」으로 찍힌다. 찍는 동안 바닥 · 그림자 판 · 배경을 숨긴다.' },
      { title: '클리어 색을 되돌리지 않으면 다음 장면 배경이 투명해진다', fix: 'getClearColor · getClearAlpha 로 저장했다가 끝에 setClearColor 로 되돌린다.' },
      { title: '판을 뒤집지 않으면 그림자가 좌우가 바뀐 자리에 생긴다', fix: '아래에서 찍었으니 plane.scale.y = -1.' },
    ],
    prev: ['u17'],
    next: ['i537'],
    refs: [
      { name: 'three.js 예제 — webgl_shadow_contact', url: 'https://threejs.org/examples/#webgl_shadow_contact' },
    ],
  },
  i224: {
    id: 'i224',
    summary: '레일리 · 미 산란 하늘(three Sky)에 해 높이 하나를 넣어, 낮 파랑 → 노을 → 땅거미 → 별 · 은하수 밤이 저절로 이어지게 한다.',
    terms: [
      { en: 'Atmospheric scattering sky (Preetham model)', ko: '공기 알갱이가 햇빛을 흩뜨려 생기는 하늘색' },
      { en: 'three.js Sky (addons)', ko: 'turbidity · rayleigh · mieCoefficient · sunPosition 으로 그리는 하늘 셰이더' },
      { en: 'Rayleigh / Mie scattering', ko: '작은 알갱이가 파랑을 흩뜨림 / 먼지가 해 둘레를 하얗게' },
      { en: 'Aerial perspective', ko: '먼 산일수록 그 방향 하늘색에 묻히는 공기 원근' },
    ],
    goal: '{target}에 three Sky 산란 하늘을 깔고 해 높이 하나로 {style}까지 하늘 · 빛 · 별이 함께 바뀌게 해 줘.',
    targets: ['산맥 풍경', '들판 위 작은 마을', '시간을 고르는 게임 배경'],
    styles: ['낮 → 노을 → 밤', '붉은 노을 한 장면', '별 가득한 밤'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Skybox/Procedural 셰이더 스카이박스 + Directional Light 를 Sun Source 로 (Lighting 창).',
      godot: 'Godot 은 WorldEnvironment 의 Sky 에 PhysicalSkyMaterial(rayleigh · mie) 또는 ProceduralSkyMaterial, 해는 DirectionalLight3D.',
    },
    principle: [
      'Sky 는 커다란 상자 안쪽에 산란 하늘을 그리는 셰이더다. 해 방향(sunPosition) 하나만 넣으면 하늘색이 계산된다.',
      '레일리(작은 공기 분자)는 파랑을 많이 흩뜨려 낮 하늘이 파랗고, 해가 낮으면 빛이 공기를 길게 지나 붉은 노을이 된다.',
      '해 높이(°)로 해빛 색 · 세기, 하늘에서 오는 빛, 별 · 은하수 · 달 밝기를 함께 움직인다 — 하늘만 바뀌고 땅이 그대로면 어색하다.',
      '먼 산은 그 방향 하늘색으로 녹아들게 한다(공기 원근). 하늘을 작은 큐브(64px)에 구워 산 셰이더가 읽는다.',
    ],
    when: ['시간 흐름 · 해 고도를 보여 주는 장면', '넓은 바깥 풍경의 배경 하늘', '노을 · 밤을 한 장면에서 오가야 할 때'],
    avoid: ['그림책 · 툰 하늘 — 대신 그린 배경이나 그러데이션 하늘(i431 의 셰이더 하늘)', '실내 · 동굴'],
    cost: 'medium',
    costNote: '하늘 셰이더는 화면 픽셀마다 산란 계산. 공기 원근용 큐브(64² × 6면)를 매 장면 굽고, 별 1만 1천 점 · 산 4겹 · 나무 900 인스턴스.',
    level: 2,
    must: [
      'Sky 는 three/examples/jsm/objects/Sky.js, scale 15000 · 카메라 far 30000',
      '시작 값 turbidity 8 · rayleigh 2.4 · mieCoefficient 0.005 · mieDirectionalG 0.8',
      '해 높이(elev, °) 하나로 하늘 · 해빛 색 · 세기 · 하늘빛 · 별 · 달 밝기를 함께 (smoothstep 구간으로)',
      'ACESFilmic 톤 매핑 + 노출 낮게(견본 0.34) — 산란 하늘은 아주 밝은 값을 낸다',
      '공기 원근용 하늘 큐브에는 해 원반을 빼고 굽는다 (showSunDisc 0 → 굽고 → 1)',
    ],
    done: [
      '해가 저절로 오르내리면 하늘이 낮 파랑 → 지평선 노을 → 땅거미 남색 → 별 · 은하수 · 달빛 밤으로 이어진다',
      '해가 낮을수록 산이 붉게 물들고, 지평선 아래면 해빛이 0 이 되고 달빛 푸른빛만 남는다',
      '먼 산일수록 하늘색에 묻혀 흐려진다 — 「공기 원근」 슬라이더로 정도가 바뀐다',
      '「탁함」 · 「레일리」 슬라이더로 하늘이 뿌옇게 · 더 파랗게 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: 'three Sky + 해 높이 하나로 하늘과 빛 함께',
      from: 'demos/demosLook2.ts makeSky() 의 하늘 설정 · update 를 정리',
      body: `import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const sky = new Sky();
sky.scale.setScalar(15000);
scene.add(sky);
const su = sky.material.uniforms;
su['turbidity']!.value = 8;        // 먼지 (뿌연 정도)
su['rayleigh']!.value = 2.4;       // 파란 산란
su['mieCoefficient']!.value = 0.005;
su['mieDirectionalG']!.value = 0.8;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.34; // 산란 하늘은 밝은 값을 내니 노출을 낮게

const sunDir = new THREE.Vector3();
const sunCol = new THREE.Color();
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function update(t: number): void {
  const elev = -9 + 47 * (0.5 + 0.5 * Math.cos(t * 0.26)); // 해 높이 -9° ~ 38°
  const phi = THREE.MathUtils.degToRad(90 - elev);
  // 낮게 뜨면 앞쪽(산 뒤 노을), 높이 뜨면 옆 뒤로
  sunDir.setFromSphericalCoords(1, phi, THREE.MathUtils.degToRad(lerp(-150, -75, smooth(6, 30, elev))));
  su['sunPosition']!.value.copy(sunDir);
  // 해빛: 낮을수록 붉게, 지평선 아래면 0 — 땅 · 산 재질도 같은 값을 받는다
  sunCol.setRGB(1, lerp(0.42, 0.96, smooth(0, 25, elev)), lerp(0.18, 0.9, smooth(0, 30, elev)));
  sunCol.multiplyScalar(9 * smooth(-2, 6, elev));
  const nightK = 1 - smooth(-7, 2, elev);   // 은하수 · 달빛 세기
  const starK = 1 - smooth(-8, 1, elev);    // 별 밝기
  // sun.color.copy(sunCol) · 별/은하수 재질 uK = nightK · starK …
}`,
    },
    pitfalls: [
      { title: '공기 원근 큐브에 해 원반까지 구우면 산 한쪽이 깜빡인다', fix: '64px 큐브에 수만 배 밝은 해 원반이 들어가 흐린 밉이 하얗게 번졌다. 굽는 동안만 showSunDisc 를 0 으로.', seen: true },
      { title: '해 쪽 하늘색을 그대로 안개 색으로 쓰면 해 쪽 들판이 하얗게 덮인다', fix: '해 쪽 하늘은 다른 곳보다 수십 배 밝다. 머리 위 하늘 밝기의 2.2배까지만 쓰도록 눌렀다.', seen: true },
      { title: '하늘만 바꾸고 해빛 색 · 세기를 그대로 두면 노을인데 땅이 한낮이다', fix: '해 높이 하나로 하늘 · 해빛 · 하늘빛 · 별을 모두 움직인다.' },
      { title: '톤 매핑 없이 쓰면 하늘이 하얗게 날아간다', fix: '산란 하늘은 1 을 넘는 값을 낸다. ACESFilmic + 노출을 낮게.' },
    ],
    prev: ['u14', 'u12'],
    next: ['i431', 'i523'],
    refs: [
      { name: 'three.js 예제 — webgl_shaders_sky', url: 'https://threejs.org/examples/#webgl_shaders_sky' },
      { name: 'three.js 소스 — Sky', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/objects/Sky.js' },
    ],
  },

  i225: {
    id: 'i225',
    summary: '잡음(fbm)을 문턱으로 잘라 구름 모양을 만들고 해 쪽으로 한 번 더 읽어 명암을 넣어, 몽실몽실 흘러가는 구름 두 겹을 그린다.',
    terms: [
      { en: 'Procedural clouds (fbm threshold)', ko: '겹친 잡음을 문턱으로 잘라 만든 구름' },
      { en: 'Fractal Brownian motion (fbm)', ko: '크기가 반씩 작은 잡음 5겹을 더한 것' },
      { en: 'Directional derivative lighting', ko: '해 쪽으로 조금 옮긴 밀도와의 차로 밝음 · 그늘' },
      { en: 'Full-screen quad shader', ko: '화면을 덮는 사각형 하나에 그리는 셰이더' },
    ],
    goal: '{target}에 fbm 문턱으로 만든 뭉게구름 두 겹을 그려 줘 — 해 쪽은 밝고 아래는 그늘, 바람에 흘러가게. 그림체는 {style}.',
    targets: ['메뉴 · 시작 화면 하늘', '하늘에 뜬 섬 게임 배경', '2D 달리기 게임 하늘'],
    styles: ['부드러운 그림책', '툰 3단 명암 · 또렷한 테', '노을 빛 하늘'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 의 Simple Noise · Gradient Noise 를 여러 번 더해 Step/Smoothstep 으로 자른다 (전체 화면 Quad 나 UI Image 재질).',
      godot: 'Godot 은 canvas_item 셰이더에서 같은 fbm 을 쓰거나 NoiseTexture2D(FastNoiseLite) 를 읽어 smoothstep 으로.',
    },
    principle: [
      '잡음 5겹(fbm)을 더하면 크고 작은 덩어리가 섞인 값이 나온다. 그 값에서 문턱(구름 양, 견본 0.56)을 빼고 0 보다 큰 곳만 구름이다.',
      '해 쪽으로 조금(0.12) 옮긴 자리의 밀도를 한 번 더 읽어 차를 본다. 해 쪽이 옅으면 그 면은 빛을 받아 밝다.',
      '가장자리 얇은 곳에 따뜻한 빛 테(rim)를 더해 햇살이 비치는 느낌을 준다.',
      '먼 구름은 작게 · 느리게(0.05), 가까운 구름은 크게 · 빠르게(0.16) 흘려 깊이를 낸다. 툰 모드는 명암을 3단(1 · 0.6 · 0.25)으로 끊는다.',
    ],
    when: ['그림 파일 없이 움직이는 하늘이 필요할 때', '메뉴 배경처럼 화면 전체를 덮는 하늘', '툰 장면에 어울리는 또렷한 구름'],
    avoid: ['구름 사이를 날아다니는 3D 장면 — 대신 부피 렌더(i524 같은 레이마칭)', '폰에서 화면 전체를 고해상도로 — 픽셀 비율을 낮추거나 잡음을 텍스처로'],
    cost: 'medium',
    costNote: '픽셀마다 fbm(잡음 5번)을 겹 하나에 두 번, 두 겹이라 잡음 약 20번. 폰 전체 화면이면 무겁다 — 미리 구운 잡음 텍스처로 바꾸면 가볍다.',
    level: 2,
    must: [
      '구름 양은 문턱 하나(uCover 0.35 ~ 0.75)로, 바람은 시간 × 빠르기로 잡음 좌표를 민다',
      '명암은 해 쪽으로 옮긴 밀도와의 차: light = clamp(0.55 + (d - d2) * 5.0, 0, 1)',
      '먼 겹 · 가까운 겹 두 장, 크기 · 빠르기를 다르게 (먼 겹은 위쪽에만)',
      '화면 비율(uRes)을 넣어 구름이 가로로 늘어나지 않게',
      '잡음 반복문 셰이더가 첫 컴파일에 오래 걸리면 잡음을 텍스처로 미리 굽는다',
    ],
    done: [
      '하늘에 크고 작은 뭉게구름이 흘러가고, 해 쪽 면은 밝고 반대쪽 · 아래는 푸르스름한 그늘이다',
      '「구름 양」 슬라이더로 맑은 하늘 ↔ 거의 덮인 하늘이 된다',
      '「툰 구름」을 켜면 명암이 3단으로 끊기고 테가 또렷해진다',
      '먼 구름은 느리게, 가까운 구름은 빠르게 흘러 깊이가 느껴진다',
    ],
    code: {
      lang: 'glsl',
      title: 'fbm 문턱 구름 한 겹 (해 쪽 명암 · 빛 테 · 툰 3단)',
      from: 'demos/demosLook2.ts makeClouds() 의 조각 셰이더를 정리',
      body: `// noise() · fbm(5겹) 은 이 위에 (값 잡음 + smoothstep 보간)
uniform float uTime, uCover, uSpeed, uToon;
float dens(vec2 p, float cover){
  float d = fbm(p) * 0.85 + noise(p * 0.5) * 0.35;
  return d - cover;                       // 0 보다 크면 구름
}
vec4 layer(vec2 p, float cover, vec2 sunDir, vec3 lit, vec3 shade, float soft){
  float d = dens(p, cover);
  float a = smoothstep(0.0, soft, d);     // 가장자리 부드럽게
  float d2 = dens(p + sunDir * 0.12, cover);
  float light = clamp(0.55 + (d - d2) * 5.0, 0.0, 1.0); // 해 쪽이 옅으면 밝다
  float rim = smoothstep(soft * 2.5, 0.0, d) * a;        // 얇은 가장자리 빛 테
  if (uToon > 0.5){
    light = light > 0.62 ? 1.0 : (light > 0.35 ? 0.6 : 0.25);
    a = step(0.02, d);
    rim = step(d, 0.045) * a;
  }
  vec3 c = mix(shade, lit, light) + rim * vec3(1.0, 0.92, 0.8) * 0.35;
  return vec4(c, a * 0.85);
}
// main(): t = uTime * uSpeed
//  먼 겹  layer(p * vec2(3.6, 6.0) + vec2(t * 0.05, 3.0), uCover + 0.06, …, soft 0.08)
//  가까운 layer(p * vec2(1.7, 2.6) + vec2(t * 0.16, 0.0), uCover + 0.08 - shapeY * 0.18, …, soft 0.06)
//  col = mix(sky, far.rgb, far.a);  col = mix(col, near.rgb, near.a);`,
    },
    pitfalls: [
      { title: '반복문 잡음을 셰이더 여러 곳에서 부르면 첫 컴파일에 수십 초 멈춘다', fix: '보물 동굴에서 윈도 D3D 컴파일이 17~20초 걸렸다. 잡음은 미리 구운 텍스처로 읽고, 값은 uniform 으로.', seen: true },
      { title: '화면 비율을 안 넣으면 구름이 가로로 늘어난다', fix: 'p = vec2(uv.x * 가로/세로, uv.y) 로 좌표를 맞춘다.' },
      { title: '문턱 없이 잡음을 그대로 칠하면 구름이 아니라 얼룩 안개가 된다', fix: '밀도 - 문턱 이 0 보다 큰 곳만, smoothstep 으로 가장자리를 다듬는다.' },
    ],
    prev: ['u54'],
    next: ['i224', 'i431'],
    refs: [
      { name: 'The Book of Shaders — Fractal Brownian Motion', url: 'https://thebookofshaders.com/13/' },
      { name: 'Inigo Quilez — fbm', url: 'https://iquilezles.org/articles/fbm/' },
    ],
  },

  i431: {
    id: 'i431',
    summary: '시각(0~24시) 하나로 해 방향을 정하고, 빛 색 · 세기 · 그림자 길이 · 하늘색 · 창 불빛을 함께 바꿔 하루가 흐르게 한다.',
    terms: [
      { en: 'Day-night cycle', ko: '하루 시간 흐름 (해가 뜨고 짐)' },
      { en: 'Sun elevation driven lighting', ko: '해 높이 하나로 모든 빛 값 정하기' },
      { en: 'Color keyframes (night · dusk · day)', ko: '밤 · 노을 · 낮 세 묶음 색 사이 섞기' },
    ],
    goal: '{target}에 하루 시간 흐름을 넣어 줘 — 시각 하나로 해 · 하늘색 · 그림자 · 불빛이 함께 {style}로 바뀌게.',
    targets: ['작은 마을 장면', '농장 · 정원 게임 판', '그림자 길이를 배우는 체험'],
    styles: ['아침 → 낮 → 노을 → 밤', '따뜻한 노을 위주', '달빛 푸른 밤 위주'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Directional Light 를 시각에 맞춰 돌리고 Gradient 로 색 · RenderSettings.ambientSkyColor 를 바꾼다.',
      godot: 'Godot 은 DirectionalLight3D 회전 + Environment 의 ambient · ProceduralSkyMaterial 색을 스크립트로 (또는 AnimationPlayer).',
    },
    principle: [
      '시각을 각도로 바꿔 해 방향을 정한다: a = (시각 - 6) / 24 × 2π, 방향 = (cos a, sin a × 0.9, -1.1) 정규화. 6시에 뜨고 18시에 진다.',
      '해 높이(방향의 y)로 색 묶음 세 개(밤 · 노을 · 낮) 사이를 섞는다 — 하늘 위 · 지평선 · 반구 빛 · 땅 색 모두.',
      '해가 낮으면 빛이 주황으로, 높으면 하얗게. 지평선 아래로 가면 같은 빛을 반대편에 두고 달빛(푸른색, 세기 0.45)으로 바꾼다.',
      '어두워질수록(night) 창 · 가로등 빛을 켠다 — 빛 하나 더 넣지 않고 발광 세기만 올린다.',
    ],
    when: ['시간 · 그림자 길이를 보여 주는 장면', '하루가 흐르는 생활 · 농장 게임', '같은 장면을 아침 · 밤 두 분위기로'],
    avoid: ['실제 산란 하늘이 필요할 때 — 대신 대기 산란 하늘(i224)', '시간과 상관없는 퍼즐 판 — 고정 조명이 낫다'],
    cost: 'medium',
    costNote: '빛 값만 바꾸므로 셰이더는 그대로. 그림자 지도 1024² 한 장 (해 · 달 같은 빛을 돌려 씀) + 가로등 빛무리 스프라이트.',
    level: 2,
    must: [
      '해 · 달은 같은 방향 빛 하나를 돌려 쓴다 (빛 개수가 바뀌면 셰이더를 다시 굽는다)',
      '색은 묶음 셋(night · dusk · day) 사이 smoothstep 섞기 — 해 높이 -0.28 ~ 0 은 밤→노을, 0.02 ~ 0.32 는 노을→낮',
      '해빛 세기 = 3.0 × smoothstep(-0.03, 0.22, 높이), 지평선 아래면 달빛 0.45',
      '창 · 가로등은 발광 세기만 (night × 2.2 · 0.3 + night × 3), 빛무리 스프라이트 투명도도 night',
      '시간은 dt 로 흐르게 (프레임 수가 아니라) — 느린 폰에서도 같은 빠르기',
    ],
    done: [
      '시계 표시가 흐르며 새벽 → 아침 → 낮 → 노을 → 밤 순서로 하늘 · 빛이 바뀐다',
      '낮에는 그림자가 짧고, 노을 무렵 길어지며 주황빛이 된다',
      '밤이 되면 하늘에 별 · 달이 보이고 창 · 가로등이 켜진다',
      '「시각」 슬라이더로 원하는 시간에 멈추고, 「빠르기」로 흐름을 바꾼다',
    ],
    code: {
      lang: 'ts',
      title: '시각 하나 → 해 방향 · 색 · 세기 · 불빛',
      from: 'demos/demosCamLight.ts demoDay() · SKY_KEYS · skyMix() 를 정리',
      body: `import * as THREE from 'three';

const C = (h: number): THREE.Color => new THREE.Color(h);
const KEYS = {
  night: { top: C(0x060b26), hor: C(0x1a2552), hemi: C(0x27335e), gnd: C(0x0c0f1c) },
  dusk: { top: C(0x3a3f80), hor: C(0xff9a5c), hemi: C(0xf2a88a), gnd: C(0x4a3a40) },
  day: { top: C(0x3b8ee6), hor: C(0xcbe7ff), hemi: C(0xcfe6ff), gnd: C(0x6a5a40) },
};
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function skyMix(el: number, key: 'top' | 'hor' | 'hemi' | 'gnd', out: THREE.Color): THREE.Color {
  if (el < 0) return out.copy(KEYS.night[key]).lerp(KEYS.dusk[key], sstep(-0.28, 0, el));
  return out.copy(KEYS.dusk[key]).lerp(KEYS.day[key], sstep(0.02, 0.32, el));
}
const warm = C(0xff8a4a), noon = C(0xfff4e0), moonC = C(0x8fa8ff);
const dir = new THREE.Vector3();
let hour = 5;

function update(dt: number, speed = 2): void {
  hour = (hour + Math.min(dt, 0.05) * speed) % 24;           // 1초에 2시간
  const a = ((hour - 6) / 24) * Math.PI * 2;                 // 6시 해돋이 · 18시 해넘이
  dir.set(Math.cos(a), Math.sin(a) * 0.9, -1.1).normalize();
  const el = dir.y;
  if (el > -0.03) {                                          // 해
    sun.position.copy(dir).multiplyScalar(20);
    sun.color.copy(warm).lerp(noon, sstep(0.0, 0.45, el));
    sun.intensity = 3.0 * sstep(-0.03, 0.22, el);
  } else {                                                   // 같은 빛을 달로
    sun.position.copy(dir).multiplyScalar(-20);
    sun.color.copy(moonC);
    sun.intensity = 0.45 * sstep(-0.03, -0.2, el);
  }
  skyMix(el, 'hemi', hemi.color);
  skyMix(el, 'gnd', hemi.groundColor);
  hemi.intensity = 0.3 + (1.1 - 0.3) * sstep(-0.2, 0.3, el);
  const night = sstep(0.08, -0.08, el);
  winMat.emissiveIntensity = night * 2.2;                    // 창 불빛
  lampMat.emissiveIntensity = 0.3 + night * 3;               // 가로등
}`,
    },
    pitfalls: [
      { title: '해 · 달을 따로 빛 두 개로 두고 켜고 끄면 넘어가는 순간 멈칫한다', fix: '빛 개수가 바뀌면 재질 셰이더가 다시 컴파일된다. 같은 방향 빛 하나를 반대편으로 옮겨 달로 쓴다.', seen: true },
      { title: '프레임마다 고정 값만큼 시간을 더하면 느린 폰에서 하루가 느리게 간다', fix: '실제 dt 로 더한다 (견본은 0.05 로 잘라 튀는 프레임만 막음).', seen: true },
      { title: '하늘색만 바꾸고 반구 빛 색을 그대로 두면 땅이 하늘과 따로 논다', fix: '하늘 위 · 지평선 · 반구 · 땅 색을 같은 해 높이로 함께 섞는다.' },
    ],
    prev: ['u17', 'u14'],
    next: ['i432', 'i224'],
  },

  i432: {
    id: 'i432',
    summary: '장면 전체를 아주 어둡게 깔고 켜진 창 · 가로등 · 반딧불만 밝게 해, 어둠과 빛의 대비로 밤 분위기를 만든다.',
    terms: [
      { en: 'Night scene lighting (high contrast)', ko: '어둠 속 빛만 밝은 밤 조명' },
      { en: 'Emissive windows + glow sprites', ko: '스스로 빛나는 창 재질 + 빛무리 스프라이트' },
      { en: 'Fake light pool (additive decal)', ko: '바닥 빛 웅덩이를 더하기 판으로 흉내' },
      { en: 'Moonlight (cool directional light)', ko: '약한 푸른 방향 빛 하나' },
    ],
    goal: '{target}을(를) {style} 밤 장면으로 바꿔 줘 — 전체는 어둡게, 켜진 창 · 등만 밝게 대비를 주인공으로.',
    targets: ['작은 마을', '버섯 집 · 동화 마을', '밤 캠핑장'],
    styles: ['따뜻한 등불 밤', '푸른 달밤', '반딧불 숲'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Emission 재질 + URP Bloom, 바닥 빛은 Point Light 몇 개 또는 Decal.',
      godot: 'Godot 은 StandardMaterial3D 의 emission + Environment Glow, 등불은 OmniLight3D 몇 개.',
    },
    principle: [
      '밤을 「다 어둡게」 하면 아무것도 안 보인다. 바탕(반구 0.32 · 달빛 0.45)은 아주 어둡게, 빛나는 것만 밝게 해야 밤처럼 보인다.',
      '창은 발광 재질 세기만 올리고, 둘레에 더하기 섞기 빛무리 스프라이트를 겹쳐 번지는 빛을 흉내 낸다.',
      '가로등 바닥 빛은 진짜 빛 대신 바닥에 둥근 빛 그림(더하기, 0.45)을 깐다. 진짜 점광은 앞쪽 3개만.',
      '창이 하나씩 켜지는 순서를 섞고 처음 0.28초는 깜빡이게 해 사람이 사는 느낌을 준다.',
    ],
    when: ['밤 마을 · 숲 · 버섯 마을 같은 무대', '불 켜기 · 끄기가 놀이인 퍼즐 (켜진 것이 잘 보여야 함)', '반딧불 · 등불 연출'],
    avoid: ['낮 장면을 그냥 어둡게만 — 그러면 흐릿한 회색이 된다. 대비가 핵심', '점광을 등마다 하나씩 — 대신 바닥 빛 판 + 점광 몇 개'],
    cost: 'medium',
    costNote: '진짜 점광 3개(그림자 없음) + 빛무리 스프라이트 · 바닥 빛 판(더하기) + 반딧불 46점. 점광을 등 수만큼 늘리면 무거워진다.',
    level: 2,
    must: [
      '바탕은 어둡게: 반구 0x2a3766 / 0x0a0c18 세기 0.32, 달빛 0x8aa6ff 세기 0.45',
      '빛나는 것은 발광 세기(창 2.6) + 빛무리 스프라이트(AdditiveBlending · depthWrite false)',
      '가로등 바닥 빛은 바닥 위 판(y 0.1, 크기 3.2, 투명도 0.45)으로, 진짜 점광은 3개까지',
      '대비 끔(비교용)은 반구 1.6 으로 고르게 — 켬/끔을 나란히 확인할 것',
      '빛 번짐은 문턱을 높게 — 켜진 것만 번지고 나머지는 또렷하게',
    ],
    done: [
      '마을이 짙은 남색으로 어둡고 창 · 가로등만 주황으로 또렷이 빛난다',
      '창이 하나씩 차례로 깜빡이며 켜지고, 8초마다 꺼졌다 다시 켜진다',
      '「대비」를 끄면 전체가 고르게 어두운 회색이 되어 밤 느낌이 사라진다 (켬과 비교)',
      '반딧불이 떠다니며 반짝이고, 폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '어두운 바탕 + 창 발광 · 빛무리 + 바닥 빛 판',
      from: 'demos/demosCamLight.ts demoNight() 를 정리',
      body: `import * as THREE from 'three';

// 1) 바탕은 아주 어둡게 — 달빛 하나
hemi.color.set(0x2a3766);
hemi.groundColor.set(0x0a0c18);
hemi.intensity = 0.32;
sun.color.set(0x8aa6ff);
sun.intensity = 0.45;

const warm = 0xffb35a;
const glow = glowTex(); // 가운데가 하얗고 바깥으로 투명해지는 둥근 그림
const add = (o: THREE.SpriteMaterialParameters & THREE.MeshBasicMaterialParameters) => ({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, ...o });
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

lamps.forEach((p: THREE.Vector3, i: number) => {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial(add({ color: warm })));
  halo.position.copy(p);
  halo.scale.setScalar(1.6);
  // 바닥 빛 웅덩이 — 진짜 빛 대신 더하기 판
  const pool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial(add({ color: warm, opacity: 0.45 })));
  pool.position.set(p.x, 0.1, p.z);
  pool.scale.setScalar(3.2);
  scene.add(halo, pool);
  if (i < 3) { // 진짜 점광은 앞쪽 몇 개만
    const l = new THREE.PointLight(warm, 5, 5, 2);
    l.position.copy(p);
    scene.add(l);
  }
});

// 2) 창은 발광 세기만 — 켜지는 시각을 섞고 처음 0.28초는 깜빡
function windowLevel(c: number, t0: number, i: number): number {
  let k = c > t0 ? 1 : 0;
  if (c > t0 && c < t0 + 0.28) k = hash1(Math.floor(c * 30) + i) > 0.45 ? 1 : 0.15;
  return k; // material.emissiveIntensity = k * 2.6
}`,
    },
    pitfalls: [
      { title: '켜진 것까지 어둡게 칠하면 밤이 아니라 흐린 날이 된다', fix: '버섯 마을에서 지적받은 점 — 빛나는 것 말고는 다 어둡게, 등불 빛은 좁게. 대비가 핵심이다.', seen: true },
      { title: '꺼진 물체를 파랗게 물들이면 색이 엉뚱해진다', fix: '꺼진 것은 같은 색을 어둡게만 (버섯 갓에서 겪음).', seen: true },
      { title: '등마다 점광을 두면 느려진다', fix: '바닥 빛은 더하기 판으로 흉내, 진짜 점광은 앞쪽 3개만. 점광 수는 늘 같게.' },
    ],
    prev: ['i431', 'u15'],
    next: ['u20', 'i433'],
  },
  i433: {
    id: 'i433',
    summary: '창으로 드는 해 그림자 · 보이는 빛 기둥 · 그 안을 떠도는 먼지 · 따뜻한 전등 · 바닥에서 튀는 반사광 흉내를 겹쳐 아늑한 방을 밝힌다.',
    terms: [
      { en: 'Interior lighting (window light + practical lamp)', ko: '창 빛과 방 안 전등으로 꾸민 실내 조명' },
      { en: 'Fake light shaft (additive volume)', ko: '창에서 바닥까지 이은 상자를 옅게 더해 그린 빛 기둥' },
      { en: 'Dust motes in light beam', ko: '빛 기둥 안에서만 보이는 먼지 입자' },
      { en: 'Fake bounce light', ko: '바닥에 빛이 닿은 곳에 약한 점광을 두어 반사광 흉내' },
    ],
    goal: '{target}을(를) {style} 실내 조명으로 밝혀 줘 — 창 빛 기둥 · 먼지 · 따뜻한 전등 · 반사광 흉내까지.',
    targets: ['아이 방 · 공방', '오두막 거실', '교실 · 작업실'],
    styles: ['오후 햇살 아늑하게', '저녁 전등 불빛', '새벽 푸른 창빛'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Directional Light(창 쪽) + Point Light(전등), 반사광은 Light Probe 나 Baked GI, 빛 기둥은 반투명 메시.',
      godot: 'Godot 은 DirectionalLight3D + OmniLight3D, 진짜 반사광은 VoxelGI · SDFGI, 빛 기둥은 반투명 메시 또는 FogVolume.',
    },
    principle: [
      '창으로 드는 빛은 방향 빛 하나(세기 3.5, 그림자 1024²)다. 벽에 창 구멍이 뚫려 있어 바닥에 창 모양 빛이 떨어진다.',
      '보이는 빛 기둥: 창 네 귀퉁이에서 빛 방향으로 바닥까지 늘인 점 넷을 이어 상자를 만들고, 옆에서 볼수록 옅게 더하기로 그린다.',
      '먼지는 창 면 위 무작위 점에서 빛 방향을 따라 천천히 흐르게 정점 셰이더로 옮긴다 — 기둥 안에만 있다.',
      '진짜 반사광 계산 대신, 빛이 바닥에 닿은 가운데 바로 위(0.35)에 약한 주황 점광(2.2)을 두어 둘레를 은은히 밝힌다.',
    ],
    when: ['방 · 공방 · 교실 같은 실내 무대', '따뜻하고 아늑한 분위기가 필요한 장면', '해가 움직이며 창 빛이 옮겨 가는 연출'],
    avoid: ['넓은 바깥 장면 — 대신 3점 조명(u14) · 하루 흐름(i431)', '진짜 빛 계산이 필요한 건축 시각화 — 대신 미리 구운 빛 지도'],
    cost: 'medium',
    costNote: '그림자 지도 1024² 하나 + 점광 2개(전등 · 반사광, 그림자 없음) + 빛 기둥 상자 1개 · 먼지 140점. 기둥 꼭짓점 8개를 매 장면 다시 계산.',
    level: 2,
    must: [
      '그림자는 창 쪽 방향 빛 하나에만 — 전등 · 반사광 점광은 그림자 끔',
      '천장은 colorWrite false · depthWrite false 상자로 두어 보이지 않게, 그림자만 드리우게 (방 안이 위에서 새는 빛으로 밝아지지 않게)',
      '빛 기둥은 AdditiveBlending · depthWrite false · DoubleSide, 세기 = 면이 카메라를 볼수록 (pow(|N·V|, 1.6))',
      '먼지는 시간에 따라 0 ~ 1 을 돌며 끝에서 사라지게 (smoothstep 양끝)',
      'NeutralToneMapping 으로 — 밝은 창 빛이 하얗게 날아가지 않게',
    ],
    done: [
      '바닥 · 깔개 위에 창 모양 빛이 떨어지고, 창에서 그 빛까지 옅은 빛 기둥이 보인다',
      '빛 기둥 안에서만 먼지가 반짝이며 천천히 떠간다',
      '해 각도가 바뀌면 창 빛 · 기둥 · 먼지 · 반사광 자리가 함께 옮겨 간다',
      '「따뜻한 전등」 · 「반사광 흉내」를 각각 끄고 켜면 방 구석 밝기가 눈에 띄게 달라진다',
    ],
    code: {
      lang: 'ts',
      title: '창 빛 기둥 꼭짓점 + 반사광 흉내 (해 방향이 바뀔 때마다)',
      from: 'demos/demosCamLight.ts demoIndoor() 의 update 를 정리',
      body: `import * as THREE from 'three';

// 창 네 귀퉁이 (뒤 벽 z = zb, 창 x wx0 ~ wx1, y wy0 ~ wy1)
const cs = [[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1]];
const shaftGeo = new THREE.BufferGeometry();
const shaftPos = new THREE.BufferAttribute(new Float32Array(8 * 3), 3);
shaftGeo.setAttribute('position', shaftPos);
shaftGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1)); // 0 창 · 1 바닥
shaftGeo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
const bounce = new THREE.PointLight(0xffc890, 1.5, 5, 2);
scene.add(bounce);
const dir = new THREE.Vector3();

function update(ang: number): void {
  dir.set(-0.55 + 1.2 * ang, -(0.62 + 0.28 * (Math.sin(ang * Math.PI) * 0.5 + 0.25)), 1).normalize();
  sun.target.position.set(wc, 0, 0);
  sun.position.copy(sun.target.position).addScaledVector(dir, -15);
  for (let i = 0; i < 4; i++) {
    const [x, y] = cs[i]!;
    shaftPos.setXYZ(i, x!, y!, zb);                         // 창 귀퉁이
    const L = y! / -dir.y;                                  // 바닥까지 거리
    shaftPos.setXYZ(i + 4, x! + dir.x * L, 0.01, zb + dir.z * L);
  }
  shaftPos.needsUpdate = true;
  shaftGeo.computeVertexNormals();
  // 반사광 흉내 — 창 가운데(높이 1.75) 빛이 바닥에 닿는 곳 바로 위
  const mid = 1.75 / -dir.y;
  bounce.position.set(wc + dir.x * mid, 0.35, zb + dir.z * mid);
  bounce.intensity = 2.2;
}
// 기둥 조각 셰이더: face = pow(abs(dot(N, V)), 1.6);
//   a = face * (0.17 + 0.13 * (1.0 - vT)) * smoothstep(1.0, 0.8, vT);  // 창 쪽이 진하고 바닥 끝은 사라짐`,
    },
    pitfalls: [
      { title: '천장을 안 두면 방 안이 위에서 드는 해빛으로 다 밝아진다', fix: '보이지 않는 천장(colorWrite false)을 두고 그림자만 드리우게 해 창으로만 빛이 든다.' },
      { title: '빛 기둥을 진하게 그리면 뿌연 유리 상자처럼 보인다', fix: '면이 카메라를 볼수록만 옅게(0.17 ~ 0.3) 더하고, 바닥 끝은 smoothstep 으로 사라지게.' },
      { title: '가장자리 흐림 · 비네트로 분위기를 내면 안 된다', fix: '이 사이트 결정 — 얼버무리는 후처리 대신 빛 배치(창 빛 · 전등 · 반사광)로 분위기를 만든다.', seen: true },
    ],
    prev: ['u15', 'u17'],
    next: ['i06', 'i432'],
  },

  i434: {
    id: 'i434',
    summary: '맑음 · 비 · 눈 · 안개 네 묶음 값(해 세기 · 하늘색 · 안개 짙기)을 부드럽게 섞고 입자 · 젖은 바닥 · 웅덩이 · 눈 쌓임을 함께 바꿔 날씨를 바꾼다.',
    terms: [
      { en: 'Weather system (blended presets)', ko: '날씨 묶음 값을 서서히 섞어 바꾸기' },
      { en: 'GPU particles (rain · snow in vertex shader)', ko: '정점 셰이더에서 떨어뜨리는 비 · 눈 점' },
      { en: 'FogExp2', ko: '거리에 따라 지수로 짙어지는 안개' },
      { en: 'Wet surface (roughness down) + puddle ripples', ko: '젖으면 거칠기를 낮추고 웅덩이에 물결 고리' },
    ],
    goal: '{target}에 날씨 바꾸기를 넣어 줘 — 맑음 · 비 · 눈 · 안개가 {style} 부드럽게 넘어가고 바닥이 젖거나 눈이 쌓이게.',
    targets: ['작은 마을', '게임 판 둘레 풍경', '정원 · 농장'],
    styles: ['4초마다 자동으로', '천천히 몇 분에 걸쳐', '단추로 바로'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System(비 · 눈) + RenderSettings.fogDensity, 젖은 바닥은 재질 Smoothness 를 스크립트로.',
      godot: 'Godot 은 GPUParticles3D + Environment 의 fog_density, 젖은 바닥은 StandardMaterial3D roughness 를 Tween 으로.',
    },
    principle: [
      '날씨마다 값 묶음 하나: 맑음(해 2.7 · 안개 0.004), 비(0.45 · 0.035), 눈(0.9 · 0.03), 안개(0.7 · 0.085) + 하늘 위 · 지평선 색.',
      '고른 날씨 가중치를 1 로, 나머지를 0 으로 천천히 끌어간다 (1 - exp(-dt × 2.2)). 모든 값은 가중치로 더한 평균이라 넘어가는 동안도 자연스럽다.',
      '비 · 눈은 점 수천 개를 정점 셰이더에서 시간으로 떨어뜨리고 높이 12 로 되감는다 (mod). CPU 는 시간만 넘긴다.',
      '비 가중치만큼 풀 · 돌의 거칠기를 낮추고 색을 어둡게, 웅덩이를 보이게. 눈은 쌓임 값을 따로 천천히 올려 지붕 · 풀 · 잎 색을 흰색 쪽으로.',
    ],
    when: ['배경 분위기를 바꾸는 날씨 · 계절', '비 오는 날 젖은 바닥 · 웅덩이 연출', '같은 장면을 맑음 · 안개 두 분위기로'],
    avoid: ['비가 물체에 부딪혀 튀어야 할 때 — 대신 충돌하는 입자', '실내 장면 — 창밖에만 입자를 둔다'],
    cost: 'medium',
    costNote: '비 2,600 · 눈 900 점(정점 셰이더로 움직여 CPU 0) + 웅덩이 6장 + 안개. 그림자 지도 1024² 하나. 폰은 입자 수를 반으로.',
    level: 2,
    must: [
      '날씨 값은 표 하나(WEATHER)로, 섞기는 가중치 평균 — 날씨를 갑자기 바꾸지 않는다',
      '비 · 눈 위치는 정점 셰이더에서 mod(y - 시간 × 빠르기, 12) 로 (비 14 · 눈 1.3), 눈은 sin/cos 로 흔들기',
      '입자 재질은 transparent · depthWrite false, 세기 0 이면 visible false',
      '젖음: 풀 거칠기 0.92 → 0.45 · 돌 0.8 → 0.2, 색은 0.35 만큼 어둡게',
      '번개는 비 가중치가 0.7 넘을 때만, 2.5 ~ 5.5초 간격으로 하늘 · 반구 빛을 잠깐 올리기',
    ],
    done: [
      '맑음 → 비 → 눈 → 안개가 4초마다 부드럽게 넘어간다 (해 세기 · 하늘색 · 안개가 함께)',
      '비가 오면 바닥이 어둡고 반들반들해지며 웅덩이에 동그란 물결이 퍼지고, 가끔 번개가 친다',
      '눈이 오면 지붕 · 풀 · 나뭇잎이 서서히 하얗게 덮이고, 맑아지면 천천히 녹는다',
      '「세기」 슬라이더로 입자 양 · 안개 짙기가 함께 바뀌고, 폰에서도 부드럽다',
    ],
    code: {
      lang: 'ts',
      title: '날씨 묶음 섞기 + 정점 셰이더 비 · 눈',
      from: 'demos/demosCamLight.ts WEATHER · particleMat() · demoWeather() update 를 정리',
      body: `import * as THREE from 'three';

const C = (h: number): THREE.Color => new THREE.Color(h);
const WEATHER = [
  { name: '맑음', sun: 2.7, hemi: 1.1, top: C(0x3b8ee6), hor: C(0xcbe7ff), fog: 0.004 },
  { name: '비', sun: 0.45, hemi: 0.75, top: C(0x4a5568), hor: C(0x8a94a6), fog: 0.035 },
  { name: '눈', sun: 0.9, hemi: 1.0, top: C(0x8e9fb8), hor: C(0xdfe6f0), fog: 0.03 },
  { name: '안개', sun: 0.7, hemi: 0.95, top: C(0xb8c2cc), hor: C(0xd6dce2), fog: 0.085 },
];
const fog = new THREE.FogExp2(0xcbe7ff, 0.004);
scene.fog = fog;
const wts = [1, 0, 0, 0];

function update(dt: number, cur: number): void {
  for (let i = 0; i < 4; i++) wts[i]! += ((i === cur ? 1 : 0) - wts[i]!) * (1 - Math.exp(-dt * 2.2));
  let sunI = 0, hemiI = 0, fd = 0;
  const hor = new THREE.Color(0, 0, 0);
  WEATHER.forEach((W, i) => {
    const k = wts[i]!;
    sunI += W.sun * k; hemiI += W.hemi * k; fd += W.fog * k;
    hor.r += W.hor.r * k; hor.g += W.hor.g * k; hor.b += W.hor.b * k;
  });
  sun.intensity = sunI;
  hemi.intensity = hemiI;
  fog.color.copy(hor);
  fog.density = fd;
  rainU.uA.value = wts[1]!; // 비 입자 진하기
  snowU.uA.value = wts[2]!;
  grassMat.roughness = 0.92 + (0.45 - 0.92) * wts[1]!; // 젖으면 반들반들
}

// 비 정점 셰이더 (눈은 빠르기 1.3 + sin/cos 흔들기)
const RAIN_VS = 'uniform float uTime, uPx, uA; varying float vA;' +
  'void main(){ vec3 p = position; float H = 12.0;' +
  ' p.y = mod(p.y - uTime * 14.0, H); p.x += p.y * 0.08;' +           // 떨어지며 살짝 비스듬히
  ' vec4 mv = modelViewMatrix * vec4(p, 1.0);' +
  ' vA = uA * smoothstep(0.0, 1.0, p.y) * smoothstep(H, H - 2.0, p.y);' + // 위아래 끝에서 사라짐
  ' gl_PointSize = uPx * 0.22 / -mv.z; gl_Position = projectionMatrix * mv; }';`,
    },
    pitfalls: [
      { title: '날씨를 한 번에 바꾸면 화면이 툭 끊긴다', fix: '모든 값을 가중치 평균으로 두고 가중치를 지수로 천천히 끌어간다.' },
      { title: '입자 위치를 CPU 에서 매 프레임 고치면 폰에서 느리다', fix: '처음 자리만 넣고 정점 셰이더에서 시간으로 떨어뜨린다 (mod 로 되감기).' },
      { title: '느린 폰에서 프레임 시간을 0.05 로 자르면 날씨가 느리게 흐른다', fix: '이 사이트는 실제 시간으로 흐르게 고쳤다 — 새 게임은 실제 dt (0.25초까지) 를 쓴다.', seen: true },
    ],
    prev: ['i431', 'u36'],
    next: ['i14', 'i170'],
  },

  u22: {
    id: 'u22',
    summary: '겹친 잡음 높이를 흐름 방향으로 흘리고 그 기울기로 물결 면을 만들어, 프레넬 하늘 반사 · 햇빛 반짝 · 기슭 거품이 있는 강물을 그린다.',
    terms: [
      { en: 'Flowing water shader', ko: '흐르는 강물 셰이더' },
      { en: 'Normal from height gradient (finite difference)', ko: '높이 차로 물결 면 방향 만들기' },
      { en: 'Fresnel (Schlick)', ko: '비스듬히 볼수록 하늘이 많이 비침' },
      { en: 'Shore foam mask', ko: '기슭 · 배 둘레 흰 거품' },
    ],
    goal: '{target}에 흐르는 강물 셰이더를 넣어 줘 — 잔물결 · 하늘 반사 · 햇빛 반짝 · 기슭 거품, 느낌은 {style}.',
    targets: ['강 건너기 게임의 강', '마을 사이 개울', '배가 지나가는 운하'],
    styles: ['맑고 밝은 그림책', '사실적인 시냇물', '노을빛 강'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 에서 Gradient Noise 를 Time 으로 흘려 Normal From Height · Fresnel Effect 노드로.',
      godot: 'Godot 은 spatial 셰이더 fragment() 에서 NORMAL 을 높이 차로, 반사는 Fresnel 식으로 직접.',
    },
    principle: [
      '물결 높이 = 잡음 세 겹을 서로 다른 빠르기로 흐름 방향(-z)으로 민 것 (fbm 0.55 · fbm 1.05 · 잡음 2.0).',
      '옆(0.02)으로 조금 옮긴 높이와의 차로 면 기울기를 구해 법선을 만든다 — 진짜로 면을 휘지 않아도 빛이 물결친다.',
      '프레넬: F = 0.03 + 0.97·(1 - N·V)⁵ — 비스듬히 볼수록 하늘색 반사가 세진다. 반사 방향 R 의 높이로 하늘 위 · 아래 색을 섞는다.',
      '햇빛 반짝은 R·L 의 140제곱(날카로운 점) + 18제곱(옅은 번짐). 기슭은 얕아 밝고 투명하게, 가운데는 깊고 짙게, 가장자리에는 흐르는 거품.',
    ],
    when: ['강 · 개울처럼 한 방향으로 흐르는 물', '위에서 비스듬히 내려다보는 판 게임의 물', '배 · 통나무가 떠 가는 장면'],
    avoid: ['고인 연못 · 수조 — 대신 수면 셰이더(흐름 없음)', '넓은 바다 — 대신 파도 높이를 정점에서 움직이는 바다(u26 계열)', '툰 그림체 — 대신 툰 물(i222)'],
    cost: 'medium',
    costNote: '픽셀마다 높이를 3번 (기울기 계산) — 높이 하나에 fbm 2번 + 잡음 1번, 거품 fbm 4번. 화면 대부분이 물이면 폰에서 무겁다.',
    level: 2,
    must: [
      '물결 높이는 흐름 방향으로만 흘린다 (vec2(0.0, -uTime * 빠르기)) — 둥둥 떠 보이지 않게',
      '법선은 높이 차로: N = normalize(vec3(-hx/e × 0.09, 1, -hz/e × 0.09)), e = 0.02',
      '기슭 얕음 · 가운데 깊음은 강 폭 좌표(x / 반폭)로, 투명도도 0.45 ~ 0.86 으로 깊이 따라',
      'transparent · depthWrite false · renderOrder 2 (바닥보다 나중에)',
      '조각 셰이더 끝에 tonemapping_fragment · colorspace_fragment 를 넣어 다른 재질과 색을 맞춘다',
    ],
    done: [
      '왼쪽 일반 재질 · 오른쪽 강물 셰이더를 나란히 두면, 오른쪽 물만 흐르는 잔물결 · 하늘 반사 · 반짝이가 보인다',
      '물결이 한 방향으로 흘러가고, 기슭 쪽은 밝은 청록 · 가운데는 짙은 파랑이다',
      '양쪽 기슭과 배 둘레에 흰 거품이 흐르며 생긴다',
      '폰에서 화면 절반이 물이어도 30fps 이상',
    ],
    code: {
      lang: 'glsl',
      title: '흐르는 물결 → 법선 → 프레넬 · 반짝 · 거품',
      from: 'demos/snap/riverWater.ts createWater() 조각 셰이더를 정리 (원본 rivercross/water.ts)',
      body: `// noise() · fbm(4겹) 은 이 위에. vXZ = 물 판 좌표, uHalfW = 강 반폭
float height(vec2 p){
  float a = fbm(p * 1.5 + vec2(0.0, -uTime * 0.55));
  float b = fbm(p * 3.4 + vec2(2.0, -uTime * 1.05));
  float c = noise(p * 9.0 + vec2(0.0, -uTime * 2.0));
  return a * 0.6 + b * 0.32 + c * 0.08;
}
void main(){
  vec2 p = vXZ; float e = 0.02;
  float h = height(p);
  float hx = height(p + vec2(e, 0.0)) - h, hz = height(p + vec2(0.0, e)) - h;
  vec3 N = normalize(vec3(-hx / e * 0.09, 1.0, -hz / e * 0.09));
  vec3 V = normalize(cameraPosition - vWorld);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  float edge = 1.0 - abs(p.x) / uHalfW;             // 기슭 0 · 가운데 1
  float deep = smoothstep(0.0, 0.7, edge) * 0.9;
  vec3 base = mix(lin(vec3(0.52, 0.86, 0.84)), lin(vec3(0.16, 0.55, 0.74)), deep);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(lin(vec3(0.86, 0.93, 0.98)), lin(vec3(0.45, 0.68, 0.95)), clamp(R.y * 1.2, 0.0, 1.0));
  vec3 col = mix(base, sky, clamp(F * 1.1, 0.0, 0.85));
  vec3 L = normalize(vec3(-0.45, 0.8, 0.4));
  col += vec3(1.0, 0.97, 0.9) * (pow(max(dot(R, L), 0.0), 140.0) * 2.2 + pow(max(dot(R, L), 0.0), 18.0) * 0.12);
  float shore = 1.0 - smoothstep(0.0, 0.1, edge);
  float foam = shore * smoothstep(0.38, 0.62, fbm(p * 7.0 + vec2(0.0, -uTime * 1.6)) + shore * 0.25);
  col = mix(col, lin(vec3(0.97, 0.99, 1.0)), foam);
  gl_FragColor = vec4(col, clamp(mix(0.45, 0.86, deep) + F * 0.3 + foam * 0.4, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    },
    pitfalls: [
      { title: '잡음 반복문을 여러 번 부르는 셰이더가 첫 컴파일에 오래 멈춘다', fix: '윈도 D3D 에서 반복문 잡음 셰이더가 17~20초 걸린 일이 있다. 무거우면 잡음을 미리 구운 텍스처로 읽는다.', seen: true },
      { title: '색을 sRGB 값 그대로 섞으면 물빛이 뿌옇게 바랜다', fix: '견본은 lin() = pow(c, 2.2) 로 선형으로 바꿔 섞고, 끝에 colorspace_fragment 로 되돌린다.' },
      { title: '물에 depthWrite 를 켜면 물속 바닥 · 배 아랫부분이 사라진다', fix: '반투명 물은 depthWrite false, 바닥을 먼저 그리게 renderOrder 를 크게.' },
    ],
    prev: ['u08', 'i10'],
    next: ['u23', 'i222'],
    refs: [
      { name: 'Wikipedia — Schlick\'s approximation', url: 'https://en.wikipedia.org/wiki/Schlick%27s_approximation' },
    ],
  },

  u23: {
    id: 'u23',
    summary: '물결 잡음을 sin 으로 접어 가는 선만 남겨, 물속 바닥에 일렁이는 빛 그물(커스틱)을 셰이더로 그린다 — 빨 · 초 · 파를 조금 어긋나게 해 무지개 테까지.',
    terms: [
      { en: 'Caustics (procedural)', ko: '물결이 모은 햇빛이 바닥에 만든 빛 무늬' },
      { en: 'Folded noise (abs(sin(fbm × k)))', ko: '잡음을 접어 가는 선 그물 만들기' },
      { en: 'Chromatic offset', ko: '색마다 조금 어긋나게 읽어 무지개 테두리' },
    ],
    goal: '{target}에 일렁이는 커스틱 빛 그물을 넣어 줘 — 물결이 모은 햇빛 느낌으로, 분위기는 {style}.',
    targets: ['얕은 연못 · 수영장 바닥', '강바닥 자갈', '수족관 모래'],
    styles: ['맑은 한낮', '은은한 밤 연못', '열대 바다'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 바닥 재질 Shader Graph 에서 같은 식, 또는 URP Decal Projector 에 흐르는 커스틱 텍스처.',
      godot: 'Godot 은 바닥 spatial 셰이더에서 같은 식을 EMISSION 이나 ALBEDO 에 더한다.',
    },
    principle: [
      '진짜 커스틱은 물결 면이 햇빛을 모으는 계산이지만, 생김새는 「굽이치는 가는 밝은 선 그물」이다.',
      '잡음(fbm)을 시간으로 흘린 뒤 sin(… × 18) 의 절댓값으로 접으면 0 근처를 지나는 곳마다 가는 골이 생긴다.',
      '서로 다르게 흐르는 두 장의 최솟값을 1 에서 빼고 5제곱하면 골이 만나는 곳만 밝은 선 그물이 된다.',
      '빨 · 초 · 파를 x 로 ±0.012 씩 어긋나게 읽으면 선 가장자리에 무지개 테가 생긴다. 바닥 색 위에 더한다.',
    ],
    when: ['얕고 맑은 물의 바닥이 보이는 장면', '수조 · 연못을 살아 있게 보이고 싶을 때', '물 셰이더(u22)의 강바닥에 함께'],
    avoid: ['깊고 탁한 물 — 바닥이 안 보인다', '밤 장면 — 약하게 하거나 끈다 (버섯 마을은 밤이라 약하게)'],
    cost: 'light',
    costNote: '바닥 픽셀마다 fbm 2번 × 색 3번 = fbm 6번. 바닥만 칠하므로 보통 가볍다. 더 줄이려면 색 어긋남을 빼고 1번만.',
    level: 1,
    must: [
      'caus = pow(1.0 - min(a, b), 5.0), a · b = abs(sin((fbm(p + 흐름) - 0.5) × 18.0)) 두 장',
      '두 장은 크기(1 · 1.3) · 흐르는 방향을 다르게 — 같으면 무늬가 그냥 미끄러진다',
      '빨 · 초 · 파를 ±0.012 어긋나게 읽어 무지개 테',
      '바닥 색은 물빛(0.42, 0.66, 0.74)을 곱한 뒤 그 위에 커스틱을 더한다',
      '좌표는 세계 xz (vW.xz × 1.7) — 바닥 판 크기가 바뀌어도 무늬 크기가 같게',
    ],
    done: [
      '왼쪽 빛무늬 없음 · 오른쪽 커스틱을 나란히 두면 오른쪽 바닥에 가는 빛 그물이 일렁인다',
      '그물이 미끄러지지 않고 모양이 바뀌며 굽이친다',
      '선 가장자리에 아주 옅은 무지개 테가 보인다',
      '세기 슬라이더로 0 ~ 1 사이가 바로 바뀌고, 폰에서도 60fps',
    ],
    code: {
      lang: 'glsl',
      title: '접은 잡음 두 장 → 빛 그물 → 색 어긋남',
      from: 'demos/demosShader.ts causticDemo() 의 바닥 조각 셰이더',
      body: `// noise() · fbm(4겹) 은 이 위에
uniform float uTime; uniform float uAmt; uniform sampler2D uMap;
varying vec2 vUv; varying vec3 vW;
float caus(vec2 p, float t){
  float a = abs(sin((fbm(p + vec2(t * 0.25, -t * 0.4)) - 0.5) * 18.0));
  float b = abs(sin((fbm(p * 1.3 + vec2(-t * 0.2, t * 0.3) + 3.1) - 0.5) * 18.0));
  return pow(1.0 - min(a, b), 5.0);   // 두 골이 만나는 곳만 밝게
}
void main(){
  vec3 c = pow(texture2D(uMap, vUv * 2.0).rgb, vec3(2.2)); // 자갈 그림 (sRGB → 선형)
  vec3 col = c * vec3(0.42, 0.66, 0.74);                   // 물속 빛깔
  vec2 p = vW.xz * 1.7;
  // 빨 · 초 · 파를 아주 조금씩 어긋나게 — 무지개 테두리
  vec3 cs = vec3(caus(p + vec2(0.012, 0.0), uTime), caus(p, uTime), caus(p - vec2(0.012, 0.0), uTime));
  col += vec3(1.0, 0.98, 0.9) * cs * 1.1 * uAmt;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
    },
    pitfalls: [
      { title: '한 장만 쓰면 그물이 아니라 줄무늬가 된다', fix: '서로 다르게 흐르는 두 장의 최솟값을 써야 그물 눈이 생긴다.' },
      { title: '밤 장면에서 그대로 켜면 바닥이 낮처럼 번쩍인다', fix: '버섯 마을 연못은 밤이라 커스틱을 약하게 했다. 장면 밝기에 맞춰 세기를 줄인다.', seen: true },
      { title: '무늬를 uv 로 그리면 판마다 크기가 달라진다', fix: '세계 좌표 xz 로 그려 바닥 크기와 상관없이 같은 크기로.' },
    ],
    prev: ['u22'],
    next: ['u25', 'i222'],
    refs: [
      { name: 'Wikipedia — Caustic (optics)', url: 'https://en.wikipedia.org/wiki/Caustic_(optics)' },
    ],
  },
  u25: {
    id: 'u25',
    summary: '통 안 물 상자에서 세계 높이 y = h 위쪽 픽셀을 버리고 뒷면을 수면으로 칠해, 통이 기울어도 물 표면은 늘 수평으로 남게 한다.',
    terms: [
      { en: 'World-space plane clipping (discard)', ko: '세계 좌표 평면 위를 잘라 버리기' },
      { en: 'Back-face cap (gl_FrontFacing)', ko: '잘린 구멍으로 보이는 뒷면을 뚜껑(수면)으로 칠하기' },
      { en: 'Liquid in tilted container', ko: '기울어진 그릇 속 액체' },
    ],
    goal: '{target} 안의 물을 셰이더로 잘라 줘 — 그릇이 기울어도 수면은 늘 수평, 느낌은 {style}.',
    targets: ['기울어지는 유리 수조', '흔들리는 물병 · 컵', '돌아가는 실험 통'],
    styles: ['맑은 과학 실험', '장난감 같은 파스텔', '반짝이는 유리'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 에서 Position(World).y 를 비교해 Alpha Clip, 뒷면은 Is Front Face 노드 + Two Sided.',
      godot: 'Godot 은 spatial 셰이더에서 세계 좌표 y 로 discard, FRONT_FACING 으로 뒷면을 수면 색으로 (cull_disabled).',
    },
    principle: [
      '물은 통 안에 딱 맞는 상자 하나다. 통과 같이 돌지만, 조각 셰이더에서 세계 좌표 높이가 수면 h 보다 크면 그 픽셀을 버린다.',
      '그러면 위가 잘린 상자가 되는데, 잘린 구멍으로 상자 안쪽 뒷면이 보인다.',
      '그 뒷면(gl_FrontFacing 이 거짓)을 수면 색 + 잔물결 잡음으로 칠하면 뚜껑처럼 평평한 수면이 생긴다.',
      '앞면은 수면에서 깊을수록 짙은 파랑으로, 수면 바로 아래 0.035 띠는 밝게 해 물 테두리를 낸다.',
    ],
    when: ['그릇이 기울거나 도는 실험 · 체험 (피타고라스 물 실험 등)', '컵 · 병 속 물을 흔들 때', '물 양(h)을 바꾸는 장면'],
    avoid: ['물이 출렁이며 쏟아져야 할 때 — 대신 입자 · 유체 시뮬레이션', '모양이 오목한 그릇 — 뒷면 뚜껑이 겹쳐 보일 수 있다 (볼록한 그릇에 맞음)'],
    cost: 'light',
    costNote: '물 상자 하나에 픽셀마다 비교 1번 + 잡음 2번(수면만). 폰도 가볍다.',
    level: 2,
    must: [
      '물 재질은 side: DoubleSide — 뒷면이 그려져야 수면 뚜껑이 생긴다',
      '자르기는 세계 좌표(vW.y - uLevel)로 — 물체 좌표로 하면 통과 같이 기운다',
      '뒷면(gl_FrontFacing 거짓)은 수면 색, 잔물결 잡음 좌표도 세계 xz',
      '물 상자는 유리보다 조금 작게(-0.04), 유리는 투명 · depthWrite false · renderOrder 2',
      '수면 높이 uLevel 은 매 프레임 통 위치로 갱신 (통이 움직이면)',
    ],
    done: [
      '왼쪽(물체 좌표로 자름)은 물이 통과 같이 기울고, 오른쪽(세계 좌표)은 수면이 늘 수평이다',
      '「기울기」를 0 ~ 1.4 로 올려도 오른쪽 수면은 바닥과 평행하고 잔물결이 일렁인다',
      '수면 바로 아래에 밝은 물 테두리 띠가 보인다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'glsl',
      title: '세계 높이로 자르고 뒷면을 수면으로',
      from: 'demos/demosShader.ts flatWaterDemo() mkWater() 조각 셰이더 (켬 모드)',
      body: `// 정점: vL = position; vW = 세계 위치; vN = 세계 법선. noise() 는 이 위에
uniform float uLevel; uniform float uTime; uniform vec3 uDeep; uniform vec3 uTop;
varying vec3 vW; varying vec3 vL; varying vec3 vN;
void main(){
  float hgt = vW.y - uLevel;        // 수면 = 세계 평면 y = uLevel
  if (hgt > 0.0) discard;           // 그 위는 버린다
  vec3 col;
  if (gl_FrontFacing) {
    vec3 V = normalize(cameraPosition - vW);
    float F = pow(1.0 - abs(dot(normalize(vN), V)), 2.0);
    col = mix(uDeep, uTop, clamp(1.0 + hgt * 1.3, 0.0, 1.0)) + vec3(0.25, 0.35, 0.4) * F;
    col += vec3(0.85, 0.97, 1.0) * smoothstep(-0.035, 0.0, hgt) * 0.8; // 수면 바로 아래 밝은 띠
  } else {
    // 잘린 구멍으로 보이는 뒷면 = 수면 뚜껑
    vec2 q = vW.xz;
    float rip = noise(q * 7.0 + uTime * 0.7) * 0.5 + noise(q * 15.0 - uTime * 1.1) * 0.5;
    col = uTop * (0.95 + rip * 0.35) + vec3(0.08);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
// 재질: side: THREE.DoubleSide · uLevel 은 매 프레임 tank.position.y (통 가운데 = 물 반)`,
    },
    pitfalls: [
      { title: '물체 좌표 y 로 자르면 수면이 통과 같이 기운다', fix: '자르기는 세계 좌표로. 견본 왼쪽 칸이 바로 그 잘못된 모습이다.' },
      { title: 'FrontSide 재질이면 수면 뚜껑이 안 생기고 속이 뚫려 보인다', fix: 'side: DoubleSide 로 뒷면까지 그리고 gl_FrontFacing 으로 나눠 칠한다.' },
      { title: '유리를 물보다 먼저 그리면 물이 가려진다', fix: '유리는 투명 · depthWrite false · renderOrder 를 물보다 크게.' },
    ],
    prev: ['u08'],
    next: ['u22', 'u23'],
  },

  i222: {
    id: 'i222',
    summary: '물 셰이더가 섬 높이 식을 그대로 알아 물 깊이를 구해, 깊이로 색 3단을 끊고 기슭 거품 띠 · 배 뒤 V자 물거품 · 바위 둘레 고리를 그린다.',
    terms: [
      { en: 'Toon water (stylized water)', ko: '만화풍 물 — 깊이 색 계단 + 하얀 거품 테' },
      { en: 'Shoreline foam from depth', ko: '물 깊이가 얕은 곳에 거품 띠' },
      { en: 'Analytic depth (shared height function)', ko: '땅 높이 식을 셰이더에서도 써서 깊이 구하기' },
      { en: 'Boat wake (V-shaped)', ko: '배 뒤로 벌어지는 V자 물거품' },
    ],
    goal: '{target}에 툰 물을 넣어 줘 — 깊이 색 3단 · 기슭 거품 테 · 배 물거품까지, 그림체는 {style}.',
    targets: ['섬이 있는 바다 퍼즐', '강 · 호수 게임 판', '배가 다니는 지도'],
    styles: ['밝은 툰 (3단 + 외곽선)', '매끈한 그러데이션', '파스텔 그림책'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 의 Scene Depth 노드로 깊이 차를 구해 Step 으로 거품 띠 (URP Depth Texture 켜기).',
      godot: 'Godot 은 spatial 셰이더에서 hint_depth_texture 로 깊이 차를 구하거나, 같은 높이 식을 uniform 배열로.',
    },
    principle: [
      '땅(섬) 높이를 식 하나로 만든다: 기본 -0.6 + 가우스 언덕 4개 + 잔 굴곡. 같은 식을 물 셰이더에 uniform 배열로 넘긴다.',
      '물 위 픽셀마다 그 식으로 땅 높이를 다시 계산하면 물 깊이 d = -H(x, z) 를 바로 안다 (깊이 버퍼가 필요 없다).',
      '툰이면 깊이로 색을 끊는다: 0.16 아래 얕은 청록 · 0.42 아래 중간 · 그 너머 짙은 파랑. 잡음으로 경계를 조금 흔든다.',
      '깊이가 거품 폭(0.12)보다 얕으면 하양 — 기슭 거품. 바깥으로 퍼지는 고리 줄 · 배 뒤 V자(옆 거리 ≈ 0.08 + 뒤 거리 × 0.32) · 바위 둘레 고리를 더한다.',
    ],
    when: ['섬 · 땅 높이를 식으로 만든 툰 장면', '깊이 버퍼를 따로 그리기 싫을 때 (폰)', '배 · 바위가 있는 바다 퍼즐'],
    avoid: ['땅이 식이 아닌 모델(메시)일 때 — 대신 깊이 텍스처로 깊이 차', '사실적인 물 — 대신 흐르는 강물(u22)'],
    cost: 'medium',
    costNote: '물 픽셀마다 높이 식(언덕 4개 반복) + 잡음 약 6번 + 바위 4개 반복. 깊이 버퍼를 따로 안 그려 오히려 가볍다.',
    level: 2,
    must: [
      '땅 높이 식을 TS 와 GLSL 에 똑같이 — 섬 자료는 uniform vec4 배열(x, z, 반지름, 높이)로 넘긴다',
      '툰 색은 step 계단 (0.16 · 0.42), 매끈 모드는 smoothstep — 단추 하나로 바꿀 수 있게',
      '기슭 거품은 깊이 < 거품 폭 (툰은 step, 매끈은 smoothstep), 폭은 시간으로 살짝 숨쉬기',
      '섬 · 야자수 · 배는 툰 3단 + 외곽선 껍데기 (외곽선은 카메라 거리로 굵기 보정)',
      '물 판은 한 장(PlaneGeometry 60 × 40, 1 × 1) — 정점을 쪼갤 필요 없다',
    ],
    done: [
      '섬 둘레로 얕은 청록 → 중간 → 짙은 파랑 세 띠가 또렷이 보이고, 물가에 흰 거품 테가 살랑인다',
      '거품 테 바깥으로 고리 줄이 퍼져 나가 사라진다',
      '배가 지나가면 뒤로 V자 물거품과 가운데 꼬리 거품이 생기고, 바위 둘레에 거품 고리가 생긴다',
      '「툰 단계 물」을 끄면 매끈한 그러데이션으로 바뀐다',
    ],
    code: {
      lang: 'glsl',
      title: '높이 식으로 깊이 → 색 3단 · 기슭 거품 · 퍼지는 고리',
      from: 'demos/lib/toonIsle.ts makeToonIsle() 물 조각 셰이더를 정리',
      body: `// noise() 는 이 위에. uIsl[i] = (x, z, 반지름, 높이) — TS 의 ISLANDS 와 같은 값
uniform float uTime, uFoam, uToon; uniform vec4 uIsl[4];
uniform vec3 cShallow, cMid, cDeep, cFoam;
varying vec3 vW;
float H(vec2 p){
  float h = -0.6;
  for (int i = 0; i < 4; i++){ vec4 s = uIsl[i]; vec2 d = p - s.xy; h += s.w * exp(-dot(d, d) / (s.z * s.z)); }
  return h + 0.07 * sin(p.x * 1.7 + p.y * 0.9) * cos(p.y * 1.3 - p.x * 0.4);
}
void main(){
  float d = -H(vW.xz);                                   // 물 깊이
  float n = noise(vW.xz * 2.4 + vec2(uTime * 0.3, uTime * 0.2));
  float dd = d + (n - 0.5) * 0.08;                        // 경계를 조금 흔든다
  vec3 col = uToon > 0.5 ? (dd < 0.16 ? cShallow : (dd < 0.42 ? cMid : cDeep))
                         : mix(cShallow, mix(cMid, cDeep, smoothstep(0.25, 0.6, dd)), smoothstep(0.02, 0.3, dd));
  float edge = uFoam * (0.8 + 0.2 * sin(uTime * 1.8 + n * 5.0));
  float foam = uToon > 0.5 ? step(dd, edge) : 1.0 - smoothstep(edge * 0.5, edge, dd);
  // 거품 테 바깥으로 퍼지는 고리 줄
  float ph = fract(uTime * 0.33);
  float ring = uFoam * (1.35 + ph * 1.8);
  float line = (1.0 - smoothstep(0.012, 0.03, abs(dd - ring))) * (1.0 - ph) * step(0.42, noise(vW.xz * 3.2 + 7.0));
  col = mix(col, cFoam, clamp(max(foam, line * 0.95), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    },
    pitfalls: [
      { title: 'TS 의 땅 높이 식과 셰이더 식이 조금이라도 다르면 거품이 물가에서 떨어져 뜬다', fix: '같은 식 · 같은 값을 쓴다. 섬 자료는 배열 하나에서 둘 다 읽게.' },
      { title: '외곽선 껍데기를 물 판에 붙이면 지저분하다', fix: '물 · 얇은 판에는 외곽선을 붙이지 않는다 (툰 규칙).', seen: true },
      { title: '툰 장면에 톤 매핑을 켜 두면 3단 색이 흐려진다', fix: '툰 장면은 NoToneMapping 이 기본, 색은 빛 세기로 맞춘다.', seen: true },
    ],
    prev: ['u01', 'u22'],
    next: ['u02', 'i13'],
  },

  i537: {
    id: 'i537',
    summary: '정점 셰이더에서 카메라와의 수평 거리² 만큼 높이를 내려, 평평한 맵이 둥근 작은 행성처럼 굴러가 보이게 한다 — 맵 · 충돌은 평평한 그대로.',
    terms: [
      { en: 'Curved world shader (vertex bend)', ko: '정점을 거리² 만큼 내려 지평선을 휘게' },
      { en: 'onBeforeCompile (project_vertex 바꾸기)', ko: '표준 재질에 휘기 코드 끼워 넣기' },
      { en: 'customProgramCacheKey', ko: '고친 재질이 같은 셰이더 하나를 돌려 쓰게 하는 열쇠' },
    ],
    goal: '{target}에 휘는 지평선(정점 셰이더 휨)을 넣어 줘 — 멀수록 아래로 내려가 {style} 작은 행성처럼 보이게.',
    targets: ['끝없이 걷는 마을 길', '달리기 게임 길', '쿼터뷰 마을 지도'],
    styles: ['아기자기한 동화 마을', '살짝만 둥글게', '아주 작은 행성처럼'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 의 Vertex Position 에서 (월드 위치 - 카메라 위치) 거리² 만큼 y 를 빼는 Curved World 방식.',
      godot: 'Godot 은 spatial 셰이더 vertex() 에서 (MODEL_MATRIX * VERTEX) 세계 위치를 구해 거리² 만큼 y 를 내리고 다시 VERTEX 로.',
    },
    principle: [
      '정점의 세계 위치에서 카메라의 수평 자리(xz)를 뺀 거리 d 를 구한다.',
      '높이를 y -= k × (d.z² + 옆 비율 × d.x²) 만큼 내린다 (견본 k 0.012 · 옆 0.35). 멀수록 크게 내려가 둥근 지평선이 된다.',
      '휘기는 그리기 직전 정점에서만 일어난다. 물체 위치 · 충돌 · 길찾기는 평평한 맵 그대로라 게임 코드는 손대지 않는다.',
      '모든 재질에 같은 휘기를 끼워야 한다 — 땅만 휘면 집 · 나무가 공중에 뜬다.',
    ],
    when: ['끝없이 이어지는 길 · 마을을 걷는 장면', '멀리 있는 것을 자연스럽게 숨기고 싶을 때 (지평선 너머로)', '쿼터뷰 게임에 아기자기한 느낌을 줄 때'],
    avoid: ['정확한 거리 · 높이를 보여 줘야 하는 체험 (자 · 각도)', '바닥 판이 큰 판 하나뿐일 때 — 정점이 적으면 안 휜다 (격자로 쪼갤 것)'],
    cost: 'light',
    costNote: '정점마다 곱셈 몇 번. 대신 화면 밖 판정이 휘기 전 자리로 되므로 frustumCulled 를 끈다 — 물체가 많으면 그리기 수가 는다.',
    level: 2,
    must: [
      '모든 재질에 같은 onBeforeCompile 을 — 땅 · 집 · 나무 · 그림자 판 · 캐릭터까지',
      '#include <project_vertex> 를 바꿔 넣는다 (인스턴스면 instanceMatrix 를 먼저 곱한다)',
      'customProgramCacheKey 를 같은 문자열로 (견본 curved-world) — 셰이더 하나를 돌려 쓰게',
      '바닥은 촘촘한 격자 (견본 풀밭 60 × 4 칸) — 판 하나면 양 끝만 내려가 집이 뜬다',
      '휘는 물체는 frustumCulled = false, 카메라 자리 uCam 은 매 프레임 갱신',
    ],
    done: [
      '길 앞쪽은 평평하고 멀리 갈수록 아래로 굽어 작은 행성 위를 걷는 것처럼 보인다',
      '휨 켬 ↔ 끔을 번갈아 보면 같은 맵이 평평했다 둥글었다 한다 (집 · 나무가 땅에 붙은 채로)',
      '「휨 세기」 · 「옆으로도 휨」 조절이 바로 반영된다',
      '걸어가도 물체가 공중에 뜨거나 땅에 묻히지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '모든 재질에 끼우는 휘기 (project_vertex 바꾸기)',
      from: 'demos/demosPlanet.ts makeCurved() bend() 를 정리',
      body: `import * as THREE from 'three';

const U = { uBend: { value: 0.012 }, uSide: { value: 0.35 }, uCam: { value: new THREE.Vector2() } };

function bend<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uBend; uniform float uSide; uniform vec2 uCam;' + sh.vertexShader.replace(
      '#include <project_vertex>',
      [
        'vec4 mvPosition = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  mvPosition = instanceMatrix * mvPosition;',
        '#endif',
        'vec4 wpB = modelMatrix * mvPosition;',
        'vec2 dB = wpB.xz - uCam;',
        'wpB.y -= uBend * (dB.y * dB.y + uSide * dB.x * dB.x);', // 멀수록 아래로
        'mvPosition = viewMatrix * wpB;',
        'gl_Position = projectionMatrix * mvPosition;',
      ].join('\\n'),
    );
  };
  m.customProgramCacheKey = () => 'curved-world'; // 같은 셰이더 하나를 돌려 쓰게
  return m;
}

// 땅은 촘촘한 격자여야 물체와 같이 휜다
const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 4, 60, 4).rotateX(-Math.PI / 2), bend(new THREE.MeshStandardMaterial({ color: 0x9ad86e })));
grass.frustumCulled = false; // 화면 밖 판정이 휘기 전 자리로 되므로

function update(): void {
  U.uCam.value.set(camera.position.x, camera.position.z);
}`,
    },
    pitfalls: [
      { title: '바닥을 판 하나로 두면 양 끝만 내려가 집 · 나무가 뜬다', fix: '휨은 정점에서만 일어난다. 바닥을 촘촘한 격자로 쪼갠다 (견본 주석에 적힌 실수).', seen: true },
      { title: '한 재질만 휘면 그 물체만 따로 논다', fix: '그림자 판 · 캐릭터 재질까지 모두 bend() 로 감싼다 (캐릭터는 clone 해서).' },
      { title: '화면 밖 판정 때문에 가장자리 물체가 깜빡 사라진다', fix: '휜 자리와 판정 자리가 달라서다. 휘는 물체는 frustumCulled = false.' },
    ],
    prev: ['u08', 'i13'],
    next: ['i15'],
  },

  i522: {
    id: 'i522',
    summary: '별 6만 개를 점 하나씩 — 어두운 별일수록 많은 등급 분포로 크기 · 밝기를, B-V 색지수 → 온도 → 흑체 색으로 색을, 별마다 다른 사인으로 반짝임을 준다.',
    terms: [
      { en: 'Starfield (magnitude distribution)', ko: '실제 별 밝기 등급 분포를 흉내 낸 별 하늘' },
      { en: 'B-V color index → blackbody color', ko: '색지수로 표면 온도를 구해 별빛 색 정하기' },
      { en: 'Scintillation (twinkle)', ko: '공기 흔들림으로 별이 반짝이는 것' },
      { en: 'THREE.Points + custom ShaderMaterial', ko: '점 하나 = 별 하나, 크기 · 빛 모양은 셰이더로' },
    ],
    goal: '{target}에 별 6만 개 하늘을 그려 줘 — 실제 등급 분포 · 온도 색 · 반짝임까지, 느낌은 {style}.',
    targets: ['우주 게임 배경', '밤하늘 관측 체험', '타이틀 화면'],
    styles: ['진짜 밤하늘처럼', '반짝반짝 동화풍', '은하수 쪽으로 몰린 하늘'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System(Max Particles 많이) 이나 VFX Graph 로 점을 뿌리고, 색은 스크립트로 넣은 Start Color.',
      godot: 'Godot 은 MultiMeshInstance3D 나 GPUParticles3D 에 점을 넣고 셰이더로 크기 · 반짝임.',
    },
    principle: [
      '실제 별은 어두운 것이 훨씬 많다. 등급을 log10(A + 무작위 × (B - A)) / 0.36 으로 뽑으면 그 분포가 된다 (-1.4 ~ 8.4 등급).',
      '밝기(빛 흐름)는 10^(-0.4 × (등급 - 1)). 아주 작게 그려지는 별은 크기 대신 밝기로 줄여 깜빡임을 막는다.',
      '색: 실제 분포를 흉내 낸 B-V 값을 뽑아 Ballesteros 식으로 온도(T = 4600 × (1/(0.92·BV+1.7) + 1/(0.92·BV+0.62)))를 구하고 흑체 색으로.',
      '반짝임: 별마다 위상이 다른 사인 두 개를 곱해 밝기를 흔든다. 밝은 별(등급 1.4 아래)만 십자 빛살을 그린다.',
    ],
    when: ['우주 · 밤하늘 배경 (다른 우주 견본 모두의 바탕)', '별자리 · 천체 관측 체험', '타이틀 화면 배경'],
    avoid: ['2D 화면 — 대신 미리 그린 별 층(i535)', '별이 수십 개면 충분한 장면 — 스프라이트 몇 개가 낫다'],
    cost: 'light',
    costNote: '점 6만 2천 개를 한 번에 그리기(그리기 호출 1). 점 크기는 대부분 1.6px 이라 픽셀 부담이 작다. 만들 때 계산은 한 번.',
    level: 2,
    must: [
      '별은 THREE.Points 하나에 모두 — 속성 aMag(등급) · aCol(색) · aPh(위상)',
      '재질은 AdditiveBlending · depthWrite false · toneMapped false, frustumCulled false',
      '점 크기는 2.2 + 4.2 × √(흐름) 에 밝은 별 배율, 1.6px 보다 작으면 크기 대신 밝기를 줄인다',
      '한계 등급(uLimit) · 반짝임(uTw) · 색 세기(uColK) · 밝기(uGain) 를 uniform 으로 조절',
      '화면 높이에 맞춰 크기 배율(uScale = 높이 / 900)',
    ],
    done: [
      '어두운 작은 별이 아주 많고 밝은 별은 드물게 섞여 진짜 하늘처럼 보인다',
      '별 색이 파랑 · 하양 · 노랑 · 주황 · 빨강으로 섞여 있다',
      '밝은 별에만 십자 빛살이 있고, 별마다 다른 빠르기로 반짝인다',
      '「한계 등급」을 낮추면 어두운 별부터 사라지고, 폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '등급 · B-V 색 · 위상을 넣은 별 6만 개',
      from: 'demos/demosSpace.ts makeStars() · bvRgb() · kelvinRgb() · STAR_VS 를 정리',
      body: `import * as THREE from 'three';

// B-V 색지수 → 온도 (Ballesteros) → 흑체 색 (kelvinRgb 는 견본의 온도 → RGB 근사)
const bvRgb = (bv: number) => kelvinRgb(4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)));
function sampleBV(r: () => number): number { // 뜨거운 파랑 조금 · 노랑 · 주황 많이 · 빨강 조금
  const u = r();
  if (u < 0.13) return -0.3 + r() * 0.35;
  if (u < 0.32) return 0.05 + r() * 0.3;
  if (u < 0.62) return 0.35 + r() * 0.45;
  if (u < 0.9) return 0.8 + r() * 0.6;
  return 1.4 + r() * 0.5;
}
const n = 62000, R = 400, mMin = -1.4, mMax = 8.4;
const A = Math.pow(10, 0.36 * mMin), B = Math.pow(10, 0.36 * mMax);
const pos = new Float32Array(n * 3), mag = new Float32Array(n), col = new Float32Array(n * 3), ph = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  pos.set([s * Math.cos(a) * R, u * R, s * Math.sin(a) * R], i * 3);
  mag[i] = Math.log10(A + Math.random() * (B - A)) / 0.36; // 어두운 별일수록 많다
  col.set(bvRgb(sampleBV(Math.random)), i * 3);
  ph[i] = Math.random();
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
geo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
// 정점 셰이더 핵심:
//   flux = pow(10.0, -0.4 * (aMag - 1.0));
//   tw = 1.0 + uTw * (0.3 * sin(uTime * (5.0 + aPh * 11.0) + aPh * 61.0) + 0.24 * sin(uTime * (13.0 + aPh * 7.0) + aPh * 23.0));
//   s = 2.2 + 4.2 * sqrt(min(flux, 6.0));  if (s < 1.6) { vB *= s / 1.6; s = 1.6; }
const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
const stars = new THREE.Points(geo, mat);
stars.frustumCulled = false;`,
    },
    pitfalls: [
      { title: '등급을 고르게 뽑으면 밝은 별이 너무 많아 하늘이 하얗게 된다', fix: '어두운 별일수록 많게 log 분포로 뽑는다.' },
      { title: '1px 보다 작은 점이 깜빡거린다', fix: '크기를 1.6px 아래로 줄이지 말고, 그만큼 밝기를 줄인다.' },
      { title: '톤 매핑에 걸리면 별빛 색이 바랜다', fix: '별 재질은 toneMapped false, 밝기는 uGain 으로.' },
    ],
    prev: ['u36'],
    next: ['i523', 'i535'],
    refs: [
      { name: 'Wikipedia — Color index (B-V)', url: 'https://en.wikipedia.org/wiki/Color_index' },
      { name: 'Wikipedia — Apparent magnitude', url: 'https://en.wikipedia.org/wiki/Apparent_magnitude' },
    ],
  },

  i523: {
    id: 'i523',
    summary: '하늘 방향을 은하 좌표로 돌려 위도로 띠를 만들고, 미리 구운 잡음으로 별구름 · 가운데 먼지 줄(파랑을 더 먹어 붉게)을 그려 은하수를 띄운다.',
    terms: [
      { en: 'Milky Way band (galactic coordinates)', ko: '은하 좌표의 위도로 만든 은하수 띠' },
      { en: 'Dust lane extinction (wavelength dependent)', ko: '먼지가 파랑을 더 먹어 붉어지는 가림' },
      { en: 'Pre-baked 2D noise texture', ko: '셰이더에서 계산하지 않고 미리 구운 잡음 그림' },
      { en: 'Airglow', ko: '지평선 근처 대기광 (초록 · 주황)' },
    ],
    goal: '{target}에 은하수 띠를 그려 줘 — 별구름 · 가운데 먼지 줄 · 밝은 팽대부 · 지평선 대기광까지, 느낌은 {style}.',
    targets: ['밤하늘 배경', '천체 관측 체험', '캠핑 · 산 장면'],
    styles: ['사진 같은 은하수', '은은한 동화 밤', '아주 진한 은하수'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 스카이박스 셰이더(Shader Graph Unlit, 큰 구 안쪽)에서 같은 식, 잡음은 미리 만든 텍스처.',
      godot: 'Godot 은 Sky 의 ShaderMaterial(sky 셰이더, EYEDIR 사용)에서 같은 식.',
    },
    principle: [
      '은하 중심 방향 · 기울기로 회전 행렬(galFrame)을 만든다. 하늘 방향 d 를 그 행렬로 돌리면 은하 위도 b · 경도 l 이 나온다.',
      '띠 = exp(-b² / 폭²), 폭은 중심(l = 0)에서 넓게 (0.05 + 0.075·exp(-1.3 l²)). 팽대부는 중심 둘레 밝은 덩어리.',
      '미리 구운 512² 잡음 세 크기로 별구름 · 낟알을 만든다 — 셰이더에서 잡음을 계산하지 않아 가볍다.',
      '먼지 줄은 띠 가운데를 가르는 어두운 줄. 색마다 다르게 가린다: col *= exp(-dust × (1.9, 2.4, 3.2)) — 파랑이 더 먹혀 붉어진다.',
      '별도 같은 회전 행렬로 은하면에 55% 를 몰아 뿌리고, 지평선에 대기광과 산 그림자를 둔다.',
    ],
    when: ['맑은 밤하늘 배경', '별 하늘(i522) 위에 함께', '천체 · 은하 학습'],
    avoid: ['도시 밤 장면 — 빛 공해로 은하수가 안 보이는 게 맞다', '은하를 밖에서 보는 장면 — 대신 나선 은하(i525)'],
    cost: 'light',
    costNote: '하늘 구 픽셀마다 잡음 텍스처 3번 읽기 + 식 몇 줄. 별 6만 점(그리기 1번). 폰도 가볍다.',
    level: 2,
    must: [
      '잡음은 셰이더에서 계산하지 말고 미리 구운 2D 잡음 텍스처(512², 반복 이음)에서 읽는다',
      '하늘 구는 BackSide · depthWrite false · renderOrder -2, 반지름은 별보다 바깥(450)',
      '먼지 가림은 색마다 다르게 exp(-dust × (1.9, 2.4, 3.2)) — 회색으로 어둡게 하지 않는다',
      '별 분포도 같은 은하 회전 행렬로 (은하면에 55%, 폭 0.07)',
      'ACESFilmic 톤 매핑, 은하 밝기는 uGlow × 0.16 정도로 옅게',
    ],
    done: [
      '하늘을 가로지르는 은하수 띠가 보이고, 가운데쯤 밝은 노란 팽대부가 있다',
      '띠 한가운데를 어두운 먼지 줄이 가르고, 그 둘레는 붉은빛이 돈다',
      '지평선 가까이 옅은 초록 · 주황 대기광과 산 그림자가 있다',
      '「먼지 줄」 · 「별구름 밝기」 · 「대기광」 슬라이더가 바로 바뀐다',
    ],
    code: {
      lang: 'glsl',
      title: '은하 좌표 → 띠 · 팽대부 · 먼지 줄 (미리 구운 잡음)',
      from: 'demos/demosSpace.ts MW_FS 를 정리',
      body: `uniform sampler2D uN2;   // 미리 구운 2D 잡음 (R G B A 서로 다른 fbm)
uniform mat3 uGal;       // 세계 → 은하 좌표
uniform float uDust, uGlow, uAir;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 g = uGal * d;
  float b = asin(clamp(g.y, -1.0, 1.0));    // 은하 위도
  float l = atan(g.z, g.x);                 // 은하 경도 (0 = 중심)
  vec2 uv = vec2(l, b) / 6.2831853;
  vec4 n1 = texture(uN2, uv * 2.0), n2 = texture(uN2, uv * 5.0 + 0.37), n3 = texture(uN2, uv * 13.0 + 0.71);
  float l2 = l * l;
  float width = 0.05 + 0.075 * exp(-l2 * 1.3);
  float bb = b + (n1.r - 0.5) * 0.05;
  float band = exp(-bb * bb / (width * width));
  float bulge = exp(-(l2 * 4.5 + bb * bb * 45.0));
  float clouds = smoothstep(0.3, 0.85, n2.g * 0.55 + n1.r * 0.5); clouds *= clouds;
  float grain = 0.55 + 0.9 * n3.a * n3.a;
  float light = band * (0.08 + 1.1 * clouds) * grain + bulge * 1.5 * (0.6 + 0.7 * n2.g) * grain;
  vec3 col = light * mix(vec3(0.6, 0.66, 0.9), vec3(1.0, 0.78, 0.52), clamp(bulge * 1.6 + 0.15 * band, 0.0, 1.0));
  // 먼지 줄 — 파랑을 더 먹어 붉어진다
  float laneC = 0.008 * sin(l * 3.0) + (n1.g - 0.5) * 0.035;
  float laneW = 0.016 + 0.022 * exp(-l2 * 2.0);
  float lane = exp(-pow((b - laneC) / laneW, 2.0)) * smoothstep(2.4, 0.2, abs(l));
  float dust = (lane * smoothstep(0.35, 0.65, n2.r) * 1.6 + band * smoothstep(0.55, 0.8, n3.g) * 0.9) * uDust;
  col *= exp(-dust * vec3(1.9, 2.4, 3.2));
  col *= uGlow * 0.16;
  float alt = max(d.y, 0.0);                // 지평선 대기광
  col += uAir * (vec3(0.03, 0.07, 0.04) * exp(-alt * 9.0) + vec3(0.06, 0.035, 0.015) * exp(-alt * 30.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    },
    pitfalls: [
      { title: '잡음을 셰이더 반복문으로 계산하면 첫 컴파일이 오래 멈춘다', fix: '이 견본은 잡음을 미리 구운 텍스처로 읽어 피했다 (보물 동굴에서 겪은 멈춤).', seen: true },
      { title: '먼지를 회색으로 곱하면 구멍 난 듯 보인다', fix: '색마다 다른 가림(파랑을 더)으로 붉어지게 해야 진짜 먼지 같다.' },
      { title: '은하수를 화면 가로로 곧게 그리면 가짜 같다', fix: '은하 회전 행렬로 하늘에 비스듬히 걸리게, 별도 같은 행렬로 몰아 뿌린다.' },
    ],
    prev: ['i522'],
    next: ['i524', 'i533'],
    refs: [
      { name: 'Wikipedia — Galactic coordinate system', url: 'https://en.wikipedia.org/wiki/Galactic_coordinate_system' },
    ],
  },
  i524: {
    id: 'i524',
    summary: '상자 안을 빛줄로 최대 48걸음 지나며 3D 잡음 텍스처로 밀도를 읽어 빛을 모으고 가림을 곱해, 가운데 별이 비추는 부피 성운을 그린다.',
    terms: [
      { en: 'Volumetric ray marching', ko: '빛줄을 한 걸음씩 나아가며 부피 속 빛을 모으기' },
      { en: 'Data3DTexture (3D noise)', ko: '미리 구운 64³ 3D 잡음 텍스처' },
      { en: 'Emission-absorption (Beer-Lambert)', ko: '빛을 더하고 지나온 만큼 exp 로 가림' },
      { en: 'Jittered start (dithering)', ko: '픽셀마다 시작점을 흔들어 줄무늬 없애기' },
    ],
    goal: '{target}에 레이마칭 부피 성운을 넣어 줘 — 가운데 별빛으로 청록 → 빨강, 먼지는 뒤를 가리게, 분위기는 {style}.',
    targets: ['우주 게임 배경', '컷신 · 메뉴 화면', '별의 탄생 학습'],
    styles: ['허블 사진처럼 화려하게', '어둡고 신비하게', '파스텔 우주'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 상자 메시에 Raymarch 하는 HLSL 셰이더(3D Texture 샘플) — HDRP 라면 Local Volumetric Fog 로 비슷하게.',
      godot: 'Godot 은 FogVolume + fog 셰이더(DENSITY · ALBEDO · EMISSION)로 부피를 만들 수 있다.',
    },
    principle: [
      '성운은 상자(크기 2, 4.6배) 하나. 뒷면을 그리며 카메라에서 나온 빛줄이 상자를 들어가고 나오는 거리(boxHit)를 구한다.',
      '그 사이를 같은 간격(3.4 / 걸음 수)으로 나아가며 3D 잡음 두 번으로 밀도를 읽는다. 공 껍질 모양 · 문턱(0.74)으로 덩어리를 만든다.',
      '각 걸음에서 별까지 거리로 빛 세기를 구하고 (1 / (0.06 + 5r²)), 가까우면 청록(산소) · 멀면 빨강(수소)으로 빛을 더한다.',
      '지나온 밀도만큼 투과율 T 를 exp 로 줄인다 — 먼지가 많으면 더 많이 가려 뒤 별이 숨는다. T 가 0.02 아래면 일찍 멈춘다.',
      '모든 픽셀이 같은 자리에서 시작하면 줄무늬가 생기므로 픽셀마다 시작점을 한 걸음 안에서 흔든다.',
    ],
    when: ['우주 배경의 주인공 성운', '카메라가 둘레를 도는 컷신 · 메뉴', '연기 · 구름 덩어리를 부피로 보여 줄 때'],
    avoid: ['화면 전체를 덮는 크기로 폰에서 — 픽셀 수 × 48걸음이 무겁다. 대신 2D 성운 그림(u54)', '셰이더에서 잡음을 계산 — 텍스처로 읽어야 한다'],
    cost: 'heavy',
    costNote: '픽셀마다 최대 48걸음 × 3D 텍스처 2번 = 96번 읽기. 성운이 화면을 많이 덮으면 폰에서 무겁다 — 걸음 수를 24 정도로, 해상도를 반으로.',
    level: 3,
    must: [
      '밀도는 미리 구운 3D 잡음 텍스처(Data3DTexture 64³, RG, 반복 이음)에서 읽는다 — 셰이더 안 잡음 계산 금지',
      '상자는 BackSide 로 그리고, 카메라 위치를 상자 물체 좌표로 바꿔(uCamObj) 넘긴다',
      '반복문 상한은 상수(48), 실제 걸음 수는 uniform 으로 그 안에서 break',
      '시작점을 픽셀마다 흔든다 (gl_FragCoord 해시 × 한 걸음)',
      '섞기는 CustomBlending(One, OneMinusSrcAlpha) — 결과가 미리 곱한 빛 + 투과율',
    ],
    done: [
      '카메라가 둘레를 돌면 성운이 진짜 덩어리처럼 겹겹이 보인다 (납작한 그림이 아니다)',
      '가운데 별 가까이는 청록, 바깥은 빨강, 가는 실에 주황 테가 있다',
      '먼지 덩어리가 뒤의 별 · 빛을 가린다',
      '「걸음 수」 8 ~ 48 로 줄이면 빨라지는 대신 거칠어진다 — 폰에서 맞는 값을 찾는다',
    ],
    code: {
      lang: 'glsl',
      title: '상자 안 레이마칭 — 밀도 · 별빛 · 가림',
      from: 'demos/demosSpace.ts NEB_FS 를 정리',
      body: `uniform highp sampler3D uN3;           // 미리 구운 64³ 잡음 (r = fbm, g = 능선)
uniform vec3 uCamObj, uStarPos; uniform float uTime, uDens, uStar; uniform int uSteps;
varying vec3 vObj;
vec2 boxHit(vec3 ro, vec3 rd){
  vec3 inv = 1.0 / rd, t0 = (-1.0 - ro) * inv, t1 = (1.0 - ro) * inv;
  vec3 a = min(t0, t1), b = max(t0, t1);
  return vec2(max(max(a.x, a.y), a.z), min(min(b.x, b.y), b.z));
}
void main(){
  vec3 ro = uCamObj, rd = normalize(vObj - uCamObj);
  vec2 h = boxHit(ro, rd); h.x = max(h.x, 0.0);
  if (h.y <= h.x) discard;
  float ds = 3.4 / float(uSteps);
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = h.x + ds * jit;                       // 줄무늬 없애기
  vec3 col = vec3(0.0); float T = 1.0;
  for (int i = 0; i < 48; i++) {
    if (i >= uSteps || t > h.y || T < 0.02) break;
    vec3 p = ro + rd * t; float r = length(p);
    if (r < 1.0) {
      vec2 a = texture(uN3, p * 0.42 + vec3(0.13, uTime * 0.003, 0.41)).rg;
      vec2 b = texture(uN3, p * 1.1 + vec3(a.r * 0.35, 0.17, uTime * 0.005)).rg;
      float shell = smoothstep(0.95, 0.45, r + (a.g - 0.5) * 0.7) * smoothstep(0.08, 0.4, r) * smoothstep(1.0, 0.82, r);
      float d = max(a.r * 0.85 + b.g * 0.6 - 0.74, 0.0) * shell * 7.0 * uDens;
      if (d > 0.001) {
        float rs = length(p - uStarPos);
        float lightI = uStar / (0.06 + rs * rs * 5.0);
        vec3 em = mix(vec3(0.05, 0.7, 1.0), vec3(0.9, 0.06, 0.14), smoothstep(0.2, 0.58, rs)); // 산소 → 수소
        float dust = smoothstep(0.42, 0.72, b.r) * smoothstep(0.35, 0.8, r);
        col += T * em * d * (lightI * (1.0 - dust * 0.85) + 0.04) * ds * 1.8;
        T *= exp(-d * (0.8 + dust * 9.0) * ds * 3.0);       // 먼지는 더 많이 가린다
      }
    }
    t += ds;
  }
  gl_FragColor = vec4(col, 1.0 - T);
}`,
    },
    pitfalls: [
      { title: '셰이더 안에서 3D 잡음을 반복문으로 계산하면 컴파일 · 실행 모두 느리다', fix: '잡음은 64³ Data3DTexture 로 미리 굽고 읽기만 한다 (보물 동굴의 20초 멈춤과 같은 원인).', seen: true },
      { title: '시작점을 흔들지 않으면 동심원 줄무늬가 보인다', fix: '픽셀마다 한 걸음 안에서 시작점을 흔든다.' },
      { title: '카메라를 세계 좌표 그대로 넘기면 상자를 키우거나 돌릴 때 어긋난다', fix: '상자 matrixWorld 의 역행렬로 카메라를 물체 좌표로 바꿔 넘긴다.' },
      { title: '반복문 상한을 uniform 으로 쓰면 일부 기기에서 컴파일이 안 된다', fix: '상한은 상수(48), uniform 은 그 안에서 break.' },
    ],
    prev: ['i523', 'u54'],
    next: ['i525', 'i56'],
    refs: [
      { name: 'three.js 예제 — webgl_volume_cloud', url: 'https://threejs.org/examples/#webgl_volume_cloud' },
      { name: 'Wikipedia — Volume ray casting', url: 'https://en.wikipedia.org/wiki/Volume_ray_casting' },
    ],
  },

  i525: {
    id: 'i525',
    summary: '별 20만 개가 반지름마다 조금씩 돌아간 타원 궤도를 정점 셰이더에서 돌아, 타원이 몰리는 곳에 저절로 나선 팔이 생기는 은하를 만든다.',
    terms: [
      { en: 'Density wave theory (spiral arms)', ko: '돌아간 타원 궤도가 몰린 곳이 팔로 보인다는 이론' },
      { en: 'GPU orbit animation (vertex shader)', ko: '궤도 계산을 정점 셰이더에서 — CPU 0' },
      { en: 'HDR accumulation + luminance tone map', ko: '반정밀 타깃에 더한 뒤 밝기만 눌러 색 지키기' },
    ],
    goal: '{target}에 입자 20만 개 나선 은하를 만들어 줘 — 타원 궤도가 몰려 팔이 생기게, 분위기는 {style}.',
    targets: ['우주 배경', '타이틀 화면', '은하 학습 체험'],
    styles: ['사진처럼 화려하게', '부드러운 빛 덩어리', '파란 팔 · 노란 핵 대비'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 VFX Graph 에서 입자마다 반지름 · 위상을 속성으로 두고 Update 에서 같은 식으로 위치를 계산.',
      godot: 'Godot 은 GPUParticles3D 의 process 셰이더(또는 MultiMesh + vertex 셰이더)에서 같은 궤도 식.',
    },
    principle: [
      '별마다 반지름 a · 처음 각 · 높이 · 종류만 저장한다. 위치는 정점 셰이더가 시간으로 계산한다 — CPU 는 아무것도 안 한다.',
      '각 별은 찌그러진 타원(이심률 e)을 돈다. 타원의 방향을 반지름에 비례해 조금씩 돌린다 (th = a × 꼬임 0.38).',
      '안쪽 타원과 바깥 타원이 조금씩 어긋나 겹치는 곳에 별이 몰린다 — 그것이 팔이다. 팔을 그리지 않았는데 팔이 생긴다.',
      '종류별로 다르게: 팽대부(늙은 주황, 둥글게) · 젊은 파랑(팔에 많음) · 분홍 수소 구름(팔 자리에 머묾) · 먼지(일반 섞기로 가림, 조금 늦게).',
      '수만 개를 더하면 하얗게 잘리므로 반정밀 타깃에 더한 뒤 밝기(휘도)만 눌러 색을 지킨다.',
    ],
    when: ['우주 배경의 은하', '입자 수십만 개를 CPU 부담 없이 움직이고 싶을 때', '밀도파 · 궤도 학습'],
    avoid: ['밤하늘에서 본 은하수 — 대신 은하수 띠(i523)', '폰에서 20만 개 그대로 — 입자 수를 반 이하로'],
    cost: 'heavy',
    costNote: '점 20만 + 먼지 1만 4천을 매 장면 정점 셰이더로 (그리기 2번). 겹쳐 더하는 픽셀이 많고 반정밀 렌더 타깃 1장. 폰은 5만 개 정도로.',
    level: 3,
    must: [
      '위치는 정점 셰이더에서 — 속성 aOrbit(a, 처음 각, 높이, 종류) · aCol · aB 만 넣는다',
      '타원 방향 th = a × uTwist(0.38), 이심률 uEcc(0.36)는 안쪽(a < 2)에서 0 부터 늘고 바깥으로 줄게',
      '각속도 om = (1 - exp(-1.4a)) / a — 바깥일수록 느리게',
      '별은 AdditiveBlending · 먼지는 일반 섞기(알파) · renderOrder 를 먼지가 나중에',
      'HDR 타깃(HalfFloat)에 더한 뒤 휘도만 눌러(L·(1 + L/9)/(1 + L)) 톤 매핑',
    ],
    done: [
      '팔을 따로 그리지 않았는데 은하가 돌며 두 갈래 나선 팔이 또렷이 보인다',
      '핵은 노랗고 팔에는 파란 별 · 분홍 구름, 팔 안쪽 가장자리에 어두운 먼지 줄이 있다',
      '「팔 꼬임」 · 「타원 찌그러짐」을 0 으로 하면 팔이 사라지고 둥근 원반이 된다',
      '핵이 하얗게 날아가지 않고 노란빛 그대로 밝다 (「노출」 조절)',
    ],
    code: {
      lang: 'glsl',
      title: '돌아간 타원 궤도 — 정점 셰이더',
      from: 'demos/demosSpace.ts GAL_VS 를 정리 (자료는 galaxyData())',
      body: `attribute vec4 aOrbit;   // x 반지름 a · y 처음 각 · z 높이 · w 종류 (1 핵 · 2 수소 구름 · 3 먼지 · 4 번진 빛)
attribute vec3 aCol; attribute float aB;
uniform float uTime, uTwist, uEcc, uProj, uSpeed, uSize, uLag;
varying vec3 vCol; varying float vB;
void main(){
  float a = aOrbit.x, kind = aOrbit.w;
  // 이심률: 핵은 둥글게, 안쪽에서 늘고 바깥으로 줄게
  float e = kind == 1.0 ? 0.0 : uEcc * (a < 2.0 ? a / 2.0 : 1.0 - 0.75 * clamp((a - 2.0) / 8.0, 0.0, 1.0));
  float th = a * uTwist + (kind == 3.0 ? uLag : 0.0);   // 반지름마다 조금씩 돌린 타원 — 몰린 곳이 팔
  float om = (1.0 - exp(-a * 1.4)) / max(a, 0.2);        // 바깥일수록 느리게
  float ph = aOrbit.y + (kind == 2.0 ? 0.0 : uTime * om * uSpeed); // 수소 구름은 팔 자리에 머문다
  vec2 el = vec2(a * cos(ph), a * (1.0 - e) * sin(ph));
  float c = cos(th), s = sin(th);
  vec3 p = vec3(el.x * c - el.y * s, aOrbit.z, el.x * s + el.y * c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = uSize * uProj / -mv.z * (kind == 2.0 ? 2.8 : kind == 3.0 ? 9.0 : kind == 4.0 ? 8.0 : kind == 1.0 ? 1.2 : 1.0);
  vB = aB;
  if (sz < 1.5) { vB *= sz / 1.5; sz = 1.5; }
  gl_PointSize = sz;
  vCol = aCol;
}`,
    },
    pitfalls: [
      { title: '별 위치를 CPU 에서 매 프레임 계산하면 20만 개에서 멈춘다', fix: '궤도 식은 정점 셰이더로. CPU 는 시간 하나만 넘긴다.' },
      { title: '그냥 더하기로 그리면 핵이 하얗게 날아간다', fix: '반정밀 타깃에 모은 뒤 휘도만 눌러 색을 지킨다 (견본 HdrPass).' },
      { title: '먼지도 더하기로 그리면 가리지 않고 밝아진다', fix: '먼지는 일반 섞기(알파) · 아주 옅게(0.08), 별보다 나중에 그린다.' },
    ],
    prev: ['i522', 'u36'],
    next: ['i529', 'i523'],
    refs: [
      { name: 'Wikipedia — Density wave theory', url: 'https://en.wikipedia.org/wiki/Density_wave_theory' },
    ],
  },

  i526: {
    id: 'i526',
    summary: '대기 껍질 구에서 빛줄을 12걸음 지나며 레일리(파랑) · 미(해 쪽 빛무리) 산란을 모아 행성 테두리가 빛나게 하고, 땅 · 구름 · 밤쪽 도시 불빛은 3D 잡음으로 그린다.',
    terms: [
      { en: 'Atmospheric scattering (single scattering)', ko: '빛줄을 따라 산란 빛을 모으는 대기' },
      { en: 'Rayleigh / Mie phase function', ko: '방향에 따른 산란 세기 (파랑 · 해 둘레 빛무리)' },
      { en: 'Ray-sphere intersection', ko: '빛줄이 구를 들어가고 나오는 거리' },
      { en: 'Day-night terminator + city lights', ko: '낮밤 경계 · 밤쪽 도시 불빛' },
    ],
    goal: '{target}을(를) 대기가 있는 행성으로 그려 줘 — 테두리 산란 빛 · 노을빛 낮밤 경계 · 구름 · 밤쪽 도시 불빛, 느낌은 {style}.',
    targets: ['지구 같은 행성', '우주 게임 행성', '지구 학습 체험'],
    styles: ['우주에서 본 사진처럼', '밝은 그림책 행성', '밤쪽이 보이는 극적인 구도'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 행성 셰이더 + 대기 구(Additive) HLSL 셰이더로 같은 계산 — 커스텀 셰이더가 필요하다.',
      godot: 'Godot 은 행성 spatial 셰이더 + 조금 큰 구에 대기 셰이더(blend_add, unshaded).',
    },
    principle: [
      '행성(반지름 1) 바깥에 조금 큰 대기 구(1.06)를 더하기로 겹친다. 대기 구 픽셀마다 빛줄이 대기를 지나는 구간을 구 교차로 구한다 (땅에 닿으면 거기까지).',
      '그 구간을 12걸음 나눠, 각 점의 공기 밀도(높이에 따라 exp(-5h))와 해까지 · 눈까지 지나는 공기 두께로 빛을 모은다.',
      '레일리는 파장별 세기(0.16, 0.4, 1.0)로 파랑이 세고, 해까지 공기가 두꺼우면 파랑이 먼저 사라져 노을빛이 된다. 미는 해 쪽으로 몰린 빛무리(g 0.78).',
      '땅 · 바다 · 얼음 · 사막 · 구름 · 도시 불빛은 법선 방향으로 3D 잡음을 읽어 이음매 없이 칠한다. 밤쪽(N·L < 0)에만 도시 불빛.',
    ],
    when: ['우주에서 본 지구 · 행성', '낮밤 경계 · 노을이 보이는 구도', '구름 그림자 · 바다 반짝임까지 필요한 행성'],
    avoid: ['땅 위에서 올려다본 하늘 — 대신 대기 산란 하늘(i224)', '작게 보이는 행성 여러 개 — 텍스처 행성 + 테두리 빛(i10) 이 가볍다'],
    cost: 'medium',
    costNote: '대기 구 픽셀마다 12걸음(exp 몇 번), 행성 픽셀마다 3D 텍스처 약 12번. 행성이 화면을 크게 덮으면 폰에서 무겁다.',
    level: 3,
    must: [
      '대기 구: AdditiveBlending · depthWrite false · depthTest false · renderOrder 2, 반지름 1.06',
      '빛줄 구간은 대기 구 교차 [t0, t1], 땅에 닿으면 t1 = 땅 교차 — 12걸음',
      '산란 = 레일리(0.16, 0.4, 1.0) × 0.75(1 + μ²) + 미 (g 0.78) × 해 쪽 색, 투과율은 exp(-β × 공기 두께)',
      '땅 무늬 · 구름 · 도시는 3D 잡음 텍스처를 물체 법선으로 읽는다 (UV 이음매 없음)',
      '구름 그림자는 해 쪽으로 조금(0.025) 옮긴 자리의 구름으로',
    ],
    done: [
      '행성 테두리가 파랗게 빛나고, 낮밤 경계 쪽 대기는 주황 노을빛이다',
      '밤쪽에 도시 불빛 점이 보이고 구름이 그 위를 가린다',
      '바다에 해 반짝임, 땅에 구름 그림자가 보인다',
      '「대기 짙기」 · 「구름 양」 · 「도시 불빛」 · 「자전 빠르기」가 바로 바뀐다',
    ],
    code: {
      lang: 'glsl',
      title: '대기 구 — 12걸음 레일리 · 미 산란',
      from: 'demos/demosSpace.ts ATMO_FS 를 정리',
      body: `uniform vec3 uSun; uniform float uRA, uDens;   // uRA = 대기 반지름 1.06
varying vec3 vWP;
vec2 sph(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
void main(){
  vec3 ro = cameraPosition, rd = normalize(vWP - cameraPosition);
  vec2 a = sph(ro, rd, uRA), p = sph(ro, rd, 1.0);
  float t0 = max(a.x, 0.0), t1 = a.y;
  if (p.x > 0.0) t1 = min(t1, p.x);             // 땅에 닿으면 거기까지
  if (t1 <= t0) discard;
  float ds = (t1 - t0) / 12.0;
  vec3 betaR = vec3(0.16, 0.4, 1.0);            // 파랑이 가장 많이 흩어진다
  float mu = dot(rd, uSun);
  float phR = 0.75 * (1.0 + mu * mu);
  float g = 0.78;
  float phM = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.05;
  vec3 sum = vec3(0.0), sumM = vec3(0.0); float od = 0.0;
  for (int i = 0; i < 12; i++) {
    vec3 q = ro + rd * (t0 + ds * (float(i) + 0.5));
    float dn = exp(-(length(q) - 1.0) / (uRA - 1.0) * 5.0);   // 높을수록 옅은 공기
    od += dn * ds;
    float cs = dot(normalize(q), uSun);
    float lit = smoothstep(-0.22, 0.08, cs);                  // 밤쪽은 빛을 못 받음
    float air = 1.0 / (max(cs, 0.0) * 0.9 + 0.1);             // 해까지 공기 두께
    vec3 Tsun = exp(-betaR * air * 0.5 * uDens - vec3(0.02) * air);
    vec3 Tview = exp(-betaR * od * 7.0 * uDens);
    sum += dn * lit * Tsun * Tview * ds;
    sumM += dn * dn * lit * Tsun * Tview * ds;
  }
  vec3 col = (sum * betaR * phR * 20.0 + sumM * phM * 34.0 * vec3(1.0, 0.85, 0.7)) * uDens;
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '대기 구에 깊이 검사를 켜면 행성 뒤쪽 테두리가 잘린다', fix: '대기 구는 depthTest false 로 행성 위에 더하고, 땅에 닿는 곳은 셰이더의 구 교차로 자른다.' },
      { title: '구 UV 로 땅 무늬를 그리면 이음매 · 극 찌그러짐이 보인다', fix: '물체 법선으로 3D 잡음을 읽으면 이음매가 없다.' },
      { title: '해 방향을 세계 좌표로만 넘기면 행성이 돌 때 구름 그림자가 어긋난다', fix: '행성 역행렬로 바꾼 해 방향(uSunObj)을 따로 넘긴다.' },
    ],
    prev: ['i224', 'i10'],
    next: ['i527', 'i528'],
    refs: [
      { name: 'Wikipedia — Rayleigh scattering', url: 'https://en.wikipedia.org/wiki/Rayleigh_scattering' },
    ],
  },

  i527: {
    id: 'i527',
    summary: '그림자 지도 없이 — 행성 픽셀에서 해 쪽으로 쏜 빛줄이 고리 면과 만나는 반지름의 밀도로 고리 그림자를, 고리 픽셀에서 쏜 빛줄이 행성에 닿으면 행성 그림자를 계산한다.',
    terms: [
      { en: 'Analytic shadows (ray-plane / ray-sphere)', ko: '식으로 푸는 그림자 — 빛줄이 면 · 구와 만나는지' },
      { en: 'Ring density function', ko: '반지름에 따른 고리 짙기 (카시니 틈 · 엥케 틈)' },
      { en: 'Oblate spheroid', ko: '납작한 회전 타원체 (y 0.9배)' },
    ],
    goal: '{target}에 고리 행성을 만들어 줘 — 고리 그림자 · 행성 그림자를 그림자 지도 없이 식으로, 느낌은 {style}.',
    targets: ['토성 같은 고리 행성', '우주 게임 배경 행성', '행성 학습 체험'],
    styles: ['탐사선 사진처럼', '부드러운 그림책', '해가 비스듬한 극적인 빛'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 행성 · 고리 두 재질의 HLSL 셰이더에서 같은 빛줄 교차식 (그림자 지도 없이).',
      godot: 'Godot 은 행성 · 고리 spatial 셰이더에서 같은 식, 고리는 cull_disabled · blend_mix.',
    },
    principle: [
      '행성과 고리를 같은 묶음(그룹) 좌표에서 계산한다. 해 방향 · 카메라 위치를 그룹 역행렬로 바꿔 넘긴다.',
      '행성 픽셀: 해 쪽으로 빛줄을 쏘아 고리 면(y = 0)과 만나는 지점까지 t = -y / 해.y. 그 점의 반지름으로 고리 밀도를 읽어 그만큼 어둡게.',
      '고리 픽셀: 해 쪽으로 쏜 빛줄이 납작한 행성(y 를 1/0.9 배로 펴서 구로)과 앞에서 만나면 행성 그림자 (밝기 0.04).',
      '고리 밀도는 반지름 함수 하나: C 고리 옅게 · B 고리 짙게 · 카시니 틈 · A 고리 · 엥케 틈 · 잔 홈. 같은 함수를 둘이 함께 쓴다.',
      '고리를 해가 비추는 면에서 보면 밝고, 뒷면에서 보면 얇은 곳만 빛이 새어 옅게 밝다.',
    ],
    when: ['고리 행성이 주인공인 장면', '그림자 지도 없이 또렷한 그림자가 필요한 모양 (면 · 구)', '폰에서도 고리 그림자를 보여 주고 싶을 때'],
    avoid: ['모양이 복잡한 물체의 그림자 — 대신 그림자 지도(u17)', '고리가 작은 점처럼 보이는 먼 행성 — 텍스처 한 장이면 충분'],
    cost: 'medium',
    costNote: '그림자 지도 없음. 행성 픽셀마다 3D 텍스처 2번 + 고리 함수 1번, 고리 픽셀마다 구 교차 1번. 고리 RingGeometry 256 조각.',
    level: 3,
    must: [
      '해 방향 · 카메라 위치를 그룹 역행렬로 바꿔(uSunG · uCamG) 행성 · 고리에 같이 넘긴다',
      '고리 밀도 함수 ringD(r) 를 행성 · 고리 셰이더가 함께 쓴다 (같은 문자열)',
      '행성이 납작(scale.y 0.9)하면 그림자 계산도 y 를 1/0.9 로 편 공간에서',
      '고리는 DoubleSide · transparent · depthWrite false · renderOrder 1, 밀도 0.002 아래는 discard',
      '잔 홈은 fwidth 로 멀리서는 줄여 깜빡임(모아레)을 막는다',
    ],
    done: [
      '행성 위에 고리 그림자 띠가 또렷하고, 카시니 틈 자리는 그림자도 비어 있다',
      '고리 뒤쪽이 행성 그림자에 가려 어둡게 끊긴다',
      '해가 움직이면 두 그림자가 함께 옮겨 간다 — 「해 방향」 · 「고리 기울기」 조절',
      '멀리서 봐도 고리 잔 홈이 깜빡이지 않는다',
    ],
    code: {
      lang: 'glsl',
      title: '고리 밀도 함수 + 행성 위 고리 그림자 + 고리 위 행성 그림자',
      from: 'demos/demosSpace.ts RING_FN · SAT_FS · RING_FS 를 정리',
      body: `float ringD(float r, float fw){
  float d = 0.0;
  d += smoothstep(1.24, 1.27, r) * (1.0 - smoothstep(1.50, 1.53, r)) * 0.16;                      // C 고리
  d += smoothstep(1.52, 1.55, r) * (1.0 - smoothstep(1.92, 1.95, r)) * (0.82 + 0.14 * sin(r * 47.0)); // B 고리
  d += smoothstep(2.02, 2.04, r) * (1.0 - smoothstep(2.26, 2.28, r)) * 0.62;                      // A 고리 (사이 = 카시니 틈)
  d *= 1.0 - 0.92 * exp(-pow((r - 2.215) / 0.006, 2.0));                                           // 엥케 틈
  float g = sin(r * 420.0) * sin(r * 173.0 + 1.0) * 0.5 + sin(r * 97.0 + 2.0) * 0.5;
  d *= 1.0 + 0.22 * g * (1.0 - smoothstep(0.004, 0.03, fw * 120.0));                                // 멀면 잔 홈 줄이기
  return clamp(d, 0.0, 1.0);
}
// 행성 (vGP = 그룹 좌표 점, uSunG = 그룹 좌표 해 방향)
float sh = 1.0;
if (abs(uSunG.y) > 1e-4) {
  float t = -vGP.y / uSunG.y;                      // 해 쪽 빛줄이 고리 면(y = 0)과 만나는 거리
  if (t > 0.0) sh = 1.0 - 0.9 * ringD(length(vGP.xz + uSunG.xz * t), 0.0) * uRing;
}
// 고리 — 해 쪽 빛줄이 납작한 행성(y 를 1/uFlat 로 펴서 구)에 앞에서 닿는가
vec3 ro = vGP * vec3(1.0, 1.0 / uFlat, 1.0);
vec3 rd = normalize(uSunG * vec3(1.0, 1.0 / uFlat, 1.0));
float b = dot(ro, rd), hh = b * b - (dot(ro, ro) - 1.0);
float shadow = (hh > 0.0 && -b - sqrt(hh) > 0.0) ? 0.04 : 1.0;`,
    },
    pitfalls: [
      { title: '고리에 그림자 지도를 쓰면 얇은 고리 그림자가 계단 지거나 사라진다', fix: '면 · 구 사이 그림자는 식으로 풀면 해상도와 상관없이 또렷하다.' },
      { title: '납작한 행성을 구로 계산하면 그림자 끝이 어긋난다', fix: '고리 점 · 해 방향의 y 를 1/0.9 로 펴서 단위 구와 교차한다.' },
      { title: '고리 잔 홈이 멀리서 무지개 줄무늬로 깜빡인다', fix: 'fwidth(r) 로 픽셀 하나에 홈이 여러 개 들어가면 홈 세기를 줄인다.' },
    ],
    prev: ['i526'],
    next: ['i531', 'i528'],
    refs: [
      { name: 'Wikipedia — Rings of Saturn', url: 'https://en.wikipedia.org/wiki/Rings_of_Saturn' },
    ],
  },

  i528: {
    id: 'i528',
    summary: '흐르는 3D 잡음으로 태양 표면 쌀알 무늬 · 중위도 흑점 · 가장자리 어둡게(주연 감광)를 칠하고, 둘레 판에 줄무늬 코로나 · 붉은 채층 · 고리 홍염을 그린다.',
    terms: [
      { en: 'Solar granulation', ko: '태양 표면 쌀알 무늬 (대류 칸)' },
      { en: 'Limb darkening', ko: '가장자리가 어두워 보이는 주연 감광' },
      { en: 'Corona streamers (polar noise)', ko: '극좌표로 잡음을 읽은 줄무늬 빛' },
      { en: 'Prominence loops', ko: '가장자리에 발을 둔 반타원 고리 홍염' },
    ],
    goal: '{target}을(를) 태양으로 그려 줘 — 쌀알 무늬 · 흑점 · 주연 감광 · 줄무늬 코로나 · 고리 홍염까지, 느낌은 {style}.',
    targets: ['태양 학습 체험', '우주 배경의 해', '보스 등장 연출'],
    styles: ['관측 사진처럼', '이글거리는 게임 연출', '부드러운 그림책 해'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 구에 3D Texture 잡음 HLSL 셰이더, 코로나는 카메라를 보는 Quad 에 더하기 셰이더.',
      godot: 'Godot 은 구 spatial 셰이더(unshaded) + 빌보드 Quad 에 blend_add 셰이더.',
    },
    principle: [
      '표면 밝기는 3D 잡음을 구 법선으로 읽는다. 능선 잡음 두 크기(10 · 23배)의 제곱을 빼면 밝은 칸 · 어두운 틈 쌀알 무늬가 된다. 잡음 좌표를 천천히 흘린다.',
      '흑점은 큰 잡음이 문턱(0.74 · 0.78)을 넘는 곳, 위도 띠(|y| 0.06 ~ 0.6) 안에서만. 둘레 가장자리 쪽에 밝은 백반.',
      '주연 감광: 가장자리로 갈수록(시선과 법선 μ 가 작을수록) 어둡다 — 1 - 0.6(1-μ) - 0.22(1-μ)².',
      '코로나는 해를 덮는 판 하나에 그린다. 각도(atan)와 반지름으로 잡음을 읽어 바깥으로 뻗는 줄무늬 빛, 바로 가장자리엔 붉은 채층 테.',
      '홍염은 가장자리에 발을 둔 반타원 고리까지의 거리로 밝기를 주고, 잡음으로 실 · 흐름을 더한다.',
    ],
    when: ['태양 · 별을 가까이서 보여 줄 때', '보스 · 마법 구슬처럼 이글거리는 공', '우주 배경의 큰 해'],
    avoid: ['멀리 작게 보이는 해 — 빛 스프라이트 하나면 충분', '셰이더에서 3D 잡음을 계산 — 텍스처로 읽을 것'],
    cost: 'medium',
    costNote: '태양 구 픽셀마다 3D 텍스처 약 6번, 코로나 판 픽셀마다 2D 텍스처 3번 + 홍염 3개 × 3번. 화면을 크게 덮으면 폰에서 조금 무겁다.',
    level: 2,
    must: [
      '표면 무늬는 3D 잡음 텍스처를 구 법선(vN)으로 — UV 이음매 없이',
      '흑점은 위도 띠 안에서만, 반암부(0.74) · 암부(0.78) 두 문턱',
      '주연 감광은 μ = 법선 · 시선 으로',
      '코로나 판은 해보다 크게(7.2), AdditiveBlending · depthWrite false, 해 안쪽(r < 0.97)은 discard',
      'ACESFilmic 톤 매핑 — 밝은 표면이 하얗게만 날아가지 않게',
    ],
    done: [
      '표면에 쌀알 무늬가 천천히 끓고, 중위도에 흑점 무리가 있다',
      '가장자리가 가운데보다 어둡고 붉다 (주연 감광)',
      '둘레로 줄무늬 코로나가 뻗고, 가장자리에 붉은 채층 테 · 고리 홍염이 흐른다',
      '「흑점」 · 「코로나 세기」 · 「홍염」 조절이 바로 바뀐다',
    ],
    code: {
      lang: 'glsl',
      title: '태양 표면 — 쌀알 · 흑점 · 주연 감광',
      from: 'demos/demosSpace.ts SUN_FS 를 정리',
      body: `uniform highp sampler3D uN3; uniform float uTime, uSpots;
varying vec3 vN, vWN, vWP;
void main(){
  vec3 n = normalize(vN);
  float mu = max(dot(normalize(vWN), normalize(cameraPosition - vWP)), 0.0);
  float tt = uTime;
  vec3 w = vec3(texture(uN3, n * 0.9 + vec3(tt * 0.004)).r, texture(uN3, n * 0.9 + vec3(0.5, tt * 0.003, 0.2)).r, 0.0) - 0.5;
  float gA = texture(uN3, n * 10.0 + vec3(w.xy * 0.18, tt * 0.006)).g;   // 능선 잡음 (쌀알)
  float gB = texture(uN3, n * 23.0 + vec3(tt * 0.01, w.x * 0.2, 0.3)).g;
  float sup = texture(uN3, n * 0.8 + vec3(0.3, 0.1, tt * 0.002)).r;
  float I = 1.0 + 0.3 * (sup - 0.5) - 0.42 * gA * gA - 0.18 * gB * gB;  // 밝은 칸 · 어두운 틈
  // 흑점 — 중위도 띠 안에서만
  float s = texture(uN3, n * 0.62 + vec3(0.31, 0.11, 0.73)).r + (gA - 0.5) * 0.03;
  float belt = smoothstep(0.06, 0.18, abs(n.y)) * smoothstep(0.6, 0.38, abs(n.y));
  float pen = smoothstep(0.74, 0.765, s) * belt * uSpots;
  float umb = smoothstep(0.78, 0.79, s) * belt * uSpots;
  I *= 1.0 - pen * 0.5 - umb * 0.42;
  I += smoothstep(0.6, 0.7, s) * (1.0 - pen) * belt * pow(1.0 - mu, 1.5) * 0.7 * uSpots; // 백반
  float L = I * (1.0 - 0.6 * (1.0 - mu) - 0.22 * (1.0 - mu) * (1.0 - mu));               // 주연 감광
  vec3 col = mix(vec3(0.85, 0.14, 0.0), vec3(1.0, 0.45, 0.06), smoothstep(0.05, 0.55, L));
  col = mix(col, vec3(1.0, 0.78, 0.4), smoothstep(0.65, 1.1, L));
  gl_FragColor = vec4(col * L * 1.7, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
// 코로나 판: r = length(vP), a = atan(vP.y, vP.x) / TAU 로 잡음을 읽어 줄무늬,
//   glow = exp(-x * 12.0) * 0.35 + pow(r, -8.0) * 0.3 * streak + exp(-x * 1.8) * 0.008 * streak; (x = r - 1)
//   채층 = vec3(1.0, 0.18, 0.05) * exp(-x * 70.0) * 1.6`,
    },
    pitfalls: [
      { title: '구 UV 로 무늬를 그리면 극에서 무늬가 몰리고 이음매가 보인다', fix: '구 법선으로 3D 잡음을 읽는다.' },
      { title: '코로나 판을 해 안쪽까지 칠하면 표면이 뿌옇게 덮인다', fix: '반지름 0.97 안은 discard, 가장자리는 smoothstep 으로 이어 붙인다.' },
      { title: '셰이더 안에서 3D 잡음을 여러 번 계산하면 느리고 컴파일이 오래 걸린다', fix: '64³ 잡음 텍스처를 한 번 굽고 여러 크기로 읽는다.', seen: true },
    ],
    prev: ['i526'],
    next: ['i534', 'i529'],
    refs: [
      { name: 'Wikipedia — Limb darkening', url: 'https://en.wikipedia.org/wiki/Limb_darkening' },
      { name: 'Wikipedia — Granule (solar physics)', url: 'https://en.wikipedia.org/wiki/Granule_(solar_physics)' },
    ],
  },

  i529: {
    id: 'i529',
    summary: '픽셀마다 빛줄을 슈바르츠실트 근사 가속도로 휘며 96걸음 따라가, 원반 면을 지날 때 색을 모으고 남은 빛은 휜 방향의 하늘을 읽어 블랙홀을 그린다.',
    terms: [
      { en: 'Gravitational lensing (ray bending)', ko: '중력으로 빛줄이 휘는 것' },
      { en: 'Schwarzschild approximation a = -1.5 h² r / r⁵', ko: '빛줄 가속도 근사식 (h = 각운동량)' },
      { en: 'Accretion disk Doppler beaming', ko: '다가오는 쪽 원반이 밝고 파래지는 도플러' },
      { en: 'Gravitational redshift', ko: '블랙홀 가까울수록 빛이 붉어짐' },
    ],
    goal: '{target}에 블랙홀을 그려 줘 — 빛줄을 휘며 따라가 뒤 하늘이 휘고 원반 뒤쪽이 위아래로 보이게, 느낌은 {style}.',
    targets: ['우주 컷신', '보스 등장 연출', '블랙홀 학습 체험'],
    styles: ['영화 같은 사실감', '게임 보스처럼 강렬하게', '은은한 학습용'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 카메라를 감싼 구(Cull Front)나 전체 화면 패스에서 같은 빛줄 적분 HLSL 셰이더.',
      godot: 'Godot 은 카메라를 감싼 구 spatial 셰이더(cull_front, unshaded) 또는 Sky 셰이더에서 같은 식.',
    },
    principle: [
      '카메라를 감싸는 큰 구(뒷면)를 그려 픽셀마다 빛줄 하나를 만든다. 시작은 카메라, 방향은 그 픽셀 쪽.',
      '한 걸음마다 블랙홀 쪽으로 가속도 -1.5 h² p / r⁵ 를 더해 방향을 휜다 (h² = |p × v|², 처음 한 번). 걸음 크기는 멀면 크게(0.07r, 0.025 ~ 1.6).',
      '빛줄이 원반 면(y = 0)을 건너면 그 반지름(2.4 ~ 15)의 원반 색 · 밀도를 모으고 투과율을 줄인다. 그래서 원반 뒤쪽이 블랙홀 위 · 아래로 휘어 보인다.',
      '원반이 도는 속도로 도플러 계수를 구해 다가오는 쪽을 g³ 만큼 밝고 파랗게, 중력 적색편이 √(1 - 1/r) 로 안쪽을 붉게.',
      '반지름 1 안에 들어가면 검정, 멀리 빠져나가면 휜 방향으로 하늘 그림을 읽는다 — 아인슈타인 고리가 생긴다.',
    ],
    when: ['블랙홀이 주인공인 컷신 · 보스', '중력 렌즈를 보여 주는 학습', '뒤 하늘이 휘는 신비한 연출'],
    avoid: ['폰 전체 화면 — 픽셀마다 96걸음은 무겁다. 해상도를 반으로', '작게 보이는 블랙홀 — 검은 원 + 빛 고리 스프라이트로 충분'],
    cost: 'heavy',
    costNote: '픽셀마다 최대 96걸음 (걸음마다 원반 교차 · 잡음 2번). 화면 전체를 덮으므로 폰에서는 렌더 해상도를 낮춰야 한다.',
    level: 3,
    must: [
      '카메라를 감싸는 구(반지름 50, BackSide, depthWrite false)를 매 프레임 카메라 자리로',
      '반복 상한은 상수(96), 블랙홀 안(r < 1) · 멀리 빠짐(r > 46 이고 멀어짐) · 투과율 < 0.01 이면 break',
      '걸음 크기는 거리에 비례 clamp(0.07r, 0.025, 1.6) — 가까이서만 촘촘하게',
      '원반은 빛줄이 y 부호를 바꿀 때 그 사이를 이어 교차점을 구한다 (y = 0 면)',
      '뒤 하늘은 미리 그린 등거리 원통 지도(2048 × 1024)를 휜 방향으로 읽는다',
    ],
    done: [
      '블랙홀 둘레로 뒤 하늘 별 · 은하수가 휘어 고리처럼 보인다',
      '원반의 뒤쪽이 블랙홀 위 · 아래로 휘어 올라와 보인다',
      '원반의 한쪽(다가오는 쪽)이 더 밝고 파랗다',
      '「중력 렌즈」를 0 으로 하면 하늘이 곧게 펴지고, 「보는 높이」에 따라 원반 모양이 바뀐다',
    ],
    code: {
      lang: 'glsl',
      title: '빛줄 휘기 + 원반 교차 + 도플러',
      from: 'demos/demosSpace.ts BH_FS 를 정리',
      body: `uniform sampler2D uSky, uN2; uniform float uTime, uLens, uDopp, uDisk;
varying vec3 vWP;
void main(){
  vec3 p = cameraPosition, v = normalize(vWP - cameraPosition);
  vec3 cr = cross(p, v); float h2 = dot(cr, cr);   // 각운동량² (처음 한 번)
  vec3 col = vec3(0.0); float T = 1.0;
  for (int i = 0; i < 96; i++) {
    float r2 = dot(p, p), r = sqrt(r2);
    float dt = clamp(0.07 * r, 0.025, 1.6);        // 가까울수록 촘촘하게
    v += -1.5 * h2 * p / (r2 * r2 * r) * uLens * dt; // 슈바르츠실트 근사 가속도
    vec3 pn = p + v * dt;
    if (p.y * pn.y < 0.0) {                          // 원반 면(y = 0)을 건넜다
      vec3 q = mix(p, pn, p.y / (p.y - pn.y));
      float rq = length(q.xz);
      if (rq > 2.4 && rq < 15.0) {
        float n1 = texture(uN2, vec2(atan(q.z, q.x) / 6.2831853 * 2.0 - uTime * 0.5 / pow(rq, 1.5) * 0.9, rq * 0.11)).r;
        float dens = smoothstep(2.4, 3.3, rq) * smoothstep(15.0, 6.5, rq) * clamp(0.25 + 0.9 * n1, 0.0, 1.3);
        float temp = pow(3.0 / rq, 0.75) * 1.05;
        vec3 vel = vec3(-q.z, 0.0, q.x) / rq * sqrt(0.5 / max(rq - 1.0, 0.5));
        float bta = length(vel), gam = 1.0 / sqrt(1.0 - bta * bta);
        float gd = 1.0 / (gam * (1.0 - dot(vel, -normalize(v))));   // 도플러
        float g = mix(1.0, gd * sqrt(max(1.0 - 1.0 / rq, 0.05)), uDopp); // × 중력 적색편이
        vec3 ec = diskCol(temp * g) * pow(g, 3.0) * dens * temp * temp * 4.2 * uDisk;
        float a = clamp(dens * 0.92, 0.0, 1.0);
        col += T * ec * a; T *= 1.0 - a;
      }
    }
    p = pn;
    float rn = length(p);
    if (rn < 1.0) { T = 0.0; break; }                 // 사건의 지평선
    if (rn > 46.0 && dot(p, v) > 0.0) break;           // 빠져나감
    if (T < 0.01) break;
  }
  col += T * sky(normalize(v)) * 0.9;                // 휜 방향의 하늘
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '걸음을 고르게 잘게 하면 너무 느리고, 크게 하면 원반이 빠진다', fix: '걸음을 거리에 비례하게 — 블랙홀 가까이서만 촘촘하다.' },
      { title: '원반을 걸음 위치에서만 검사하면 얇은 원반을 건너뛴다', fix: '두 걸음 사이 y 부호가 바뀌면 그 사이를 이어 교차점을 구한다.' },
      { title: '감싸는 구를 카메라에 붙이지 않으면 멀어질 때 하늘이 잘린다', fix: '매 프레임 ball.position = 카메라 위치.' },
    ],
    prev: ['i525', 'i524'],
    next: ['i530'],
    refs: [
      { name: 'Wikipedia — Gravitational lens', url: 'https://en.wikipedia.org/wiki/Gravitational_lens' },
      { name: 'Wikipedia — Schwarzschild metric', url: 'https://en.wikipedia.org/wiki/Schwarzschild_metric' },
    ],
  },
  i530: {
    id: 'i530',
    summary: '별을 인스턴싱 사각형으로 두고 머리 · 꼬리를 화면에 투영해 그 사이를 띠로 늘려 속도만큼 빛줄로 — 시야각을 넓히고 터널을 열었다가 번쩍 빠져나온다.',
    terms: [
      { en: 'Warp / hyperspace streaks', ko: '속도만큼 늘어난 별 빛줄' },
      { en: 'Screen-space line quads (InstancedBufferGeometry)', ko: '화면에서 두께를 맞춘 띠를 인스턴싱으로' },
      { en: 'FOV kick', ko: '빨라질 때 시야각을 넓혀 속도감' },
      { en: 'Scrolling noise tunnel', ko: '원통 안쪽에 흐르는 잡음 터널' },
    ],
    goal: '{target}에 워프 연출을 넣어 줘 — 별이 빛줄로 늘어나고 시야가 넓어지며 터널이 열렸다가 번쩍 빠져나오게, 느낌은 {style}.',
    targets: ['장면 전환 · 레벨 이동', '로딩 화면', '우주선 출발 컷신'],
    styles: ['영화처럼 극적으로', '귀엽고 짧게', '푸른 초공간'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System 의 Render Mode = Stretched Billboard(Speed Scale) + 카메라 Field of View 를 Tween.',
      godot: 'Godot 은 GPUParticles3D 에 길쭉한 QuadMesh + particle_flag_align_y, 카메라 fov 를 Tween.',
    },
    principle: [
      '별 하나 = 사각형 하나 (꼭짓점 4개, 인스턴스 2,600개). 별마다 각 · 반지름 · 깊이 · 밝기만 속성으로 넣는다.',
      '별 깊이는 mod(깊이 - 간 거리, 300) 으로 되감아 끝없이 다가온다. 머리 자리에서 속도 × 0.045 만큼 뒤가 꼬리다.',
      '머리 · 꼬리를 각각 화면에 투영하고 그 사이를 화면 좌표에서 두께가 같은 띠로 펼친다 — 그래서 빛줄이 가늘고 고르다.',
      '세기 w(0 ~ 1)로 빠르기 3 → 330 (w²), 시야각 60 → 98°, 화면 살짝 흔들림, 터널 밝기 w² 를 함께. 빠져나올 때 하얀 판을 번쩍.',
    ],
    when: ['레벨 · 장면을 바꾸는 전환 연출', '로딩 시간을 즐겁게 채울 때', '우주선 출발 · 도착'],
    avoid: ['자주 반복되는 짧은 전환 — 1초 안쪽이면 페이드가 낫다', '멀미가 걱정되는 작은 아이 대상 — 시야각 변화를 줄인다'],
    cost: 'light',
    costNote: '인스턴스 2,600개를 그리기 1번 + 원통 터널 1장(잡음 텍스처 3번). 위치 계산은 모두 정점 셰이더라 CPU 는 숫자 몇 개만.',
    level: 2,
    must: [
      '별은 InstancedBufferGeometry (꼭짓점 4 + aCorner) · 인스턴스 속성 aStar(각, 반지름, 깊이, 밝기)',
      '띠 두께는 화면 픽셀로 (화면 높이 · 가로세로 비율을 uniform 으로) — 멀어도 가늘어지지 않게',
      '간 거리 uDist 는 dt × 빠르기로 쌓는다 (빠르기 = lerp(3, 330, w²))',
      '재질 AdditiveBlending · depthTest false · depthWrite false, frustumCulled false',
      '시야각을 바꾸면 updateProjectionMatrix — 차이가 0.01 넘을 때만',
    ],
    done: [
      '순항 3초 → 2.2초 동안 별이 점점 빛줄로 늘어나며 시야가 넓어진다 → 푸른 터널 → 번쩍하며 빠져나와 다시 점별',
      '빛줄 두께가 화면 어디서나 고르고, 가까운 별일수록 밝다',
      '「워프 세기」를 손으로 0 ~ 1 로 움직여도 부드럽게 바뀐다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'glsl',
      title: '머리 · 꼬리를 투영해 화면 띠로 펼치기 (정점 셰이더)',
      from: 'demos/demosSpace.ts WARP_VS · i530 update 를 정리',
      body: `attribute vec2 aCorner;   // (0 꼬리 | 1 머리, -1 | 1 옆)
attribute vec4 aStar;     // 각 · 반지름 · 깊이 · 밝기
uniform float uDist, uLen, uScale, uAspect, uDepth, uResY, uWarp;
varying float vAlong, vSide, vB;
void main(){
  float zHead = -mod(aStar.z - uDist, uDepth) - 0.6;          // 끝없이 다가오게 되감기
  vec3 head = vec3(cos(aStar.x) * aStar.y, sin(aStar.x) * aStar.y, zHead);
  vec3 tail = head - vec3(0.0, 0.0, uLen * (0.6 + aStar.w * 0.6) + 0.02);
  vec4 ch = projectionMatrix * viewMatrix * vec4(head, 1.0);
  vec4 ct = projectionMatrix * viewMatrix * vec4(tail, 1.0);
  vec2 sh = ch.xy / ch.w, st = ct.xy / ct.w;                  // 화면 위 머리 · 꼬리
  vec2 dir = (sh - st) * vec2(uAspect, 1.0);
  float l = length(dir);
  dir = l > 1e-5 ? dir / l : vec2(0.0, 1.0);
  vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);
  vec2 dn = dir / vec2(uAspect, 1.0);
  float near = 1.0 - (-zHead) / uDepth;
  float w = (0.9 + 1.6 * aStar.w) * uScale * (0.5 + near * 1.3) * 2.0 / uResY; // 픽셀 두께
  vec2 s = mix(st, sh, aCorner.x) + nrm * aCorner.y * w + dn * (aCorner.x * 2.0 - 1.0) * w;
  gl_Position = vec4(s, 0.0, 1.0);
  vAlong = aCorner.x; vSide = aCorner.y;
  vB = smoothstep(0.0, 0.25, near) * (0.35 + 0.9 * near * near) * (0.5 + aStar.w);
}
// update(dt): speed = lerp(3, 330, w * w); uDist += speed * dt; uLen = speed * 0.045;
//   cam.fov = lerp(60, 98, smooth(0, 1, w)); 빠져나올 때 하얀 판 opacity = exp(-(경과) * 4) * 0.9`,
    },
    pitfalls: [
      { title: '빛줄을 3D 선(Line)으로 그리면 1px 고정이라 가늘고 두께를 못 바꾼다', fix: '머리 · 꼬리를 투영해 화면에서 두께를 준 사각형 띠로.' },
      { title: '가로세로 비율을 빼먹으면 옆으로 가는 빛줄만 두껍다', fix: '화면 좌표 방향 · 법선 계산에 uAspect 를 곱했다 나눈다.' },
      { title: '시야각을 매 프레임 바꾸며 projection 을 계속 다시 만들면 낭비다', fix: '차이가 0.01 넘을 때만 updateProjectionMatrix.' },
    ],
    prev: ['u36', 'i522'],
    next: ['i531', 'i535'],
  },

  i531: {
    id: 'i531',
    summary: '잡음 · 크레이터로 빚은 바위 5종을 InstancedMesh 로 4천 개 띄우고, 바위마다 회전은 정점 셰이더(축 · 빠르기 속성)로 CPU 0 — 해를 보면 렌즈 플레어.',
    terms: [
      { en: 'InstancedMesh asteroid field', ko: '같은 바위 모양을 수천 개 한 번에 그리기' },
      { en: 'Per-instance spin in vertex shader', ko: '인스턴스마다 축 · 빠르기 속성으로 셰이더에서 돌리기' },
      { en: 'Procedural rock (noise + craters)', ko: '잡음 변위 · 크레이터로 빚은 바위 모양' },
      { en: 'three.js Lensflare', ko: '해를 볼 때 렌즈 안 빛 반사 무늬 (addons)' },
    ],
    goal: '{target}에 소행성대를 만들어 줘 — 바위 5종 인스턴싱 4천 개 · 셰이더 회전 · 해 쪽 먼지 띠 · 렌즈 플레어, 느낌은 {style}.',
    targets: ['우주 게임 배경 · 장애물', '행성 고리 가까이', '우주선 비행 장면'],
    styles: ['사실적인 우주', '어둡고 웅장하게', '게임처럼 선명하게'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Graphics.RenderMeshInstanced(GPU Instancing) + 셰이더 회전, 플레어는 Lens Flare (SRP) 부품.',
      godot: 'Godot 은 MultiMeshInstance3D + INSTANCE_CUSTOM 으로 회전 값을 넘겨 vertex() 에서 돌린다.',
    },
    principle: [
      '바위 모양 5종을 만든다: 정이십면체(4단 분할) 정점을 잡음 5겹으로 밀고, 크레이터 9개를 파고, 축마다 다르게 늘인다. 정점 색으로 크레이터를 어둡게.',
      '모양마다 InstancedMesh 820개 — 반지름 80 ± 6.5 띠 둘레에 뿌리고 크기는 작은 것이 많게(r⁴).',
      '회전은 CPU 가 안 한다. 인스턴스마다 축 · 빠르기(작을수록 빠르게)를 속성 aSpin 으로 넣고, 정점 셰이더에서 로드리게스 회전으로 돌린다 — 법선도 같이.',
      '띠 둘레에 먼지 판(링)을 깔고, 해 쪽을 볼수록 밝게(전방 산란 pow(V·해, 6)).',
      '해 점광에 Lensflare 를 붙인다: 큰 빛 1개 + 육각 · 둥근 반사 5개를 화면 중심 반대쪽 줄에 늘어놓는다.',
    ],
    when: ['우주 배경에 수천 개 물체가 필요할 때', '각자 도는 물체가 많을 때 (CPU 를 아끼며)', '해 쪽을 보는 극적인 구도'],
    avoid: ['바위와 부딪혀야 하는 게임 — 충돌은 따로 (셰이더 회전은 CPU 가 모른다)', '플레어를 남용 — 해를 정면으로 볼 때만'],
    cost: 'medium',
    costNote: '그리기 호출 5번(모양마다)으로 바위 4,100개. 회전은 정점 셰이더라 CPU 0. 렌즈 플레어는 해가 보일 때 가림 검사 1번 + 판 6장.',
    level: 2,
    must: [
      '바위 모양은 몇 종(5)만 만들고 InstancedMesh 로 돌려 쓴다 — 바위마다 메시 만들기 금지',
      '회전은 onBeforeCompile 로 begin_vertex · beginnormal_vertex 에 같은 회전을 (법선도 돌려야 빛이 맞다)',
      '빠르기는 크기가 작을수록 빠르게: (0.05 + 무작위 × 0.5) / √(크기 + 0.2)',
      '인스턴스 색(setColorAt)으로 바위마다 살짝 다른 빛깔, 재질은 vertexColors 로 크레이터 그늘',
      'Lensflare 는 three/examples/jsm/objects/Lensflare.js, 해 빛에 add, 끝나면 dispose',
    ],
    done: [
      '바위 수천 개가 띠를 이루고 하나하나 다른 축 · 빠르기로 돈다',
      '해 쪽을 보면 먼지 띠가 빛나고, 화면에 렌즈 플레어 무늬가 늘어선다',
      '「소행성 수」를 0.1 ~ 1 배로 바꾸면 count 만 바뀌어 바로 반영된다',
      'CPU 프레임 시간이 바위 수와 거의 상관없다 (회전이 셰이더라서)',
    ],
    code: {
      lang: 'ts',
      title: '인스턴스마다 축 · 빠르기 속성 + 셰이더 회전',
      from: 'demos/demosSpace.ts i531 make() · SPIN_GLSL 을 정리 (바위 모양은 rockGeometry())',
      body: `import * as THREE from 'three';

const SPIN = 'vec3 spinR(vec3 p, vec3 ax, float a){ float c = cos(a), s = sin(a);' +
  ' return p * c + cross(ax, p) * s + ax * dot(ax, p) * (1.0 - c); }'; // 로드리게스 회전
const uTime = { value: 0 };
const PER = 820;

function makeBelt(geo: THREE.BufferGeometry): THREE.InstancedMesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms['uTime'] = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + String.fromCharCode(10) + 'attribute vec4 aSpin; uniform float uTime; ' + SPIN)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>' + String.fromCharCode(10) + 'objectNormal = spinR(objectNormal, aSpin.xyz, uTime * aSpin.w);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + String.fromCharCode(10) + 'transformed = spinR(transformed, aSpin.xyz, uTime * aSpin.w);');
  };
  const im = new THREE.InstancedMesh(geo, mat, PER);
  const spin = new Float32Array(PER * 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < PER; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = 80 + gauss() * 6.5;
    v.set(Math.cos(a) * rad, gauss() * 1.6, Math.sin(a) * rad);
    const s = 0.05 + Math.pow(Math.random(), 4) * 1.2;       // 작은 바위가 훨씬 많다
    q.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    im.setMatrixAt(i, m4.compose(v, q, sc.set(s, s, s)));
    const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    spin.set([ax.x, ax.y, ax.z, (0.05 + Math.random() * 0.5) / Math.sqrt(s + 0.2)], i * 4); // 작을수록 빨리
  }
  geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
  im.frustumCulled = false;
  return im;
}
// 매 프레임: uTime.value = t;  — CPU 는 이것뿐`,
    },
    pitfalls: [
      { title: '바위마다 메시를 만들면 그리기 호출이 수천 개라 CPU 가 막힌다', fix: '모양 몇 종 × InstancedMesh. 이 사이트도 같은 모양 수백 개를 하나씩 그리다 느려진 일이 있다.', seen: true },
      { title: '정점만 돌리고 법선을 안 돌리면 바위 명암이 돌지 않는다', fix: 'beginnormal_vertex 에도 같은 회전을 넣는다.' },
      { title: '셰이더에서 돌린 인스턴스는 화면 밖 판정이 틀릴 수 있다', fix: '띠 전체가 보이는 장면이면 frustumCulled = false.' },
    ],
    prev: ['u36', 'u08'],
    next: ['i532', 'i527'],
    refs: [
      { name: 'three.js 예제 — webgl_lensflares', url: 'https://threejs.org/examples/#webgl_lensflares' },
      { name: 'three.js 문서 — InstancedMesh', url: 'https://threejs.org/docs/#api/en/objects/InstancedMesh' },
    ],
  },

  i532: {
    id: 'i532',
    summary: '케플러 궤도를 도는 혜성에서 입자 두 종류를 뿜어 — 이온은 해 반대쪽으로 곧게 빠르게, 먼지는 복사압 β 만큼 약해진 중력으로 궤도 뒤로 휘게 해 두 꼬리를 만든다.',
    terms: [
      { en: 'Comet ion tail / dust tail', ko: '태양풍에 밀린 이온 꼬리 · 복사압으로 휘는 먼지 꼬리' },
      { en: 'Kepler orbit (Newton solve of Kepler equation)', ko: '케플러 방정식을 뉴턴법으로 풀어 궤도 위치' },
      { en: 'Radiation pressure (β)', ko: '햇빛이 미는 힘 — 중력을 (1 - β) 배로' },
      { en: 'CPU particle pool + dynamic buffer', ko: '입자 배열을 CPU 에서 움직여 매 프레임 올리기' },
    ],
    goal: '{target}에 혜성을 만들어 줘 — 이온 꼬리는 해 반대쪽 곧게, 먼지 꼬리는 궤도 뒤로 휘게, 해에 가까울수록 밝게. 느낌은 {style}.',
    targets: ['혜성 학습 체험', '우주 배경', '태양계 지도'],
    styles: ['관측 사진처럼', '선명한 학습용 (궤도 선 표시)', '화려한 게임 연출'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System 두 개 (Velocity over Lifetime · Force over Lifetime) 또는 스크립트로 입자 위치를 직접.',
      godot: 'Godot 은 CPUParticles3D 두 개 또는 MultiMesh 위치를 스크립트로 갱신.',
    },
    principle: [
      '궤도: 근일점 거리 1 · 이심률 0.9 타원. 시간 → 평균 근점 이각 M → 케플러 방정식 E - e·sin E = M 을 뉴턴법 8번으로 풀어 위치를 구한다.',
      '활동 세기 = min(3, 1.6 / r²) — 해에 가까울수록 입자를 많이 뿜고 코마가 커진다.',
      '먼지: 혜성 속도로 조금 흩어지며 나와, 중력을 (1 - β) 배로 받는다 (β 0.15 ~ 1). 중력이 약하니 궤도보다 바깥 · 뒤로 처져 휜 꼬리가 된다.',
      '이온: 해 반대쪽(해 → 혜성 방향)으로 빠르게(2.6 ~ 4.2) 곧게, 가는 줄기 7가닥으로 나눠 흔든다. 수명이 짧다(0.6 ~ 1.2).',
    ],
    when: ['혜성 · 궤도 · 힘을 보여 주는 학습', '우주 배경의 움직이는 볼거리', '입자에 서로 다른 힘을 주는 예시'],
    avoid: ['입자가 수십만 개 필요할 때 — 대신 GPU 입자(i525 처럼 정점 셰이더)', '물리가 필요 없는 장식 꼬리 — 대신 빛 띠 한 장'],
    cost: 'medium',
    costNote: '입자 최대 1만 1천 개(먼지 7천 + 이온 4천)를 CPU 에서 매 프레임 움직이고 버퍼를 올린다. 폰은 최대 수를 반으로.',
    level: 3,
    must: [
      '궤도 위치는 케플러 방정식을 뉴턴법(8번)으로 — 원 · 타원을 각도로 대충 돌리지 않는다 (근일점에서 빨라져야 한다)',
      '먼지는 중력 (1 - β) / r³ 로 매 걸음 속도를 고치고, 이온은 곧게만',
      '입자 수는 최대(풀) 안에서, 죽은 입자는 마지막 것과 바꿔 지우기 (splice 금지)',
      '버퍼는 DynamicDrawUsage, setDrawRange(0, n) 으로 산 것만 그리기',
      '시뮬레이션 시간은 실제 dt × 빠르기 (프레임 수 아님)',
    ],
    done: [
      '혜성이 해 가까이 올수록 빨라지고 꼬리가 길고 밝아진다',
      '파란 이온 꼬리는 늘 해 반대쪽으로 곧게, 노란 먼지 꼬리는 궤도 뒤쪽으로 휘어 두 꼬리가 갈라진다',
      '「이온 꼬리」 · 「먼지 꼬리」를 각각 끄고 켜면 하나씩 사라진다',
      '「시간 빠르기」를 3 으로 올려도 꼬리 모양이 무너지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '케플러 위치 + 먼지(β) · 이온 입자 움직이기',
      from: 'demos/demosSpace.ts i532 make() 의 posAt · update 를 정리',
      body: `import * as THREE from 'three';

const e = 0.9, qd = 1.0;                  // 이심률 · 근일점 거리
const a = qd / (1 - e), bAx = a * Math.sqrt(1 - e * e);
const nMot = Math.sqrt(1 / (a * a * a));  // 평균 운동 (GM = 1)
function posAt(tt: number, M1: number, out: THREE.Vector3): THREE.Vector3 {
  const M = -M1 + nMot * tt;
  let E = M;
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); // 뉴턴법
  return out.set(a * (Math.cos(E) - e), 0, -bAx * Math.sin(E));
}

type Pt = { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; beta: number };
function stepDust(dust: Pt[], sdt: number): void {
  for (let i = dust.length - 1; i >= 0; i--) {
    const p = dust[i]!;
    p.age += sdt;
    if (p.age > p.life) { dust[i] = dust[dust.length - 1]!; dust.pop(); continue; } // 바꿔 지우기
    const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
    const g = (1 - p.beta) / (r2 * Math.sqrt(r2));   // 복사압만큼 약한 중력
    p.vx -= p.x * g * sdt; p.vy -= p.y * g * sdt; p.vz -= p.z * g * sdt;
    p.x += p.vx * sdt; p.y += p.vy * sdt; p.z += p.vz * sdt;
  }
}
// 뿜기 (cp = 혜성 위치, (ux, uz) = 해 → 혜성 방향, act = min(3, 1.6 / r²))
//  먼지: 속도 = 혜성 속도 + 흩어짐 0.04 + 바깥 0.05,  beta = 0.15 + random^1.5 × 0.85,  수명 4 ~ 8
//  이온: 속도 = (ux - uz·off, off·0.6, uz + ux·off) × (2.6 ~ 4.2),  off = 7가닥 중 하나 ± 흔들림,  수명 0.6 ~ 1.2
// 그리기: Points 하나에 위치 · 색알파 · 크기를 넣고 upload(n) → setDrawRange(0, n), needsUpdate`,
    },
    pitfalls: [
      { title: '궤도를 각도로 고르게 돌리면 해 가까이서 빨라지지 않는다', fix: '케플러 방정식을 풀어 위치를 구해야 근일점에서 빠르고 멀리서 느리다.' },
      { title: '죽은 입자를 splice 로 지우면 입자 수천 개에서 느려진다', fix: '마지막 입자와 바꾸고 pop — 순서는 상관없다.' },
      { title: '이온 꼬리를 혜성 진행 반대쪽으로 그리면 틀린다', fix: '이온 꼬리는 늘 해 반대쪽 — 혜성이 해에서 멀어질 때는 꼬리가 앞장선다.' },
    ],
    prev: ['i170', 'i531'],
    next: ['i533'],
    refs: [
      { name: 'Wikipedia — Kepler\'s equation', url: 'https://en.wikipedia.org/wiki/Kepler%27s_equation' },
      { name: 'Wikipedia — Comet tail', url: 'https://en.wikipedia.org/wiki/Comet_tail' },
    ],
  },

  i533: {
    id: 'i533',
    summary: '하늘을 가로지르며 굽이치는 띠 메시에 잡음을 가로로만 읽어 세로 빛줄을 넣고, 장면을 위아래 뒤집은 복사본 위에 반투명 호수를 덮어 오로라와 호수 반사를 만든다.',
    terms: [
      { en: 'Aurora curtain (ribbon mesh)', ko: '굽이치는 커튼 띠 메시' },
      { en: 'Vertical rays from 1D noise', ko: '잡음을 가로 방향으로만 읽어 생긴 세로 결' },
      { en: 'Fake reflection (mirrored scene, scale.y = -1)', ko: '장면을 뒤집은 복사본으로 물 반사 흉내' },
      { en: 'Fold brightening', ko: '커튼을 옆에서 볼수록 겹쳐 밝게' },
    ],
    goal: '{target}에 오로라 커튼을 넣어 줘 — 세로 빛줄 · 아래 초록 위 보라 · 호수에 거꾸로 비치게, 느낌은 {style}.',
    targets: ['극지방 밤하늘', '호수가 있는 밤 배경', '겨울 게임 메뉴 화면'],
    styles: ['사진처럼 장엄하게', '은은한 동화 밤', '선명한 초록'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 띠 메시 + 더하기(Additive) Unlit 셰이더, 반사는 Planar Reflection 대신 뒤집은 복사본 + 반투명 판.',
      godot: 'Godot 은 띠 메시에 blend_add · unshaded 셰이더, 반사는 Node3D scale.y = -1 복사본 + 반투명 판.',
    },
    principle: [
      '커튼 = 가로 400칸 · 세로 1칸 판 하나. 정점 셰이더가 가로 u 를 따라 하늘을 비스듬히 지나는 길(S자 굽이 + 잔 접힘)을 만들고 세로로 높이를 세운다.',
      '세로 빛줄: 잡음 텍스처를 가로(u × 29 · × 83)로는 촘촘히, 세로로는 거의 안 바뀌게 읽으면 세로 결이 생긴다.',
      '색: 아래 가장자리는 또렷한 초록(0.12, 1.0, 0.42), 위로 갈수록 붉은 보라로 · 옅게 (exp(-3v)). 밝기가 띠를 따라 천천히 흘러간다.',
      '커튼 길을 옆에서 보는 곳(접힌 곳)은 빛이 겹쳐 보이므로 밝게 — 길 방향과 시선의 외적 크기로 0.45 ~ 2.8 배.',
      '반사: 산 · 나무 · 커튼 · 별을 scale.y = -1 묶음에 한 번 더 넣고, 그 위에 반투명(0.5) 짙은 호수 판을 덮는다.',
    ],
    when: ['극지방 · 겨울 밤 배경', '호수 · 바다에 비친 밤하늘', '움직이는 빛으로 메뉴 화면을 살릴 때'],
    avoid: ['물결치는 물 — 뒤집은 복사본은 거울처럼 판판하다. 대신 물 셰이더(u22)', '물체가 아주 많은 장면 — 복사본이 그리기를 두 배로'],
    cost: 'medium',
    costNote: '커튼 2장(정점 800개씩, 잡음 텍스처 3번) + 반사 복사본으로 그리기 두 배. 대신 반사용 렌더 타깃은 없다.',
    level: 2,
    must: [
      '커튼은 PlaneGeometry(1, 1, 400, 1) 한 장 — 모양은 정점 셰이더의 길 함수로',
      '세로 결은 잡음을 가로로만 촘촘히 읽기 (세로 좌표는 아주 조금만 바꿈)',
      'AdditiveBlending · DoubleSide · depthWrite false · frustumCulled false',
      '반사 묶음은 scale.y = -1, 같은 기하 · 재질을 공유 (새로 만들지 않기)',
      '호수 판은 반투명(0.5) · depthWrite false · renderOrder 를 가장 크게',
    ],
    done: [
      '하늘에 커튼 두 장이 굽이치며 일렁이고, 아래 가장자리가 또렷한 초록이다',
      '위로 갈수록 보라로 옅어지고 가는 세로 빛줄이 보인다',
      '커튼이 접혀 옆으로 보이는 곳이 더 밝다',
      '호수에 오로라 · 별 · 산 그림자가 거꾸로 비치고, 「호수에 비친 모습」을 끄면 사라진다',
    ],
    code: {
      lang: 'glsl',
      title: '커튼 길 (정점) + 세로 빛줄 · 색 (조각)',
      from: 'demos/demosSpace.ts AUR_VS · AUR_FS 를 정리',
      body: `// ── 정점 ──
uniform float uTime, uSeed, uZ, uW, uX, uBot, uTilt, uH, uMove;
varying vec2 vUv; varying float vFold;
vec3 path(float u, float tm){   // 커튼 아래 가장자리: 비스듬히 가로지르며 S자로 굽이치고 잘게 접힘
  float x = uX + (u - 0.5) * uW;
  float z = uZ + 60.0 * sin(u * 4.4 + uSeed * 6.0 + tm * 0.06) + 16.0 * sin(u * 12.0 - tm * 0.15 + uSeed * 3.0) + 4.0 * sin(u * 31.0 + tm * 0.33);
  float y = uBot + uTilt * (u - 0.5) + 5.0 * sin(u * 5.0 + tm * 0.08 + uSeed);
  return vec3(x, y, z);
}
void main(){
  vUv = uv; float tm = uTime * uMove;
  vec3 p = path(uv.x, tm);
  vec3 T = normalize(mat3(modelMatrix) * (path(uv.x + 0.002, tm) - p));
  vec3 V = normalize((modelMatrix * vec4(p, 1.0)).xyz - cameraPosition);
  vFold = clamp(0.32 / (length(cross(T, V)) + 0.1), 0.45, 2.8); // 옆에서 보면 겹쳐 밝다
  p.y += uv.y * uH; p.x += uv.y * uH * 0.12;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
// ── 조각 ──
uniform sampler2D uN2; uniform float uI;
void main(){
  float u = vUv.x, v = vUv.y, tm = uTime * uMove;
  float a1 = texture(uN2, vec2(u * 29.0 + v * 0.12 + tm * 0.004 + uSeed, 0.31 + v * 0.015)).a; // 가로로만 촘촘히
  float a2 = texture(uN2, vec2(u * 83.0 - v * 0.2 - tm * 0.007, 0.67 + v * 0.02)).r;
  float rays = 0.4 + 1.1 * a1 * a1 + 0.6 * a2 * a2 * a2;
  float flow = 0.25 + 1.1 * smoothstep(0.3, 0.8, texture(uN2, vec2(u * 1.6 - tm * 0.025, 0.15 + uSeed)).g);
  float edge = smoothstep(0.0, 0.012, v) * (1.0 + 2.2 * exp(-v * 28.0));   // 또렷한 아래 가장자리
  float decay = exp(-v * 3.0) * (1.0 - smoothstep(0.55, 1.0, v));
  vec3 col = mix(vec3(0.12, 1.0, 0.42), vec3(0.5, 0.14, 0.62), smoothstep(0.22, 0.75, v));
  float ends = smoothstep(0.0, 0.14, u) * smoothstep(1.0, 0.86, u);
  gl_FragColor = vec4(col * edge * decay * rays * flow * vFold * ends * uI * 0.55, 1.0);
}`,
    },
    pitfalls: [
      { title: '잡음을 세로로도 촘촘히 읽으면 빛줄이 아니라 얼룩 구름이 된다', fix: '세로 좌표는 아주 조금만(× 0.015) 바꿔 세로 결을 살린다.' },
      { title: '반사 복사본에 기하 · 재질을 새로 만들면 메모리가 두 배다', fix: '같은 기하 · 재질을 공유하는 Mesh 만 새로 (new Mesh(geo, mat)).' },
      { title: '뒤집은 복사본만 두면 반사가 너무 또렷하다', fix: '그 위에 짙은 반투명 호수 판(0.5)을 덮어 물빛으로 누른다.' },
    ],
    prev: ['i523', 'i14'],
    next: ['i534'],
    refs: [
      { name: 'Wikipedia — Aurora', url: 'https://en.wikipedia.org/wiki/Aurora' },
    ],
  },

  i534: {
    id: 'i534',
    summary: '부풀던 별이 번쩍 → 테두리가 밝은 충격파 껍질과 3D 잡음 필라멘트가 감속하며 퍼지고, 충격파가 적도 고리에 닿으면 구슬 빛이 켜지며 남은 펄서가 빛줄을 돌린다.',
    terms: [
      { en: 'Supernova explosion sequence', ko: '초신성 폭발 연출 (부풂 → 번쩍 → 껍질 → 잔해)' },
      { en: 'Fresnel rim shell (shock front)', ko: '가장자리가 밝은 구 껍질 — 충격파 면' },
      { en: 'Ease-out expansion R = 1 - exp(-k t)', ko: '감속하며 퍼지는 반지름' },
      { en: 'Light echo ring', ko: '뒤 먼지에 비친 빛 메아리 고리' },
    ],
    goal: '{target}에 초신성 폭발 연출을 넣어 줘 — 번쩍 · 충격파 껍질 · 필라멘트 · 고리 구슬 · 펄서 빛줄까지, 느낌은 {style}.',
    targets: ['큰 폭발 · 보스 처치 연출', '별의 일생 학습', '우주 컷신'],
    styles: ['장엄한 우주 사진', '화려한 게임 연출', '천천히 보는 학습용'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 구 메시에 Fresnel 테두리 Additive 셰이더 + Particle System 파편, 시간표는 Timeline 이나 스크립트.',
      godot: 'Godot 은 구 spatial 셰이더(blend_add, 테두리 = 1 - dot(NORMAL, VIEW)) + GPUParticles3D, 시간표는 AnimationPlayer.',
    },
    principle: [
      '한 바퀴 13초 시간표: 처음 2.5초는 별이 부풀며 떨리고 밝아진다. 그 순간 별을 숨기고 큰 빛 스프라이트가 번쩍(exp(-2.2 t)) 퍼진다.',
      '충격파 껍질 반지름은 R = 0.25 + 3.3·(1 - exp(-0.55 t)) — 처음엔 빠르고 점점 느려진다. 안쪽 껍질은 0.62배.',
      '껍질 셰이더: 테두리일수록 밝은 파란 충격파(pow(1 - μ, 2.2)³) + 3D 잡음 필라멘트(붉은 수소 · 청록 산소). 정점도 잡음으로 울퉁불퉁하게.',
      '적도 고리 구슬 28개는 충격파 반지름이 고리(2.6)에 닿을 때 smoothstep 으로 하나씩 켜진다 (구슬마다 조금씩 늦게).',
      '1.2초 뒤 펄서 빛줄(원뿔 둘)이 빠르게 돌고, 뒤 먼지 판에 빛 메아리 고리가 2.6 × t 로 퍼진다. 파편 입자 2,600개가 바깥으로.',
    ],
    when: ['큰 사건을 알리는 폭발 연출', '별의 일생 · 우주 학습', '보스를 쓰러뜨린 마무리'],
    avoid: ['자주 터지는 작은 폭발 — 대신 입자 방출기(i170)', '번쩍이 아이에게 부담될 수 있는 화면 — 번쩍 세기를 낮춘다'],
    cost: 'medium',
    costNote: '구 껍질 2장(96 × 64, 3D 텍스처 3번) + 파편 2,600개(CPU 위치, 버퍼 올리기) + 스프라이트 30여 개. 껍질이 화면을 덮을 때 픽셀 부담이 크다.',
    level: 3,
    must: [
      '시간표는 한 변수(tau)로 — 부풂(0 ~ 2.5초) · 폭발 뒤(age = tau - 2.5) 로 나눠 모든 값이 age 의 함수',
      '반지름은 1 - exp(-k·age) 꼴로 감속 (곧은 선형으로 퍼지지 않게)',
      '껍질은 AdditiveBlending · DoubleSide · depthWrite false, 밝기는 0.3 + 1.1·exp(-0.5 age) 로 서서히 어둡게',
      '고리 구슬 · 펄서는 미리 만들어 두고 visible · opacity 로만',
      '다시 폭발 단추로 tau = 0 · 파편 방향 다시 뽑기',
    ],
    done: [
      '푸른 별이 부풀며 떨다가 번쩍! 하고 빛이 화면을 덮었다 사라진다',
      '테두리가 밝은 껍질이 퍼지며 느려지고, 붉은 · 청록 필라멘트 결이 보인다',
      '껍질이 고리에 닿을 때 구슬 빛이 차례로 켜지고, 가운데 펄서 빛줄이 돈다',
      '뒤 먼지에 빛 메아리 고리가 퍼지고, 「빠르기」 · 「필라멘트」 · 「펄서」 조절이 바로 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '폭발 시간표 — 부풂 · 번쩍 · 감속 껍질 · 고리 구슬 · 펄서',
      from: 'demos/demosSpace.ts i534 make() update 를 정리',
      body: `const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let tau = 0;
const T0 = 2.5; // 부푸는 시간

function update(t: number, dt: number, speed = 1): void {
  tau += dt * speed;
  if (tau > 13) tau = 0;                                // 한 바퀴 13초
  const age = tau - T0;
  if (age < 0) {                                        // 부풂 — 떨며 밝아진다
    const k = tau / T0;
    star.visible = true;
    star.scale.setScalar(1.0 + k * 0.8 + Math.sin(tau * 9) * 0.06 * k);
    star.material.color.setRGB(0.68, 0.8, 1).multiplyScalar(2.4 + k * 2);
    flash.visible = outer.visible = inner.visible = pulsar.visible = false;
    return;
  }
  star.visible = false;
  const f = Math.exp(-age * 2.2);                       // 번쩍
  flash.visible = f > 0.01;
  flash.scale.setScalar(4 + 26 * (1 - Math.exp(-age * 6)));
  flash.material.opacity = f;
  const R = 0.25 + 3.3 * (1 - Math.exp(-age * 0.55));   // 감속하며 퍼지는 충격파
  outer.visible = inner.visible = true;
  outer.scale.setScalar(R);
  inner.scale.setScalar(R * 0.62);
  const bright = 0.3 + 1.1 * Math.exp(-age * 0.5);
  outerU.uI.value = bright * Math.min(1, age * 3);
  innerU.uI.value = bright * 0.8 * Math.min(1, age * 2);
  echoU.uEchoR.value = age * 2.6;                        // 빛 메아리 고리
  echoU.uEchoI.value = Math.exp(-age * 0.25) * 1.2;
  beads.forEach((b) => {                                // 충격파가 고리(2.6)에 닿으면 켜진다
    const on = smooth(2.2, 2.7, R + b.userData.k * 0.25);
    b.visible = on > 0.01;
    b.material.opacity = on * (0.8 + 0.2 * Math.sin(t * 3 + b.userData.k * 20));
  });
  pulsar.visible = age > 1.2;
  spinner.rotation.y = t * 9;                           // 펄서 빛줄 회전
}`,
    },
    pitfalls: [
      { title: '반지름을 선형으로 키우면 폭발이 아니라 풍선처럼 보인다', fix: '1 - exp(-k t) 로 처음 빠르고 점점 느리게.' },
      { title: '연출 물체를 그때그때 만들면 첫 폭발에서 멈칫한다', fix: '껍질 · 구슬 · 펄서를 처음부터 만들어 숨겨 두고 visible 로만. 첫 셰이더 컴파일은 로딩 중에 미리.', seen: true },
      { title: '번쩍이 너무 세고 길면 눈이 아프다', fix: '번쩍은 exp(-2.2 t) 로 1초 안에 빠르게 꺼지게.' },
    ],
    prev: ['i528', 'i170'],
    next: ['i529', 'u20'],
    refs: [
      { name: 'Wikipedia — Supernova', url: 'https://en.wikipedia.org/wiki/Supernova' },
    ],
  },

  i535: {
    id: 'i535',
    summary: '성운 · 먼 별 · 별 · 먼지 구름 · 밝은 별 · 가까운 바위 6층을 미리 그려 두고 멀수록 느리게 옮기기만 해서, 2D 화면에 깊이를 준다.',
    terms: [
      { en: 'Parallax scrolling', ko: '층마다 다른 빠르기로 옮겨 생기는 깊이' },
      { en: 'Pre-rendered layers (offscreen canvas)', ko: '층 그림을 한 번만 그려 두기' },
      { en: 'Seamless horizontal tiling', ko: '가로로 이어 붙여 끝없이 흐르기' },
    ],
    goal: '{target}에 시차 스크롤 우주 배경을 넣어 줘 — 6층을 미리 그려 멀수록 느리게, 느낌은 {style}.',
    targets: ['2D 슈팅 게임 배경', '달리기 게임 배경', '메뉴 · 로딩 화면'],
    styles: ['깊은 우주', '밝은 만화 우주', '먼지 낀 성운 지대'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 층마다 SpriteRenderer + 스크립트로 카메라 이동 × 비율만큼 옮기기 (또는 재질 offset 스크롤).',
      godot: 'Godot 4 는 Parallax2D 노드(scroll_scale · repeat_size) — 예전 방식은 ParallaxBackground + ParallaxLayer.',
    },
    principle: [
      '멀리 있는 것은 느리게, 가까운 것은 빠르게 지나간다 — 이 빠르기 차이만으로 눈은 깊이를 느낀다.',
      '층 6장(2048 × 1000)을 시작할 때 한 번만 캔버스에 그려 둔다. 매 프레임은 drawImage 로 옮겨 찍기만 한다.',
      '층마다 빠르기 배율: 0.03 · 0.08 · 0.17 · 0.33 · 0.62 · 1.5 (가장 먼 성운 → 가장 가까운 바위).',
      '가로 위치 = -(스크롤 × 배율) mod 층 폭, 화면이 찰 때까지 이어 붙여 찍는다. 위아래 흔들림도 배율만큼 다르게.',
      '우주선은 5번째 층(밝은 별) 다음에 그려 바위 층이 그 앞을 지나가게 한다.',
    ],
    when: ['2D 횡스크롤 게임 배경', '가벼운 깊이감이 필요한 메뉴 · 로딩', '폰에서 3D 없이 우주 느낌'],
    avoid: ['카메라가 자유롭게 도는 3D 장면 — 대신 별 하늘(i522)', '층마다 매 프레임 그림을 다시 그리기 — 미리 그려 두는 것이 핵심'],
    cost: 'light',
    costNote: '매 프레임 drawImage 약 12번(층 6 × 이어 붙이기 2)뿐. 층 그림 6장(2048 × 1000)이 메모리를 조금 쓴다.',
    level: 1,
    must: [
      '층 그림은 시작할 때 한 번만 (오프스크린 캔버스) — 프레임마다 별을 다시 그리지 않는다',
      '빠르기 배율은 먼 층일수록 작게 (0.03 ~ 1.5), 시차를 끄면 모두 같은 0.5 (비교용)',
      '층은 가로로 이음매 없이 — 왼쪽 끝과 오른쪽 끝이 이어지게 그린다',
      '스크롤은 dt × 빠르기로 쌓는다 (프레임 수 아님)',
      '화면 높이에 맞춰 배율 s = 높이 / 900 로 크기를 맞춘다',
    ],
    done: [
      '성운은 거의 안 움직이고 가까운 바위 · 먼지는 휙휙 지나가 깊이가 느껴진다',
      '「시차」를 끄면 모든 층이 같은 빠르기로 흘러 납작해 보인다 (켬과 비교)',
      '층이 이어지는 자리에 이음매가 보이지 않는다',
      '「층 이름 · 빠르기 보기」로 층마다 배율이 표시되고, 폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '미리 그린 6층을 빠르기 배율대로 이어 찍기',
      from: 'demos/demosSpace.ts i535 make() draw() 를 정리 (층 그림은 parallaxLayers())',
      body: `const LW = 2048, LH = 1000;                       // 층 그림 크기
const layers: HTMLCanvasElement[] = parallaxLayers(); // 시작할 때 한 번만 그린 6장
const SPEED = [0.03, 0.08, 0.17, 0.33, 0.62, 1.5];  // 성운 → 먼 별 → 별 → 먼지 → 밝은 별 → 바위
let scroll = 0;

function draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number, parallax = true): void {
  scroll += dt * 260;
  const s = h / 900;                                  // 화면 높이에 맞춘 배율
  const bob = Math.sin(t * 0.5) * 30;                 // 위아래로 천천히 흔들림
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < layers.length; i++) {
    const k = parallax ? SPEED[i]! : 0.5;             // 끄면 모두 같은 빠르기 — 납작해진다
    const lw = LW * s, lh = LH * s;
    let x = -((scroll * k * s) % lw);
    const y = (h - lh) / 2 - bob * k * 0.4 * s;       // 흔들림도 가까울수록 크게
    while (x < w) {                                   // 화면이 찰 때까지 이어 붙이기
      g.drawImage(layers[i]!, x, y, lw, lh);
      x += lw;
    }
    if (i === 4) drawShip(g, w * 0.36, h * 0.5 - bob * 0.25 * s, s * 1.3, t); // 바위 층이 우주선 앞을 지나게
  }
}`,
    },
    pitfalls: [
      { title: '매 프레임 별 수천 개를 다시 그리면 폰에서 느리다', fix: '층마다 한 번 그린 캔버스를 drawImage 로 옮겨 찍기만 한다.' },
      { title: '층 끝이 이어지지 않게 그리면 이음매가 지나간다', fix: '별 · 구름을 그릴 때 가로로 -폭 · 0 · +폭 세 번 찍어 양끝을 잇는다.' },
      { title: '느린 폰에서 프레임 시간을 잘라 쓰면 배경이 느려진다', fix: '스크롤은 실제 dt 로 — 새 게임은 처음부터 이 방식으로.', seen: true },
    ],
    prev: ['i104', 'u54'],
    next: ['i522', 'i530'],
    refs: [
      { name: 'Wikipedia — Parallax scrolling', url: 'https://en.wikipedia.org/wiki/Parallax_scrolling' },
      { name: 'MDN — CanvasRenderingContext2D.drawImage()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage' },
    ],
  },
};

import type { TechDoc } from './types';

/**
 * 기술 문서 B04 — 실사 렌더링 3 (i475 · i476 · i479) · 모션 그래픽 (i90 ~ i127) · 주사위 (u47) · 손맛 (i199 ~ i206)
 * 코드는 견본(demos/*.ts)의 실제 코드에서 발췌해 카드용 장치(조절판 · HUD · dispose)를 걷어 낸 것이다.
 */
export const DOCS: Record<string, TechDoc> = {
  i475: {
    id: 'i475',
    summary: '실제 사진관 빛을 담은 HDR 사진 한 장을 PMREM 으로 구워 조명과 반사를 함께 맡겨, 크롬 · 금 · 유리가 진짜처럼 보이게 한다.',
    terms: [
      { en: 'HDRI image-based lighting (IBL)', ko: 'HDR 사진 한 장으로 하는 조명 · 반사' },
      { en: 'HDRLoader + EquirectangularReflectionMapping', ko: 'three.js .hdr 읽기 + 파노라마 반사 매핑' },
      { en: 'PMREMGenerator.fromEquirectangular', ko: '거칠기마다 흐린 반사 지도를 미리 굽기' },
      { en: 'scene.environment / environmentRotation', ko: '장면 전체 환경 빛 · 그 빛 돌리기' },
    ],
    goal: '{target}을(를) HDRI 환경 빛으로 비춰 줘 — HDR 사진을 PMREM 으로 구워 scene.environment 에 넣고, 금속 · 유리 반사가 진짜처럼. 분위기는 {style}.',
    targets: ['크롬 공 · 유리 공 · 톱니 · 금 고리 같은 제품 진열', '무기 · 장비 고르기 화면', '자동차 · 시계 같은 금속 제품 보기'],
    styles: ['깨끗한 사진관 (스튜디오 HDRI)', '해 질 녘 야외', '어두운 전시장'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 HDR 그림을 Cubemap 으로 들여와 Skybox/Panoramic 재질로 하늘에 두고, Lighting 창의 Environment Lighting · Reflection Probe 가 그 빛을 쓰게 한다.',
      godot: 'Godot 4 는 WorldEnvironment 의 Sky 에 PanoramaSkyMaterial(HDR 그림)을 넣고, Ambient Light · Reflected Light 출처를 Sky 로 둔다.',
    },
    principle: [
      'HDR 사진은 밝기를 0~1 로 자르지 않고 해 · 조명 같은 아주 밝은 값을 그대로 담는다.',
      '그 사진을 물체 둘레를 감싼 공으로 보고, 표면마다 반사 방향의 색을 읽으면 조명과 반사가 한 번에 생긴다.',
      '거친 표면은 넓은 범위를 흐리게 읽어야 하므로, PMREM 이 거칠기별로 미리 흐린 지도를 구워 둔다 (한 번만).',
      'environmentRotation 으로 환경을 돌리면 반사 띠가 물체 위를 미끄러지듯 지나간다.',
    ],
    when: ['금속 · 유리 · 니스 칠처럼 반사가 주인공인 물체를 보여 줄 때', '조명을 여럿 놓지 않고도 고르게 밝은 진열 장면이 필요할 때'],
    avoid: ['툰 · 단색 그림체 장면 — 반사가 그림체를 깬다. 대신 반구광 + 해 (3점 조명)', '어두운 던전처럼 빛 위치가 이야기인 장면 — 대신 점광원 · 그림자 (쿼터뷰 던전 조명)'],
    cost: 'medium',
    costNote: '그리는 비용은 표준 재질과 거의 같다. 비싼 것은 처음 한 번 — .hdr 내려받기(1k 약 1.5MB) · PMREM 굽기 · 그 셰이더 컴파일(윈도에서 400ms 넘음). 유리(transmission)는 장면을 한 번 더 그린다.',
    level: 1,
    must: [
      'HDRI 는 1k 로 충분 (반사용) — 2k · 4k 는 배경으로 크게 보일 때만',
      'PMREM 은 렌더러마다 한 번만 굽고 여러 장면이 같이 쓴다. 굽는 동안은 「빛 굽는 중」 화면을 보인다',
      'HDRI 를 쓰면 해 · 반구광을 따로 켜지 않는다 (겹치면 하얗게 날아감). 밝기는 노출(toneMappingExposure)로',
      '금속(metalness 1) 재질은 env 가 없으면 검게 나온다 — env 가 준비된 뒤에 셰이더를 굽는다',
      '배경으로 보이기 / 숨기기와 상관없이 빛 · 반사는 그대로여야 한다',
    ],
    done: [
      '같은 물체를 왼쪽 일반 조명 · 오른쪽 HDRI 로 나란히 두면, 오른쪽 크롬에 사진관 창 · 조명 모양이 비친다',
      '「환경 회전」 슬라이더를 돌리면 반사 띠가 물체 위를 지나간다',
      '「HDRI 배경 보이기」를 꺼도 물체 밝기 · 반사는 그대로다',
      '첫 화면에서 멈칫 없이 「빛 굽는 중」 → 완성 화면으로 넘어간다',
    ],
    code: {
      lang: 'ts',
      title: 'HDR 읽기 → PMREM 굽기 → 환경 빛 · 배경 · 회전',
      from: 'demos/demosRender.ts loadHDR() · envFor() · makeHdri() 를 정리',
      body: `import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

// 1) 사진관 HDRI (견본은 Poly Haven studio_small_09_1k.hdr)
const hdr = await new HDRLoader().loadAsync(HDR_URL);
hdr.mapping = THREE.EquirectangularReflectionMapping;

// 2) 거칠기마다 흐린 반사 지도를 한 번 굽는다 (렌더러마다 한 번 — 여러 장면이 같이 씀)
const pm = new THREE.PMREMGenerator(renderer);
const env = pm.fromEquirectangular(hdr).texture;
pm.dispose();

// 3) 조명 + 반사를 한 번에 — 해 · 반구광은 켜지 않는다
scene.environment = env;
scene.background = showBg ? hdr : new THREE.Color(0x1b1e27); // 배경만 바뀌고 빛은 그대로
scene.backgroundIntensity = 0.85;
scene.environmentRotation.y = rot; // 환경을 돌리면 반사 띠가 물체 위를 지나간다
scene.backgroundRotation.y = rot;
renderer.toneMappingExposure = exposure; // 노출 0.3 ~ 2.5

// 4) 반사가 드러나는 재질들
const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.04 });
const gold = new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.18 });
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.7, ior: 1.5,
  attenuationColor: new THREE.Color(0xcfe8ff), attenuationDistance: 1.6, specularIntensity: 1,
});
const rubber = new THREE.MeshPhysicalMaterial({ color: 0xc8232c, roughness: 0.62, sheen: 0.4, sheenRoughness: 0.6 });`,
    },
    pitfalls: [
      { title: 'PMREM 굽는 셰이더가 윈도에서 400ms 넘게 멈춘다', fix: '견본은 PMREM 의 재질만 먼저 만들어 renderer.compileAsync 로 병렬 컴파일한 뒤 굽는다. 굽는 동안은 null 을 돌려 「빛 굽는 중」을 보인다.', seen: true },
      { title: 'env 없이 셰이더를 먼저 구우면 나중에 다시 컴파일된다', fix: '환경 지도가 붙는 순간 셰이더 열쇠가 바뀐다. env 가 준비된 뒤에 미리 데우기(compileAsync)를 한다.', seen: true },
      { title: '유리(transmission)가 처음 보일 때 또 멈칫한다', fix: '투과 재질은 불투명 물체를 반정밀(HalfFloat) 렌더 타깃에 한 번 더 그린다. 그 렌더 타깃을 걸어 둔 채로도 compileAsync 를 한 번 더 해 둔다.', seen: true },
      { title: 'HDRI 에 해 · 반구광까지 더하면 하얗게 날아간다', fix: 'HDRI 자체가 조명이다. 밝기는 노출로만 맞춘다 (견본 오른쪽은 빛을 하나도 켜지 않았다).' },
    ],
    prev: ['u12', 'u04'],
    next: ['i474', 'i477'],
    refs: [
      { name: 'three.js 예제 — webgl_materials_envmaps_hdr', url: 'https://threejs.org/examples/#webgl_materials_envmaps_hdr' },
      { name: 'three.js 소스 — PMREMGenerator', url: 'https://github.com/mrdoob/three.js/blob/dev/src/extras/PMREMGenerator.js' },
      { name: 'Poly Haven — 무료 CC0 HDRI', url: 'https://polyhaven.com/hdris' },
    ],
    source: [{ file: 'demosRender.ts', symbol: 'makeHdri' }, { file: 'demosRender.ts', symbol: 'envFor' }],
  },

  i476: {
    id: 'i476',
    summary: '카메라 자식으로 단 무기에 걸음 8자 흔들림 · 숨 · 조준 확대 · 반동 스프링 · 섬광을 겹쳐, 1인칭 사격의 손맛을 낸다.',
    terms: [
      { en: 'First-person viewmodel (weapon sway / bob)', ko: '1인칭 손 · 무기 모델과 걸음 흔들림' },
      { en: 'ADS (aim down sights)', ko: '조준경을 눈앞으로 — 시야각을 좁혀 확대' },
      { en: 'Recoil spring (damped spring)', ko: '쏠 때 튀었다 돌아오는 감쇠 스프링' },
      { en: 'Muzzle flash', ko: '총구 섬광 + 순간 점광원' },
    ],
    goal: '{target}에 1인칭 무기 연출을 넣어 줘 — 화면 오른쪽 아래에 든 무기가 걸음 따라 8자로 흔들리고, 쏘면 반동 스프링 · 섬광, 조준하면 시야가 좁아지게. 분위기는 {style}.',
    targets: ['수학 과녁 쏘기 (문제 과녁 → 맞히면 답)', '1인칭 탐험 게임의 손전등 · 도구', '1인칭 물총 · 광선총 놀이'],
    styles: ['어두운 훈련장 · 푸른 에너지', '밝고 장난스러운 장난감 총', '실사 군사풍'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 무기를 메인 카메라 자식으로 두고 URP Camera Stack(오버레이 카메라)으로 따로 그려 벽에 묻히지 않게, 화면 흔들림은 Cinemachine Impulse 로.',
      godot: 'Godot 은 Camera3D 의 자식으로 무기 노드를 두고 _process 에서 스프링을 돌린다. 벽 뚫림이 문제면 무기만 SubViewport 로 따로 그린다.',
    },
    principle: [
      '무기를 카메라의 자식(pivot)으로 두면, 카메라가 어디를 보든 화면 같은 자리에 있다.',
      '자세 = 엉덩이 자세 ↔ 조준 자세(aimK 로 섞기) + 걸음(사인 8자) + 숨(느린 사인) + 반동 스프링 + 고개 돌릴 때 늦게 따라옴.',
      '반동은 「속도에 한 번 툭」 더하고 스프링(단단함 k · 감쇠 c)이 원래 자리로 끌어온다: v += (−k·x − c·v)·dt.',
      '조준하면 시야각을 62° → 40° 로 좁히고, 걸음 흔들림 · 숨 · 반동을 줄인다.',
      '섬광은 75ms 동안만 — 더하기 섞기 판 두 장 + 순간 점광원으로 둘레 벽까지 번쩍.',
    ],
    when: ['1인칭 시점 게임에서 「들고 있다」는 느낌이 필요할 때', '쏘기 · 던지기 같은 한 번의 동작에 손맛을 줄 때'],
    avoid: ['3인칭 · 위에서 보는 게임 — 대신 캐릭터 몸짓 · 카메라 킥', '어린 아이용 화면에서 실제 총 모양 — 물총 · 광선총 같은 장난감으로 바꾼다'],
    cost: 'light',
    costNote: '스프링 셋 · 사인 몇 개라 계산은 거의 없다. 섬광 점광원은 그림자를 끄고 쓴다 (켜면 그림자 지도 6장).',
    level: 2,
    must: [
      '무기는 카메라 자식으로 — 세계 좌표로 따라다니게 하지 않기',
      '반동 · 흔들림은 감쇠 스프링으로 (프레임 수와 상관없이 같게 — 긴 프레임은 8ms 조각으로 나눠 적분)',
      '조준 중에는 걸음 흔들림 75% · 숨 75% · 반동 45% 줄이기',
      '섬광 점광원은 castShadow 끔, 75ms 뒤 꺼짐',
      '시야각은 바뀔 때만 updateProjectionMatrix',
    ],
    done: [
      '걸으면 무기가 8자로 흔들리고 머리도 걸음의 2배 박자로 살짝 오르내린다',
      '「쏘기」를 누르면 무기가 뒤로 툭 튀었다 통통 돌아오고, 총구 섬광과 둘레 벽이 순간 밝아진다',
      '「조준」을 켜면 무기가 화면 가운데로 오며 시야가 좁아지고, 흔들림이 확 줄어든다',
      '고개를 돌리면 무기가 살짝 늦게 따라온다',
    ],
    code: {
      lang: 'ts',
      title: '반동 스프링 + 자세 섞기 (엉덩이 ↔ 조준 · 걸음 · 숨 · 반동)',
      from: 'demos/demosHard.ts springStep() · demo476() 의 fire · update 를 정리 (단위는 견본 장면 크기 그대로)',
      body: `interface Spring { x: number; v: number }
// 단단함 k · 감쇠 c — 8ms 조각으로 나눠 적분해 프레임이 길어도 튀지 않게
function springStep(s: Spring, k: number, c: number, dt: number): void {
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) { s.v += (-k * s.x - c * s.v) * h; s.x += s.v * h; }
}
const rz = { x: 0, v: 0 }, rp = { x: 0, v: 0 }, ry = { x: 0, v: 0 }; // 뒤로 · 들림 · 옆

function fire(): void {
  rz.v += 75 * (1 - 0.45 * aimK);     // 조준 중엔 반동이 작다
  rp.v += 2.6 * (1 - 0.3 * aimK);
  ry.v += (Math.random() - 0.5) * 1.2;
  flashT = now;
}

// 매 프레임
walkK += (walkWant - walkK) * Math.min(1, dt * 5);
aimK += (aimWant - aimK) * Math.min(1, dt * 8);
springStep(rz, 260, 21, dt); springStep(rp, 200, 17, dt); springStep(ry, 180, 15, dt);
const ph = t * 9.2, a = ease(aimK);
const W = walkK * (1 - 0.75 * aimK), br = 1 - 0.75 * a; // 조준하면 걸음 · 숨이 줄어든다
camera.position.y = EYE + Math.sin(ph * 2) * 1.5 * walkK; // 머리는 걸음의 2배 박자
const fov = THREE.MathUtils.lerp(62, 40, a);
if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
pivot.position.set( // pivot = 카메라 자식
  lerp(12.5, 0, a) + Math.sin(ph) * 1.1 * W + Math.sin(t * 0.85) * 0.12 * br + yawV * 2.2,
  lerp(-13.5, -14.15, a) - Math.abs(Math.cos(ph)) * 0.9 * W + Math.sin(t * 1.7) * 0.22 * br,
  lerp(-24, -9.5, a) + rz.x * 0.06);
pivot.rotation.set(lerp(0.02, 0, a) + rp.x * 0.05, lerp(0.1, 0, a) + ry.x * 0.03 + yawV * 0.05,
  lerp(0.03, 0, a) + Math.sin(ph) * 0.025 * W, 'YXZ');
const fl = (now - flashT) / 0.075;           // 섬광 75ms
flash.visible = fl < 1;
muzzleLight.intensity = fl < 1 ? 7000 * (1 - fl) : 0;`,
    },
    pitfalls: [
      { title: '반동을 위치에 바로 더하면 딱딱하게 튄다', fix: '속도(v)에 더하고 스프링이 끌어오게 해야 「툭 → 통통」 이 된다. 뒤로 · 들림 · 옆 세 축을 다른 k · c 로.' },
      { title: '조준 중에도 걸음 흔들림이 그대로면 조준점이 출렁인다', fix: '흔들림 · 숨에 (1 − 0.75·조준)을 곱해 줄인다.' },
      { title: '섬광 점광원에 그림자를 켜면 쏠 때마다 무겁다', fix: '점광원 그림자 = 그림자 지도 6장. 섬광 빛은 그림자 없이 75ms 만 켠다.', seen: true },
      { title: '시야각을 매 프레임 바꾸면 투영 행렬을 계속 다시 만든다', fix: '값이 실제로 바뀔 때만 updateProjectionMatrix 를 부른다.' },
    ],
    prev: ['i484', 'i199'],
    next: ['i481', 'i480'],
    source: [{ file: 'demosHard.ts', symbol: 'demo476' }, { file: 'demosHard.ts', symbol: 'springStep' }],
  },

  i479: {
    id: 'i479',
    summary: '물체 표면 모양을 따라 잘라 낸 그림 조각(DecalGeometry)을 붙여, 경고 스티커 · 일련번호 · 긁힘 · 그을음 · 탄흔을 덧입힌다.',
    terms: [
      { en: 'Decal (projected decal)', ko: '표면에 투영해 붙이는 그림 조각' },
      { en: 'DecalGeometry', ko: 'three.js — 메시를 상자 모양으로 잘라 데칼 모양을 만드는 도구' },
      { en: 'polygonOffset', ko: '깊이 겨루기(z-fighting) 막기 — 표면보다 살짝 앞으로' },
    ],
    goal: '{target}에 데칼을 붙여 줘 — DecalGeometry 로 표면 모양을 따라 휘게, 경고 스티커 · 번호 · 긁힘 · 그을음 · 탄흔을 차례로. 분위기는 {style}.',
    targets: ['상자 · 통 · 벽돌 벽 (창고 장면)', '탈것 · 장비에 번호 · 경고 표시', '벽에 남는 공 자국 · 발자국'],
    styles: ['낡은 산업 창고', '깨끗한 새 장비', '장난스러운 스티커 붙이기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 는 Decal Renderer Feature 를 켜고 Decal Projector 컴포넌트로 투영한다 (HDRP 에도 Decal Projector).',
      godot: 'Godot 4 는 Decal 노드 — 상자 범위 안 표면에 텍스처(알베도 · 노멀 · 발광)를 투영한다.',
    },
    principle: [
      '데칼 = 작은 투명 상자를 표면에 대고, 그 상자 안에 든 삼각형만 잘라 낸 새 메시다. 그래서 둥근 통에도 휘어 붙는다.',
      '붙일 자리(p)와 표면 방향(n)을 물체 좌표로 적어 두고, matrixWorld 로 세계 좌표로 바꿔 쓴다.',
      '상자 크기 s 의 z 는 투영 깊이 — 너무 깊으면 뒷면까지 잘려 묻는다.',
      '표면과 같은 깊이라 그대로면 깜박이므로 polygonOffset 으로 살짝 앞으로 당긴다.',
      '그림은 캔버스로 그린다 (경고 · 번호 · 긁힘 · 그을음 · 구멍 · 스텐실). 금속 긁힘은 metalness 를 높여 반짝이게.',
    ],
    when: ['큰 텍스처를 새로 그리지 않고 표면 디테일을 더할 때', '총알 자국 · 발자국처럼 게임 중에 생기는 흔적'],
    avoid: ['움직이고 휘는 캐릭터 몸 — 대신 텍스처에 직접 그리기', '수백 개가 계속 쌓이는 흔적 — 개수 한도를 두고 오래된 것부터 지운다 (발자국 데칼 참고)'],
    cost: 'medium',
    costNote: '데칼 하나 만들 때 원래 메시의 삼각형을 모두 검사한다 (원기둥 72조각이면 수천 개). 만든 뒤 그리기는 투명 메시 하나. 견본 10장은 프레임당 3ms 로 나눠 만든다.',
    level: 2,
    must: [
      '데칼 재질: transparent · depthWrite false · polygonOffset (factor · units −4)',
      '자리 · 방향은 물체 좌표로 정하고 matrixWorld 로 바꾼다 (만들기 전에 updateMatrixWorld)',
      '만든 모양은 원점 가까이로 옮기고(translate −pos) 메시 position 으로 되돌려 정밀도를 지킨다',
      '여러 장을 만들 땐 프레임당 3ms 예산으로 나눠, 그동안 「만드는 중」 표시',
      '데칼끼리 겹치는 차례는 renderOrder 로 고정',
    ],
    done: [
      '둥근 통에 붙인 이름표가 통 곡면을 따라 휘어 보인다',
      '데칼이 하나씩 0.14초 동안 커졌다 줄며 붙고, 붙는 순간 하얗게 번쩍했다 빠진다',
      '「데칼 보이기」를 끄면 맨 표면으로 돌아간다 — 켬/끔 비교로 디테일 차이가 보인다',
      '카메라가 돌아도 데칼이 깜박이거나(z-fighting) 표면 밑으로 묻히지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '자리 · 방향 → DecalGeometry → 데칼 재질 · 붙는 연출',
      from: 'demos/demosRender.ts makeDecals() 의 build() · update 를 정리',
      body: `import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// d = { p: 물체 좌표 자리, n: 표면 방향, s: 상자 크기(z = 투영 깊이), rot: 돌림, metal }
target.updateMatrixWorld(true);
const pos = new THREE.Vector3(...d.p).applyMatrix4(target.matrixWorld);
const nrm = new THREE.Vector3(...d.n).transformDirection(target.matrixWorld);
const helper = new THREE.Object3D();
helper.position.copy(pos);
helper.lookAt(pos.clone().add(nrm)); // 상자가 표면을 바라보게
helper.rotateZ(d.rot);
const geo = new DecalGeometry(target, pos, helper.rotation.clone(), new THREE.Vector3(...d.s));
geo.translate(-pos.x, -pos.y, -pos.z); // 원점 가까이 — 정밀도

const mat = new THREE.MeshStandardMaterial({
  map, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, // 표면보다 살짝 앞으로
  roughness: d.metal ? 0.32 : 0.6, metalness: d.metal ? 0.85 : 0,      // 금속 긁힘은 반짝
  emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0,
});
const decal = new THREE.Mesh(geo, mat);
decal.position.copy(pos);
decal.receiveShadow = true;
decal.renderOrder = 2 + i; // 겹치는 차례 고정
root.add(decal);

// 붙는 순간 (a = 붙은 뒤 초): 0.14초 동안 1.35 → 1배, 0.4초 동안 흰 빛이 빠진다
const pop = THREE.MathUtils.clamp(a / 0.14, 0, 1);
mat.opacity = pop;
mat.emissiveIntensity = Math.max(0, 1 - a / 0.4) * 0.9;
decal.scale.setScalar(1 + (1 - pop) * 0.35);`,
    },
    pitfalls: [
      { title: 'polygonOffset 없이 붙이면 표면과 깜박인다', fix: '데칼은 표면과 같은 깊이에 있다. polygonOffset(−4, −4) + depthWrite false 로 앞으로 당긴다.' },
      { title: 'matrixWorld 를 갱신하기 전에 만들면 엉뚱한 자리에 붙는다', fix: '물체를 장면에 넣고 updateMatrixWorld(true) 뒤에 DecalGeometry 를 만든다.' },
      { title: '여러 장을 한 프레임에 만들면 화면이 멈칫한다', fix: '데칼 하나가 원래 메시 삼각형을 다 돈다. 견본은 제너레이터로 프레임당 3ms 씩 나눠 만든다.', seen: true },
      { title: '투영 깊이(s.z)가 크면 뒷면까지 잘려 나온다', fix: '얇은 벽 · 통에선 깊이를 0.3 안팎으로. 견본의 그을음처럼 큰 것만 0.4.' },
    ],
    prev: ['i474', 'u09'],
    next: ['i215', 'i506'],
    refs: [
      { name: 'three.js 예제 — webgl_decals', url: 'https://threejs.org/examples/#webgl_decals' },
      { name: 'three.js 소스 — DecalGeometry', url: 'https://github.com/mrdoob/three.js/blob/dev/examples/jsm/geometries/DecalGeometry.js' },
    ],
    source: [{ file: 'demosRender.ts', symbol: 'makeDecals' }],
  },

  i90: {
    id: 'i90',
    summary: '글자를 하나씩 따로 그리고 차례 지연(stagger)을 주어, 튀어 올라 통 내려앉았다가 차례로 떨어지는 움직이는 제목을 만든다.',
    terms: [
      { en: 'Kinetic typography', ko: '움직이는 글자 연출' },
      { en: 'Stagger (per-character delay)', ko: '글자마다 조금씩 늦게 시작' },
      { en: 'easeOutBack overshoot', ko: '목표를 살짝 넘었다 돌아오는 이징' },
    ],
    goal: '{target}을(를) 글자마다 차례로 튀어 오르는 키네틱 타이포로 보여 줘 — 글자 사이 지연을 조절할 수 있게. 분위기는 {style}.',
    targets: ['「참 잘했어요!」 같은 정답 문구', '게임 제목', '단계 이름 · 레벨 업 글자'],
    styles: ['밝고 통통 튀는 만화', '고급스러운 금빛 제목', '장난스러운 무지개 색'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 TextMeshPro 의 textInfo.characterInfo 로 글자별 정점을 옮기는 방식이 흔하다.',
      godot: 'Godot 은 RichTextLabel 에 RichTextEffect(사용자 BBCode 효과)를 만들어 글자마다 위치 · 크기를 바꾼다.',
    },
    principle: [
      '문장을 글자 배열로 나누고, 글자 폭(measureText)을 더해 가운데 정렬 자리를 먼저 정한다.',
      '글자 i 는 시작 시간이 0.2 + i × 지연 — 같은 움직임이 차례로 번져 물결처럼 보인다.',
      '들어올 때: 위에서 내려오며 크기 0.2 → 1 (easeOutBack 로 살짝 넘침), 비스듬히 기울었다 바로 섬.',
      '내려앉은 뒤 0.5초: 지수로 줄어드는 사인(e^(−9t)·sin 30t)으로 가로로 퍼지고 세로로 눌렸다 통통.',
      '나갈 때: 시간의 제곱만큼 아래로 떨어지며(중력) 돌고 흐려진다.',
    ],
    when: ['정답 · 성공 순간을 크게 축하할 때', '제목 화면 · 단계 시작처럼 글자가 주인공인 순간'],
    avoid: ['읽어야 하는 긴 설명 — 대신 타자기처럼 한 글자씩 쳐지기', '자주 반복되는 작은 알림 — 매번 튀면 피곤하다'],
    cost: 'light',
    costNote: '글자 10개 안팎을 매 프레임 그리는 정도라 가볍다. 글자마다 테두리 · 그림자 · 하이라이트 4번 그리기.',
    level: 1,
    must: [
      '줄 자리는 글자를 다 놓았을 때 기준으로 미리 정한다 (움직이는 중에 옆 글자가 밀리지 않게)',
      '글자마다 지연 = 순서 × 간격, 간격은 조절판으로 (견본 0.09초, 0.02 ~ 0.25)',
      '크기 · 회전은 글자 아래쪽 근처를 축으로 (내려앉는 느낌)',
      '한 주기(견본 4.3초)로 끝없이 반복 — 처음과 끝 모두 빈 화면',
    ],
    done: [
      '글자가 왼쪽부터 하나씩 튀어 올라 살짝 넘쳤다 자리 잡는다',
      '내려앉는 순간 글자가 가로로 퍼졌다 통통 돌아온다',
      '「글자 사이 지연」 슬라이더를 키우면 물결이 느리게, 줄이면 한꺼번에 들어온다',
      '다 들어오면 부제 「정답!」 이 톡 나오고, 잠시 뒤 글자가 차례로 떨어진다',
    ],
    code: {
      lang: 'ts',
      title: '글자마다 지연 · 넘침 · 착지 찌그러짐 · 떨어지기',
      from: 'demos/demosMotionA.ts i90 의 draw 를 정리',
      body: `const outBack = (x: number, s = 1.9) => { const v = Math.min(1, Math.max(0, x)) - 1; return 1 + (s + 1) * v * v * v + s * v * v; };
const p = tt % 4.3; // 한 주기
chars.forEach((c, i) => {
  const cx = xs[i];                          // 미리 정한 글자 가운데 자리
  const tin = p - (0.2 + i * gap);           // 들어오기 시작 (gap = 0.09초)
  const tout = p - (3.4 + i * gap * 0.7);    // 나가기 시작
  if (tin < 0) return;
  const k = Math.min(1, tin / 0.55);
  let y = 78 - (1 - outBack(k, 2.4)) * 50;
  let sc = 0.2 + (1 - 0.2) * outBack(k, 2.2);
  let rot = (1 - (1 - Math.pow(1 - k, 3))) * (i % 2 ? 0.6 : -0.6);
  let a = Math.min(1, tin / 0.12);
  let sx = 1, sy = 1;
  const land = tin - 0.35;                   // 착지 뒤 0.5초 찌그러짐
  if (land > 0 && land < 0.5) { const q = Math.exp(-land * 9) * Math.sin(land * 30); sx = 1 + q * 0.25; sy = 1 - q * 0.25; }
  if (tout > 0) { y += tout * tout * 260; rot += tout * (i % 2 ? 2.2 : -2.2); a *= Math.max(0, 1 - tout * 1.6); sc *= 1 - tout * 0.2; }
  if (a <= 0) return;
  g.save();
  g.globalAlpha = a;
  g.translate(cx, y + 18); g.rotate(rot); g.scale(sc * sx, sc * sy); g.translate(0, -18); // 아래쪽 축
  g.lineJoin = 'round';
  g.strokeStyle = '#1a1446'; g.lineWidth = 6; g.strokeText(c, 0, 0);
  g.fillStyle = cols[i % cols.length]; g.fillText(c, 0, 0);
  g.restore();
});`,
    },
    pitfalls: [
      { title: '글자를 움직일 때마다 줄을 다시 재면 옆 글자가 출렁인다', fix: '자리는 다 놓인 문장 기준으로 한 번 정하고, 움직임은 그 자리를 축으로만 준다.' },
      { title: '가운데를 축으로 크기를 바꾸면 공중에서 부푸는 것처럼 보인다', fix: '글자 아래쪽(견본 +18)으로 옮겨 놓고 크기 · 회전을 준 뒤 되돌린다.' },
      { title: '모든 글자가 같은 쪽으로 기울면 단조롭다', fix: '홀짝 글자를 반대로 (i % 2 ? 0.6 : −0.6).' },
    ],
    next: ['i93', 'i202'],
    prev: ['u64'],
  },

  i92: {
    id: 'i92',
    summary: 'SVG textPath 로 문장을 원 둘레 길에 얹고 시작 위치(startOffset)만 계속 바꿔, 글자가 궤도를 따라 끝없이 흐르게 한다.',
    terms: [
      { en: 'SVG textPath', ko: '글자를 경로 위에 얹는 SVG 요소' },
      { en: 'startOffset', ko: '경로 위 글자 시작 위치 — 이것만 바꾸면 흐른다' },
      { en: 'textLength + lengthAdjust', ko: '글자 전체 길이를 경로 길이에 꼭 맞추기' },
    ],
    goal: '{target}에 길을 따라 흐르는 글자를 넣어 줘 — SVG textPath 의 startOffset 만 움직여서, 이음새 없이 돌게. 분위기는 {style}.',
    targets: ['원 둘레 · 행성 궤도 문구 (원의 둘레 = 2πr)', '나선 · 물결 길 위 문장', '배지 · 도장 둘레 글자'],
    styles: ['밤하늘 우주', '밝은 서커스 간판', '차분한 교과서'],
    platforms: ['web', 'canvas', 'unity', 'godot'],
    principle: [
      'textPath 는 글자를 경로(path) 위에 차례로 얹는다. startOffset 을 늘리면 글자들이 길을 따라 미끄러진다.',
      '경로를 두 바퀴로 그리고, 글자 길이를 정확히 한 바퀴(2πr)로 맞추면 한 바퀴 옮긴 모습이 처음과 똑같다 → 이음새 없음.',
      'textLength 를 둘레 길이로 주고 lengthAdjust="spacing" 으로 글자 사이만 늘려 맞춘다.',
      'startOffset = (시간 × 빠르기) mod 둘레. 안쪽 원은 다른 빠르기로 돌리면 깊이감이 생긴다.',
    ],
    when: ['원 · 궤도 · 나선을 다루는 장면에 설명을 겹칠 때', '배지 · 로고 둘레에 글자가 돌게 할 때'],
    avoid: ['글자를 하나하나 따로 움직여야 할 때 — 대신 캔버스로 글자마다 그리기 (키네틱 타이포)', '아주 긴 문장 — 곡선 위에선 읽기 어렵다'],
    cost: 'light',
    costNote: '속성 하나(startOffset)를 매 프레임 바꾸는 것뿐. 글자 배치는 브라우저가 한다.',
    level: 1,
    must: [
      '경로는 두 바퀴, 글자는 정확히 한 바퀴 길이 (textLength = 2πr) — 그래야 한 바퀴 넘어갈 때 튀지 않는다',
      'startOffset 은 둘레로 나눈 나머지(mod)로',
      '문장 끝에 구분 기호(★ · ✦)를 넣어 처음과 끝이 이어져 보이게',
      'viewBox + preserveAspectRatio="xMidYMid meet" 로 어떤 크기에서도 잘리지 않게',
    ],
    done: [
      '원 둘레를 따라 「원의 둘레 = 2 × π × 반지름」 이 끊김 없이 돈다',
      '안쪽 원의 「π = 3.14159…」 는 다른 빠르기로 돈다',
      '한 바퀴 넘어가는 순간에도 글자가 튀거나 겹치지 않는다',
      '「속도」 슬라이더로 빠르기가 바로 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '두 바퀴 경로 + 한 바퀴 글자 + startOffset 돌리기',
      from: 'demos/demosMotionA.ts i92 를 정리',
      body: `const R1 = 66, cx = 140, cy = 88;
const C1 = 2 * Math.PI * R1;                       // 둘레 = 글자 전체 길이
// 반원 호 둘 = 한 바퀴. 두 번 이어 두 바퀴 길을 만든다
const lap = (r: number) => 'a ' + r + ' ' + r + ' 0 1 1 0 ' + 2 * r + ' a ' + r + ' ' + r + ' 0 1 1 0 ' + -2 * r;
const d = 'M ' + cx + ' ' + (cy - R1) + ' ' + lap(R1) + ' ' + lap(R1);

box.innerHTML =
  '<svg viewBox="0 0 280 175" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">' +
  '<defs><path id="ring" d="' + d + '"/></defs>' +
  '<text style="font:800 12px sans-serif;fill:#ffe27a">' +
  '<textPath id="tp" href="#ring" textLength="' + C1.toFixed(2) + '" lengthAdjust="spacing">' +
  '원의 둘레 = 2 × π × 반지름 ★ 원의 둘레 = 2 × π × 반지름 ★ </textPath></text></svg>';
const tp = box.querySelector('#tp')!;

let tt = 0;
function update(dt: number): void {
  tt += dt * speed;
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  tp.setAttribute('startOffset', mod(tt * 30, C1).toFixed(2)); // 한 바퀴 옮기면 처음과 똑같다
}`,
    },
    pitfalls: [
      { title: '경로를 한 바퀴만 그리면 글자가 끝에서 사라졌다 처음에 나타난다', fix: '경로는 두 바퀴, 글자는 한 바퀴. 넘친 글자가 두 번째 바퀴에 그려져 끊김이 없다.' },
      { title: '글자 길이가 둘레와 다르면 한 바퀴마다 툭 튄다', fix: 'textLength 로 둘레 길이에 꼭 맞추고 lengthAdjust="spacing".' },
      { title: '같은 페이지에 견본이 여럿이면 path id 가 겹친다', fix: '견본은 id 에 번호를 붙여(ma92-1, ma92-2 …) 겹치지 않게 했다.' },
    ],
    prev: ['u57'],
    next: ['i90', 'i103'],
    refs: [{ name: 'MDN — <textPath>', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Element/textPath' }],
  },

  i93: {
    id: 'i93',
    summary: '칸마다 무작위 글자를 빠르게 바꾸다가 왼쪽부터 하나씩 정답으로 딸깍 고정해, 암호가 풀리는 해독 연출을 만든다.',
    terms: [
      { en: 'Text scramble / decode effect', ko: '무작위 글자가 정답으로 풀리는 연출' },
      { en: 'Staggered lock-in', ko: '칸마다 차례로 고정' },
      { en: 'Deterministic hash random', ko: '프레임 번호로 정하는 무작위 — 다시 그려도 같은 글자' },
    ],
    goal: '{target}에 암호 풀리는 글자 연출을 넣어 줘 — 무작위 글자가 돌다가 왼쪽부터 하나씩 정답으로 고정되고, 고정되는 순간 번쩍. 분위기는 {style}.',
    targets: ['비밀번호 · 숫자 4자리 해독', '검문소 「모순을 찾았다!」 같은 결과 문장', '숫자 야구 정답 공개'],
    styles: ['초록 해커 화면', '밝은 금고 열기', '어두운 첩보물'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '칸 i 의 고정 시각 = 0.6 + i × 0.5초. 그 전에는 무작위 글자, 그 뒤에는 정답 글자.',
      '무작위 글자는 「초당 15번」 바뀌는 tick 과 칸 번호로 해시해서 고른다 — 같은 프레임은 늘 같은 글자.',
      '고정되는 순간 번쩍(빛 번짐 e^(−5t))과 테두리 색으로 「딸깍」 을 보여 준다.',
      '숫자 칸은 기호 집합(0~9 # $ % …), 한글 문장은 한글 집합에서 골라 글자 모양이 어울리게.',
    ],
    when: ['답 · 비밀을 한 번에 보이지 않고 긴장감 있게 공개할 때', '진행 정도(■■□□)를 함께 보여 주고 싶을 때'],
    avoid: ['곧바로 읽어야 하는 안내 — 기다리게 만든다. 대신 바로 보이기', '아주 긴 문장 — 칸이 많으면 오래 걸린다'],
    cost: 'light',
    costNote: '칸 몇 개의 글자를 매 프레임 그리는 정도. 빛 번짐(shadowBlur)은 고정 순간에만.',
    level: 1,
    must: [
      '무작위는 Math.random 대신 프레임 번호 해시로 (화면이 다시 그려져도 같은 글자)',
      '글자 바뀜은 초당 15번 정도 — 매 프레임 바꾸면 너무 어지럽다',
      '칸마다 고정 시각을 차례로 늦추기 (견본 0.5초 간격)',
      '풀리는 중인 글자는 흐리게 · 살짝 떨리게, 고정된 글자는 또렷하게',
    ],
    done: [
      '네 칸의 숫자가 빠르게 바뀌다가 왼쪽부터 4 → 7 → 2 → 9 로 하나씩 고정된다',
      '고정되는 칸이 초록빛으로 번쩍하고 테두리가 진해진다',
      '아래 문장도 무작위 한글이 돌다가 「모순을 찾았다!」 로 풀린다',
      '다 풀리면 「해독 완료 ✓」 가 톡 나온다',
    ],
    code: {
      lang: 'ts',
      title: '칸마다 고정 시각 · 해시 무작위 · 고정 번쩍',
      from: 'demos/demosMotionA.ts i93 의 draw 를 정리',
      body: `const SYM = '0123456789#$%&?@*';
const code = ['4', '7', '2', '9'];
const hsh = (n: number) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

const p = tt % 5.4;                    // 한 주기
const cyc = Math.floor(tt / 5.4);      // 주기마다 다른 무작위
const tick = Math.floor(tt * 15);      // 글자는 초당 15번 바뀐다
code.forEach((c, i) => {
  const lockAt = 0.6 + i * 0.5;        // 왼쪽부터 차례로 고정
  const locked = p >= lockAt && p < 4.6;
  const flash = locked ? Math.exp(-(p - lockAt) * 5) : 0;
  const ch = locked ? c : SYM[Math.floor(hsh(tick * 7 + i * 13 + cyc) * SYM.length)];
  const x = x0 + i * 50;
  g.save();
  if (flash > 0) { g.shadowColor = '#6dffb4'; g.shadowBlur = 14 * flash; } // 딸깍 번쩍
  g.font = '800 30px Consolas, monospace';
  g.fillStyle = locked ? '#eafff4' : 'rgba(150,255,200,.55)';
  const jitter = locked ? 0 : (hsh(tick + i) - 0.5) * 3; // 풀리는 중엔 살짝 떨림
  g.fillText(ch, x + 21, 65 + jitter);
  g.restore();
});`,
    },
    pitfalls: [
      { title: 'Math.random 으로 고르면 같은 프레임을 다시 그릴 때 글자가 바뀐다', fix: '(tick, 칸 번호, 주기) 해시로 고른다. 카드 · 큰 화면 두 번 그려도 같다.' },
      { title: '매 프레임 글자를 바꾸면 눈이 아프다', fix: 'tick = floor(시간 × 15) 로 초당 15번만 바꾼다.' },
      { title: '고정 순간이 밋밋하면 「풀렸다」 가 안 느껴진다', fix: '빛 번짐 · 테두리 색을 지수로 빠지게(e^(−5t)) 주고, 효과음을 붙이면 더 좋다.' },
    ],
    prev: ['i90'],
    next: ['i94', 'i112'],
  },
  i94: {
    id: 'i94',
    summary: '자릿수마다 숫자 띠를 세로로 굴려 값을 바꾸고, 아래 자리가 9 → 0 으로 넘어갈 때만 윗자리가 함께 돌아 받아올림이 눈에 보이게 한다.',
    terms: [
      { en: 'Odometer / rolling counter', ko: '자동차 거리계처럼 굴러가는 숫자' },
      { en: 'Digit reel (slot reel)', ko: '자릿수마다 0~9 가 적힌 세로 띠' },
      { en: 'Carry propagation', ko: '받아올림이 윗자리로 번지기' },
    ],
    goal: '{target}을(를) 자릿수마다 세로 띠가 굴러가는 계기판 숫자로 보여 줘 — 999 → 1000 처럼 받아올림이 줄줄이 돌아가게. 분위기는 {style}.',
    targets: ['점수 · 합계 표시', '받아올림 보여 주기 (+1 씩 더하기)', '동전 · 보석 개수'],
    styles: ['보라 · 금빛 계기판', '옛 기계식 거리계', '밝은 게임 점수판'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '값 v 를 실수로 두고, 자리 k(1 · 10 · 100 …)마다 「지금 보일 숫자」 cv 를 계산한다.',
      '일의 자리: cv = v mod 10 — 소수 부분만큼 띠가 위로 밀린다.',
      '윗자리: cv = ⌊v / 10^k⌋ mod 10 + clamp(v mod 10^k − (10^k − 1), 0, 1). 아래 자리가 모두 9 에서 넘어가는 마지막 1 동안만 함께 돈다.',
      '띠에는 지금 숫자의 앞뒤(−1 ~ +2)만 그리고, 칸 밖은 clip 으로 자르며 위아래를 어둡게 덮어 둥근 북처럼 보이게 한다.',
    ],
    when: ['점수 · 돈이 바뀌는 순간을 눈에 띄게', '자릿값 · 받아올림 원리를 보여 줄 때'],
    avoid: ['값이 한 번에 수천씩 뛰는 경우 — 일의 자리가 너무 빨라 흐려진다. 대신 마지막 몇 자리만 굴리거나 숫자 튀기기', '작은 표 안의 많은 숫자 — 대신 바로 바꾸기'],
    cost: 'light',
    costNote: '자리마다 숫자 4개 + 그러데이션 두 장. 아주 가볍다.',
    level: 1,
    must: [
      '값은 실수로 두고 트윈(easeOutBack)으로 다음 정수까지 굴린다 — 정수만 쓰면 띠가 움직이지 않는다',
      '윗자리는 아래 자리가 모두 9 일 때만 움직이게 (위 식 그대로)',
      '칸 밖은 clip 으로 자르고 위아래에 어두운 그러데이션 — 둥근 북 느낌',
      '움직이는 자리는 테두리로 강조 (받아올림은 다른 색)',
    ],
    done: [
      '+1 할 때마다 일의 자리 띠가 한 칸 굴러 넘어간다',
      '999 → 1000 에서 일 · 십 · 백 · 천의 자리가 한꺼번에 돌고 「받아올림 3번!」 이 보인다',
      '되감기 때는 모든 자리가 거꾸로 굴러 처음 값으로 돌아간다',
    ],
    code: {
      lang: 'ts',
      title: '자리마다 보일 숫자(cv) 계산 + 띠 그리기',
      from: 'demos/demosMotionA.ts i94 의 draw 를 정리',
      body: `const mod = (a: number, b: number) => ((a % b) + b) % b;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// v = 992 + n + outBack((s - n) / 0.7, 1.2) 처럼 다음 정수로 굴러가는 실수 값
for (let col = 0; col < 4; col++) {
  const k = 3 - col;                 // 천 · 백 · 십 · 일
  const pw = Math.pow(10, k);
  const cv = k === 0
    ? mod(v, 10)
    : mod(Math.floor(v / pw), 10) + clamp01(mod(v, pw) - (pw - 1)); // 아래가 모두 9 일 때만 돈다
  const x = x0 + col * (CW + 8);
  g.save();
  g.beginPath(); g.roundRect(x, y0, CW, CH, 6); g.clip(); // 칸 밖은 자른다
  g.fillStyle = '#ffffff'; g.fillRect(x, y0, CW, CH);
  const base = Math.floor(cv);
  for (let d = base - 1; d <= base + 2; d++) {             // 앞뒤 숫자만
    const y = y0 + CH / 2 + (d - cv) * CH * 0.85;
    g.fillStyle = '#2a2350';
    g.fillText(String(mod(d, 10)), x + CW / 2, y);
  }
  const sh = g.createLinearGradient(0, y0, 0, y0 + CH);  // 둥근 북처럼 위아래 어둡게
  sh.addColorStop(0, 'rgba(30,20,70,.75)'); sh.addColorStop(0.28, 'rgba(30,20,70,0)');
  sh.addColorStop(0.72, 'rgba(30,20,70,0)'); sh.addColorStop(1, 'rgba(30,20,70,.75)');
  g.fillStyle = sh; g.fillRect(x, y0, CW, CH);
  g.restore();
}`,
    },
    pitfalls: [
      { title: '윗자리를 그냥 v / 10^k 로 굴리면 늘 조금씩 움직인다', fix: '윗자리는 정수 부분 + 「아래 자리가 9 에서 넘어가는 마지막 1」 만큼만 움직여야 진짜 거리계처럼 보인다.' },
      { title: '0 ~ 9 전부를 그리면 낭비이고 겹친다', fix: '지금 숫자 −1 ~ +2 만 그리고 clip 으로 자른다.' },
      { title: 'mod 를 % 로 쓰면 되감기(음수)에서 숫자가 깨진다', fix: '((a % b) + b) % b 로 늘 0 ~ 9.' },
    ],
    prev: ['i93'],
    next: ['i202', 'i101'],
  },

  i96: {
    id: 'i96',
    summary: '삼각형 · 사각형 · 오각형 · 육각형 · 원을 모두 같은 점 60개로 다시 나눠 두고, 점끼리 이어 섞어 모양이 부드럽게 바뀌게 한다.',
    terms: [
      { en: 'Shape morphing (point-matched path interpolation)', ko: '점 수를 맞춘 경로 보간' },
      { en: 'Resampling', ko: '모양 둘레를 같은 수의 점으로 다시 나누기' },
      { en: 'Start-point alignment', ko: '첫 점을 같은 방향(12시)에 맞춰 비틀림 막기' },
    ],
    goal: '{target}을(를) 도형 모핑으로 보여 줘 — 모든 모양을 같은 점 개수로 맞춰 두고 점끼리 이어서 바꾸기. 분위기는 {style}.',
    targets: ['삼각형 → 사각형 → … → 원 (변이 늘면 원에 가까워짐)', '아이콘 바꾸기 (재생 ▶ ↔ 멈춤 ❚❚)', '도형 분류 설명'],
    styles: ['밝은 파스텔', '네온 선', '교과서 도식'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '모양마다 점 개수가 다르면 이어 섞을 수 없다. 그래서 둘레를 모두 같은 개수(60)로 다시 나눈다.',
      'k 각형은 변마다 60 / k 개씩 — 꼭짓점 사이를 직선 보간으로 채운다. 원은 각도를 60 등분.',
      '첫 점을 12시 방향에 가장 가까운 점으로 돌려 맞춰야, 섞을 때 모양이 꼬이지(비틀리지) 않는다.',
      '섞기: 점 q 마다 lerp(A[q], B[q], k), k 는 inOut 이징. 섞는 동안 살짝 부풀었다(1 + 0.06·sin πk) 돌아온다.',
    ],
    when: ['「변의 수를 늘리면 원에 가까워진다」 처럼 모양 사이의 관계를 보여 줄 때', '아이콘 · 단추 모양을 상태에 따라 바꿀 때'],
    avoid: ['구멍이 있는 모양 · 여러 조각 모양 — 점 짝짓기가 어렵다. 대신 섞어 사라지기(크로스페이드)', '아주 복잡한 그림 — SVG 모핑 라이브러리를 쓴다'],
    cost: 'light',
    costNote: '점 60개 보간 · 경로 하나. 가볍다.',
    level: 2,
    must: [
      '모든 모양을 같은 점 개수(60)로 미리 계산해 둔다 — 매 프레임 다시 나누지 않기',
      '60 이 변 개수로 나누어떨어지게 (3 · 4 · 5 · 6 모두 OK)',
      '첫 점을 같은 방향(12시)으로 돌려 맞추기 — 안 하면 섞는 동안 꼬인다',
      '머무름(견본 0.9초) · 바뀜(0.75초)을 번갈아 주기로 반복',
      '「점 보기」 켬으로 60개 점이 어떻게 짝지어지는지 보여 주기',
    ],
    done: [
      '삼각형이 사각형 · 오각형 · 육각형 · 원으로 차례로 부드럽게 바뀌고 다시 삼각형으로 돌아온다',
      '바뀌는 동안 모양이 비틀리거나 안으로 접히지 않는다',
      '「점 60개 보기」 를 켜면 점들이 짝을 지어 미끄러지는 것이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '정다각형 · 원을 점 60개로 + 첫 점 맞추기 + 보간',
      from: 'demos/demosMotionA.ts polyPts() · i96 의 draw 를 정리',
      body: `const NPT = 60, TAU = Math.PI * 2;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function polyPts(k: number, R: number): [number, number][] {
  const out: [number, number][] = [];
  if (k === 0) { // 원
    for (let i = 0; i < NPT; i++) { const a = -Math.PI / 2 + (i / NPT) * TAU; out.push([Math.cos(a) * R, Math.sin(a) * R]); }
    return out;
  }
  const off = -Math.PI / 2 + (k % 2 === 0 ? Math.PI / k : 0); // 짝수 각형은 바닥이 평평하게
  const per = NPT / k;
  for (let s = 0; s < k; s++) {
    const a0 = off + (s / k) * TAU, a1 = off + ((s + 1) / k) * TAU;
    for (let j = 0; j < per; j++) {
      const f = j / per;
      out.push([lerp(Math.cos(a0), Math.cos(a1), f) * R, lerp(Math.sin(a0), Math.sin(a1), f) * R]);
    }
  }
  // 첫 점을 12시에 가장 가까운 점으로 — 모양끼리 비틀림이 덜하게
  let best = 0, bestA = 9;
  out.forEach(([x, y], i) => { const d = Math.abs(Math.atan2(x, -y)); if (d < bestA - 1e-6) { bestA = d; best = i; } });
  return out.slice(best).concat(out.slice(0, best));
}
const pts = [3, 4, 5, 6, 0].map((k) => polyPts(k, 52)); // 미리 한 번

// 그리기: A → B 를 k(0~1, inOut 이징)로
g.beginPath();
for (let q = 0; q < NPT; q++) {
  const x = lerp(A[q][0], B[q][0], k), y = lerp(A[q][1], B[q][1], k);
  if (q === 0) g.moveTo(x, y); else g.lineTo(x, y);
}
g.closePath();
g.fill();`,
    },
    pitfalls: [
      { title: '점 개수가 다른 모양끼리 섞으면 점이 엉뚱하게 날아간다', fix: '모두 같은 개수로 다시 나눈다. 60 은 3 · 4 · 5 · 6 으로 나누어떨어져 꼭짓점이 점 위에 딱 온다.' },
      { title: '첫 점 방향이 다르면 섞는 동안 모양이 꼬인다', fix: '12시에 가장 가까운 점을 첫 점으로 돌려 맞춘다.' },
      { title: '원을 조금씩 다른 방향에서 시작하면 섞을 때 돈다', fix: '원도 −90°(12시)부터 같은 방향으로 점을 찍는다.' },
    ],
    prev: ['u52'],
    next: ['i117', 'i120'],
  },

  i99: {
    id: 'i99',
    summary: '다음 화면을 비스듬한 띠 · 커지는 원 모양으로 잘라(clip) 그 안에만 그려, 띠가 쓸고 원이 열리며 화면이 바뀌게 한다.',
    terms: [
      { en: 'Wipe transition', ko: '쓸고 지나가며 바뀌는 장면 전환' },
      { en: 'Iris transition (circle reveal)', ko: '원 조리개가 열리며 드러남' },
      { en: 'Canvas clip() / CSS clip-path', ko: '그릴 영역을 모양으로 자르기' },
    ],
    goal: '{target}에 마스크 와이프 전환을 넣어 줘 — 비스듬한 띠가 쓸며 새 화면이 드러나고, 원 조리개가 열리며 돌아오게. 분위기는 {style}.',
    targets: ['문제 → 정답 화면 바꾸기', '단계 · 장면 전환', '결과 공개'],
    styles: ['밝은 만화 (흰 테두리 선)', '옛 영화 원 조리개', '깔끔한 앱 전환'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      web: 'DOM 화면이면 CSS clip-path: polygon(…) · circle(r at x y) 값을 트윈하면 같다.',
    },
    principle: [
      '두 장면을 함수로 두고(이전 · 다음), 이전 장면을 다 그린 뒤 다음 장면은 잘린 모양 안에만 그린다.',
      '띠 와이프: 비스듬한 선 x + 0.5·y = 경계 의 왼쪽을 다각형으로 잘라 그 안에 다음 장면. 경계를 −0.5h 에서 w 까지 옮긴다.',
      '원 조리개: 반지름 R = √(w² + h²) × 0.55 × k 인 원으로 잘라 그 안에 다음 장면 (k = 0 → 1).',
      '자른 경계에 흰 선을 그려 주면 「쓸고 지나간다」 가 또렷해진다.',
    ],
    when: ['화면 하나를 통째로 바꿀 때 (문제 → 정답)', '바뀌는 순간에 눈길을 모으고 싶을 때'],
    avoid: ['자주 오가는 탭 · 쪽 넘김 — 매번 쓸면 느리다. 대신 바뀌는 부분만 바로 갈아 끼우기', '3D 장면 전체 — 대신 후처리 패스로 같은 원리'],
    cost: 'light',
    costNote: '전환하는 동안만 두 장면을 함께 그린다 (그리기 2배). 끝나면 하나.',
    level: 1,
    must: [
      '장면은 「그리기 함수」로 두고 clip 안에서 다시 부를 수 있게',
      '원 조리개 반지름은 화면 대각선 기준 (√(w²+h²) × 0.55) — 모서리까지 다 덮이게',
      '이징은 inOut (천천히 시작 · 천천히 끝) — 전환 0.9초 안팎',
      '경계에 흰 선(4px)을 그려 움직임을 또렷하게',
    ],
    done: [
      '문제 화면 위로 비스듬한 흰 띠가 왼쪽에서 오른쪽으로 쓸며 정답 화면이 드러난다',
      '정답 화면 가운데서 원이 커지며 문제 화면이 다시 드러난다',
      '전환 중에도 두 화면 모두 계속 움직인다 (멈춘 그림이 아님)',
    ],
    code: {
      lang: 'ts',
      title: '띠 와이프 · 원 조리개 (캔버스 clip)',
      from: 'demos/demosMotionA.ts i99 의 draw 를 정리',
      body: `const inOut = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };

/** 띠 와이프 — 비스듬한 경계 왼쪽에만 다음 장면 */
function bandWipe(g: CanvasRenderingContext2D, w: number, h: number, k: number) {
  drawPrev(g, w, h);
  const edge = -h * 0.5 - 20 + (w + 20 - (-h * 0.5 - 20)) * inOut(k);
  g.save();
  g.beginPath();
  g.moveTo(-1, -1); g.lineTo(edge + h * 0.25, -1); g.lineTo(edge - h * 0.25, h + 1); g.lineTo(-1, h + 1);
  g.closePath();
  g.clip();
  drawNext(g, w, h);
  g.restore();
  g.strokeStyle = '#fff'; g.lineWidth = 4;   // 쓸고 가는 선
  g.beginPath(); g.moveTo(edge + h * 0.25, 0); g.lineTo(edge - h * 0.25, h); g.stroke();
}

/** 원 조리개 — 가운데서 열리는 원 안에만 다음 장면 */
function irisOpen(g: CanvasRenderingContext2D, w: number, h: number, k: number) {
  drawPrev(g, w, h);
  const R = Math.max(0.1, Math.hypot(w, h) * 0.55 * inOut(k)); // 대각선 기준 — 모서리까지
  g.save();
  g.beginPath(); g.arc(w / 2, h / 2, R, 0, Math.PI * 2); g.clip();
  drawNext(g, w, h);
  g.restore();
  g.strokeStyle = '#fff'; g.lineWidth = 4;
  g.beginPath(); g.arc(w / 2, h / 2, R, 0, Math.PI * 2); g.stroke();
}`,
    },
    pitfalls: [
      { title: '원 반지름을 화면 폭의 반으로 하면 모서리가 끝까지 안 덮인다', fix: '대각선 √(w²+h²) 의 반보다 조금 크게 (× 0.55).' },
      { title: 'save/restore 없이 clip 하면 뒤에 그리는 것까지 잘린다', fix: 'clip 은 save 와 restore 사이에서만.' },
      { title: '반지름 0 으로 arc 를 그리면 브라우저에 따라 오류 · 깜박임', fix: 'Math.max(0.1, R) 로 아주 작은 값을 둔다.' },
    ],
    prev: ['u52'],
    next: ['i106', 'i104'],
    refs: [
      { name: 'MDN — CanvasRenderingContext2D.clip()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip' },
      { name: 'MDN — CSS clip-path', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path' },
    ],
  },

  i101: {
    id: 'i101',
    summary: '격자 칸마다 「가운데에서의 거리 × 지연」 만큼 늦게 뒤집혀, 곱셈표 칸이 물결처럼 퍼지며 답을 드러내게 한다.',
    terms: [
      { en: 'Staggered grid animation (distance-based delay)', ko: '거리에 비례한 차례 지연' },
      { en: 'Card flip (scaleX = |cos θ|)', ko: '가로 크기를 줄였다 늘려 뒤집기 흉내' },
      { en: 'Ripple reveal', ko: '물결처럼 번지는 공개' },
    ],
    goal: '{target}을(를) 격자 물결로 뒤집어 보여 줘 — 칸마다 가운데에서의 거리에 비례해 늦게 뒤집히고, 앞면 → 뒷면(답). 분위기는 {style}.',
    targets: ['곱셈표 9×9 정답 공개', '픽셀 그림 · 노노그램 완성 연출', '타일 판이 한꺼번에 바뀌는 순간'],
    styles: ['짙은 남색 + 무지개 칸', '밝은 파스텔', '금빛 보상'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '칸 (r, c) 의 거리 d = √((r − 4)² + (c − 4)²) — 가운데(5 × 5) 칸에서 잰다.',
      '그 칸의 뒤집기 진행 f = seg(p, 0.3 + d × 지연, 0.3 + d × 지연 + 0.45). 거리가 같은 칸들이 함께 → 동그란 물결.',
      '뒤집기 흉내: 각도 θ = f·π, 가로 크기 = |cos θ|. 절반(θ > 90°)을 넘으면 뒷면(답)을 그린다.',
      '뒤집는 동안 sin θ 만큼 살짝 들어 올리면 입체감이 생긴다.',
    ],
    when: ['판 전체가 한꺼번에 바뀌는 순간 (정답 공개 · 완성)', '바뀌는 차례에 뜻이 있을 때 (가운데에서 바깥으로 · 누른 칸에서 번짐)'],
    avoid: ['칸 하나만 바뀔 때 — 그 칸만 뒤집는다', '수천 칸 — 캔버스 대신 셰이더로 같은 식을 쓴다'],
    cost: 'light',
    costNote: '칸 81개 × 둥근 네모 하나. 가볍다.',
    level: 1,
    must: [
      '지연 = 거리 × 간격 (견본 0.09초, 0.02 ~ 0.2 조절)',
      '뒤집기는 scaleX = |cos θ| 로, 0 이 되는 순간 앞 · 뒷면을 바꾼다 (scale 0 은 0.02 로 막기)',
      '앞면 → 뒷면 → 앞면 두 번의 물결로 끝없이 반복',
      '물결 고리(지연에 맞춰 커지는 원)를 함께 그려 「번진다」 를 보여 주기',
    ],
    done: [
      '가운데 노란 칸부터 바깥쪽으로 동그랗게 칸이 뒤집히며 곱셈 답이 나온다',
      '「거리당 지연」 을 키우면 물결이 느리게 번지고, 줄이면 한꺼번에 뒤집힌다',
      '잠시 뒤 같은 물결로 다시 앞면이 된다',
    ],
    code: {
      lang: 'ts',
      title: '거리 지연 · 뒤집기(|cos θ|) · 앞뒤 면',
      from: 'demos/demosMotionA.ts i101 의 draw 를 정리',
      body: `const seg = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));
const N = 9, CS = 17, D = 0.45;
const p = tt % 6.4;
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++) {
    const d = Math.hypot(r - 4, c - 4);                       // 가운데에서의 거리
    const f1 = seg(p, 0.3 + d * delay, 0.3 + d * delay + D);   // 앞 → 뒤
    const f2 = seg(p, 3.6 + d * delay, 3.6 + d * delay + D);   // 뒤 → 앞
    const ang = (p < 3.6 ? f1 : 1 + f2) * Math.PI;
    const sx = Math.abs(Math.cos(ang));                        // 가로로 줄었다 늘어남 = 뒤집기
    const back = f1 - f2 > 0.5 || (p >= 3.6 && f2 < 0.5 && f1 >= 1);
    const x = x0 + c * CS + CS / 2, y = y0 + r * CS + CS / 2;
    g.save();
    g.translate(x, y - Math.abs(Math.sin(ang) * 2));          // 뒤집는 동안 살짝 들림
    g.scale(Math.max(0.02, sx), 1);
    g.beginPath(); g.roundRect(-CS / 2 + 1, -CS / 2 + 1, CS - 2, CS - 2, 3);
    if (back) {
      const v = (r + 1) * (c + 1);
      g.fillStyle = 'hsl(' + ((330 - v * 3.2) % 360) + ',85%,' + (62 - v * 0.15) + '%)';
      g.fill();
      g.fillStyle = '#fff'; g.fillText(String(v), 0, 0.5);
    } else {
      g.fillStyle = r === 4 && c === 4 ? '#ffd166' : '#3a438c';
      g.fill();
    }
    g.restore();
  }`,
    },
    pitfalls: [
      { title: '순서(번호) 대로 지연하면 줄 단위로 넘어가 물결이 안 된다', fix: '지연을 「가운데(또는 누른 칸)에서의 거리」 로 주어야 동그랗게 번진다.' },
      { title: 'scale 0 에서 그리면 경고 · 깜박임', fix: 'Math.max(0.02, |cos θ|) 로 아주 얇게 남긴다.' },
      { title: '뒤집기 중간에 앞뒤 면을 바꾸지 않으면 글자가 거울처럼 보인다', fix: 'θ 가 90° 를 넘는 순간(진행 0.5) 뒷면으로 바꿔 그리고, 뒷면은 뒤집힌 채가 아니게 그린다.' },
    ],
    prev: ['i90'],
    next: ['u66', 'i122'],
  },

  i102: {
    id: 'i102',
    summary: '뛰기 전에 움츠리고(예비 동작), 공중에서 늘어나고, 착지 때 찌그러졌다 감쇠 스프링으로 통통 돌아오게 해 움직임에 무게와 탄력을 준다.',
    terms: [
      { en: 'Squash and stretch', ko: '찌그러짐 · 늘어남 (애니메이션 12원칙)' },
      { en: 'Anticipation', ko: '예비 동작 — 움직이기 전 반대쪽으로 움츠림' },
      { en: 'Damped spring (e^(−ct)·cos ωt)', ko: '감쇠 진동 — 출렁이다 멈춤' },
      { en: 'Volume preservation', ko: '세로로 눌리면 가로로 퍼져 부피 유지' },
    ],
    goal: '{target}에 스프링 · 예비 동작 · 찌그러짐을 넣어 줘 — 뛰기 전 움츠림, 공중에서 늘어남, 착지 때 감쇠 스프링으로 통통. 분위기는 {style}.',
    targets: ['폴짝 뛰는 블록 캐릭터', '눌렀다 떼는 단추', '판에 내려놓는 블록 · 말'],
    styles: ['통통 튀는 만화', '말랑한 젤리', '묵직한 나무 블록'],
    platforms: ['canvas', 'three', 'web', 'unity', 'godot'],
    principle: [
      '예비 동작(0.05 ~ 0.35초): 세로 sy = 1 − 0.32·sin(k·π/2), 가로 sx = 1 + 0.8·(1 − sy) — 눌린 만큼 퍼진다.',
      '공중: 위로 오를 때 · 내려올 때 빠를수록 길쭉하게 (v = |1 − 2·진행|, sy = 1 + 0.28v², sx = 1 − 0.18v²), 꼭대기에선 둥글게.',
      '착지: q = e^(−6τ)·cos(떨림 × τ), sy = 1 − 0.35q, sx = 1 + 0.3q — 눌렸다 출렁이며 멈춘다.',
      '크기는 발바닥(바닥에 닿는 점)을 축으로 줘야 땅에 붙은 채 찌그러진다.',
    ],
    when: ['캐릭터 · 블록이 뛰거나 떨어질 때', '단추 · 카드처럼 눌리는 모든 것에 살아 있는 느낌을 줄 때'],
    avoid: ['딱딱해야 하는 물체 (금속 · 유리 · 글자 표) — 대신 살짝 튀기(위치만)', '정확한 위치가 중요한 판 — 찌그러짐으로 칸이 겹쳐 보이면 안 된다'],
    cost: 'light',
    costNote: '크기 두 값 계산뿐. 아주 가볍다.',
    level: 2,
    must: [
      '크기 축은 발바닥(아래쪽 가운데) — 가운데 축이면 공중에 떠서 찌그러진다',
      '세로로 눌리면 가로로 퍼지게 (부피 유지 느낌)',
      '착지 스프링은 지수 감쇠 × 코사인 — 떨림 빠르기를 조절판으로 (견본 18, 8 ~ 34)',
      '왼쪽 「그냥 오르내림」 과 오른쪽 「스프링」 을 나란히 두어 차이를 보이기',
      '그림자는 높이에 따라 작고 옅게',
    ],
    done: [
      '오른쪽 블록이 뛰기 직전 납작하게 움츠렸다가 길쭉하게 솟는다',
      '착지하는 순간 납작하게 퍼졌다 몇 번 출렁이며 제 모양으로 돌아온다 — 왼쪽은 그냥 오르내린다',
      '「스프링 떨림」 을 올리면 출렁임이 빨라진다',
      '아래 작은 그래프에 세로 크기가 시간에 따라 어떻게 변하는지 보인다',
    ],
    code: {
      lang: 'ts',
      title: '예비 동작 · 공중 늘어남 · 착지 감쇠 스프링',
      from: 'demos/demosMotionA.ts i102 의 draw · jumper() 를 정리',
      body: `const seg = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));
const T = 2.4, up0 = 0.35, up1 = 1.15;   // 0.35 ~ 1.15초 공중
const p = tt % T;
const air = seg(p, up0, up1);
const yAir = air > 0 && air < 1 ? 4 * air * (1 - air) : 0; // 포물선 높이 0~1
let sx = 1, sy = 1;
if (p < up0) {                            // 예비 동작: 움츠림
  const sq = Math.sin(seg(p, 0.05, up0) * Math.PI * 0.5) * 0.32;
  sy = 1 - sq; sx = 1 + sq * 0.8;
} else if (p < up1) {                     // 공중: 빠를수록 길쭉
  const v = Math.abs(1 - 2 * air);
  sy = 1 + 0.28 * v * v; sx = 1 - 0.18 * v * v;
} else {                                  // 착지: 감쇠 스프링
  const tau = p - up1;
  const q = Math.exp(-tau * 6) * Math.cos(tau * stiff); // stiff = 18
  sy = 1 - 0.35 * q; sx = 1 + 0.3 * q;
}
const y = groundY - yAir * 80;
g.save();
g.translate(x, y);        // 발바닥이 축
g.scale(sx, sy);
g.beginPath(); g.roundRect(-16, -32, 32, 32, 8); // 몸은 축 위쪽으로
g.fillStyle = '#ffcf5c'; g.fill();
g.restore();`,
    },
    pitfalls: [
      { title: '가운데를 축으로 찌그러뜨리면 땅에서 떠 보인다', fix: '몸을 축 위쪽(−32 ~ 0)에 그리고 발바닥 자리로 translate 한 뒤 scale.' },
      { title: '세로만 줄이면 고무가 아니라 종이처럼 보인다', fix: '세로가 줄어든 만큼 가로를 늘린다 (sx = 1 + 0.8·눌림).' },
      { title: '감쇠가 약하면 착지 뒤 계속 떤다', fix: 'e^(−6τ) 처럼 0.5초 안에 거의 멈추는 감쇠를 쓴다.' },
    ],
    prev: ['i293'],
    next: ['i206', 'i214'],
    refs: [{ name: 'Wikipedia — Squash and stretch', url: 'https://en.wikipedia.org/wiki/Squash_and_stretch' }],
  },

  i103: {
    id: 'i103',
    summary: '곡선 위 점의 미분(접선)으로 진행 방향 각도를 구해, 길을 따라가는 물체가 가는 쪽으로 몸을 돌리게 한다.',
    terms: [
      { en: 'Path following with tangent orientation', ko: '경로 따라가기 + 접선 방향 맞춤' },
      { en: 'Parametric curve derivative', ko: '매개변수 곡선의 미분 = 진행 방향' },
      { en: 'Shortest-angle interpolation', ko: '짧은 쪽으로 각도 따라 돌기' },
    ],
    goal: '{target}이(가) 곡선 길을 따라가며 진행 방향으로 몸을 돌리게 해 줘 — 접선 각도를 쓰고, 각도는 짧은 쪽으로 부드럽게 따라가게. 분위기는 {style}.',
    targets: ['8자 길을 나는 종이비행기', '그래프 위를 달리는 점 · 자동차', '포물선을 그리며 나는 공'],
    styles: ['모눈종이 위 남색 밤', '밝은 놀이공원 레일', '교과서 그래프'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Splines 패키지의 SplineAnimate(Align To: Spline Element)가 같은 일을 한다.',
      godot: 'Godot 은 Path2D + PathFollow2D 의 rotates 를 켜면 접선 방향으로 돈다.',
    },
    principle: [
      '길을 매개변수 식으로 둔다. 견본의 8자: P(θ) = (cx + A·sin θ, cy + B·sin θ·cos θ).',
      '미분하면 진행 방향: D(θ) = (A·cos θ, B·cos 2θ). 각도 = atan2(Dy, Dx).',
      '각도를 바로 넣으면 −180° ↔ 180° 에서 휙 돈다. 차이를 −π ~ π 로 접은 뒤(짧은 쪽) 조금씩 따라간다.',
      'face += 차이 × min(1, dt × 14) — 빠르게 따라가되 끊기지 않게.',
    ],
    when: ['비행기 · 물고기 · 자동차처럼 「앞」 이 있는 물체가 곡선을 따라갈 때', '그래프 · 궤적 위 점의 방향(기울기)을 보여 줄 때'],
    avoid: ['공 · 별처럼 앞뒤가 없는 물체 — 돌릴 필요 없다', '식이 없는 손그림 길 — 점 목록이면 이웃 두 점의 차로 방향을 구한다'],
    cost: 'light',
    costNote: '삼각함수 몇 개. 아주 가볍다.',
    level: 2,
    must: [
      '진행 방향은 미분(또는 이웃 점의 차)으로 — 「다음 프레임 위치 − 지금 위치」 는 속도가 0 일 때 흔들린다',
      '각도 차이는 ((목표 − 지금 + π) mod 2π) − π 로 짧은 쪽',
      '「방향 맞춤 끔」 과 번갈아 보여 차이를 비교하기',
      '접선(점선)을 함께 그려 방향이 어디서 오는지 보이기',
    ],
    done: [
      '종이비행기가 8자 길을 따라가며 늘 앞쪽 끝이 진행 방향을 향한다',
      '「끔」 일 때는 옆으로 미끄러져 어색해 보인다 — 켬/끔 차이가 바로 보인다',
      '8자의 교차점에서도 비행기가 휙 돌지 않고 부드럽게 방향을 바꾼다',
    ],
    code: {
      lang: 'ts',
      title: '8자 길 · 미분으로 방향 · 짧은 쪽으로 따라 돌기',
      from: 'demos/demosMotionA.ts i103 의 draw 를 정리',
      body: `const TAU = Math.PI * 2;
const mod = (a: number, b: number) => ((a % b) + b) % b;
const A = 105, B = 105;
const P = (th: number): [number, number] => [cx + A * Math.sin(th), cy + B * Math.sin(th) * Math.cos(th)];
const Dv = (th: number): [number, number] => [A * Math.cos(th), B * Math.cos(2 * th)]; // P 의 미분

let face = 0; // 지금 몸 방향
function draw(g: CanvasRenderingContext2D, tt: number, dt: number) {
  const th = tt * 0.9;
  const [x, y] = P(th);
  const [dx, dy] = Dv(th);
  const ang = Math.atan2(dy, dx);                       // 진행 방향
  const diff = mod(ang - face + Math.PI, TAU) - Math.PI; // 짧은 쪽 (−π ~ π)
  face += diff * Math.min(1, dt * 14);
  g.save();
  g.translate(x, y);
  g.rotate(face);
  g.beginPath();            // 앞(+x)이 뾰족한 종이비행기
  g.moveTo(14, 0); g.lineTo(-10, -9); g.lineTo(-5, 0); g.lineTo(-10, 9);
  g.closePath();
  g.fillStyle = '#fff'; g.fill();
  g.restore();
}`,
    },
    pitfalls: [
      { title: '각도를 그대로 따라가면 180° 근처에서 한 바퀴 휙 돈다', fix: '차이를 −π ~ π 로 접어 짧은 쪽으로 돌린다.' },
      { title: '그림의 「앞」 이 +x 가 아니면 늘 90° 어긋난다', fix: '그림을 +x 쪽이 앞이 되게 그리거나, 각도에 고정 오프셋을 더한다.' },
      { title: '위치 차이로 방향을 구하면 느릴 때 떨린다', fix: '식이 있으면 미분을, 없으면 조금 떨어진 두 점(앞뒤 0.04)의 차를 쓴다.' },
    ],
    prev: ['i92'],
    next: ['i104', 'i298'],
    refs: [{ name: 'Godot 문서 — PathFollow2D', url: 'https://docs.godotengine.org/en/stable/classes/class_pathfollow2d.html' }],
  },
  i104: {
    id: 'i104',
    summary: '먼 층은 느리게 · 가까운 층은 빠르게 옮기는 2D 카메라(시차)와, 확대 배율을 10 의 거듭제곱으로 돌려 수직선을 끝없이 확대하는 방법.',
    terms: [
      { en: 'Parallax scrolling', ko: '층마다 다른 빠르기로 옮겨 깊이감' },
      { en: '2D camera transform (pan / zoom)', ko: '그림 전체를 옮기고 키우는 2D 카메라' },
      { en: 'Infinite zoom (log-scale level of detail)', ko: '배율을 로그로 돌려 끝없이 확대 — 눈금 단계가 차례로 나타남' },
    ],
    goal: '{target}에 2D 카메라를 넣어 줘 — 배경 층은 시차로 다른 빠르기, 수직선은 0.1 → 0.01 → 0.001 로 끝없이 확대되게. 분위기는 {style}.',
    targets: ['수직선 무한 확대 (소수 자리)', '옆으로 달리는 장면의 산 · 언덕 · 나무 배경', '지도 축척 확대'],
    styles: ['밝은 낮 풍경 + 짙은 남색 수직선', '그림책 종이 오리기 층', '우주 · 별 층'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      godot: 'Godot 은 ParallaxBackground + ParallaxLayer(motion_scale) 로 시차, Camera2D 의 zoom 으로 확대.',
      unity: 'Unity 는 층마다 Transform 을 카메라 이동 × 배율로 옮기는 스크립트가 흔하다 (Cinemachine 2D 카메라와 함께).',
    },
    principle: [
      '시차: 층마다 오프셋 = 시간(또는 카메라 x) × 빠르기. 견본은 먼 산 6 · 언덕 16 · 나무 40 (×0.15 · ×0.4 · ×1).',
      '층은 주기 함수(사인)로 그려 오프셋이 아무리 커져도 이어진다. 나무는 간격 sp 마다 화면 안 것만 그린다.',
      '무한 확대: 배율 z 를 0 → 3 으로 돌리고(10 의 z 제곱 배), 눈금 단계 n 마다 칸 너비 px = 길이 × 10^z × 10^(−n).',
      '칸이 3px 보다 작은 단계는 그리지 않고, 커질수록 진하게 · 굵게 · 이름표까지 — 단계가 차례로 「피어난다」.',
      '3단계를 다 돌면 처음과 같은 모습이 되므로(10배 자리 이동) 이음새 없이 반복된다.',
    ],
    when: ['옆으로 움직이는 장면에 깊이를 줄 때', '수직선 · 지도처럼 「더 자세히 보면 또 칸이 있다」 를 보여 줄 때'],
    avoid: ['3D 장면 — 원근 카메라가 저절로 시차를 만든다', '확대해도 새 정보가 없는 그림 — 대신 켄 번스처럼 천천히 밀기'],
    cost: 'light',
    costNote: '층마다 경로 하나 · 눈금 선 최대 400개. 화면 밖 칸은 건너뛴다.',
    level: 2,
    must: [
      '층 빠르기는 멀수록 작게 — 가장 가까운 층이 기준(×1)',
      '눈금은 화면에 보이는 것만 그리고, 3px 보다 작은 단계는 건너뛴다 (최대 400개)',
      '단계마다 투명도 · 굵기를 칸 너비에 따라 서서히 — 갑자기 튀어나오지 않게',
      '이름표 소수 자리 수 = 단계 n (toFixed(n)) — 0.1, 0.01, 0.001',
      '확대 주기(견본 3.2초 × 3단계)를 마치면 처음과 같은 모습',
    ],
    done: [
      '위쪽에서 먼 산은 천천히, 언덕은 조금 빠르게, 나무는 가장 빠르게 지나간다',
      '아래 수직선이 계속 확대되며 0.1 칸 사이에 0.01 칸이, 그 사이에 0.001 칸이 차례로 나타난다',
      '한 바퀴가 끝나도 확대가 끊기지 않고 이어진다',
    ],
    code: {
      lang: 'ts',
      title: '시차 층 + 끝없이 확대되는 수직선 눈금',
      from: 'demos/demosMotionA.ts i104 의 draw 를 정리',
      body: `/** 시차 층 — speed 가 클수록 가깝다. f 는 주기 함수라 오프셋이 커져도 이어진다 */
function layer(speed: number, base: number, amp: number, per: number, col: string, f: (x: number) => number) {
  const off = tt * speed * u;
  g.fillStyle = col;
  g.beginPath(); g.moveTo(0, topH);
  for (let x = 0; x <= w + 4; x += 4) g.lineTo(x, topH * base - f((x + off) / (per * u)) * amp * u);
  g.lineTo(w, topH); g.fill();
}
layer(6, 0.72, 26, 60, '#9fb6e8', (x) => Math.abs(Math.sin(x)) * 0.8 + Math.sin(x * 2.3) * 0.15); // 먼 산
layer(16, 0.86, 12, 40, '#76c46e', (x) => Math.sin(x) * 0.6 + 0.5);                               // 언덕

/** 끝없이 확대 — z: 0 → 3 (10^z 배), 단계 n 의 칸 너비 px */
const z = (tt / 3.2) % 3;
const zl = Math.floor(z);
for (let n = zl; n <= zl + 3; n++) {
  const stepU = Math.pow(10, -n);
  const px = L * Math.pow(10, z) * stepU;
  if (px < 3) continue;                                    // 너무 촘촘한 단계는 건너뛴다
  const vis = Math.min(1, (px - 3) / 12);                  // 커질수록 진하게
  const big = Math.max(0, Math.min(1, Math.log10(px / 4) / 2));
  const th = (4 + 10 * big) * u * 0.6;
  const cnt = Math.min(400, Math.floor(L / px) + 1);
  g.strokeStyle = 'rgba(255,255,255,' + vis + ')';
  g.lineWidth = 1 + big;
  for (let i = 0; i <= cnt; i++) {
    if (i % 10 === 0 && n > zl) continue;                  // 윗단계 눈금과 겹치는 자리는 건너뛰기
    const x = x0 + i * px;
    if (x > w) break;
    g.beginPath(); g.moveTo(x, lineY - th); g.lineTo(x, lineY + th); g.stroke();
  }
  if (px > 22 * u && px < L * 1.05)                        // 칸이 넉넉한 단계만 이름표
    for (let i = 1; i <= Math.min(10, cnt); i++) g.fillText((i * stepU).toFixed(n), x0 + i * px, lineY + th + 3 * u);
}`,
    },
    pitfalls: [
      { title: '배율을 그대로 키우면 숫자가 금방 넘치고 눈금이 수백만 개가 된다', fix: '배율을 0 ~ 3 으로 돌리고 단계 n 을 함께 옮긴다. 눈금은 화면 안 · 최대 400개만.' },
      { title: '새 단계 눈금이 갑자기 나타나면 깜박인다', fix: '칸 너비 px 로 투명도 · 굵기를 서서히 올린다 ((px − 3) / 12).' },
      { title: '층을 이미지 한 장으로 옮기면 끝에서 이음새가 보인다', fix: '주기 함수로 그리거나, 같은 그림 두 장을 이어 붙여 mod 로 옮긴다.' },
    ],
    prev: ['i99'],
    next: ['i106', 'u40'],
    refs: [{ name: 'Wikipedia — Parallax scrolling', url: 'https://en.wikipedia.org/wiki/Parallax_scrolling' }],
  },

  i106: {
    id: 'i106',
    summary: '휙 지나가며 한 방향으로 번지는 휩 팬, 숫자 0 의 구멍으로 빨려 드는 줌 통과, 같은 자리 · 크기의 모양으로 잇는 매치 컷으로 장면을 바꾼다.',
    terms: [
      { en: 'Whip pan transition', ko: '카메라를 휙 돌리듯 한 방향 흐림 전환' },
      { en: 'Zoom-through (hole reveal)', ko: '모양의 구멍으로 확대해 들어가 다음 장면' },
      { en: 'Match cut', ko: '같은 자리 · 크기 · 모양으로 이어 붙이는 컷' },
      { en: 'Even-odd clip path', ko: '구멍 뚫린 모양으로 자르기 (evenodd)' },
    ],
    goal: '{target}에 영화식 장면 전환을 넣어 줘 — 휩 팬(한 방향 흐림), 숫자 구멍으로 줌 통과, 같은 자리 모양으로 매치 컷. 분위기는 {style}.',
    targets: ['1일차 → 2일차 → 3일차 넘기기', '단계 · 레벨 넘김', '이야기 장면 전환'],
    styles: ['밝은 만화 영화', '빠르고 힘찬 예고편', '부드러운 그림책'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '휩 팬: 두 장면을 나란히 붙여 함께 옆으로 민다. 가운데서 가장 빠르게(vel = sin πk), 빠를수록 반투명 복사본을 여러 장(1 + 8·vel) 조금씩 밀려 겹쳐 그려 흐림을 흉내 낸다.',
      '줌 통과: 다음 장면을 먼저 그리고, 그 위에 이전 장면을 「구멍만 뚫린」 모양(큰 사각형 + 타원, evenodd)으로 잘라 그린 채 16^(k^2.2) 배로 키운다 — 구멍이 화면을 덮으며 다음 장면이 드러난다.',
      '매치 컷: 달과 해처럼 같은 자리 · 같은 크기의 모양을 두고 바로 바꾼 뒤, 흰 원이 번쩍(e^(−7t)) 하며 이어 준다.',
    ],
    when: ['일차 · 단계처럼 「다음 것으로 넘어간다」 를 힘 있게 보여 줄 때', '두 장면 사이에 공통된 모양(숫자 0 · 해 · 달)이 있을 때'],
    avoid: ['자주 오가는 메뉴 · 탭 — 매번 길면 답답하다. 대신 바뀌는 부분만 바로', '멀미가 날 만큼 빠른 휩 팬을 연달아'],
    cost: 'light',
    costNote: '휩 팬 순간에만 장면을 최대 9 × 2 번 그린다 (0.55초). 장면이 무거우면 미리 오프스크린 캔버스에 찍어 두고 그 그림을 민다.',
    level: 2,
    must: [
      '장면은 「그리기 함수」로 두어 복사본 · 잘린 영역 안에서 다시 그릴 수 있게',
      '휩 팬은 가운데서 가장 빠르게 — 복사본 수와 속도선 투명도를 vel 에 맞추기',
      '줌 통과 확대는 처음엔 천천히, 끝에 빠르게 (k^2.2) — 구멍 가운데를 축으로',
      '매치 컷의 두 모양은 화면 자리 · 크기를 똑같이 (견본 반지름 30)',
      '어느 전환인지 작은 이름표로 보여 주기',
    ],
    done: [
      '1일차가 휙 옆으로 흐려지며 2일차가 들어온다 (한 방향 흐림 + 가로 속도선)',
      '2일차의 주황 숫자 0 구멍으로 확대해 들어가면 그 속에 3일차 밤하늘이 보인다',
      '3일차 달이 같은 자리의 1일차 해로 딱 바뀌며 흰빛이 번쩍한다',
    ],
    code: {
      lang: 'ts',
      title: '휩 팬 복사본 흐림 · evenodd 구멍 줌 통과',
      from: 'demos/demosMotionA.ts i106 의 draw 를 정리',
      body: `// 휩 팬 — whip 0 → 1 (0.55초)
const k = inOut(whip);
const vel = Math.sin(whip * Math.PI);          // 가운데서 가장 빠름
const nCopies = 1 + Math.round(vel * 8);       // 빠를수록 복사본 여러 장 = 흐림
for (let c = 0; c < nCopies; c++) {
  const off = (k + (c / Math.max(1, nCopies)) * 0.12 * vel) * w;
  const a = c === 0 ? 1 : 0.5 / nCopies + 0.05;
  for (const [dx, scene] of [[-off, sceneA], [w - off, sceneB]] as const) {
    g.save(); g.globalAlpha = a; g.translate(dx, 0);
    g.beginPath(); g.rect(0, 0, w, h); g.clip();
    scene(g, w, h);
    g.restore();
  }
}

// 줌 통과 — 다음 장면 위에 「구멍 뚫린 이전 장면」 을 키운다
const s = Math.pow(16, Math.pow(zoom, 2.2));    // 처음엔 천천히, 끝에 빠르게
sceneNext(g, w, h);
g.save();
g.translate(w / 2, h / 2); g.scale(s, s); g.translate(-w / 2, -h / 2);
const hole = new Path2D();
hole.rect(-w, -h, w * 3, h * 3);               // 큰 바깥
hole.ellipse(w / 2, h / 2, 17 * u, 29 * u, 0, 0, Math.PI * 2); // 숫자 0 의 구멍
g.clip(hole, 'evenodd');                       // 구멍만 빼고 그린다
scenePrev(g, w, h);
g.restore();

// 매치 컷 — 같은 자리 · 크기의 해로 바꾼 뒤 번쩍
const flash = Math.exp(-(p - 6.2) * 7);
g.fillStyle = 'rgba(255,255,255,' + flash * 0.8 + ')';
g.beginPath(); g.arc(w / 2, h / 2, 30 * u * (1 + (1 - flash) * 0.5), 0, Math.PI * 2); g.fill();`,
    },
    pitfalls: [
      { title: '복사본 수를 늘 많게 두면 느릴 때도 흐리다', fix: '복사본 수 · 투명도를 속도(vel)에 맞춰 — 처음 · 끝은 한 장.' },
      { title: '구멍을 clip 하려고 타원만 쓰면 반대(구멍 안)만 남는다', fix: '큰 사각형 + 타원을 한 Path2D 에 넣고 clip(path, \'evenodd\').' },
      { title: '매치 컷 두 모양의 자리가 조금만 달라도 튄다', fix: '같은 중심 · 같은 반지름 값을 공유하는 상수로 그린다.' },
    ],
    prev: ['i99'],
    next: ['i127', 'i104'],
    refs: [
      { name: 'Wikipedia — Match cut', url: 'https://en.wikipedia.org/wiki/Match_cut' },
      { name: 'MDN — Path2D', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Path2D' },
    ],
  },

  i110: {
    id: 'i110',
    summary: '색 원 여러 개를 정수 박자로 떠돌게 하고 큰 방사 그러데이션을 screen 으로 겹쳐, 이음새 없이 천천히 흐르는 오로라 배경을 만든다.',
    terms: [
      { en: 'Animated mesh / aurora gradient', ko: '색 덩어리가 흐르는 배경' },
      { en: 'Radial gradient blobs + screen blend', ko: '흐린 원을 밝게 겹쳐 섞기' },
      { en: 'Lissajous motion (integer frequencies)', ko: '정수 박자 사인 — 한 주기 뒤 제자리' },
    ],
    goal: '{target}에 천천히 흐르는 오로라 그라디언트 배경을 깔아 줘 — 색 원 6개가 정수 박자로 떠돌고, 흐린 원을 screen 으로 섞어서. 분위기는 {style}.',
    targets: ['결과 · 축하 화면 배경', '메뉴 · 시작 화면 배경', '로딩 화면'],
    styles: ['분홍 · 보라 · 하늘 · 민트 오로라', '따뜻한 노을빛', '차분한 바다빛'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '색 원 i 의 자리: x = 0.5 + 0.36·sin(2πp·a + i·1.7), y = 0.5 + 0.34·cos(2πp·b + i·2.3). a · b 는 정수(1~3).',
      '정수 박자라 p 가 0 → 1 을 돌면 모든 원이 제자리로 → 이음새 없는 반복 (견본 한 바퀴 24초).',
      '원마다 가운데 진하고 바깥 투명한 방사 그러데이션을 화면 전체에 칠하고, globalCompositeOperation = \'screen\' 으로 겹친다 — 겹칠수록 밝아지되 하얗게 타지 않는다.',
      '반지름도 천천히 숨 쉬게(0.32 + 0.07·sin) 하면 덩어리가 살아 움직인다.',
    ],
    when: ['글씨 · 별 같은 주인공 뒤의 차분한 배경', '정해진 그림 없이 화면을 화사하게 채울 때'],
    avoid: ['게임 판 바로 뒤 — 판보다 눈에 띄면 안 된다. 대신 단색 + 은은한 무늬', '배터리를 아껴야 하는 오래 켜 두는 화면 — 아주 느리게 하거나 멈춘 그림으로'],
    cost: 'light',
    costNote: '화면 전체 그러데이션 6장. 큰 화면에선 픽셀 채우기가 늘어나니 낮은 해상도 캔버스에 그려 늘려도 된다 (흐린 그림이라 티가 안 난다).',
    level: 1,
    must: [
      '움직임은 정수 박자 사인 · 코사인만 — 한 바퀴 뒤 정확히 제자리',
      '한 바퀴는 길게 (견본 24초) — 배경은 느려야 한다',
      '섞기는 screen (또는 lighter 를 약하게) — 그냥 덮어 그리면 색이 탁해진다',
      '글씨가 잘 읽히게 배경 바탕색은 짙게 (#1a1440)',
      '「흐르는 빠르기」 · 「부드러움」 조절',
    ],
    done: [
      '왼쪽에 색 원 6개의 속 구조, 오른쪽에 그것을 흐리게 섞은 오로라가 나란히 보인다',
      '색 덩어리가 천천히 흘러 섞이고, 오래 봐도 끊기거나 튀는 순간이 없다',
      '「부드러움」 을 올리면 경계가 더 번지고, 0 이면 동그라미가 드러난다',
    ],
    code: {
      lang: 'ts',
      title: '정수 박자로 떠도는 색 원 + screen 섞기',
      from: 'demos/demosMotionB.ts i110 을 정리',
      body: `const TAU = Math.PI * 2;
const COL = ['#ff6fb5', '#8b5cff', '#3fd0ff', '#44f0a8', '#ffd166', '#ff8a5b'];
const FR = [[1, 2], [2, 1], [1, 1], [3, 2], [2, 3], [1, 3]]; // 정수 박자 = 이음새 없음
let ph = 0;
function draw(g: CanvasRenderingContext2D, w: number, h: number, dt: number) {
  ph += (dt * speed) / 24;              // 한 바퀴 24초
  const p = ph - Math.floor(ph);
  g.fillStyle = '#1a1440';
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'screen'; // 겹칠수록 밝게, 하얗게 타지 않게
  COL.forEach((c, i) => {
    const [a, b] = FR[i];
    const x = w * (0.5 + 0.36 * Math.sin(TAU * p * a + i * 1.7));
    const y = h * (0.5 + 0.34 * Math.cos(TAU * p * b + i * 2.3));
    const r = Math.max(w, h) * (0.32 + 0.07 * Math.sin(TAU * p * 2 + i));
    const R = r * (0.55 + 0.6 * soft);
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, c + 'ee');
    gr.addColorStop(0.45 / (0.4 + soft * 0.6), c + '77');
    gr.addColorStop(1, c + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  g.globalCompositeOperation = 'source-over';
}`,
    },
    pitfalls: [
      { title: '박자를 0.7 처럼 정수가 아니게 주면 한 바퀴마다 툭 튄다', fix: '시간 p(0~1)에 곱하는 수는 모두 정수로 (이음새 없는 반복 고리 참고).' },
      { title: 'source-over 로 겹치면 색이 탁하고 뿌옇다', fix: 'screen 으로 섞는다. lighter 는 금방 하얗게 타므로 쓰려면 투명도를 낮춘다.' },
      { title: '빠르게 흐르면 어지럽고 글씨가 안 읽힌다', fix: '배경은 한 바퀴 20초 이상으로 느리게.' },
    ],
    prev: ['u52'],
    next: ['i120', 'i122'],
    refs: [{ name: 'MDN — globalCompositeOperation', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' }],
  },

  i111: {
    id: 'i111',
    summary: '밝은 빛에서 화면 가운데를 지나는 줄 위에 둥근 · 육각 고스트를 늘어놓고 가로 빛줄 · 가장자리 주황빛을 더해, 카메라 렌즈 플레어처럼 빛나게 한다.',
    terms: [
      { en: 'Lens flare (ghosts along the flare axis)', ko: '렌즈 플레어 — 빛과 화면 가운데를 잇는 줄 위의 고스트' },
      { en: 'Anamorphic streak', ko: '가로로 길게 늘어진 빛줄' },
      { en: 'Light leak', ko: '화면 가장자리로 새어 드는 주황빛' },
      { en: 'Additive blending (lighter)', ko: '빛 더하기 섞기' },
    ],
    goal: '{target}에 렌즈 플레어를 넣어 줘 — 빛에서 화면 가운데를 지나는 줄 위에 고스트, 가로 빛줄, 십자 빛살, 가장자리 빛 새기를 더하기 섞기로. 분위기는 {style}.',
    targets: ['별 획득 · 보상 순간', '홈런 공 · 해 · 조명', '제목 화면의 반짝이는 로고'],
    styles: ['밤하늘 · 푸른 빛줄', '여름 햇살 · 주황빛', '공상 과학 영화'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 는 examples/jsm/objects/Lensflare.js(Lensflare · LensflareElement)로 광원에 고스트를 붙인다.',
      unity: 'Unity URP 는 Lens Flare (SRP) 컴포넌트와 Lens Flare Data 에셋으로 고스트 · 빛줄을 만든다.',
    },
    principle: [
      '진짜 렌즈에선 밝은 빛이 렌즈 사이를 오가며 반사돼, 빛 → 화면 가운데 → 반대편 을 잇는 직선 위에 둥근 「고스트」 가 생긴다.',
      '고스트 자리 = L + (C − L) × s. s 가 0.35 · 0.7 · 1.15 · 1.45 · 1.8 · 2.15 처럼 1 을 넘으면 가운데를 지나 반대편에 놓인다.',
      '고스트는 가장자리가 진한 고리 모양 그러데이션, 큰 것(반지름 20 넘음)은 조리개 모양 육각형.',
      '모두 lighter(더하기)로 그려 겹칠수록 밝다. 빛이 화면 가장자리에 가까우면 그쪽에서 주황빛이 새어 든다.',
    ],
    when: ['보상 · 별 획득처럼 「빛났다」 를 크게 보여 줄 때', '해 · 조명이 화면 안에 보이는 장면'],
    avoid: ['늘 켜 두는 배경 빛 — 금방 지겹고 화면을 가린다. 순간에만', '어두운 판 위의 글씨 근처 — 고스트가 글씨를 덮는다'],
    cost: 'light',
    costNote: '그러데이션 10여 장을 더하기로 그린다. 켜 있는 동안만.',
    level: 2,
    must: [
      '고스트는 반드시 「빛 → 화면 가운데」 직선 위에 — 빛이 움직이면 고스트가 반대쪽으로 움직여야 진짜 같다',
      '모든 플레어 요소는 lighter(더하기) 섞기',
      '세기 조절 하나로 모든 요소의 투명도를 함께 (견본 0 ~ 2)',
      '빛 새기는 빛이 가까운 가장자리에서만, 거리에 따라 옅게',
      '「켬 / 끔」 비교 (견본은 8초 주기 중 62% 켬)',
    ],
    done: [
      '별이 화면을 돌면 고스트들이 늘 화면 가운데를 지나 반대쪽에 줄지어 따라 움직인다',
      '별을 가로지르는 푸른 가로 빛줄과 도는 십자 빛살이 보인다',
      '별이 화면 왼쪽 · 오른쪽 끝에 가까워지면 그쪽 가장자리가 주황빛으로 물든다',
      '「플레어 세기」 를 0 으로 내리면 별만 남는다',
    ],
    code: {
      lang: 'ts',
      title: '빛 → 가운데 줄 위 고스트 · 가로 빛줄 · 빛 새기',
      from: 'demos/demosMotionB.ts i111 을 정리',
      body: `const C = { x: w / 2, y: h / 2 };                 // 화면 가운데
g.save();
g.globalCompositeOperation = 'lighter';
// 가로 빛줄 (아나모픽)
let gr = g.createLinearGradient(L.x - w * 0.6, 0, L.x + w * 0.6, 0);
gr.addColorStop(0, 'rgba(120,180,255,0)');
gr.addColorStop(0.5, 'rgba(170,220,255,' + 0.75 * k + ')');
gr.addColorStop(1, 'rgba(120,180,255,0)');
g.fillStyle = gr;
g.fillRect(L.x - w * 0.6, L.y - 1.2 * u, w * 1.2, 2.4 * u);
// 고스트: [L→C 비율 s, 반지름, 색, 투명도] — s > 1 은 가운데 너머 반대편
const GH: [number, number, string, number][] = [
  [0.35, 7, '120,255,200', 0.35], [0.7, 14, '255,140,220', 0.22], [1.15, 5, '160,200,255', 0.5],
  [1.45, 24, '120,160,255', 0.14], [1.8, 10, '255,220,120', 0.3], [2.15, 34, '255,120,160', 0.1],
];
for (const [s, r, c, al] of GH) {
  const x = L.x + (C.x - L.x) * s, y = L.y + (C.y - L.y) * s, rad = r * u;
  gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
  gr.addColorStop(0, 'rgba(' + c + ',' + al * 0.4 * k + ')');
  gr.addColorStop(0.85, 'rgba(' + c + ',' + al * k + ')');  // 가장자리가 진한 고리
  gr.addColorStop(1, 'rgba(' + c + ',0)');
  g.fillStyle = gr;
  g.beginPath();
  if (r > 20) for (let i = 0; i < 6; i++) { const a = (i * Math.PI * 2) / 6 + 0.3; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } // 조리개 육각형
  else g.arc(x, y, rad, 0, Math.PI * 2);
  g.fill();
}
// 빛 새기: 빛이 가까운 가장자리에서 주황빛
const edge = L.x < w / 2 ? 0 : w;
const leak = (1 - Math.min(1, Math.abs(L.x - edge) / (w * 0.5))) * k;
gr = g.createLinearGradient(edge, 0, w / 2, 0);
gr.addColorStop(0, 'rgba(255,130,40,' + 0.55 * leak + ')');
gr.addColorStop(1, 'rgba(255,80,60,0)');
g.fillStyle = gr; g.fillRect(0, 0, w, h);
g.restore();`,
    },
    pitfalls: [
      { title: '고스트를 빛 둘레에 아무렇게나 흩으면 가짜 같다', fix: '반드시 빛 → 화면 가운데 직선 위, 가운데 너머까지 (s 1 넘김).' },
      { title: 'source-over 로 그리면 고스트가 탁한 동그라미가 된다', fix: '모두 lighter 로 더해 겹칠수록 밝게.' },
      { title: '플레어를 늘 켜 두면 화면이 뿌옇다', fix: '보상 순간에만 켜고, 세기 조절 하나로 전체를 함께 줄인다.' },
    ],
    prev: ['u20'],
    next: ['i112', 'i200'],
    refs: [
      { name: 'three.js 예제 — webgl_lensflares', url: 'https://threejs.org/examples/#webgl_lensflares' },
      { name: 'Wikipedia — Lens flare', url: 'https://en.wikipedia.org/wiki/Lens_flare' },
    ],
  },

  i112: {
    id: 'i112',
    summary: '화면을 빨강 · 초록 · 파랑 세 장으로 나눠 어긋나게 더하고 가로 띠를 찢어 밀어, 글리치를 내고 주사선 · 둥근 화면으로 옛 CRT 느낌을 더한다.',
    terms: [
      { en: 'Glitch effect (RGB split + slice displacement)', ko: '색 갈라짐 + 가로 띠 찢기' },
      { en: 'Chromatic aberration', ko: '색수차 — 빨강 · 파랑이 옆으로 어긋남' },
      { en: 'CRT scanlines', ko: '옛 TV 줄무늬 · 지나가는 밝은 띠' },
    ],
    goal: '{target}에 글리치 · CRT 효과를 넣어 줘 — RGB 세 장을 어긋나게 더하고, 순간 가로 띠를 찢어 밀고, 주사선 · 둥근 화면까지. 분위기는 {style}.',
    targets: ['검문소 「모순 발견!」 순간', '레트로 게임 화면', '해킹 · 오류 연출'],
    styles: ['초록빛 옛 모니터', '빨간 경고 화면', '네온 사이버'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 는 examples/jsm/postprocessing/GlitchPass.js 가 있다 (후처리 사슬에 넣는다).',
    },
    principle: [
      '바탕 그림을 한 번 그려 두고, 그것을 빨강 · 초록 · 파랑으로 곱한(multiply) 세 장을 미리 만든다.',
      '세 장을 lighter(더하기)로 다시 겹치면 원래 그림 — 빨강은 왼쪽 · 파랑은 오른쪽으로 밀면 색이 갈라진다.',
      '터지는 순간(2.6초마다 0.42초)만 그림을 높이 4~30 의 가로 띠로 잘라, 45% 의 띠를 옆으로 민다 (drawImage 의 원본 영역을 띠로).',
      'CRT: 3px 마다 어두운 줄 · 위에서 아래로 지나가는 밝은 띠 · 둥근 네모 화면 · 유리 반사.',
    ],
    when: ['오류 · 모순 · 경고처럼 「뭔가 잘못됐다」 를 순간 보여 줄 때', '옛 게임기 · 레트로 분위기 화면'],
    avoid: ['읽어야 하는 글이 계속 흔들리는 화면 — 터지는 순간만', '빛에 민감한 아이 — 깜박임은 짧고 드물게 (초당 3번 넘게 번쩍이지 않기)'],
    cost: 'medium',
    costNote: '세 장을 미리 만드는 데 화면 크기 캔버스 4장. 크기가 바뀔 때만 다시 만든다. 매 프레임은 drawImage 를 띠 수 × 3 번.',
    level: 2,
    must: [
      'RGB 세 장은 크기(w · h · 픽셀 비율)가 바뀔 때만 다시 만든다 — 매 프레임 만들지 않기',
      '찢기 · 큰 갈라짐은 터지는 순간만 (견본 2.6초에 0.42초), 평소엔 아주 작게 (1px)',
      '무작위는 프레임 번호 씨앗(초당 20번)으로 — 띠가 매 프레임 미친 듯 바뀌지 않게',
      'CRT 가장자리 어둡게는 「둥근 옛 화면」 모양일 때만 — 게임 화면 전체 비네트로 쓰지 않는다',
      '「글리치 세기」 · 「CRT 켬/끔」 조절',
    ],
    done: [
      '평소엔 「모순 발견!」 화면에 줄무늬와 지나가는 밝은 띠만 은은하게 보인다',
      '터지는 순간 가로 띠가 옆으로 찢어지고 빨강 · 파랑이 갈라진다',
      'CRT 를 끄면 둥근 화면 · 줄무늬가 사라지고 글리치만 남는다',
    ],
    code: {
      lang: 'ts',
      title: 'RGB 세 장 미리 만들기 · 어긋나게 더하기 · 띠 찢기',
      from: 'demos/demosMotionB.ts i112 를 정리',
      body: `// 크기가 바뀔 때만: 바탕 그림 → 빨강 · 초록 · 파랑 세 장
const chan = ['#ff0000', '#00ff00', '#0000ff'].map((col) => {
  const cv = document.createElement('canvas');
  cv.width = base.width; cv.height = base.height;
  const cc = cv.getContext('2d')!;
  cc.drawImage(base, 0, 0);
  cc.globalCompositeOperation = 'multiply'; // 그 색만 남긴다
  cc.fillStyle = col; cc.fillRect(0, 0, cv.width, cv.height);
  return cv;
});

// 매 프레임 (d = 픽셀 비율)
const ph = (t % 2.6);
const burst = ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI) * power : 0;
const R = rng(Math.floor(t * 20) + 1);          // 초당 20번 바뀌는 무작위
const offs = [[-(1 + burst * 7) * u, 0], [0, 0], [(1 + burst * 7) * u, burst * 2 * u]];
const bands: [number, number, number][] = [];
if (burst > 0.05) {
  for (let y = 0; y < h; ) { const bh = (4 + R() * 26) * u; bands.push([y, bh, R() < 0.45 ? (R() - 0.5) * 40 * u * burst : 0]); y += bh; }
} else bands.push([0, h, 0]);
g.globalCompositeOperation = 'lighter';         // 세 장을 더하면 원래 색
chan.forEach((cv, ci) => {
  const [ox, oy] = offs[ci];
  for (const [y, bh, sx] of bands)
    g.drawImage(cv, 0, y * d, cv.width, bh * d, ox + sx * (ci === 1 ? 0.6 : 1), y + oy, w, bh);
});
g.globalCompositeOperation = 'source-over';
// 주사선: 3px 마다 어두운 줄이 천천히 흐른다
g.fillStyle = 'rgba(0,0,0,.28)';
for (let y = (t * 18 * u) % (3 * u); y < h; y += 3 * u) g.fillRect(0, y, w, 1.2 * u);`,
    },
    pitfalls: [
      { title: 'RGB 세 장을 매 프레임 만들면 폰에서 버벅인다', fix: '크기 · 픽셀 비율 열쇠가 바뀔 때만 만든다 (견본 key = w x h x d).' },
      { title: '띠를 매 프레임 새로 무작위로 자르면 너무 어지럽다', fix: '프레임 번호(초당 20번) 씨앗 무작위로 몇 프레임씩 유지한다.' },
      { title: 'CRT 가장자리 어둡게를 게임 화면 전체에 쓰면 흐릿해 보인다', fix: '사이트 결정으로 가장자리 흐림 · 비네트는 금지. 옛 TV 화면 모양을 일부러 보여 줄 때만.', seen: true },
    ],
    prev: ['i93', 'i07'],
    next: ['i200', 'i203'],
    refs: [{ name: 'three.js 예제 — webgl_postprocessing_glitch', url: 'https://threejs.org/examples/#webgl_postprocessing_glitch' }],
  },

  i114: {
    id: 'i114',
    summary: '같은 모양을 면(아래 남김)과 선 뼈대(위 남김)로 두 번 그리고 자르는 평면 하나를 올려, 빛 띠가 쓸며 설계도가 입체로 차오르게 한다.',
    terms: [
      { en: 'Wireframe-to-solid reveal (clipping-plane sweep)', ko: '자르는 평면을 쓸어 선 → 면으로' },
      { en: 'Material.clippingPlanes + localClippingEnabled', ko: 'three.js 재질별 자르기 평면' },
      { en: 'WireframeGeometry + LineSegments', ko: '모양의 모든 모서리를 선으로' },
    ],
    goal: '{target}을(를) 와이어프레임에서 완성으로 바뀌게 해 줘 — 자르기 평면이 아래에서 위로 쓸며 선 뼈대가 색 있는 입체로 차오르고, 쓸리는 곳에 빛 띠. 분위기는 {style}.',
    targets: ['정육면체 · 원기둥 · 원뿔 (입체도형)', '설계도 → 완성 건물 · 기계', '새 캐릭터 · 물건 등장'],
    styles: ['푸른 설계도 홀로그램', '밝은 장난감 공방', '공상 과학 스캔'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 에서 월드 y 와 경계 값을 비교해 Alpha Clip 으로 자르고, 와이어 쪽은 반대로 자른 재질을 겹친다.',
      godot: 'Godot 은 spatial 셰이더에서 월드 y 로 discard 해 같은 일을 한다 (와이어 쪽은 반대 조건).',
    },
    principle: [
      '같은 모양을 두 번 그린다: 색 있는 면(MeshStandardMaterial)과 모서리 선(WireframeGeometry + LineSegments).',
      '면에는 자르기 평면 cut = Plane((0, −1, 0), y) — 높이 y 아래만 남는다. 선에는 cutW = Plane((0, 1, 0), −y) — y 위만 남는다.',
      'y 를 −0.72 → 0.75 로 올리면 아래부터 면이 차오르고 남은 위쪽은 선으로 보인다. 경계에 더하기 섞기 빛 띠(원판 + 테 고리).',
      '자르기는 renderer.localClippingEnabled = true 일 때만 동작한다. 면은 DoubleSide 로 해서 잘린 속이 비어 보이지 않게.',
    ],
    when: ['입체도형 · 설계가 「만들어진다」 를 보여 줄 때', '새 물건 · 캐릭터가 처음 등장하는 연출'],
    avoid: ['두께가 없는 판 — 차오르는 느낌이 없다. 대신 디졸브(잡음으로 사라지기)', '삼각형 수십만 개 모델 — 와이어 선이 너무 촘촘하다. 대신 EdgesGeometry(각진 모서리만)'],
    cost: 'light',
    costNote: '모양을 두 번 그린다 (면 + 선). 자르기 평면은 셰이더에 조건 하나만 늘린다.',
    level: 2,
    must: [
      'renderer.localClippingEnabled = true (견본은 그릴 때만 켜고 되돌린다)',
      '면 · 선 자르기 평면은 서로 반대 방향, 같은 높이를 공유',
      '면 재질은 DoubleSide — 잘린 단면 안쪽이 보이게',
      '경계 빛 띠는 차오르는 동안에만 보이게 (끝에 닿으면 끔)',
      '0.8초 선만 → 2.6초 차오름 → 1.4초 완성 → 1.6초 내려감 순서로 반복',
    ],
    done: [
      '처음엔 하늘색 선 뼈대만 보이다가, 빛 띠가 아래에서 위로 쓸며 지나간 자리가 색 있는 입체가 된다',
      '쓸리는 높이에서 면과 선이 딱 이어진다 (틈 · 겹침 없음)',
      '다 차오른 뒤에도 아주 옅은 흰 선이 남아 설계도 흔적이 보인다',
      '「빠르기」 조절로 쓸리는 속도가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '면 · 선 반대 자르기 평면 + 높이 쓸기',
      from: 'demos/demosMotionB.ts i114 를 정리',
      body: `const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0); // 면: 높이 y 아래만
const cutW = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);  // 선: 높이 y 위만

const geo = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
  color: 0xff7ab6, roughness: 0.45, clippingPlanes: [cut], side: THREE.DoubleSide,
}));
const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({
  color: 0x7cf0ff, transparent: true, opacity: 0.85, clippingPlanes: [cutW],
}));
item.add(solid, wire);

// 쓸고 가는 빛 띠
const scanMat = new THREE.MeshBasicMaterial({ color: 0x7cf0ff, transparent: true, opacity: 0.18,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const scan = new THREE.Mesh(new THREE.RingGeometry(0, 2.75, 48), scanMat);
scan.rotation.x = -Math.PI / 2;

// 매 프레임: 0~0.8 선만 · 0.8~3.4 차오름 · 3.4~4.8 완성 · 4.8~6.4 내려감
const p = (tt % 7), lo = -0.72, hi = 0.75;
const y = p < 0.8 ? lo : p < 3.4 ? lerp(lo, hi, easeIO((p - 0.8) / 2.6)) : p < 4.8 ? hi
  : p < 6.4 ? lerp(hi, lo, easeIO((p - 4.8) / 1.6)) : lo;
cut.constant = y;    // −y·1 + y ≥ 0 → 점의 y ≤ 경계
cutW.constant = -y;  // 점의 y ≥ 경계
scan.position.y = y;
scanMat.opacity = y > lo + 0.01 && y < hi - 0.01 ? 0.2 : 0;

// 그리기
renderer.localClippingEnabled = true; // 이게 없으면 자르기가 안 된다
renderer.render(scene, camera);`,
    },
    pitfalls: [
      { title: 'localClippingEnabled 를 안 켜면 아무것도 잘리지 않는다', fix: '재질의 clippingPlanes 는 renderer.localClippingEnabled = true 일 때만 동작한다.' },
      { title: '평면 방향을 같게 주면 면과 선이 같은 쪽에 남는다', fix: '면은 법선 (0, −1, 0) · 상수 y, 선은 (0, 1, 0) · 상수 −y 로 반대.' },
      { title: '면 재질이 FrontSide 면 잘린 곳 안쪽이 텅 비어 보인다', fix: 'side: DoubleSide 로 안쪽 면도 그린다.' },
    ],
    prev: ['u31', 'i35'],
    next: ['i36', 'i17'],
    refs: [
      { name: 'three.js 예제 — webgl_clipping', url: 'https://threejs.org/examples/#webgl_clipping' },
      { name: 'three.js 소스 — WireframeGeometry', url: 'https://github.com/mrdoob/three.js/blob/dev/src/geometries/WireframeGeometry.js' },
    ],
  },
  i116: {
    id: 'i116',
    summary: '막대 너비는 CSS 트랜지션으로 자라게 하고, 순위가 바뀌면 FLIP(처음 자리 → 새 자리 차이만큼 되돌렸다 풀기)으로 줄이 미끄러지게 해 막대 경주 차트를 만든다.',
    terms: [
      { en: 'Bar chart race', ko: '시간에 따라 순위가 바뀌는 막대 경주' },
      { en: 'FLIP animation (First, Last, Invert, Play)', ko: '처음 · 끝 자리를 재고 차이만큼 되돌렸다가 풀기' },
      { en: 'Growing line chart (SVG polyline)', ko: '한 칸씩 그려지는 선 그래프' },
    ],
    goal: '{target}을(를) 데이터 애니메이션으로 보여 줘 — 주마다 막대가 자라고 순위가 바뀌면 줄이 FLIP 으로 미끄러지게, 옆에는 선 그래프가 한 주씩 그려지게. 분위기는 {style}.',
    targets: ['좋아하는 과일 투표 (주별)', '통계 단원 · 반별 점수 변화', '검문소 그래프 조작 고발 (바뀌는 막대)'],
    styles: ['짙은 남색 방송 그래픽', '밝은 교과서 도표', '알록달록 게임 순위표'],
    platforms: ['web', 'canvas', 'unity', 'godot'],
    principle: [
      'First: 순서를 바꾸기 전에 줄마다 offsetTop 을 잰다.',
      'Last: 값 순서대로 appendChild 로 줄을 다시 놓는다 (DOM 순서가 곧 순위). 새 offsetTop 을 잰다.',
      'Invert: 차이 dy 만큼 transform: translateY(dy) 로 옛 자리에 보이게 (트랜지션 끔) → offsetWidth 로 한 번 그리게 한다.',
      'Play: 트랜지션을 켜고 transform 을 비우면 줄이 새 자리로 미끄러진다 (.65초). 막대 너비 · 숫자도 따로 부드럽게 따라간다.',
    ],
    when: ['값의 순위가 시간에 따라 바뀌는 것을 보여 줄 때', '목록 정렬 · 순위표가 바뀌는 순간을 자연스럽게'],
    avoid: ['줄이 수백 개 — 레이아웃 재기가 무겁다. 대신 캔버스에 직접 그리기', '순위가 안 바뀌는 단순 막대 — 너비 트랜지션만'],
    cost: 'light',
    costNote: '순위가 바뀌는 순간에만 offsetTop 을 두 번 재고(레이아웃 한 번) 트랜지션은 브라우저 합성이 맡는다. 줄 5개 기준 아주 가볍다.',
    level: 2,
    must: [
      '순위 바꾸기는 데이터가 바뀌는 순간에만 (매 프레임 재지 않기)',
      '처음 자리를 먼저 재고 → DOM 순서 바꾸고 → 새 자리를 재는 순서를 지킨다',
      'Invert 뒤 offsetWidth 를 읽어 한 번 그리게 해야 트랜지션이 걸린다',
      '움직임은 transform 만 (top · margin 을 트윈하지 않기)',
      '숫자는 목표값을 지수로 따라가게 (shown += (target − shown) × min(1, dt × 5))',
    ],
    done: [
      '1주 → 12주로 넘어갈 때마다 막대가 자라거나 줄고, 순위가 바뀐 줄은 위아래로 미끄러지며 자리를 바꾼다',
      '줄이 순간이동하지 않는다 — 언제 멈춰 봐도 중간 자리에 있다',
      '오른쪽 선 그래프가 한 주씩 이어 그려지고, 끝점 동그라미가 선을 따라 간다',
    ],
    code: {
      lang: 'ts',
      title: 'FLIP 으로 순위 줄 미끄러지기 + 막대 너비',
      from: 'demos/demosMotionB.ts i116 의 apply() 를 정리',
      body: `/** 주 k 의 값으로 순위를 다시 놓는다 (데이터가 바뀔 때만) */
function apply(k: number): void {
  const vals = FRU.map((_, i) => val(i, k));
  const first = rows.map((r) => r.el.offsetTop);                 // First
  const order = vals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  order.forEach(([, i], rank) => {
    rowsBox.appendChild(rows[i].el);                              // Last: DOM 순서 = 순위
    rows[i].rk.textContent = String(rank + 1);
  });
  rows.forEach((r, i) => {
    r.target = vals[i];
    r.bar.style.width = (vals[i] / 42) * 100 + '%';               // 너비는 CSS 트랜지션(.85s)
    const dy = first[i] - r.el.offsetTop;
    if (dy) {
      r.el.style.transition = 'none';
      r.el.style.transform = 'translateY(' + dy + 'px)';          // Invert: 옛 자리에 보이게
      void r.el.offsetWidth;                                      // 한 번 그리게 한다
      r.el.style.transition = 'transform .65s cubic-bezier(.2,.8,.2,1)';
      r.el.style.transform = '';                                  // Play: 새 자리로 미끄러짐
    }
  });
}

// 매 프레임: 주가 바뀔 때만 apply, 숫자는 부드럽게 따라가기
const k = Math.floor(t / 1.1) % 12;
if (k !== lastK) { lastK = k; apply(k); }
for (const r of rows) {
  r.shown += (r.target - r.shown) * Math.min(1, dt * 5);
  r.num.textContent = Math.round(r.shown) + '표';
}`,
    },
    pitfalls: [
      { title: 'offsetWidth 를 읽지 않으면 트랜지션 없이 순간이동한다', fix: 'Invert 와 Play 사이에 강제 레이아웃(void el.offsetWidth)이 있어야 브라우저가 옛 자리를 한 번 그린다.' },
      { title: 'DOM 순서를 바꾼 뒤에 처음 자리를 재면 차이가 0 이다', fix: '반드시 바꾸기 전에 모든 줄의 offsetTop 을 먼저 잰다.' },
      { title: 'top · margin 을 트윈하면 레이아웃을 매 프레임 다시 계산한다', fix: 'transform 만 움직인다 — 합성 단계에서 끝나 가볍다.' },
      { title: '바뀌는 부분만 갈아 끼워야 하는데 목록을 통째로 다시 만들면 깜박인다', fix: '줄 요소는 한 번 만들어 두고 순서 · 값만 바꾼다 (사용자 지적: 새로고침 느낌 금지).', seen: true },
    ],
    prev: ['u38'],
    next: ['i39', 'i127'],
    refs: [{ name: 'Paul Lewis — FLIP Your Animations', url: 'https://aerotwist.com/blog/flip-your-animations/' }],
  },

  i117: {
    id: 'i117',
    summary: '식의 기호마다 고유 id 를 주고 단계마다 자리를 재어, 같은 기호는 새 자리로 날아가고 사라질 기호는 녹고 합쳐질 기호는 한 점으로 모이게 한다 (Manim 의 TransformMatchingTex 방식).',
    terms: [
      { en: 'Equation transform (Manim TransformMatchingTex style)', ko: '같은 기호끼리 짝지어 옮기는 수식 변환' },
      { en: 'Token matching by id', ko: '기호에 고유 이름을 붙여 단계 사이 짝짓기' },
      { en: 'Measured layout + position tween', ko: '숨은 줄에 놓아 자리를 재고 그 사이를 트윈' },
    ],
    goal: '{target}을(를) Manim 식 수식 변환으로 보여 줘 — 같은 기호는 남아서 새 자리로 날아가고, 나머지는 녹아 사라지거나 하나로 합쳐지게. 분위기는 {style}.',
    targets: ['일차방정식 풀이 2x + 3 = 11 → x = 4', '이항 · 약분 · 통분 과정', '식 정리 · 인수분해 단계'],
    styles: ['짙은 남색 칠판 + 빛나는 기호', '밝은 공책', '영상 강의 (3Blue1Brown 풍)'],
    platforms: ['web', 'canvas'],
    principle: [
      '기호마다 고유 id (c2 · x · plus · t3 · eq · n11 …). 단계는 id 목록 + 설명 + 합쳐짐(into: {n11: n8, minus: n8, t3: n8}).',
      '각 단계를 숨은 flex 줄에 실제로 놓아 기호 가운데 x 를 잰다 (글꼴이 바뀌면 다시 잼).',
      '두 단계에 다 있는 기호: x 를 lerp. 멀리 가면(글자 0.9개 넘게) 위로 둥글게 뛰어 넘는다 (−sin πk).',
      '앞 단계에만 있는 기호: 합쳐질 곳이 있으면 그 자리로 날아가며 작아지고 사라짐, 없으면 아래로 녹아 사라짐.',
      '뒤 단계에만 있는 기호: 합쳐진 결과는 마지막에 톡(easeOutBack), 나머지는 위에서 내려오며 나타남.',
    ],
    when: ['식이 한 단계씩 바뀌는 풀이 과정을 보여 줄 때 — 「무엇이 어디로 갔나」 가 핵심', '이항 · 약분처럼 기호가 이동하는 규칙을 설명할 때'],
    avoid: ['분수 · 지수가 겹친 복잡한 식 — 한 줄 배치로는 어렵다. 대신 KaTeX 로 그린 뒤 요소마다 짝짓기', '단계가 아주 많을 때 — 핵심 단계만 고른다'],
    cost: 'light',
    costNote: '기호 10여 개의 transform · opacity 만 바꾼다. 자리 재기는 크기 · 글꼴이 바뀔 때만.',
    level: 3,
    must: [
      '기호에 고유 id — 같은 「3」 이라도 역할이 다르면 다른 id (t3 · n3)',
      '자리는 숨은 줄에 실제로 놓아 잰다 (글자 폭을 짐작하지 않기). 상자 크기 · 글꼴 로딩이 바뀌면 다시 잰다',
      '멀리 가는 기호는 위로 둥글게 — 다른 기호를 뚫고 지나가지 않게',
      '머무름(1.5초) · 바뀜(1.15초) 번갈아, 바뀌는 중인 기호는 금빛으로 강조',
      '단계 설명(「+3 이 = 을 넘어가면 −3」)을 함께 바꿔 보여 주기',
    ],
    done: [
      '「+3」 이 = 를 뛰어넘어 오른쪽으로 가며 「−3」 이 된다',
      '「11 − 3」 이 한 점으로 모이며 「8」 이 톡 나타난다',
      '마지막에 x = 4 만 남고, 다시 처음 식으로 이음새 없이 돌아간다',
      '움직이는 기호만 금빛으로 빛나 어디로 가는지 눈으로 따라갈 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '기호 짝짓기 — 남음 · 합쳐짐 · 사라짐 · 나타남',
      from: 'demos/demosMotionB.ts i117 의 update 를 정리',
      body: `// A, B = 지금 · 다음 단계의 { id: 가운데 x }, k = 0~1 (easeIO), fs = 글자 크기
const into = ST[j].into ?? {};                 // 예: { n11: 'n8', minus: 'n8', t3: 'n8' }
const targets = new Set(Object.values(into));
for (const id of Object.keys(TK)) {
  const a = A[id], b = B[id];
  let x = 0, y = 0, o = 0, s = 1;
  if (a !== undefined && b !== undefined) {           // 둘 다 있음: 날아감
    x = lerp(a, b, k);
    y = Math.abs(b - a) > fs * 0.9 ? -Math.sin(k * Math.PI) * fs * 0.75 : 0; // 멀면 위로 둥글게
    o = 1;
  } else if (a !== undefined) {                        // 앞에만: 합쳐지거나 녹음
    const tg = into[id];
    if (tg && B[tg] !== undefined) {
      x = lerp(a, B[tg], easeIO(k * 1.15));
      y = -Math.sin(Math.min(1, k * 1.15) * Math.PI) * fs * 0.35;
      o = 1 - ease((k - 0.55) / 0.4); s = 1 - 0.25 * k;
    } else { x = a; y = k * fs * 0.4; o = 1 - ease(k / 0.7); s = 1 - 0.3 * k; }
  } else if (b !== undefined) {                        // 뒤에만: 나타남
    x = b;
    if (targets.has(id)) { o = ease((k - 0.6) / 0.35); s = 0.5 + 0.5 * easeOutBack((k - 0.6) / 0.4); } // 합친 결과는 톡
    else { o = ease((k - 0.3) / 0.7); y = -(1 - k) * fs * 0.4; }
  }
  const e = el[id];
  e.style.opacity = o.toFixed(3);
  e.style.transform = 'translate(calc(-50% + ' + x.toFixed(1) + 'px), calc(-50% + ' + y.toFixed(1) + 'px)) scale(' + s.toFixed(3) + ')';
}`,
    },
    pitfalls: [
      { title: '글자 폭을 짐작해 자리를 정하면 글꼴에 따라 겹친다', fix: '숨은 flex 줄에 실제로 놓고 offsetLeft 로 잰다. 글꼴이 늦게 로딩되면 document.fonts.check 로 알아채 다시 잰다.' },
      { title: '같은 숫자를 같은 id 로 두면 엉뚱한 기호가 날아간다', fix: '역할마다 다른 id (상수 3 = t3, 결과 4 = n4).' },
      { title: '모든 기호를 직선으로 옮기면 서로 뚫고 지나간다', fix: '멀리 가는 기호만 위로 둥글게 뛰어넘게 한다.' },
      { title: '2x 처럼 붙여 쓰는 곳이 띄어쓰기 간격으로 벌어진다', fix: '견본은 c2 다음 x 에 음수 여백(.tight)을 주고 잰다.' },
    ],
    prev: ['i96'],
    next: ['i127'],
    refs: [{ name: 'Manim Community — 공식 문서', url: 'https://docs.manim.community/' }],
  },

  i120: {
    id: 'i120',
    summary: '모든 움직임을 시간 p(0~1)의 정수 박자 주기 함수로만 만들어, 마지막 프레임이 첫 프레임과 꼭 같아 끝없이 이어지는 반복 고리를 만든다.',
    terms: [
      { en: 'Seamless loop (perfect loop)', ko: '이음새 없는 반복 애니메이션' },
      { en: 'Periodic functions with integer frequency', ko: '정수 박자 사인 — p = 0 과 1 에서 같은 값' },
      { en: 'Rotational symmetry', ko: '회전 대칭 — 세모는 120° 만 돌아도 처음과 같다' },
    ],
    goal: '{target}을(를) 이음새 없는 반복 고리로 만들어 줘 — 모든 움직임을 시간 p 의 정수 박자 주기 함수로, 끝 = 처음. 분위기는 {style}.',
    targets: ['로딩 표시 캐릭터', '썸네일 · 홈 배너의 짧은 움직임', '배경에서 계속 도는 장식'],
    styles: ['말랑한 귀여운 캐릭터', '깔끔한 기하 무늬', '네온 루프'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '한 바퀴 시간 P 를 정하고 p = (시간 / P) 의 소수 부분 (0 → 1). 모든 값은 p 의 함수로만 만든다.',
      '사인에 2πp × 정수를 넣으면 p = 0 과 p = 1 이 같은 값 → 끝 = 처음. 견본 모양: r(θ) = R(1 + 0.13·sin(3θ + 2πp) + 0.07·sin(5θ − 4πp)).',
      '회전도 한 바퀴(2πp)거나, 회전 대칭을 이용해 줄일 수 있다: 세모는 (2π/3)·p, 점 6개 고리는 2πp.',
      '박자를 0.7 처럼 정수가 아니게 주면 p = 1 에서 다른 모습이 되어 한 바퀴마다 「툭」 튄다 (견본 오른쪽).',
    ],
    when: ['GIF · 영상 · 썸네일처럼 짧게 계속 도는 움직임', '로딩 · 대기 표시'],
    avoid: ['물리 시뮬레이션 · 무작위 입자 — 처음으로 돌아오지 않는다. 대신 처음 상태로 섞어 되돌리거나 반복 대신 계속 진행', '사용자 입력에 반응하는 움직임'],
    cost: 'light',
    costNote: '주기 함수 몇 개. 가볍다.',
    level: 2,
    must: [
      '모든 움직임은 p 의 함수로만 — 프레임마다 누적(+=)하는 상태를 두지 않기',
      'p 에 곱하는 박자는 모두 정수 (회전은 대칭 각도의 정수배)',
      '처음 모습(p = 0)을 점선으로 겹쳐 보여, 한 바퀴 끝에 정확히 겹치는지 확인',
      '왼쪽 「이어짐」 · 오른쪽 「박자 틀림 → 툭」 을 나란히 비교',
    ],
    done: [
      '왼쪽 말랑이는 한 바퀴 끝에 점선(처음 모습)과 딱 겹치고 「이어짐 ✓」 이 보인다',
      '오른쪽은 한 바퀴마다 모양 · 점 · 세모가 툭 튀며 「툭!」 이 보인다',
      '진행 막대가 끝에서 처음으로 넘어가도 왼쪽 움직임은 끊기지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '정수 박자 모양 · 회전 (좋은 고리 / 틀린 고리)',
      from: 'demos/demosMotionB.ts i120 의 loader() 를 정리',
      body: `const TAU = Math.PI * 2;
let ph = 0;
function frame(dt: number, P = 3) {
  ph += dt / P;
  const p = ph - Math.floor(ph);   // 0 → 1, 끝 = 처음
  // 반지름: θ 와 p 에 모두 정수 박자 → p = 0 과 1 에서 같은 모양
  const m = good ? 1 : 0.7;        // 0.7 = 틀린 박자 (한 바퀴마다 툭)
  const r = (th: number) => R * (1 + 0.13 * Math.sin(3 * th + TAU * p * m) + 0.07 * Math.sin(5 * th - 2 * TAU * p * m));
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const th = (i / 64) * TAU, rr = r(th);
    const x = cx + Math.cos(th) * rr, y = cy + Math.sin(th) * rr;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  // 점 6개 고리: 한 바퀴 = 2π·p. 크기 맥박도 정수 박자(×2)
  const rot = good ? TAU * p : TAU * p * 0.8;
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * TAU) / 6, s = 1 + 0.4 * Math.sin(TAU * p * 2 + i);
    g.beginPath(); g.arc(cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.55, 3.4 * s, 0, TAU); g.fill();
  }
  // 세모: 회전 대칭(120°)이라 한 바퀴에 1/3 만 돌아도 처음과 같다
  const tri = good ? (TAU / 3) * p : (TAU / 3) * p * 1.35;
}`,
    },
    pitfalls: [
      { title: '프레임마다 각도를 += 로 쌓으면 반복 끝에서 어긋난다', fix: '모든 값을 p 의 함수로 새로 계산한다 — 쌓인 상태가 없어야 끝 = 처음.' },
      { title: '박자 하나만 정수가 아니어도 전체가 툭 튄다', fix: '사인 · 회전 · 크기 맥박까지 p 에 곱하는 수를 모두 정수로 (견본 오른쪽이 0.7 · 0.8 · 1.35 로 틀린 예).' },
      { title: '이징을 p 에 바로 걸면 끝에서 속도가 0 이 되어 멈칫한다', fix: '이징은 주기 함수 안의 진폭에만 쓰고, 도는 각도는 p 에 정비례로.' },
    ],
    prev: ['i110'],
    next: ['i123', 'i122'],
  },

  i122: {
    id: 'i122',
    summary: '규칙 몇 줄로 무늬를 만든다 — 흐름장 각도를 따라 흐르는 입자 선, 가장 가까운 점의 세포(보로노이), 사분원 두 개 타일을 돌려 놓는 트루쳇 미로.',
    terms: [
      { en: 'Flow field', ko: '자리마다 정해진 방향(각도)을 따라 흐르는 선' },
      { en: 'Voronoi diagram (half-plane clipping)', ko: '가장 가까운 점끼리 나눈 세포 — 수직 이등분선으로 자르기' },
      { en: 'Truchet tiles', ko: '사분원 둘 그린 타일을 0° / 90° 로 놓아 이어지는 미로' },
      { en: 'Generative art', ko: '규칙으로 그리는 그림' },
    ],
    goal: '{target}에 생성 패턴을 그려 줘 — 흐름장(털처럼 흐르는 선) · 보로노이(세포) · 트루쳇(뒤집히는 타일 미로)를 규칙으로. 분위기는 {style}.',
    targets: ['메뉴 · 결과 화면 배경', '테셀레이션 · 타일 단원 그림', '판 테두리 장식'],
    styles: ['네온 무지개', '크림 바탕 파스텔 세포', '짙은 남색 + 밝은 선'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '흐름장: 자리 (x, y) 마다 각도 a = (sin(2.3x + sin(1.9y + 0.25t)·1.7) + sin(2.9y − 0.2t + cos(1.6x)·1.3))·0.6π. 입자는 그 방향으로 조금씩 가고, 지나간 자리를 옅은 바탕색으로 덮어(투명도 0.06) 꼬리가 남는다.',
      '보로노이: 씨앗 점마다 화면 사각형에서 시작해, 다른 씨앗과의 수직 이등분선으로 「나에게 더 가까운 쪽」 만 남기며 자른다. 남은 다각형이 그 점의 세포.',
      '트루쳇: 타일 한 장에 마주 보는 두 모서리의 사분원 둘. 0° 또는 90° 로 놓으면 선이 늘 이웃 타일로 이어진다. 가운데에서 거리만큼 늦게(4초마다) 90° 씩 뒤집힌다.',
      '세 무늬를 6초씩 차례로, 원이 커지며 다음 무늬로 바뀐다.',
    ],
    when: ['정해진 그림 없이 화면을 개성 있게 채울 때', '수학 무늬(타일 · 세포 · 벡터장) 자체를 보여 줄 때'],
    avoid: ['판 바로 뒤 배경 — 무늬가 판보다 시끄럽다. 대신 아주 옅게 · 느리게', '세포 수천 개 보로노이 — 이 방법은 n² 이다. 대신 들로네 라이브러리 · 셰이더'],
    cost: 'medium',
    costNote: '흐름장 입자는 화면 크기에 따라 최대 700 (220u² + 60). 보로노이는 씨앗 15개 × 14번 자르기. 트루쳇은 칸 수만큼 호 2개.',
    level: 2,
    must: [
      '흐름장 꼬리는 따로 둔 캔버스에 쌓고, 매 프레임 바탕색을 아주 옅게(0.06) 덮어 서서히 지운다',
      '입자는 수명 · 화면 밖이면 새 자리로 — 한곳에 몰리지 않게',
      '입자 수는 화면 크기에 맞춰 (최대 700)',
      '보로노이는 수직 이등분 반평면 자르기로 다각형을 구한다 (픽셀마다 거리 재기 금지 — 느림)',
      '트루쳇 타일은 사분원 둘을 마주 보는 모서리에 — 회전해도 이웃과 이어지게',
    ],
    done: [
      '흐름장: 색 선들이 털 결처럼 같은 방향으로 흐르고 천천히 결이 바뀐다',
      '보로노이: 떠도는 점마다 색 세포가 있고, 경계는 두 점의 한가운데에 있다',
      '트루쳇: 선이 끊김 없이 이어진 미로가 가운데부터 물결처럼 뒤집힌다',
      '「무늬」 조절로 하나만 고정해 볼 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '보로노이 반평면 자르기 + 흐름장 한 걸음 + 트루쳇 타일',
      from: 'demos/demosMotionB.ts clipHalf() · i122 의 drawFlow · drawTruchet 을 정리',
      body: `/** poly 에서 a 에 더 가까운 쪽(수직 이등분선 기준)만 남긴다 */
function clipHalf(poly: [number, number][], ax: number, ay: number, bx: number, by: number) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = bx - ax, ny = by - ay;
  const side = (p: [number, number]) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) { const k = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}
// 세포 i = 화면 사각형을 다른 모든 씨앗과 잘라 남은 것
let cell: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
pts.forEach((o, j) => { if (j !== i && cell.length) cell = clipHalf(cell, pts[i][0], pts[i][1], o[0], o[1]); });

/** 흐름장: 자리마다 각도, 입자는 그 방향으로 */
const field = (x: number, y: number, t: number) =>
  (Math.sin(x * 2.3 + Math.sin(y * 1.9 + t * 0.25) * 1.7) + Math.sin(y * 2.9 - t * 0.2 + Math.cos(x * 1.6) * 1.3)) * Math.PI * 0.6;
trailCtx.fillStyle = 'rgba(13,16,48,.06)'; trailCtx.fillRect(0, 0, w, h); // 옅게 덮어 꼬리
for (const p of parts) {
  const a = field(p.x * 3 * asp, p.y * 3, t), sp = 0.0028 * Math.min(3, dt * 60);
  const nx = p.x + (Math.cos(a) * sp) / asp, ny = p.y + Math.sin(a) * sp;
  trailCtx.beginPath(); trailCtx.moveTo(p.x * w, p.y * h); trailCtx.lineTo(nx * w, ny * h); trailCtx.stroke();
  p.x = nx; p.y = ny;
}

/** 트루쳇 타일: 마주 보는 모서리 사분원 둘, 0° 또는 90° */
g.save(); g.translate(x + s / 2, y + s / 2); g.rotate((ty + fk) * (Math.PI / 2));
g.beginPath(); g.arc(-s / 2, -s / 2, s / 2, 0, Math.PI / 2); g.stroke();
g.beginPath(); g.arc(s / 2, s / 2, s / 2, Math.PI, Math.PI * 1.5); g.stroke();
g.restore();`,
    },
    pitfalls: [
      { title: '흐름장 꼬리를 화면에 바로 쌓으면 다른 그림까지 남는다', fix: '꼬리 전용 캔버스를 따로 두고, 크기 · 픽셀 비율이 바뀌면 새로 만든다. 다른 무늬로 넘어가면 비운다.' },
      { title: '입자 속도를 dt 와 상관없이 두면 느린 기기에서 무늬가 달라진다', fix: '한 걸음을 dt × 60 (최대 3배)에 비례하게.' },
      { title: '보로노이를 픽셀마다 가장 가까운 점으로 칠하면 매우 느리다', fix: '반평면 자르기로 다각형을 구해 한 번에 채운다 (씨앗 수십 개까지 OK).' },
      { title: '트루쳇 사분원을 엉뚱한 모서리에 그리면 선이 이웃과 안 이어진다', fix: '마주 보는 두 모서리를 중심으로, 반지름 = 타일 반.' },
    ],
    prev: ['i110', 'u54'],
    next: ['i101'],
    refs: [
      { name: 'Wikipedia — Voronoi diagram', url: 'https://en.wikipedia.org/wiki/Voronoi_diagram' },
      { name: 'Wikipedia — Truchet tiles', url: 'https://en.wikipedia.org/wiki/Truchet_tiles' },
    ],
    source: [{ file: 'demosMotionB.ts', symbol: 'clipHalf' }],
  },

  i123: {
    id: 'i123',
    summary: '그리는 시간을 12fps 로 끊고 장마다 씨앗 무작위로 살짝 흔들어(boiling), 매끈한 움직임을 점토 · 종이 오리기 같은 뚝뚝 끊긴 손맛으로 바꾼다.',
    terms: [
      { en: 'Stop motion / animating on twos', ko: '두 프레임에 한 장 — 12fps 로 끊기' },
      { en: 'Time quantization (floor(t·fps)/fps)', ko: '시간을 계단으로 자르기' },
      { en: 'Line boil (per-frame jitter)', ko: '장마다 다르게 살짝 흔들림' },
    ],
    goal: '{target}을(를) 스톱모션 느낌으로 보여 줘 — 시간을 12fps 로 끊고, 장마다 살짝 다르게 흔들어서. 분위기는 {style}.',
    targets: ['종이 오리기 화풍 장면', '점토 인형 캐릭터 움직임', '그림책 이야기 장면'],
    styles: ['종이 오리기 (그림자 있는 색종이)', '말랑한 점토', '크레파스 손그림'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animator.speed 대신 스크립트로 시간을 계단으로 잘라 넘기거나, 애니메이션 커브 키를 Constant 로 둔다.',
      godot: 'Godot 은 AnimationPlayer 의 트랙을 Discrete(update mode) 로 두거나, _process 에서 시간을 계단으로 잘라 쓴다.',
    },
    principle: [
      '장 번호 fi = ⌊t × fps⌋, 그릴 시간 = fi / fps. 같은 장 동안은 움직임이 멈춰 있다가 다음 장에 뚝 넘어간다.',
      '흔들림(boil): 장 번호를 씨앗으로 한 무작위로 자리 · 각도를 ±0.8 정도 흔든다 — 같은 장 안에선 같고, 장이 바뀌면 다르다.',
      '종이 느낌: 조각마다 그림자(오프셋 1.5 · 2, 흐림 2)와 가위로 자른 듯 들쭉날쭉한 가장자리.',
      '렌더링은 60fps 그대로 두고 「보여 주는 시간」 만 끊는다 — 입력 반응은 매끈하게 남는다.',
    ],
    when: ['손으로 만든 듯한 따뜻한 화풍이 필요할 때', '종이 · 점토 그림체 장면 (매끈한 60fps 는 오히려 어색)'],
    avoid: ['조작에 바로 반응해야 하는 캐릭터 · 커서 — 끊기면 굼떠 보인다. 대신 배경 · 연출에만', '빠른 액션 — 12fps 는 빠른 움직임에서 뚝뚝 너무 튄다'],
    cost: 'light',
    costNote: '계산은 같고 오히려 덜 바뀐다. 장이 안 바뀌면 다시 그리지 않아도 된다 (배터리 절약).',
    level: 1,
    must: [
      '시간만 계단으로 자르고 렌더 루프는 그대로 (입력 · 화면 반응은 매끈하게)',
      '흔들림 무작위는 장 번호 씨앗으로 — 같은 장 안에서 흔들리면 지글거린다',
      '흔들림 크기는 아주 작게 (±0.8 · 각도 ±0.05)',
      'fps 조절(견본 12, 6 ~ 24)과 매끈한 60fps 와 나란히 비교',
    ],
    done: [
      '왼쪽은 종이 별이 매끈하게 폴짝, 오른쪽은 같은 장면이 뚝뚝 끊겨 움직인다',
      '오른쪽은 장이 넘어갈 때마다 해 · 구름 · 언덕 가장자리가 살짝 다르게 떨린다',
      'fps 를 6 으로 내리면 더 뚝뚝, 24 로 올리면 매끈에 가까워진다',
    ],
    code: {
      lang: 'ts',
      title: '시간 계단 + 장 번호 씨앗 흔들림',
      from: 'demos/demosMotionB.ts i123 을 정리',
      body: `function rng(seed: number): () => number {       // 씨앗 무작위 (같은 씨앗 = 같은 수열)
  let s = Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function draw(g: CanvasRenderingContext2D, t: number) {
  const fi = Math.floor(t * fps);    // 장 번호 (fps = 12)
  const tt = fi / fps;               // 이 장의 시간 — 다음 장까지 멈춰 있다
  const R = rng(fi * 7 + 3);         // 장마다 다른 흔들림, 같은 장 안에서는 같음
  const j = () => (R() - 0.5) * 1.6 * u;
  // 종이 그림자
  g.shadowColor = 'rgba(80,50,20,.3)';
  g.shadowOffsetX = 1.5 * u; g.shadowOffsetY = 2 * u; g.shadowBlur = 2 * u;
  // 해: 도는 각도에도 흔들림
  g.save();
  g.translate(hw * 0.78 + j(), h * 0.24 + j());
  g.rotate(tt * 0.4 + (R() - 0.5) * 0.08);
  drawSun(g);
  g.restore();
  // 언덕: 가위로 자른 듯 가장자리를 장마다 다르게
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= hw + 6; x += 6 * u)
    g.lineTo(x, h * 0.68 - Math.sin(x / (hw * 0.35) + 1) * 10 * u + (R() - 0.5) * 1.2 * u);
  g.lineTo(hw, h); g.closePath(); g.fill();
}`,
    },
    pitfalls: [
      { title: 'Math.random 으로 흔들면 같은 장 안에서도 지글거린다', fix: '장 번호를 씨앗으로 한 무작위를 매번 새로 만들어 쓴다.' },
      { title: '렌더 루프 자체를 12fps 로 낮추면 단추 · 입력도 굼떠진다', fix: '그리기는 그대로 두고 그림에 넣는 시간만 계단으로 자른다.' },
      { title: '흔들림이 크면 지진처럼 보인다', fix: '위치 ±0.8 · 각도 ±0.05 정도로 아주 작게.' },
    ],
    prev: ['i120'],
    next: ['i335', 'i298'],
    refs: [{ name: 'Wikipedia — Stop motion', url: 'https://en.wikipedia.org/wiki/Stop_motion' }],
  },

  i127: {
    id: 'i127',
    summary: '그림을 「프레임 번호의 함수」 로 만들고 장면 · 키프레임 · 효과음을 한 시간표에 두어, 재생 막대가 지나는 프레임에서 그림을 계산하고 소리를 울린다.',
    terms: [
      { en: 'Timeline-driven animation (frame as a function)', ko: '그림 = 프레임 번호의 함수 — 어느 시점이든 바로 계산' },
      { en: 'Keyframes + sound cues', ko: '키프레임과 효과음 신호를 같은 시간표에' },
      { en: 'Remotion / HyperFrames style', ko: '시간을 옮겨 놓고 찍는 방식' },
    ],
    goal: '{target}을(를) 타임라인 연출로 만들어 줘 — 그림은 프레임 번호의 함수로, 장면 · 키프레임 · 효과음을 한 시간표에, 재생 막대가 지나갈 때 소리. 분위기는 {style}.',
    targets: ['짧은 문제 → 정답 컷신 (150 프레임 · 30fps)', '단계 소개 · 홍보 영상', '게임 시작 연출'],
    styles: ['밝은 만화 컷신', '영상 편집기 같은 화면', '차분한 설명 영상'],
    platforms: ['canvas', 'web', 'webaudio', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Timeline(애니메이션 · 오디오 · 신호 트랙)으로 같은 일을 한다.',
      godot: 'Godot 은 AnimationPlayer 에 속성 트랙 · 오디오 트랙 · 메서드 호출 트랙을 한 타임라인에 둔다.',
    },
    principle: [
      '그림을 「지금 프레임 f」 만 받아 그리는 함수로 만든다 — 앞 프레임 상태를 쌓지 않으니 어느 프레임으로 건너뛰어도 같은 그림.',
      '각 요소는 자기 시작 프레임 기준 진행 (f − f0) / 길이 로 움직인다 (별 0~24 · 「3 + 4」 30 · 「=」 52 · 「?」 74 · 「7」 쾅 96 · 도장 104).',
      '효과음은 [프레임, 이름, 재생] 목록. 지난 프레임 → 이번 프레임 사이에 그 프레임을 지났으면 울린다 (끝에서 처음으로 넘어갈 때도).',
      '시간표 화면: 장면 띠 · 키프레임 마름모 · 소리 ♪ 를 같은 가로 축에, 재생 막대가 그 위를 지나간다.',
    ],
    when: ['정해진 순서의 연출(컷신 · 소개 · 영상)을 만들고 고칠 때 — 시간표를 보며 맞추기', '영상으로 뽑을 장면 (프레임마다 찍기)'],
    avoid: ['사용자 입력으로 갈리는 게임 장면 — 대신 상태 기계', '물리 시뮬레이션 — 프레임 함수로 바로 계산할 수 없다 (앞에서부터 돌려야 함)'],
    cost: 'light',
    costNote: '프레임마다 그림을 새로 계산한다. 소리는 Web Audio 로 합성 (자동 재생 없이 단추로 켬).',
    level: 2,
    must: [
      '그림은 프레임 번호만으로 계산 — 앞 프레임에 기대는 누적 상태 금지',
      '효과음은 「지난 프레임 < 신호 ≤ 이번 프레임」 일 때 한 번만, 고리 반복(끝 → 처음)도 처리',
      '소리는 사용자가 켤 때만 (브라우저 자동 재생 막힘 · 첫 터치 뒤 AudioContext)',
      '시간표에 장면 · 키 · 소리를 같은 축으로, 지금 프레임 근처의 키를 강조',
      '재생 빠르기 조절 (0.25 ~ 2배)',
    ],
    done: [
      '재생 막대가 시간표를 지나며 위 미리보기가 그 프레임 그림으로 바뀐다 (별 등장 → 「3 + 4 = ?」 → 「7」 쾅 → 도장 · 꽃가루)',
      '♪ 표시를 지나는 순간 효과음이 울리고 「♪ 쾅!」 말풍선이 뜬다 (소리 켰을 때)',
      '빠르기를 바꿔도 소리가 그림과 같은 프레임에 맞는다',
    ],
    code: {
      lang: 'ts',
      title: '프레임 함수 + 효과음 신호 (지나간 프레임 감지)',
      from: 'demos/demosMotionB.ts i127 을 정리',
      body: `const FPS = 30, TOTAL = 150;
const SFX: [number, string, () => void][] = [
  [2, '휙', () => snd.noise(0.25, 0.12, 1800)],
  [30, '뿅', () => snd.tone(520, 0.15, 'square', 0.12, 2)],
  [96, '쾅', () => (snd.tone(110, 0.3, 'sine', 0.4, 0.5), snd.noise(0.12, 0.2, 200))],
  [104, '딩동', () => snd.tone(988, 0.25, 'triangle', 0.2)],
];
let ph = 0, lastF = -1;

function draw(g: CanvasRenderingContext2D, dt: number) {
  ph += (dt * speed * FPS) / TOTAL;
  const f = Math.floor((ph - Math.floor(ph)) * TOTAL);  // 지금 프레임 (고리)
  if (f !== lastF) {
    for (const [sf, , play] of SFX)                        // 지난 프레임 → 이번 프레임 사이를 지났나
      if ((lastF < sf && f >= sf) || (lastF > f && f >= sf)) play(); // 뒤는 끝 → 처음 넘김
    lastF = f;
  }
  renderFrame(g, f);
}

/** 그림 = 프레임의 함수 — 어느 f 로 건너뛰어도 같은 그림 */
function renderFrame(g: CanvasRenderingContext2D, f: number) {
  const sk = easeOutBack(f / 24);                          // 0~24: 별이 날아와 자리
  drawStar(g, lerp(-20, 22, sk), 20);
  ([['3 + 4', 30], ['=', 52], ['?', 74]] as const).forEach(([s, f0], i) => {
    if (f < f0 || (i === 2 && f >= 96)) return;
    const k = easeOutBack((f - f0) / 10);                  // 시작 프레임 기준 10프레임 동안 톡
    drawText(g, s, xs[i], cy, k);
  });
  if (f >= 96) drawText(g, '7', xs[2], cy, lerp(2.4, 1, Math.min(1, (f - 96) / 6))); // 쾅
}`,
    },
    pitfalls: [
      { title: '앞 프레임 상태를 쌓아 그리면 건너뛰기 · 되감기에서 그림이 틀어진다', fix: '모든 요소를 (f − 시작 프레임) 으로만 계산한다.' },
      { title: '「f === 신호」 로 비교하면 느린 기기에서 프레임을 건너뛰어 소리가 빠진다', fix: '지난 프레임과 이번 프레임 사이를 지났는지로 본다.' },
      { title: '페이지가 열리자마자 소리를 내면 브라우저가 막는다', fix: '소리는 단추로 켤 때 AudioContext 를 만들고 resume.' },
      { title: '효과음 최고점이 그림의 타격 순간과 어긋나면 어색하다', fix: '소리를 들어 보고 최고점을 타격 프레임에 맞춘다 (사이트에서 이름만 보고 골랐다 지적받음).', seen: true },
    ],
    prev: ['i106', 'i117'],
    next: ['u77', 'i141'],
    refs: [{ name: 'Remotion — 공식 사이트', url: 'https://www.remotion.dev/' }],
  },
  u47: {
    id: 'u47',
    summary: '나올 눈을 먼저 정해 두고, 그 눈이 위로 오는 회전을 목표로 포물선 · 통통 세 번 튀기 · 남은 회전 풀기를 겹쳐, 진짜 굴린 듯 정한 눈에 멈추게 한다.',
    terms: [
      { en: 'Predetermined dice roll (scripted outcome)', ko: '결과를 먼저 정하고 그에 맞게 굴리는 연출' },
      { en: 'Target quaternion + unwinding spin', ko: '목표 회전에 남은 회전을 (1 − t)² 로 풀어 가기' },
      { en: 'Bounce arcs (decaying hops)', ko: '점점 낮아지는 튀기 세 번' },
    ],
    goal: '{target}을(를) 던지는 연출을 만들어 줘 — 나올 눈을 먼저 정하고, 포물선으로 날아와 통통 튀고 굴러 그 눈이 위로 오게 멈추게. 분위기는 {style}.',
    targets: ['주사위 셋 (요트 · 피그)', '주사위 여러 개 한꺼번에 (파클 · 거짓말쟁이 주사위)', '그림 주사위 (크라운 앤 앵커)'],
    styles: ['초록 펠트 탁자', '나무 탁자 · 촛불', '밝은 장난감 상자'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 방식으로 Quaternion.Slerp · 커브를 쓰거나, 물리로 굴린 뒤 결과 면에 맞춰 주사위 무늬를 바꿔 끼우는 방법도 흔하다.',
      godot: 'Godot 은 Tween 으로 위치를 옮기고 _process 에서 Quaternion(axis, angle) 을 목표 회전에 곱해 같은 식을 쓴다.',
    },
    principle: [
      '눈 v 가 위로 오는 회전(faceUpQuat)을 표로 정해 둔다: 1 그대로 · 6 은 x 180° · 2 / 5 는 z ±90° · 3 / 4 는 x ∓90°, 그 위에 y 축 무작위 돌림(±0.45).',
      '매 프레임 회전 = 목표 회전 × (무작위 축으로 남은 각도). 남은 각도 = (1 − t)² × (10 ~ 16 라디안) — 처음엔 마구 돌다 끝에 0 이 되며 정확히 목표.',
      '자리: 던진 곳 → 멈출 곳을 1 − (1 − t)² 로 (빠르게 출발해 천천히 도착).',
      '높이: 세 번 튀기 — t 0 ~ 0.55 높이 0.8 · 0.55 ~ 0.82 높이 0.25 · 0.82 ~ 1 높이 0.06 의 반사인.',
      '주사위마다 걸리는 시간을 조금씩 다르게 (0.8 + 0.05k + 무작위 0.1) 해서 한꺼번에 멈추지 않게.',
    ],
    when: ['결과가 게임 규칙(서버 · 무작위 표)으로 이미 정해진 주사위 게임', '물리로 굴리면 결과가 기울어지거나 모서리에 서는 문제를 피하고 싶을 때'],
    avoid: ['주사위가 서로 부딪히고 튀는 모습 자체가 볼거리인 장면 — 대신 물리 엔진 + 결과 면 바꿔 끼우기', '결과를 사용자가 「진짜 무작위」 로 확인해야 할 때 — 결과는 따로 공정하게 뽑고 연출만 이것으로'],
    cost: 'light',
    costNote: '물리 없이 식 몇 개. 주사위 무늬는 캔버스 6장(256px)을 처음에 한 번 그린다.',
    level: 2,
    must: [
      '결과는 굴리기 전에 정한다 — 연출이 끝난 뒤 결과를 읽지 않기',
      '마지막 회전은 반드시 목표 회전과 정확히 같게 (남은 각도가 t = 1 에서 0)',
      '튀기는 점점 낮게 세 번, 자리는 감속 곡선으로',
      '주사위마다 도는 축 · 걸리는 시간을 조금씩 다르게',
      '그림자 원판은 높이에 따라 커지고 옅어지게',
    ],
    done: [
      '화면 위에 「정한 눈: 3 · 5 · 2」 가 먼저 뜨고, 주사위 셋이 날아와 통통 튀며 구른 뒤 정확히 그 눈으로 멈춘다',
      '멈추면 금빛 고리가 켜지고 「✓ 정한 눈 그대로!」 가 보인다',
      '주사위가 공중에 있을 때 바닥 그림자가 작고 옅어진다',
      '여러 번 굴려도 모서리로 서거나 비스듬히 멈추지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '정한 눈이 위로 오는 회전 + 튀기 · 남은 회전 풀기',
      from: 'src/game/games/shared/dice3d.ts faceUpQuat() · DiceSet.roll() · update() 를 정리',
      body: `/** 윗면에 v 가 오게 하는 회전 (yaw 는 무작위로 조금) */
function faceUpQuat(v: number, yaw = (Math.random() - 0.5) * 0.9): THREE.Quaternion {
  const e = new THREE.Euler();
  if (v === 1) e.set(0, 0, 0);
  else if (v === 6) e.set(Math.PI, 0, 0);
  else if (v === 2) e.set(0, 0, Math.PI / 2);
  else if (v === 5) e.set(0, 0, -Math.PI / 2);
  else if (v === 3) e.set(-Math.PI / 2, 0, 0);
  else e.set(Math.PI / 2, 0, 0);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromEuler(e));
}

// 굴리기 시작: 주사위 k 마다
rolls.push({
  i, from: start, to: spot.clone(), target: faceUpQuat(values[k]),
  axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
  spin: 10 + Math.random() * 6, t: 0, dur: 0.8 + k * 0.05 + Math.random() * 0.1,
});

// 매 프레임
for (const a of rolls) {
  a.t = Math.min(1, a.t + dt / a.dur);
  const t = a.t, d = dice[a.i];
  d.position.lerpVectors(a.from, a.to, 1 - (1 - t) ** 2);              // 빨리 출발 · 천천히 도착
  const hop = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * 0.8            // 튀기 세 번, 점점 낮게
    : t < 0.82 ? Math.sin(((t - 0.55) / 0.27) * Math.PI) * 0.25
    : Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.06;
  d.position.y = a.to.y + hop + (1 - t) * Math.max(0, a.from.y - a.to.y) * (t < 0.55 ? 0.5 : 0);
  const left = (1 - t) ** 2 * a.spin;                                     // 남은 회전 → t = 1 에서 0
  d.quaternion.copy(a.target).multiply(new THREE.Quaternion().setFromAxisAngle(a.axis, left));
}`,
    },
    pitfalls: [
      { title: '무늬 면 순서와 회전 표가 어긋나면 엉뚱한 눈이 위로 온다', fix: 'BoxGeometry 재질 순서(+x, −x, +y, −y, +z, −z)에 맞춰 면 그림을 [2, 5, 1, 6, 3, 4] 로 두고, 그 표에 맞춘 faceUpQuat 을 쓴다.' },
      { title: '남은 회전을 목표 회전 앞에 곱하면 멈출 때 비스듬하다', fix: '목표 × 남은 회전 순서로, 남은 각도가 t = 1 에서 정확히 0 이 되게 (1 − t)².' },
      { title: '모든 주사위가 같은 시간에 멈추면 기계 같다', fix: '걸리는 시간을 주사위마다 0.05초 + 무작위 0.1초씩 다르게.' },
    ],
    prev: ['u36', 'i102'],
    next: ['i211', 'i214'],
    source: [{ file: 'demosStructure.ts', symbol: 'u47' }],
  },

  i199: {
    id: 'i199',
    summary: '맞는 순간 화면 전체를 때린 쪽으로 툭 밀고 2~5% 확대했다가, 임계 감쇠 충격 곡선으로 넘침 없이 돌아오게 해 타격감을 준다.',
    terms: [
      { en: 'Camera kick (screen push)', ko: '때린 쪽으로 화면이 툭 밀림' },
      { en: 'Punch zoom', ko: '순간 확대했다 돌아오기' },
      { en: 'Critically damped impulse (a·W·e·e^(−aW))', ko: '임계 감쇠 충격 곡선 — 한 번 솟고 넘침 없이 0 으로' },
    ],
    goal: '{target}에 카메라 킥 · 펀치 줌을 넣어 줘 — 맞는 순간 화면이 때린 쪽으로 툭 밀렸다 돌아오고 순간 4% 확대, 넘침 없는 감쇠로. 분위기는 {style}.',
    targets: ['블록이 자리에 딱 들어가는 순간', '정답 · 탈출 순간', '공이 과녁에 맞는 순간'],
    styles: ['짧고 경쾌한 퍼즐', '묵직한 액션', '만화처럼 과장'],
    platforms: ['canvas', 'three', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Cinemachine Impulse(Impulse Source → Listener)로 카메라 킥을 준다.',
      godot: 'Godot 은 Camera2D 의 offset · zoom (3D 는 Camera3D 의 위치 · fov)을 같은 곡선으로 움직인다.',
    },
    principle: [
      '맞은 뒤 시간 a 에 대해 k(a) = a·W·e·e^(−a·W) — 0 에서 시작해 a = 1/W 에서 정확히 1, 그 뒤 넘침 없이 0 으로 (W = 13 이면 약 77ms 에 최고).',
      '화면 이동 = 방향 × 9 × k (견본 x 9 · y 3), 확대 = 1 + 0.045 × k. 세기 하나로 모두 곱한다.',
      '확대는 화면 가운데를 축으로: 가운데로 옮김 → 키움 → 되돌림.',
      '흔들기(무작위 떨림)와 다르게 한 방향으로 한 번 — 「어디서 맞았는지」 가 느껴진다.',
    ],
    when: ['딱 맞는 순간 · 맞히는 순간에 짧은 손맛', '방향이 있는 충격 (왼쪽에서 날아와 꽂힘)'],
    avoid: ['자주 일어나는 작은 동작(칸 하나 옮기기) — 매번 밀리면 어지럽다', '글씨를 읽어야 하는 순간 — 대신 대상만 찌그러지기'],
    cost: 'light',
    costNote: '화면 변환 하나. 계산은 거의 없다.',
    level: 1,
    must: [
      '곡선은 임계 감쇠 충격(a·W·e·e^(−aW)) — 사인 흔들림처럼 왔다 갔다 넘치지 않게',
      '확대는 2~5% (견본 4.5%) — 그 이상이면 멀미',
      '밀리는 방향 = 맞은 방향',
      '세기 조절 하나로 이동 · 확대를 함께 (0 ~ 3)',
      '켬 / 끔을 나란히 비교',
    ],
    done: [
      '블록이 판에 딱 들어가는 순간, 오른쪽(켬)은 화면 전체가 오른쪽 아래로 툭 밀리며 살짝 커졌다가 0.3초 안에 넘침 없이 돌아온다',
      '왼쪽(끔)은 같은 장면이 그냥 멈춰 있어 차이가 바로 보인다',
      '「세기」 를 0 으로 하면 움직임이 없고, 3 으로 하면 크게 밀린다',
    ],
    code: {
      lang: 'ts',
      title: '임계 감쇠 충격 곡선으로 화면 밀기 + 확대',
      from: 'demos/demosJuice.ts D199 의 scene() 을 정리',
      body: `const W = 13;                                   // 클수록 빨리 솟고 빨리 끝남 (최고점 1/W 초)
const a = ph - HIT;                            // 맞은 뒤 시간
const k = a >= 0 ? a * W * Math.E * Math.exp(-a * W) : 0; // 0 → 1 (1/W 에서) → 넘침 없이 0

g.save();
if (on) {
  const z = 1 + 0.045 * power * k;             // 순간 확대 4.5%
  g.translate(w / 2 + 9 * u * power * k, h / 2 + 3 * u * power * k); // 맞은 쪽으로 밀림
  g.scale(z, z);                               // 가운데를 축으로
  g.translate(-w / 2, -h / 2);
}
drawScene(g, w, h);
g.restore();

// three.js 라면 같은 k 로:
// camera.position.copy(base).addScaledVector(hitDir, 0.09 * power * k);
// camera.fov = baseFov / (1 + 0.045 * power * k); camera.updateProjectionMatrix();`,
    },
    pitfalls: [
      { title: '사인으로 흔들면 왔다 갔다 해서 「툭」 이 아니라 「덜덜」 이 된다', fix: '임계 감쇠 곡선은 한 번 솟고 넘침 없이 돌아온다 — 방향 있는 한 방이 된다.' },
      { title: '확대 축이 왼쪽 위면 화면이 대각선으로 미끄러진다', fix: '가운데로 옮기고 키운 뒤 되돌린다.' },
      { title: '모든 동작에 킥을 주면 정작 중요한 순간이 묻힌다', fix: '정답 · 완성 같은 큰 순간에만.' },
    ],
    prev: ['i102'],
    next: ['i200', 'i204'],
    source: [{ file: 'demosJuice.ts', symbol: 'D199' }],
  },

  i200: {
    id: 'i200',
    summary: '맞는 순간 게임 시간을 멈추고 두 프레임 동안 흑백 반전 실루엣 + 집중선을 보여 준 뒤 이어 가, 애니메이션 필살기 같은 임팩트를 낸다.',
    terms: [
      { en: 'Impact frame', ko: '맞는 순간 한두 장 흑백 · 반전 그림' },
      { en: 'Hit freeze (time hold)', ko: '그 동안 게임 시간 멈춤' },
      { en: 'Speed lines (focus lines)', ko: '집중선 — 한 점으로 모이는 쐐기' },
    ],
    goal: '{target}에 임팩트 프레임을 넣어 줘 — 맞는 순간 시간을 멈추고 두 프레임(각 70ms) 흑백 반전 실루엣 + 집중선, 그 뒤 이어서. 분위기는 {style}.',
    targets: ['필살 투구가 블록에 꽂히는 순간', '검문소 「모순 발견!」', '보스를 맞히는 순간'],
    styles: ['애니메이션 필살기', '흑백 만화책', '네온 반전'],
    platforms: ['canvas', 'three', 'web', 'unity', 'godot'],
    principle: [
      '맞는 순간 HIT 부터 프레임 길이 fd(견본 70ms) 동안 모드 1(흰 바탕 · 검은 실루엣), 다음 fd 동안 모드 2(검은 바탕 · 흰 실루엣).',
      '그 두 프레임 동안 게임 시간 gt 는 HIT 에 멈춰 있고, 끝나면 2·fd 만큼 늦춰 이어 간다 — 모든 물체가 같은 자리에서 「얼었다」 풀린다.',
      '모드일 때는 모든 그림을 한 색(C = 검정 또는 흰색)으로만 칠한다 → 실루엣.',
      '집중선: 맞은 점을 향해 좁아지는 쐐기 40개를 바탕과 반대 색으로.',
    ],
    when: ['게임에서 가장 큰 한 방 (필살기 · 결정타 · 모순 발견)', '만화 · 애니 풍 연출'],
    avoid: ['자주 일어나는 타격 — 번쩍임이 잦으면 눈이 아프다. 대신 흰 번쩍(맞은 물체만)', '빛에 민감한 아이 — 한 번에 두 프레임만, 연달아 쓰지 않기'],
    cost: 'light',
    costNote: '두 프레임 동안 단색으로 그리기만. 오히려 가볍다.',
    level: 1,
    must: [
      '임팩트 프레임 동안 게임 시간을 멈춘다 — 물체가 계속 움직이면 그냥 깜박임으로 보인다',
      '두 프레임: 흰 바탕 검은 실루엣 → 검은 바탕 흰 실루엣 (한 프레임 16 ~ 200ms, 견본 70)',
      '실루엣 모드에서는 그라데이션 · 빛 효과를 끄고 한 색만',
      '집중선은 맞은 점을 향해 — 쐐기 40개, 프레임마다 조금 흔들림',
      '연달아 쓰지 않기 (번쩍임 주의)',
    ],
    done: [
      '공이 블록에 꽂히는 순간 화면이 흰 바탕 · 검은 그림자 → 검은 바탕 · 흰 그림자로 두 번 바뀌고 「쾅!」 이 보인다',
      '그 두 프레임 동안 공 · 조각이 멈춰 있다가 이어서 블록 조각이 흩어진다',
      '「한 프레임 길이」 를 늘리면 정지가 길어지고, 집중선을 끄면 실루엣만 남는다',
      '왼쪽(끔)과 비교하면 같은 타격이 훨씬 세게 느껴진다',
    ],
    code: {
      lang: 'ts',
      title: '시간 멈춤 + 두 프레임 반전 실루엣 + 집중선',
      from: 'demos/demosJuice.ts D200 의 scene() 을 정리',
      body: `const fd = frameMs / 1000;            // 한 프레임 길이 (견본 70ms)
let mode = 0;                           // 0 보통 · 1 흰 바탕 검은 실루엣 · 2 검은 바탕 흰 실루엣
let gt = ph;                            // 게임 시간
if (ph >= HIT && ph < HIT + fd) mode = 1;
else if (ph >= HIT + fd && ph < HIT + 2 * fd) mode = 2;
if (ph >= HIT && ph < HIT + 2 * fd) gt = HIT;      // 두 프레임 동안 시간 멈춤
else if (ph >= HIT + 2 * fd) gt = ph - 2 * fd;     // 멈춘 만큼 늦춰 이어 가기

const C = (c: string) => (mode === 0 ? c : mode === 1 ? '#000' : '#fff'); // 실루엣 색
if (mode === 0) drawBackground(g, w, h);
else { g.fillStyle = mode === 1 ? '#fff' : '#000'; g.fillRect(0, 0, w, h); }

if (mode > 0) {                          // 집중선: 맞은 점(ix, iy)을 향해 좁아지는 쐐기 40개
  g.fillStyle = mode === 1 ? '#000' : '#fff';
  for (let i = 0; i < 40; i++) {
    const an = (i / 40) * Math.PI * 2 + hash(i, Math.floor(T * 30)) * 0.12;
    const r0 = (26 + hash(i, 9) * 30) * u, R = 240 * u, wd = 0.035 + hash(i, 4) * 0.03;
    g.beginPath();
    g.moveTo(ix + Math.cos(an) * r0, iy + Math.sin(an) * r0);
    g.lineTo(ix + Math.cos(an - wd) * R, iy + Math.sin(an - wd) * R);
    g.lineTo(ix + Math.cos(an + wd) * R, iy + Math.sin(an + wd) * R);
    g.fill();
  }
}
drawBall(g, gt, mode ? C('') : null);     // 모든 물체는 gt 로, 모드면 한 색으로
drawBlock(g, gt, mode ? C('') : null);`,
    },
    pitfalls: [
      { title: '시간을 멈추지 않으면 그냥 화면이 깜박인 것처럼 보인다', fix: '두 프레임 동안 게임 시간을 HIT 에 고정하고, 끝나면 그만큼 늦춰 이어 간다.' },
      { title: '실루엣 모드에서도 빛 · 꼬리를 그리면 지저분하다', fix: '모드일 때는 그라데이션 · 빛 번짐 · 불꽃 꼬리를 건너뛰고 한 색만.' },
      { title: '프레임 길이를 ms 대신 「렌더 프레임 수」 로 세면 기기마다 길이가 다르다', fix: '시간(ms)으로 정한다 — 120Hz 화면에서도 같은 길이.' },
    ],
    prev: ['i199', 'u37'],
    next: ['i201', 'i204'],
    source: [{ file: 'demosJuice.ts', symbol: 'D200' }],
  },

  i201: {
    id: 'i201',
    summary: '맞은 물체의 재질만 emissive 흰색을 1 → 0 으로 0.1초 빼서 하얗게 번쩍이게 해, 어느 것이 맞았는지 한눈에 보이게 한다.',
    terms: [
      { en: 'Hit flash (white flash)', ko: '맞은 물체만 순간 하얗게' },
      { en: 'emissive / emissiveIntensity', ko: '스스로 빛나는 색과 세기 — 빛과 상관없이 밝아짐' },
      { en: 'Per-object material', ko: '물체마다 따로 둔 재질 — 하나만 번쩍이게' },
    ],
    goal: '{target}에 피격 흰 번쩍을 넣어 줘 — 맞은 물체만 emissive 흰색이 1 에서 0 으로 0.1초 동안 빠지게. 분위기는 {style}.',
    targets: ['잘못 누른 숫자 블록', '틀린 칸 · 맞은 적', '눌린 단추 · 카드'],
    styles: ['밝은 퍼즐', '아케이드 게임', '부드러운 그림책'],
    platforms: ['three', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 MaterialPropertyBlock 으로 그 Renderer 의 _EmissionColor 만 바꾸면 재질을 복제하지 않고 하나만 번쩍인다.',
      godot: 'Godot 은 GeometryInstance3D 의 instance shader parameter 또는 재질 복제 후 emission_energy 를 트윈한다.',
    },
    principle: [
      '재질에 emissive 흰색(0xffffff)을 미리 넣어 두고 세기를 0 으로 둔다.',
      '맞은 순간부터 세기 = clamp(1 − a / 길이, 0, 1) (길이 견본 0.1초) — 빛 방향과 상관없이 통째로 하얘졌다 돌아온다.',
      'emissiveMap 이 없으면 무늬까지 하얗게 덮이고, 그림(map)을 emissiveMap 에도 넣으면 무늬 모양대로 밝아진다.',
      '튀기 · 찌그러짐 · X 표시와 함께 쓰면 「무엇이 · 틀렸다」 가 또렷해진다.',
    ],
    when: ['여러 물체 중 어느 것이 맞았는지 알려 줄 때', '틀린 입력을 짧게 알려 줄 때'],
    avoid: ['아주 작은 물체 — 번쩍이 안 보인다. 대신 둘레 고리 · 흔들기', '툰 재질 장면 — MeshToonMaterial 도 emissive 가 있으니 같은 방법으로 (재질만 바꾸지 말 것)'],
    cost: 'light',
    costNote: '값 하나 바꾸기. 재질을 물체마다 두면 그리기 묶음이 그만큼 늘어난다 (수백 개면 인스턴스 색으로).',
    level: 1,
    must: [
      '재질은 물체마다 따로 (공유 재질이면 모두가 번쩍인다)',
      'emissive 는 미리 흰색으로, 세기만 0 ↔ 1 (emissiveMap 같은 맵을 붙였다 뗐다 하면 셰이더가 다시 컴파일된다)',
      '번쩍 길이는 0.03 ~ 0.4초 조절 (견본 0.1)',
      '켬 / 끔을 나란히 비교 — 끔 쪽은 톡 튀기만',
    ],
    done: [
      '블록 셋 중 잘못 누른 블록만 0.1초 하얗게 번쩍하고 튀며 X 표시가 뜬다',
      '왼쪽(끔)은 톡 튀기만 해서 어느 것이 맞았는지 놓치기 쉽다 — 차이가 보인다',
      '「번쩍 시간」 을 늘리면 더 오래 하얗게 남는다',
      '다른 블록은 전혀 밝아지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '물체마다 재질 + emissive 세기 1 → 0',
      from: 'demos/demosJuice.ts D201 을 정리',
      body: `// 물체마다 따로 — emissive 는 처음부터 흰색, 세기만 0
const mats = NUM.map((n, i) => new THREE.MeshStandardMaterial({
  map: faceTex(n, COLORS[i]), roughness: 0.42, emissive: 0xffffff, emissiveIntensity: 0,
}));
const cubes = mats.map((m, i) => {
  const c = new THREE.Mesh(roundBoxGeo, m);
  c.position.set((i - 1) * 1.4, 0.45, 0);
  scene.add(c);
  return c;
});

// 맞은 순간부터 a 초 지남, idx = 맞은 블록
const flash = Math.max(0, Math.min(1, 1 - a / dur)); // dur = 0.1초
mats.forEach((m, i) => (m.emissiveIntensity = i === idx ? flash : 0));

// 함께: 톡 튀기 + 찌그러짐
const c = cubes[idx];
const hop = Math.sin(Math.min(1, a / 0.3) * Math.PI) * 0.22;
const sq = 0.14 * Math.exp(-a * 10) * Math.cos(a * 30);
c.position.y = 0.45 + hop;
c.scale.set(1 + sq, 1 - sq, 1 + sq);`,
    },
    pitfalls: [
      { title: '여러 물체가 재질 하나를 같이 쓰면 다 같이 번쩍인다', fix: '번쩍일 물체는 재질을 따로 둔다 (견본은 블록마다 MeshStandardMaterial 하나씩).' },
      { title: '번쩍일 때 emissiveMap 을 처음 붙이면 첫 번쩍에 멈칫한다', fix: '맵이 생기면 셰이더 열쇠가 바뀌어 다시 컴파일된다. 처음부터 emissive 흰색 · 세기 0 으로 만들어 두고 세기(uniform)만 바꾼다.' },
      { title: '색을 흰색으로 바꾸는 방식(color.set)은 그늘진 면이 덜 하얘진다', fix: 'emissive 는 빛과 상관없이 더해지므로 모든 면이 고르게 하얘진다.' },
    ],
    prev: ['u04'],
    next: ['i202', 'i207'],
    source: [{ file: 'demosJuice.ts', symbol: 'D201' }],
  },

  i202: {
    id: 'i202',
    summary: '+10 · ×2 같은 숫자가 탄성 이징으로 톡 커졌다가 떠오르며 사라지고, 크리티컬은 더 크게 · 흔들리며, 빼기는 떨며 가라앉아 점수 변화를 바로 느끼게 한다.',
    terms: [
      { en: 'Floating combat text (damage numbers)', ko: '튀어 오르는 숫자' },
      { en: 'easeOutElastic pop', ko: '탄성 이징 — 톡 넘쳤다 출렁이며 자리' },
      { en: 'Critical hit emphasis', ko: '크리티컬 — 크게 · 흔들림 · 빛' },
    ],
    goal: '{target}에 튀어 오르는 숫자를 띄워 줘 — 톡 커졌다 떠오르며 사라지고, 크리티컬은 크게 흔들리고, 빼기는 떨며 가라앉게. 분위기는 {style}.',
    targets: ['점수 +10 · ×2 · 크리티컬 +50 · −3', '계산 결과 숫자', '동전 · 보석 얻기'],
    styles: ['통통 튀는 아케이드', '금빛 보상', '부드러운 파스텔'],
    platforms: ['canvas', 'web', 'three', 'unity', 'godot'],
    principle: [
      '크기 = elasticOut(a / 0.45) — 0 에서 1 을 넘쳤다 출렁이며 1 로 (크리티컬은 × 1.55).',
      '떠오름 = 36 × easeOut(a / 1.1), 투명도는 0.75 ~ 1.1초에 빠진다 (수명 1.1초).',
      '크리티컬: 옆 흔들림 sin(70a)·3·e^(−5a) + 기울기 흔들림, 뒤에 금빛 빛무리 · 작은 불꽃 · 「크리티컬!」.',
      '빼기: 조금 올랐다 가라앉고(위로 16 → 아래로 18), 짧게 떤다 — 좋은 일과 나쁜 일의 움직임이 다르다.',
      '숫자는 굵은 테두리 + 위아래 그러데이션(초록 · 금 · 빨강)으로 어떤 바탕에서도 읽히게.',
    ],
    when: ['점수 · 피해 · 결과값이 바뀌는 순간을 그 자리에서 보여 줄 때', '어디서 얼마나 얻었는지 알려 줄 때'],
    avoid: ['한 번에 수십 개가 동시에 뜨는 경우 — 겹쳐 안 읽힌다. 대신 합쳐서 하나로', '정확한 값을 오래 봐야 할 때 — 대신 점수판 숫자 굴러가기'],
    cost: 'light',
    costNote: '숫자 하나당 글자 · 테두리 몇 번. 가볍다.',
    level: 1,
    must: [
      '나타남은 탄성 이징(넘쳤다 출렁) — 그냥 크기 1 로 나타나면 밋밋하다',
      '좋은 값(+ · ×)은 떠오르고, 나쁜 값(−)은 떨며 가라앉게 — 움직임으로도 구분',
      '크리티컬은 크게(× 1.55) + 흔들림 + 빛 + 작은 글씨 이름표',
      '굵은 테두리로 바탕과 상관없이 읽히게',
      '숫자가 나는 자리의 블록도 함께 찌그러지고 번쩍',
    ],
    done: [
      '블록을 누르면 그 위에 +10 이 톡 커졌다 출렁이며 떠오르다 사라진다',
      '+50 크리티컬은 더 크게 나와 좌우로 떨고 금빛으로 빛난다',
      '−3 은 빨갛게 떨며 아래로 가라앉는다',
      '왼쪽(끔)은 글자가 그냥 떠오르기만 해 차이가 바로 보인다',
    ],
    code: {
      lang: 'ts',
      title: '탄성 이징 크기 · 떠오름 · 크리티컬 흔들림 · 빼기 가라앉음',
      from: 'demos/demosJuice.ts D202 의 scene() 을 정리',
      body: `const TAU = Math.PI * 2;
const elasticOut = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin(((k * 10 - 0.75) * TAU) / 3) + 1);
const easeOut = (k: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
const smooth = (e0: number, e1: number, x: number) => { const v = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return v * v * (3 - 2 * v); };
const LIFE = 1.1;

// e = { s: '+50', kind: 'n' | 'crit' | 'neg' }, a = 뜬 뒤 시간
const crit = e.kind === 'crit', neg = e.kind === 'neg';
const sc = elasticOut(a / 0.45) * (crit ? 1.55 : 1);
const rise = neg ? 16 * u * easeOut(a / 0.4) - 18 * u * smooth(0.4, LIFE, a) // 빼기는 올랐다 가라앉음
                 : 36 * u * easeOut(a / LIFE);
const alpha = 1 - smooth(0.75, LIFE, a);
let jx = 0, rot = 0;
if (crit) { jx = Math.sin(a * 70) * 3 * u * Math.exp(-a * 5); rot = Math.sin(a * 40) * 0.18 * Math.exp(-a * 4); }
if (neg) jx = Math.sin(a * 60) * 2.5 * u * Math.exp(-a * 6);
g.save();
g.globalAlpha = alpha;
g.translate(x0 + jx, y0 - rise);
g.rotate(rot);
g.scale(sc, sc);
const fill = g.createLinearGradient(0, -10 * u, 0, 10 * u);
fill.addColorStop(0, crit ? '#fff9db' : neg ? '#ffc9d3' : '#ffffff');
fill.addColorStop(1, crit ? '#ffb400' : neg ? '#ff3b5c' : '#8ce99a');
g.font = '900 ' + 15 * u + 'px sans-serif';
g.lineJoin = 'round';
g.strokeStyle = neg ? '#5c0011' : crit ? '#7a3000' : '#0b3d1a'; g.lineWidth = 3.4 * u;
g.strokeText(e.s, 0, 0);                        // 굵은 테두리 먼저
g.fillStyle = fill; g.fillText(e.s, 0, 0);
g.restore();`,
    },
    pitfalls: [
      { title: '테두리 없는 흰 숫자는 밝은 바탕에서 안 보인다', fix: '굵은 어두운 테두리를 먼저 그리고 그 위에 채운다 (lineJoin round).' },
      { title: '빼기도 위로 떠오르면 좋은 일처럼 보인다', fix: '빼기는 떨며 가라앉게, 색도 빨강으로.' },
      { title: '숫자가 많이 겹쳐 뜨면 하나도 안 읽힌다', fix: '같은 자리에 연달아 뜨면 합치거나 조금씩 옆으로 비켜 띄운다.' },
    ],
    prev: ['i90', 'i94'],
    next: ['i208', 'i211'],
    source: [{ file: 'demosJuice.ts', symbol: 'D202' }],
  },

  i204: {
    id: 'i204',
    summary: '결정적 순간 직전 남은 시간에 따라 게임 시간 배율을 0.15 까지 부드럽게 낮췄다가, 「쾅」 하는 순간 1 로 되돌려 「빨랐다 → 늘어짐 → 쾅」 의 긴장을 만든다.',
    terms: [
      { en: 'Slow motion (time scale curve)', ko: '게임 시간 배율을 곡선으로 바꾸기' },
      { en: 'Bullet time', ko: '결정적 순간만 느리게' },
      { en: 'Time scale (game time vs real time)', ko: '게임 시간 += 실제 dt × 배율' },
    ],
    goal: '{target}에 슬로모션을 넣어 줘 — 닿기 직전 시간 배율이 0.15 까지 부드럽게 줄었다가 닿는 순간 원래 속도로, 아래에 시간 배율 그래프. 분위기는 {style}.',
    targets: ['마지막 블록이 탑에 내려앉는 순간', '아슬아슬한 판정 (공이 선에 닿을까)', '마지막 한 수 · 결승선'],
    styles: ['푸른빛 느린 순간 + 쾅', '영화 같은 극적인', '밝고 장난스러운'],
    platforms: ['canvas', 'three', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Time.timeScale 을 곡선으로 바꾸고 (물리는 Time.fixedDeltaTime 도 같이), 소리는 AudioSource.pitch 로 낮춘다.',
      godot: 'Godot 은 Engine.time_scale 을 바꾸고, 소리는 AudioStreamPlayer.pitch_scale 로 낮춘다.',
    },
    principle: [
      '게임 시간 gt 를 따로 두고 매 프레임 gt += 실제 dt × 배율. 그림 · 움직임은 모두 gt 로 계산한다.',
      '배율 = minS + (1 − minS) × smooth(0.06, 0.42, 남은 시간). 닿기 0.42초 전부터 느려지기 시작해 0.06초 전에 가장 느림(0.15).',
      '닿는 순간(gt ≥ GC) 배율 1 — 「쾅」 은 원래 속도로 터져야 세다. 흔들림 · 불꽃 · 「완성!」 이 함께.',
      '느린 동안은 푸른 막 · 가장자리 어둡게 · 잔상 4장으로 「시간이 늘어났다」 를 보여 준다. 소리는 같은 배율로 음높이를 낮추면 더 좋다 (견본은 「♪ 소리도 낮게」 표시만).',
    ],
    when: ['결과가 갈리는 마지막 순간에 긴장을 줄 때', '빠른 움직임이 무엇이었는지 보여 줄 때'],
    avoid: ['자주 일어나는 동작 — 매번 느려지면 답답하다', '사용자가 조작 중인 순간 — 입력까지 느려지면 굼뜨다. 연출 구간에만'],
    cost: 'light',
    costNote: '배율 곡선 하나. 비용 없음.',
    level: 2,
    must: [
      '게임 시간과 실제 시간을 나눈다 (gt += dt × 배율) — 그림은 모두 게임 시간으로',
      '배율 곡선은 부드럽게 (smoothstep) — 뚝 끊기면 멈칫으로 보인다',
      '「쾅」 하는 순간엔 배율 1 — 충격은 원래 속도로',
      '가장 느린 배율 조절 (0.05 ~ 0.8, 견본 0.15)',
      '아래에 시간 배율 그래프로 곡선 모양을 보여 주기',
    ],
    done: [
      '빨간 블록이 떨어지다 탑에 닿기 직전 확 느려지고, 화면이 푸르게 물들며 잔상이 남는다',
      '닿는 순간 원래 속도로 돌아오며 화면이 흔들리고 「완성!」 이 톡 나온다',
      '아래 그래프에 1 → 0.15 → 1 로 내려갔다 올라오는 곡선이 흐른다',
      '「슬로모션 켜기」 를 끄면 그래프가 평평하고 그냥 떨어진다',
    ],
    code: {
      lang: 'ts',
      title: '남은 시간으로 배율 곡선 · 게임 시간 나누기',
      from: 'demos/demosJuice.ts D204 를 정리',
      body: `const smooth = (e0: number, e1: number, x: number) => { const v = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return v * v * (3 - 2 * v); };
const GC = 1.0;           // 닿는 게임 시각
let minS = 0.15;          // 가장 느릴 때 배율
let gtime = 0;            // 게임 시간 (실제 시간과 따로)

/** 닿기 0.42초 전부터 느려져 0.06초 전에 가장 느림, 닿으면 1 */
function scaleAt(gt: number): number {
  if (!on || gt >= GC) return 1;
  const d = GC - gt;
  return minS + (1 - minS) * smooth(0.06, 0.42, d);
}

function frame(dt: number) {
  const s = scaleAt(gtime);
  gtime += dt * s;                       // 게임 시간만 느려진다
  const a = gtime - GC;                  // 닿은 뒤 시간
  if (a < 0) {
    const y = lerp(y0, landY, Math.min(1, gtime / GC) ** 2);   // 떨어지기 (게임 시간으로)
    drawBlock(y);
    const slow = 1 - s;
    if (slow > 0.05) for (let j = 1; j <= 4; j++) drawGhost(gtime - j * 0.05, 0.13 * (5 - j) * slow); // 잔상
    if (slow > 0.02) { g.fillStyle = 'rgba(80,140,255,' + 0.16 * slow + ')'; g.fillRect(0, 0, w, top); } // 푸른 막
  } else {
    const k = Math.exp(-a * 9) * 4 * u; // 쾅: 원래 속도로 흔들림
    g.translate(noise1(a * 60, 1) * k, noise1(a * 60, 2) * k);
    drawLanded(a);
  }
  // 소리도 같이: source.playbackRate.value = s (견본은 표시만)
}`,
    },
    pitfalls: [
      { title: 'requestAnimationFrame 시간을 그대로 쓰면 느리게 할 수 없다', fix: '게임 시간 변수를 따로 두고 dt × 배율로만 늘린다. 모든 움직임은 그 시간으로.' },
      { title: '충격 순간까지 느리면 「쾅」 이 맥빠진다', fix: '닿는 순간 배율을 1 로 — 느림은 그 직전까지만.' },
      { title: '프레임 시간을 0.05 로 잘라 쓰면 느린 폰에서 의도치 않은 슬로모션이 생긴다', fix: '사이트에서 실제로 겪었다. 연출용 배율과 별개로, 기본 dt 는 실제 시간(0.25초까지)을 쓰고 작은 조각으로 나눠 적분한다.', seen: true },
    ],
    prev: ['i199', 'i200'],
    next: ['i484'],
    refs: [{ name: 'MDN — AudioBufferSourceNode.playbackRate', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate' }],
    source: [{ file: 'demosJuice.ts', symbol: 'D204' }],
  },

  i206: {
    id: 'i206',
    summary: '단추를 그림자 판(아래) · 얼굴(위) 두 겹으로 두고, 누르면 얼굴이 쑥 내려가고 떼는 순간 튕겨 오르며 가로세로로 출렁이는 젤리 단추를 스프링 둘로 만든다.',
    terms: [
      { en: 'Jelly button (squash-and-stretch press)', ko: '누르면 들어가고 떼면 출렁이는 단추' },
      { en: 'Two-layer button (face + base)', ko: '얼굴 · 그림자 판 두 겹 — 누름 깊이가 보임' },
      { en: 'Spring (stiffness · damping)', ko: '단단함 · 감쇠 스프링으로 따라가기' },
    ],
    goal: '{target}을(를) 젤리 단추로 만들어 줘 — 그림자 판 위 얼굴이 누르면 쑥 들어가고 떼면 튕겨 출렁이게, 스프링 둘로. 분위기는 {style}.',
    targets: ['숫자 키패드 (1 · 2 · 3)', '게임의 모든 큰 단추', '고르기 카드'],
    styles: ['말랑한 사탕 색', '통통한 장난감 버튼', '차분한 파스텔'],
    platforms: ['web', 'canvas', 'unity', 'godot'],
    principle: [
      '단추 = 어두운 그림자 판(아래로 3.6 비켜 놓음) + 밝은 얼굴. 얼굴이 내려가면 판이 가려져 「눌렸다」 가 보인다.',
      '깊이 스프링 d: 누르면 목표 3.6, 떼면 0 (단단함 1500 · 감쇠 45 — 빠르고 덜 출렁).',
      '탄성 스프링 e: 누르면 목표 −0.09 (납작), 떼면 0 (단단함 900 · 감쇠 13 — 잘 출렁). 떼는 순간 속도에 +1.6 을 더해 튕겨 오른다.',
      '얼굴 transform = translateY(d) scale(1 − 0.9e, 1 + e), 축은 아래 가운데 — 세로로 눌리면 가로로 퍼진다.',
    ],
    when: ['아이들이 누르는 큰 단추 · 키패드', '누른 느낌이 중요한 게임 화면 단추 (웹 단추처럼 보이면 안 될 때)'],
    avoid: ['작은 아이콘 단추 · 목록 줄 — 출렁임이 산만하다. 대신 색 · 눌림만', '빠르게 연달아 누르는 곳 — 출렁임이 쌓여 흔들린다 (단단함을 높인다)'],
    cost: 'light',
    costNote: '단추마다 스프링 둘 · transform 하나. 합성만 하니 가볍다.',
    level: 1,
    must: [
      '두 겹 (그림자 판 + 얼굴) — 판은 얼굴보다 어두운 같은 색',
      '깊이는 단단한 스프링, 출렁임은 무른 스프링 — 둘을 따로',
      '떼는 순간 탄성 스프링 속도에 튕김(+1.6)을 더한다',
      'transform-origin 은 아래 가운데, 움직임은 transform 만',
      'pointerdown / pointerup / pointerleave + touch-action: none — 실제 손가락으로 눌러 확인',
    ],
    done: [
      '아래 젤리 단추를 누르면 얼굴이 그림자 판 위로 쑥 내려가며 살짝 납작해진다',
      '떼면 위로 톡 튀며 가로세로로 두세 번 출렁이고 멈춘다',
      '위 「끔」 단추는 색만 바뀌어 차이가 바로 보인다',
      '「출렁임 단단함」 을 낮추면 더 말랑하게, 높이면 짧게 출렁인다',
    ],
    code: {
      lang: 'ts',
      title: '깊이 · 탄성 스프링 둘 + 떼는 순간 튕김',
      from: 'demos/demosJuice.ts spring() · D206 의 update 를 정리',
      body: `/** 목표를 따라가는 스프링 — 3조각으로 나눠 적분 */
function spring(s: { x: number; v: number }, target: number, k: number, c: number, dt: number): void {
  const h = dt / 3;
  for (let i = 0; i < 3; i++) { s.v += ((target - s.x) * k - s.v * c) * h; s.x += s.v * h; }
}
// CSS: .face { transform-origin: 50% 100% }  .base { top: 3.6cqmin; bottom: -3.6cqmin; background: 어두운 같은 색 }
const st = keys.map(() => ({ d: { x: 0, v: 0 }, e: { x: 0, v: 0 }, down: false }));
let K = 900; // 출렁임 단단함

function update(dt0: number) {
  const dt = Math.min(dt0, 0.04);
  keys.forEach((_, i) => {
    const s = st[i], down = pressed[i];          // pointerdown / up / leave 로 바뀜
    if (s.down && !down) s.e.v += 1.6;           // 떼는 순간 튀어 오름
    s.down = down;
    spring(s.d, down ? 3.6 : 0, 1500, 45, dt);   // 깊이: 단단하게
    spring(s.e, down ? -0.09 : 0, K, 13, dt);    // 탄성: 무르게 — 출렁임
    const e = s.e.x;
    faces[i].style.transform =
      'translateY(' + s.d.x.toFixed(2) + 'cqmin) scale(' + (1 - e * 0.9).toFixed(4) + ',' + (1 + e).toFixed(4) + ')';
  });
}

el.addEventListener('pointerdown', (e) => { e.preventDefault(); pressed[i] = true; });
el.addEventListener('pointerup', () => (pressed[i] = false));
el.addEventListener('pointerleave', () => (pressed[i] = false));`,
    },
    pitfalls: [
      { title: '스프링 하나로 깊이와 출렁임을 같이 하면 깊이까지 출렁여 흐물거린다', fix: '깊이는 단단한 스프링(1500 · 45), 모양 출렁임은 무른 스프링(900 · 13)으로 나눈다.' },
      { title: 'click 만 들으면 누르는 동안 들어가 있는 모습이 없다', fix: 'pointerdown 에 들어가고 pointerup · pointerleave 에 나오게. 폰에선 touch-action: none.' },
      { title: '합성 이벤트로만 시험하면 실제 손가락에서 안 되는 것을 놓친다', fix: '실제 클릭 · 터치로 눌러 확인한다 (사이트에서 여러 번 오진).', seen: true },
      { title: '웹 단추처럼 보이는 평평한 단추는 게임 화면에서 어색하다', fix: '판이 주인공인 게임 UI 는 두께 · 눌림이 있는 단추로 (사용자 지적).', seen: true },
    ],
    prev: ['i102'],
    next: ['i207', 'i208'],
    source: [{ file: 'demosJuice.ts', symbol: 'D206' }, { file: 'demosJuice.ts', symbol: 'spring' }],
  },
};

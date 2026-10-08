import type { TechDoc } from './types';

/**
 * 기술 문서 B03 — WebGPU(i494 · i495 · i498) · 선 · 글씨 · 복셀 · 나무(u31 · i17 · i241 · i538)
 * · 절차 모델링(i444 ~ i455) · 리깅(i456 ~ i467) · 하드서피스(i468 · i470 · i474)
 * 코드는 견본 파일의 실제 코드에서 발췌 · 정리했다 (from 에 출처).
 */
export const DOCS: Record<string, TechDoc> = {
  i494: {
    id: 'i494',
    summary: '셰이더를 GLSL 글자 대신 TSL 함수 조립으로 짜서, 같은 재질 코드가 WebGPU 와 WebGL2 에서 모두 돌게 한다.',
    terms: [
      { en: 'TSL (Three.js Shading Language)', ko: 'three.js 노드 셰이더 언어 — 자바스크립트 함수로 셰이더를 조립' },
      { en: 'Node material (MeshStandardNodeMaterial)', ko: 'colorNode · emissiveNode · positionNode 를 끼우는 재질' },
      { en: 'WebGPURenderer (three/webgpu)', ko: 'WebGPU 가 없으면 WebGL2 로 자동 대체하는 렌더러' },
      { en: 'uniform() · mx_noise_float()', ko: '바꿀 수 있는 값 · 내장 잡음 함수' },
    ],
    goal: '{target}을(를) TSL 노드 재질로 만들어 줘 — 셰이더 글자 없이 함수 조립으로, WebGPU · WebGL2 둘 다에서. 분위기는 {style}.',
    targets: ['용암 · 홀로그램 · 물결 · 디졸브 재질 넷', '빛나는 마법 물체', '게임 특수 재질'],
    styles: ['어두운 무대 위 빛나는 재질', '귀엽고 밝은', '공상 과학'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Shader Graph 가 같은 노드 조립 방식이다 (URP · HDRP).',
      godot: 'Godot 은 Visual Shader 가 노드 방식, 글자로는 Godot Shading Language.',
    },
    principle: [
      'TSL 에서는 positionLocal · normalView 같은 노드를 .mul() · .add() · mix() 로 이어 붙여 식을 만든다.',
      '재질의 colorNode(색) · emissiveNode(빛) · positionNode(정점 위치) · opacityNode 에 그 식을 끼운다.',
      '렌더러가 노드 그래프를 WebGPU 면 WGSL, WebGL2 면 GLSL 로 번역하므로 같은 코드가 둘 다에서 돈다.',
      '시간처럼 매 프레임 바뀌는 값은 uniform(0) 으로 만들고 T.value 만 바꾼다 (셰이더는 다시 안 만든다).',
      '버리기(discard)는 Fn(() => { Discard(조건); return 색; })() 처럼 함수 노드 안에서.',
    ],
    when: ['WebGPU 로 옮길 장면에서 재질을 새로 짤 때', 'onBeforeCompile 로 GLSL 문자열을 바꾸는 일이 너무 많아 고치기 어려울 때', '같은 효과를 여러 재질에 조합해 붙일 때'],
    avoid: ['이미 WebGLRenderer 로 잘 도는 게임 — 노드 재질은 WebGPURenderer 에서만 돈다. 그대로 두고 onBeforeCompile(u08)을 쓴다'],
    cost: 'medium',
    costNote: '재질 비용은 GLSL 과 같다. 다만 three/webgpu 를 따로 불러와야 하고(번들 커짐), 첫 번역 · 컴파일이 GLSL 보다 조금 길다.',
    level: 2,
    must: [
      "three/webgpu 와 three/tsl 을 함께 불러오고, 재질은 MeshStandardNodeMaterial 같은 Node 재질만 쓴다 (보통 재질은 노드를 못 받는다)",
      'renderer = new WebGPURenderer() 뒤 반드시 await renderer.init() — 안 기다리면 첫 그리기가 실패한다',
      '시간 값은 uniform 하나로 만들고 매 프레임 .value 만 바꾸기 — 노드를 프레임마다 새로 만들지 않는다',
      '반복문 잡음 대신 mx_noise_float 를 두세 번만 — 잡음을 여러 겹 부르면 컴파일이 길어진다',
      'WebGPU 가 없는 기기에서도 WebGL2 로 같은 화면이 나와야 한다 (forceWebGL 로 시험)',
    ],
    done: [
      '용암(흐르는 잡음 줄기 빛) · 홀로그램(가장자리 빛 + 흐르는 줄) · 물결(정점이 출렁) · 디졸브(잡음으로 구멍 + 주황 테두리) 넷이 나란히 보인다',
      '구석에 지금 백엔드(WebGPU / WebGL2)가 표시되고, 「WebGL2 로 강제」해도 모양이 같다',
      '「시간 빠르기」 슬라이더로 넷이 함께 빨라지거나 멈춘다',
      '셰이더 문자열이 코드 어디에도 없다',
    ],
    code: {
      lang: 'ts',
      title: 'TSL 로 용암 · 디졸브 재질 조립하기',
      from: 'demos/demosWebGPU.ts i494 build() 를 정리',
      body: `import * as GPU from 'three/webgpu';
import { Fn, Discard, uniform, positionLocal, mx_noise_float, mix, color, smoothstep, sin, vec3, abs, oneMinus } from 'three/tsl';

const renderer = new GPU.WebGPURenderer({ antialias: true }); // WebGPU 없으면 WebGL2 로
await renderer.init();
const T = uniform(0); // 매 프레임 T.value = 시간

// 용암 — 흐르는 잡음 두 겹, 0 근처를 가는 줄기로
const flow = vec3(0, T.mul(-0.35), T.mul(0.12));
const nl = mx_noise_float(positionLocal.mul(2.2).add(flow))
  .add(mx_noise_float(positionLocal.mul(4.6).sub(flow.mul(1.7))).mul(0.45));
const vein = oneMinus(abs(nl)).pow(6);
const lava = new GPU.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
lava.colorNode = mix(color(0x1a0c07), color(0x3b2218), nl.mul(0.5).add(0.5));
lava.emissiveNode = mix(color(0xff2a00), color(0xffd36a), vein).mul(vein.mul(4.2));

// 디졸브 — 잡음이 문턱보다 낮은 곳은 버리고, 경계만 주황으로 빛나게
const thr = sin(T.mul(0.9)).mul(0.45).add(0.5);
const nd = mx_noise_float(positionLocal.mul(3.2)).mul(0.5).add(0.5);
const dis = new GPU.MeshStandardNodeMaterial({ roughness: 0.32, metalness: 0.35, side: GPU.DoubleSide });
dis.colorNode = Fn(() => {
  Discard(nd.lessThan(thr));
  return color(0x8f74ff);
})();
dis.emissiveNode = color(0xff7a2a).mul(smoothstep(thr.add(0.08), thr, nd).mul(5));

// 프레임마다: T.value += dt; renderer.render(scene, camera);`,
    },
    pitfalls: [
      { title: 'await renderer.init() 을 빼면 첫 프레임이 실패한다', fix: 'WebGPURenderer 는 어댑터를 비동기로 얻는다. init 이 끝난 뒤에 장면을 그린다.' },
      { title: '보통 MeshStandardMaterial 에 colorNode 를 넣으면 아무 일도 안 생긴다', fix: '노드를 받는 것은 MeshStandardNodeMaterial · MeshBasicNodeMaterial 같은 Node 재질뿐이다.' },
      { title: '공용 WebGL 렌더러와 한 페이지에 두면 GPU 메모리가 빠듯하다', fix: '견본은 픽셀 비율을 1.5 까지로 묶고, 카드(작은 화면)에서는 렌더러를 아예 만들지 않는다.' },
      { title: 'TSL 노드의 타입이 너무 복잡해 TypeScript 가 버거워한다', fix: '견본은 TSL 노드를 any 로 다루고, three 0.186 에 실제로 있는 함수만 쓴다.' },
    ],
    prev: ['u08'],
    next: ['i495', 'i498'],
    refs: [
      { name: 'three.js 위키 — Three.js Shading Language', url: 'https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language' },
    ],
  },

  i495: {
    id: 'i495',
    summary: '입자 수십만 개의 위치 · 속도를 계산 셰이더로 GPU 에서 바꿔, CPU 는 명령 두 줄만 보내고도 눈보라 · 불꽃놀이를 띄운다.',
    terms: [
      { en: 'GPU compute particles', ko: '계산 셰이더로 움직이는 입자' },
      { en: 'Compute shader (renderer.compute)', ko: '그리기 없이 계산만 하는 GPU 프로그램' },
      { en: 'instancedArray · instanceIndex (TSL)', ko: 'GPU 에 사는 입자별 배열 · 지금 입자 번호' },
      { en: 'SpriteNodeMaterial', ko: '배열 값을 위치 · 색으로 받는 화면 향한 판' },
    ],
    goal: '{target}을(를) GPU 계산 입자 수십만 개로 만들어 줘 — 위치 · 속도는 계산 셰이더에서, CPU 는 명령만. 분위기는 {style}.',
    targets: ['소용돌이 · 끌어당김 · 불꽃놀이 입자', '눈보라', '마법 별무리'],
    styles: ['어두운 밤하늘에 빛나는', '귀엽고 알록달록', '웅장한 우주'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 VFX Graph (GPU 입자) 또는 ComputeShader + Graphics.DrawMeshInstancedIndirect.',
      godot: 'Godot 은 GPUParticles3D 와 파티클 셰이더(particles 셰이더 종류).',
    },
    principle: [
      '입자마다 위치 · 속도 · 수명 · 색을 instancedArray 로 GPU 메모리에 만든다 (CPU 배열이 없다).',
      '처음 한 번 init 계산으로 자리를 깔고, 매 프레임 update 계산이 instanceIndex 번째 입자의 값을 읽어 고쳐 쓴다.',
      '새 위치 = 위치 + 속도 × dt. 힘(끌림 · 중력 · 공기 저항)은 속도에 더한다.',
      '그리기는 Sprite 하나에 count = N, 재질 positionNode = pos.toAttribute() 로 — 그리기 호출 한 번.',
      '모드 · 시간 · 끄는 점 같은 바뀌는 값은 모두 uniform 으로 넘긴다.',
    ],
    when: ['입자가 수만 개 이상이라 CPU 로 매 프레임 옮기기 힘들 때', '불꽃놀이 · 은하 · 눈보라처럼 숫자가 곧 볼거리일 때'],
    avoid: ['입자가 수천 개 이하 — 보통 Points 입자 방출기(i170)에 CPU 갱신이 더 간단하다', 'WebGPU 가 없는 기기가 많은 곳 — WebGL2 대체에선 계산 셰이더가 없어 개수를 크게 줄여야 한다'],
    cost: 'heavy',
    costNote: 'CPU 는 거의 0 이지만 GPU 는 입자 수만큼 계산 + 겹쳐 그리기(더하기 섞기)를 한다. 견본은 WebGPU 50만 개, WebGL2 대체는 8만 개까지.',
    level: 3,
    must: [
      'three/webgpu WebGPURenderer + three/tsl — 위치 · 속도는 instancedArray, 계산은 Fn(...)().compute(N)',
      'CPU 쪽 입자 배열을 만들지 않는다 — 매 프레임 할 일은 uniform 값 바꾸기와 renderer.compute(update) 뿐',
      '입자 수를 바꿀 땐 슬라이더를 멈춘 뒤(0.25초) 한 번만 다시 만든다 — 끄는 동안 매번 만들면 멈춘다',
      'Sprite.frustumCulled = false (위치가 GPU 에만 있어 경계 상자가 틀린다)',
      '입자가 많을수록 투명도를 낮춰(견본: 0.7 × (6만/N)^0.6) 겹쳐도 하얗게 타지 않게',
    ],
    done: [
      '25만 개 입자가 끊김 없이 돌고, 화면 구석에 입자 수와 백엔드(WebGPU / WebGL2)가 보인다',
      '「소용돌이 · 끌어당김 · 불꽃놀이」 단추로 같은 입자가 다른 움직임으로 바로 바뀐다',
      '「입자 수」를 2만 ~ 50만으로 바꿔도 CPU 시간은 거의 그대로다',
      'WebGL2 로 강제하면 개수가 8만 개로 줄었다는 안내가 나온다',
    ],
    code: {
      lang: 'ts',
      title: '입자 배열 + 계산 셰이더 + 스프라이트 하나로 그리기 (끌어당김 모드)',
      from: 'demos/demosWebGPU.ts i495 build() 를 줄여 정리',
      body: `import * as GPU from 'three/webgpu';
import { Fn, instancedArray, instanceIndex, hash, uniform, vec3, float, dot, cos, smoothstep, uv } from 'three/tsl';

const N = 250000;
const uDt = uniform(0.016);
const A = uniform(new GPU.Vector3()); // 끌어당기는 점
const pos = instancedArray(N, 'vec3');
const vel = instancedArray(N, 'vec3');

const init = Fn(() => {
  const a = hash(instanceIndex).mul(Math.PI * 2);
  const r = hash(instanceIndex.add(7919)).sqrt().mul(6.3).add(0.35);
  pos.element(instanceIndex).assign(vec3(cos(a).mul(r), 0, a.sin().mul(r)));
})().compute(N);

const update = Fn(() => {
  const p = pos.element(instanceIndex).toVar();
  const v = vel.element(instanceIndex).toVar();
  const d = A.sub(p);
  const r2 = dot(d, d).add(0.3);
  v.addAssign(d.mul(float(2.4).div(r2.mul(r2.sqrt()))).mul(uDt).mul(4)); // 1/r² 끌림
  v.mulAssign(float(1).sub(uDt.mul(0.3))); // 공기 저항
  p.addAssign(v.mul(uDt));
  pos.element(instanceIndex).assign(p);
  vel.element(instanceIndex).assign(v);
})().compute(N);

const mat = new GPU.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: GPU.AdditiveBlending });
mat.positionNode = pos.toAttribute();
mat.opacityNode = smoothstep(0.5, 0.0, uv().sub(0.5).length()).mul(0.5);
mat.scaleNode = uniform(0.04);
const sprite = new GPU.Sprite(mat);
sprite.count = N;
sprite.frustumCulled = false;
scene.add(sprite);
renderer.compute(init);

// 매 프레임: uDt.value = dt; A.value.set(...); renderer.compute(update); renderer.render(scene, cam);`,
    },
    pitfalls: [
      { title: 'frustumCulled 를 켜 두면 입자가 통째로 사라진다', fix: '위치가 GPU 배열에만 있어 three 가 경계 상자를 모른다. Sprite.frustumCulled = false.' },
      { title: '입자 수 슬라이더를 끄는 동안 매번 다시 만들면 화면이 멈춘다', fix: '마지막으로 바꾼 지 0.25초가 지난 뒤에 한 번만 build(N) 한다. 옛 계산 · 재질은 dispose.' },
      { title: '입자를 늘리면 더하기 섞기로 화면이 하얗게 탄다', fix: '입자 수에 맞춰 투명도(uAlpha)를 낮춘다. 견본은 0.7 × min(1, (60000/N)^0.6).' },
      { title: 'WebGL2 대체에서 50만 개를 그대로 두면 느려진다', fix: 'WebGL2 는 계산 셰이더 대신 변환 피드백이라 견본은 최대 8만 개로 묶었다.' },
    ],
    prev: ['i494', 'i170'],
    next: ['i498'],
    refs: [
      { name: 'three.js 예제 — webgpu_compute_particles', url: 'https://threejs.org/examples/#webgpu_compute_particles' },
    ],
  },

  u31: {
    id: 'u31',
    summary: '모서리를 뽑아 보이는 선은 실선, 가려진 선은 점선, 강조할 선은 굵은 선으로 그려 교과서 입체 그림처럼 보이게 한다.',
    terms: [
      { en: 'Hidden line rendering (EdgesGeometry)', ko: '보이는 선 · 숨은 선 그리기' },
      { en: 'LineDashedMaterial + depthFunc GreaterDepth', ko: '가려진 곳에서만 그려지는 점선' },
      { en: 'LineSegments2 + LineMaterial (fat lines)', ko: '픽셀 굵기를 정할 수 있는 굵은 선' },
      { en: 'polygonOffset', ko: '면을 살짝 뒤로 밀어 선이 면에 묻히지 않게' },
    ],
    goal: '{target}의 모서리를 보이는 선은 실선, 숨은 선은 점선, 강조는 굵은 선으로 그려 줘. 분위기는 {style}.',
    targets: ['직육면체 · 사각뿔 · 삼각기둥', '쌓기나무 덩어리', '전개도 · 지오보드 도형'],
    styles: ['교과서 입체 그림', '밝은 파스텔', '설계 도면'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 모서리 메시를 MeshTopology.Lines 로 그리고, 숨은 선은 ZTest Greater 패스로.',
      godot: 'Godot 은 ImmediateMesh / ArrayMesh 의 PRIMITIVE_LINES, 숨은 선은 depth_test 를 바꾼 두 번째 재질로.',
    },
    principle: [
      'EdgesGeometry 는 면 사이 각이 큰 모서리만 뽑아 선분 목록을 만든다 (삼각형 대각선은 빠진다).',
      '같은 선분을 두 번 그린다: 실선은 보통 깊이 검사, 점선은 depthFunc = GreaterDepth 로 「면 뒤에 있을 때만」.',
      '점선은 computeLineDistances() 로 선 길이를 재야 dashSize · gapSize 가 먹는다.',
      '보통 선은 1픽셀로 고정이라, 굵은 선은 LineSegments2 + LineMaterial(linewidth 픽셀) 로 판을 만들어 그린다.',
      '면 재질에 polygonOffset 을 주어 면을 살짝 뒤로 밀면 선이 면에 묻혀 깜빡이지 않는다.',
    ],
    when: ['입체도형 · 쌓기나무처럼 「안 보이는 모서리」를 알려 줘야 하는 수학 화면', '설계도 · 도면처럼 선이 주인공인 그림'],
    avoid: ['곡면이 많은 모양(구 · 캐릭터) — 모서리가 거의 안 나오거나 지저분하다. 대신 외곽선(u02)'],
    cost: 'light',
    costNote: '선분 수십 ~ 수백 개라 가볍다. 굵은 선(LineSegments2)은 선분마다 판 하나라 수천 개를 넘기면 늘어난다.',
    level: 1,
    must: [
      '모서리는 EdgesGeometry 로 뽑고 실선 · 점선 · 굵은 선이 같은 모서리를 함께 쓴다',
      '점선은 depthFunc: THREE.GreaterDepth + computeLineDistances() — 둘 중 하나라도 빠지면 점선이 안 보인다',
      '면 재질에 polygonOffset: true, polygonOffsetFactor 1, polygonOffsetUnits 1',
      'LineMaterial.resolution 을 매 그리기마다 화면 크기로 맞춘다 (안 맞추면 굵기가 틀어진다)',
      'renderOrder 로 점선(2) · 굵은 선(3)을 면보다 뒤에 그린다',
    ],
    done: [
      '도형이 돌 때 앞 모서리는 진한 실선, 뒤로 숨은 모서리는 옅은 점선으로 바뀌어 보인다',
      '「면만 → 보이는 선 → + 숨은 선 → + 굵은 선」 4단계가 저절로 넘어가거나 슬라이더로 고를 수 있다',
      '「굵은 선 굵기」 1 ~ 10px 슬라이더로 화면 두께가 바로 바뀌고, 멀어져도 픽셀 두께는 같다',
      '선이 면 위에서 깜빡이지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '한 모서리로 실선 · 숨은 점선 · 굵은 선 셋',
      from: 'demos/demosStructure.ts u31 make() 를 정리',
      body: `import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

const faceMat = new THREE.MeshStandardMaterial({
  color: 0xcfe6ff, roughness: 0.7,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, // 면을 살짝 뒤로
});
const thin = new THREE.LineBasicMaterial({ color: 0x1d2a55 });
const dash = new THREE.LineDashedMaterial({
  color: 0x5a6aa0, dashSize: 0.07, gapSize: 0.06,
  depthFunc: THREE.GreaterDepth, // 면 뒤에 있을 때만 = 숨은 선
  transparent: true, opacity: 0.9,
});
const fat = new LineMaterial({ color: 0x1d2a55, linewidth: 3.5, worldUnits: false }); // 픽셀 굵기

const geo = new THREE.BoxGeometry(1.5, 1.1, 1.1);
const edges = new THREE.EdgesGeometry(geo);
const g = new THREE.Group();
const thinL = new THREE.LineSegments(edges, thin);
const dashL = new THREE.LineSegments(edges, dash);
dashL.computeLineDistances(); // 이게 없으면 점선이 실선으로
dashL.renderOrder = 2;
const fatL = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(edges), fat);
fatL.renderOrder = 3;
g.add(new THREE.Mesh(geo, faceMat), thinL, dashL, fatL);
scene.add(g);

// 그릴 때마다: fat.resolution.set(width, height); renderer.render(scene, camera);`,
    },
    pitfalls: [
      { title: 'computeLineDistances 를 빼면 점선이 실선으로 그려진다', fix: '점선 재질은 선 길이 속성(lineDistance)이 있어야 한다. LineSegments 를 만든 뒤 꼭 부른다.' },
      { title: 'LineBasicMaterial 의 linewidth 를 키워도 굵어지지 않는다', fix: 'WebGL 은 선 굵기를 1로 고정한다. 굵은 선은 LineSegments2 + LineMaterial 로.' },
      { title: 'LineMaterial.resolution 을 안 맞추면 굵기가 이상하다', fix: '창 크기가 바뀔 때마다(견본은 매 그리기마다) resolution.set(w, h).' },
      { title: '면과 선이 같은 깊이라 깜빡인다', fix: '면 재질에 polygonOffset 을 줘 면을 살짝 뒤로 민다.' },
    ],
    prev: ['u14'],
    next: ['i35', 'u02'],
    refs: [
      { name: 'three.js 예제 — webgl_lines_fat', url: 'https://threejs.org/examples/#webgl_lines_fat' },
      { name: 'three.js 문서 — EdgesGeometry', url: 'https://threejs.org/docs/#api/en/geometries/EdgesGeometry' },
    ],
  },

  i241: {
    id: 'i241',
    summary: '블록 세계에서 보이는 면만 골라 같은 색 · 같은 그늘끼리 큰 네모로 합치고 꼭짓점 구석 그늘을 넣어, 한 메시로 가볍게 그린다.',
    terms: [
      { en: 'Greedy meshing (voxel)', ko: '이웃한 같은 면을 큰 네모로 합치기' },
      { en: 'Face culling (hidden face removal)', ko: '옆이 막힌 면은 안 만들기' },
      { en: 'Voxel ambient occlusion (per-vertex)', ko: '꼭짓점마다 이웃 블록 수로 구석 그늘' },
      { en: 'BufferGeometry + vertexColors', ko: '정점 색으로 색 · 그늘을 한 번에' },
    ],
    goal: '{target}을(를) 한 메시로 만들어 줘 — 보이는 면만, 같은 면끼리 큰 네모로 합치고, 꼭짓점 구석 그늘까지. 분위기는 {style}.',
    targets: ['잡음 지형 블록 섬 (나무 포함)', '쌓기나무 큰 판', '블록 건물'],
    styles: ['밝은 낮 하늘', '귀여운 장난감 블록', '어두운 동굴'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Mesh 에 정점 · 색 · 삼각형을 직접 넣어 같은 알고리즘으로 (Mesh.SetVertices · SetColors · SetTriangles).',
      godot: 'Godot 은 SurfaceTool 이나 ArrayMesh 로 같은 알고리즘.',
    },
    principle: [
      '블록마다 상자를 그리면 붙어서 안 보이는 면까지 그린다. 옆 칸이 비어 있는 면만 만든다.',
      '세 축(x · y · z) × 앞뒤 두 방향마다 한 장씩 「면 지도(mask)」를 만들고, 같은 열쇠(색 + 그늘)끼리 가로로 늘린 뒤 세로로 늘려 큰 네모 하나로 합친다.',
      '꼭짓점 그늘: 면 앞쪽의 옆 둘 + 대각 하나를 보고, 옆 둘이 다 막히면 0, 아니면 3 − (막힌 수). 밝기는 [0.42, 0.62, 0.82, 1].',
      '그늘 값이 다른 면은 열쇠가 달라 합쳐지지 않으므로 그늘이 뭉개지지 않는다.',
      '네모를 삼각형 둘로 나눌 때 그늘 합이 작은 대각선 쪽으로 나눠야 그늘 무늬가 비뚤어지지 않는다.',
    ],
    when: ['쌓기나무 · 블록 섬처럼 칸이 수천 개인 판', '판이 바뀔 때마다 다시 지어도 빨라야 할 때'],
    avoid: ['블록이 수십 개뿐 — 그냥 InstancedMesh(u36) 가 간단하다', '블록마다 따로 움직이는 판 — 합친 메시는 통째로만 움직인다'],
    cost: 'light',
    costNote: '그리기 1번, 면 수가 몇 배 줄어든다(견본은 화면에 「보이는 면 → 덩어리 몇 배 적게」 표시). 22×12×22 판은 다시 짓기가 몇 ms.',
    level: 2,
    must: [
      '옆 칸이 막힌 면은 만들지 않는다 (판 밖은 빈칸으로 본다)',
      '합치는 열쇠 = 색 번호 + 네 꼭짓점 그늘 — 그늘이 다르면 합치지 않는다',
      '구석 그늘은 정점 색에 곱한다 (후처리 GTAO 쓰지 않기)',
      '네모를 나눌 대각선은 그늘 합으로 고른다 (ao0+ao2 < ao1+ao3 이면 뒤집기)',
      '합치기 · 그늘 켬/끔 단추와 면 테두리 선 보기로 차이를 보여 준다',
    ],
    done: [
      '테두리 선을 켜면 같은 색 면이 큰 네모로 묶여 있는 게 보인다',
      '「덩어리 합치기」를 끄면 한 칸 한 칸 네모로 바뀌고, 화면 숫자가 몇 배 차이를 보여 준다',
      '「구석 그늘」을 켜면 블록이 맞닿은 안쪽 구석이 어두워진다',
      '지형이 흘러가며 매초 다시 지어져도 끊김이 없다',
    ],
    code: {
      lang: 'ts',
      title: '면 지도를 큰 네모로 합치는 부분 (greedy)',
      from: 'demos/demosLook2.ts makeVoxel() mesher 를 정리',
      body: `const AO_CURVE = [0.42, 0.62, 0.82, 1]; // 막힌 정도 0~3 → 밝기

// mask: 이 장(축 d, 방향 side)의 du × dv 칸. 0 = 면 없음, 아니면 1 + 색*256 + 그늘 8비트
let n = 0;
for (let j = 0; j < dv; j++)
  for (let i = 0; i < du; ) {
    const k = mask[n]!;
    if (!k) { i++; n++; continue; }
    let w = 1, h = 1;
    while (i + w < du && mask[n + w] === k) w++;           // 가로로 늘리기
    outer: for (; j + h < dv; h++)                          // 세로로 늘리기 (한 줄 통째로 같아야)
      for (let kk = 0; kk < w; kk++) if (mask[n + kk + h * du] !== k) break outer;

    const ao = (k - 1) & 255;
    const aov = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
    // 네 꼭짓점 (i,j) (i+w,j) (i+w,j+h) (i,j+h) 을 넣고, 색 × AO_CURVE[aov[c]] 를 정점 색으로
    pushQuad(i, j, w, h, ((k - 1) >> 8) & 255, aov);
    const flip = aov[0]! + aov[2]! < aov[1]! + aov[3]!;      // 그늘이 고르게 보이는 대각선
    const tri = flip ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
    if (side < 0) tri.reverse();
    pushTris(tri);

    for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) mask[n + ii + jj * du] = 0; // 쓴 칸 지우기
    i += w; n += w;
  }

// 꼭짓점 그늘: s1 · s2 = 옆 두 칸, c = 대각 칸 (막혔으면 1)
const corner = (s1: number, s2: number, c: number) => (s1 && s2 ? 0 : 3 - (s1 + s2 + c));`,
    },
    pitfalls: [
      { title: '그늘을 열쇠에 안 넣고 합치면 구석 그늘이 큰 네모 전체로 번진다', fix: '색 번호와 네 꼭짓점 그늘을 함께 열쇠로 써서, 그늘이 같은 면끼리만 합친다.' },
      { title: '대각선을 늘 같은 쪽으로 나누면 그늘이 비스듬히 얼룩진다', fix: '그늘 합(ao0+ao2 와 ao1+ao3)을 비교해 나눌 대각선을 고른다.' },
      { title: '뒤쪽 면의 삼각형 순서를 안 뒤집으면 면이 안 보인다', fix: 'side < 0 이면 삼각형 꼭짓점 순서를 뒤집어 바깥을 보게 한다.' },
    ],
    prev: ['u36', 'i17'],
    next: ['i453'],
    refs: [
      { name: '0 FPS — Meshing in a Minecraft Game', url: 'https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/' },
      { name: '0 FPS — Ambient occlusion for Minecraft-like worlds', url: 'https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/' },
    ],
  },

  i538: {
    id: 'i538',
    summary: '잎 카드의 법선을 덩이를 감싸는 구의 법선으로 바꾸고 줄기 · 가지 · 잎을 다른 빠르기로 흔들어, 동화풍 뭉게 나무를 만든다.',
    terms: [
      { en: 'Spherical normals for foliage (normal transfer)', ko: '잎 카드 법선을 감싸는 구 법선으로 바꾸기' },
      { en: 'Alpha-tested leaf cards', ko: '잎 그림 판 (alphaTest 로 오려 내기)' },
      { en: 'Hierarchical wind (trunk · branch · flutter)', ko: '줄기 휨 · 가지 흔들림 · 잎 떨림을 층별로' },
      { en: 'onBeforeCompile vertex sway', ko: '표준 재질에 바람 정점 식 끼워 넣기' },
    ],
    goal: '{target}을(를) 동화풍 뭉게 나무로 만들어 줘 — 잎 카드 법선은 덩이 구 법선으로, 바람은 줄기 · 가지 · 잎이 다른 빠르기로. 분위기는 {style}.',
    targets: ['줄기 + 가지 여섯 + 잎 덩이 여덟 나무', '정원 덤불', '숲 배경 나무 여러 그루'],
    styles: ['파스텔 동화', '포근한 늦여름', '그림책 수채화'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 DCC 에서 잎 법선을 구로 옮기거나(Normal transfer) 셰이더에서 덩이 중심 기준 법선, 바람은 SpeedTree 식 정점 셰이더.',
      godot: 'Godot 은 잎 메시 NORMAL 을 덩이 중심 방향으로 넣고, 바람은 vertex() 함수에서.',
    },
    principle: [
      '잎 카드는 저마다 아무 방향을 보고 있어서, 카드 법선 그대로면 빛이 조각조각 얼룩진다.',
      '정점마다 법선을 「덩이 중심 → 그 정점」 방향(구 법선)으로 바꾸면 덩이 전체가 공 하나처럼 매끈하게 빛을 받는다.',
      '덩이 안쪽 카드일수록 정점 색을 어둡게(0.62 → 1) 해 덩이 속 그늘을 흉내 낸다.',
      '바람: 줄기는 높이² 비례로 천천히 휘고, 가지는 덩이마다 위상을 달리해 흔들리고, 잎은 법선 방향으로 빠르게(×11) 떨린다.',
      '양면 잎은 뒷면에서 법선을 뒤집지 않게 고쳐야 구 법선이 그대로 산다.',
    ],
    when: ['동화 · 지브리풍 숲 · 정원처럼 나무가 덩어리로 보여야 할 때', '잎을 수천 장 그려도 한 덩이로 정돈돼 보이고 싶을 때'],
    avoid: ['사실적인 나무 — 대신 가지가 자라는 나무(i444) · L-시스템(i445) 에 카드 법선 그대로', '아주 먼 배경 — 카드 대신 구 몇 개나 그림 판이 싸다'],
    cost: 'light',
    costNote: '나무 하나 = 줄기 메시 1 + 잎 카드 320장 메시 1 (그림자 포함 그리기 몇 번). 바람은 정점 셰이더 식 몇 줄.',
    level: 1,
    must: [
      '잎 카드 정점 법선 = normalize(정점 위치 − 덩이 중심) — 카드 면 법선을 쓰지 않는다',
      '양면 잎(DoubleSide)은 fragment 의 normal_fragment_begin 을 바꿔 뒷면에서 법선을 뒤집지 않기',
      '그림자용 customDepthMaterial 에도 같은 alphaTest · 바람 식을 넣는다 (안 넣으면 그림자가 네모 · 안 흔들림)',
      '줄기 · 가지 · 잎 떨림은 서로 다른 빠르기와 크기로 (줄기 ×1.1, 가지 ×2.3 ~ 3.1, 잎 ×11)',
      '바뀐 셰이더는 customProgramCacheKey 로 구분한다',
    ],
    done: [
      '같은 나무 둘을 나란히 — 왼쪽(카드 법선)은 잎이 조각조각 얼룩지고, 오른쪽(구 법선)은 덩이가 공처럼 매끈하게 밝고 어둡다',
      '바람에 줄기가 천천히 휘고, 가지 덩이가 저마다 흔들리고, 잎 끝이 잘게 떨린다',
      '땅에 잎 모양 그림자가 바람과 함께 흔들린다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '구 법선 잎 카드 + 층별 바람 정점 식',
      from: 'demos/demosPlanet.ts makeFluffy() buildTree · windPatch 를 정리',
      body: `// 잎 카드 정점: 법선 = 덩이 중심에서 바깥쪽 (구 법선), 색 = 안쪽일수록 어둡게
const ns = v.clone().sub(cl.c).normalize();
norS.set([ns.x, ns.y, ns.z], o);
const shade = 0.62 + 0.38 * smooth(0.1, 0.9, inner); // inner = 중심에서 거리 / 덩이 반지름
aBranch.set([cl.c.x, cl.c.y, cl.c.z, cl.ph], (qi * 4 + c) * 4); // 덩이 중심 + 위상

// 바람 — 줄기(높이²) · 가지(덩이 위상) · 잎 떨림(법선 방향, 빠르게)
leafMat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, { uT, uWind });
  sh.vertexShader = 'uniform float uT; uniform float uWind; attribute vec4 aBranch; attribute float aH;\\n' +
    sh.vertexShader.replace('#include <begin_vertex>', \`#include <begin_vertex>
    float gust = 0.6 + 0.4 * sin(uT * 0.37) * sin(uT * 0.21 + 1.3);
    vec3 sway = vec3(sin(uT * 1.1) * 0.9 + 0.35, 0.0, sin(uT * 0.83 + 1.0) * 0.4) * aH * aH * 0.22 * uWind * gust;
    float bw = aBranch.w;
    vec3 branch = vec3(sin(uT * 2.3 + bw * 6.28), sin(uT * 3.1 + bw * 4.0) * 0.4, cos(uT * 1.9 + bw * 6.28)) * 0.07 * uWind * gust;
    vec3 flutter = normal * sin(uT * 11.0 + bw * 40.0 + position.x * 7.0 + position.y * 5.0) * 0.035 * uWind;
    transformed += sway + branch + flutter;\`);
  // 양면 잎: 뒷면에서 법선을 뒤집지 않는다 — 구 법선 그대로
  sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
    'float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;\\nvec3 normal = normalize( vNormal );\\nvec3 nonPerturbedNormal = normal;');
};
leafMat.customProgramCacheKey = () => 'wind-sphere';`,
    },
    pitfalls: [
      { title: '양면 잎의 뒷면에서 법선이 뒤집혀 덩이 반쪽이 시커멓다', fix: 'normal_fragment_begin 을 바꿔 faceDirection 을 곱하지 않는다 — 구 법선을 그대로 받는다.' },
      { title: '그림자용 깊이 재질을 안 바꾸면 그림자가 네모 판이고 안 흔들린다', fix: 'MeshDepthMaterial 에 같은 잎 그림 · alphaTest 0.45 · 바람 식을 넣고 customDepthMaterial 로.' },
      { title: '모든 층을 같은 빠르기로 흔들면 나무 전체가 고무처럼 출렁인다', fix: '줄기는 느리고 크게, 가지는 덩이마다 위상을 달리, 잎은 빠르고 작게 — 세 층을 다르게.' },
    ],
    prev: ['i13', 'u08'],
    next: ['i455', 'i444'],
  },

  i444: {
    id: 'i444',
    summary: '잎이 될 점 구름을 뿌려 두고 가장 가까운 가지 끝을 그 점 쪽으로 한 마디씩 뻗게 해, 자연스럽게 갈라지는 나무를 키운다.',
    terms: [
      { en: 'Space colonization algorithm (tree growth)', ko: '공간 군체화 — 끌어당기는 점을 향해 가지가 자람' },
      { en: 'Attraction points · kill distance', ko: '끌어당기는 점 · 닿으면 지워지는 거리' },
      { en: "Da Vinci's rule (pipe model, r^n = Σ r_i^n)", ko: '부모 굵기ⁿ = 자식 굵기ⁿ 의 합' },
      { en: 'TubeGeometry along branch chains', ko: '가지 사슬을 따라 관으로 감싸기' },
    ],
    goal: '{target}을(를) 공간 군체화로 키워 줘 — 잎 점 구름을 향해 가지가 뻗고, 굵기는 다빈치 규칙으로. 분위기는 {style}.',
    targets: ['섬 위 사과나무 한 그루', '숲 배경 나무 여러 그루', '덤불 · 산호'],
    styles: ['그림책 동화', '사실적인 숲', '귀여운 장난감'],
    platforms: ['three', 'web', 'unity', 'godot'],
    principle: [
      '수관 모양(구 몇 개를 겹친 덩이) 안에 잎이 될 점을 수백 개(견본 650개) 뿌린다.',
      '점마다 영향 거리(0.55) 안에서 가장 가까운 가지 마디를 찾고, 마디마다 「자기를 고른 점들 쪽 방향」을 모두 더한다.',
      '그 방향(+ 조금 위로, + 작은 흔들림)으로 한 마디(0.085) 새로 자란다. 가지가 점에 0.13 안으로 닿으면 그 점은 지운다.',
      '점이 다 먹히거나 더 자랄 곳이 없으면 멈춘다 — 점이 갈리는 곳에서 가지도 저절로 갈라진다.',
      '굵기는 끝에서부터 거꾸로: 부모 굵기 = (자식 굵기ⁿ 의 합)^(1/n), 견본 n = 2.5.',
    ],
    when: ['같은 규칙으로 모양이 조금씩 다른 나무 여러 그루가 필요할 때', '수관 모양(둥근 · 납작 · 원뿔)을 정해 두고 그 안을 가지로 채우고 싶을 때', '나무가 자라는 장면을 보여 줄 때'],
    avoid: ['고사리 · 산호처럼 규칙이 뚜렷한 모양 — 대신 L-시스템(i445)', '동화풍 뭉게 덩이가 주인공일 때 — 대신 뭉게 나무(i538)'],
    cost: 'medium',
    costNote: '키우기는 한 번(수십 ms), 격자(칸 0.55)로 가까운 마디만 찾는다. 성장 단계 16장의 관 모양을 미리 지어 두어 보기는 가볍다.',
    level: 2,
    must: [
      '가까운 마디 찾기는 격자(해시 칸)로 — 모든 점 × 모든 마디를 비교하면 느려진다',
      '새 마디가 기존 마디와 너무 가까우면(0.4 마디 길이 안) 만들지 않는다 (같은 자리 겹침 막기)',
      '굵기는 끝에서 줄기 쪽으로 다빈치 규칙, 가장 가는 끝은 최소 굵기(0.013)',
      '가지 사슬은 굵은 자식으로 이어 가고 나머지 자식은 새 사슬로 — 사슬마다 관 하나',
      '씨앗(seed)이 같으면 같은 나무가 나오게 무작위는 씨앗 난수로',
    ],
    done: [
      '노란 빛 점(잎 점)을 향해 가지가 뻗어 자라고, 닿은 점은 사라진다',
      '줄기는 굵고 끝으로 갈수록 가늘어지며, 갈라지는 곳의 굵기가 자연스럽다',
      '「잎 점 수」 200 ~ 1500 · 「다빈치 굵기 지수 n」 2 ~ 3.5 슬라이더로 가지 수 · 굵기가 바뀐다',
      '씨앗을 바꾸면 같은 규칙의 다른 나무가 나온다',
    ],
    code: {
      lang: 'ts',
      title: '한 성장 단계 + 다빈치 굵기',
      from: 'demos/demosModelA.ts colonize() · treeChains() 를 정리',
      body: `const DI = 0.55, DK = 0.13, D = 0.085; // 영향 거리 · 지우는 거리 · 마디 길이

// 1) 점마다 가장 가까운 마디를 골라, 그 마디에 「점 쪽 방향」을 더한다
sum.clear();
for (let a = 0; a < na; a++) {
  if (!alive[a]) continue;
  let best = -1, bd = DI * DI;
  near(nodeGrid, ax[a * 3], ax[a * 3 + 1], ax[a * 3 + 2], (i) => {
    const d = (t.x[i] - ax[a * 3]) ** 2 + (t.y[i] - ax[a * 3 + 1]) ** 2 + (t.z[i] - ax[a * 3 + 2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  if (best < 0) continue;
  const l = Math.sqrt(bd) || 1;
  const s = sum.get(best) ?? [0, 0, 0];
  s[0] += (ax[a * 3] - t.x[best]) / l; s[1] += (ax[a * 3 + 1] - t.y[best]) / l; s[2] += (ax[a * 3 + 2] - t.z[best]) / l;
  sum.set(best, s);
}
// 2) 그 방향(+ 살짝 위로 · 작은 흔들림)으로 한 마디 자란다
for (const [i, s] of sum) {
  let dx = s[0] + (rnd() - 0.5) * 0.15, dy = s[1] + 0.12 * Math.hypot(s[0], s[1], s[2]), dz = s[2] + (rnd() - 0.5) * 0.15;
  const l = Math.hypot(dx, dy, dz) || 1;
  addNode(t.x[i] + (dx / l) * D, t.y[i] + (dy / l) * D, t.z[i] + (dz / l) * D, i); // 너무 가까운 마디가 있으면 건너뜀
}
// 3) 새 마디에 DK 안으로 닿은 점은 지운다 (alive[a] = 0)

// 굵기: 끝에서 거꾸로 — 부모ⁿ = Σ 자식ⁿ
for (let i = n - 1; i >= 0; i--) {
  let s = 0;
  for (const c of t.kids[i]) s += Math.pow(r[c], nexp);
  r[i] = Math.max(r0, s > 0 ? Math.pow(s, 1 / nexp) : r0);
}`,
    },
    pitfalls: [
      { title: '모든 점과 모든 마디를 비교하면 자랄수록 느려진다', fix: '공간을 영향 거리 크기 칸으로 나눈 해시 격자에 마디 · 점을 넣고 이웃 27칸만 본다.' },
      { title: '두 점이 마디 하나를 반대쪽으로 당기면 가지가 제자리에서 맴돈다', fix: '같은 자리에 이미 마디가 있으면(0.4 × 마디 길이 안) 새로 만들지 않고, 방향에 작은 흔들림을 더한다.' },
      { title: '굵기를 높이로만 정하면 갈라지는 곳이 뚝 끊겨 보인다', fix: '다빈치 규칙으로 끝에서부터 쌓아 올린다. n 이 2 ~ 3 사이면 자연스럽다.' },
    ],
    prev: ['i445'],
    next: ['i538', 'i455'],
    refs: [
      { name: 'Runions 외 — Modeling Trees with a Space Colonization Algorithm (2007)', url: 'http://algorithmicbotany.org/papers/colonization.egwnp2007.html' },
    ],
  },

  i445: {
    id: 'i445',
    summary: 'A → F[&A]/[&A]/[&A] 같은 바꿔 쓰기 규칙을 되풀이해 글자열을 만들고, 거북이가 그 글자대로 걸어 나무 · 고사리 · 산호를 그린다.',
    terms: [
      { en: 'L-system (Lindenmayer system)', ko: '규칙으로 글자열을 되풀이해 바꿔 쓰는 식물 문법' },
      { en: 'Stochastic L-system', ko: '규칙을 확률로 골라 그루마다 다르게' },
      { en: '3D turtle graphics (F + - & ^ / [ ])', ko: '앞으로 · 돌기 · 숙이기 · 비틀기 · 가지 저장/되돌림' },
      { en: 'Tropism', ko: '가지가 위(빛)나 아래(무게)로 휘는 성질' },
    ],
    goal: '{target}을(를) L-시스템으로 그려 줘 — 규칙을 되풀이할 때마다 가지가 갈라지고, 거북이가 글자대로 3D 로 걷게. 분위기는 {style}.',
    targets: ['나무 · 고사리 · 산호 세 가지', '덤불 · 풀', '꽃 피는 덩굴'],
    styles: ['그림책 동화', '바닷속', '수학 실험실'],
    platforms: ['three', 'web', 'unity', 'godot'],
    principle: [
      '처음 글자(공리, 예: FA)에 규칙(A → F[&A]/[&A]/[&A])을 한 번 적용할 때마다 A 가 가지 세 개로 바뀐다.',
      '규칙이 둘 이상이면 확률(0.72 · 0.28)로 고른다 — 같은 규칙이라도 그루마다 다르다.',
      '거북이가 글자를 읽는다: F 앞으로 한 마디, + − 옆으로 돌기, & ^ 숙이기, / 비틀기, [ 지금 상태 저장, ] 되돌리기.',
      '깊이가 깊을수록 마디를 짧게(× decay 0.84), 굴성(trop)으로 가지를 위 · 아래로 살짝 휜다.',
      '거북이 자취를 마디 나무로 모아 굵기를 다빈치 규칙으로 정하고 관을 씌우며, 잎 글자 자리에 잎 카드를 놓는다.',
    ],
    when: ['같은 「종류」의 식물을 많이 만들 때 — 규칙 한 줄이 종 하나', '되풀이 단계(0 ~ 5)를 올리며 자라는 모습을 보여 줄 때', '고사리처럼 자기 닮음이 뚜렷한 모양'],
    avoid: ['정해진 수관 모양을 꽉 채워야 할 때 — 대신 공간 군체화(i444)', '되풀이를 6번 넘게 — 글자 수가 기하급수로 늘어난다'],
    cost: 'medium',
    costNote: '가지 셋 규칙은 단계마다 글자가 3배 — 5단계면 가지 수백 개. 단계별 모양을 미리 지어 두면 보기는 가볍다.',
    level: 2,
    must: [
      '규칙 · 각도 · 마디 길이 · 줄어드는 비율 · 굴성은 종류마다 한 묶음(preset)으로 — 나무 · 고사리 · 산호가 같은 코드',
      '글자마다 난수를 붙여 확률 규칙 · 각도 흔들림을 정한다 (씨앗이 같으면 같은 그루)',
      '[ 에서 위치 · 회전(쿼터니언) · 깊이를 통째로 저장, ] 에서 되돌림',
      '되풀이 단계는 5 이하로 묶는다',
      '가지는 관(굵기 다빈치 규칙), 잎은 잎 카드 InstancedMesh 하나',
    ],
    done: [
      '단계를 0 → 5 로 올리면 가지가 한 번씩 갈라지며 나무가 자란다',
      '「나무 · 고사리 · 산호」를 바꾸면 같은 코드에 규칙만 바뀌어 전혀 다른 모양이 된다',
      '화면에 지금 규칙(예: A → F[&A]/[&A]/[&A])이 보인다',
      '각도 슬라이더로 가지가 벌어지는 정도가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '규칙 되풀이 + 3D 거북이',
      from: 'demos/demosModelA.ts LPRESETS · lExpand() · lTurtle() 를 정리',
      body: `const tree = { axiom: 'FA', rules: { A: [{ p: 0.72, s: 'F[&A]/[&A]/[&A]' }, { p: 0.28, s: 'F[&A]//[&A]' }] },
  angle: 40, roll: 120, yaw: 30, len: 0.42, decay: 0.84, jitter: 0.3 };

// 1) 되풀이 — 글자마다 난수 r 을 붙여 확률 규칙을 고른다
function expand(p: typeof tree, n: number, rnd: () => number) {
  let cur = [...p.axiom].map((c) => ({ c, r: rnd() }));
  for (let i = 0; i < n; i++) {
    const nx: { c: string; r: number }[] = [];
    for (const s of cur) {
      const rs = (p.rules as Record<string, { p: number; s: string }[]>)[s.c];
      if (!rs) { nx.push(s); continue; }
      let acc = 0, pick = rs[rs.length - 1]!;
      for (const r of rs) if (s.r < (acc += r.p)) { pick = r; break; }
      for (const c of pick.s) nx.push({ c, r: rnd() });
    }
    cur = nx;
  }
  return cur;
}

// 2) 거북이 — 위치 · 회전 · 깊이, [ 는 저장 ] 는 되돌림
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
let st = { p: new THREE.Vector3(), q: new THREE.Quaternion(), depth: 0 };
const stack: (typeof st)[] = [];
const rot = (axis: THREE.Vector3, deg: number, r: number) =>
  st.q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg) * (1 + tree.jitter * (r * 2 - 1))));
for (const s of expand(tree, 5, rnd)) {
  if (s.c === 'F') {
    const L = tree.len * Math.pow(tree.decay, st.depth) * (0.88 + s.r * 0.24);
    const from = st.p.clone();
    st.p.addScaledVector(Y.clone().applyQuaternion(st.q), L);
    addBranch(from, st.p.clone()); // 마디 나무에 한 칸
  } else if (s.c === '+') rot(Z, tree.yaw, s.r);
  else if (s.c === '-') rot(Z, -tree.yaw, s.r);
  else if (s.c === '&') rot(X, tree.angle, s.r);
  else if (s.c === '^') rot(X, -tree.angle, s.r);
  else if (s.c === '/') rot(Y, tree.roll, s.r);
  else if (s.c === '[') { stack.push(st); st = { p: st.p.clone(), q: st.q.clone(), depth: st.depth + 1 }; }
  else if (s.c === ']') st = stack.pop() ?? st;
  else if (s.c === 'A') addLeaf(st.p.clone(), st.q.clone()); // 잎 자리
}`,
    },
    pitfalls: [
      { title: '단계를 하나 더 올렸더니 멈췄다', fix: '가지 셋 규칙은 단계마다 3배씩 늘어난다. 견본은 5단계까지만 두고, 단계별 모양을 미리 지어 둔다.' },
      { title: '[ 에서 회전을 복사하지 않고 같은 객체를 넣으면 가지가 엉킨다', fix: '위치 · 쿼터니언을 clone 해서 저장한다.' },
      { title: '각도를 정확히 같게 두면 기계로 찍은 듯하다', fix: '글자마다 붙은 난수로 각도를 ±30% 흔들고 마디 길이도 0.88 ~ 1.12 배로.' },
    ],
    prev: ['i444'],
    next: ['i444', 'i538'],
    refs: [
      { name: 'Prusinkiewicz · Lindenmayer — The Algorithmic Beauty of Plants', url: 'http://algorithmicbotany.org/papers/abop/abop.pdf' },
      { name: 'Wikipedia — L-system', url: 'https://en.wikipedia.org/wiki/L-system' },
    ],
  },

  i447: {
    id: 'i447',
    summary: '공마다 퍼지는 값을 격자에 더하고 일정 값 면을 마칭 큐브로 매 프레임 뽑아, 가까운 공끼리 녹아 붙는 말랑한 슬라임 몸을 만든다.',
    terms: [
      { en: 'Metaballs (implicit surface)', ko: '공들의 값을 더한 장의 등값면 — 가까우면 녹아 붙음' },
      { en: 'Marching cubes', ko: '격자 칸마다 등값면을 삼각형으로 뽑는 방법' },
      { en: 'Falloff (1 − r²/R²)³', ko: '공 하나가 주는 값 — 중심 1, 반지름에서 0' },
      { en: 'Gradient normal', ko: '장의 기울기로 매끈한 법선' },
    ],
    goal: '{target}을(를) 메타볼로 만들어 줘 — 공들이 가까우면 녹아 붙고, 떨어진 방울이 기어 돌아와 합쳐지게. 분위기는 {style}.',
    targets: ['얼굴 있는 슬라임 캐릭터', '물방울 · 용암 덩어리', '구름'],
    styles: ['반들반들 젤리', '귀엽고 아기자기', '끈적한 괴물'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Compute Shader 마칭 큐브(예: Keijiro Smoothing 계열) 또는 VFX 의 SDF.',
      godot: 'Godot 은 MeshInstance3D 에 ArrayMesh 로 매 프레임 같은 마칭 큐브, 또는 셰이더 레이마칭.',
    },
    principle: [
      '공 하나가 주변에 값 w³ 를 뿌린다 (w = 1 − 거리²/반지름²). 반지름 밖은 0.',
      '모든 공의 값을 격자(견본 30칸)에 더한 뒤, 값이 문턱(iso 0.3)인 면을 마칭 큐브로 뽑는다.',
      '두 공이 가까우면 사이 값이 더해져 문턱을 넘으므로 다리처럼 녹아 붙는다.',
      '정점 법선은 각 공 값의 기울기 합으로, 색은 값 비중으로 섞어 방울 색이 몸에 번지게 한다.',
      '공은 몸통 넷 + 방울 넷 — 방울은 튀어나감 → 날아감 → 납작 착지 → 기어 돌아옴을 되풀이한다.',
    ],
    when: ['슬라임 · 물방울 · 용암처럼 모양이 계속 바뀌는 말랑한 몸', '덩어리가 쪼개졌다 합쳐지는 장면'],
    avoid: ['모양이 바뀌지 않는 캐릭터 — 한 번만 굽는 SDF 모델링(i446) 이 더 깔끔하다', '2D 화면 — 대신 2D SDF 메타볼 (셰이더 한 장)'],
    cost: 'medium',
    costNote: '매 프레임 격자 31 × 22 × 31 ≈ 2만 칸을 다시 채우고 면을 뽑는다(수 ms). 해상도를 올리면 세제곱으로 늘어난다.',
    level: 2,
    must: [
      '공의 영향은 반지름 안 칸만 더한다 (공 경계 상자만 돌기) — 격자 전체를 공마다 돌지 않는다',
      '모서리마다 꼭짓점 하나를 공유(캐시)해 이음새 없이',
      '법선은 장의 기울기에서 — computeVertexNormals 로 하면 결이 보인다',
      '버퍼는 넉넉히(1.6배) 잡고 쓴 만큼만 갱신, 경계 구는 고정 — 매 프레임 새 BufferGeometry 만들지 않기',
      '해상도 · 방울 수 · 문턱 슬라이더를 두어 무게와 모양을 조절',
    ],
    done: [
      '방울이 몸에서 쏙 튀어나가 날아가 떨어지고, 기어 돌아와 몸과 녹아 합쳐진다',
      '방울 색(분홍 · 하늘 · 노랑)이 몸에 닿는 곳에서 부드럽게 섞인다',
      '「공 중심 보기」를 켜면 공 중심과 영향 범위(선 구)가 보인다',
      '면에 계단 · 이음새가 없고 반들반들하다',
    ],
    code: {
      lang: 'ts',
      title: '공 값을 격자에 더하고 기울기 법선 · 섞인 색',
      from: 'demos/demosModelA.ts demoMeta() poly() 를 정리',
      body: `// 1) 격자에 값 더하기 — 공 경계 상자 안 칸만
fld.fill(0);
for (const b of balls) {
  const iR = 1 / (b.R * b.R);
  for (let z = z0(b); z <= z1(b); z++)
    for (let y = y0(b); y <= y1(b); y++)
      for (let x = x0(b); x <= x1(b); x++) {
        const dx = X0 + x * h - b.x, dy = (Y0 + y * h - b.y) / b.sy, dz = X0 + z * h - b.z; // sy = 납작함
        const q = (dx * dx + dy * dy + dz * dz) * iR;
        if (q < 1) { const w = 1 - q; fld[(z * ny + y) * nx + x] += w * w * w; }
      }
}

// 2) 등값면 뽑기 (iso 0.3). 꼭짓점이 생길 때마다 법선 · 색을 공들에서 계산
polygonize(fld, G, 0.3, buf, cache, (x, y, z, i) => {
  let gx = 0, gy = 0, gz = 0, ws = 0, r = 0, g = 0, bl = 0;
  for (const b of balls) {
    const dx = x - b.x, dy = (y - b.y) / b.sy, dz = z - b.z;
    const iR = 1 / (b.R * b.R);
    const q = (dx * dx + dy * dy + dz * dz) * iR;
    if (q >= 1) continue;
    const w = 1 - q, dw = -6 * w * w * iR;  // d(w³)/d(거리²) 비례
    gx += dw * dx; gy += (dw * dy) / b.sy; gz += dw * dz;
    const ww = w * w * w;
    ws += ww; r += b.c.r * ww; g += b.c.g * ww; bl += b.c.b * ww;
  }
  const l = Math.hypot(gx, gy, gz) || 1;
  buf.nor.set([-gx / l, -gy / l, -gz / l], i * 3); // 값이 줄어드는 쪽 = 바깥
  ws = ws || 1;
  buf.col.set([r / ws, g / ws, bl / ws], i * 3);   // 가까운 공 색이 많이
});`,
    },
    pitfalls: [
      { title: '매 프레임 BufferGeometry 를 새로 만들면 메모리가 새고 끊긴다', fix: '1.6배 넉넉한 버퍼를 DynamicDrawUsage 로 한 번 잡고, 쓴 만큼만 drawRange · needsUpdate. 모자랄 때만 다시 잡는다.' },
      { title: 'computeVertexNormals 를 쓰면 삼각형 결이 보인다', fix: '장의 기울기(공마다 dw × 거리)를 더해 법선으로 쓴다.' },
      { title: '경계 구를 매 프레임 다시 재면 느리다', fix: '견본은 경계 구를 고정(중심 0.8 높이, 반지름 3)하고 frustumCulled = false.' },
      { title: '삼각형 감는 방향이 뒤집혀 안쪽만 보인다', fix: '첫 삼각형의 면 방향과 법선을 한 번 비교해 감는 방향을 정한다 (견본 MC_FLIP).' },
    ],
    prev: ['i446'],
    next: ['i448'],
    refs: [
      { name: 'three.js 예제 — webgl_marchingcubes', url: 'https://threejs.org/examples/#webgl_marchingcubes' },
      { name: 'Wikipedia — Marching cubes', url: 'https://en.wikipedia.org/wiki/Marching_cubes' },
    ],
  },

  i448: {
    id: 'i448',
    summary: '각진 상자 틀을 Catmull-Clark 로 한 단계씩 나눠 매끈한 곡면으로 녹이고, 표시한 모서리만 날카롭게 남긴다.',
    terms: [
      { en: 'Catmull-Clark subdivision', ko: '사각 면을 넷으로 나누며 매끈하게' },
      { en: 'Loop subdivision', ko: '삼각 면을 넷으로 나누며 매끈하게' },
      { en: 'Control cage', ko: '낮은 폴리 틀 — 모양을 잡는 손잡이' },
      { en: 'Crease (sharp edge)', ko: '나눠도 매끈해지지 않게 표시한 모서리' },
    ],
    goal: '{target}을(를) 낮은 폴리 틀에서 서브디비전으로 매끈하게 만들어 줘 — 단계 0 ~ 3, 표시한 모서리는 날카롭게. 분위기는 {style}.',
    targets: ['상자 틀로 빚은 병아리', '장난감 자동차', '캐릭터 머리'],
    styles: ['반들반들 장난감', '파스텔 점토', '깔끔한 제품'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 런타임에는 기본 기능이 없다 — 보통 Blender 의 Subdivision Surface 로 굽고 가져온다.',
      godot: 'Godot 도 런타임 서브디비전이 없다 — Blender 에서 굽고 가져온다.',
    },
    principle: [
      '면마다 가운데 점(면 점), 모서리마다 새 점(모서리 점)을 만들고, 사각 면 하나를 넷으로 나눈다.',
      '모서리 점 = (모서리 두 끝 + 양쪽 면 점) ÷ 4. 날카로운 모서리면 그냥 가운데.',
      '원래 점 = (면 점 평균 F + 2 × 모서리 가운데 평균 R + (n − 3) × 원래 점) ÷ n. n 은 이웃 모서리 수.',
      '날카로운 모서리가 둘 붙은 점은 (6 × 자기 + 양 끝) ÷ 8, 셋 이상이면 그대로 둔다.',
      '한 단계에 면이 4배 — 단계 3이면 64배. 단계 사이는 모프로 녹아내리게 보여 준다.',
    ],
    when: ['캐릭터 머리 · 소품처럼 적은 점으로 모양을 잡고 매끈하게 보이고 싶을 때', '틀을 고치면 곡면이 따라 바뀌어야 할 때'],
    avoid: ['처음부터 둥근 기본 도형으로 될 때 — SphereGeometry · RoundedBox 가 빠르다', '말랑하게 모양이 계속 바뀌는 몸 — 대신 메타볼(i447)'],
    cost: 'medium',
    costNote: '단계마다 면 4배. 틀 수백 면이면 단계 3에 수만 면 — 한 번 짓고 굳히는 데는 문제없지만 매 프레임 다시 나누면 무겁다.',
    level: 3,
    must: [
      '모서리는 두 정점 번호로 열쇠(작은 번호 × 65536 + 큰 번호)를 만들어 면끼리 공유',
      '열린 가장자리(면이 하나뿐)와 표시한 주름 모서리는 날카롭게 처리',
      '주름 표시는 나눈 뒤 두 반쪽 모서리로 물려준다',
      '틀 선(주황)과 주름 선(분홍)을 겹쳐 보여, 어느 모서리가 날카로운지 알 수 있게',
      'Catmull-Clark(사각) · Loop(삼각)를 바꿔 볼 수 있게',
    ],
    done: [
      '주황 틀 선 안에서 단계 0(각진 상자) → 3(매끈한 병아리)으로 한 단계씩 녹아내린다',
      '「주름」을 끄면 날카롭던 부리 · 모서리까지 둥글어지고, 켜면 그대로 남는다',
      '「Loop」로 바꾸면 삼각형으로 나눈 다른 결의 곡면이 된다',
      '단계마다 면 수가 4배로 느는 것이 숫자로 보인다',
    ],
    code: {
      lang: 'ts',
      title: 'Catmull-Clark 한 단계 — 점 옮기기 규칙 (주름 포함)',
      from: 'demos/demosModelA.ts catmull() 을 정리',
      body: `const ek = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a);
const sharp = (e: Edge) => e.f.length < 2 || m.cr.has(ek(e.a, e.b)); // 열린 가장자리 · 주름
const fp = m.f.map((f) => centroid(m, f)); // 면 점

// 원래 점 옮기기
for (let v = 0; v < nv; v++) {
  const p = m.v[v]!;
  const es = vE[v]!.map((i) => elist[i]!);
  const cs = es.filter(sharp);
  let q: THREE.Vector3;
  if (cs.length >= 3) q = p.clone();                        // 뾰족한 꼭짓점은 그대로
  else if (cs.length === 2) {                                // 주름 위 점: (6p + 양 끝) / 8
    const o = cs.map((e) => m.v[e.a === v ? e.b : e.a]!);
    q = p.clone().multiplyScalar(6).add(o[0]!).add(o[1]!).divideScalar(8);
  } else {                                                   // (F + 2R + (n-3)p) / n
    const n = es.length;
    const F = new THREE.Vector3();
    for (const fi of vF[v]!) F.add(fp[fi]!);
    F.divideScalar(vF[v]!.length);
    const R = new THREE.Vector3();
    for (const e of es) R.add(m.v[e.a]!).add(m.v[e.b]!);
    R.divideScalar(2 * n);
    q = F.add(R.multiplyScalar(2)).addScaledVector(p, n - 3).divideScalar(n);
  }
  out.v.push(q);
}
// 모서리 점: 날카로우면 가운데, 아니면 (두 끝 + 양쪽 면 점) / 4
for (const e of elist) {
  const mid = m.v[e.a]!.clone().add(m.v[e.b]!).multiplyScalar(0.5);
  out.v.push(sharp(e) ? mid : m.v[e.a]!.clone().add(m.v[e.b]!).add(fp[e.f[0]!]!).add(fp[e.f[1]!]!).multiplyScalar(0.25));
  if (m.cr.has(ek(e.a, e.b))) { out.cr.add(ek(e.a, nv + e.id)); out.cr.add(ek(nv + e.id, e.b)); } // 주름 물려주기
}
// 면 점을 넣고, 면마다 [꼭짓점, 다음 모서리 점, 면 점, 앞 모서리 점] 사각형 n 개로 나눈다`,
    },
    pitfalls: [
      { title: '주름 표시를 다음 단계로 안 물려주면 단계 2부터 둥글어진다', fix: '주름 모서리를 나눈 두 반쪽(끝 ↔ 모서리 점)에 주름 표시를 다시 넣는다.' },
      { title: '열린 가장자리를 보통 모서리로 계산하면 구멍 테두리가 오그라든다', fix: '면이 하나뿐인 모서리는 날카로운 모서리로 다룬다.' },
      { title: '단계 4 이상은 면 수가 폭발한다', fix: '견본은 단계 3까지. 그 이상 매끈함은 법선으로 충분하다.' },
    ],
    prev: ['i446'],
    next: ['i468'],
    refs: [
      { name: 'Wikipedia — Catmull–Clark subdivision surface', url: 'https://en.wikipedia.org/wiki/Catmull%E2%80%93Clark_subdivision_surface' },
      { name: 'Wikipedia — Loop subdivision surface', url: 'https://en.wikipedia.org/wiki/Loop_subdivision_surface' },
    ],
  },

  i449: {
    id: 'i449',
    summary: '단면 모양을 곡선을 따라 끌고 가며 크기 · 비틀림 · 납작함을 바꿔, 뿔 · 덩굴 · 달팽이 껍데기 같은 관 모양을 만든다.',
    terms: [
      { en: 'Sweep / loft along a curve', ko: '곡선을 따라 단면 끌기' },
      { en: 'Parallel transport frame', ko: '비틀림 없이 곡선을 따라가는 방향 틀' },
      { en: 'CatmullRomCurve3.getSpacedPoints', ko: '고른 간격으로 곡선 위 점 뽑기' },
      { en: 'Profile function radius(u) · twist(u)', ko: '진행 정도 u 에 따른 굵기 · 비틀림' },
    ],
    goal: '{target}을(를) 스윕으로 만들어 줘 — 단면이 곡선을 따라가며 굵기 · 비틀림 · 모양이 바뀌게. 분위기는 {style}.',
    targets: ['비틀린 별 단면 뿔', '감아 오르는 덩굴과 나팔꽃', '나선 달팽이 껍데기'],
    styles: ['반짝이는 동화', '귀여운 장난감', '신비한 숲'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Splines 패키지의 SplineExtrude (단면 · 굵기) 또는 직접 메시 생성.',
      godot: 'Godot 은 Path3D + CSGPolygon3D (mode = Path) 로 단면을 길 따라 끌기.',
    },
    principle: [
      '곡선을 고른 간격 점 n 개로 나누고, 점마다 진행 방향 T 를 앞뒤 점 차이로 구한다.',
      '첫 점에서 위쪽(0,1,0)을 T 에 수직으로 맞춘 N 을 잡고, 다음 점부터는 이전 N 에서 T 성분만 빼고 다시 맞춘다 (평행 이동 틀 — 갑자기 뒤집히지 않는다).',
      'B = T × N. 단면 각 a 의 점 = 중심 + N·cos a·r·sx + B·sin a·r·sy.',
      '굵기 r(u), 비틀림 twist(u), 단면 모양 section(a, u), 납작함 sxy(u) 를 진행 정도 u 함수로 주면 뿔 · 별 · 나선이 된다.',
      '링 사이를 삼각형 둘씩 이어 관을 만들고, drawRange 로 진행 정도만큼만 그려 「끌고 가는」 모습을 보여 준다.',
    ],
    when: ['뿔 · 꼬리 · 줄기 · 밧줄 · 관처럼 길쭉하고 휘는 모양', '굵기 · 단면이 길이 따라 바뀌어야 할 때 (TubeGeometry 는 굵기가 한 가지)'],
    avoid: ['곧은 축으로 돌린 모양(병 · 체스 말) — 대신 선반 회전체(i450)', '굵기가 일정한 관 — TubeGeometry 로 충분'],
    cost: 'light',
    costNote: '한 번 짓는 모양이라 가볍다. 링 수 × 단면 점 수 정점 (예: 120 × 24 ≈ 3천).',
    level: 2,
    must: [
      '방향 틀은 평행 이동 방식 (이전 N 을 이어받기) — 점마다 위쪽 벡터로 새로 잡으면 곡선이 수직일 때 뒤집힌다',
      '곡선 점은 getSpacedPoints 로 고른 간격',
      '굵기 · 비틀림 · 단면을 u(0~1) 함수로 받아, 같은 함수 하나로 여러 모양',
      '시작 끝은 뚜껑(가운데 점 하나)으로 막기',
      '진행 정도 슬라이더로 단면이 곡선을 따라 끌려가는 모습 (앞머리 테 표시)',
    ],
    done: [
      '빛나는 테(단면)가 곡선을 따라가며 뒤에 관이 남는다',
      '별 단면 뿔은 끝으로 갈수록 가늘어지며 비틀리고, 덩굴은 막대를 감아 오르고, 달팽이는 나선으로 말린다',
      '「뿔 비틀림(바퀴)」 0 ~ 6 · 「단면 꽃잎 수」 0 ~ 8 · 「가늘어짐(지수)」 슬라이더로 뿔 모양이 바로 바뀐다',
      '관이 어디서도 갑자기 뒤집혀 꼬이지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '평행 이동 틀로 단면 끌기',
      from: 'demos/demosModelA.ts buildSweep() 을 정리',
      body: `function buildSweep(pts: THREE.Vector3[], radial: number, radius: (u: number) => number,
  section?: (a: number, u: number) => number, twist?: (u: number) => number): THREE.BufferGeometry {
  const n = pts.length, TAU = Math.PI * 2;
  const pos = new Float32Array(n * radial * 3);
  const idx: number[] = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), p = pts[i]!;
    T.subVectors(pts[Math.min(n - 1, i + 1)]!, pts[Math.max(0, i - 1)]!).normalize();
    if (i === 0) {
      N.set(0, 1, 0).addScaledVector(T, -T.y);
      if (N.lengthSq() < 1e-4) N.set(1, 0, 0).addScaledVector(T, -T.x);
      N.normalize();
    } else N.addScaledVector(T, -N.dot(T)).normalize(); // 이전 N 을 이어받는다 = 뒤집힘 없음
    B.crossVectors(T, N);
    const r = radius(u), tw = twist ? twist(u) : 0;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const rr = r * (section ? section(a - tw, u) : 1);
      const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr, k = (i * radial + j) * 3;
      pos[k] = p.x + N.x * ca + B.x * sa;
      pos[k + 1] = p.y + N.y * ca + B.y * sa;
      pos[k + 2] = p.z + N.z * ca + B.z * sa;
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, a1 = i * radial + ((j + 1) % radial);
      idx.push(a, a1, a + radial, a1, a1 + radial, a + radial);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 견본 뿔: radius = u => 0.25 * Math.pow(1 - u, 0.9) + 0.003, section = a => 1 + 0.15 * Math.cos(5 * a), twist = u => 3 * Math.PI * 2 * u
// 진행 보기: geo.setDrawRange(0, segs * radial * 6);`,
    },
    pitfalls: [
      { title: '점마다 위쪽 벡터로 틀을 새로 잡으면 곡선이 서는 곳에서 관이 휙 뒤집힌다', fix: '첫 점만 위쪽으로 잡고, 다음부터는 이전 N 에서 T 성분을 빼서 이어받는다 (평행 이동).' },
      { title: '곡선 점 간격이 고르지 않으면 굵기 변화가 울퉁불퉁하다', fix: 'getPoints 대신 getSpacedPoints 로 호 길이가 고른 점을 뽑는다.' },
      { title: '끝이 뚫려 안이 보인다', fix: '시작 끝에 가운데 점 하나 + 부채꼴 삼각형으로 뚜껑을 만든다. 가늘어지는 끝은 굵기를 0 가까이.' },
    ],
    prev: ['i450'],
    next: ['i450', 'i468'],
    refs: [
      { name: 'three.js 문서 — TubeGeometry', url: 'https://threejs.org/docs/#api/en/geometries/TubeGeometry' },
    ],
  },

  i450: {
    id: 'i450',
    summary: '반쪽 윤곽선 하나를 직선 · 둥근 모서리 · 원호로 그려 축으로 돌려, 체스 말 · 화분 · 꽃병을 홈 · 테 · 받침까지 한 번에 만든다.',
    terms: [
      { en: 'Lathe / surface of revolution', ko: '윤곽선을 축으로 돌린 회전체' },
      { en: 'THREE.LatheGeometry', ko: 'three.js 회전체 모양 (점 목록 · 둘레 조각 수)' },
      { en: 'Profile curve (fillet · arc)', ko: '윤곽 — 둥근 모서리 · 원호 · 매끈한 곡선' },
      { en: 'Per-profile vertex color', ko: '윤곽 구간마다 색 번호 → 띠 무늬' },
    ],
    goal: '{target}을(를) 윤곽선 하나를 돌린 회전체로 만들어 줘 — 홈 · 테 · 받침 장식은 윤곽에서, 띠 색도 윤곽 구간으로. 분위기는 {style}.',
    targets: ['체스 말 · 화분 · 꽃병 셋', '기둥 · 난간', '병 · 컵 · 팽이'],
    styles: ['반들반들 도자기', '금테 두른 고급', '귀여운 장난감'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 기본 회전체가 없어 메시를 직접 만들거나 ProBuilder / Blender 의 Screw 로.',
      godot: 'Godot 은 CSGPolygon3D 의 mode = Spin (spin_degrees 360) 이 같은 일을 한다.',
    },
    principle: [
      '(x = 축에서 거리, y = 높이) 점 목록을 아래에서 위로 그리면 반쪽 옆모습이 된다.',
      'LatheGeometry(점 목록, 둘레 조각 수) 가 그 선을 y 축으로 한 바퀴 돌려 면을 만든다.',
      '꺾이는 점에는 둥글기 r 을 주어 두 변 사이를 2차 곡선 7점으로 깎는다 — 빛이 맺혀 고급스러워진다.',
      '반원 홈 · 구슬 테는 원호(A), 꽃병 배는 매끈한 곡선(Catmull-Rom, S)으로 넣는다.',
      '윤곽 구간마다 색 번호를 붙여 정점 색으로 칠하면 금 띠 · 색 띠가 저절로 생긴다.',
    ],
    when: ['체스 말 · 병 · 화분 · 기둥처럼 축 대칭인 모양', '같은 틀로 크기 · 비율만 바꾼 변형을 많이 만들 때'],
    avoid: ['한쪽으로 휘거나 비틀린 모양 — 대신 스윕(i449)', '각진 옆모습을 두께로 민 모양 — 대신 윤곽 돌출(i468)'],
    cost: 'light',
    costNote: '윤곽 점 수 × 둘레 조각 수(견본 64) 정점. 말 하나 수천 삼각형 — 가볍다.',
    level: 1,
    must: [
      '윤곽은 아래 축(x = 0)에서 시작해 위 축(x = 0)으로 끝나야 바닥 · 꼭대기에 구멍이 없다',
      'x 는 0 아래로 내려가지 않게 (Math.max(0, x))',
      '꺾이는 곳마다 둥글기를 주되, 양쪽 변 길이의 45% 를 넘지 않게',
      '장식(금 구슬 고리 · 십자가)은 윤곽에서 그 높이의 반지름을 읽어 붙인다',
      '「둘레 조각 수」 6 ~ 96 슬라이더로 각진 기둥 ↔ 매끈한 원 비교',
    ],
    done: [
      '노란 윤곽선이 먼저 그려지고, 그 선이 축을 따라 돌며 체스 말 · 화분 · 꽃병이 된다',
      '받침 · 홈 · 구슬 테가 윤곽에서 나오고, 금 띠 색이 구간대로 칠해진다',
      '「둘레 조각 수」를 6 으로 내리면 육각 기둥, 64 면 매끈한 원이 된다',
      '「새로 만들기」마다 비율 · 색이 조금씩 다른 세 가지가 나온다',
    ],
    code: {
      lang: 'ts',
      title: '둥근 모서리 윤곽 → LatheGeometry + 띠 색',
      from: 'demos/demosModelB.ts Prof.build() · latheDemo() buildG 를 정리',
      body: `type PNode = { x: number; y: number; r: number; c: number }; // r = 모서리 둥글기, c = 색 번호

function buildProfile(N: PNode[]): { pts: THREE.Vector2[]; cols: number[] } {
  const pts: THREE.Vector2[] = [], cols: number[] = [];
  const push = (x: number, y: number, c: number) => { pts.push(new THREE.Vector2(Math.max(0, x), y)); cols.push(c); };
  for (let i = 0; i < N.length; i++) {
    const n = N[i]!;
    if (n.r > 0 && i > 0 && i < N.length - 1) {
      const pr = N[i - 1]!, nx = N[i + 1]!;
      const l0 = Math.hypot(pr.x - n.x, pr.y - n.y), l1 = Math.hypot(nx.x - n.x, nx.y - n.y);
      const rr = Math.min(n.r, 0.45 * l0, 0.45 * l1); // 변 길이의 45% 까지만
      const ax = n.x + ((pr.x - n.x) / l0) * rr, ay = n.y + ((pr.y - n.y) / l0) * rr;
      const bx = n.x + ((nx.x - n.x) / l1) * rr, by = n.y + ((nx.y - n.y) / l1) * rr;
      for (let k = 0; k <= 6; k++) { // 2차 곡선으로 모서리 깎기
        const s = k / 6, u = 1 - s;
        push(u * u * ax + 2 * u * s * n.x + s * s * bx, u * u * ay + 2 * u * s * n.y + s * s * by, n.c);
      }
    } else push(n.x, n.y, n.c);
  }
  return { pts, cols };
}

const segs = 64;
const { pts, cols } = buildProfile(nodes);
const geo = new THREE.LatheGeometry(pts, segs);
const pal = [new THREE.Color(0xf1e4cc), new THREE.Color(0xe9b949)]; // 0 바탕 · 1 금 띠
const n = pts.length;
const col = new Float32Array((segs + 1) * n * 3);
for (let i = 0; i <= segs; i++)
  for (let j = 0; j < n; j++) pal[cols[j]!]!.toArray(col, (i * n + j) * 3);
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.8, side: THREE.DoubleSide }));`,
    },
    pitfalls: [
      { title: '윤곽이 축에서 시작 · 끝나지 않으면 바닥 · 꼭대기에 구멍이 뚫린다', fix: '첫 점과 마지막 점의 x 를 0 으로 둔다 (견본 L(0, 0, 0) 로 시작).' },
      { title: '모서리 둥글기를 크게 주면 짧은 변에서 곡선이 뒤집혀 꼬인다', fix: '둥글기를 양쪽 변 길이의 45% 이하로 자른다.' },
      { title: 'LatheGeometry 는 정점 순서가 (둘레 i, 윤곽 j) 라 색 배열 순서를 틀리기 쉽다', fix: '색 인덱스는 (i × 윤곽 점 수 + j). 둘레는 segs + 1 줄이다.' },
    ],
    prev: ['i449'],
    next: ['i449', 'i468'],
    refs: [
      { name: 'three.js 문서 — LatheGeometry', url: 'https://threejs.org/docs/#api/en/geometries/LatheGeometry' },
    ],
  },

  i451: {
    id: 'i451',
    summary: '모양을 다각형 목록으로 바꿔 BSP 나무로 서로 잘라, 합치기 · 빼기 · 겹친 곳만 남기기로 창문 구멍 난 집과 둥근 주사위를 만든다.',
    terms: [
      { en: 'CSG (Constructive Solid Geometry) boolean', ko: '모양끼리 합치기 · 빼기 · 교집합' },
      { en: 'BSP tree (binary space partitioning)', ko: '면 평면으로 공간을 앞 · 뒤로 나눈 나무' },
      { en: 'Union · Subtract · Intersect', ko: '합집합 · 차집합 · 교집합' },
      { en: 'three-bvh-csg', ko: 'three.js 에서 많이 쓰는 빠른 CSG 라이브러리 (견본은 직접 짠 BSP)' },
    ],
    goal: '{target}을(를) CSG 불리언으로 만들어 줘 — 합치기 · 빼기 · 겹친 곳만으로 구멍 · 홈을 내고, 화면이 멈추지 않게 나눠 계산. 분위기는 {style}.',
    targets: ['창 · 문 구멍 난 장난감 집', '둥근 주사위 (상자 ∩ 구 − 눈 구멍)', '나사 구멍 난 기계 부품'],
    styles: ['밝은 장난감 마을', '깔끔한 제품 모형', '설계도'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 ProBuilder 의 Boolean (실험 기능) 또는 에셋 · Blender 에서 미리 깎기.',
      godot: 'Godot 은 CSGCombiner3D 안에 CSGBox3D · CSGCylinder3D 를 operation(Union · Subtraction · Intersection)으로.',
    },
    principle: [
      '모양을 세계 좌표 삼각형(다각형) 목록으로 바꾼다. 다각형마다 자기 평면(법선 · 거리)이 있다.',
      'BSP 나무: 다각형 하나의 평면으로 나머지를 앞 · 뒤로 나누고(걸치면 잘라서), 앞 · 뒤에 같은 일을 되풀이한다.',
      'A 를 B 의 나무로 자르면(clipTo) B 안에 든 A 조각이 사라진다. 뒤집기(invert)를 섞어 합 · 차 · 교를 만든다.',
      '빼기 A − B = A 뒤집기 → 서로 자르기 → B 뒤집어 자르기 → 합치고 다시 뒤집기.',
      '결과 다각형을 부채꼴로 삼각형화해 정점 색 · 법선과 함께 BufferGeometry 로 만든다.',
    ],
    when: ['창문 · 홈 · 나사 구멍처럼 「파낸」 모양이 필요한 건물 · 기계', '모양 조합을 코드로 바꿔 가며 만들 때 (창 수 슬라이더 등)'],
    avoid: ['매 프레임 모양이 바뀌는 곳 — CSG 는 무겁다. 대신 셰이더로 잘라 보이기(clippingPlanes)', '부드럽게 녹아 붙어야 할 때 — 대신 SDF 부드러운 합치기(i446)'],
    cost: 'heavy',
    costNote: '다각형 수가 늘면 BSP 나누기가 급격히 무거워진다 (수십 ms ~ 수백 ms). 견본은 생성기로 프레임마다 3ms 씩 나눠 계산.',
    level: 3,
    must: [
      '불리언 계산은 프레임당 3ms 예산으로 나눠서 (생성기 + yield) — 한 번에 돌리면 화면이 멈춘다',
      '재료 모양은 세계 행렬(위치 · 회전)을 먼저 적용해 다각형으로 바꾼다',
      '평면 판정에 작은 오차(1e-5)를 두어 같은 평면 다각형을 따로 다룬다',
      '연산 전 재료를 반투명 유령으로 보여 주고, 결과로 바뀌는 과정을 보여 준다',
      '결과는 다시 쓰지 말고 굳혀(한 번 계산) 그린다',
    ],
    done: [
      '상자 · 지붕 · 굴뚝 · 원통이 합쳐져 집이 되고, 창 · 문 모양이 빠져 구멍이 뚫린다',
      '상자 ∩ 구 = 둥근 주사위, 거기서 작은 구들을 빼 눈 구멍이 파인다',
      '「불리언 연산」을 끄면 그냥 겹쳐 놓은 것과 비교되고, 와이어프레임으로 잘린 면이 보인다',
      '「창문 수」를 바꿔도 화면이 멈추지 않는다 (나눠 계산)',
    ],
    code: {
      lang: 'ts',
      title: 'BSP 로 합치기 · 빼기 (csg.js 방식)',
      from: 'demos/demosModelB.ts CNode · buildSync · clipSync · csgSub 를 정리 (생성기 대신 보통 함수)',
      body: `// p 를 평면 pl 기준으로 나눠 앞 · 뒤(같은 평면은 cf · cb)에 넣는다 — splitPoly (걸치면 잘라 둘로)
class CNode {
  plane: CPlane | null = null; front: CNode | null = null; back: CNode | null = null; polys: CPoly[] = [];
  invert(): void {
    this.polys = this.polys.map(flipPoly);
    if (this.plane) this.plane = { nx: -this.plane.nx, ny: -this.plane.ny, nz: -this.plane.nz, w: -this.plane.w };
    this.front?.invert(); this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  all(out: CPoly[] = []): CPoly[] { out.push(...this.polys); this.front?.all(out); this.back?.all(out); return out; }
}
function build(n: CNode, polys: CPoly[]): void {
  if (!polys.length) return;
  const p0 = polys[0]!;
  n.plane ??= { nx: p0.nx, ny: p0.ny, nz: p0.nz, w: p0.w }; // 첫 다각형의 평면으로 나눈다
  const f: CPoly[] = [], b: CPoly[] = [];
  for (const p of polys) splitPoly(n.plane, p, n.polys, n.polys, f, b);
  if (f.length) build((n.front ??= new CNode()), f);
  if (b.length) build((n.back ??= new CNode()), b);
}
function clipPolys(n: CNode, polys: CPoly[]): CPoly[] { // n 안에 든 조각은 버린다
  if (!n.plane) return polys.slice();
  let f: CPoly[] = [], b: CPoly[] = [];
  for (const p of polys) splitPoly(n.plane, p, f, b, f, b);
  if (n.front) f = clipPolys(n.front, f);
  b = n.back ? clipPolys(n.back, b) : [];
  return f.concat(b);
}
function clipTo(n: CNode, bsp: CNode): void { n.polys = clipPolys(bsp, n.polys); n.front && clipTo(n.front, bsp); n.back && clipTo(n.back, bsp); }
const node = (p: CPoly[]) => { const n = new CNode(); build(n, p); return n; };

function subtract(a: CPoly[], b: CPoly[]): CPoly[] { // A − B
  const A = node(a), B = node(b);
  A.invert(); clipTo(A, B); clipTo(B, A);
  B.invert(); clipTo(B, A); B.invert();
  build(A, B.all()); A.invert();
  return A.all();
}
// 집: let house = union(body, roof, chimney, tower); house = subtract(house, union(...windows, door));
// 주사위: subtract(intersect(cube, sphere), union(...pips))`,
    },
    pitfalls: [
      { title: 'CSG 를 한 번에 돌리면 화면이 수백 ms 멈춘다', fix: '연산을 생성기로 쓰고 「if (late()) yield」 로 프레임마다 3ms 만 돌린다. 데모의 Job 이 이 일을 한다.', seen: true },
      { title: '재료를 지역 좌표 그대로 넣으면 엉뚱한 자리가 깎인다', fix: '다각형으로 바꿀 때 메시의 세계 행렬(위치 · 회전)과 법선 행렬을 먼저 곱한다.' },
      { title: '같은 평면에 놓인 면끼리 깜빡이거나 구멍이 난다', fix: '평면 판정에 작은 오차(1e-5)를 두고, 같은 평면 다각형은 법선 방향으로 앞/뒤를 정한다.' },
      { title: '연산을 거듭할수록 잘린 조각이 늘어 다음 연산이 더 느려진다', fix: '구멍 재료를 먼저 하나로 합친 뒤 본체에서 한 번만 뺀다 (견본 순서).' },
    ],
    prev: ['i446'],
    next: ['i468', 'i470'],
    refs: [
      { name: 'Evan Wallace — csg.js', url: 'https://github.com/evanw/csg.js' },
      { name: 'three-bvh-csg', url: 'https://github.com/gkjohnson/three-bvh-csg' },
    ],
  },

  i452: {
    id: 'i452',
    summary: '공을 찌그리고 → 평면으로 깎고 → 잡음으로 울퉁불퉁하게 → 위쪽에 이끼를 얹어, 씨앗만 바꿔 수십 가지 바위를 만든다.',
    terms: [
      { en: 'Procedural rock generation', ko: '절차 바위 만들기' },
      { en: 'Icosphere + fBm displacement', ko: '고른 공 + 여러 겹 잡음으로 표면 밀기' },
      { en: 'Planar cuts (chiseled faces)', ko: '평면으로 깎인 면 — 바위다운 납작한 결' },
      { en: 'Slope-based moss (normal.y mask)', ko: '위를 보는 곳에만 이끼' },
    ],
    goal: '{target}을(를) 절차 바위로 만들어 줘 — 찌그리기 · 평면 깎기 · 잡음 · 이끼 순서로, 씨앗만 바꿔 다양하게. 분위기는 {style}.',
    targets: ['이끼 낀 바위 무더기', '동굴 벽 · 바위 산', '길가 돌'],
    styles: ['동화 숲', '사실적인 산', '어두운 동굴'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 방식을 Mesh API 로, 또는 Blender Geometry Nodes 에서 구워 가져온다.',
      godot: 'Godot 은 SurfaceTool / ArrayMesh 로 같은 방식.',
    },
    principle: [
      '고르게 나눈 공(정이십면체 나누기)에서 시작한다 — 극에 점이 몰리지 않는다.',
      '찌그리기: 아무렇게나 돌리고 x · y · z 를 다르게 늘이고(y 는 0.55 ~ 0.85), 큰 잡음 혹을 곱한다.',
      '깎기: 바닥 + 무작위 평면 여러 개(견본 5)로, 평면 밖으로 나간 점을 평면까지 밀어 넣는다. 경계는 살짝 둥글게.',
      '잡음 변위: 큰 잡음 + 잔 잡음을 원래 방향으로 더한다. 깎인 면은 0.4배만 — 깎인 결이 살아 있게.',
      '색: 얼룩 × 틈 그늘(파인 곳 어둡게) × 층 띠, 그리고 법선 y 가 큰 곳(위를 보는 곳)에 이끼 색을 섞는다.',
    ],
    when: ['바위 · 돌이 많이 필요한 섬 · 동굴 · 길', '같은 규칙으로 모양이 다른 변형을 씨앗으로 뽑을 때'],
    avoid: ['딱 한 개의 주인공 바위 — 손으로 다듬거나 스캔 재질(i474)이 낫다', '매끈한 조약돌 — 찌그린 공만으로 충분'],
    cost: 'medium',
    costNote: '바위 하나 정점 수천(나눔 13 ~ 24단계) × 잡음 여러 번 — 굽기는 무겁지만 한 번뿐, 프레임당 3ms 로 나눠 굽는다. 다 구우면 보통 메시.',
    level: 2,
    must: [
      '순서를 지킨다: 찌그리기 → 평면 깎기 → 잡음 → 색 (깎기 전에 잡음을 넣으면 깎인 면이 지저분하다)',
      '깎인 면 점은 표시해 두고 잡음을 약하게(0.4배)',
      '바닥 평면(아래 방향)은 늘 하나 넣어 바위가 땅에 앉게',
      '같은 씨앗이면 같은 바위 — 무작위는 씨앗 난수로',
      '굽기는 프레임 예산(3ms)으로 나눠 — 바위 수십 개를 한 번에 만들어도 화면이 안 멈추게',
    ],
    done: [
      '공 → 찌그린 덩이 → 깎인 면 → 울퉁불퉁 → 이끼 다섯 단계를 차례로 볼 수 있다',
      '「깎는 면 수」 0 ~ 8 · 「잡음 세기」 0 ~ 2 · 「이끼」 0 ~ 1 슬라이더로 바위 성격이 바뀐다',
      '「새로 만들기」마다 같은 규칙의 다른 바위 무더기가 나온다',
      '위를 보는 면에만 이끼가 끼고, 파인 틈은 어둡다',
    ],
    code: {
      lang: 'ts',
      title: '평면 깎기 + 잡음 변위',
      from: 'demos/demosModelB.ts makeRock() 2 · 3 단계를 정리',
      body: `// P1 = 찌그린 공의 점들. 평면마다: 가장 튀어나온 거리 ext 의 62 ~ 86% 에서 자른다
const planes = [new THREE.Vector3(0, -1, 0)]; // 바닥은 늘
for (let k = 0; k < cuts; k++) planes.push(new THREE.Vector3(rng() * 2 - 1, rng() * 1.1 - 0.3, rng() * 2 - 1).normalize());
const P2 = P1.slice();
const cutAmt = new Float32Array(n);
for (let k = 0; k < planes.length; k++) {
  const pn = planes[k]!;
  let ext = 0;
  for (let i = 0; i < n; i++) ext = Math.max(ext, pn.x * P2[i * 3] + pn.y * P2[i * 3 + 1] + pn.z * P2[i * 3 + 2]);
  const d = ext * (k === 0 ? 0.62 : 0.66 + rng() * 0.2), b = 0.05;
  for (let i = 0; i < n; i++) {
    const e = pn.x * P2[i * 3] + pn.y * P2[i * 3 + 1] + pn.z * P2[i * 3 + 2] - d;
    if (e <= -b) continue;
    const sh = e < b ? ((e + b) * (e + b)) / (4 * b) : e; // 경계는 살짝 둥글게
    P2[i * 3] -= pn.x * sh; P2[i * 3 + 1] -= pn.y * sh; P2[i * 3 + 2] -= pn.z * sh;
    if (sh > 0.01) cutAmt[i] = 1;
  }
}
// 잡음 변위 — 원래 공 방향(P0)으로, 깎인 면은 약하게
for (let i = 0; i < n; i++) {
  const px = P2[i * 3], py = P2[i * 3 + 1], pz = P2[i * 3 + 2];
  const d = ((fbm3(px * 2.4, py * 2.4, pz * 2.4, s + 5, 4) - 0.5) * 0.3
           + (fbm3(px * 8, py * 8, pz * 8, s + 9, 3) - 0.5) * 0.09) * noiseAmt * (cutAmt[i] ? 0.4 : 1);
  P3[i * 3] = px + P0[i * 3] * d; P3[i * 3 + 1] = py + P0[i * 3 + 1] * d; P3[i * 3 + 2] = pz + P0[i * 3 + 2] * d;
}
// 이끼: m = smooth(0.55, 0.85, normal.y + (fbm - 0.5) * 0.9) * moss → 바위색.lerp(이끼색, m)`,
    },
    pitfalls: [
      { title: '잡음을 깎기 전에 넣으면 깎인 면이 울퉁불퉁해져 바위 결이 사라진다', fix: '깎기 → 잡음 순서, 깎인 면 점은 잡음을 0.4배로.' },
      { title: 'UV 공(SphereGeometry)으로 시작하면 극에 점이 몰려 뾰족한 꼭지가 생긴다', fix: '정이십면체를 고르게 나눈 공(icosphere)으로 시작한다.' },
      { title: '바위 수십 개를 한 번에 구우면 시작이 멈춘다', fix: '생성기로 나눠 프레임마다 3ms 씩 굽는다.', seen: true },
    ],
    prev: ['i84'],
    next: ['i453', 'i455'],
  },

  i453: {
    id: 'i453',
    summary: '정점마다 반구 방향으로 광선 수십 개를 쏴 가려진 정도를 미리 계산해 정점 색에 구워, 실행 비용 0 으로 구석 · 맞닿은 곳을 어둡게 한다.',
    terms: [
      { en: 'Baked per-vertex ambient occlusion', ko: '정점 구석 그늘 미리 굽기' },
      { en: 'Cosine-weighted hemisphere sampling', ko: '법선 쪽으로 몰린 반구 광선 고르기' },
      { en: 'Ray–primitive intersection', ko: '상자 · 구 · 원기둥과 광선 만나는 거리' },
      { en: 'Vertex color multiply', ko: '구운 그늘을 정점 색으로 곱하기' },
    ],
    goal: '{target}에 정점 구석 그늘을 미리 구워 줘 — 정점마다 반구 광선으로 가려진 정도를 재서 정점 색에, 후처리 없이. 분위기는 {style}.',
    targets: ['블록 · 기둥 · 공을 쌓은 무대', '정적인 소품 · 건물', '보드 게임 판'],
    styles: ['밝은 장난감', '부드러운 점토', '하얀 석고 모형'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 라이트맵 굽기(Baked GI)의 AO, 또는 정점 AO 를 DCC 에서 구워 정점 색으로.',
      godot: 'Godot 은 LightmapGI 굽기, 또는 Blender 에서 AO 를 정점 색으로 구워 가져온다.',
    },
    principle: [
      '구석에 있는 점은 반구 하늘의 많은 부분이 이웃 물체에 가려 빛을 덜 받는다.',
      '정점마다 법선 쪽 반구로 광선 K 개(견본 48)를 쏜다. 코사인 가중 + 황금각 나선이라 고르게 퍼진다.',
      '광선이 거리 maxD(0.9) 안에서 무엇에 맞으면 가까울수록 많이 가린 것으로 센다: 가림 += 1 − smooth(0.35, 1, t/maxD).',
      'AO = 1 − 가림/K. 이웃 정점과 두 번 평균 내 광선 잡음을 줄이고, 정점 색 = lerp(1, AO^2.2, 세기).',
      '광선은 모든 삼각형 대신 간단한 도형(상자 · 구 · 원기둥 · 바닥 평면)과 맞혀 빠르게 계산한다.',
    ],
    when: ['움직이지 않는 무대 · 소품에 깊이감을 줄 때', '폰에서 GTAO 같은 후처리를 못 쓸 때 (실행 비용 0)'],
    avoid: ['물체가 움직여 맞닿는 곳이 바뀌는 장면 — 대신 후처리 구석 그늘(i02) 이나 접촉 그림자(i15)', '정점이 아주 적은 큰 판 — 그늘이 정점 사이로 번진다. 판을 잘게 나누거나 라이트맵'],
    cost: 'light',
    costNote: '실행 중 비용 0 (정점 색 곱하기뿐). 굽기는 정점 수 × 광선 48 — 프레임당 3ms 로 나눠 굽는다.',
    level: 2,
    must: [
      '광선은 법선 쪽 반구로, 코사인 가중 · 나선 배치 + 정점마다 무작위 회전 (줄무늬 막기)',
      '광선 시작점을 법선 쪽으로 살짝(0.003) 띄워 자기 자신에 맞지 않게',
      '먼 물체는 미리 거른다 (중심 거리 > maxD + 반지름 이면 건너뜀)',
      '굽고 나서 이웃 정점 평균 두 번으로 잡음을 줄인다',
      '전/후를 반씩 나눈 비교 막대와 「AO 만 보기」(흰 재질)로 차이를 보여 준다',
    ],
    done: [
      '블록이 바닥에 닿은 곳 · 블록 사이 틈 · 안쪽 구석이 부드럽게 어둡다',
      '나눔 막대 왼쪽(그늘 없음)과 오른쪽(구운 그늘)이 한 화면에서 비교된다',
      '「AO 세기」 · 「광선 거리」 · 「광선 수」 슬라이더로 그늘 넓이 · 진하기 · 매끈함이 바뀐다',
      '구운 뒤에는 FPS 가 그늘 없을 때와 같다',
    ],
    code: {
      lang: 'ts',
      title: '정점 하나의 반구 광선 가림 계산',
      from: 'demos/demosModelB.ts aoDemo() bakeG 를 정리',
      body: `// 코사인 가중 반구 표본 (황금각 나선) — 지역 좌표 (x, y, z=법선 쪽)
const K = 48, maxD = 0.9;
const sdir: number[] = [];
for (let k = 0; k < K; k++) {
  const u = (k + 0.5) / K, ph = k * 2.399963, r = Math.sqrt(u);
  sdir.push(r * Math.cos(ph), r * Math.sin(ph), Math.sqrt(1 - u));
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function aoAt(v: THREE.Vector3, n: THREE.Vector3, near: Prim[], seed: number): number {
  const tA = new THREE.Vector3().crossVectors(Math.abs(n.y) < 0.99 ? UP : EX, n).normalize();
  const tB = new THREE.Vector3().crossVectors(n, tA);
  const rot = seed * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot); // 정점마다 돌려 줄무늬 막기
  const o = v.clone().addScaledVector(n, 0.003);                          // 자기 면에 맞지 않게
  let occ = 0;
  for (let k = 0; k < K; k++) {
    const lx = sdir[k * 3] * cr - sdir[k * 3 + 1] * sr, ly = sdir[k * 3] * sr + sdir[k * 3 + 1] * cr, lz = sdir[k * 3 + 2];
    const d = tA.clone().multiplyScalar(lx).addScaledVector(tB, ly).addScaledVector(n, lz);
    let t = d.y < -1e-6 ? -o.y / d.y : Infinity;                           // 바닥 평면
    for (const p of near) t = Math.min(t, hitPrim(p, o, d));                // 상자 · 구 · 원기둥
    if (t < maxD) occ += 1 - smooth(0.35, 1, t / maxD);                    // 가까울수록 많이 가림
  }
  return 1 - occ / K;
}
// 다 구운 뒤: 이웃 정점 평균 2번 → 정점 색 = lerp(1, Math.pow(ao, 2.2), strength)
// 재질: new THREE.MeshStandardMaterial({ color, vertexColors: true })`,
    },
    pitfalls: [
      { title: '광선을 모든 정점에 같은 방향으로 쏘면 그늘에 줄무늬가 생긴다', fix: '정점마다 표본 묶음을 무작위 각도로 돌리고, 굽은 뒤 이웃 평균을 두 번 낸다.' },
      { title: '시작점을 표면에 딱 붙이면 자기 면에 맞아 온통 시커멓다', fix: '법선 쪽으로 0.003 띄워서 쏜다.' },
      { title: '모든 삼각형과 광선을 맞추면 굽기가 몇 초 걸린다', fix: '견본은 물체를 상자 · 구 · 원기둥 도형으로 보고 맞추며, 먼 물체는 미리 거른다. 진짜 메시면 BVH(three-mesh-bvh)를 쓴다.' },
      { title: '굽는 동안 화면이 멈춘다', fix: '정점 16개마다 시간 검사 후 yield — 프레임당 3ms 예산.', seen: true },
    ],
    prev: ['i241', 'i02'],
    next: ['i452', 'i455'],
    refs: [
      { name: 'Wikipedia — Ambient occlusion', url: 'https://en.wikipedia.org/wiki/Ambient_occlusion' },
    ],
  },

  i455: {
    id: 'i455',
    summary: '섬 표면 삼각형을 넓이에 비례해 무작위로 골라 경사 · 높이 규칙대로 풀잎 · 꽃 · 자갈을 인스턴스로 흩뿌려, 들판이 저절로 채워지게 한다.',
    terms: [
      { en: 'Surface scattering (area-weighted sampling)', ko: '넓이 비례로 표면 위 점 뽑기' },
      { en: 'MeshSurfaceSampler (three/examples)', ko: 'three.js 의 같은 일을 하는 도구' },
      { en: 'Slope / height rules', ko: '기울기 · 높이에 따라 무엇을 놓을지' },
      { en: 'InstancedMesh', ko: '같은 모양 수만 개를 한 번에' },
    ],
    goal: '{target}에 풀잎 · 꽃 · 자갈을 흩뿌려 줘 — 표면을 넓이 비례로 뽑고, 기울기 · 높이 규칙대로 인스턴스로. 분위기는 {style}.',
    targets: ['바다 위 작은 섬 디오라마', '들판 · 마당', '산 언덕'],
    styles: ['파스텔 동화', '싱그러운 봄', '늦가을'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Terrain 의 Detail(풀) · Tree 칠하기, 또는 Graphics.RenderMeshInstanced 로 같은 규칙.',
      godot: 'Godot 은 MultiMeshInstance3D 의 Populate Surface 가 같은 일 (기울기 규칙은 직접).',
    },
    principle: [
      '삼각형마다 넓이를 재서 누적 합 표를 만든다. 0 ~ 전체 넓이 무작위 수를 이분 탐색하면 넓은 삼각형이 더 자주 뽑힌다.',
      '삼각형 안 점은 무게중심 좌표(u, v, u+v>1 이면 뒤집기)로 고르게, 법선도 같은 비율로 섞는다.',
      '규칙: 물 아래는 가끔 자갈, 모래 높이엔 자갈 조금, 법선 y 가 경사 문턱(0.82)보다 작은 비탈엔 돌, 나머지 풀밭엔 풀 · 꽃 무리.',
      '꽃은 잡음 무리(patch > 0.52)에서만, 풀은 잡음으로 짙고 옅게 — 고르게 흩지 않고 무리 지어 자연스럽다.',
      '풀 · 꽃 · 자갈은 종류마다 InstancedMesh 하나, 언덕에서 멀수록 늦게 피어나게(birth) 한다.',
    ],
    when: ['섬 · 들판 · 마당을 빈틈없이 채우되 손으로 놓기 힘들 때', '지형이 바뀌어도 장식이 저절로 따라오게 하고 싶을 때'],
    avoid: ['바닥이 평평한 네모 판 — 그냥 격자 + 흔들기로 충분', '장식 하나하나를 고르고 움직여야 할 때 — 인스턴스는 개별 조작이 번거롭다'],
    cost: 'medium',
    costNote: '표본 2만 6천 번(밀도 1) → 풀 · 꽃 · 자갈 인스턴스 수천 ~ 1만여 개, 그리기는 종류마다 1번. 그림자를 켜는 종류는 골라서.',
    level: 1,
    must: [
      '넓이 비례 표본 (누적 합 + 이분 탐색) — 정점이나 격자에서 고르면 비탈 · 작은 삼각형에 몰린다',
      '삼각형 안 점은 u + v > 1 이면 (1−u, 1−v) 로 뒤집어 고르게',
      '놓는 규칙은 높이(물 · 모래 · 풀밭)와 기울기(법선 y 와 문턱)로',
      '꽃 · 풀은 잡음으로 무리를 지어 — 고른 흩뿌리기는 지저분해 보인다',
      '종류마다 InstancedMesh 하나, 세우는 방향은 위쪽과 법선 사이(풀 0.3 · 자갈 1)',
    ],
    done: [
      '섬이 생기고 언덕 쪽부터 풀 · 꽃 · 자갈이 차례로 피어난다',
      '비탈에는 풀 대신 돌이, 바닷가에는 자갈이, 풀밭에는 꽃 무리가 놓인다',
      '「경사 문턱」 슬라이더를 올리면 풀이 자라는 비탈이 줄고, 「밀도」로 양이 바뀐다',
      '「흩뿌리기」를 끄면 맨 섬만 남아 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '넓이 비례 표면 표본 + 높이 · 경사 규칙',
      from: 'demos/demosModelB.ts areaSampler() · scatterDemo() 를 정리',
      body: `function areaSampler(geo: THREE.BufferGeometry, rng: () => number) {
  const P = geo.getAttribute('position').array as Float32Array;
  const Nn = geo.getAttribute('normal').array as Float32Array;
  const I = geo.getIndex()!.array;
  const T = I.length / 3, cum = new Float32Array(T);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let tot = 0;
  for (let t = 0; t < T; t++) {
    a.fromArray(P, I[t * 3] * 3); b.fromArray(P, I[t * 3 + 1] * 3); c.fromArray(P, I[t * 3 + 2] * 3);
    tot += 0.5 * b.sub(a).cross(c.sub(a)).length(); // 삼각형 넓이
    cum[t] = tot;
  }
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    const r = rng() * tot;
    let lo = 0, hi = T - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } // 이분 탐색
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; } // 삼각형 안으로
    const w = 1 - u - v, ia = I[lo * 3] * 3, ib = I[lo * 3 + 1] * 3, ic = I[lo * 3 + 2] * 3;
    p.set(P[ia] * w + P[ib] * u + P[ic] * v, P[ia + 1] * w + P[ib + 1] * u + P[ic + 1] * v, P[ia + 2] * w + P[ib + 2] * u + P[ic + 2] * v);
    n.set(Nn[ia] * w + Nn[ib] * u + Nn[ic] * v, Nn[ia + 1] * w + Nn[ib + 1] * u + Nn[ic + 1] * v, Nn[ia + 2] * w + Nn[ib + 2] * u + Nn[ic + 2] * v).normalize();
  };
}

const sample = areaSampler(islandGeo, rng);
for (let i = 0; i < 26000 * density; i++) {
  sample(p, n);
  const r = rng();
  if (p.y < -0.03) { if (r < 0.03) addPebble(p, n); }           // 물 아래
  else if (p.y < 0.075) { if (r < 0.12) addPebble(p, n); }      // 모래
  else if (n.y < th) { if (r < 0.06) addPebble(p, n); }         // 비탈 (th = 0.82)
  else {
    const patch = fbm2(p.x * 2.4, p.z * 2.4, s + 11, 3);         // 무리 짓기
    if (patch > 0.52 && r < 0.22 && n.y > th + 0.05) addFlower(p, n);
    else if (r < 0.8 * smooth(0.3, 0.55, patch + 0.25)) addGrass(p, n);
  }
}`,
    },
    pitfalls: [
      { title: '정점 위치에서 고르면 작은 삼각형이 많은 곳에 장식이 몰린다', fix: '삼각형 넓이 누적 합으로 뽑아야 넓이당 개수가 고르다.' },
      { title: 'u, v 를 그냥 쓰면 점의 절반이 삼각형 밖으로 나간다', fix: 'u + v > 1 이면 둘 다 1 에서 빼서 안으로 접는다.' },
      { title: '풀 · 꽃을 고르게 흩으면 지저분해 보인다', fix: '잡음으로 무리(patch)를 만들어 같은 색 꽃끼리 모이게 한다. 이 사이트의 강 건너기도 「흩뿌리기는 지저분」 지적을 받고 무리로 바꿨다.', seen: true },
      { title: '풀잎마다 그림자를 켜면 그림자 지도가 무거워진다', fix: '그림자는 꽃 · 자갈 같은 큰 것만, 풀은 받기만 한다.' },
    ],
    prev: ['u36', 'i452'],
    next: ['i538', 'i13'],
    refs: [
      { name: 'three.js 예제 — webgl_instancing_scatter', url: 'https://threejs.org/examples/#webgl_instancing_scatter' },
    ],
  },

  i456: {
    id: 'i456',
    summary: '골반 → 척추 → 머리 · 팔 · 다리 뼈 16개를 코드로 하나씩 세우고 메시에 묶어, 뼈를 돌리면 살이 따라 움직이게 한다.',
    terms: [
      { en: 'Skeletal rigging (Bone · Skeleton · SkinnedMesh)', ko: '뼈대 만들고 살(메시)에 묶기' },
      { en: 'Bone hierarchy (parent-relative position)', ko: '부모 뼈 기준 위치로 쌓는 뼈 계층' },
      { en: 'skinIndex · skinWeight attributes', ko: '정점마다 어느 뼈를 얼마나 따를지 (4개씩)' },
      { en: 'SkinnedMesh.bind', ko: '지금 자세를 쉬는 자세로 묶기' },
    ],
    goal: '{target}에 코드로 뼈대를 세워 줘 — 골반 · 척추 · 가슴 · 목 · 머리 · 팔 · 다리 계층을 만들고 메시에 묶어, 뼈를 돌리면 살이 따라오게. 분위기는 {style}.',
    targets: ['점토 곰 캐릭터', '블록 로봇', '동물 · 꼬리 달린 생물'],
    styles: ['말랑한 점토 인형', '귀엽고 아기자기', '장난감 피규어'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Transform 계층 + SkinnedMeshRenderer (bones · rootBone · sharedMesh.bindposes · boneWeights).',
      godot: 'Godot 은 Skeleton3D 에 add_bone · set_bone_parent · set_bone_rest, 메시는 Skin 리소스로 묶는다.',
    },
    principle: [
      '뼈마다 이름 · 부모 · 머리(시작) · 꼬리(끝) 위치를 표로 적는다 (견본 16개: 뿌리 · 골반 · 척추 · 가슴 · 목 · 머리 · 팔 4 · 다리 6).',
      'three.js 뼈는 부모 기준 위치를 쓰므로, 뼈 위치 = 자기 머리 − 부모 머리.',
      '메시 정점에는 skinIndex(뼈 번호 4개) · skinWeight(비율 4개)를 붙인다.',
      '뿌리 뼈를 메시에 붙이고 updateMatrixWorld 한 뒤 mesh.bind(new Skeleton(bones)) — 이때 자세가 쉬는 자세가 된다.',
      '그 뒤엔 bone.quaternion 만 바꾸면 GPU 가 살을 따라 움직인다. 눈 · 코 같은 소품은 머리뼈에 add 한다.',
    ],
    when: ['GLB 없이 코드로 만든 캐릭터를 움직여야 할 때', '뼈 위치 · 수를 게임마다 다르게 정하고 싶을 때', 'IK · 절차 걷기 같은 코드 애니메이션의 바탕'],
    avoid: ['이미 뼈가 들어 있는 모델 — GLTFLoader 로 그대로 쓴다(i467)', '모양이 통째로만 움직이는 블록 캐릭터 — 부품을 그룹에 붙여 돌리는 편이 간단'],
    cost: 'light',
    costNote: '뼈 16개 스키닝은 GPU 정점 셰이더에서 — 폰에서도 가볍다. 무거운 건 가중치 계산(한 번)뿐.',
    level: 2,
    must: [
      '뼈 위치는 부모 기준 (자기 머리 − 부모 머리) — 세계 좌표를 그대로 넣으면 뼈가 두 배로 밀려난다',
      'bind 전에 mesh.updateMatrixWorld(true) — 안 하면 쉬는 자세가 틀어진다',
      '정점마다 skinIndex · skinWeight 4칸, 가중치 합은 1',
      '뼈 보기(막대)와 살 반투명 켬/끔으로 뼈와 살의 관계를 보여 준다',
      'frustumCulled = false (뼈가 움직이면 원래 경계 상자 밖으로 나간다)',
    ],
    done: [
      '뼈가 뿌리부터 하나씩 자라나 뼈대가 서고, 그 위에 살이 입혀진다',
      '뼈를 돌리면(인사하는 왼팔 · 흔드는 머리) 살이 함께 굽는다',
      '「뼈 보기」 · 「살 보기」 · 「살 반투명」으로 안팎을 따로 볼 수 있다',
      '「처음부터 뼈 세우기」로 과정을 다시 볼 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '뼈 표 → Bone 계층 → SkinnedMesh 묶기',
      from: 'demos/demosRigA.ts BONES · makeChar() 를 정리',
      body: `type P3 = [number, number, number];
const BONES: { name: string; parent: number; head: P3 }[] = [
  { name: 'root', parent: -1, head: [0, 0, 0] },
  { name: 'hips', parent: 0, head: [0, 0.8, 0] },
  { name: 'spine', parent: 1, head: [0, 0.98, 0] },
  { name: 'chest', parent: 2, head: [0, 1.14, 0] },
  { name: 'neck', parent: 3, head: [0, 1.3, 0] },
  { name: 'head', parent: 4, head: [0, 1.42, 0] },
  { name: 'upperArm.L', parent: 3, head: [0.24, 1.18, 0] },
  // ... foreArm · thigh · shin · foot (양쪽)
];

// geo 에는 position · normal 과 함께 skinIndex(Uint16, 4) · skinWeight(Float32, 4) 가 있어야 한다
const mesh = new THREE.SkinnedMesh(geo, mat);
mesh.frustumCulled = false;
const bones: THREE.Bone[] = [];
BONES.forEach((d, i) => {
  const bn = new THREE.Bone();
  bn.name = d.name;
  const ph = d.parent >= 0 ? BONES[d.parent]!.head : [0, 0, 0];
  bn.position.set(d.head[0] - ph[0], d.head[1] - ph[1], d.head[2] - ph[2]); // 부모 기준!
  if (d.parent >= 0) bones[d.parent]!.add(bn);
  bones[i] = bn;
});
mesh.add(bones[0]!);
mesh.updateMatrixWorld(true);       // 이 자세가 쉬는 자세
mesh.bind(new THREE.Skeleton(bones));
scene.add(mesh, new THREE.SkeletonHelper(mesh)); // 뼈 보기

// 움직이기: 뼈 회전만 바꾼다
const B = (n: string) => bones.find((b) => b.name === n)!;
B('upperArm.L').quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.75); // 팔 들어 인사
// 소품은 뼈에: B('head').add(eyeGroup);`,
    },
    pitfalls: [
      { title: '뼈 위치에 세계 좌표를 넣으면 자식 뼈가 멀리 날아간다', fix: '부모 머리 위치를 빼서 부모 기준으로 넣는다.' },
      { title: 'bind 전에 행렬을 갱신하지 않으면 살이 엉뚱하게 비틀린다', fix: 'mesh.add(뿌리) → mesh.updateMatrixWorld(true) → mesh.bind(skeleton) 순서를 지킨다.' },
      { title: '캐릭터가 화면 가장자리에서 갑자기 사라진다', fix: 'SkinnedMesh 의 경계 상자는 쉬는 자세 기준이다. frustumCulled = false 로 둔다.' },
      { title: '가중치 합이 1이 아니면 살이 줄거나 부푼다', fix: '네 칸 가중치를 합으로 나눠 1로 맞춘다.' },
    ],
    prev: ['u36'],
    next: ['i457', 'i459', 'i458'],
    refs: [
      { name: 'three.js 문서 — SkinnedMesh', url: 'https://threejs.org/docs/#api/en/objects/SkinnedMesh' },
    ],
  },

  i457: {
    id: 'i457',
    summary: '정점마다 뼈 막대까지 거리로 가중치를 주고 표면 이웃과 열 번 평균 내 퍼뜨린 뒤 큰 넷만 남겨, 팔꿈치 · 무릎이 접혀도 덜 찌그러지게 한다.',
    terms: [
      { en: 'Automatic skin weights (distance-based)', ko: '뼈까지 거리로 정하는 자동 스킨 가중치' },
      { en: 'Weight smoothing (Laplacian diffusion)', ko: '표면 이웃과 평균 내 가중치 퍼뜨리기' },
      { en: 'Top-4 influences, normalized', ko: '정점당 가장 큰 뼈 4개, 합 1' },
      { en: 'Weight heat map', ko: '뼈 하나의 가중치를 색으로 보기' },
    ],
    goal: '{target}에 스킨 가중치를 자동으로 줘 — 뼈 막대까지 거리로, 표면 이웃과 평균 내 부드럽게, 정점당 뼈 4개까지. 분위기는 {style}.',
    targets: ['점토 곰 (팔 · 다리 접기)', '꼬리 · 촉수', '동물 캐릭터'],
    styles: ['말랑한 점토', '귀엽고 아기자기', '장난감 피규어'],
    platforms: ['three', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 보통 Blender 의 Automatic Weights 로 굽는다. 런타임에선 Mesh.SetBoneWeights 로 같은 계산 결과를 넣는다.',
      godot: 'Godot 도 Blender 에서 구워 오고, 런타임 계산이면 ArrayMesh 의 ARRAY_BONES · ARRAY_WEIGHTS 에 넣는다.',
    },
    principle: [
      '정점에서 각 뼈 막대(머리 ~ 꼬리 선분)까지 거리를 재고, 그 뼈의 살 두께(r × 0.85)를 뺀다 (+0.025 로 0 나누기 막기).',
      '가중치 = 1 / 거리⁴ 를 모든 뼈에 대해 계산하고 합 1로 나눈다 — 가까운 뼈가 압도적으로 크다.',
      '표면 이웃(삼각형으로 이어진 정점)과 평균 내기를 10번: 새 값 = 자기 0.4 + 이웃 평균 0.6. 관절 둘레로 고르게 번진다.',
      '정점마다 가장 큰 넷만 남기고 다시 합 1로 — GPU 스키닝은 4개까지다.',
      '「가까운 뼈 하나만(가중치 1)」과 나란히 비교하면 팔꿈치가 꺾여 찌그러지는 차이가 보인다.',
    ],
    when: ['코드로 만든 메시(SDF · 서브디비전 등)에 뼈를 묶을 때', '관절이 많이 접히는 팔 · 다리 · 꼬리'],
    avoid: ['이미 가중치가 들어 있는 GLB — 다시 계산하지 않는다', '정밀한 얼굴 · 손가락 — 거리만으론 부족해 손으로 다듬어야 한다'],
    cost: 'medium',
    costNote: '정점 n × 뼈 16 × 평균 10번 — 수만 정점이면 수백 ms. 견본은 시작 때 한 번, 프레임당 2ms 로 나눠 굽고 캐시한다. 실행 중 비용은 0.',
    level: 3,
    must: [
      '거리는 뼈 「점」이 아니라 뼈 「선분」까지, 살 두께를 빼고',
      '평균 내기는 3D 거리 이웃이 아니라 표면 이웃(삼각형 연결)으로 — 붙어 있는 다리끼리 가중치가 새지 않게',
      '정점당 큰 넷만 남기고 합 1로 다시 나누기',
      '굽기는 프레임 예산(2ms)으로 나눠 — 화면 멈춤 없이 「만드는 중」 표시',
      '뼈 하나를 고르면 가중치를 열 지도 색으로 보여 준다',
    ],
    done: [
      '왼쪽 「가까운 뼈 하나만」은 팔꿈치 · 무릎에서 살이 꺾여 찌그러지고, 오른쪽 「여러 뼈 + 부드럽게」는 둥글게 굽는다',
      '뼈를 고르면 그 뼈 가중치가 빨강(1) → 파랑(0) 열 지도로 칠해지고, 관절 둘레가 부드럽게 넘어간다',
      '같은 동작을 두 곰이 함께 하므로 차이가 한눈에 보인다',
    ],
    code: {
      lang: 'ts',
      title: '거리⁻⁴ 가중치 → 표면 평균 10번 → 큰 넷만',
      from: 'demos/demosRigA.ts bear 굽기 6 ~ 8 단계를 정리',
      body: `// 6) 거리 가중치 (뼈 0 = 뿌리는 제외)
const full = new Float32Array(n * NB);
for (let i = 0; i < n; i++) {
  p.fromArray(pos, i * 3);
  let sum = 0;
  for (let b = 1; b < NB; b++) {
    const B = BONES[b]!;
    const d = Math.max(segDist(p, B.head, B.tail) - B.r * 0.85, 0) + 0.025; // 선분까지 − 살 두께
    const w = 1 / (d * d * d * d);
    full[i * NB + b] = w;
    sum += w;
  }
  for (let b = 1; b < NB; b++) full[i * NB + b] /= sum;
}
// 7) 표면 이웃과 평균 10번 (nbr · deg = 정점별 이웃 목록 CSR)
let cur = full, next = new Float32Array(n * NB);
for (let it = 0; it < 10; it++) {
  for (let i = 0; i < n; i++) {
    const s0 = deg[i], s1 = deg[i + 1], inv = s1 > s0 ? 0.6 / (s1 - s0) : 0;
    for (let b = 1; b < NB; b++) {
      let s = 0;
      for (let k = s0; k < s1; k++) s += cur[nbr[k] * NB + b];
      next[i * NB + b] = s1 > s0 ? cur[i * NB + b] * 0.4 + s * inv : cur[i * NB + b];
    }
  }
  [cur, next] = [next, cur];
}
// 8) 큰 넷만, 합 1
const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
for (let i = 0; i < n; i++) {
  const top = [...Array(NB - 1).keys()].map((k) => k + 1).sort((a, b) => cur[i * NB + b] - cur[i * NB + a]).slice(0, 4);
  const s = top.reduce((acc, b) => acc + cur[i * NB + b], 0);
  top.forEach((b, k) => { si[i * 4 + k] = b; sw[i * 4 + k] = s > 0 ? cur[i * NB + b] / s : 0; });
}
geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));`,
    },
    pitfalls: [
      { title: '3D 거리로만 평균 내면 붙어 있는 두 다리 사이로 가중치가 샌다', fix: '삼각형으로 이어진 표면 이웃끼리만 평균 낸다.' },
      { title: '거리⁻¹ · ⁻² 처럼 약하게 주면 먼 뼈가 살을 당겨 몸이 흐물흐물하다', fix: '견본은 거리⁻⁴ 로 가까운 뼈를 압도적으로 만든 뒤, 평균 내기로 관절 둘레만 부드럽게 한다.' },
      { title: '뼈를 5개 넘게 남기면 GPU 스키닝이 버린다', fix: '정점당 가장 큰 넷만 남기고 합 1로 다시 나눈다.' },
      { title: '수만 정점 굽기를 한 번에 돌리면 시작이 멈춘다', fix: '정점 128개마다 yield — 프레임당 2ms 예산으로 나눠 굽고, 결과는 캐시해 다른 견본도 같이 쓴다.', seen: true },
    ],
    prev: ['i456'],
    next: ['i459', 'i462'],
  },

  i458: {
    id: 'i458',
    summary: '속도 하나에서 걸음 폭 · 박자 · 팔 흔들기 · 골반 오르내림을 식으로 계산하고 발은 두 뼈 IK 로 놓아, 애니메이션 파일 없이 가만히 → 걷기 → 뛰기가 이어진다.',
    terms: [
      { en: 'Procedural locomotion (gait cycle)', ko: '식으로 만드는 걷기 · 뛰기 (걸음 주기)' },
      { en: 'Stance / swing phase · duty factor', ko: '발이 땅에 있는 구간 / 떠 있는 구간 · 디딤 비율' },
      { en: 'Two-bone IK foot placement', ko: '발목 목표를 정하고 넓적다리 · 정강이를 IK 로' },
      { en: 'Pelvis bob · arm counter-swing', ko: '골반 오르내림 · 다리와 반대로 팔 흔들기' },
    ],
    goal: '{target}을(를) 애니메이션 파일 없이 걷고 뛰게 해 줘 — 속도 하나로 걸음 폭 · 박자 · 팔 · 골반이 저절로, 발은 땅에서 미끄러지지 않게. 분위기는 {style}.',
    targets: ['점토 곰 (러닝머신 땅)', '블록 캐릭터', '두 발 로봇'],
    styles: ['말랑하고 귀여운', '씩씩한 행진', '바쁜 달리기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animation Rigging 패키지의 Two Bone IK Constraint + 스크립트로 걸음 주기.',
      godot: 'Godot 은 SkeletonIK3D (또는 4.x 의 TwoBoneIK3D) + 스크립트로 발 목표.',
    },
    principle: [
      '걸음 주기 phase 를 0 → 1 로 돌린다: phase += (속도 ÷ 한 주기 길이 Lc) × dt. 오른발은 반 주기 뒤.',
      '디딤 비율 D(걷기 0.62 → 뛰기 0.34): phase < D 면 발이 땅에서 뒤로 밀리고(z = Lc·D·(0.5 − u)), 나머지는 들어 올려 앞으로.',
      '땅이 속도 × dt 만큼 흐르고 디딤 중 발도 같은 속도로 뒤로 가므로 발이 미끄러지지 않는다.',
      '발목 목표를 정하면 두 뼈 IK 가 넓적다리 · 정강이 각도를 정한다. 무릎 방향은 앞(pole).',
      '골반은 주기의 두 배 박자로 오르내리고, 몸은 앞으로 숙이고(뛰기 0.16), 팔은 다리와 반대로 흔들며 뛸 땐 팔꿈치를 굽힌다.',
    ],
    when: ['속도가 계속 바뀌는 캐릭터 — 클립 섞기 없이 부드럽게', '지형 · 크기가 다른 캐릭터마다 걸음을 맞춰야 할 때', '애니메이션 파일을 만들 수 없을 때'],
    avoid: ['춤 · 공격 같은 개성 있는 동작 — 손으로 만든 클립이 낫다(i464)', '사실적인 사람 걸음 — 모션 캡처 클립이 자연스럽다'],
    cost: 'light',
    costNote: '뼈 몇 개의 회전 계산 + 다리 두 개 IK — 한 캐릭터당 0.1ms 도 안 된다.',
    level: 2,
    must: [
      '속도는 바로 바꾸지 말고 부드럽게 따라가기 (damp — 시간 상수 0.6초)',
      '걸음 폭 · 디딤 비율 · 숙임 · 팔 흔들기를 모두 속도 함수로 — 걷기 ↔ 뛰기 사이는 sstep 으로 섞기',
      '디딤 중 발의 뒤로 가는 속도 = 땅이 흐르는 속도 (발 미끄러짐 없음)',
      '발은 두 뼈 IK 로, 무릎은 앞쪽 pole',
      '발 디딤 자리에 고리를 찍어, 고리 안에서 발이 안 움직이는지 보여 준다',
    ],
    done: [
      '가만히(숨쉬기) → 걷기 → 뛰기 → 걷기 → 가만히가 14초마다 끊김 없이 이어진다',
      '뛸 때 걸음이 넓어지고 박자가 빨라지며, 몸이 숙고, 팔꿈치가 굽어 크게 흔들린다',
      '발 디딤 고리가 땅과 함께 흘러가고 발은 고리 안에 머문다 (미끄러지지 않음)',
      '「속도」 0 ~ 3.2 슬라이더로 어떤 속도든 자연스러운 걸음이 나온다',
    ],
    code: {
      lang: 'ts',
      title: '속도 → 걸음 주기 → 발목 목표 → 두 뼈 IK',
      from: 'demos/demosRigA.ts i458 update() 를 정리',
      body: `cur += (want - cur) * (1 - Math.exp(-dt / 0.6));      // 속도는 부드럽게
const v = cur < 0.01 ? 0 : cur;
const run = sstep(1.3, 2.1, v);                          // 0 걷기 → 1 뛰기
const g = sstep(0.02, 0.35, v);                          // 0 가만히 → 1 움직임
const Lc = lerp(0.3 + 0.5 * Math.min(v, 1) + 0.12 * Math.max(v - 1, 0), 0.8 + 0.3 * v, run); // 한 주기 길이
const D = lerp(0.62, 0.34, run);                         // 디딤 비율
phase = frac(phase + (v / Lc) * dt);
groundTex.offset.y -= (v * dt) / TILE;                   // 땅이 흐름

const mid = 4 * Math.PI * (phase - D / 2);
hips.position.y = 0.8 - (0.012 + 0.02 * Math.min(v, 1) + 0.075 * run) * g
  + lerp(0.022 * Math.min(v, 1) * Math.cos(mid), -0.04 * Math.cos(mid), run) * g;

['L', 'R'].forEach((s, i) => {
  const side = i === 0 ? 1 : -1;
  const p = frac(phase + (i === 0 ? 0 : 0.5));
  const half = (Lc * D) / 2;
  let z: number, lift = 0;
  if (p < D) z = Lc * D * (0.5 - p / D);                 // 디딤: 땅과 같은 속도로 뒤로
  else {
    const u = (p - D) / (1 - D);                          // 들어서 앞으로
    z = -half + 2 * half * (0.5 - 0.5 * Math.cos(Math.PI * u));
    lift = (0.05 + 0.05 * Math.min(v, 1) + 0.07 * run) * Math.sin(Math.PI * u) ** 1.2;
  }
  target.set(side * 0.16, ANKLE_Y + lift * g, z * g);
  char.localToWorld(target);
  twoBoneIK(bone('thigh.' + s), bone('shin.' + s), ANKLE_LOCAL, target, new THREE.Vector3(side * 0.12, 0, 1));
});
// 팔: 다리와 반대로 — upperArm.L = qX(armA * cos(2π·phase)), 뛸 땐 팔꿈치 0.22 → 1.5 rad`,
    },
    pitfalls: [
      { title: '디딤 중 발이 뒤로 가는 속도가 땅과 다르면 발이 스케이트 타듯 미끄러진다', fix: '한 주기 동안 땅이 가는 거리 = Lc, 디딤 동안 발이 뒤로 가는 거리 = Lc·D 가 되게 박자(v / Lc)를 맞춘다.' },
      { title: '속도를 바로 바꾸면 걸음이 툭 끊긴다', fix: '속도를 damp 로 부드럽게 따라가고, 걷기 ↔ 뛰기 값은 sstep 으로 섞는다.' },
      { title: 'IK 무릎이 뒤로 꺾인다', fix: 'pole 벡터를 캐릭터 앞쪽(+z)으로 준다. 견본은 (±0.12, 0, 1) 을 캐릭터 회전으로 돌려 쓴다.' },
      { title: '가만히 있을 때 완전히 멈추면 인형 같다', fix: '움직임 정도 g 가 0 일 때도 골반 · 가슴을 sin(t × 2.4) 로 아주 조금 숨쉬게 한다.' },
    ],
    prev: ['i459', 'i456'],
    next: ['i465', 'i464'],
  },

  i460: {
    id: 'i460',
    summary: '관절 사슬을 끝 → 뿌리, 뿌리 → 끝으로 번갈아 당기는 FABRIK 로 촉수 끝이 목표를 따라가게 하고, 관절마다 굽는 각도를 제한한다.',
    terms: [
      { en: 'FABRIK (Forward And Backward Reaching IK)', ko: '앞뒤로 번갈아 당기는 사슬 IK' },
      { en: 'Joint angle constraint (cone limit)', ko: '관절마다 굽는 각도 제한' },
      { en: 'Chain IK → bone rotation', ko: '관절 위치를 뼈 회전으로 바꾸기' },
      { en: 'CCD IK', ko: '다른 사슬 IK 방법 (three.js CCDIKSolver)' },
    ],
    goal: '{target}을(를) 사슬 IK(FABRIK)로 움직여 줘 — 끝이 목표를 따라가고, 관절마다 굽는 각도는 제한. 분위기는 {style}.',
    targets: ['화분에서 자란 촉수 (반딧불 따라가기)', '꼬리 · 뱀', '로봇 팔'],
    styles: ['귀엽고 말랑한', '신비한 밤 정원', '기계 장치'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animation Rigging 의 Chain IK Constraint (FABRIK 방식).',
      godot: 'Godot 4 는 SkeletonModification 의 FABRIK (2D · 3D) 또는 4.x 의 FABRIK3D.',
    },
    principle: [
      '관절 위치 p0(뿌리) ~ pn(끝), 마디 길이 l 은 고정.',
      '뒤로: 끝 pn 을 목표에 두고, 끝에서 뿌리 쪽으로 각 관절을 앞 관절에서 l 거리에 다시 놓는다.',
      '앞으로: 뿌리 p0 를 제자리에 두고, 뿌리에서 끝 쪽으로 같은 일을 하면서 앞 마디와의 각이 제한(32°)을 넘으면 제한까지 돌린다.',
      '이 두 번을 끝이 목표에 닿을(1mm) 때까지 최대 8번 되풀이한다.',
      '관절 위치가 정해지면 뼈마다 「부모 기준 위쪽 → 다음 관절 방향」 회전을 setFromUnitVectors 로 넣어 SkinnedMesh 를 굽힌다.',
    ],
    when: ['관절이 많은 꼬리 · 촉수 · 목 · 뱀 · 로봇 팔', '끝이 목표를 따라가야 할 때 (먹이 쫓기 · 가리키기)'],
    avoid: ['관절이 둘뿐인 팔 · 다리 — 대신 두 뼈 IK(i459) 가 정확하고 빠르다', '물리로 출렁여야 하는 꼬리 — 대신 흔들리는 뼈(i462)'],
    cost: 'light',
    costNote: '관절 12개 × 8번 되풀이 — 0.05ms 수준. 사슬 수십 개도 가볍다.',
    level: 2,
    must: [
      '마디 길이는 늘 같게 — 당길 때 방향만 바꾸고 길이는 l 로 다시 놓는다',
      '앞으로 단계에서 앞 마디 방향과의 각을 제한 (첫 마디는 위쪽 기준)',
      '되풀이는 끝이 목표에 닿으면 멈추고, 최대 횟수(8)로 묶는다',
      '닿지 못하는 목표면 끝 → 목표 사이에 선을 그려 보여 준다',
      '관절 수 · 각도 제한 슬라이더로 사슬 성격을 바꿀 수 있게',
    ],
    done: [
      '반딧불이 날아다니면 촉수 끝이 따라가며 몸 전체가 부드럽게 휜다',
      '「관절마다 굽는 각도 제한」을 5° 로 줄이면 뻣뻣해져 닿지 못하고 선이 보이며, 90° 면 마구 꺾인다',
      '「관절 수」 3 ~ 24 로 바꾸면 각진 팔 ↔ 매끈한 촉수가 된다',
      '마우스로 목표를 직접 움직일 수 있다',
    ],
    code: {
      lang: 'ts',
      title: 'FABRIK 한 번 + 각도 제한 + 뼈 회전',
      from: 'demos/demosRigA.ts i460 solve() 를 정리',
      body: `const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3(), prev = new THREE.Vector3(), ax = new THREE.Vector3();
function solve(p: THREE.Vector3[], base: THREE.Vector3, target: THREE.Vector3, l: number, maxA: number) {
  const n = p.length - 1;
  for (let it = 0; it < 8; it++) {
    // 뒤로: 끝을 목표에, 뿌리 쪽으로 l 씩
    p[n]!.copy(target);
    for (let i = n - 1; i >= 0; i--) {
      dir.subVectors(p[i]!, p[i + 1]!).normalize();
      p[i]!.copy(p[i + 1]!).addScaledVector(dir, l);
    }
    // 앞으로: 뿌리를 제자리에, 끝 쪽으로 l 씩 + 각도 제한
    p[0]!.copy(base);
    for (let i = 1; i <= n; i++) {
      dir.subVectors(p[i]!, p[i - 1]!).normalize();
      if (i === 1) prev.copy(UP); else prev.subVectors(p[i - 1]!, p[i - 2]!).normalize();
      const ang = Math.acos(THREE.MathUtils.clamp(prev.dot(dir), -1, 1));
      if (ang > maxA) {
        ax.crossVectors(prev, dir);
        if (ax.lengthSq() < 1e-10) ax.set(1, 0, 0);
        dir.copy(prev).applyAxisAngle(ax.normalize(), maxA); // 제한까지만 굽기
      }
      p[i]!.copy(p[i - 1]!).addScaledVector(dir, l);
    }
    if (p[n]!.distanceTo(target) < 1e-3) break;
  }
}
// 관절 위치 → 뼈 회전 (부모 회전을 빼고)
const qW = new THREE.Quaternion(), qInv = new THREE.Quaternion();
for (let i = 0; i < n; i++) {
  dir.subVectors(p[i + 1]!, p[i]!).normalize().applyQuaternion(qInv.copy(qW).invert());
  bones[i]!.quaternion.setFromUnitVectors(UP, dir);
  qW.multiply(bones[i]!.quaternion);
}`,
    },
    pitfalls: [
      { title: '각도 제한을 「뒤로」 단계에도 걸면 사슬이 목표 쪽으로 못 간다', fix: '견본처럼 뿌리에서 나가는 「앞으로」 단계에서만 제한한다.' },
      { title: '두 마디가 정확히 일직선이거나 반대면 회전축이 0 이 된다', fix: '외적 길이가 0 에 가까우면 아무 축(1, 0, 0)을 쓴다.' },
      { title: '관절 위치를 그대로 뼈 회전으로 넣으면 부모 회전이 겹쳐 꼬인다', fix: '누적 회전 qW 의 역으로 방향을 부모 기준으로 바꾼 뒤 setFromUnitVectors.' },
    ],
    prev: ['i459'],
    next: ['i462', 'i465'],
    refs: [
      { name: 'three.js 예제 — webgl_animation_skinning_ik (CCDIKSolver)', url: 'https://threejs.org/examples/#webgl_animation_skinning_ik' },
    ],
  },

  i461: {
    id: 'i461',
    summary: '목표를 볼 때 눈이 먼저 빠르게 돌고 머리 · 목은 각도 제한 안에서 천천히 뒤따르며, 크게 돌 때 깜빡여 캐릭터가 살아 있어 보이게 한다.',
    terms: [
      { en: 'Look-at with constraints (head · eye tracking)', ko: '각도 제한이 있는 시선 따라가기' },
      { en: 'Eye-head coordination', ko: '눈이 먼저 · 머리가 뒤따라' },
      { en: 'Exponential damping (1 − e^(−dt/τ))', ko: '프레임 속도와 무관한 부드러운 따라가기' },
      { en: 'Procedural blinking', ko: '무작위 간격 깜빡임' },
    ],
    goal: '{target}이(가) 움직이는 목표를 바라보게 해 줘 — 눈이 먼저 · 머리가 뒤따라, 목은 각도 제한, 사이사이 깜빡임. 분위기는 {style}.',
    targets: ['나비를 보는 점토 곰', '마스코트 캐릭터', 'NPC · 상점 주인'],
    styles: ['호기심 많은 귀여운', '느긋한', '경계하는'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animation Rigging 의 Multi-Aim Constraint (목 · 머리 · 눈 따로, 제한 각도) 또는 Animator.SetLookAtWeight (휴머노이드).',
      godot: 'Godot 4 는 LookAtModifier3D (4.4+) 또는 스크립트로 뼈 포즈를 돌린다.',
    },
    principle: [
      '머리 위치에서 목표까지 방향의 좌우각(yaw) · 위아래각(pitch)을 atan2 로 구한다.',
      '목은 제한 각(견본 50°) 안으로 자르고, 넘친 만큼은 가슴이 조금(× 0.5, 최대 0.35) 더 돌아 준다.',
      '머리 각은 느리게(τ 0.32초), 눈은 머리 기준으로 남은 각을 빠르게(τ 0.045초) 따라가며 눈도 ±0.6 · ±0.45 로 제한한다.',
      '돌림은 가슴 · 목 · 머리에 나눠 준다 (목 0.35 · 머리 0.5) — 한 뼈만 돌리면 목이 부러진 듯하다.',
      '깜빡임은 1.8 ~ 4.4초 무작위 간격, 0.07초 감고 0.1초 뜬다. 머리를 크게 돌기 시작할 때도 깜빡인다.',
    ],
    when: ['마스코트 · NPC 가 플레이어나 물건을 쳐다봐야 할 때', '가만히 서 있는 캐릭터에 생기를 줄 때'],
    avoid: ['목표가 등 뒤로 자주 가는 장면 — 제한 때문에 못 따라간다. 몸 전체를 돌리는 동작과 함께 쓴다'],
    cost: 'light',
    costNote: '뼈 몇 개 회전 계산뿐 — 캐릭터 수십 명도 가볍다.',
    level: 1,
    must: [
      '목 돌림은 각도 제한 안에서만, 넘친 만큼은 가슴이 조금 거든다',
      '눈 → 머리 순서: 눈 시간 상수 0.045초, 머리 0.32초 (끄면 한 덩어리로 비교)',
      '따라가기는 1 − exp(−dt/τ) 로 — 프레임 속도가 달라도 같은 빠르기',
      '돌림을 가슴 · 목 · 머리에 나눠 준다',
      '깜빡임은 무작위 간격 + 머리를 크게 돌 때',
    ],
    done: [
      '나비가 날면 눈동자가 먼저 휙 따라가고 머리가 늦게 따라 돈다',
      '나비가 옆으로 많이 가면 목은 제한(부채꼴 표시)에서 멈추고 가슴이 조금 더 돈다',
      '「눈 먼저 · 머리 뒤따라」를 끄면 머리와 눈이 한 덩어리로 돌아 어색해진다',
      '사이사이 깜빡이고, 「목 돌림 제한」 슬라이더로 제한 각이 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '목 제한 + 눈 먼저 · 머리 뒤따라 + 깜빡임',
      from: 'demos/demosRigA.ts i461 update() 를 정리',
      body: `const damp = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);
const clamp = THREE.MathUtils.clamp;

// 머리에서 목표까지 각
const to = new THREE.Vector3().subVectors(target, headPos);
const yaw = Math.atan2(to.x, to.z);
const pitch = Math.atan2(to.y, Math.hypot(to.x, to.z));
const over = Math.max(0, Math.abs(yaw) - lim) * Math.sign(yaw); // 목 제한을 넘친 만큼
const hyW = clamp(yaw, -lim, lim), hpW = clamp(pitch, -lim * 0.5, lim * 0.5);
hy += (hyW - hy) * damp(dt, 0.32);                              // 머리는 천천히
hp += (hpW - hp) * damp(dt, 0.32);
const chestY = clamp(over * 0.5, -0.35, 0.35);
bone('chest').quaternion.copy(qY(chestY * 0.6 + hy * 0.12));
bone('neck').quaternion.copy(qY(hy * 0.35).multiply(qX(-hp * 0.35)));
bone('head').quaternion.copy(qY(hy * 0.5).multiply(qX(-hp * 0.6)).multiply(qZ(-hy * 0.06)));
character.updateMatrixWorld(true);

// 눈: 머리 기준으로 남은 각을 빠르게, 눈도 제한
const local = new THREE.Vector3().subVectors(target, eyeWorldPos).applyQuaternion(socket.getWorldQuaternion(q).invert());
ey += (clamp(Math.atan2(local.x, local.z), -0.6, 0.6) - ey) * damp(dt, 0.045);
ep += (clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.45, 0.45) - ep) * damp(dt, 0.045);
eye.rotation.set(-ep, ey, 0, 'YXZ');

// 깜빡임: 1.8 ~ 4.4초마다, 0.07초 감고 0.1초 뜨기
nextBlink -= dt;
if (nextBlink <= 0 && blinkT < 0) blinkT = 0;
let close = 0;
if (blinkT >= 0) {
  blinkT += dt;
  close = blinkT < 0.07 ? blinkT / 0.07 : 1 - (blinkT - 0.07) / 0.1;
  if (blinkT > 0.17) { blinkT = -1; close = 0; nextBlink = 1.8 + Math.random() * 2.6; }
}
socket.scale.set(1, 1 - 0.9 * clamp(close, 0, 1), 1);`,
    },
    pitfalls: [
      { title: 'lookAt 로 머리를 목표에 바로 돌리면 목이 꺾이고 등 뒤까지 돈다', fix: '각을 직접 계산해 제한 각 안으로 자르고, 넘친 만큼은 가슴이 조금 거든다.' },
      { title: '머리와 눈이 같은 빠르기로 돌면 로봇 같다', fix: '눈이 먼저(τ 0.045초), 머리가 뒤따라(τ 0.32초). 사람도 그렇게 본다.' },
      { title: 'lerp(값, 목표, 0.1) 로 따라가면 프레임 속도에 따라 빠르기가 바뀐다', fix: '1 − exp(−dt/τ) 를 비율로 쓴다.' },
    ],
    prev: ['i456'],
    next: ['i463', 'i462'],
  },

  i462: {
    id: 'i462',
    summary: '귀 · 머리카락 · 꼬리 뼈의 끝점을 베를레 점으로 따로 움직여 스프링으로 제자리에 당기고, 그 방향으로 뼈를 돌려 몸이 멈춰도 출렁이게 한다.',
    terms: [
      { en: 'Jiggle bones (secondary motion)', ko: '흔들리는 뼈 — 늦게 따라오는 2차 움직임' },
      { en: 'Verlet spring on bone tip', ko: '뼈 끝점을 베를레 적분 + 스프링으로' },
      { en: 'Stiffness · damping', ko: '단단함(제자리로 당기는 힘) · 감쇠(멈추는 빠르기)' },
      { en: 'Fixed-step substeps (120 Hz)', ko: '프레임과 상관없이 같은 간격으로 나눠 계산' },
    ],
    goal: '{target}에 흔들리는 뼈를 넣어 줘 — 몸이 멈춰도 늦게 따라와 출렁이게, 단단함 · 감쇠를 조절할 수 있게. 분위기는 {style}.',
    targets: ['토끼 귀 · 머리카락 · 꼬리', '리본 · 머리띠', '안테나 · 깃털'],
    styles: ['말랑하고 귀여운', '통통 튀는', '부드럽게 살랑'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animation Rigging 의 Damped Transform, 또는 많이 쓰는 Dynamic Bone · Magica Cloth 같은 스프링 본.',
      godot: 'Godot 4 는 SpringBoneSimulator3D (4.4+), 3.x 는 SkeletonModification 의 Jiggle.',
    },
    principle: [
      '뼈마다 쉬는 자세에서의 끝점(tipL, 뼈 기준)을 기억해 두고, 매 프레임 그 끝점의 세계 위치 r 를 구한다 — 「있어야 할 곳」.',
      '실제 끝점 tip 은 따로 움직인다: 속도 = (tip − prev) × (1 − 감쇠), tip += 속도 + (r − tip) × 단단함, 살짝 아래로(중력).',
      '끝점은 뼈 길이만큼 떨어지게 다시 맞춘다 (뼈가 늘어나지 않게).',
      '「쉬는 방향(r − 뼈 머리)」에서 「실제 방향(tip − 뼈 머리)」으로 돌리는 회전을 뼈에 곱한다.',
      '120Hz 고정 간격으로 1 ~ 8번 나눠 계산해 프레임 속도가 달라도 같은 출렁임이 나온다.',
    ],
    when: ['귀 · 꼬리 · 머리카락 · 리본이 몸 움직임에 늦게 따라와야 할 때', '애니메이션 클립 위에 생기를 더할 때 (클립을 고치지 않고)'],
    avoid: ['천처럼 넓은 면 — 대신 천 시뮬레이션(i485)', '맞고 넘어지는 온몸 — 대신 래그돌(i466)'],
    cost: 'light',
    costNote: '뼈 6개 × 1 ~ 8번 — 0.05ms 미만. 캐릭터 수십 명도 가볍다.',
    level: 2,
    must: [
      '몸 자세(애니메이션 · 절차)를 먼저 정하고 matrixWorld 갱신 뒤에 흔들림을 계산한다',
      '흔들 뼈는 매 프레임 쉬는 회전으로 되돌린 뒤 계산한다 (안 하면 회전이 쌓여 돌아간다)',
      '고정 간격(1/120초) 나눠 계산 — 프레임마다 dt 를 그대로 쓰면 느린 폰에서 튄다',
      '끝점은 뼈 길이로 다시 맞춘다',
      '꼬리 · 머리카락은 단단함을 조금 더(× 1.6 · × 1.3) — 부위마다 다르게',
    ],
    done: [
      '두 토끼가 똑같이 폴짝 뛰는데, 오른쪽만 멈출 때 귀 · 머리카락 · 꼬리가 늦게 따라와 출렁인다',
      '「단단함」을 낮추면 흐물흐물 크게, 올리면 짧게 떨린다',
      '「감쇠」를 낮추면 오래 출렁이고, 올리면 금방 멈춘다',
      '「흔들림」 켬/끔으로 왼쪽 토끼와 같아진다',
    ],
    code: {
      lang: 'ts',
      title: '뼈 끝 베를레 스프링 → 뼈 회전',
      from: 'demos/demosRigB.ts Springs.step() 을 정리',
      body: `const _h = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
type Item = { bone: THREE.Bone; tipL: THREE.Vector3; tip: THREE.Vector3; prev: THREE.Vector3; k: number; init: boolean };

// 먼저: 몸 자세를 정하고, 흔들 뼈는 bone.quaternion.identity() 로 쉬는 회전에, group.updateMatrixWorld(true)
function stepSprings(items: Item[], dt: number, stiff = 0.028, damp = 0.04): void {
  const n = THREE.MathUtils.clamp(Math.round(dt * 120), 1, 8); // 120Hz 고정 간격
  for (const it of items) {
    const bone = it.bone;
    bone.updateMatrixWorld(true);
    _h.setFromMatrixPosition(bone.matrixWorld);           // 뼈 머리
    _r.copy(it.tipL).applyMatrix4(bone.matrixWorld);      // 있어야 할 끝
    if (!it.init) { it.tip.copy(_r); it.prev.copy(_r); it.init = true; }
    const len = _r.distanceTo(_h);
    for (let s = 0; s < n; s++) {
      _v.subVectors(it.tip, it.prev).multiplyScalar(1 - damp); // 관성 (감쇠)
      it.prev.copy(it.tip);
      it.tip.add(_v).addScaledVector(_d.subVectors(_r, it.tip), stiff * it.k); // 제자리로 당김
      it.tip.y -= 0.0003;                                   // 살짝 중력
      it.tip.sub(_h).setLength(len).add(_h);                // 뼈 길이 유지
    }
    // 쉬는 방향 → 실제 방향 회전을 세계 회전에 곱하고, 부모 기준으로 바꿔 넣는다
    _d.subVectors(it.tip, _h).normalize();
    _r.sub(_h).normalize();
    _qw.setFromUnitVectors(_r, _d);
    bone.getWorldQuaternion(_q);
    bone.parent!.getWorldQuaternion(_qp);
    bone.quaternion.copy(_qp.invert().multiply(_qw.multiply(_q)));
    bone.updateMatrixWorld(true); // 자식 뼈(귀 끝)가 바로 이어서 쓴다
  }
}`,
    },
    pitfalls: [
      { title: '흔들 뼈를 쉬는 회전으로 되돌리지 않으면 회전이 쌓여 귀가 빙글빙글 돈다', fix: '매 프레임 계산 전에 흔들 뼈 quaternion 을 identity(또는 클립 값)로 되돌린다.' },
      { title: 'dt 를 그대로 쓰면 느린 기기에서 출렁임이 튀거나 폭발한다', fix: '1/120초 간격으로 1 ~ 8번 나눠 계산한다.' },
      { title: '귀 뿌리 · 끝 두 마디를 따로 계산할 때 순서가 틀리면 끝이 늦게 따라온다', fix: '부모(귀 뿌리)부터 계산하고 updateMatrixWorld 한 뒤 자식(귀 끝)을 계산한다.' },
      { title: '캐릭터가 순간 이동하면 귀가 길게 늘어져 날아온다', fix: '이동만큼 tip · prev 도 함께 옮긴다 (견본 shift).' },
    ],
    prev: ['i456', 'i461'],
    next: ['i466', 'i485'],
  },

  i463: {
    id: 'i463',
    summary: '같은 얼굴의 변형 모양 6가지(깜빡 · 웃음 · 놀람 · 화남 · 아 · 오)를 모프 타깃으로 만들어 비율로 섞어, 표정과 말하는 입을 움직인다.',
    terms: [
      { en: 'Morph targets (blend shapes · shape keys)', ko: '같은 정점 수의 변형 모양을 비율로 섞기' },
      { en: 'geometry.morphAttributes.position', ko: 'three.js 모프 모양 목록' },
      { en: 'mesh.morphTargetInfluences', ko: '모프마다 섞는 비율 (0 ~ 1)' },
      { en: 'Procedural lip flap (viseme A · O)', ko: '음절마다 아 · 오 입 모양' },
    ],
    goal: '{target}에 표정 모프를 넣어 줘 — 깜빡 · 웃음 · 놀람 · 화남 · 아 · 오 변형을 비율로 섞고, 말할 때는 음절마다 입이 열리게. 분위기는 {style}.',
    targets: ['점토 토끼 얼굴', '마스코트 캐릭터', '대화하는 NPC'],
    styles: ['귀엽고 아기자기', '과장된 만화', '차분한'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Blend Shapes — SkinnedMeshRenderer.SetBlendShapeWeight(index, 0~100).',
      godot: 'Godot 은 MeshInstance3D 의 blend_shapes/이름 (set_blend_shape_value).',
    },
    principle: [
      '모든 모양(기본 + 변형 6)은 정점 수와 순서가 같아야 한다 — 같은 정점이 다른 자리로 갈 뿐이다.',
      '견본은 눈 · 눈썹 · 입 · 혀를 위 · 아래 테 한 쌍의 「띠」로 만들고, 표정마다 테 모양 함수만 바꿔 같은 수의 점을 뽑는다.',
      '점은 머리 표면에 투영해 붙이고(이분 탐색으로 표면 찾기), 머리 뼈에 매단다.',
      '변형 모양을 geometry.morphAttributes.position 에 넣고, mesh.morphTargetInfluences[i] 로 섞는 비율을 준다.',
      '표정 값은 목표로 부드럽게(1 − e^(−9dt)), 말할 땐 0.17초 음절마다 아 · 오를 번갈아 연다. 깜빡임은 웃을 때 줄인다.',
    ],
    when: ['얼굴 표정 · 입 모양처럼 뼈로 만들기 힘든 작은 변형', '대사에 맞춰 입을 움직일 때'],
    avoid: ['팔 · 다리처럼 크게 움직이는 곳 — 뼈(i456)가 맞다', '텍스처 한 장으로 되는 2D 얼굴 — 얼굴 그림 바꾸기가 훨씬 싸다'],
    cost: 'light',
    costNote: '모프 6개 × 얼굴 띠 정점 수백 — GPU 에서 섞는다. 모프 수가 아주 많으면(수십) 정점 셰이더가 무거워진다.',
    level: 2,
    must: [
      '모든 모프 모양은 기본 모양과 정점 수 · 순서가 같게 (같은 함수에서 뽑기)',
      '표정 값은 바로 바꾸지 말고 부드럽게 따라가기',
      '깜빡임은 웃음과 겹치면 줄인다 (blink × (1 − smile))',
      '표정마다 몸짓(머리 기울기 · 팔 · 귀)도 함께 — 얼굴만 바뀌면 어색하다',
      '모프 비율을 막대로 보여 주고, 웃음 · 놀람 · 화남 슬라이더로 직접 섞을 수 있게',
    ],
    done: [
      '기본 → 웃음 → 놀람 → 화남 → 말하기 → 웃으며 말하기가 2.2초마다 부드럽게 바뀐다',
      '말할 때 음절마다 입이 아 · 오로 열렸다 닫힌다',
      '슬라이더로 웃음 0.5 + 놀람 0.5 처럼 섞으면 중간 표정이 나온다',
      '화면 막대 6개가 지금 섞는 비율을 보여 준다',
    ],
    code: {
      lang: 'ts',
      title: '모프 모양 넣기 + 표정 섞기 + 말하는 입',
      from: 'demos/demosRigB.ts stripGeo() · i463 update() 를 정리',
      body: `const EXPR = ['blink', 'smile', 'surprise', 'angry', 'talkA', 'talkO'];

// 기본 모양 pos 와, 같은 정점 수의 변형 모양 6개 morph[k]
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
geo.setIndex(idx);
geo.morphAttributes.position = morph.map((m, k) => {
  const a = new THREE.BufferAttribute(m, 3);
  a.name = EXPR[k]!;
  return a;
});
const face = new THREE.Mesh(geo, mat); // morphTargetInfluences 가 6칸 생긴다
headBone.add(face);

// 매 프레임: 목표 표정으로 부드럽게
const w = [0, 0, 0, 0, 0, 0];
const k = 1 - Math.exp(-dt * 9);
for (let i = 1; i < 4; i++) w[i] += (target[i] - w[i]) * k;  // 웃음 · 놀람 · 화남
// 말하기: 0.17초 음절마다 아 또는 오
const syl = Math.floor(t / 0.17);
const open = talk * Math.max(0, Math.sin(((t % 0.17) / 0.17) * Math.PI));
const isO = (syl * 7919) % 3 === 0;
const kt = 1 - Math.exp(-dt * 25);
w[4] += ((isO ? 0 : open * 0.9) - w[4]) * kt;
w[5] += ((isO ? open : 0) - w[5]) * kt;
// 깜빡: 3.3초마다 0.16초, 웃을 땐 줄임
const p = t % 3.3;
w[0] = (p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0) * (1 - w[1]);
for (let i = 0; i < 6; i++) face.morphTargetInfluences![i] = w[i];`,
    },
    pitfalls: [
      { title: '변형 모양의 정점 수가 하나라도 다르면 얼굴이 깨진다', fix: '기본과 변형을 같은 함수 · 같은 점 수(M)로 뽑는다. 견본은 띠의 위 · 아래 테 함수만 바꾼다.' },
      { title: '모프에 절대 위치를 넣었는데 상대로 읽히면(또는 반대) 얼굴이 두 배로 밀린다', fix: 'three.js 기본은 절대 위치(morphTargetsRelative = false). 차이값을 넣었다면 geo.morphTargetsRelative = true.' },
      { title: '깜빡임과 웃음(눈 감은 웃음)을 둘 다 1로 섞으면 눈이 파고든다', fix: '깜빡임에 (1 − 웃음)을 곱한다.' },
    ],
    prev: ['i456'],
    next: ['i461', 'i464'],
    refs: [
      { name: 'three.js 예제 — webgl_morphtargets_face', url: 'https://threejs.org/examples/#webgl_morphtargets_face' },
    ],
  },

  i464: {
    id: 'i464',
    summary: '코드로 만든 가만히 · 걷기 · 뛰기 클립 셋을 AnimationMixer 로 함께 틀고 속도에 따라 가중치를 섞되, 걷기 ↔ 뛰기 발 박자를 맞춘다.',
    terms: [
      { en: 'Animation blending (blend tree by speed)', ko: '속도에 따라 클립 가중치 섞기' },
      { en: 'AnimationMixer · AnimationAction.setEffectiveWeight', ko: 'three.js 클립 재생기 · 가중치' },
      { en: 'Phase sync (foot cycle matching)', ko: '다른 길이 클립의 발 박자 맞추기' },
      { en: 'QuaternionKeyframeTrack', ko: '뼈 회전 키프레임 트랙 — 코드로 클립 만들기' },
    ],
    goal: '{target}의 가만히 · 걷기 · 뛰기 클립을 속도에 따라 부드럽게 섞어 줘 — AnimationMixer 가중치로, 걷기 ↔ 뛰기 발 박자는 맞춰서. 분위기는 {style}.',
    targets: ['점토 토끼 (흐르는 꽃밭)', '플레이어 캐릭터', '동물 NPC'],
    styles: ['통통 튀는 귀여운', '씩씩한', '느긋한 산책'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Animator 의 Blend Tree (1D, 파라미터 Speed) — 발 박자는 클립 정규화 시간으로 자동 맞춤.',
      godot: 'Godot 은 AnimationTree 의 BlendSpace1D (blend_position = 속도).',
    },
    principle: [
      '클립은 코드로: 한 주기를 24칸으로 나눠 뼈마다 오일러 → 쿼터니언 키를 쌓아 QuaternionKeyframeTrack, 골반 높이는 VectorKeyframeTrack.',
      '세 클립을 모두 play() 해 두고, 가중치만 바꾼다: 가만히 = 1 − sstep(속도/0.9), 뛰기 몫 kr = sstep((속도 − 1.4)/0.9).',
      '걷기(0.8초)와 뛰기(0.5초)는 길이가 달라 그냥 섞으면 발이 엉킨다. 지금 섞인 한 걸음 길이 D = lerp(0.8, 0.5, kr) 로 둘의 timeScale 을 맞춘다.',
      '그리고 뛰기 재생 시각을 걷기 진행 비율에 묶는다: run.time = (walk.time / 0.8 % 1) × 0.5 — 두 클립이 같은 발을 같은 순간에 딛는다.',
      '땅 무늬 · 꽃이 속도만큼 흘러 제자리 걷기가 앞으로 가는 것처럼 보인다.',
    ],
    when: ['플레이어처럼 속도가 계속 바뀌는 캐릭터', '손으로 만든(또는 GLB) 클립을 끊김 없이 이을 때'],
    avoid: ['클립이 하나뿐 — crossFadeTo 로 바꾸기만 하면 된다(i467)', '속도 · 지형에 정확히 맞춰야 할 때 — 절차 걷기(i458) 와 발 IK(i465)'],
    cost: 'light',
    costNote: '클립 3개를 동시에 계산해도 뼈 수십 개 수준 — 가볍다.',
    level: 2,
    must: [
      '세 클립을 모두 재생해 두고 setEffectiveWeight 로만 섞는다 (켰다 껐다 하지 않기)',
      '가중치 합은 1 (가만히 · 걷기 · 뛰기)',
      '길이가 다른 클립은 timeScale 과 재생 시각으로 발 박자를 맞춘다',
      '「박자 맞추기」 켬/끔으로 차이를 보여 준다',
      '가중치 막대를 화면에 보여 준다',
    ],
    done: [
      '속도가 0 → 1.1 → 2.5 → 0 으로 바뀌는 동안 가만히 → 걷기 → 뛰기 → 가만히가 끊김 없이 섞인다',
      '「박자 맞추기」를 끄면 걷기 ↔ 뛰기 사이에서 다리가 엉키고, 켜면 매끈하다',
      '「속도」 슬라이더로 아무 속도든 중간 걸음이 나온다',
      '화면 막대 셋이 지금 가중치를 보여 준다',
    ],
    code: {
      lang: 'ts',
      title: '코드로 클립 만들기 + 속도로 섞기 + 박자 맞춤',
      from: 'demos/demosRigB.ts makeClip() · i464 update() 를 정리',
      body: `function makeClip(name: string, period: number, pose: (a: number) => { r: Record<string, [number, number, number]>; hy: number }, bones: string[], n = 24) {
  const times: number[] = [], hy: number[] = [];
  const q: Record<string, number[]> = Object.fromEntries(bones.map((b) => [b, []]));
  const e = new THREE.Euler(), qq = new THREE.Quaternion();
  for (let i = 0; i <= n; i++) {
    times.push((i / n) * period);
    const p = pose(((i % n) / n) * Math.PI * 2); // 마지막 키 = 첫 키 → 이음매 없음
    for (const b of bones) { const r = p.r[b] ?? [0, 0, 0]; qq.setFromEuler(e.set(r[0], r[1], r[2])); q[b]!.push(qq.x, qq.y, qq.z, qq.w); }
    hy.push(0, p.hy, 0);
  }
  const tracks: THREE.KeyframeTrack[] = bones.map((b) => new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, q[b]!));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hy));
  return new THREE.AnimationClip(name, period, tracks);
}

const mixer = new THREE.AnimationMixer(character);
const [aIdle, aWalk, aRun] = [makeClip('idle', 2.4, IDLE, B), makeClip('walk', 0.8, WALK, B), makeClip('run', 0.5, RUN, B)]
  .map((c) => { const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); return a; });

// 매 프레임
const wi = 1 - sstep(speed / 0.9);           // 가만히
const kr = sstep((speed - 1.4) / 0.9);       // 걷기 중 뛰기 몫
aIdle.setEffectiveWeight(wi);
aWalk.setEffectiveWeight((1 - wi) * (1 - kr));
aRun.setEffectiveWeight((1 - wi) * kr);
const D = lerp(0.8, 0.5, kr);                // 지금 섞인 한 걸음 길이
const m = clamp(Math.max(speed, 0.6) / lerp(1.1, 2.4, kr), 0.5, 1.6);
aWalk.timeScale = (0.8 / D) * m;
aRun.timeScale = (0.5 / D) * m;
mixer.update(dt);
aRun.time = ((aWalk.time / 0.8) % 1) * 0.5;  // 같은 발을 같은 순간에`,
    },
    pitfalls: [
      { title: '길이가 다른 걷기 · 뛰기를 그냥 섞으면 다리가 엉킨다', fix: '섞인 걸음 길이로 timeScale 을 맞추고, 뛰기 재생 시각을 걷기 진행 비율에 묶는다.' },
      { title: '클립을 stop/play 로 바꾸면 툭 끊긴다', fix: '모두 play 해 두고 setEffectiveWeight 로만 섞는다.' },
      { title: '트랙 이름이 뼈 이름과 다르면 아무것도 안 움직인다', fix: '트랙 이름은 「뼈이름.quaternion」 — 뼈 name 과 정확히 같아야 한다.' },
      { title: '마지막 키가 첫 키와 다르면 반복할 때 튄다', fix: '견본은 i = n 일 때 (i % n) 으로 첫 자세를 다시 넣어 이음매를 없앤다.' },
    ],
    prev: ['i456', 'i458'],
    next: ['i465', 'i467'],
    refs: [
      { name: 'three.js 예제 — webgl_animation_skinning_blending', url: 'https://threejs.org/examples/#webgl_animation_skinning_blending' },
      { name: 'three.js 문서 — AnimationMixer', url: 'https://threejs.org/docs/#api/en/animation/AnimationMixer' },
    ],
  },

  i465: {
    id: 'i465',
    summary: '발 아래로 광선을 쏴 땅 높이를 재고 다리 IK 와 골반 높이를 맞춰, 계단 · 언덕에서도 발이 뜨거나 묻히지 않게 한다.',
    terms: [
      { en: 'Foot IK / foot placement on uneven terrain', ko: '울퉁불퉁한 땅에 발 붙이기' },
      { en: 'Downward raycast (Raycaster)', ko: '발 아래로 광선 쏴 땅 높이 · 기울기 재기' },
      { en: 'Pelvis height adjustment', ko: '다리가 닿도록 골반 낮추기' },
      { en: 'Foot alignment to ground normal', ko: '발바닥을 경사에 맞춰 기울이기' },
    ],
    goal: '{target}이(가) 울퉁불퉁한 땅을 걸을 때 발을 땅에 붙여 줘 — 발 아래 광선으로 높이를 재서 다리 IK · 골반 높이 보정, 경사엔 발바닥도 기울게. 분위기는 {style}.',
    targets: ['언덕 · 계단을 걷는 토끼', '섬 위 캐릭터', '산을 오르는 동물'],
    styles: ['귀엽고 아기자기', '모험', '차분한 산책'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Physics.Raycast + Animation Rigging Two Bone IK (휴머노이드면 OnAnimatorIK 의 SetIKPosition · bodyPosition).',
      godot: 'Godot 은 RayCast3D (또는 PhysicsDirectSpaceState3D.intersect_ray) + SkeletonIK3D.',
    },
    principle: [
      '걸음마다 디딜 자리(앞 · 뒤 발자국 x)를 정하고, 그 자리 위에서 아래로 광선을 쏴 땅 높이를 잰다.',
      '디딤 구간엔 발을 그 높이에, 드는 구간엔 두 디딤 높이 중 높은 쪽 + 0.02 위로 넘어가게 곡선을 그린다.',
      '골반은 「두 발 중 더 낮은 쪽에도 다리가 닿는 높이」까지만: min(골반, 발 높이 + √(다리 길이² − 앞뒤 거리²)). 부드럽게 따라가되 0.4 넘게 차이 나면 바로.',
      '다리는 코사인 법칙 두 뼈 IK(평면)로, 발바닥은 맞은 면 법선으로 기울기(±0.45 rad)를 구해 맞춘다.',
      'IK 끈 토끼와 나란히 걸어 발이 뜬 틈을 빨간 막대로 보여 준다.',
    ],
    when: ['계단 · 언덕 · 바위 위를 걷는 캐릭터', '땅이 평평하지 않은 섬 · 산 무대'],
    avoid: ['완전히 평평한 판 위만 걷는 게임 — 계산할 필요가 없다', '아주 빠르게 달리는 캐릭터 — 발이 짧게 닿아 효과가 거의 안 보인다'],
    cost: 'light',
    costNote: '프레임마다 광선 몇 개 + 다리 IK 둘. 땅 메시를 조각(1칸씩)으로 나눠 광선이 작은 조각만 검사하게 해 가볍다.',
    level: 3,
    must: [
      '광선은 발 자리 위(높은 곳)에서 아래로 — 땅 메시 전체가 아니라 그 x 의 조각만 검사',
      '골반은 낮은 발에도 다리가 닿도록 낮춘다 (안 그러면 다리가 다 펴지고 발이 뜬다)',
      '골반 높이는 부드럽게 따라가되 큰 차이(0.4)는 바로 맞춘다',
      '발바닥 기울기는 법선에서, 너무 가파른 면(법선 y < 0.5)은 무시',
      'IK 켬/끔 두 캐릭터를 나란히, 광선 · 틈을 선으로 보여 준다',
    ],
    done: [
      '왼쪽(IK 켬) 토끼는 잔물결 · 언덕 · 계단 오르내리기에서 발이 늘 땅에 닿는다',
      '오른쪽(IK 끔)은 발이 뜨거나 땅에 묻히고, 빨간 막대가 뜬 틈을 보여 준다',
      '발 아래 하늘색 광선과 맞은 점이 보인다',
      '경사에서 발바닥이 땅 기울기에 맞춰 기운다',
    ],
    code: {
      lang: 'ts',
      title: '발 아래 광선 → 디딤 높이 · 골반 보정 → 평면 두 뼈 IK',
      from: 'demos/demosRigB.ts cast() · walk() · legIK() 를 정리',
      body: `const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), org = new THREE.Vector3(), nrm = new THREE.Vector3();
const cast = (x: number): number => {
  rc.set(org.set(x, 5, 0), down);
  const hit = rc.intersectObject(chunkAt(x), false)[0];   // 그 x 의 땅 조각만
  if (!hit) return terrH(x);
  nrm.copy(hit.face!.normal);
  return hit.point.y;
};

// 발 하나: p = 걸음 진행(0~1), Xn · Xn1 = 지금 · 다음 발자국 자리
const gP = cast(Xn), gN = cast(Xn1);
let fx: number, fy: number;
if (p < 0.5) { fx = Xn; fy = gP; }                          // 디딤
else {
  const q = (p - 0.5) / 0.5, hi = Math.max(gP, gN) + 0.02; // 들어서 넘어가기
  fx = lerp(Xn, Xn1, sstep(q));
  fy = (q < 0.5 ? lerp(gP, hi, sstep(q * 2)) : lerp(hi, gN, sstep((q - 0.5) * 2))) + 0.09 * Math.sin(Math.PI * q);
}
cast(fx);
const slope = nrm.y > 0.5 ? clamp(Math.atan2(-nrm.x, nrm.y), -0.45, 0.45) : 0;
const ty = fy + 0.1; // 발목 높이
// 골반: 낮은 발에도 닿게
hips = Math.min(hips, ty + Math.sqrt(Math.max(0, (0.37 * 0.98) ** 2 - (fx - bodyX) ** 2)) + 0.08);

// 평면 두 뼈 IK (코사인 법칙)
function legIK(hipY: number, dz: number, ty: number, slope: number, L1: number, L2: number) {
  const vy = ty - hipY, D = Math.hypot(vy, dz);
  const Dc = clamp(D, 0.05, (L1 + L2) * 0.999);
  const phi = Math.atan2(dz, -vy);
  const al = Math.acos(clamp((L1 * L1 + Dc * Dc - L2 * L2) / (2 * L1 * Dc), -1, 1));
  const ga = Math.acos(clamp((L1 * L1 + L2 * L2 - Dc * Dc) / (2 * L1 * L2), -1, 1));
  const th = -(phi + al), sh = Math.PI - ga;
  thigh.rotation.set(th, 0, 0); shin.rotation.set(sh, 0, 0);
  foot.rotation.set(-slope - th - sh, 0, 0);                // 발바닥 = 땅 기울기
  return D - Dc;                                            // 못 닿은 길이
}`,
    },
    pitfalls: [
      { title: '골반을 그대로 두면 낮은 쪽 발이 닿지 못하고 공중에 뜬다', fix: '두 발 중 낮은 쪽에도 다리가 닿는 높이로 골반을 낮춘다.' },
      { title: '광선을 땅 전체에 쏘면 지형이 커질수록 느려진다', fix: '땅을 1칸 조각으로 나눠 그 x 의 조각만 검사한다.' },
      { title: '계단 모서리 · 벽 같은 가파른 면 법선으로 발을 기울이면 발이 세워진다', fix: '법선 y 가 0.5 보다 작으면 기울기를 0 으로, 그 밖엔 ±0.45 rad 로 자른다.' },
      { title: '드는 발이 계단 모서리를 뚫고 지나간다', fix: '드는 구간 최고점을 두 디딤 높이 중 높은 쪽 + 여유로 잡는다.' },
    ],
    prev: ['i459', 'i458'],
    next: ['i466'],
  },

  i466: {
    id: 'i466',
    summary: '몸의 뼈 끝 · 관절을 베를레 점으로 바꾸고 점 사이 거리 제약을 되풀이해 맞춰, 공에 맞으면 흐물흐물 넘어졌다가 원래 자세로 섞으며 일어나게 한다.',
    terms: [
      { en: 'Ragdoll (Verlet particles + distance constraints)', ko: '베를레 점 + 거리 제약 래그돌 흉내' },
      { en: 'Position-based constraint relaxation', ko: '위치를 직접 옮겨 제약을 맞추기 (되풀이)' },
      { en: 'Min-distance (one-sided) constraint', ko: '「이보다 가까워지지만 마」 한쪽 제약 — 접힘 막기' },
      { en: 'Points → bone rotations (basis from points)', ko: '점 위치에서 뼈 회전 되찾기' },
    ],
    goal: '{target}에 래그돌 흉내를 넣어 줘 — 뼈 끝을 베를레 점과 거리 제약으로, 맞으면 흐물흐물 넘어지고 잠시 뒤 원래 자세로 섞으며 일어나게. 분위기는 {style}.',
    targets: ['공에 맞는 점토 토끼', '넘어지는 캐릭터', '날아가는 인형'],
    styles: ['코믹한 슬랩스틱', '귀엽고 아기자기', '과장된 만화'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Ragdoll Wizard (Rigidbody + CharacterJoint) 로 진짜 물리 래그돌.',
      godot: 'Godot 은 PhysicalBone3D · PhysicalBoneSimulator3D (스켈레톤에서 Create Physical Skeleton).',
    },
    principle: [
      '맞는 순간 지금 자세에서 몸의 점(골반 · 목 · 어깨 · 팔끝 · 무릎 · 발 · 귀 등)의 세계 위치를 가져와 cur 로 둔다.',
      '맞은 곳에 가까운 점일수록 prev 를 반대쪽으로 밀어 두면 첫 프레임에 그만큼 속도가 생긴다 (베를레: 속도 = cur − prev).',
      '1/120초 간격: 속도 × 0.995 로 움직이고 중력 9.8 을 더한 뒤, 거리 제약을 10번 되풀이해 맞추고, 바닥 아래 점은 위로 올리며 미끄럼을 줄인다(× 0.6).',
      '몸통 · 머리 점은 서로 모두 이어 단단한 덩어리로, 팔 · 다리는 사슬로, 접히지 말아야 할 곳은 「최소 거리」 한쪽 제약으로 막는다.',
      '점 위치에서 뼈 회전을 되찾고(몸통 = 목 − 골반 · 어깨 방향으로 기저), 일어날 땐 넘어진 자세에서 쉬는 자세로 0.9초 동안 slerp 로 섞는다.',
    ],
    when: ['맞음 · 넘어짐 · 날아감 연출에 매번 다른 넘어지는 모습이 필요할 때', '물리 엔진 없이 가볍게 흐물거리는 몸'],
    avoid: ['정확한 충돌 · 무게가 중요한 물리 게임 — 대신 진짜 물리 엔진(i24)', '귀 · 꼬리만 출렁이면 될 때 — 흔들리는 뼈(i462)'],
    cost: 'light',
    costNote: '점 수십 개 × 제약 수십 개 × 10번 × 1 ~ 6 단계 — 1ms 미만.',
    level: 3,
    must: [
      '베를레 적분 (cur · prev) + 고정 간격 1/120초, 한 프레임 최대 6단계',
      '몸통 · 머리는 모든 점 쌍을 이어 단단하게, 팔다리는 사슬, 접힘 막기는 최소 거리 제약',
      '거리 제약은 질량 역수(invM) 비율로 두 점을 나눠 옮기기',
      '바닥 아래 점은 반지름 높이로 올리고 옆 속도를 줄인다 (마찰)',
      '일어날 땐 넘어진 회전에서 쉬는 회전으로 slerp — 순간이동 금지',
    ],
    done: [
      '공이 날아와 맞으면 토끼가 맞은 쪽 반대로 흐물흐물 넘어진다',
      '넘어진 몸이 땅에서 미끄러지다 멈추고, 팔다리가 몸을 뚫거나 이상하게 접히지 않는다',
      '잠시 뒤 원래 자세로 부드럽게 섞으며 일어나 제자리로 깡충 돌아온다',
      '「공 세기」 1 ~ 6 · 「제약 반복」 1 ~ 20 을 바꾸면 넘어지는 세기 · 몸의 단단함이 달라지고, 「점 · 막대 보기」로 베를레 점과 제약이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '베를레 + 거리 제약 + 바닥 (한 프레임)',
      from: 'demos/demosRigB.ts i466 simulate() 를 정리',
      body: `// cur · prev: 점 N 개 위치, links: [a, b, 쉬는 거리, 최소만?], invM: 점 질량 역수, R[i]: 점 반지름
function simulate(dt: number, iters = 10): void {
  const n = THREE.MathUtils.clamp(Math.round(dt * 120), 1, 6);
  const h = 1 / 120, tmp = new THREE.Vector3();
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < N; i++) {                    // 베를레 — 속도 = cur − prev
      const p = cur[i]!, q = prev[i]!;
      tmp.subVectors(p, q).multiplyScalar(0.995);    // 공기 저항
      q.copy(p);
      p.add(tmp);
      p.y -= 9.8 * h * h;                            // 중력
    }
    for (let it = 0; it < iters; it++) {
      for (const [a, b, rest, minOnly] of links) {   // 거리 제약
        const pa = cur[a]!, pb = cur[b]!;
        tmp.subVectors(pb, pa);
        const dd = tmp.length() || 1e-6;
        if (minOnly && dd >= rest) continue;         // 접힘 막기: 가까워질 때만
        const k = (dd - rest) / dd / (invM[a]! + invM[b]!);
        pa.addScaledVector(tmp, k * invM[a]!);
        pb.addScaledVector(tmp, -k * invM[b]!);
      }
      for (let i = 0; i < N; i++) {                  // 바닥 + 마찰
        const p = cur[i]!;
        if (p.y < R[i]!) {
          p.y = R[i]!;
          const q = prev[i]!;
          q.x = p.x - (p.x - q.x) * 0.6;
          q.z = p.z - (p.z - q.z) * 0.6;
        }
      }
    }
  }
}
// 맞는 순간: w = exp(−|점 − 맞은 곳|² / 0.3) 로 가까운 점일수록 prev 를 반대로 밀어 첫 속도를 준다
// 그 뒤: 점 → 뼈 회전 (몸통 기저 = makeBasis(어깨 방향, 목 − 골반, 외적)), 일어날 땐 slerpQuaternions(넘어진, 쉬는, k)`,
    },
    pitfalls: [
      { title: '팔다리를 사슬로만 이으면 무릎 · 팔꿈치가 반대로 접히거나 몸을 뚫는다', fix: '엉덩이 ↔ 발, 골반 ↔ 무릎 같은 「최소 거리」 한쪽 제약을 더한다.' },
      { title: '되풀이 수가 적으면 몸이 고무처럼 늘어난다', fix: '제약을 한 단계에 10번 되풀이한다 (슬라이더로 조절).' },
      { title: '넘어진 자세에서 바로 쉬는 자세로 바꾸면 순간이동한다', fix: '넘어진 뼈 회전 · 골반 위치를 기억해 두고 0.9초 동안 slerp · lerp 로 섞는다.' },
      { title: '바닥에서 계속 미끄러진다', fix: '바닥에 닿은 점의 prev 를 옮겨 옆 속도를 0.6배로 줄인다 (마찰).' },
    ],
    prev: ['i462', 'i456'],
    next: ['i485', 'i484'],
  },

  i467: {
    id: 'i467',
    summary: 'Quaternius 같은 CC0 GLB 모델을 GLTFLoader 로 불러와 클립을 바꿔 틀고, 재질 색을 바꾸고, 머리 · 꼬리 뼈에 모자 · 깃발을 붙인다.',
    terms: [
      { en: 'GLTFLoader (glTF 2.0 / GLB)', ko: 'three.js 3D 모델 파일 불러오기' },
      { en: 'AnimationMixer.clipAction · crossFadeTo', ko: '클립 재생 · 부드럽게 바꾸기' },
      { en: 'SkeletonUtils.clone', ko: '뼈 있는 모델 복제 (보통 clone 은 뼈가 꼬인다)' },
      { en: 'CC0 assets (Quaternius · Kenney)', ko: '출처 표시 없이 써도 되는 무료 모델' },
    ],
    goal: '{target}을(를) 무료 CC0 GLB 모델로 가져와 줘 — 클립 바꿔 틀기 · 색 바꾸기 · 뼈에 소품 붙이기까지. 분위기는 {style}.',
    targets: ['날아다니는 용 (모자 · 깃발)', '동물 캐릭터', '사람 캐릭터'],
    styles: ['파티 분위기', '귀엽고 알록달록', '모험 판타지'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 glTFast 패키지로 GLB 를 불러오거나 FBX 로 받고, Animator · 뼈 Transform 에 자식으로 소품.',
      godot: 'Godot 은 GLB 를 그대로 가져오고(Import), AnimationPlayer · BoneAttachment3D 로 소품.',
    },
    principle: [
      'GLTFLoader.loadAsync 로 GLB 를 한 번만 불러 캐시하고, 쓸 때마다 SkeletonUtils.clone 으로 복제한다.',
      '재질은 복제해서 쓴다 (원본을 고치면 다른 복제본까지 바뀐다). 이름(Main · Secondary)으로 몸 색 재질만 골라 색을 돌린다.',
      'Box3 로 크기를 재서 높이 1.9 로 맞추고 바닥에 앉힌다.',
      '클립 이름(Flying_Idle · Yes · Death 등)으로 clipAction 을 만들고, 바꿀 땐 reset → play → 이전.crossFadeTo(다음, 0.35초).',
      '소품은 뼈(getObjectByName("Head"))의 자식으로: 원하는 세계 위치 · 방향 행렬에 뼈 세계 행렬의 역을 곱해 뼈 기준으로 넣는다.',
    ],
    when: ['용 · 동물처럼 코드로 만들기 어려운 캐릭터가 필요할 때', '뼈 · 애니메이션이 이미 있는 모델을 빨리 쓰고 싶을 때'],
    avoid: ['라이선스가 CC0 · 사용 허락이 아닌 모델 — 출처 · 라이선스를 꼭 확인하고 기록한다', '게임 그림체와 너무 다른 모델 — 따로 노는 느낌이면 코드 모델이 낫다'],
    cost: 'medium',
    costNote: '모델 파일 크기(수백 KB ~ 수 MB)와 첫 불러오기 · 셰이더 컴파일이 비싸다. 한 번 불러 캐시하고 복제해 쓴다.',
    level: 1,
    must: [
      '뼈 있는 모델 복제는 SkeletonUtils.clone (Object3D.clone 은 뼈 연결이 원본을 가리킨다)',
      '재질은 복제해서 고친다 · 버릴 땐 복제한 재질만 dispose (모양은 원본과 나눠 쓰므로 버리지 않기)',
      '클립 바꾸기는 crossFadeTo 로 0.3초 남짓 — 끊기지 않게, 한 번만 할 동작(Death)은 LoopOnce + clampWhenFinished',
      '소품은 뼈의 자식으로, 세계 → 뼈 좌표 변환을 거쳐서',
      '라이선스 · 출처(작가 · CC0)를 파일 옆에 남기고 화면 구석에도 표시',
    ],
    done: [
      '용 모델이 받침 위에 맞는 크기로 앉아 날갯짓한다',
      '2.8초마다 클립(날며 쉬기 · 응! · 빠르게 날기 · 박치기 …)이 부드럽게 바뀐다',
      '색이 바뀌고, 머리 뼈의 파티 모자 · 꼬리 뼈의 깃발이 동작을 따라 움직인다',
      '「뼈 보기」로 뼈대(SkeletonHelper)와 뼈 이름 목록을 볼 수 있다',
    ],
    code: {
      lang: 'ts',
      title: 'GLB 불러오기 · 복제 · 클립 바꾸기 · 뼈에 소품',
      from: 'demos/demosRigB.ts loadDragon() · i467 · attachTo() 를 정리',
      body: `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const gltf = await new GLTFLoader().loadAsync('/models/dragon.glb'); // 한 번만 불러 캐시
const model = SkeletonUtils.clone(gltf.scene) as THREE.Object3D;   // 뼈까지 제대로 복제
const tintMats: { m: THREE.MeshStandardMaterial; c: THREE.Color }[] = [];
model.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  m.castShadow = true;
  m.frustumCulled = false;
  const mat = (m.material as THREE.MeshStandardMaterial).clone(); // 원본 재질은 건드리지 않기
  if (/Main|Secondary/.test(mat.name)) tintMats.push({ m: mat, c: mat.color.clone() });
  m.material = mat;
});
// 크기 맞추기: 높이 1.9, 바닥에 앉히기
const box = new THREE.Box3().setFromObject(model, true);
const size = box.getSize(new THREE.Vector3());
const s = 1.9 / size.y;
model.scale.multiplyScalar(s);
model.position.y = -box.min.y * s;
scene.add(model);

// 클립 바꾸기
const mixer = new THREE.AnimationMixer(model);
const act = (name: string) => mixer.clipAction(gltf.animations.find((c) => c.name.split('|').pop() === name)!);
let cur = act('Flying_Idle');
cur.play();
function play(name: string) {
  const next = act(name);
  next.reset();
  next.setLoop(name === 'Death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = true;
  next.play();
  cur.crossFadeTo(next, 0.35, false);
  cur = next;
}
// 색 바꾸기: for (const { m, c } of tintMats) m.color.copy(c).offsetHSL(hue, 0.15, 0.06);

// 뼈에 소품 — 세계 위치 · 방향을 뼈 기준으로 바꿔 자식으로
function attachTo(bone: THREE.Object3D, prop: THREE.Object3D, worldPos: THREE.Vector3, worldQ = new THREE.Quaternion()) {
  const M = new THREE.Matrix4().compose(worldPos, worldQ, new THREE.Vector3(1, 1, 1));
  M.premultiply(new THREE.Matrix4().copy(bone.matrixWorld).invert());
  M.decompose(prop.position, prop.quaternion, prop.scale);
  bone.add(prop);
}
model.updateMatrixWorld(true);
const head = model.getObjectByName('Head')!;
attachTo(head, partyHat, head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)));
// 매 프레임: mixer.update(dt);`,
    },
    pitfalls: [
      { title: 'model.clone() 으로 복제하면 복제본이 원본 뼈를 따라 움직인다', fix: '뼈 있는 모델은 SkeletonUtils.clone 으로 복제한다.' },
      { title: '재질 색을 바로 고치면 같은 모델 전부의 색이 바뀐다', fix: '재질을 clone 해서 고치고, 정리할 땐 복제한 재질만 dispose 한다.' },
      { title: '소품을 뼈에 그냥 add 하면 크기 · 위치가 엉뚱하다', fix: '뼈에는 크기(모델 축소)까지 들어 있다. 원하는 세계 행렬에 뼈 세계 행렬의 역을 곱해 넣는다.' },
      { title: '모델 라이선스를 확인하지 않고 쓰면 나중에 문제가 된다', fix: '이 사이트의 용(가짜 동전)은 Quaternius 「Dragon Evolved」 CC0 — 출처를 dragon.LICENSE.txt 로 남겼다.', seen: true },
    ],
    prev: ['i456', 'i464'],
    next: ['i462', 'i474'],
    refs: [
      { name: 'three.js 문서 — GLTFLoader', url: 'https://threejs.org/docs/#examples/en/loaders/GLTFLoader' },
      { name: 'three.js 예제 — webgl_animation_skinning_blending', url: 'https://threejs.org/examples/#webgl_animation_skinning_blending' },
      { name: 'Quaternius (CC0 모델)', url: 'https://quaternius.com' },
      { name: 'Kenney (CC0 에셋)', url: 'https://kenney.nl' },
    ],
  },

  i468: {
    id: 'i468',
    summary: '모서리마다 반지름을 준 정확한 2D 윤곽을 두께로 돌출하고 테두리를 둥글게 깎아, 하드서피스 부품 모서리에 빛이 맺히게 한다.',
    terms: [
      { en: 'Profile extrusion with bevel (ExtrudeGeometry)', ko: '윤곽 돌출 + 모서리 깎기' },
      { en: 'THREE.Shape · Shape.holes', ko: '2D 윤곽 · 구멍' },
      { en: 'bevelSize · bevelThickness · bevelSegments · bevelOffset', ko: '깎는 너비 · 깊이 · 단계 · 안쪽으로 당기기' },
      { en: 'toCreasedNormals', ko: '각진 곳만 날카롭게, 나머지는 매끈한 법선' },
    ],
    goal: '{target}을(를) 옆모습 윤곽에서 돌출해 만들어 줘 — 모서리마다 둥근 반지름, 두께 테두리는 베벨로 깎아 빛이 맺히게. 분위기는 {style}.',
    targets: ['SF 레이저 블래스터 부품', '기계 · 로봇 판', '장난감 · 열쇠 · 소품'],
    styles: ['반짝이는 금속', '하얀 플라스틱 장난감', '점토 시안'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 ProBuilder 의 Shape(폴리곤) + Extrude + Bevel, 또는 Blender 에서 굽기.',
      godot: 'Godot 은 CSGPolygon3D(mode = Depth) 로 돌출, 베벨은 Blender 에서.',
    },
    principle: [
      '윤곽은 [x, y, 둥글기] 점 목록 — 꺾이는 점마다 두 변을 따라 반지름만큼 물러난 곳을 2차 곡선(quadraticCurveTo)으로 잇는다 (변 길이의 45% 까지).',
      '창 · 구멍은 같은 방식의 Path 를 Shape.holes 에 넣는다.',
      'ExtrudeGeometry 의 depth = 두께 − 2 × 베벨, bevelSize = bevelThickness = 베벨, bevelOffset = −베벨 — 깎아도 바깥 크기가 그대로다.',
      'toCreasedNormals(각 0.6 rad)로 깎인 곡면은 매끈, 앞뒤 평면은 법선을 정확히 ±z 로 다시 세워 얼룩을 없앤다.',
      '베벨 없는 모서리는 칼날처럼 빛이 안 맺히고, 베벨 있는 모서리엔 가는 하이라이트 선이 생긴다 — 진짜 물건은 모서리가 다 조금씩 둥글다.',
    ],
    when: ['총 · 기계 · 로봇 판처럼 옆모습이 정확해야 하는 하드서피스 부품', '평평한 판 부품을 치수대로 여러 장 만들 때'],
    avoid: ['둥글게 돌린 부품(통 · 렌즈) — 대신 회전체(i450)', '매끈한 유기체 곡면 — 대신 서브디비전(i448)'],
    cost: 'light',
    costNote: '베벨 단계(3)와 곡선 조각(6)만큼 삼각형이 늘어난다 (견본 화면에 「베벨 없음 → 있음」 삼각형 수 표시). 한 번 짓는 모양이라 가볍다.',
    level: 2,
    must: [
      '바깥 크기가 변하지 않게 bevelOffset = −베벨, depth = 두께 − 2 × 베벨',
      '윤곽 모서리 반지름은 양쪽 변 길이의 45% 를 넘지 않게',
      '앞뒤 평평한 면의 법선은 ±z 로 다시 세운다 (베벨 법선과 섞이면 큰 삼각형에 얼룩)',
      '빛이 모서리를 훑도록 움직이는 빛 + 환경 반사(HDRI 또는 RoomEnvironment)',
      '베벨 없음 / 있음을 화면 반씩 나눠 비교',
    ],
    done: [
      '① 2D 윤곽선이 그려지고 → ② 두께로 쑥 돌출되고 → ③ 베벨 없음 · 있음을 반씩 비교한다',
      '베벨 있는 오른쪽은 모든 모서리에 가는 빛 선이 맺히고, 왼쪽은 칼날처럼 어둡게 끊긴다',
      '「나눠 보기 위치」 슬라이더로 비교선을 옮길 수 있다',
      '화면에 베벨 전후 삼각형 수가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '둥근 모서리 윤곽 → 베벨 돌출 (바깥 크기 그대로)',
      from: 'demos/lib/blaster.ts roundPath() · roundShape() · extrudeSide() 를 정리',
      body: `import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
type Pt = [number, number, number?]; // x, y, 모서리 둥글기

function roundPath(p: THREE.Path, pts: Pt[]): void {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n]!, b = pts[i]!, c = pts[(i + 1) % n]!;
    const r = b[2] ?? 0;
    if (r <= 0) { if (i === 0) p.moveTo(b[0], b[1]); else p.lineTo(b[0], b[1]); continue; }
    const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k1 = Math.min(r, l1 * 0.45) / l1, k2 = Math.min(r, l2 * 0.45) / l2; // 변의 45% 까지만
    const sx = b[0] + (a[0] - b[0]) * k1, sy = b[1] + (a[1] - b[1]) * k1;
    if (i === 0) p.moveTo(sx, sy); else p.lineTo(sx, sy);
    p.quadraticCurveTo(b[0], b[1], b[0] + (c[0] - b[0]) * k2, b[1] + (c[1] - b[1]) * k2);
  }
}
function roundShape(pts: Pt[], holes: Pt[][] = []): THREE.Shape {
  const s = new THREE.Shape();
  roundPath(s, pts); s.closePath();
  for (const h of holes) { const p = new THREE.Path(); roundPath(p, h); p.closePath(); s.holes.push(p); }
  return s;
}
function extrudeSide(shape: THREE.Shape, width: number, bevel: number, seg = 3, curveSeg = 6): THREE.BufferGeometry {
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, // 깎아도 바깥 크기 그대로
    bevelSegments: seg, curveSegments: curveSeg,
  });
  g.translate(0, 0, -depth / 2);
  const out = toCreasedNormals(g, 0.6); // 깎인 곳은 매끈, 꺾인 곳은 날카롭게
  // (견본은 여기서 앞뒤 평면 삼각형의 법선을 정확히 (0, 0, ±1) 로 다시 세운다)
  return out;
}
// 몸체: 윤곽 + 창 구멍, 두께 7.2cm, 베벨 0.35cm
const receiver = extrudeSide(roundShape(
  [[-14, 0.2, 0.4], [22, 0.2, 0.3], [22, 6.2, 0.3], [19.4, 9, 0.7], [-7.5, 9, 0.9], [-11.5, 7.6, 0.6], [-14, 5.6, 0.5]],
  [[[2.5, 3, 0.9], [11.5, 3, 0.9], [11.5, 6.2, 0.9], [2.5, 6.2, 0.9]]],
), 7.2, 0.35);`,
    },
    pitfalls: [
      { title: 'bevelOffset 를 안 주면 베벨만큼 부품이 커져 다른 부품과 안 맞는다', fix: 'bevelOffset = −베벨, depth = 두께 − 2 × 베벨로 바깥 치수를 지킨다.' },
      { title: 'computeVertexNormals 만 쓰면 큰 앞면에 얼룩진 음영이 생긴다', fix: 'toCreasedNormals 로 날카로운 각을 지키고, 앞뒤 평면 삼각형의 법선을 ±z 로 다시 세운다.' },
      { title: '모서리 둥글기를 크게 주면 짧은 변에서 곡선이 겹쳐 뒤집힌다', fix: '반지름을 양쪽 변 길이의 45% 이하로 자른다.' },
      { title: '빛이 가만히 있으면 베벨 차이가 안 보인다', fix: '빛을 돌려 모서리를 훑게 하고, 환경 반사를 켠다.' },
    ],
    prev: ['i450', 'i451'],
    next: ['i470', 'i474'],
    refs: [
      { name: 'three.js 문서 — ExtrudeGeometry', url: 'https://threejs.org/docs/#api/en/geometries/ExtrudeGeometry' },
      { name: 'three.js 예제 — webgl_geometry_shapes', url: 'https://threejs.org/examples/#webgl_geometry_shapes' },
    ],
  },

  i470: {
    id: 'i470',
    summary: '패널 이음선 · 환기구 · 각인은 높이 그림을 구운 법선 맵으로 새기고, 나사 58개는 InstancedMesh 로 한 번에 박아, 삼각형을 늘리지 않고 기계 디테일을 채운다.',
    terms: [
      { en: 'Panel lines via baked normal map', ko: '높이 그림 → 법선 맵으로 새긴 패널선' },
      { en: 'Height-to-normal (Sobel filter)', ko: '소벨 필터로 높이 기울기 → 법선' },
      { en: 'Instanced screws / bolts (InstancedMesh)', ko: '나사 수십 개를 그리기 한 번에' },
      { en: 'Greeble / kitbash detail', ko: '작은 기계 부품 디테일' },
    ],
    goal: '{target}에 기계 디테일을 넣어 줘 — 패널선 · 환기구 · 각인은 법선 맵으로 새기고, 나사는 인스턴스로 수십 개 박기. 분위기는 {style}.',
    targets: ['SF 블래스터 옆면', '로봇 · 우주선 판', '기계 상자 · 금고'],
    styles: ['SF 장난감', '낡은 공장 기계', '깔끔한 제품'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Substance · 높이 맵을 Normal Map 으로 변환(텍스처 가져오기 설정 「Create from Grayscale」), 나사는 GPU Instancing 재질.',
      godot: 'Godot 은 텍스처 가져오기의 Normal Map 변환(높이 → 법선), 나사는 MultiMeshInstance3D.',
    },
    principle: [
      '캔버스에 회색 128 바탕을 칠하고 홈은 어둡게(26 ~ 64), 솟은 테는 밝게(178 ~ 200) 그린다 — 패널선 · 환기 홈 · 각인 글자 · 나사 둘레 홈까지 같은 cm 좌표로.',
      '높이 그림을 소벨 3×3 으로 미분해 법선 (−dx·k, −dy·k, 1) 을 정규화해 RGB 로 굽는다 (k = 세기).',
      '이 법선 맵을 판 재질에 붙이면 삼각형은 그대로인데 빛을 받는 모양이 파인 홈처럼 보인다. normalScale 로 깊이를 조절한다.',
      '나사는 머리(회전체) + 육각 홈(원기둥 6면, 정점 색으로 어둡게)을 한 모양으로 합치고, 양면 29 자리 × 2 = 58 개를 InstancedMesh 로.',
      '박히는 연출은 인스턴스 행렬을 바꿔: 위로 2.4 떠서 1.5바퀴 돌며 내려와 살짝 튄다.',
    ],
    when: ['판 부품이 밋밋해 「CG 티」가 날 때', '나사 · 볼트 · 리벳처럼 같은 작은 부품이 수십 개일 때'],
    avoid: ['아주 가까이서 옆으로 보는 홈 — 법선 맵은 실루엣이 안 바뀐다. 그땐 진짜로 깎기(CSG i451)', '부품 하나하나 따로 움직여야 할 때 — 인스턴스 대신 개별 메시'],
    cost: 'light',
    costNote: '실행 중엔 법선 맵 한 장 + 나사 그리기 1번(부품 판마다). 굽기는 시작 때 한 번, 줄 묶음마다 쉬며 굽는다.',
    level: 2,
    must: [
      '패널선 · 나사 자리는 같은 치수 데이터(cm)에서 — 홈과 나사가 어긋나지 않게',
      '높이 → 법선은 소벨 필터, 높이에 아주 작은 잡음(±0.8)을 섞어 기계로 찍은 티를 줄인다',
      '읽을 캔버스는 willReadFrequently: true 로 (GPU 되읽기 멈춤 막기), 굽기는 나눠서',
      '나사는 InstancedMesh — 개수만큼 Mesh 를 만들지 않는다',
      '법선 세기(normalScale) 슬라이더로 깊이 조절, 와이어프레임으로 삼각형이 그대로임을 보여 준다',
    ],
    done: [
      '레이저가 지나간 자리부터 패널선 · 환기구 · 각인이 새겨진다',
      '이어서 나사 58개가 왼쪽부터 하나씩 돌며 박히고, 화면에 「그리기 몇 번에 58개」가 보인다',
      '「패널선 깊이」 0 ~ 2.5 로 홈이 얕아지거나 깊어진다',
      '와이어프레임을 켜면 판 삼각형은 그대로(홈이 모양에 없음)다',
    ],
    code: {
      lang: 'ts',
      title: '높이 그림 → 법선 맵 (소벨) + 나사 인스턴스',
      from: 'demos/lib/blaster.ts heightToNormal() · 나사 kit · demos/demosHard.ts demo470() 을 정리',
      body: `// 1) 높이 h[W*H] (캔버스 R 값: 128 바탕 · 홈 어둡게 · 테 밝게) → 법선 맵
function heightToNormal(h: Float32Array, W: number, H: number, k: number): THREE.DataTexture {
  const d = new Uint8Array(W * H * 4);
  const at = (x: number, y: number) => h[THREE.MathUtils.clamp(y, 0, H - 1) * W + THREE.MathUtils.clamp(x, 0, W - 1)]!;
  for (let y = 0; y < H; y++) {
    const o = (H - 1 - y) * W * 4; // 캔버스 위 행 = 텍스처 위
    for (let x = 0; x < W; x++) {
      const nx = -((at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))) * k * 0.25;
      const ny = -((at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))) * k * 0.25;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + 1), i = o + x * 4;
      d[i] = (nx * l * 0.5 + 0.5) * 255; d[i + 1] = (ny * l * 0.5 + 0.5) * 255; d[i + 2] = (l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}
const plateMat = new THREE.MeshStandardMaterial({ color: 0x2e3239, metalness: 0.55, roughness: 0.4, normalMap: heightToNormal(h, W, H, 0.034) });
plateMat.normalScale.set(depth, depth); // 패널선 깊이

// 2) 나사 — 머리 + 육각 홈을 한 모양으로, 자리마다 인스턴스
const screws = new THREE.InstancedMesh(screwGeo, screwMat, SCREWS.length * 2);
const m = new THREE.Matrix4();
SCREWS.forEach(([x, y, hz], i) => [1, -1].forEach((s, j) => {
  m.makeRotationFromEuler(new THREE.Euler(0, s > 0 ? 0 : Math.PI, 0)).multiply(new THREE.Matrix4().makeRotationZ(Math.random() * Math.PI));
  m.setPosition(x, y, hz * s);
  screws.setMatrixAt(i * 2 + j, m);
}));
// 박히는 연출: base × 위로 (1−e)·2.4 + 튐 × Z 회전 (1−e)·1.5바퀴 를 setMatrixAt, instanceMatrix.needsUpdate = true`,
    },
    pitfalls: [
      { title: '캔버스 getImageData 를 그냥 부르면 GPU 되읽기로 멈칫한다', fix: '읽을 캔버스는 getContext("2d", { willReadFrequently: true }) 로 처음부터 CPU 쪽에 둔다.' },
      { title: '캔버스 위아래와 텍스처 v 방향이 반대라 홈이 뒤집혀 보인다', fix: '법선 맵에 쓸 때 행을 (H − 1 − y) 로 뒤집는다.' },
      { title: '나사를 Mesh 로 58개 만들면 그리기 호출이 58번', fix: '머리 + 홈을 mergeGeometries 로 한 모양으로 만들고 InstancedMesh 하나로.' },
      { title: '법선 맵 홈은 옆에서 보면 평평한 게 들킨다', fix: '아주 비스듬한 각도에서 보이는 큰 홈은 실제로 깎는다. 패널선 · 각인처럼 얕은 것만 법선 맵으로.' },
    ],
    prev: ['i468', 'u10'],
    next: ['i474', 'i479'],
  },

  i474: {
    id: 'i474',
    summary: 'Poly Haven 사진 스캔 재질의 색 · 법선 · ARM(AO · 거칠기 · 금속) 지도를 입혀, 같은 벽 · 바닥 · 상자 · 기둥이 단색에서 실사로 바뀌는 과정을 보여 준다.',
    terms: [
      { en: 'PBR texture set (albedo · normal · ARM)', ko: '실사 재질 지도 묶음' },
      { en: 'ARM map (AO · Roughness · Metalness in R · G · B)', ko: '구석 그늘 · 거칠기 · 금속을 한 장에' },
      { en: 'Color space (SRGB for color, NoColorSpace for data)', ko: '색 지도만 sRGB, 나머지는 데이터' },
      { en: 'CC0 scanned materials (Poly Haven)', ko: '무료 사진 스캔 재질' },
    ],
    goal: '{target}에 실사 PBR 재질을 입혀 줘 — 무료 CC0 스캔 재질의 색 · 법선 · AO · 거칠기 · 금속 지도로, 단색 → 색 → 법선 → 전부 단계 비교. 분위기는 {style}.',
    targets: ['던전 벽 · 바닥 · 상자 · 기둥', '건물 외벽', '소품 (나무 상자 · 금속 판)'],
    styles: ['어두운 던전 · 낮게 훑는 빛', '밝은 낮', '사실적인 실내'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP Lit 은 Base Map · Normal Map · Metallic(R 금속 · A 매끈함) · Occlusion 칸 — ARM 은 채널을 바꿔 Mask Map 으로 다시 묶어야 한다.',
      godot: 'Godot StandardMaterial3D 는 albedo · normal · ao · roughness · metallic 칸마다 텍스처 채널을 고를 수 있어 ARM 한 장을 그대로 쓴다.',
    },
    principle: [
      '스캔 재질은 보통 색(diff) · 법선(nor_gl — OpenGL 방식) · ARM 세 장이다. ARM 은 R = AO, G = 거칠기, B = 금속.',
      '같은 ARM 텍스처를 aoMap · roughnessMap · metalnessMap 에 함께 넣고 roughness · metalness 값은 1 로 둔다 (지도 값이 그대로 쓰이게).',
      '색 지도만 SRGBColorSpace, 법선 · ARM 은 NoColorSpace — 데이터를 색으로 바꾸면 값이 틀어진다.',
      '같은 그림을 반복 수만 다르게 여러 물체에 쓸 땐 source 를 나눠 쓰는 복사 텍스처로 — GPU 에 다시 올리지 않는다.',
      '빛을 낮게 훑으면 법선 · AO 차이가 가장 잘 드러난다. 화면을 넷으로 나눠 단계마다 재질만 바꿔 그린다.',
    ],
    when: ['던전 · 건물처럼 사실적인 벽 · 바닥 · 나무 · 금속이 필요할 때', '코드로 그린 무늬로는 실사 느낌이 안 날 때'],
    avoid: ['툰 · 동화풍 게임 — 사진 재질은 그림체와 따로 논다. 대신 캔버스 무늬(u09) · 절차 마모(i84)', '폰에서 1K 텍스처 수십 장 — 메모리가 모자란다. 512 로 줄이거나 몇 장만'],
    cost: 'medium',
    costNote: '1K 재질 한 묶음 = 3장, 4종이면 12장 · 약 10MB 내려받기. GPU 에 올리는 것은 프레임당 3ms 로 나누고, 셰이더는 compileAsync 로 미리.',
    level: 1,
    must: [
      'ARM 한 장을 aoMap · roughnessMap · metalnessMap 에 함께, roughness · metalness 값은 1',
      '색 지도만 SRGBColorSpace, 법선 · ARM 은 NoColorSpace',
      '법선 맵은 OpenGL 방식(nor_gl) — DirectX 방식이면 normalScale.y = −1',
      '텍스처 GPU 올리기는 renderer.initTexture 로 나눠서, 셰이더는 compileAsync 로 미리 — 첫 화면 멈춤 없이 「받는 중 · 올리는 중 · 굽는 중」 표시',
      '반복은 texture.repeat, 같은 그림은 source 를 나눠 쓰기',
      '라이선스(CC0) · 출처를 남긴다',
    ],
    done: [
      '같은 장면이 네 칸으로 — ① 단색 ② 색 지도 ③ 법선 ④ AO · 거칠기 · 금속 — 오른쪽으로 갈수록 실사가 된다',
      '낮게 훑는 빛이 지나가면 ③ ④ 칸에서 돌 · 벽돌 틈이 입체로 드러난다',
      '「재질 바꾸기」로 모두 돌바닥 · 벽돌 · 나무 · 금속 판으로 바꿔 볼 수 있다',
      '「빛 높이」 슬라이더로 빛을 낮추면 요철이 더 강하게 보인다',
    ],
    code: {
      lang: 'ts',
      title: '스캔 재질 3장 → MeshStandardMaterial (ARM 한 장을 세 칸에)',
      from: 'demos/demosRender.ts texFrom() · pbrMat() · rep() 를 정리',
      body: `const loader = new THREE.TextureLoader();
function tex(url: string, isColor: boolean): THREE.Texture {
  const t = loader.load(url);
  t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace; // 데이터는 색 변환 금지
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16; // 렌더러가 최대치로 자른다
  return t;
}
const brick = {
  map: tex('/polyhaven/castle_brick_07_diff_1k.jpg', true),
  normal: tex('/polyhaven/castle_brick_07_nor_gl_1k.jpg', false),  // OpenGL 방식 법선
  arm: tex('/polyhaven/castle_brick_07_arm_1k.jpg', false),        // R AO · G 거칠기 · B 금속
};
// 같은 그림을 반복만 다르게 — source 를 나눠 써서 GPU 에 다시 올리지 않는다
function rep(t: THREE.Texture, x: number, y = x): THREE.Texture {
  const c = new THREE.Texture();
  c.source = t.source;
  c.colorSpace = t.colorSpace;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.anisotropy = t.anisotropy;
  c.repeat.set(x, y);
  c.version = Math.max(1, t.version);
  return c;
}
function pbrMat(p: typeof brick, rx: number, ry = rx): THREE.MeshStandardMaterial {
  const arm = rep(p.arm, rx, ry);
  return new THREE.MeshStandardMaterial({
    map: rep(p.map, rx, ry),
    normalMap: rep(p.normal, rx, ry),
    aoMap: arm, roughnessMap: arm, metalnessMap: arm, // 한 장을 세 칸에 (채널은 three 가 알아서)
    roughness: 1, metalness: 1,                        // 지도 값 그대로
  });
}
const wall = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.7, 0.3), pbrMat(brick, 3.2, 1.3));
scene.add(wall);
// 첫 화면 멈춤 막기: renderer.initTexture(t) 를 프레임당 3ms 씩 → await renderer.compileAsync(scene, camera)`,
    },
    pitfalls: [
      { title: '법선 · ARM 에 sRGB 를 걸면 요철이 뭉개지고 거칠기가 틀어진다', fix: '색 지도만 SRGBColorSpace, 나머지는 NoColorSpace.' },
      { title: 'metalness 를 기본값 0 으로 두면 금속 지도가 0 과 곱해져 금속이 사라진다', fix: '지도 값은 재질 값과 곱해진다. 지도를 쓸 땐 roughness = 1, metalness = 1 로 두어 지도 값이 그대로 쓰이게 한다.' },
      { title: '같은 그림을 물체마다 clone 해서 needsUpdate 하면 GPU 에 여러 번 올라간다', fix: 'source 를 나눠 쓰는 복사 텍스처를 만들고 version 만 맞춘다 (견본 rep).' },
      { title: '1K 텍스처 열두 장을 한 프레임에 올리면 화면이 멈춘다', fix: 'initTexture 를 프레임당 3ms 로 나누고, 셰이더는 compileAsync 로 미리 굽는다.', seen: true },
      { title: 'DirectX 법선(nor_dx)을 받으면 요철이 뒤집혀 보인다', fix: 'nor_gl 을 받거나 normalScale.y = −1 로 뒤집는다.' },
    ],
    prev: ['u12', 'i470'],
    next: ['i475', 'i477'],
    refs: [
      { name: 'Poly Haven — 무료 CC0 텍스처', url: 'https://polyhaven.com/textures' },
      { name: 'three.js 문서 — MeshStandardMaterial', url: 'https://threejs.org/docs/#api/en/materials/MeshStandardMaterial' },
    ],
  },
};

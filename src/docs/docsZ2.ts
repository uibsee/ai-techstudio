import type { TechDoc } from './types';

/**
 * 다시 만든 견본 셋의 문서 (2026-10-08) — i35 스텐실 단면 · i17 글꼴 윤곽 돌출 · i37 인벌류트 톱니 + 캠.
 * 예전 docsB03.ts(i17) · docsB10.ts(i35 · i37) 의 같은 id 를 덮는다 (glob 순서상 이 파일이 뒤).
 * 코드는 demos/demosStructure.ts 의 실제 코드에서 발췌.
 */
export const DOCS: Record<string, TechDoc> = {
  i35: {
    id: 'i35',
    summary: '평면으로 물체를 잘라 속을 보이고, 잘린 면은 스텐실로 셈해 평면 위에 진짜 평평한 단면(빗금)을 메운다 — 속 빈 관 · 겹친 입체도 정확히.',
    terms: [
      { en: 'Stencil capping (cross-section cap)', ko: '스텐실로 단면 뚜껑 메우기 — 뒷면 +1 · 앞면 −1 로 「속」을 셈' },
      { en: 'Clipping plane (shader discard)', ko: '평면 한쪽 조각을 버려 자르기' },
      { en: 'IncrementWrap / DecrementWrap stencil op', ko: '스텐실 값 더하기 · 빼기 (넘치면 돌아감)' },
      { en: 'NotEqualStencilFunc', ko: '스텐실 ≠ 0 인 곳에만 그리기' },
    ],
    goal: '{target}을(를) 움직이는 평면으로 잘라 속을 보여 줘 — 잘린 면은 스텐실로 셈해 평면 위에 빗금 단면을 평평하게 메우고, 여러 물체가 겹쳐도 맞게. 분위기는 {style}.',
    targets: ['원뿔 · 속 빈 관 · 겹친 입체 (원뿔 곡선)', '엔진 · 기계 속 단면도', '과일 · 지구 · 몸속 단면'],
    styles: ['밝은 교과서 도해', 'CAD 단면도 (빗금)', '어두운 실험실'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'URP 에서는 셰이더의 Stencil 블록(Comp Always · Pass IncrSat/DecrWrap, Cull Front/Back 두 패스)과 단면 판 셰이더(Comp NotEqual)로 같은 순서를 Render Objects 기능으로 맞춘다.',
    },
    principle: [
      '자르기: 셰이더에서 세계 좌표 점 p 가 n·p > c 쪽이면 그 조각을 버린다(discard). 그러면 잘린 자리가 뻥 뚫린다.',
      '셈하기: 잘린 물체를 색 없이 두 번 그린다 — 뒷면은 스텐실 +1, 앞면은 −1 (깊이 시험 끔). 화면 한 점에서 남는 값 = 그 점의 평면 위치를 품은 물체 수.',
      '메우기: 자르기 평면 위에 큰 판을 놓고 스텐실 ≠ 0 인 곳에만 그린다. 판은 진짜 평면이라 빗금 무늬가 곧게 깔리고 깊이도 맞다.',
      '안쪽 면(BackSide)을 칠하는 쉬운 방법은 뚜껑이 평면이 아니라 뒷벽이라, 무늬가 휘고 두 물체가 겹친 곳에서 다른 물체의 겉면이 비쳐 틀린다.',
      '원뿔 단면: 꼭짓점에서 내려오는 모선마다 평면과 만나는 점을 이으면 곡선 — 평면 기울기가 모선 기울기(63.4°)보다 작으면 타원, 같으면 포물선, 크면 쌍곡선.',
    ],
    when: ['입체도형 · 원뿔 곡선 같은 수학 단면 체험', '기계 · 엔진 · 건물 속을 단면도로 보여 줄 때', '여러 부품이 겹치거나 속이 빈 물체를 정확히 자를 때'],
    avoid: ['껍데기가 닫혀 있지 않은 모델(구멍 · 얇은 판) — 셈이 어긋나 단면이 샌다. 대신 닫힌 모델을 쓰거나 단면을 직접 만든다(three-mesh-bvh 단면 윤곽)', '카메라가 남는 쪽(잘리지 않은 쪽)으로 넘어가는 장면 — 그때는 셈을 반대로 하거나 평면을 카메라 쪽으로 돌린다'],
    cost: 'light',
    costNote: '물체마다 색 없는 그리기 2번(앞 · 뒤) + 판 1장. 견본(물체 4개)은 한 장면 0.7ms. 스텐실 버퍼가 있는 렌더러(stencil: true)가 필요하다.',
    level: 3,
    must: [
      '렌더러는 new THREE.WebGLRenderer({ stencil: true }) — r163 부터 기본값이 false 라 없으면 아무것도 안 메워진다',
      '그리는 차례(renderOrder): 스텐실 셈(1) → 단면 판(2) → 실제 물체(3) → 반투명(그 뒤). 셈 재질은 colorWrite · depthWrite · depthTest 모두 false',
      '단면 판 재질은 stencilWrite: true · stencilFunc NotEqual · ref 0 · 세 경우 모두 Replace (그린 곳을 0 으로 되돌림)',
      '자르기는 셰이더에서 직접(onBeforeCompile 로 discard) — 재질 clippingPlanes 는 compileAsync 가 평면 수를 몰라 첫 장면에 다시 굽는다',
      '모든 물체는 닫힌 껍데기(구멍 없는 메시)로. 속 빈 관은 고리 모양 Shape 를 돌출해 안팎 벽 + 위아래 뚜껑을 한 몸으로',
    ],
    done: [
      '평면을 기울이면 원뿔 단면이 원 → 타원 → 포물선 → 쌍곡선으로 바뀌고 이름표가 따라 바뀐다',
      '속 빈 관 단면은 가운데가 뚫린 고리, 공 + 상자가 겹친 곳은 하나로 이어진 단면으로 빈틈 · 새는 곳 없이 메워진다',
      '「BackSide 방식과 나란히」를 켜면 왼쪽(BackSide)은 빗금이 휘고 겹친 곳에 다른 물체 겉면이 비치며, 오른쪽(스텐실)은 곧은 빗금이다',
      '폰에서도 60fps, 첫 장면에 멈칫 없음',
    ],
    code: {
      lang: 'ts',
      title: '셈(뒷면 +1 · 앞면 −1) → 단면 판(≠ 0 에만) → 실제 물체',
      from: 'demos/demosStructure.ts i35 · planeClip 을 정리',
      body: `// 세계 좌표 평면으로 자르기: uClip = (n, c), n·p > c 쪽을 버린다
function planeClip(m, u) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClip = u;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\\nvarying vec3 vClipW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\\nvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\\nvarying vec3 vClipW;\\nuniform vec4 uClip;')
      .replace('void main() {', 'void main() {\\n if (dot(vClipW, uClip.xyz) > uClip.w) discard;');
  };
  m.customProgramCacheKey = () => 'planeclip';
  return m;
}
const keep = { value: new THREE.Vector4(0, 1, 0, -0.25) };
const op = (o) => ({ stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: o, stencilZFail: o, stencilZPass: o });
const blind = { colorWrite: false, depthWrite: false, depthTest: false };
const stBack = planeClip(new THREE.MeshBasicMaterial({ side: THREE.BackSide, ...blind, ...op(THREE.IncrementWrapStencilOp) }), keep);
const stFront = planeClip(new THREE.MeshBasicMaterial({ side: THREE.FrontSide, ...blind, ...op(THREE.DecrementWrapStencilOp) }), keep);
for (const geo of geos) {           // 닫힌 메시들 (겹쳐도 됨)
  const a = new THREE.Mesh(geo, stBack); a.renderOrder = 1;
  const b = new THREE.Mesh(geo, stFront); b.renderOrder = 1;
  const real = new THREE.Mesh(geo, planeClip(new THREE.MeshStandardMaterial({ color: 0xffb347 }), keep));
  real.renderOrder = 3;
  scene.add(a, b, real);
}
// 단면 판: 평면 위 큰 판을 스텐실 ≠ 0 에만, 그린 곳은 0 으로
const cap = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), new THREE.MeshBasicMaterial({
  map: hatch, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
}));
cap.renderOrder = 2;
// 판 방향: makeBasis(u, z, n) 로 평면에 눕히고 위치는 평면 위의 점 p0
scene.add(cap);`,
    },
    pitfalls: [
      { title: '렌더러에 스텐실이 없으면 단면이 하나도 안 메워진다', fix: 'r163 부터 WebGLRenderer 의 stencil 기본값이 false. 견본은 stencil: true 로 만든 전용 렌더러(ownRenderer)에 그려 붙인다.', seen: true },
      { title: '재질 clippingPlanes 를 쓰면 첫 장면에 1초 넘게 멈춘다', fix: 'compileAsync 는 재질별 자르기 평면 수를 모르고 구워, 실제로 그릴 때 프로그램을 다시 만든다. 셰이더에 discard 를 직접 넣으면 미리 굽기가 그대로 통한다.', seen: true },
      { title: '안쪽 면(BackSide)만 칠하면 겹친 곳 · 무늬가 틀린다', fix: '뚜껑이 평면이 아니라 뒷벽이라 빗금이 휘고, 겹친 물체의 겉면이 구멍으로 비친다. 스텐실 셈 + 평면 판으로 바꾼다.', seen: true },
      { title: '대각선 빗금 그림을 바둑판처럼 깔면 이음매마다 끊긴 자국', fix: '가로 띠 그림을 그리고 texture.rotation 으로 45° 돌린다. 이때 판 UV 를 세계 길이로 맞춰야(가로세로 같은 비율) 각이 비뚤지 않다.', seen: true },
      { title: '닫히지 않은 모델은 단면이 샌다', fix: '구멍 · 열린 원기둥(openEnded) · 얇은 판은 셈이 0 이 안 돼 엉뚱한 곳이 칠해진다. 고리는 구멍 뚫린 Shape 를 돌출해 한 몸으로.' },
    ],
    prev: ['i450'],
    next: ['i36', 'i67'],
    refs: [
      { name: 'three.js 예제 — webgl_clipping_stencil', url: 'https://threejs.org/examples/#webgl_clipping_stencil' },
      { name: 'MDN — WebGLRenderingContext.stencilOp', url: 'https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/stencilOp' },
      { name: 'Wikipedia — Conic section', url: 'https://en.wikipedia.org/wiki/Conic_section' },
    ],
  },

  i17: {
    id: 'i17',
    summary: '캔버스에 그린 글자의 윤곽을 마칭 스퀘어로 따고(구멍 포함) 단순화해, 돌출 + 모서리 깎기로 진짜 두께 있는 입체 글씨를 만든다.',
    terms: [
      { en: 'Glyph outline extrusion (ExtrudeGeometry with bevel)', ko: '글꼴 윤곽을 밀어내 입체 글자 — 모서리 깎기' },
      { en: 'Marching squares (contour tracing)', ko: '픽셀 값에서 경계선 고리 따기' },
      { en: 'Ramer–Douglas–Peucker simplification', ko: '모양을 지키며 점 줄이기' },
      { en: 'THREE.Shape holes · toCreasedNormals', ko: '구멍 있는 모양 · 꺾임만 남기고 부드러운 법선' },
    ],
    goal: '{target}을(를) 두께 있는 입체 글자로 만들어 줘 — 글꼴 윤곽(구멍 포함)을 따서 돌출하고 모서리를 깎아, {style} 느낌으로 돌며 내려앉게.',
    targets: ['한글 「수학」 · 숫자 「123」', '게임 제목 로고', '결과 화면의 큰 점수'],
    styles: ['빨강 도장 + 금 테', '크롬 금속', '파스텔 장난감'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 TextMeshPro 가 평면 글자라, 입체는 글꼴 윤곽을 메시로 뽑는 에셋을 쓰거나 같은 방식(텍스처 → 윤곽 → 돌출)을 직접 짠다.',
      godot: 'Godot 은 TextMesh(depth · curve_step 속성)로 바로 입체 글자를 만든다 — 한글 글꼴도 그대로.',
    },
    principle: [
      '글꼴 파일(typeface JSON) 없이도 된다: 캔버스에 큰 글자(160px)를 그리고 알파 값을 읽는다.',
      '마칭 스퀘어: 픽셀 네 귀 값이 0.5 를 넘나드는 변마다 점을 보간해 찍고 이으면 매끈한 닫힌 고리들이 나온다. 돌림 방향이 반대인 고리가 구멍(ㅇ · A · B).',
      'RDP 단순화(0.4px)로 점을 줄이고, 1px 안으로 붙은 점은 하나로 — 짧은 변은 모서리 깎기에서 가시가 된다.',
      'THREE.Shape(바깥) + holes(구멍) → ExtrudeGeometry(depth, bevel). 옆면 · 깎은 면은 toCreasedNormals 로 부드럽게, 앞면은 정확히 평평하게.',
      '등장: 떨어지는 높이 y = 2.6(1 − k²) · 회전 (1 − k)²·2π 로 돌다가 앞을 보며 착지, 착지 순간 짜부라짐(감쇠 코사인).',
    ],
    when: ['게임 제목 · 결과 화면처럼 글자가 주인공인 3D 장면', '한글처럼 typeface 파일을 만들기 번거로운 글꼴', '숫자 블록 · 전광판 숫자를 입체로'],
    avoid: ['긴 문장 · 작은 글씨 — 대신 평면 SDF/MSDF 글자(troika-three-text)나 HTML 층', '글자가 매 프레임 바뀌는 점수 — 윤곽 따기가 글자마다 1 ~ 8ms 라 숫자 10개를 미리 만들어 두고 바꿔 끼운다'],
    cost: 'light',
    costNote: '윤곽 따기 글자당 1 ~ 8ms(처음 한 번, 캐시) · 돌출 0.3 ~ 5ms. 글자 「수학」 은 삼각형 약 2천 개. 한 장면 0.2ms.',
    level: 2,
    must: [
      '윤곽은 글꼴 + 글자로 캐시하고, 다른 글자들은 한 프레임에 하나씩 미리 따기 (첫 make 300ms 이하)',
      '웹 글꼴은 document.fonts.load(글꼴, 그 글자들) 이 끝난 뒤에만 쓴다 — fonts.check 는 받기 전에도 참이라 대체 글꼴 윤곽이 캐시에 박힌다',
      '모서리 깎기는 bevelOffset 0 (바깥으로). 안쪽(−깎기)으로 줄이면 가는 획 · 오목한 모서리에서 앞면 윤곽이 꼬여 큰 삼각형이 튀어나온다',
      '금속은 매트캡 그림으로 — 환경 반사(PMREM)는 첫 장면에 셰이더를 0.45초 동기로 굽는다',
      '슬라이더(두께 · 깎기)로 다시 만들 때는 등장 연출을 다시 틀지 않는다',
    ],
    done: [
      '「수학」 · 「123」 · 「π≈3.14」 · 「놀이터」 · 「ABC」 가 두께 있는 글자로 돌며 떨어져 착지하고, ㅇ · A · B 의 구멍이 뚫려 있다',
      '「윤곽선 보기」를 켜면 앞면에 바깥 윤곽(빨강) · 구멍(파랑) 선과 점이 겹쳐 보이고, 고리 · 구멍 · 점 · 삼각형 수가 나온다',
      '두께 · 모서리 깎기 슬라이더를 끝까지 움직여도 앞면에 튀어나온 삼각형 · 줄무늬가 없다',
      '재질 바꾸기(도장 + 금 테 · 크롬 · 구리 + 흰 도장)가 바로 바뀌고 폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '캔버스 글자 → 윤곽 고리 → 구멍 짝짓기 → 돌출 + 깎기',
      from: 'demos/demosStructure.ts traceGlyph · glyphGeo 를 정리 (marchLoops · rdpClosed 는 같은 파일)',
      body: `import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const S = 160;
cg.font = S + 'px "Black Han Sans"';
cg.textAlign = 'center';
cg.fillText(ch, W / 2, base);
const img = cg.getImageData(0, 0, W, H).data;
const v = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) v[i] = img[i * 4 + 3] / 255;
// 마칭 스퀘어(0.5 경계, 보간) → 고리마다 RDP 0.4px → 글꼴 크기 1 = 1 단위
const loops = marchLoops(v, W, H).map((L) => rdpClosed(L, 0.4).map(([x, y]) => new THREE.Vector2((x - W / 2) / S, (base - y) / S)));
// 가장 큰 고리와 돌림 방향이 같으면 바깥, 반대면 구멍 → 그 구멍을 품은 가장 작은 바깥에
const sign = Math.sign(area(loops.reduce((a, b) => (Math.abs(area(b)) > Math.abs(area(a)) ? b : a))));
const outers = loops.filter((l) => Math.sign(area(l)) === sign).map((l) => ({ l, s: new THREE.Shape(l) }));
for (const h of loops.filter((l) => Math.sign(area(l)) !== sign)) {
  const box = outers.filter((o) => inLoop(h[0], o.l)).sort((a, b) => Math.abs(area(a.l)) - Math.abs(area(b.l)))[0];
  box?.s.holes.push(new THREE.Path(h));
}
const geo = new THREE.ExtrudeGeometry(outers.map((o) => o.s), {
  depth: 0.25, steps: 1, curveSegments: 1,
  bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.022, bevelOffset: 0, bevelSegments: 3,
});
geo.scale(100, 100, 100);                       // 같은 점 찾기 격자(0.01)보다 크게
const smooth = toCreasedNormals(geo, (40 * Math.PI) / 180);
smooth.scale(0.01, 0.01, 0.01);
// 앞뒷면(묶음 0)은 법선을 정확히 (0, 0, ±1) 로 — 안 하면 긴 삼각형 따라 줄무늬
const mesh = new THREE.Mesh(smooth, [paint, new THREE.MeshMatcapMaterial({ matcap: gold })]);`,
    },
    pitfalls: [
      { title: 'fonts.check 만 믿으면 대체 글꼴 윤곽이 캐시된다', fix: '구글 글꼴은 글자 묶음(unicode-range)별로 받는데 check 는 받기 전에도 참을 줬다. load(글꼴, 쓸 글자) 의 약속이 끝난 뒤에만 그 글꼴로 딴다.', seen: true },
      { title: '모서리를 안쪽으로 깎으면 앞면에 큰 삼각형이 튄다', fix: 'bevelOffset = −깎기 는 앞면 윤곽을 줄이는데, 삼각형 나누기는 원래 윤곽으로 해서 가는 획에서 꼬인다. bevelOffset 0 으로.', seen: true },
      { title: '앞면까지 부드럽게 하면 크롬 글자에 대각 줄무늬', fix: 'toCreasedNormals 가 앞면 가장자리 점을 깎은 면과 섞는다. 앞뒷면 묶음의 법선을 (0, 0, ±1) 로 되돌린다.', seen: true },
      { title: '금속에 환경 반사(PMREM)를 쓰면 첫 장면이 0.45초 멈춘다', fix: 'scene.environment 를 처음 쓸 때 PMREM 블러 셰이더를 동기로 굽는다. 매트캡 그림 한 장이면 멈춤 없이 금 · 크롬 · 구리가 된다.', seen: true },
      { title: '점이 너무 촘촘하면 깎기에서 가시가 생긴다', fix: '1px 안으로 붙은 점은 하나로 합치고 RDP 로 줄인다 (글자당 점 30 ~ 60개).' },
    ],
    prev: ['i450', 'i259', 'i09'],
    next: ['i115', 'i242'],
    refs: [
      { name: 'three.js 예제 — webgl_geometry_text', url: 'https://threejs.org/examples/#webgl_geometry_text' },
      { name: 'three.js 소스 — ExtrudeGeometry', url: 'https://github.com/mrdoob/three.js/blob/dev/src/geometries/ExtrudeGeometry.js' },
      { name: 'Wikipedia — Marching squares', url: 'https://en.wikipedia.org/wiki/Marching_squares' },
      { name: 'Wikipedia — Ramer–Douglas–Peucker algorithm', url: 'https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm' },
    ],
  },

  i37: {
    id: 'i37',
    summary: '크랭크 각 θ 하나로 피스톤 · 인벌류트 톱니(16 : 32) · 캠 · 밀대 자리를 모두 식으로 계산해, 맞물림이 겹치지 않고 미끄러지듯 돌게 한다.',
    terms: [
      { en: 'Involute gear profile (pressure angle 20°)', ko: '인벌류트 치형 — 압력각 20°, 모듈 · 잇수로 정해짐' },
      { en: 'Slider-crank kinematics', ko: '크랭크 · 연결 막대 · 피스톤 위치 식' },
      { en: 'Cam and flat-faced follower', ko: '캠과 납작 밀대 — 캠 윤곽의 가장 높은 점이 밀대를 올림' },
      { en: 'Gear ratio · mesh phase', ko: '잇수 비 · 맞물림 위상 (반 피치 어긋남)' },
    ],
    goal: '{target}을(를) 각도 θ 하나로 움직여 줘 — 크랭크 · 피스톤은 x = r·cosθ + √(L² − r²sin²θ), 톱니는 인벌류트 치형으로 위상을 맞춰 겹치지 않게, 캠은 r(φ) 윤곽으로 밀대를 올리게. 분위기는 {style}.',
    targets: ['엔진 크랭크 + 톱니 + 캠 (4행정 캠축)', '시계 톱니바퀴', '자동 인형 · 장난감 기계'],
    styles: ['밝은 교과서 도해', '놋쇠 시계 장치', '설계도 (블루프린트)'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 식을 Update 에서 각 Transform 회전 · 위치로 넣는다 (톱니 메시는 ProBuilder 나 직접 만든 Mesh).',
      godot: 'Godot 은 같은 식을 _process 에서 rotation · position 으로, 톱니 윤곽은 Polygon2D 점 → CSGPolygon3D 돌출로.',
    },
    principle: [
      '톱니: 피치원 r = mz/2, 기초원 rb = r·cos20°, 이끝원 r + m, 이뿌리원 r − 1.25m. 반지름 R 의 면 점은 각 θ(R) = π/2z + inv(20°) − inv(acos(rb/R)) 에, inv(α) = tanα − α.',
      '이 하나의 양쪽 면은 거울 대칭(가운데 ± θ(R)) — 이 곡선이 그대로 2D 윤곽 → 돌출. 모서리는 안쪽으로 깎아 이 면이 정확히 인벌류트 위에 남게.',
      '맞물림: 중심 거리 = r₁ + r₂, 큰 바퀴 각 θ₂ = π + π/z₂ + (z₁/z₂)·θ₁ (반 피치 어긋나 홈이 이를 받음, 반대 방향). 16 : 32 → 2바퀴에 1바퀴.',
      '피스톤 x = r·cosθ + √(L² − r²sin²θ). 캠은 반지름 r(φ) = r₀ + h·(1 − cos πk)/2 로 오르고 머물고 내리며, 납작 밀대 높이 = 돌린 캠 윤곽 점들의 가장 큰 y.',
      '잇수 17 아래는 뿌리가 깎이는 언더컷 — 견본은 16 : 32 로 이끝 간섭 없이(검사: 400 각도에서 겹친 점 0) 맞물린다.',
    ],
    when: ['엔진 · 시계 · 기계 장치의 원리 설명', '톱니비 · 각속도(ω₁z₁ = ω₂z₂) 수업', '자동 인형처럼 캠 모양이 움직임을 정하는 장치'],
    avoid: ['부딪히고 튕기는 자유 운동 — 대신 물리 엔진(Rapier · cannon-es)', '사다리꼴 · 삼각형 이 모양 — 돌 때 이가 서로 파고들거나 틈이 벌어진다'],
    cost: 'light',
    costNote: '모양은 처음 한 번 돌출(톱니 하나 수 ms), 매 프레임은 회전 값 몇 개와 캠 점 180개 최댓값만. 한 장면 1ms 안.',
    level: 2,
    must: [
      '톱니 윤곽은 인벌류트 식으로(압력각 20°, 모듈 · 잇수 → 기초원 · 이끝원 · 이뿌리원), 양쪽 면은 대칭',
      '두 바퀴는 같은 모듈, 중심 거리 = m(z₁ + z₂)/2, 위상 θ₂ = π + π/z₂ + (z₁/z₂)·θ₁ — 이 식을 빼면 첫 장면부터 이가 겹친다',
      '돌출 모서리 깎기는 bevelOffset = −깎기 (윤곽이 부풀면 맞닿는 이가 파고든다)',
      '잇수 17 미만이면 언더컷 · 간섭 확인 (이끝 반지름 ≤ √(rb² + (C·sin20°)²))',
      '모든 자리는 각 θ 하나에서 계산 — 부품마다 따로 시간을 돌리지 않는다',
    ],
    done: [
      '확대해도 두 톱니가 겹치거나 틈이 벌어지지 않고 맞닿은 채 굴러간다 (멈춤 0 빠르기에서 확인)',
      '「피치원 · 기초원 · 작용선」을 켜면 두 피치원이 한 점에서 닿고, 작용선이 두 기초원에 접한다',
      '파랑이 2바퀴 돌 때 노랑(캠)이 1바퀴, 밀대가 캠 모양대로 오르내리고 그래프의 점이 따라간다',
      '빠르기 슬라이더 0 ~ 3 에서도 피스톤 · 막대 · 톱니 · 밀대가 어긋나지 않고 폰에서 60fps',
    ],
    code: {
      lang: 'ts',
      title: '인벌류트 톱니 윤곽 + 맞물림 위상 + 캠 밀대',
      from: 'demos/demosStructure.ts involutePts · i37 을 정리 (식은 demos/demosMechGear.ts gearPts 와 같음)',
      body: `const PA = (20 * Math.PI) / 180;
const inv = (a) => Math.tan(a) - a;
function involutePts(z, m) {
  const rp = (m * z) / 2, rb = rp * Math.cos(PA), ra = rp + m, rf = rp - 1.25 * m;
  const half = Math.PI / (2 * z) + inv(PA);
  const th = (r) => half - inv(Math.acos(Math.min(1, rb / Math.max(r, rb))));
  const rs = [rf, ...(rf < rb ? [rb] : [])];
  for (let i = 1; i <= 6; i++) rs.push(Math.max(rf, rb) + (ra - Math.max(rf, rb)) * (i / 6));
  const P = (r, a) => new THREE.Vector2(r * Math.cos(a), r * Math.sin(a));
  const pts = [];
  for (let i = 0; i < z; i++) {
    const c = (i * 2 * Math.PI) / z;
    for (const r of rs) pts.push(P(r, c - th(r)));                   // 한쪽 면 (아래 → 이끝)
    for (const r of [...rs].reverse()) pts.push(P(r, c + th(r)));   // 거울 면 (이끝 → 아래)
    const a0 = c + th(rf), a1 = c + (2 * Math.PI) / z - th(rf);
    for (let k = 1; k <= 3; k++) pts.push(P(rf, a0 + ((a1 - a0) * k) / 4)); // 이뿌리 호
  }
  return pts;
}
const bev = m * 0.16;
const geo = new THREE.ExtrudeGeometry(new THREE.Shape(involutePts(16, 0.07)), {
  depth: 0.2 - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 2,
});
// 매 프레임: 각 θ 하나로 전부
g1.rotation.z = -th;
g2.rotation.z = Math.PI + Math.PI / 32 + (16 / 32) * th;   // 중심 거리 0.07·(16+32)/2
let top = 0;                                               // 납작 밀대 = 돌린 캠 윤곽의 가장 큰 y
for (const p of camPts) top = Math.max(top, p.clone().rotateAround(O, g2.rotation.z).y);
tappet.position.y = g2.position.y + top;`,
    },
    pitfalls: [
      { title: '사다리꼴 이는 돌 때 서로 파고든다', fix: '이 면이 인벌류트가 아니면 맞닿는 점의 속도가 안 맞아 겹치거나 벌어진다. 인벌류트 식으로 윤곽을 만든다.', seen: true },
      { title: '위상 식을 빼면 첫 장면부터 이가 겹친다', fix: '큰 바퀴를 π + π/z₂ 만큼 돌려 놓아야 이 0 번 앞에 홈이 온다. 견본 검사기로 반 피치 틀리면 겹친 점 239개, 맞으면 0.', seen: true },
      { title: '모서리를 바깥으로 깎으면 이가 부풀어 겹친다', fix: 'ExtrudeGeometry 의 bevelSize 는 윤곽을 그만큼 키운다. bevelOffset = −bevelSize 로 옆벽을 원래 윤곽에 둔다.', seen: true },
      { title: '잇수가 너무 적으면 이끝이 상대 뿌리를 판다', fix: '압력각 20° 는 17개 아래에서 언더컷. 12 : 24 는 간섭이 있어 16 : 32 로 바꿨다 (이끝 ≤ √(rb² + (C·sin20°)²)).', seen: true },
    ],
    prev: ['i450'],
    next: ['i540', 'i541'],
    refs: [
      { name: 'Bartosz Ciechanowski — Gears', url: 'https://ciechanow.ski/gears/' },
      { name: 'Wikipedia — Involute gear', url: 'https://en.wikipedia.org/wiki/Involute_gear' },
      { name: 'Wikipedia — Cam (mechanism)', url: 'https://en.wikipedia.org/wiki/Cam' },
    ],
  },
};

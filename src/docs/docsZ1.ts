import type { TechDoc } from './types';

/**
 * 기술 문서 Z1 — 다시 만든 견본 기준 (2026-10-08)
 *  i24 직접 만든 3D 강체 물리 · i46 GPU 유체 (stable fluids)
 * 같은 id 가 docsB10.ts 에도 있지만, glob 순서상 이 파일이 뒤에 모여 이긴다.
 */
export const DOCS: Record<string, TechDoc> = {
  i24: {
    id: 'i24',
    summary: '상자 · 공의 접촉점을 찾고 충격량을 여러 번 되풀이해 맞춰, 주사위가 구르고 쌓은 나무 탑이 진짜처럼 무너지는 3D 물리를 라이브러리 없이 만든다.',
    terms: [
      { en: 'Rigid body dynamics (sequential impulses)', ko: '강체 물리 — 접촉마다 충격량을 차례로 되풀이해 맞추는 풀이' },
      { en: 'Separating Axis Theorem (SAT) + face clipping', ko: '분리축 15개로 상자 겹침 찾기 + 맞닿은 면을 잘라 접촉점 여러 개' },
      { en: 'Warm starting · Coulomb friction · Restitution', ko: '지난 걸음 충격량 미리 주기 · 마찰 한계 μ·N · 반발 계수' },
      { en: 'Fixed timestep (1/120 s) · Sleeping', ko: '고정 시간 걸음 · 멈춘 물체 계산 생략' },
    ],
    goal: '{target}을(를) 직접 만든 3D 강체 물리로 만들어 줘 — 상자 · 공이 중력으로 떨어져 구르고, 쌓이고, 부딪혀 무너지게. 접촉은 반복 충격량(sequential impulses)으로 풀고, 분위기는 {style}.',
    targets: ['쟁반 속 주사위 굴리기 · 나무 탑 무너뜨리기', '확률 체험 주사위 (윗면 눈 읽기)', '쌓기나무 · 블록 쌓기 체험'],
    styles: ['깨끗한 스튜디오 · 펠트 쟁반', '밝은 장난감 블록', '나무 질감 보드게임'],
    platforms: ['three', 'web', 'unity', 'godot'],
    platformHints: {
      three: '라이브러리를 쓸 수 있다면 Rapier(@dimforge/rapier3d) · cannon-es 가 같은 일을 한다. 이 견본은 원리를 보이려고 직접 만들었다.',
      unity: 'Unity 는 Rigidbody + BoxCollider/SphereCollider 를 붙이면 PhysX 가 같은 계산을 한다. Fixed Timestep · Solver Iterations · Sleep Threshold 가 이 견본의 1/120초 · 되풀이 10번 · 잠자기에 해당한다.',
      godot: 'Godot 은 RigidBody3D + CollisionShape3D. physics_ticks_per_second · solver iterations · can_sleep 이 같은 값이다.',
    },
    principle: [
      '한 걸음(1/120초) = 중력으로 속도 바꾸기 → 닿은 곳(접촉점) 찾기 → 접촉마다 충격량을 10번 되풀이해 맞추기 → 속도로 위치 · 회전 옮기기.',
      '접촉점: 상자는 꼭짓점 8개를 바닥 평면과 견주고, 상자끼리는 분리축 15개(면 3+3, 모서리 곱 9) 중 가장 얕게 겹친 축을 골라 맞은편 면을 잘라(clipping) 점 여러 개를 얻는다.',
      '충격량 λ = (목표 속도 − 지금 속도) × 유효 질량. 누적값은 0 이상(당기지 않음), 마찰은 |마찰| ≤ μ × 수직 충격량 안으로 자른다.',
      '지난 걸음의 충격량을 같은 자리 접촉에 미리 주면(warm start) 탑처럼 무게가 쌓인 곳도 떨리지 않는다. 다 멈춘 몸은 잠재우고(계산 생략), 움직이는 몸이 닿으면 깨운다.',
      '프레임 시간은 실제 지난 시간(0.25초까지)을 1/120초 조각으로 나눠 여러 걸음 — 느린 폰에서도 시간이 느려지지 않는다.',
    ],
    when: ['진짜로 굴러가 멈춘 윗면으로 읽는 주사위 · 확률 체험', '쌓기 · 무너뜨리기처럼 물체끼리 부딪히는 손맛이 중요할 때', '라이브러리를 들일 수 없거나, 물리 원리 자체를 보여 주고 싶을 때'],
    avoid: ['앞뒤로 안 움직이는 장면 — 2D 물리(u48 planck)가 훨씬 가볍고 정확하다', '정해진 칸 위로만 움직이는 퍼즐 — 물리 없이 규칙으로', '몸이 수백 개 · 관절 · 오목한 모양 — 이때는 Rapier 같은 검증된 엔진을'],
    cost: 'medium',
    costNote: '견본은 몸 25개 · 접촉점 최대 300개 × 되풀이 10번 × 1초 120걸음. 넓은 단계는 감싸는 공으로 거르고 잠든 몸끼리는 건너뛴다. PC 한 프레임 1ms 안쪽, 폰은 몸 50개 안쪽으로.',
    level: 3,
    must: [
      '고정 시간 걸음 1/120초 — 프레임 시간을 Math.min(dt, 0.05) 로 자르지 말고 실제 지난 시간(0.25초까지)을 조각내 여러 걸음',
      '반발(튀기) 판단은 warm start 를 주기 전 속도로 — 먼저 준 큰 충격량을 「세게 부딪힘」으로 읽으면 탑이 저절로 튄다',
      'warm start 는 지난 접촉 하나를 새 접촉 하나에만 (같은 옛 충격량을 둘이 받으면 걸음마다 불어난다)',
      '잠자기: 느린 상태가 0.45초 이어지면 재우고, 잠들 만큼 느리지 않은 몸이 닿으면 깨운다 (깨어남이 번져야 위의 몸이 허공에 안 뜬다)',
      '메시는 물리 몸의 위치 · 회전을 복사만 — 움직임의 주인은 물리 쪽 하나',
    ],
    done: [
      '「주사위 던지기」: 주사위 셋이 쟁반 벽에 부딪혀 구르다 멈추고, 각 주사위 위에 윗면 눈 · 위에 합이 뜬다',
      '「탑 쌓기 → 공으로 무너뜨리기」: 24개 나무 탑이 떨림 없이 서 있다가(모두 잠듦) 공에 맞아 무너지고, 조각이 바닥을 뚫지 않고 멈춘다',
      '반발 0 ↔ 0.9, 마찰 0 ↔ 1.2 를 바꾸면 튀는 정도 · 미끄러지는 정도가 눈에 띄게 달라진다',
      '「접촉점 보기」로 빨간 점 + 법선(길이 = 충격량)이 보이고, 폰 · CPU 6배 느림에서도 같은 빠르기로 무너진다',
    ],
    code: {
      lang: 'ts',
      title: '반복 충격량 한 접촉 — 마찰 먼저, 수직 나중 (누적값을 잘라 쓴다)',
      from: 'demos/demosSim.ts RigidWorld.prestep() · solve() 를 정리',
      body: `// prestep: 유효 질량 · 목표 속도 (반발은 warm start 전 속도로 판단)
c.mN = 1 / k(c, c.n);                       // k = 1/mA + 1/mB + n·((I⁻¹(r×n))×r) 두 몸 합
const vn0 = relVel(c).dot(c.n);
let target = c.sep > 0
  ? -c.sep / dt                             // 떨어져 있으면 그만큼만 다가오게 (speculative)
  : (0.2 / dt) * Math.max(0, -c.sep - 0.004); // 파고든 만큼 조금씩 밀어내기 (Baumgarte)
if (vn0 < -0.8 && c.sep < -vn0 * dt) target = Math.max(target, -e * vn0); // 반발
c.target = target;

// solve: 되풀이 10번 × 모든 접촉
function solve(c) {
  const maxF = mu * c.jn;                   // 쿨롱 마찰 한계
  let vt = relVel(c).dot(c.t1);
  let nj = clamp(c.jt1 - vt * c.mT1, -maxF, maxF);
  apply(c, c.t1.clone().multiplyScalar(nj - c.jt1)); c.jt1 = nj;
  vt = relVel(c).dot(c.t2);
  nj = clamp(c.jt2 - vt * c.mT2, -maxF, maxF);
  apply(c, c.t2.clone().multiplyScalar(nj - c.jt2)); c.jt2 = nj;
  const vn = relVel(c).dot(c.n);
  nj = Math.max(0, c.jn + (c.target - vn) * c.mN);  // 밀기만 (누적 ≥ 0)
  apply(c, c.n.clone().multiplyScalar(nj - c.jn)); c.jn = nj;
}
// apply(P): a.v −= P/mA, a.w −= I⁻¹a(ra×P) · b.v += P/mB, b.w += I⁻¹b(rb×P)
// relVel = (vb + wb×rb) − (va + wa×ra)`,
    },
    pitfalls: [
      { title: '반발을 warm start 뒤 속도로 판단하면 쌓은 탑이 저절로 튀어 오른다', fix: '아래 몸에 먼저 준 큰 지지 충격량이 위 접촉에선 「빠르게 다가옴」으로 읽힌다. 모든 접촉의 목표 속도를 먼저 정한 뒤 warm start 를 따로 준다.', seen: true },
      { title: '빠른 공이 얇은 판을 뚫고 지나간다', fix: '1/120초 걸음 + 미리 접촉(margin 2cm 안이면 speculative 접촉, 목표 −sep/dt)으로 다가오는 속도를 막는다. 아주 빠르면 걸음을 더 잘게.' },
      { title: '몸마다 따로 잠재우면 밑의 몸이 빠져도 위의 몸이 허공에 떠 있다', fix: '잠든 몸에 「잠들 만큼 느리지 않은」 몸이 닿으면 깨운다 — 깨어남이 닿은 몸을 따라 번진다 (섬 단위 잠자기와 같은 효과).', seen: true },
      { title: '탑 블록을 딱 붙여 놓으면 시작하자마자 튄다', fix: '층 사이 1.5mm · 옆 2cm 틈을 두고 놓는다 — 처음부터 겹친 만큼을 밀어내느라 생기는 힘이 없다.' },
      { title: '「확률」 체험을 무작위 숫자로 흉내 내면 아이들이 속았다고 느낀다', fix: '주사위는 진짜 물리로 굴리고, 멈춘 뒤 위를 보는 몸 축(가장 큰 y 성분)으로 눈을 읽는다.', seen: true },
    ],
    prev: ['u48'],
    next: ['i47', 'i50'],
    refs: [
      { name: 'Erin Catto — Box2D 발표 자료 (sequential impulses · warm starting)', url: 'https://box2d.org/publications/' },
      { name: 'Wikipedia — Hyperplane separation theorem (SAT)', url: 'https://en.wikipedia.org/wiki/Hyperplane_separation_theorem' },
      { name: 'Rapier (JS) 문서', url: 'https://rapier.rs/docs/user_guides/javascript/getting_started_js' },
    ],
    source: [
      { file: 'demosSim.ts', symbol: 'RigidWorld' },
      { file: 'demosSim.ts', symbol: 'makeRigidDemo' },
    ],
  },

  i46: {
    id: 'i46',
    summary: '속도 · 압력 · 잉크를 렌더 타깃 두 장씩(핑퐁)에 담고 이류 → 발산 → 압력 야코비 → 기울기 빼기를 셰이더 패스로 돌려, 손으로 저으면 잉크가 소용돌이치는 유체를 GPU 로 만든다.',
    terms: [
      { en: 'Stable Fluids on GPU (Jos Stam · GPU Gems ch.38)', ko: '큰 시간 간격에도 터지지 않는 유체를 셰이더로' },
      { en: 'Render target ping-pong (WebGLRenderTarget, HalfFloatType)', ko: '읽는 판 · 쓰는 판을 번갈아 — 16비트 실수 텍스처' },
      { en: 'Pressure projection (Jacobi iterations)', ko: '압력 풀이 — 흐름을 안 눌리게(발산 0) 맞추기, 패스를 N번' },
      { en: 'Vorticity confinement', ko: '계산하며 뭉개지는 잔 소용돌이 되살리기' },
    ],
    goal: '{target}에 GPU stable fluids 유체를 넣어 줘 — 속도 · 압력 · 잉크를 HalfFloat 렌더 타깃 핑퐁으로 두고, 이류 · 발산 · 압력 야코비 · 기울기 빼기 · 소용돌이 살리기를 셰이더 패스로. 끌면 그 방향으로 저어지게, 분위기는 {style}.',
    targets: ['손으로 젓는 잉크 · 연기 화면', '바람 · 대류 · 소용돌이 체험', '메뉴 · 제목 배경 효과'],
    styles: ['어두운 물에 번지는 무지개 잉크', '하얀 연기', '물감 섞기'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: 'WebGLRenderTarget(type: HalfFloatType) 두 장을 바꿔 가며, 화면 크기 판(PlaneGeometry 2×2) 하나에 ShaderMaterial 을 갈아 끼워 그린다. GPUComputationRenderer 로도 같은 틀을 짤 수 있다.',
      unity: 'Unity 는 같은 단계를 Compute Shader 커널로, 값은 RenderTexture(ARGBHalf) 핑퐁으로.',
      godot: 'Godot 은 SubViewport 를 렌더 타깃처럼 쓰거나, 4.x 의 RenderingDevice 컴퓨트 셰이더로.',
    },
    principle: [
      '격자(견본 세로 128 또는 256칸) 텍셀마다 속도 (u, v), 잉크는 더 고운 판(세로 256 · 512)에 색 (r, g, b).',
      '이류: 각 텍셀에서 속도를 거꾸로 따라가 「한 걸음 전 그 자리」 값을 선형 보간으로 가져온다 — 셰이더 한 줄 texture(src, uv − dt·v·texel).',
      '발산을 구하고, 압력을 「이웃 넷 평균 − 발산」으로 20~30번 되풀이(패스 N번)해 구한 뒤, 그 기울기만큼 속도에서 빼면 안 눌리는 흐름이 된다.',
      '소용돌이 살리기: 회전량(curl)이 큰 쪽으로 작은 힘 — 격자가 성겨서 잃는 잔 소용돌이를 되살린다.',
      '셰이더에 반복문이 없다 — 반복은 패스를 여러 번 그리는 것으로. 한 걸음 ≈ 패스 33번이지만 판이 작아 GPU 에는 가볍다.',
    ],
    when: ['손가락으로 저어 보는 체험 · 감탄 화면 (큰 화면도 매끄럽게)', '바람 · 연기 · 대류처럼 흐름 자체를 보여 줄 때', 'CPU 유체(격자 수천 칸)로는 화면이 거칠 때'],
    avoid: ['물이 출렁이는 수조 · 물보라 — 입자 물(i47)이 맞다', '물결 · 파문 — 높이 지도 파동(i48)이 훨씬 싸다', '렌더 타깃 실수 텍스처를 못 쓰는 아주 오래된 기기 — CPU 작은 격자로'],
    cost: 'medium',
    costNote: '256 × 455 격자 ≈ 11만 텍셀 × 한 걸음 패스 33번(압력 25번 포함) + 잉크 512 × 910 판 이류. PC 는 1ms 안쪽, 폰(작은 화면)은 격자 128 · 잉크 256 으로.',
    level: 3,
    must: [
      '렌더 타깃은 HalfFloatType · LinearFilter · ClampToEdge, 깊이 버퍼 끔 — 8비트로는 속도가 뭉개진다',
      '셰이더 안에 반복문 금지(윈도 D3D 컴파일이 느려진다) — 야코비 되풀이는 패스를 N번 그린다',
      'render() 안에서 렌더 타깃에 다 그린 뒤 setRenderTarget(null) 로 화면에, 끝나면 autoClear · 렌더 타깃을 원래대로',
      '순서: 힘 · 잉크 뿌리기 → curl → 소용돌이 → 발산 → 압력(지난 값 × 0.8 에서 시작) → 기울기 빼기 → 속도 이류 → 잉크 이류',
      '실제 지난 시간(0.25초까지)을 1/60초 조각으로 나눠 걸음 — 느린 기기에서도 흐름 빠르기가 같게',
    ],
    done: [
      '카드에서는 저절로 도는 붓 셋이 무지개 잉크를 풀고, 잉크가 소용돌이치며 섞인다',
      '크게 보기에서 끌면 그 방향으로 잉크가 밀려가며 버섯 모양 소용돌이가 생긴다',
      '압력 반복 수를 1 로 내리면 잉크가 한쪽에 몰리거나 퍼져 나가는 차이가 보이고, 소용돌이 세기 0 ↔ 60 으로 잔 소용돌이가 사라졌다 살아난다',
      '「속도장 보기」로 칸마다 흰 화살표 + 방향 색이 보이고, 해상도 128 ↔ 256 을 바꾸면 결이 고와진다',
    ],
    code: {
      lang: 'ts',
      title: '핑퐁 렌더 타깃 + 압력 야코비 패스 (반복은 패스 N번)',
      from: 'demos/demosSim.ts makeFluidDemo() · FL_FRAG.pressure 를 정리',
      body: `const RT = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, {
  type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
});
const pair = (w: number, h: number) => {
  const o = { read: RT(w, h), write: RT(w, h), swap() { [o.read, o.write] = [o.write, o.read]; } };
  return o;
};
// 화면 크기 판 하나에 재질만 갈아 끼워 그린다
function pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
  quad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(scene, cam);
}
// 압력: 이웃 넷 평균에서 발산을 뺀다 — 셰이더엔 반복문이 없다
const pressureFrag = 'uniform sampler2D uPressure; uniform sampler2D uDivergence;' +
  'varying vec2 vUv, vL, vR, vT, vB;' +
  'void main() {' +
  '  float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;' +
  '  float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;' +
  '  gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0., 0., 1.);' +
  '}';
for (let i = 0; i < iters; i++) {          // 20 ~ 30번
  pressureMat.uniforms.uPressure.value = prs.read.texture;
  pressureMat.uniforms.uDivergence.value = div.texture;
  pass(pressureMat, prs.write);
  prs.swap();
}
// 그다음 기울기 빼기: vel −= 0.5·(R − L, T − B) → 속도 · 잉크 이류 → setRenderTarget(null) 로 화면`,
    },
    pitfalls: [
      { title: '셰이더 안에서 야코비를 for 문으로 돌리면 윈도에서 컴파일이 수 초 멈춘다', fix: '반복은 패스를 여러 번 그리는 것으로. 셰이더는 짧고 한 종류씩.', seen: true },
      { title: '8비트 렌더 타깃을 쓰면 속도가 −1 ~ 1 밖에서 잘려 흐름이 멈춘다', fix: 'HalfFloatType 렌더 타깃. 속도는 「칸/초」 단위 수백 ~ 수천 값이 그대로 담긴다.' },
      { title: '화면에 그린 뒤 렌더 타깃을 되돌리지 않으면 같은 renderer 를 쓰는 다른 장면이 엉뚱한 판에 그려진다', fix: 'render() 끝에서 setRenderTarget(이전 값) · autoClear 를 원래대로.' },
      { title: '압력을 매 걸음 0 에서 시작하면 반복 수가 모자라 흐름이 눌린다', fix: '지난 압력에 0.8 을 곱해 첫 값으로 — 같은 반복 수로 훨씬 잘 맞는다.' },
      { title: '느린 기기에서 dt 를 잘라 쓰면 유체가 슬로모션이 된다', fix: '실제 지난 시간(0.25초까지)을 1/60초 조각으로 나눠 걸음을 여러 번.', seen: true },
    ],
    prev: ['i22'],
    next: ['i47', 'i48'],
    refs: [
      { name: 'GPU Gems — Chapter 38. Fast Fluid Dynamics Simulation on the GPU', url: 'https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu' },
      { name: 'Jos Stam — Real-Time Fluid Dynamics for Games (PDF)', url: 'https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf' },
      { name: 'WebGL Fluid Simulation (Pavel Dobryakov)', url: 'https://paveldogreat.github.io/WebGL-Fluid-Simulation/' },
    ],
    source: [
      { file: 'demosSim.ts', symbol: 'FL_FRAG' },
      { file: 'demosSim.ts', symbol: 'makeFluidDemo' },
    ],
  },
};

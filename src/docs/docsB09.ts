import type { TechDoc } from './types';

/**
 * 2D 움직임 (i287 ~ i293) · 2D 의사 3D (i305 ~ i310) · 그리기 도구 (i312 ~ i322) · 손그림 그림체 (i324 ~ i330)
 */
export const DOCS: Record<string, TechDoc> = {
  i287: {
    id: 'i287',
    summary: '둘레 점을 스프링으로 잇고 안쪽 넓이를 지키는 압력을 더해, 떨어지면 찌그러졌다가 통 돌아오는 말랑한 슬라임을 만든다.',
    terms: [
      { en: 'Pressure soft body (mass-spring)', ko: '압력 말랑 몸 — 점 · 스프링 · 안쪽 압력' },
      { en: 'Shoelace formula (polygon area)', ko: '신발끈 공식 — 다각형 넓이' },
      { en: 'Spring-damper (Hooke\'s law)', ko: '늘어난 만큼 당기고 속도만큼 버티는 스프링' },
      { en: 'Fixed timestep', ko: '고정 간격 물리 — 프레임이 흔들려도 같은 결과' },
    ],
    goal: '{target}을(를) 압력 말랑 몸으로 만들어 줘 — 둘레 점을 스프링으로 잇고 넓이를 지키는 압력으로 통통 튀게. 분위기는 {style}.',
    targets: ['슬라임 캐릭터', '젤리 · 푸딩 장애물', '말랑한 공 · 풍선'],
    styles: ['귀엽고 아기자기', '반짝이는 젤리', '어두운 동굴 속 끈적이'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 2D 는 SpringJoint2D 로 점을 잇는 방법도 있지만, 압력은 직접 힘(AddForce)으로 넣어야 한다.',
      godot: 'Godot 은 SoftBody2D 가 없어서 같은 계산을 _physics_process 에서 직접 한다.',
    },
    principle: [
      '원 둘레에 점 22개를 놓고, 이웃 점(i ↔ i+1)과 한 칸 건너 점(i ↔ i+2)을 스프링으로 잇는다.',
      '스프링 힘 = k × (지금 길이 − 처음 길이) + c × (서로 멀어지는 속도). 건너 잇는 스프링이 몸이 꼬이지 않게 버틴다.',
      '신발끈 공식으로 지금 넓이를 재고, 처음 넓이 A0 보다 작으면 각 변을 바깥 법선 쪽으로 민다 — 압력 = 9000 × (A0 − A) / A0.',
      '압력을 0 으로 하면 납작하게 퍼지고, 키우면 단단한 공처럼 된다.',
    ],
    when: ['슬라임 · 젤리 캐릭터가 땅에 닿을 때 찌그러지는 손맛', '넓이 보존(모양이 바뀌어도 넓이는 같다)을 보여 줄 때'],
    avoid: ['딱딱한 물체 — 강체 물리(planck 등)가 훨씬 싸고 안정적', '여러 몸이 서로 부딪는 장면 — 점끼리 충돌이 필요해 무거워진다. 대신 원 하나 강체 + 그림만 찌그러뜨리기'],
    cost: 'light',
    costNote: '점 22개 · 스프링 44개를 1/360초 간격으로 — 프레임마다 6번 정도. 몸 하나는 폰에서도 가볍다.',
    level: 2,
    must: [
      '물리는 고정 간격(1/360초)으로 — 화면 dt 를 그대로 쓰면 단단한 스프링이 터진다',
      '이웃 스프링 + 한 칸 건너 스프링 두 겹 (건너 스프링이 없으면 몸이 접힌다)',
      '넓이는 신발끈 공식, 법선 방향은 넓이 부호로 맞추기 (점 순서가 바뀌어도 바깥쪽)',
      '좌표가 NaN 이 되면 처음 모양으로 되살리기',
      '그림은 점 사이 중점을 2차 곡선으로 이어 매끈하게',
    ],
    done: [
      '슬라임이 바닥에 떨어지면 납작해졌다가 원래 모양으로 통 돌아온다',
      '압력 0 → 납작하게 퍼짐, 압력 2 → 단단한 공. 넓이 % 표시가 100% 근처를 지킨다',
      '점 하나를 잡아 끌어 던질 수 있고, 놓으면 출렁이며 굴러간다',
      '「점 · 스프링 · 압력 보기」를 켜면 건너 스프링과 압력 화살표가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '스프링 두 겹 + 넓이 압력 한 걸음',
      from: 'demos/demos2dMove.ts i287 physics() 를 정리',
      body: `const N = 22;
const x = new Float64Array(N), y = new Float64Array(N);
const vx = new Float64Array(N), vy = new Float64Array(N);
const fx = new Float64Array(N), fy = new Float64Array(N);
let A0 = 0, L0 = 0, L2 = 0; // init 에서 처음 넓이 · 이웃 길이 · 건너 길이를 재 둔다

const area = () => { let s = 0; for (let i = 0; i < N; i++) { const j = (i + 1) % N; s += x[i] * y[j] - x[j] * y[i]; } return s / 2; };
function spring(i: number, j: number, rest: number, k: number, c: number) {
  const dx = x[j] - x[i], dy = y[j] - y[i], d = Math.hypot(dx, dy) || 1e-6;
  const nx = dx / d, ny = dy / d;
  const rv = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;   // 멀어지는 속도
  const f = k * (d - rest) + c * rv;
  fx[i] += f * nx; fy[i] += f * ny; fx[j] -= f * nx; fy[j] -= f * ny;
}
function physics(h: number, kP = 1, kS = 1) {
  fx.fill(0); fy.fill(0);
  for (let i = 0; i < N; i++) {
    spring(i, (i + 1) % N, L0, 2200 * kS, 10);   // 둘레
    spring(i, (i + 2) % N, L2, 500 * kS, 4);     // 건너 잇기 — 접힘 막기
  }
  const A = area(), sgn = A > 0 ? 1 : -1;
  const P = 9000 * kP * (A0 - Math.abs(A)) / A0; // 줄어든 만큼 밀어낸다
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, ex = x[j] - x[i], ey = y[j] - y[i];
    const nx = ey * sgn, ny = -ex * sgn;          // 변의 바깥 법선 (길이 = 변 길이)
    fx[i] += nx * P * 0.25; fy[i] += ny * P * 0.25; fx[j] += nx * P * 0.25; fy[j] += ny * P * 0.25;
  }
  for (let i = 0; i < N; i++) {
    vx[i] = (vx[i] + fx[i] * h) * 0.9995;
    vy[i] = (vy[i] + (fy[i] + 520) * h) * 0.9995; // 520 = 중력
    x[i] += vx[i] * h; y[i] += vy[i] * h;
    if (y[i] > 160) { y[i] = 160; if (vy[i] > 0) vy[i] *= -0.1; vx[i] *= 0.96; } // 바닥 · 마찰
  }
}`,
    },
    pitfalls: [
      { title: '화면 dt 로 바로 적분하면 스프링이 터진다', fix: '단단한 스프링(2200)은 작은 간격이 필요하다. 1/360초 고정 간격으로 여러 번 돌리고, 한 프레임 최대 횟수를 둔다.' },
      { title: '둘레 스프링만 있으면 몸이 안으로 접힌다', fix: '한 칸 건너 스프링을 더한다 — 견본은 둘레 2200 · 건너 500.' },
      { title: '점 순서가 시계 · 반시계로 바뀌면 압력이 안쪽으로 민다', fix: '넓이의 부호(sgn)를 법선에 곱해 늘 바깥쪽으로.' },
      { title: '터진 뒤 NaN 이 퍼지면 화면에서 사라진다', fix: '중심이 유한한지 매 프레임 보고, 아니면 처음 모양으로 다시 놓는다.' },
    ],
    prev: ['i286'],
    next: ['i288', 'i293'],
    refs: [{ name: 'Wikipedia — Shoelace formula', url: 'https://en.wikipedia.org/wiki/Shoelace_formula' }],
  },

  i288: {
    id: 'i288',
    summary: '수면을 점 72개의 스프링 기둥으로 나누고 이웃으로 높이를 퍼뜨려, 물건이 떨어지면 첨벙 출렁이고 물결이 양옆으로 번지게 한다.',
    terms: [
      { en: '2D water surface (spring columns)', ko: '수면 점마다 위아래로 흔들리는 스프링' },
      { en: 'Wave propagation (spread)', ko: '이웃 기둥으로 높이 차를 나눠 주기' },
      { en: 'Damping', ko: '잦아들게 하는 감쇠' },
      { en: 'Buoyancy', ko: '물에 잠긴 만큼 떠오르는 힘' },
    ],
    goal: '{target}에 출렁이는 2D 물 표면을 넣어 줘 — 수면 점마다 스프링, 이웃으로 퍼지며 물체가 떨어지면 첨벙. 분위기는 {style}.',
    targets: ['물통 · 수조', '물 위를 떠다니는 장난감 놀이', '바다 · 호수 수면'],
    styles: ['노을빛 동화', '깔끔한 만화', '밤바다'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 기둥 배열을 C# 으로 돌리고 LineRenderer 나 Mesh 로 수면을 그린다.',
      godot: 'Godot 은 Polygon2D 의 점을 매 프레임 기둥 높이로 바꿔 그린다.',
    },
    principle: [
      '수면을 같은 간격 점 72개(기둥)로 나누고, 기둥마다 「쉬는 높이로 돌아가려는 스프링」을 단다 — 가속 = −K × 높이 − 감쇠 × 속도.',
      '각 기둥은 이웃과의 높이 차에 퍼짐 정도(0.28)를 곱한 만큼 이웃을 끌어당긴다. 이걸 6번 되풀이하면 물결이 옆으로 번진다.',
      '물건이 수면에 처음 닿으면 닿은 곳 근처 기둥들 속도에 떨어지는 속도를 나눠 준다(첨벙) — 가운데가 가장 크게.',
      '수면 높이는 두 기둥 사이를 선형 보간해 읽는다. 물건은 잠긴 깊이만큼 위로 뜨고, 수면 기울기로 미끄러진다.',
    ],
    when: ['물통 · 물 위 놀이처럼 수면이 화면의 주인공일 때', '물건이 떨어지는 순간의 손맛(첨벙 · 물방울)이 필요할 때'],
    avoid: ['물이 쏟아지고 흐르는 장면 — 기둥 방식은 수면 높이만 안다. 대신 입자 유체(SPH)', '3D 물 — 셰이더 수면(높이 지도 · 법선)이 맞다'],
    cost: 'light',
    costNote: '기둥 72개 × 퍼짐 6번 = 프레임마다 몇 백 번 덧셈. 물방울 알갱이까지 폰에서 가볍다.',
    level: 1,
    must: [
      '물리는 고정 간격(1/120초)으로 — 퍼짐 값이 크면 화면 dt 로는 폭주한다',
      '퍼짐 계산은 왼쪽 · 오른쪽 차이를 먼저 다 구한 뒤 한꺼번에 더하기 (구하면서 더하면 한쪽으로 쏠린다)',
      '첨벙은 수면에 처음 닿는 순간 한 번만 (inW 같은 「물속」 표시로)',
      '튄 물방울이 수면에 다시 떨어지면 그 기둥에도 작은 힘을 준다',
    ],
    done: [
      '돌이 떨어지면 수면이 움푹 들어갔다가 물결이 양옆으로 번지고, 물방울이 튄다',
      '퍼짐 0 이면 제자리에서만 출렁이고, 0.45 면 멀리까지 번진다',
      '잦아드는 정도를 키우면 물결이 금방 잔잔해진다',
      '가벼운 공은 둥둥 뜨고, 돌은 가라앉는다',
    ],
    code: {
      lang: 'ts',
      title: '스프링 기둥 + 이웃 퍼짐 + 첨벙',
      from: 'demos/demos2dMove.ts i288 physics() · splash() 를 정리',
      body: `const N = 72, REST = 104, DX = 280 / (N - 1);
const hgt = new Float64Array(N), vel = new Float64Array(N);
const lD = new Float64Array(N), rD = new Float64Array(N);
let spread = 0.28, damp = 0.04;

function stepWater(h: number) {
  const K = 0.025 * 3600;
  for (let i = 0; i < N; i++) {                        // 기둥마다 스프링
    vel[i] += (-K * hgt[i] - damp * 60 * vel[i]) * h;
    hgt[i] += vel[i] * h;
  }
  for (let pass = 0; pass < 6; pass++) {               // 이웃으로 퍼지기
    for (let i = 0; i < N; i++) {                      // 차이를 먼저 다 구하고
      lD[i] = i > 0 ? spread * (hgt[i] - hgt[i - 1]) : 0;
      rD[i] = i < N - 1 ? spread * (hgt[i] - hgt[i + 1]) : 0;
    }
    for (let i = 0; i < N; i++) {                      // 한꺼번에 더한다
      if (i > 0) { hgt[i - 1] += lD[i] * h * 8; vel[i - 1] += lD[i] * 60 * h * 8; }
      if (i < N - 1) { hgt[i + 1] += rD[i] * h * 8; vel[i + 1] += rD[i] * 60 * h * 8; }
    }
  }
}
/** 그 x 의 수면 높이 (두 기둥 사이 보간) */
function surfAt(x: number) {
  const f = Math.max(0, Math.min(N - 1.001, x / DX)), i = Math.floor(f);
  return REST + hgt[i] + (hgt[i + 1] - hgt[i]) * (f - i);
}
/** 첨벙 — 가운데일수록 세게 */
function splash(x: number, force: number, wide = 2) {
  const c = Math.round(x / DX);
  for (let i = -wide; i <= wide; i++) {
    const j = c + i;
    if (j >= 0 && j < N) vel[j] += force * (1 - Math.abs(i) / (wide + 1));
  }
}`,
    },
    pitfalls: [
      { title: '퍼짐을 구하면서 바로 더하면 물결이 한쪽으로 쏠린다', fix: '왼쪽 · 오른쪽 차이 배열(lD · rD)을 먼저 다 채운 뒤 따로 더한다.' },
      { title: '물속에 있는 동안 매 프레임 첨벙하면 수면이 끝없이 끓는다', fix: '처음 닿는 순간 한 번만 splash, 물속에서는 속도가 클 때만 작은 힘(0.02배)을 준다.' },
      { title: '퍼짐 값을 0.5 넘게 주면 수면이 폭주한다', fix: '견본은 0 ~ 0.45 로 막아 둔다. 고정 간격 1/120초도 함께.' },
    ],
    prev: ['i287'],
    next: ['i289'],
  },

  i289: {
    id: 'i289',
    summary: '땅을 한 칸 = 한 픽셀인 칸 지도(비트맵)로 들고 폭발 자리를 동그랗게 지워, 남은 땅 위를 캐릭터가 걷고 떨어지게 한다.',
    terms: [
      { en: 'Destructible terrain (bitmap mask)', ko: '부서지는 땅 — 칸마다 땅 있음/없음' },
      { en: 'Pixel collision', ko: '그 칸이 땅인지 보고 부딪힘 판단' },
      { en: 'destination-out compositing', ko: '그림 캔버스에서 동그랗게 지우기' },
      { en: 'Projectile motion', ko: '포물선으로 나는 포탄' },
    ],
    goal: '{target}에 부서지는 땅을 만들어 줘 — 땅을 칸 지도로 들고 폭발 자리를 동그랗게 지우고, 남은 땅 위로 걷고 떨어지게. 분위기는 {style}.',
    targets: ['포물선 대포 놀이', '굴 파기 게임', '폭탄 퍼즐'],
    styles: ['노을 언덕 만화', '도트 그림', '귀여운 그림책'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Texture2D 픽셀을 지우고(SetPixels · Apply) 충돌은 같은 배열로 직접 보거나 PolygonCollider2D 를 다시 만든다.',
      godot: 'Godot 은 Image 를 지우고 ImageTexture 로 다시 올린다. 충돌은 BitMap.opaque_to_polygons 로 다시 만들 수 있다.',
    },
    principle: [
      '땅을 280 × 175 칸의 0/1 배열(mask)로 둔다. 1 = 땅. 그림은 2배 크기 캔버스에 따로 그려 둔다.',
      '폭발하면 반지름 r 원 안의 칸을 0 으로 바꾸고, 그림 캔버스에서도 같은 원을 destination-out 으로 지운다. 테두리엔 그을음.',
      '걷는 캐릭터는 발밑 칸이 땅인지만 본다. 땅이면 위로 올라가며 빈칸을 찾아 발 높이로(ground), 아니면 중력으로 떨어진다.',
      '앞 칸이 4칸보다 높으면 벽으로 보고 돌아선다. 포탄은 한 프레임을 4번 나눠 움직이며 땅에 닿는지 본다.',
    ],
    when: ['웜즈 꼴 포탄 놀이처럼 땅 모양이 계속 바뀔 때', '파 내려가는 굴 · 모래 놀이'],
    avoid: ['땅이 바뀌지 않는 판 — 타일 충돌이 더 싸고 단순하다', '아주 큰 세상 — 칸 지도가 커지면 메모리 · 지우기 비용이 커진다. 대신 조각(청크)으로 나눈다'],
    cost: 'light',
    costNote: '칸 지도 4.9만 칸(280×175). 폭발 한 번은 반지름² 칸만 고친다. 그림은 drawImage 한 번.',
    level: 2,
    must: [
      '충돌용 칸 지도와 보이는 그림을 따로 들고, 폭발 때 둘 다 같은 원으로 지우기',
      '그림 지우기는 destination-out, 그을음은 source-atop (남은 땅에만 칠해지게)',
      '화면 밖 아래는 땅, 옆 · 위는 빈칸으로 보기 (떨어져 사라지지 않게)',
      '빠른 포탄은 한 프레임을 여러 번 나눠 검사 — 얇은 땅을 뚫지 않게',
    ],
    done: [
      '화면을 누른 자리에 동그란 구멍이 나고, 둘레가 그을린다',
      '발밑 땅이 사라지면 캐릭터가 떨어지고, 아래 땅에 내려앉아 다시 걷는다',
      '폭발 크기 슬라이더로 구멍 크기가 바뀐다',
      '「칸 지도 보기」를 켜면 그림과 충돌 칸이 똑같이 겹친다',
    ],
    code: {
      lang: 'ts',
      title: '칸 지도로 땅 들기 · 동그랗게 지우기 · 발 놓을 곳 찾기',
      from: 'demos/demos2dMove.ts i289 solid() · explode() · ground() 를 정리',
      body: `const W = 280, H = 175, S = 2;                 // 칸 지도 크기 · 그림 배율
const mask = new Uint8Array(W * H);              // 1 = 땅
const art = document.createElement('canvas');
art.width = W * S; art.height = H * S;           // 땅 그림은 여기에 미리 그려 둔다

function solid(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  if (xi < 0 || xi >= W) return false;
  if (yi >= H) return true;                      // 화면 아래는 늘 땅
  if (yi < 0) return false;
  return mask[yi * W + xi] === 1;
}
function explode(ex: number, ey: number, r: number) {
  for (let y = Math.max(0, Math.floor(ey - r)); y < Math.min(H, ey + r + 1); y++)
    for (let x = Math.max(0, Math.floor(ex - r)); x < Math.min(W, ex + r + 1); x++)
      if ((x - ex) ** 2 + (y - ey) ** 2 <= r * r) mask[y * W + x] = 0;
  const g = art.getContext('2d')!;
  g.setTransform(S, 0, 0, S, 0, 0);
  g.globalCompositeOperation = 'source-atop';    // 그을음은 남은 땅에만
  const sg = g.createRadialGradient(ex, ey, r * 0.9, ex, ey, r + 4);
  sg.addColorStop(0, 'rgba(30,12,5,.85)'); sg.addColorStop(1, 'rgba(60,25,10,0)');
  g.fillStyle = sg; g.beginPath(); g.arc(ex, ey, r + 4, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out'; // 구멍 뚫기
  g.beginPath(); g.arc(ex, ey, r, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'source-over';
}
/** y 근처에서 위로 올라가며 발 놓을 높이 */
function ground(x: number, y: number) {
  let yy = Math.floor(y);
  while (yy > 0 && solid(x, yy - 1)) yy--;
  return yy;
}`,
    },
    pitfalls: [
      { title: '그림만 지우고 칸 지도를 안 고치면 허공을 걷는다', fix: '폭발 한 번에 mask 와 그림 캔버스를 같은 원 · 같은 반지름으로 함께 지운다.' },
      { title: '빠른 포탄이 얇은 땅을 뚫고 지나간다', fix: '견본은 한 프레임을 4번 나눠 움직이며 매번 solid 를 본다.' },
      { title: '그을음을 source-over 로 칠하면 하늘까지 검게 번진다', fix: 'source-atop 으로 칠해 남은 땅 픽셀에만 묻게 한다.' },
    ],
    prev: ['i283'],
    next: ['i290'],
  },

  i290: {
    id: 'i290',
    summary: '행성마다 거리 제곱에 반비례하는 중력을 더해 휘는 궤도를 만들고, 쏘기 전에 같은 계산을 앞당겨 궤적 점선과 「도착 · 충돌 예상」을 보여 준다.',
    terms: [
      { en: 'N-body gravity (inverse-square law)', ko: '거리² 에 반비례하는 중력을 여러 행성에서 더하기' },
      { en: 'Trajectory prediction', ko: '같은 물리를 미리 돌려 보는 궤적 점선' },
      { en: 'Semi-implicit Euler integration', ko: '속도 먼저 · 위치 나중 한 걸음' },
      { en: 'Gravity well', ko: '중력 우물 — 휜 격자로 보이기' },
    ],
    goal: '{target}에 행성 중력 궤도를 만들어 줘 — 행성 중력으로 휘는 길, 새총처럼 당겨 쏘기, 쏘기 전 궤적 점선. 분위기는 {style}.',
    targets: ['우주선 새총 퍼즐', '포물선 · 원운동 설명', '골프 · 공 던지기 퍼즐'],
    styles: ['반짝이는 밤 우주', '만화 같은 행성', '깔끔한 과학 그림'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Rigidbody2D 의 gravityScale 을 0 으로 두고 FixedUpdate 에서 AddForce 로 행성 힘을 더한다. 점선은 같은 식을 미리 돌려 LineRenderer 로.',
      godot: 'Godot 은 Area2D 의 point gravity(gravity_point) 로 행성 중력을 줄 수 있다. 미리 보기는 직접 계산.',
    },
    principle: [
      '행성마다 끌어당기는 가속 = GM × (행성 쪽 방향) / 거리³ — 거리² 에 반비례하는 힘을 방향 벡터로 나타낸 꼴. 여러 행성은 그냥 더한다.',
      '거리² 에 작은 값(30)을 더해 행성 바로 옆에서 가속이 무한히 커지지 않게 한다.',
      '1/120초마다 속도 += 가속 × h, 위치 += 속도 × h. 실제로 날 때와 미리 보기가 같은 함수 · 같은 간격이라 점선이 정확하다.',
      '미리 보기는 700걸음을 돌려 3걸음마다 점을 남기고, 행성에 닿음 · 목표 도착 · 화면 밖으로 끝을 알린다.',
    ],
    when: ['「행성을 스치면 휘어 간다」를 직접 해 보는 퍼즐', '쏘기 전에 결과를 예상해 보게 하는 조준 놀이'],
    avoid: ['정확한 천체 궤도 계산 — 오일러는 오래 돌리면 에너지가 샌다. 대신 베를레 · RK4', '중력이 하나뿐인 포물선 — 식 하나로 바로 그리면 된다'],
    cost: 'light',
    costNote: '미리 보기 700걸음 × 행성 2개. 조준할 때만 매 프레임. 좋은 각 찾기(search)는 질량 바꿀 때만 한 번.',
    level: 2,
    must: [
      '실제 비행과 미리 보기가 같은 가속 함수 · 같은 간격(1/120초)을 쓰기 — 다르면 점선이 거짓말을 한다',
      '거리² 에 작은 값을 더해 가까이서 튀지 않게',
      '미리 보기 끝을 「도착 예상 · 충돌 예상 · 날아감」으로 색을 달리해 표시',
      '당긴 반대 방향으로 쏘기 (새총) — 당긴 길이 × 4 를 속도로, 40 ~ 260 으로 막기',
    ],
    done: [
      '발사대를 당기면 궤적 점선이 바로 바뀌고, 놓으면 우주선이 점선을 그대로 따라 난다',
      '행성 질량 슬라이더를 키우면 길이 더 크게 휜다',
      '중력 우물 격자가 행성 쪽으로 휘어 들어가 보인다',
      '점선 끝 표시가 실제 결과(도착 · 쾅)와 같다',
    ],
    code: {
      lang: 'ts',
      title: '여러 행성 중력 + 궤적 미리 보기',
      from: 'demos/demos2dMove.ts i290 acc() · sim() 을 정리',
      body: `const PL = [
  { x: 150, y: 96, gm: 3.6e5, r: 17 },
  { x: 222, y: 50, gm: 0.9e5, r: 8 },
];
const LA = { x: 28, y: 146 }, GOAL = { x: 256, y: 128, r: 10 };
const H = 1 / 120;                                // 비행 · 미리 보기 같은 간격

function acc(x: number, y: number, mass = 1): [number, number] {
  let ax = 0, ay = 0;
  for (const p of PL) {
    const dx = p.x - x, dy = p.y - y;
    const d2 = dx * dx + dy * dy + 30;            // +30 — 가까이서 무한대 막기
    const f = (p.gm * mass) / (d2 * Math.sqrt(d2)); // 방향 벡터 / 거리³ = 거리² 반비례
    ax += dx * f; ay += dy * f;
  }
  return [ax, ay];
}
type End = 'hit' | 'goal' | 'out' | 'none';
function sim(vx: number, vy: number, steps = 700): { pts: number[]; end: End } {
  let x = LA.x, y = LA.y;
  const pts: number[] = [];
  for (let i = 0; i < steps; i++) {
    const [ax, ay] = acc(x, y);
    vx += ax * H; vy += ay * H;                  // 속도 먼저
    x += vx * H; y += vy * H;                    // 위치 나중
    if (i % 3 === 0) pts.push(x, y);             // 점선 점
    for (const p of PL) if (Math.hypot(p.x - x, p.y - y) < p.r) return { pts, end: 'hit' };
    if (Math.hypot(GOAL.x - x, GOAL.y - y) < GOAL.r) return { pts, end: 'goal' };
    if (x < -40 || x > 320 || y < -60 || y > 215) return { pts, end: 'out' };
  }
  return { pts, end: 'none' };
}`,
    },
    pitfalls: [
      { title: '미리 보기와 실제 비행의 간격이 다르면 점선과 다른 곳으로 난다', fix: '둘 다 같은 acc · 같은 h(1/120). 실제 비행도 고정 간격 루프로 돌린다.' },
      { title: '행성 바로 옆을 지나면 속도가 폭발한다', fix: '거리² 에 작은 값(견본 30)을 더하고, 행성 반지름 안에 들면 충돌로 끝낸다.' },
      { title: '질량을 바꿀 때마다 매 프레임 좋은 각을 찾으면 느리다', fix: '각도 × 속도 표 검색(search)은 질량이 바뀔 때만 한 번 돌린다.' },
    ],
    prev: ['i285'],
    next: ['i291'],
  },

  i291: {
    id: 'i291',
    summary: '쏘는 각도를 한 발마다 조금씩 돌리거나 속도를 각도의 식으로 바꾸기만 해서, 나선 · 꽃 · 물결 탄막 무늬를 만든다 — 수식이 곧 무늬.',
    terms: [
      { en: 'Bullet hell patterns (danmaku)', ko: '탄막 — 무늬로 쏟아지는 탄' },
      { en: 'Polar coordinates (r, θ)', ko: '극좌표 — 거리와 각도로 위치' },
      { en: 'Rose curve r = 1 + ½cos(kθ)', ko: '각도에 따라 속도를 바꿔 꽃잎 꼴' },
      { en: 'Additive blending (lighter)', ko: '겹친 탄이 더 밝게 빛나기' },
    ],
    goal: '{target}에 극좌표 탄막 무늬를 만들어 줘 — 각도를 조금씩 돌리며 쏘는 나선 · 꽃 · 물결, 화면에 지금 식을 보여 주기. 분위기는 {style}.',
    targets: ['슈팅 게임 보스', '극좌표 · 각도 설명 화면', '불꽃놀이 연출'],
    styles: ['네온빛 밤하늘', '귀여운 유령 보스', '깔끔한 수학 그림'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 각도 식으로 탄을 만들고, 많으면 오브젝트 풀 · ParticleSystem 으로 그린다.',
      godot: 'Godot 은 탄을 배열로 들고 _draw 나 MultiMeshInstance2D 로 한꺼번에 그린다.',
    },
    principle: [
      '탄 하나 = 각도 θ 방향으로 일정 속도로 곧게 나가는 점. 속도 = (cos θ, sin θ) × v.',
      '나선: n 번째 발의 각 θ = n × α (α = 13°). 120° 씩 세 갈래를 함께 쏘면 세 팔 나선.',
      '꽃: 한 번에 40발을 원으로 쏘되 속도 = v × (1 + ½ cos 5θ) — 빠른 쪽이 꽃잎 5장이 된다. 판마다 7° 씩 돌린다.',
      '물결: θ = 90° + 55° × sin(2.2t) 로 아래쪽을 쓸고, 맞도는 나선은 +nα 와 −nα 두 줄을 겹친다.',
    ],
    when: ['보스 · 함정이 「규칙 있는 무늬」로 공격할 때', '극좌표 · 삼각함수를 눈으로 보여 줄 때'],
    avoid: ['탄이 수천 개 넘는 장면 — 캔버스 drawImage 한계. 대신 WebGL 인스턴싱', '어린 아이용 판 — 피하기가 어렵다. 탄 수 · 속도를 줄인다'],
    cost: 'light',
    costNote: '탄 최대 900개, 탄마다 미리 구운 32px 빛 그림을 drawImage 한 번. 폰도 무리 없다.',
    level: 1,
    must: [
      '탄 그림은 색마다 화면 밖 캔버스에 한 번 구워 두고 drawImage 만 (탄마다 그라데이션 금지)',
      '겹친 탄은 globalCompositeOperation = lighter 로 더 밝게',
      '탄 수 상한(900)과 화면 밖으로 나간 탄 지우기',
      '지금 무늬의 식을 화면에 함께 보여 주기 (α 값이 바뀌면 글도 바뀌게)',
    ],
    done: [
      '「다음 무늬」를 누를 때마다 나선 → 꽃 → 물결 → 맞도는 나선으로 바뀐다',
      'α 슬라이더를 1° → 60° 로 바꾸면 촘촘한 나선이 성긴 별 모양으로 바뀐다',
      '화면 아래에 지금 식(θ = n × α 등)이 보이고, α 숫자도 따라 바뀐다',
      '방향키로 직접 피할 수 있고, 손을 떼면 저절로 피한다',
    ],
    code: {
      lang: 'ts',
      title: '네 가지 탄막 식',
      from: 'demos/demos2dMove.ts i291 emit() · shoot() 를 정리',
      body: `const D = Math.PI / 180, TAU = Math.PI * 2;
interface Bul { x: number; y: number; vx: number; vy: number; c: number }
const bs: Bul[] = [];
const boss = { x: 140, y: 46 };
let pat = 0, n = 0, em = 0, alpha = 13;          // alpha = 한 발마다 도는 각(도)

function shoot(a: number, sp: number, c: number) {
  if (bs.length > 900) return;                   // 탄 수 상한
  bs.push({ x: boss.x + Math.cos(a) * 8, y: boss.y + Math.sin(a) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c });
}
function emit(h: number, t: number) {
  em -= h;
  if (em > 0) return;
  if (pat === 0) {                               // 나선: θ = n·α, 세 갈래
    for (let k = 0; k < 3; k++) shoot(n * alpha * D + (k * TAU) / 3, 62, k);
    em += 0.04;
  } else if (pat === 1) {                        // 꽃: 속도 = v(1 + ½cos5θ)
    const rot = n * 7 * D;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU + rot;
      shoot(a, 46 * (1 + 0.5 * Math.cos(5 * (a - rot))), 1);
    }
    em += 0.42;
  } else if (pat === 2) {                        // 물결: θ = 90° + 55°·sin(2.2t)
    const base = 90 * D + 55 * D * Math.sin(2.2 * t);
    for (const o of [-20, 0, 20]) shoot(base + o * D, 78, 2);
    em += 0.045;
  } else {                                       // 맞도는 나선: +nα, −nα
    const a = n * alpha * 0.9 * D;
    for (let k = 0; k < 4; k++) { shoot(a + (k * TAU) / 4, 58, 4); shoot(-a + (k * TAU) / 4 + 0.4, 58, 3); }
    em += 0.07;
  }
  n++;
}`,
    },
    pitfalls: [
      { title: '탄마다 그라데이션을 새로 만들면 수백 개에서 끊긴다', fix: '색마다 32px 빛 공을 한 번 구워 두고 drawImage(spr, x−5, y−5, 10, 10) 로 찍는다.' },
      { title: 'α 가 360° 의 약수 근처면 나선이 몇 줄 직선으로 보인다', fix: '13° 처럼 360 과 서로소인 값이 고른 나선. 직선이 되는 순간도 보여 주면 좋은 수학 이야기다.' },
      { title: '쏘는 간격을 프레임마다로 하면 기기마다 무늬가 다르다', fix: '고정 간격 루프 안에서 em(남은 시간)을 빼며 쏜다 — 60fps · 120fps 에서 같은 무늬.' },
    ],
    prev: ['i290'],
    next: ['i292'],
  },

  i292: {
    id: 'i292',
    summary: '같은 거리 · 같은 시간의 이동을 linear · easeInOut · easeOut · back · elastic · bounce 로 나란히 돌리고 곡선 그래프를 붙여, 움직임 맛을 비교해 고르게 한다.',
    terms: [
      { en: 'Easing functions (tweening)', ko: '이징 — 0→1 시간을 0→1 위치로 바꾸는 곡선' },
      { en: 'easeOutCubic · easeInOutCubic', ko: '감속 · 살살-빠르게-살살' },
      { en: 'easeOutBack · easeOutElastic · easeOutBounce', ko: '넘쳤다 돌아옴 · 고무줄 · 튀며 멈춤' },
      { en: 'Lerp', ko: '선형 보간 — 시작 + (끝 − 시작) × 값' },
    ],
    goal: '{target}에 이징 곡선을 골라 넣어 줘 — 같은 이동을 linear · easeOut · back · elastic · bounce 로 비교하고 곡선 그래프도 함께. 분위기는 {style}.',
    targets: ['단추 · 카드 · 창 움직임', '캐릭터 등장 연출', '움직임 고르기 비교 화면'],
    styles: ['통통 튀는 귀여움', '부드럽고 차분한', '깔끔한 설명 화면'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      web: 'CSS 는 transition-timing-function 의 cubic-bezier() 로 easeOut · back 꼴을 만든다 (elastic · bounce 는 linear() 점 목록이나 JS).',
      unity: 'Unity 는 AnimationCurve 로 곡선을 그리거나 DOTween 같은 트윈 도구의 Ease 를 고른다.',
      godot: 'Godot 은 Tween 의 set_trans(TRANS_BACK · ELASTIC · BOUNCE) · set_ease(EASE_OUT).',
    },
    principle: [
      '진행률 p = 지난 시간 / 걸리는 시간 (0 → 1). 이징 함수 f 는 p 를 「얼마나 왔나」로 바꾼다.',
      '위치 = lerp(시작, 끝, f(p)). 거리 · 시간은 같고 f 만 다르다.',
      'back 은 1 을 살짝 넘었다 돌아오고(c1 = 1.70158), elastic 은 2^(−10p) × sin 으로 출렁, bounce 는 포물선 4토막으로 튄다.',
      '같은 시간 간격 점(1/12 마다)을 찍으면 점이 촘촘한 곳 = 느린 곳, 성긴 곳 = 빠른 곳이 보인다.',
    ],
    when: ['단추 · 카드 · 창이 나타나고 사라질 때 — 거의 모든 UI 움직임', '어떤 맛이 좋은지 여럿을 나란히 비교해 고를 때'],
    avoid: ['목표가 계속 바뀌는 따라가기 — 끊긴다. 대신 스프링(i293)', '물리로 움직여야 하는 것 — 이징은 정해진 길만 간다'],
    cost: 'light',
    costNote: '함수 한 번 계산 — 비용 없음.',
    level: 1,
    must: [
      '이징 함수는 p 를 0 ~ 1 로 받아 f(0) = 0, f(1) = 1 이 되게 (back · elastic 은 중간에 1 을 넘어도 됨)',
      'p 는 반드시 0 ~ 1 로 자르고 넣기',
      '같은 거리 · 같은 시간으로 나란히 비교 + 곡선 그래프(시간 → 위치)를 옆에',
      '크기에 back · elastic 을 쓸 때는 음수 크기가 되지 않게 막기 (견본은 −0.3 ~ 1.4 로 자름)',
    ],
    done: [
      '여섯 줄이 같은 순간 출발해 같은 순간 도착하는데 움직임 맛이 다르다',
      '「같은 시간 간격 점」을 켜면 easeOut 은 끝쪽 점이 촘촘하다',
      '걸리는 시간 슬라이더로 모든 줄이 함께 빨라지고 느려진다',
      '「크기에도 적용」을 켜면 back · elastic 이 크기로도 통통 튄다',
    ],
    code: {
      lang: 'ts',
      title: '이징 여섯 가지와 쓰는 법',
      from: 'demos/demos2dMove.ts EASE 표 · i292 draw() 를 정리',
      body: `export const EASE: Record<string, (x: number) => number> = {
  linear: (x) => x,
  easeInOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  easeOut: (x) => 1 - Math.pow(1 - x, 3),
  back: (x) => {
    const c1 = 1.70158, c3 = c1 + 1;               // 살짝 넘쳤다 돌아옴
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  elastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  bounce: (x) => {
    const n1 = 7.5625, d1 = 2.75;                   // 포물선 4토막
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  },
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 시작한 지 elapsed 초 — dur 초 동안 x0 → x1 */
function tweenX(x0: number, x1: number, elapsed: number, dur: number, ease = EASE.easeOut) {
  const p = Math.max(0, Math.min(1, elapsed / dur));  // 0 ~ 1 로 자르기
  return lerp(x0, x1, ease(p));
}`,
    },
    pitfalls: [
      { title: 'p 를 자르지 않으면 끝난 뒤에도 back · elastic 이 계속 움직인다', fix: 'p 를 0 ~ 1 로 자르고, 끝나면 정확히 끝 값에 놓는다.' },
      { title: 'back · elastic 을 크기에 쓰면 순간 음수가 되어 뒤집힌다', fix: '크기용은 범위를 잘라 쓴다 (견본: −0.3 ~ 1.4 로 자른 뒤 0.6 + 0.6 × 값).' },
      { title: '목표가 움직이는 중에 트윈을 새로 시작하면 덜컥 끊긴다', fix: '따라가기는 스프링(i293)으로 — 지금 속도를 이어받는다.' },
    ],
    prev: ['i291'],
    next: ['i293'],
    refs: [{ name: 'easings.net — 이징 함수 모음', url: 'https://easings.net/' }],
  },

  i293: {
    id: 'i293',
    summary: '목표를 따라가는 스프링에 감쇠비 ζ 를 달리 주어, 덜 감쇠(출렁) · 임계 감쇠(가장 빨리 딱) · 과감쇠(느릿느릿)를 나란히 비교한다.',
    terms: [
      { en: 'Damped harmonic oscillator', ko: '감쇠 진동 — 스프링 + 버티는 힘' },
      { en: 'Damping ratio ζ (critical damping ζ = 1)', ko: '감쇠비 — 1 이면 넘치지 않고 가장 빨리 멈춤' },
      { en: 'Angular frequency ω = 2πf', ko: '단단함을 진동수로' },
      { en: 'Spring follow (smooth damp)', ko: '목표가 바뀌어도 속도를 이어받아 따라가기' },
    ],
    goal: '{target}이(가) 스프링으로 목표를 따라가게 해 줘 — 진동수 f 와 감쇠비 ζ 로, 덜 감쇠 · 임계 · 과감쇠를 고를 수 있게. 분위기는 {style}.',
    targets: ['단추 · 카드 움직임', '따라가는 카메라', '끌어 놓는 조각'],
    styles: ['통통 튀는 귀여움', '부드럽고 차분한', '시간 그래프가 있는 설명 화면'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Mathf.SmoothDamp · Vector3.SmoothDamp 가 임계 감쇠 꼴 따라가기다. 출렁임이 필요하면 같은 식을 직접.',
      godot: 'Godot 은 같은 식을 _physics_process 에서 직접 쓴다 (Tween 은 목표가 바뀌면 끊긴다).',
    },
    principle: [
      'ω = 2π × 진동수. 가속 = ω² × (목표 − 위치) − 2ζω × 속도. 앞은 끌어당김, 뒤는 버팀.',
      'ζ < 1 덜 감쇠 — 목표를 넘었다 돌아오며 출렁인다. ζ = 1 임계 감쇠 — 넘치지 않고 가장 빨리 멈춘다. ζ > 1 과감쇠 — 넘치지 않지만 느리다.',
      '목표가 갑자기 바뀌어도 지금 속도를 그대로 이어받으므로 끊김 없이 방향을 튼다 (이징 트윈과의 차이).',
      '1/240초 고정 간격으로 「속도 먼저, 위치 나중」 — 단단해도 안정적이다.',
    ],
    when: ['목표가 계속 바뀌는 따라가기 (마우스 · 카메라 · 끌기)', 'UI 가 「살아 있는」 느낌으로 통 멈추게 할 때'],
    avoid: ['정확히 몇 초에 끝나야 하는 연출 — 스프링은 끝나는 시간이 정해지지 않는다. 대신 이징(i292)', '아주 단단한 스프링을 큰 dt 로 — 폭주한다. 고정 간격을 쓴다'],
    cost: 'light',
    costNote: '값 하나에 곱셈 몇 번. 1/240초 간격이라 프레임마다 4번쯤 — 비용 없음.',
    level: 1,
    must: [
      '조절 값은 「진동수(Hz) · 감쇠비 ζ」 두 개로 (k · c 를 직접 주면 감이 안 온다)',
      '고정 간격(1/240초)으로 적분 — 화면 dt 를 그대로 쓰면 기기마다 출렁임이 다르다',
      '목표가 바뀔 때 위치 · 속도를 0 으로 되돌리지 않기 (이어받는 것이 핵심)',
      '「멈춤」 판정은 거리 · 속도 둘 다 작을 때 (견본: 1.2px · 8px/초)',
    ],
    done: [
      '세 줄이 같은 목표를 따라가는데 덜 감쇠는 출렁, 임계는 가장 빨리 딱, 과감쇠는 천천히 도착한다',
      '각 줄 아래에 「○초에 멈춤」이 나오고 임계 감쇠가 가장 짧다',
      '첫 줄 ζ 를 0.02 → 0.95 로 바꾸면 출렁임이 줄어 임계에 가까워진다',
      '움직이는 중에 목표를 옮겨도 덜컥 끊기지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '진동수 · 감쇠비 스프링 따라가기',
      from: 'demos/demos2dMove.ts i293 step 안쪽 · fixed() 를 정리',
      body: `/** 고정 간격 — 프레임이 들쭉날쭉해도 h 초씩 똑같이 */
function fixed(h: number) {
  let acc = 0;
  return (dt: number, f: (h: number) => void) => {
    acc += Math.min(Math.max(dt, 0), 0.1);
    let n = 0;
    while (acc >= h && n < 40) { f(h); acc -= h; n++; }
    if (n >= 40) acc = 0;
  };
}
const s = { x: 22, v: 0 };
let target = 150, freq = 1.6, zeta = 1;          // ζ = 1 임계 · < 1 출렁 · > 1 느릿
const step = fixed(1 / 240);

function update(dt: number) {
  step(dt, (H) => {
    const om = 2 * Math.PI * freq;
    const a = om * om * (target - s.x) - 2 * zeta * om * s.v; // 끌어당김 − 버팀
    s.v += a * H;                                 // 속도 먼저
    s.x += s.v * H;                               // 위치 나중
  });
}
const settled = () => Math.abs(target - s.x) < 1.2 && Math.abs(s.v) < 8;`,
    },
    pitfalls: [
      { title: 'k · c 를 따로 주면 조절할 때마다 출렁임이 엉뚱하게 바뀐다', fix: '진동수 f 와 감쇠비 ζ 로 바꿔 쓴다 — k = ω², c = 2ζω.' },
      { title: '목표가 바뀔 때 속도를 0 으로 만들면 덜컥 멈칫한다', fix: '위치 · 속도는 그대로 두고 목표만 바꾼다.' },
      { title: '탭이 숨었다 돌아오면 큰 dt 로 한꺼번에 튄다', fix: 'dt 를 0.1초로 자르고, 한 프레임 최대 40걸음 넘으면 남은 시간을 버린다 (견본 fixed).' },
    ],
    prev: ['i292'],
    next: ['i287'],
  },

  i305: {
    id: 'i305',
    summary: '평면 지도를 화면 아래 줄마다 「거리 = 높이 × 초점 ÷ 줄 번호」로 늘려 찍어, 옛 레이싱 게임처럼 깊이 있는 원근 바닥을 2D 로 만든다.',
    terms: [
      { en: 'Mode 7 (perspective floor)', ko: '모드 7 — 평면 지도를 원근으로 눕히기' },
      { en: 'Scanline floor casting', ko: '줄마다 거리 하나 — 그 줄을 지도에서 쓸어 읽기' },
      { en: 'ImageData · Uint32Array pixel buffer', ko: '픽셀을 32비트 정수로 직접 쓰기' },
      { en: 'Distance fog', ko: '멀수록 하늘색으로 섞기' },
    ],
    goal: '{target}에 모드 7 원근 바닥을 만들어 줘 — 평면 지도를 줄마다 거리 계산으로 늘려 찍고, 멀수록 안개. 분위기는 {style}.',
    targets: ['카트 경주 지도', '비행 · 새 날기 지도', '월드 맵 위를 달리는 장면'],
    styles: ['옛 도트 게임', '밝은 풀밭 동화', '노을빛 사막'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 라면 지도를 바닥 평면 텍스처로 깔고 원근 카메라를 낮게 두면 같은 그림이다 (NearestFilter 로 도트 느낌).',
      unity: 'Unity 도 지도 텍스처를 바닥 Quad 에 깔고 Point 필터 + 원근 카메라로 같은 효과.',
      godot: 'Godot 은 Mode 7 셰이더(canvas_item) 예제가 많다 — 화면 y 로 거리를 구해 UV 를 만든다.',
    },
    principle: [
      '수평선 아래 줄 번호 sy (1, 2, 3 …) 마다 그 줄이 비추는 바닥까지의 거리 z = 카메라 높이 × 초점 ÷ sy. 가까운 줄일수록 sy 가 커서 z 가 작다.',
      '그 줄 왼쪽 끝 = 카메라 앞 z 지점에서 옆으로 반 화면만큼. 한 픽셀 옆으로 갈 때 지도 위로 z ÷ 초점 만큼 옆 방향으로 이동한다.',
      '줄마다 두 번 곱셈으로 시작점 · 걸음을 구하고, 픽셀마다 더하기만 하며 지도 색을 읽는다.',
      '작은 화면(폭 160)에서 계산해 크게 늘려 그리면 도트 느낌도 살고 빠르다. 거리 z 로 하늘색 안개를 섞는다.',
    ],
    when: ['위에서 본 평면 지도를 달리는 느낌으로 바꾸고 싶을 때', '3D 없이 가벼운 원근 바닥이 필요할 때'],
    avoid: ['언덕 · 벽 같은 높이가 있는 땅 — 모드 7 은 평평한 바닥만. 대신 광선 투사(i306)나 의사 3D 도로(i307)', '이미 three.js 장면이 있을 때 — 바닥 평면 + 카메라가 더 간단하다'],
    cost: 'light',
    costNote: '160 × 약 64줄 = 1만 픽셀을 프레임마다 직접 씀. 큰 화면 해상도로 하면 수십 배 — 꼭 작은 버퍼에서.',
    level: 2,
    must: [
      '작은 버퍼(폭 160)에서 계산하고 imageSmoothingEnabled = false 로 늘려 그리기',
      '픽셀은 Uint32Array 로 한 번에 쓰고 putImageData 한 번 (픽셀마다 fillRect 금지)',
      '줄마다 시작점 · 한 칸 걸음을 미리 구해 픽셀 안에서는 더하기만',
      '지도 밖은 바둑판 같은 반복 무늬로 채우기 (검게 비지 않게)',
    ],
    done: [
      '화면 아래쪽 바닥이 원근으로 누워 멀어질수록 촘촘해지고, 수평선 근처는 하늘색으로 흐려진다',
      '카메라 높이 슬라이더를 올리면 하늘에서 내려다보듯 지도가 넓게 보인다',
      '「평면 지도 보기」를 켜면 오른쪽 위에 원래 지도와 지금 보는 시야 부채꼴이 보인다',
      '폰에서도 끊김 없이 돈다',
    ],
    code: {
      lang: 'ts',
      title: '줄마다 거리를 구해 지도를 쓸어 읽기',
      from: 'demos/demos2dLook.ts mkI305() draw 의 바닥 부분을 정리',
      body: `const TS = 256;                           // 지도 크기 (tex = Uint32Array(TS*TS))
const LW = 160, focal = 70;              // 작은 화면 폭 · 초점 거리
function drawFloor(buf: Uint32Array, rows: number, tex: Uint32Array,
                   cx: number, cy: number, fx: number, fy: number, camH: number) {
  const rx = -fy, ry = fx;                // 옆 방향 (앞 방향을 90° 돌림)
  for (let row = 0; row < rows; row++) {
    const sy = row + 1;                   // 수평선에서 몇 줄 아래
    const z = (camH * focal) / sy;        // 이 줄이 비추는 거리
    const step = z / focal;               // 한 픽셀 = 지도 몇 칸
    let wx = cx + fx * z + rx * (-LW / 2) * step;
    let wy = cy + fy * z + ry * (-LW / 2) * step;
    const dx = rx * step, dy = ry * step;
    for (let x = 0; x < LW; x++) {
      const ix = Math.floor(wx), iy = Math.floor(wy);
      buf[row * LW + x] = ix >= 0 && iy >= 0 && ix < TS && iy < TS
        ? tex[iy * TS + ix]
        : ((ix >> 4) + (iy >> 4)) & 1 ? 0xff5ac86e : 0xff4eb65f; // 지도 밖 = 바둑판 풀
      wx += dx; wy += dy;                 // 픽셀 안은 더하기만
    }
  }
}
// 그린 뒤: lx.putImageData(im, 0, horizon + 1);
// g.imageSmoothingEnabled = false; g.drawImage(lowCanvas, 0, 0, w, h);`,
    },
    pitfalls: [
      { title: '큰 화면 해상도로 픽셀을 계산하면 폰에서 멈춘다', fix: '폭 160 작은 버퍼에서 계산해 늘려 그린다. 높이는 화면 비율에 맞춰 60 ~ 150 으로.' },
      { title: '수평선 바로 아래 줄은 거리가 무한대처럼 커져 지글거린다', fix: '그 근처는 안개로 하늘색에 녹인다 (견본: z 40 ~ 260 사이에서 섞음).' },
      { title: 'Uint32Array 색을 RGBA 순서로 넣으면 색이 뒤집힌다', fix: '보통 컴퓨터는 리틀 엔디안이라 0xAABBGGRR 순서. pack(r, g, b) 같은 함수를 한 곳에 둔다.' },
    ],
    next: ['i306', 'i307'],
    refs: [{ name: 'Wikipedia — Mode 7', url: 'https://en.wikipedia.org/wiki/Mode_7' }],
  },

  i306: {
    id: 'i306',
    summary: '화면 세로줄마다 광선 하나를 칸 지도에 쏘아 벽까지의 거리로 벽 높이 · 어둡기 · 무늬 줄을 정해, 옛 1인칭 미로를 2D 계산만으로 그린다.',
    terms: [
      { en: 'Raycasting (Wolfenstein-style)', ko: '광선 투사 — 세로줄마다 광선 하나' },
      { en: 'DDA grid traversal', ko: '칸 경계를 하나씩 건너며 벽 찾기' },
      { en: 'Fisheye correction (perpendicular distance)', ko: '어안 보정 — 곧은 거리 대신 수직 거리' },
      { en: 'Floor casting', ko: '바닥도 줄마다 거리 계산' },
    ],
    goal: '{target}을(를) 광선 투사 1인칭 화면으로 만들어 줘 — 세로줄마다 광선 하나, 벽까지 거리로 높이 · 어둡기, 위에 미니 지도. 분위기는 {style}.',
    targets: ['1인칭 미로', '거리와 각도 설명', '방 탈출 · 던전 탐험'],
    styles: ['따뜻한 벽돌 · 나무 미로', '옛 도트 게임', '어두운 던전'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 라면 진짜 3D 로 칸마다 큐브를 놓는 편이 쉽다. 옛 방식 그대로는 Texture2D 에 같은 계산.',
      godot: 'Godot 은 GridMap 으로 3D 칸 미로를 만들거나, 같은 DDA 를 Image 에 그린다.',
    },
    principle: [
      '화면 x 를 −1 ~ 1 로 바꾸고 광선 방향 = 앞 방향 + 옆(평면) 벡터 × x. 옆 벡터 길이 = tan(시야각 ÷ 2).',
      'DDA: 다음 세로 경계까지 거리(sdx)와 다음 가로 경계까지 거리(sdy) 중 짧은 쪽으로 한 칸씩 건너며, 벽 칸을 만나면 멈춘다.',
      '수직 거리 perp = 마지막으로 늘린 쪽 거리 − 한 칸 거리. 벽 높이 = 화면 높이 ÷ perp. 곧은 거리를 쓰면 벽이 둥글게 휜다(어안).',
      '세로 경계에 닿았나 가로 경계에 닿았나(side)로 한쪽 면을 0.72배 어둡게 — 그것만으로 입체감이 생긴다. 벽 위 어디에 닿았나로 무늬 열(tx)을 고른다.',
    ],
    when: ['가벼운 1인칭 미로 · 탐험', '「거리가 두 배면 크기가 절반」 원근을 보여 줄 때'],
    avoid: ['위아래로 보기 · 층이 있는 맵 — 광선 투사는 평평한 한 층만. 대신 three.js 진짜 3D', '비스듬한 벽 · 둥근 방 — 칸 지도로는 안 된다'],
    cost: 'light',
    costNote: '광선 160개 × 최대 64칸 + 바닥 픽셀. 작은 버퍼(160 폭)에서 계산하면 폰도 가볍다.',
    level: 2,
    must: [
      '벽 높이는 수직 거리로 (어안 보정) — 곧은 거리 쓰면 벽이 휜다',
      'DDA 반복에 상한(64칸) — 지도 밖으로 나가도 멈추게, 지도 밖은 벽으로',
      '한쪽 면(side 1)을 더 어둡게, 거리로 안개',
      '작은 버퍼(폭 160)에서 계산하고 imageSmoothingEnabled = false 로 늘리기',
      '미니 지도에 광선이 닿은 점들을 부채꼴로 함께',
    ],
    done: [
      '복도를 걸어가는 1인칭 화면에서 가까운 벽은 크고 먼 벽은 작고 어둡다',
      '「어안 보정」을 끄면 곧은 벽이 둥글게 휘어 보이고, 켜면 반듯해진다',
      '시야각 40° ~ 110° 를 바꾸면 망원 ↔ 넓은 렌즈처럼 바뀐다',
      '미니 지도에 지금 자리와 광선 부채꼴이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '세로줄 하나의 DDA 광선',
      from: 'demos/demos2dLook.ts mkI306() draw 의 벽 광선 부분을 정리',
      body: `/** 한 세로줄 x 의 벽까지 수직 거리 · 닿은 면 · 칸 번호 */
function castColumn(x: number, LW: number, MAP: number[][], px: number, py: number,
                    dirX: number, dirY: number, plX: number, plY: number) {
  const camX = (2 * x) / LW - 1;               // -1 ~ 1
  const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy); // 한 칸 건너는 거리
  const stx = rdx < 0 ? -1 : 1, sty = rdy < 0 ? -1 : 1;
  let sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
  let sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
  let side = 0, cell = 0;
  for (let k = 0; k < 64; k++) {               // 상한 — 지도 밖에서 멈추게
    if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; }
    else { sdy += ddy; my += sty; side = 1; }
    cell = MAP[my]?.[mx] ?? 1;                  // 지도 밖 = 벽
    if (cell) break;
  }
  const perp = side === 0 ? sdx - ddx : sdy - ddy; // 수직 거리 = 어안 보정
  let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
  wallX -= Math.floor(wallX);                   // 벽 위 0 ~ 1 → 무늬 열
  return { perp, side, cell, wallX };
}
// 시야각 fov: const pl = Math.tan(fov / 2 * Math.PI / 180); plX = -dirY * pl; plY = dirX * pl;
// 벽 높이 = LH / Math.max(0.05, perp), 면 어둡기 = side ? 0.72 : 1`,
    },
    pitfalls: [
      { title: '광선 길이를 그대로 쓰면 곧은 벽이 둥글게 휜다', fix: '견본처럼 수직 거리(perp)를 쓴다. 「어안 보정」 끔/켬으로 차이를 보여 줄 수 있다.' },
      { title: '광선 방향이 정확히 축과 같으면 1/0 이 된다', fix: 'JS 에선 Infinity 가 되어 그 축으로는 건너지 않을 뿐 동작한다. 다른 언어에선 아주 큰 수로 바꾼다.' },
      { title: '벽 무늬가 한쪽 면에서 거울처럼 뒤집힌다', fix: '광선이 +x 쪽 면 · −y 쪽 면에 닿으면 tx = T − 1 − tx 로 뒤집는다.' },
      { title: '벽에 바짝 붙으면 높이가 무한대가 된다', fix: '거리 최소값(0.05)을 둔다.' },
    ],
    prev: ['i305'],
    next: ['i307'],
    refs: [{ name: 'Lode Vandevenne — Raycasting tutorial', url: 'https://lodev.org/cgtutor/raycasting.html' }],
  },

  i307: {
    id: 'i307',
    summary: '도로를 짧은 조각 수백 개로 나누고 조각마다 커브를 누적 · 높이를 투영해, 굽이치고 오르내리는 옛 아케이드식 도로를 2D 사다리꼴로 그린다.',
    terms: [
      { en: 'Pseudo-3D road (segment projection)', ko: '의사 3D 도로 — 조각마다 투영한 사다리꼴' },
      { en: 'Curve accumulation (dx += curve)', ko: '커브를 더하고 또 더해 굽이 만들기' },
      { en: 'Perspective projection scale = depth / z', ko: '멀수록 작아지는 크기 비율' },
      { en: 'Painter\'s algorithm (far to near sprites)', ko: '먼 나무부터 그리기' },
    ],
    goal: '{target}에 의사 3D 도로를 만들어 줘 — 조각마다 커브를 누적하고 높이를 투영해 굽이 · 언덕 · 줄무늬 연석 · 나무 스프라이트. 분위기는 {style}.',
    targets: ['달리기 · 경주 게임', '자전거 · 달리기 미니게임', '배경 연출 (끝없는 길)'],
    styles: ['맑은 낮 아케이드', '노을빛 해변 도로', '밤 네온 도로'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 라면 진짜 3D 도로 메시가 쉽다. 옛 방식 그대로는 같은 계산으로 Mesh 사다리꼴을 매 프레임 만든다.',
      godot: 'Godot 은 같은 계산을 _draw 의 draw_polygon 으로 그린다.',
    },
    principle: [
      '도로를 길이 200 짜리 조각으로 나누고, 조각마다 커브 값과 높이 y 를 둔다. 커브는 구간 앞뒤 1/4 에서 부드럽게 들어가고 나온다.',
      '가까운 조각부터 140개를 보며 x += dx; dx += 커브. 커브를 「누적의 누적」으로 쌓으니 도로가 부드럽게 휜다.',
      '크기 비율 s = 깊이 ÷ 거리 z. 화면 x = 가운데 + s × x, 화면 y = 가운데 − s × (높이 − 카메라 높이), 도로 폭 = s × 2000.',
      '앞 조각보다 위로 올라온 조각만 그리고(maxy), 가려지는 조각은 건너뛴다 — 언덕 너머가 저절로 숨는다. 3조각마다 연석 빨강 · 흰 줄을 바꾼다.',
    ],
    when: ['끝없이 달리는 경주 · 달리기 게임', '가벼운 「속도감」 배경'],
    avoid: ['교차로 · 갈림길 · 자유롭게 도는 길 — 한 줄 도로만 된다. 대신 three.js 3D 도로', '위에서 보는 지도 — 모드 7(i305)'],
    cost: 'light',
    costNote: '사다리꼴 140개 × 3겹(연석 · 길 · 차선) + 나무 스프라이트. 폰에서도 가볍다.',
    level: 2,
    must: [
      '커브는 x 를 바로 바꾸지 말고 dx 에 더하기 (누적의 누적 — 그래야 매끈하다)',
      '가까운 조각부터 투영하고, 지금까지 가장 위의 y(maxy)보다 아래인 조각은 그리지 않기 (언덕 가림)',
      '나무 · 표지는 도로를 다 그린 뒤 먼 것부터, 그 조각의 clip 높이로 잘라 그리기',
      '도로 끝을 처음 높이로 이어 끝없이 돌게 (마지막 높이를 비율로 빼기)',
      '멀수록 연한 하늘색으로 섞기',
    ],
    done: [
      '도로가 왼쪽 · 오른쪽으로 굽이치고, 언덕을 넘을 때 너머 도로가 가려졌다 드러난다',
      '빨강 · 흰 연석과 차선 줄무늬가 빠르게 다가와 속도감이 난다',
      '커브 세기 0 이면 곧은 길, 2 면 크게 휜다. 「언덕」을 끄면 평지',
      '나무가 도로 옆에서 멀리 작게 → 가까이 크게 다가온다',
    ],
    code: {
      lang: 'ts',
      title: '조각마다 커브 누적 + 투영',
      from: 'demos/demos2dLook.ts mkI307() draw 의 투영 부분을 정리',
      body: `interface Seg { curve: number; y: number; i: number }
const SEGL = 200, ROADW = 2000, CAMH = 1000, DRAW = 140;
const DEPTH = 1 / Math.tan((50 * Math.PI) / 180);

function project(segs: Seg[], pos: number, camY: number, w: number, h: number, curveK = 1) {
  const N = segs.length, total = N * SEGL;
  const baseI = Math.floor(pos / SEGL) % N;
  const basePct = (pos % SEGL) / SEGL;
  let x = 0, dx = -(segs[baseI].curve * curveK * basePct);
  let maxy = h;
  const quads: { x1: number; y1: number; w1: number; x2: number; y2: number; w2: number; seg: Seg }[] = [];
  for (let n = 0; n < DRAW; n++) {
    const seg = segs[(baseI + n) % N], nxt = segs[(baseI + n + 1) % N];
    const z1 = seg.i * SEGL + (seg.i < baseI ? total : 0) - pos, z2 = z1 + SEGL;
    const s1 = DEPTH / Math.max(1e-3, z1), s2 = DEPTH / Math.max(1e-3, z2);
    const q = {
      x1: w / 2 + s1 * x * (w / 2),        y1: h / 2 - s1 * (seg.y - camY) * (h / 2), w1: s1 * ROADW * (w / 2),
      x2: w / 2 + s2 * (x + dx) * (w / 2), y2: h / 2 - s2 * (nxt.y - camY) * (h / 2), w2: s2 * ROADW * (w / 2),
      seg,
    };
    x += dx;
    dx += seg.curve * curveK;              // 커브 누적의 누적
    if (z1 <= DEPTH || q.y2 >= q.y1 || q.y2 >= maxy) continue; // 뒤 · 언덕에 가림
    quads.push(q);                          // 이 사다리꼴을 연석(1.15배) · 길 순서로 칠한다
    maxy = q.y2;
  }
  return quads;
}`,
    },
    pitfalls: [
      { title: '커브를 x 에 바로 더하면 도로가 꺾인 선처럼 각진다', fix: 'dx 에 커브를 더하고 x 에 dx 를 더한다 — 두 번 누적해야 부드럽다.' },
      { title: '언덕 너머 도로가 앞 도로 위에 겹쳐 그려진다', fix: '가까운 조각부터 그리며 maxy 보다 아래인 조각은 건너뛴다.' },
      { title: '나무가 언덕 뒤인데 앞에 보인다', fix: '나무는 도로를 다 그린 뒤 먼 것부터, 그 조각을 그릴 때의 clip 높이로 잘라 그린다.' },
      { title: '한 바퀴 돌 때 높이가 툭 끊긴다', fix: '견본은 마지막 높이를 조각 순서 비율로 빼서 끝 = 처음 높이로 맞춘다.' },
    ],
    prev: ['i305'],
    next: ['i309'],
    refs: [{ name: 'Lou\'s Pseudo 3d Page', url: 'http://www.extentofthejam.com/pseudo/' }],
  },

  i308: {
    id: 'i308',
    summary: '물체를 가로로 썬 단면 도트 그림 여러 장을 아래부터 한 칸씩 위로 쌓아 함께 돌려, 3D 모델 없이 차 · 집 · 나무가 입체처럼 돌아 보이게 한다.',
    terms: [
      { en: 'Sprite stacking', ko: '스프라이트 쌓기 — 단면 그림을 층층이' },
      { en: 'Voxel slices', ko: '높이마다 한 장인 복셀 단면' },
      { en: 'Canvas transform (translate · scale · rotate)', ko: '층마다 위로 옮기고 납작하게 눌러 돌리기' },
      { en: 'Nearest-neighbor scaling', ko: '도트를 흐리지 않고 키우기' },
    ],
    goal: '{target}을(를) 스프라이트 쌓기로 그려 줘 — 가로 단면 도트 그림을 층마다 위로 쌓고 함께 돌려 입체처럼. 분위기는 {style}.',
    targets: ['도트 차 · 탈것', '작은 집 · 건물', '나무 · 소품'],
    styles: ['밝은 도트 장난감', '옛 탑뷰 게임', '아기자기한 마을'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 SpriteRenderer 여러 장을 y 로 조금씩 올려 같은 회전을 주면 된다 (sortingOrder 를 층 순서로).',
      godot: 'Godot 은 Sprite2D 여러 장(또는 hframes 시트)을 층마다 offset 으로 올리고 같은 rotation.',
    },
    principle: [
      '물체를 높이 1칸마다 가로로 썬 단면을 한 장씩 그린다 (차 10장 · 집 15장). 아래 층일수록 0.72배까지 어둡게.',
      '아래 층부터 차례로: 그 층 높이만큼 위로 옮기고 → 세로를 0.62배로 눌러 비스듬히 보이게 → 같은 각도로 돌려 → 그린다.',
      '층 사이가 틈 없이 메워지게 반 칸 위에 한 번 더 찍는다 (펼쳐 보기일 땐 한 번만).',
      '모든 층이 같은 각도로 돌기만 해도 눈은 하나의 입체로 본다 — 진짜 3D 계산은 없다.',
    ],
    when: ['위에서 비스듬히 보는 도트 게임의 탈것 · 소품이 돌아야 할 때', '3D 없이 「장난감 같은 입체」 느낌'],
    avoid: ['옆에서 보는 각도 — 층이 납작한 판으로 드러난다. 대신 three.js 복셀 모델', '층 수가 수십 장 넘는 큰 물체가 많을 때 — drawImage 수가 커진다'],
    cost: 'light',
    costNote: '물체 하나 = 층 수 × 2번 drawImage (차 20번). 수십 개까지는 폰도 괜찮다.',
    level: 1,
    must: [
      '단면은 처음 한 번 화면 밖 캔버스로 구워 두기 (매 프레임 픽셀 다시 쓰지 않기)',
      '그릴 때 imageSmoothingEnabled = false — 도트가 흐려지지 않게',
      '층마다 translate(위로) → scale(1, 0.62) → rotate(각) 순서 — 순서가 바뀌면 찌그러진다',
      '아래 층을 조금 어둡게 해 입체감',
      '층 펼쳐 보기 토글로 원리를 보여 주기',
    ],
    done: [
      '차 · 집 · 나무가 제자리에서 돌며 입체처럼 보인다',
      '「층 펼쳐 보기」를 켜면 층 사이가 벌어져 단면 그림이 쌓인 것이 보인다',
      '아래 띠에 층마다 단면 그림이 나란히 보인다',
      '회전 속도 슬라이더로 빠르기가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '단면 그림을 층층이 쌓아 돌리기',
      from: 'demos/demos2dLook.ts mkI308() drawStack() 을 정리',
      body: `/** sl = 아래층부터 단면 캔버스 목록, s = 확대, a = 회전, gap = 층 간격(1 = 붙임) */
function drawStack(g: CanvasRenderingContext2D, sl: HTMLCanvasElement[],
                   x: number, y: number, s: number, a: number, gap = 1) {
  g.imageSmoothingEnabled = false;            // 도트 그대로
  for (let l = 0; l < sl.length; l++) {
    const c = sl[l];
    for (let k = 0; k < 2; k++) {             // 반 칸 위에 한 번 더 — 층 틈 메우기
      g.save();
      g.translate(x, y - (l + k * 0.5) * s * gap); // 층 높이만큼 위로
      g.scale(1, 0.62);                       // 비스듬히 내려다보기
      g.rotate(a);                            // 모든 층 같은 각
      g.drawImage(c, (-c.width * s) / 2, (-c.height * s) / 2, c.width * s, c.height * s);
      g.restore();
      if (gap > 1.6) break;                   // 펼쳐 볼 땐 한 번만
    }
  }
  g.imageSmoothingEnabled = true;
}
// 단면 만들기: 층 l 마다 캔버스 하나, fn(x, y, l) 이 색(없으면 null)을 돌려준다.
// 아래층 어둡게: dk = 0.72 + 0.28 * (l / (L - 1)) 를 색에 곱한다.`,
    },
    pitfalls: [
      { title: 'scale 을 rotate 뒤에 하면 돌 때 물체가 늘었다 줄었다 한다', fix: 'translate → scale(1, 0.62) → rotate 순서. 누르는 것은 화면 축, 도는 것은 물체 축.' },
      { title: '확대하면 층 사이에 틈이 보인다', fix: '견본은 반 칸 위에 한 번 더 찍어 메운다 (층 간격이 넓은 펼쳐 보기에선 생략).' },
      { title: '매끈하게 확대되어 도트가 뭉갠다', fix: 'drawImage 전에 imageSmoothingEnabled = false.' },
    ],
    prev: ['i304'],
    next: ['i310'],
  },

  i309: {
    id: 'i309',
    summary: '먼 산 · 언덕 · 마을 · 풀 · 앞 잎 다섯 층을 깊이만큼 다른 빠르기(0.12 ~ 1.7배)로 흘리고, 먼 층엔 안개를 덮어 납작한 그림을 깊이 있는 무대로 만든다.',
    terms: [
      { en: 'Parallax scrolling (2.5D layers)', ko: '시차 스크롤 — 층마다 다른 빠르기' },
      { en: 'Atmospheric perspective', ko: '먼 것은 옅고 하늘색으로' },
      { en: 'Seamless tiling layer', ko: '이어 붙여도 이음새 없는 반복 층' },
      { en: 'source-atop tint', ko: '그린 곳에만 색 덮기' },
    ],
    goal: '{target}을(를) 2.5D 시차 무대로 만들어 줘 — 먼 산부터 앞 잎까지 층을 깊이만큼 다른 빠르기로, 먼 층은 안개. 분위기는 {style}.',
    targets: ['이야기 장면 배경', '메뉴 · 시작 화면 배경', '옆으로 달리는 게임 배경'],
    styles: ['분홍빛 노을 그림책', '맑은 낮 시골', '푸른 밤'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      web: 'CSS 만으로는 층마다 background-position 을 다른 빠르기로 옮기거나 perspective + translateZ 로 같은 효과.',
      unity: 'Unity 는 층마다 카메라 이동 × 비율로 위치를 옮기는 스크립트, 또는 원근 카메라에 층을 z 로 떨어뜨려 놓는다.',
      godot: 'Godot 은 ParallaxBackground + ParallaxLayer 의 motion_scale 이 바로 이 기능 (4.3 부터는 Parallax2D).',
    },
    principle: [
      '카메라가 cam 만큼 움직이면 층은 cam × k 만큼 흐른다. k 가 작으면 멀리, 크면 가까이 — 먼 산 0.12 · 언덕 0.3 · 마을 0.6 · 풀 1 · 앞 잎 1.7.',
      '「깊이 차이」 d 로 k 를 1 + (k − 1) × d 로 바꾸면 0 일 때 모두 같은 빠르기(납작), 2 일 때 깊이가 과장된다.',
      '층 그림은 화면 폭 W 로 한 장 그리되 사인 주기를 W 에 맞춰 이음새가 없게 하고, −off 와 W − off 두 번 찍어 끝없이 이어 간다.',
      '먼 층일수록 source-atop 으로 하늘빛을 덮어 옅게 한다. 캐릭터는 가운데 층과 함께 움직인다.',
    ],
    when: ['정지 그림 배경에 깊이와 움직임을 주고 싶을 때', '옆으로 걷는 이야기 장면 · 메뉴 배경'],
    avoid: ['카메라가 위아래 · 앞뒤로 크게 움직이는 장면 — 층이 판으로 드러난다. 대신 three.js 진짜 3D', '층이 10겹 넘게 많을 때 — 큰 그림 drawImage 가 쌓여 폰에서 무겁다'],
    cost: 'light',
    costNote: '층 다섯 장 × 2번 drawImage. 층 그림은 화면 크기가 바뀔 때만 다시 굽는다.',
    level: 1,
    must: [
      '층 그림은 화면 크기가 바뀔 때만 다시 굽기 (매 프레임 그리기 금지)',
      '층 그림 무늬는 폭 W 에 주기를 맞춰 이음새 없게 + 두 번 찍어 이어 붙이기',
      '오프셋은 (cam × k) mod W 를 양수로 맞춰서 (음수 나머지 주의)',
      '먼 층은 옅고 푸르게 — 대비 차이가 깊이감의 반',
      '시차 끔/켬 비교 토글',
    ],
    done: [
      '카메라가 옆으로 흐를 때 먼 산은 느리게, 풀 · 앞 잎은 빠르게 지나가 깊이가 느껴진다',
      '「시차」를 끄면 한 장 그림처럼 납작해진다',
      '깊이 차이 슬라이더로 0(납작) ~ 2(과장)를 고를 수 있다',
      '층 이음새가 보이지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '층마다 다른 빠르기로 이어 그리기',
      from: 'demos/demos2dLook.ts mkI309() draw 의 층 그리기를 정리',
      body: `interface Layer { img: HTMLCanvasElement; k: number } // k = 카메라 대비 빠르기
// 먼 산 0.12 · 언덕 0.3 · 마을 0.6 · 풀 1 · 앞 잎 1.7 — 그림은 화면 크기 바뀔 때만 다시 굽는다
function drawLayers(g: CanvasRenderingContext2D, lays: Layer[], cam: number,
                    W: number, H: number, depth = 1, parallax = true) {
  for (const L of lays) {
    const k = parallax ? 1 + (L.k - 1) * depth : 1;  // depth 0 = 납작, 2 = 과장
    const off = ((((cam * k) % W) + W) % W) | 0;      // 음수 나머지도 양수로
    g.drawImage(L.img, -off, 0, W, H);                // 두 번 찍어 끝없이
    g.drawImage(L.img, W - off, 0, W, H);
  }
}
// 이음새 없는 언덕 선: 사인 주기를 폭 W 에 맞춘다
const per = (x: number, W: number, n: number, ph: number) => Math.sin((x / W) * Math.PI * 2 * n + ph);
// 먼 층 안개: 다 그린 뒤 g.globalCompositeOperation = 'source-atop' 으로 하늘빛 그라데이션을 덮는다
// 카메라: const cam = t * 0.09 * w + Math.sin(t * 0.6) * w * 0.05;`,
    },
    pitfalls: [
      { title: '층 그림을 매 프레임 새로 그리면 폰에서 느려진다', fix: '화면 크기(W×H)가 바뀔 때만 굽고, 매 프레임은 drawImage 두 번씩만.' },
      { title: '반복 경계에 이음새 선이 보인다', fix: '언덕 · 산 사인 주기를 폭 W 의 정수배로 맞추고, 소품은 x − W · x + W 에도 함께 그린다.' },
      { title: '앞 층 흐림 · 비네트로 깊이를 얼버무리면 이 사이트에선 거절된다', fix: '견본의 앞 잎 흐림은 고를 수 있는 표현일 뿐. 실제 게임은 빠르기 차이와 먼 층 옅게 하기로 깊이를 낸다 (사용자 결정).', seen: true },
    ],
    prev: ['i307'],
    next: ['i310'],
  },

  i310: {
    id: 'i310',
    summary: '등각 판에서 여러 칸을 차지하는 물체를 칸 번호 합으로 줄 세우면 생기는 겹침 오류를, 「완전히 뒤에 있나」 관계의 위상 정렬로 바로잡는다.',
    terms: [
      { en: 'Isometric depth sorting', ko: '등각 깊이 정렬 — 그리는 앞뒤 순서' },
      { en: 'Topological sort (DFS)', ko: '위상 정렬 — 「뒤에 있는 것 먼저」 관계로 줄 세우기' },
      { en: 'Painter\'s algorithm', ko: '뒤에서 앞으로 덮어 그리기' },
      { en: 'Axis-aligned footprint overlap', ko: '바닥 차지 칸이 겹치는지 축마다 보기' },
    ],
    goal: '{target}의 등각 그리기 순서를 위상 정렬로 바로잡아 줘 — 여러 칸 물체도 겹침이 틀리지 않게, 칸 번호 합 정렬과 비교. 분위기는 {style}.',
    targets: ['쌓기 · 도시 판', '등각 마을 꾸미기', '움직이는 버스 · 차가 있는 판'],
    styles: ['밝은 장난감 마을', '밤의 등각 도시', '깔끔한 설명 그림'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 의 Tilemap 은 Sort Order · Custom Axis 정렬(Transparency Sort Axis)로 대부분 되지만, 여러 칸 물체는 같은 문제가 난다 — 피벗을 앞 모서리로 두거나 같은 위상 정렬.',
      godot: 'Godot 은 y_sort_enabled 가 기본. 여러 칸 물체는 같은 문제라 칸 단위로 나누거나 직접 정렬.',
    },
    principle: [
      '등각 화면 좌표 = ((x − y) × 칸 폭 ÷ 2, (x + y) × 칸 높이 ÷ 2 − z × 높이). 뒤(작은 x + y)부터 그려 덮으면 된다.',
      '한 칸 물체는 x + y 합으로 줄 세우면 맞지만, 2칸 · 4칸 물체(울타리 · 버스)는 합이 같아도 앞뒤가 틀려 「뚫고 나오는」 그림이 된다.',
      '두 물체 A · B 가 있을 때, A 의 오른쪽 끝 ≤ B 의 왼쪽 끝이고 y 범위가 겹치면 A 가 뒤. y 쪽도 같게. 둘 다 작으면 역시 A 가 뒤.',
      '이 「뒤에 있다」 관계로 깊이 우선 탐색 위상 정렬 — 내 뒤에 있는 것을 먼저 다 내보내고 나를 내보낸다.',
    ],
    when: ['울타리 · 버스 · 큰 집처럼 여러 칸을 차지하는 물체가 있는 등각 판', '물체가 움직여 앞뒤가 계속 바뀔 때'],
    avoid: ['모든 물체가 한 칸짜리일 때 — x + y 합 정렬이면 충분하고 더 싸다', '물체가 수천 개 — 모든 쌍 비교(n²)라 무겁다. 대신 큰 물체를 칸 단위로 나눈다'],
    cost: 'light',
    costNote: '물체 n 개면 쌍 비교 n² — 견본 6개는 공짜. 100개 넘으면 칸 나누기나 공간 격자로 후보를 줄인다.',
    level: 2,
    must: [
      '물체마다 바닥 차지 범위(x, y, 폭 w, 깊이 d)를 들고 「완전히 뒤에 있나」로 비교',
      '위상 정렬 방문 표시는 세 상태(안 봄 · 보는 중 · 끝) — 보는 중을 다시 만나면 그냥 넘어가 고리에서 멈추지 않게',
      '움직이는 물체가 있으면 매 프레임 다시 정렬',
      '칸 번호 합 정렬과 3초마다 번갈아 비교 + 그리는 순서 번호 보기',
    ],
    done: [
      '움직이는 버스가 울타리 · 집 앞뒤를 지날 때 위상 정렬로는 늘 바르게 겹친다',
      '칸 번호 합 정렬로 바꾸면 버스가 울타리 위로 뚫고 나오는 순간이 보인다',
      '「그리는 순서 번호」를 켜면 물체마다 몇 번째로 그렸는지 숫자가 뜬다',
    ],
    code: {
      lang: 'ts',
      title: '「완전히 뒤」 관계 + 위상 정렬',
      from: 'demos/demos2dLook.ts mkI310() behind() · topoSort() 를 정리',
      body: `interface Obj { x: number; y: number; w: number; d: number; h: number }
const TW = 30, TH = 15, HZ = 17, OX = 140, OY = 30;
/** 등각 화면 좌표 */
const sp = (x: number, y: number, z: number): [number, number] =>
  [OX + ((x - y) * TW) / 2, OY + ((x + y) * TH) / 2 - z * HZ];

const ov = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 1e-6 && b0 < a1 - 1e-6;
/** A 가 B 보다 뒤에 있나 (먼저 그려야 하나) */
function behind(A: Obj, B: Obj) {
  const ax1 = A.x + A.w, ay1 = A.y + A.d;
  if (ax1 <= B.x + 1e-6 && ov(A.y, ay1, B.y, B.y + B.d)) return true; // x 쪽으로 완전히 뒤
  if (ay1 <= B.y + 1e-6 && ov(A.x, ax1, B.x, B.x + B.w)) return true; // y 쪽으로 완전히 뒤
  return ax1 <= B.x + 1e-6 && ay1 <= B.y + 1e-6;                      // 대각선 뒤
}
function topoSort(os: Obj[]): Obj[] {
  const out: Obj[] = [];
  const st = new Map<Obj, number>();          // 1 = 보는 중, 2 = 끝
  const visit = (o: Obj) => {
    if (st.get(o)) return;                     // 끝났거나 보는 중(고리)이면 넘어감
    st.set(o, 1);
    for (const p of os) if (p !== o && behind(p, o)) visit(p); // 내 뒤를 먼저
    st.set(o, 2);
    out.push(o);
  };
  for (const o of os) visit(o);
  return out;                                  // 이 순서로 그리면 앞이 뒤를 덮는다
}
// 비교용 잘못된 정렬: [...os].sort((a, b) => a.x + a.y - (b.x + b.y))`,
    },
    pitfalls: [
      { title: '여러 칸 물체를 x + y 합으로 줄 세우면 앞 물체를 뚫고 나온다', fix: '합은 한 칸 물체에만 맞다. 바닥 범위로 「완전히 뒤」를 비교하는 위상 정렬을 쓴다.' },
      { title: '물체가 서로 감싸면(고리) 재귀가 끝나지 않는다', fix: '「보는 중」 표시를 만나면 그냥 돌아간다 — 순서는 조금 틀려도 멈추지 않는다.' },
      { title: '물체가 많으면 n² 비교가 무겁다', fix: '큰 물체를 칸 단위로 쪼개거나, 공간 격자로 가까운 물체만 비교한다.' },
    ],
    prev: ['i308'],
    next: ['i309'],
  },

  i312: {
    id: 'i312',
    summary: '손이 찍은 떨리는 점을 이동 평균으로 다듬고 중점 2차 곡선으로 잇고, 빠르게 그은 곳은 가늘게 해, 서툰 손도 매끈한 붓 선이 되게 한다.',
    terms: [
      { en: 'Stroke smoothing (moving average)', ko: '이동 평균 — 앞뒤 점과 평균 내 떨림 줄이기' },
      { en: 'Midpoint quadratic Bézier', ko: '점 사이 중점을 2차 곡선으로 잇기' },
      { en: 'Velocity-based stroke width', ko: '빠르면 가늘게 — 붓 압력 흉내' },
      { en: 'Taper', ko: '선 시작 · 끝을 가늘게' },
    ],
    goal: '{target}에 부드러운 붓 선을 넣어 줘 — 흔들리는 손 점을 이동 평균 · 2차 곡선으로 매끈하게, 빠르면 가늘게. 분위기는 {style}.',
    targets: ['그림 그리기 놀이', '선 따라 쓰기 · 글씨 연습', '그려서 푸는 퍼즐'],
    styles: ['깔끔한 펜 선', '붓글씨 같은 굵기 변화', '아이 그림 스케치북'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 같은 계산 결과를 LineRenderer(widthCurve) 로 그리거나 Texture2D 에 찍는다.',
      godot: 'Godot 은 Line2D 의 width_curve 와 points 로 같은 결과를 그릴 수 있다.',
    },
    principle: [
      '이동 평균: 점 i 를 앞뒤 k 칸(기본 4) 점들의 평균으로 바꾼다. 양 끝에선 k 를 줄여 끝점이 끌려가지 않게.',
      '평균 낸 점 사이 중점 m0 · m1 을 잇되, 그 사이 점 c 를 조절점으로 한 2차 베지에로 4토막씩 — 모서리 없이 둥글게 이어진다.',
      '두 점 사이 거리 = 빠르기. 목표 굵기 = 4.6 − 빠르기 × 0.5 (1.2 ~ 4.6), 지금 굵기는 목표 쪽으로 0.22 씩만 따라가 갑자기 변하지 않는다.',
      '처음 · 끝 6점은 굵기를 0.3 배까지 줄여 붓을 대고 떼는 느낌을 낸다.',
    ],
    when: ['손가락 · 마우스로 그리는 모든 그림 놀이', '아이들이 그은 삐뚤한 선을 보기 좋게'],
    avoid: ['정확한 자리를 지나야 하는 선(작도 · 길 그리기) — 다듬으면 모서리가 뭉갠다. 대신 스냅(i320)', '압력 펜이 있는 기기 — PointerEvent.pressure 를 굵기에 그대로 쓰는 편이 낫다'],
    cost: 'light',
    costNote: '획마다 점 수 × 평균 칸 수. 짧은 토막을 lineWidth 바꿔 여러 번 stroke — 획이 수백 개면 다 그린 획은 캔버스에 구워 둔다.',
    level: 2,
    must: [
      '거의 같은 자리 점(0.4px 안)은 버리기 — 멈춘 손가락이 점을 쌓아 굵기가 튄다',
      '평균 칸 수는 끝에서 줄이기 (끝점이 안쪽으로 끌려오지 않게)',
      '굵기는 바로 바꾸지 말고 목표로 조금씩 따라가기',
      '보정 끔/켬 · 손 점 보기 토글로 원래 점과 비교',
    ],
    done: [
      '빨간 손 점은 떨리는데 그 위 검은 선은 매끈하다',
      '빠르게 그은 곳은 가늘고 천천히 그은 곳은 굵다, 시작 · 끝은 가늘어진다',
      '보정 세기 0 이면 점을 그대로 잇고, 10 이면 크게 둥글어진다',
    ],
    code: {
      lang: 'ts',
      title: '이동 평균 + 빠르기 굵기 + 중점 2차 곡선',
      from: 'demos/demosDrawTools.ts smoothBrush() smoothed() 를 정리',
      body: `type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function smoothed(raw: P[], win = 4): { p: P; w: number }[] {
  const n = raw.length;
  if (n < 2) return raw.map((p) => ({ p, w: 3 }));
  const a = raw.map((_, i) => {                       // 이동 평균 (끝에선 칸 줄임)
    const k = Math.min(win, i, n - 1 - i);
    let sx = 0, sy = 0;
    for (let j = i - k; j <= i + k; j++) { sx += raw[j].x; sy += raw[j].y; }
    return { x: sx / (2 * k + 1), y: sy / (2 * k + 1) };
  });
  const ws: number[] = [];
  let w = 0;
  for (let i = 0; i < n; i++) {                       // 빠르면 가늘게, 끝은 가늘게
    const sp = i ? dist(raw[i], raw[i - 1]) : 2;
    const target = clamp(4.6 - sp * 0.5, 1.2, 4.6);
    w = i === 0 ? target : w + (target - w) * 0.22;
    ws.push(w * (0.3 + 0.7 * Math.min(1, (i + 1) / 6, (n - i) / 6)));
  }
  const out = [{ p: a[0], w: ws[0] }];
  for (let i = 1; i < n - 1; i++) {                   // 중점 → 중점 2차 곡선, 4토막
    const m0 = { x: (a[i - 1].x + a[i].x) / 2, y: (a[i - 1].y + a[i].y) / 2 };
    const m1 = { x: (a[i].x + a[i + 1].x) / 2, y: (a[i].y + a[i + 1].y) / 2 };
    for (let s = 1; s <= 4; s++) {
      const u = s / 4, v = 1 - u;
      out.push({
        p: { x: v * v * m0.x + 2 * v * u * a[i].x + u * u * m1.x, y: v * v * m0.y + 2 * v * u * a[i].y + u * u * m1.y },
        w: (ws[i - 1] + ws[i]) / 2 + (((ws[i] + ws[i + 1]) / 2) - (ws[i - 1] + ws[i]) / 2) * u,
      });
    }
  }
  out.push({ p: a[n - 1], w: ws[n - 1] });
  return out; // 이웃 두 점마다 lineWidth = 평균 굵기로 짧게 stroke
}`,
    },
    pitfalls: [
      { title: '굵기를 점마다 바로 바꾸면 선이 울퉁불퉁 끊긴다', fix: '목표 굵기로 0.22 씩만 따라가고, 토막 굵기는 이웃 두 점의 평균으로.' },
      { title: '손가락을 멈춘 자리에 점이 쌓여 굵은 혹이 생긴다', fix: '앞 점과 0.4px 안이면 버린다.' },
      { title: '평균을 끝까지 같은 칸으로 내면 선 끝이 짧아진다', fix: '끝에선 남은 점 수만큼만 평균 (k = min(win, i, n − 1 − i)).' },
    ],
    next: ['i313', 'i328'],
  },

  i313: {
    id: 'i313',
    summary: '획을 따로 한 겹에 그린 뒤 종이에 고정된 결 무늬로 군데군데 지워 얹어, 크레파스(종이 결) · 수채(번짐 · 겹치면 섞임) · 분필(칠판) 붓을 만든다.',
    terms: [
      { en: 'Stamp brush (dab spacing)', ko: '도장 붓 — 선 따라 일정 간격으로 찍기' },
      { en: 'Paper grain mask (destination-out)', ko: '종이 결 무늬로 획을 지워 질감 내기' },
      { en: 'Multiply blending', ko: '곱하기 — 수채처럼 겹친 곳이 진하게' },
      { en: 'Stroke layer compositing', ko: '획 겹 따로 그려 손 뗄 때 합치기' },
    ],
    goal: '{target}에 도장 붓을 넣어 줘 — 크레파스 · 수채 · 분필 세 가지, 종이 결 무늬로 군데군데 빈 질감, 수채는 겹치면 진하게. 분위기는 {style}.',
    targets: ['스케치북 그림 게임', '색칠 놀이', '칠판 설명 화면'],
    styles: ['크레파스 동화책', '맑은 수채화', '초록 칠판 분필'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 RenderTexture 에 붓 도장을 찍고 결 무늬 텍스처를 셰이더에서 곱해 지운다.',
      godot: 'Godot 은 SubViewport 에 붓을 그리고 CanvasItem 셰이더에서 결 텍스처로 알파를 깎는다.',
    },
    principle: [
      '붓마다 결 무늬 마스크를 종이 크기로 한 번 굽는다 — 값 잡음 두 겹으로 「이」 모양, 문턱을 넘은 곳만 알파가 남는다.',
      '그리는 동안 획은 따로 한 겹(cur)에만 쌓는다. 크레파스 = 굵은 선 + 가장자리 부스러기 점, 수채 = 가장자리가 짙은 원 도장을 1.6px 마다 0.14 투명도로, 분필 = 작은 사각 점 7개씩.',
      '보여 줄 때와 손 뗄 때 획 겹을 결 마스크로 destination-out 해서 군데군데 지운다. 마스크가 종이에 붙어 있으니 같은 곳은 늘 같이 빈다.',
      '수채는 multiply 로 바탕에 얹어 겹친 곳이 더 진하고 색이 섞이고, 나머지는 source-over.',
    ],
    when: ['손그림 · 동화책 그림체의 그리기 놀이', '같은 그리기 판에서 붓 종류를 고르게 할 때'],
    avoid: ['아주 큰 캔버스에서 매 프레임 합치기 — 화면 크기 drawImage 가 여러 번이라 무겁다. 대신 손 뗄 때만 합치고 그리는 중엔 획 영역만', '또렷한 선이 필요한 도구 — 부드러운 붓 선(i312)'],
    cost: 'medium',
    costNote: '결 마스크는 붓마다 종이 크기 한 장(처음 한 번). 그리는 중에는 화면 크기 drawImage 2 ~ 3번이 매 프레임 — 큰 화면 폰에선 주의.',
    level: 2,
    must: [
      '결 마스크는 처음 한 번만 굽기 (붓마다 한 장)',
      '획은 따로 한 겹에 쌓고, 결 지우기는 그 겹에만 (바탕을 같이 지우지 않게)',
      '마스크는 종이에 고정 — 획마다 옮기거나 새로 만들지 않기',
      '수채는 multiply, 크레파스 · 분필은 source-over',
      '찍는 간격은 이동 거리로 (프레임마다 한 번 찍으면 빠르게 그을 때 끊긴다)',
    ],
    done: [
      '크레파스 줄은 종이 결 사이로 흰 틈이 군데군데 보인다',
      '수채 줄은 가장자리가 짙고, 두 줄이 겹치면 그 곳이 더 진하고 색이 섞인다',
      '칠판 위 분필 줄은 거칠게 부스러진 흰 선이다',
      '같은 자리를 다시 칠해도 결 무늬 틈은 같은 곳에 남는다',
    ],
    code: {
      lang: 'ts',
      title: '획 겹 → 결 마스크로 지우기 → 바탕에 합치기',
      from: 'demos/demosDrawTools.ts stampBrush() composeTmp() · end() 를 정리',
      body: `// base: 바탕 겹, cur: 지금 획 겹, tmp: 합칠 준비 겹 — 모두 같은 크기 캔버스
// masks[kind]: 붓마다 한 번 구운 결 무늬 (알파 = 지울 곳)
function composeTmp(tmp: CanvasRenderingContext2D, cur: HTMLCanvasElement, mask: HTMLCanvasElement) {
  tmp.save();
  tmp.setTransform(1, 0, 0, 1, 0, 0);
  tmp.clearRect(0, 0, tmp.canvas.width, tmp.canvas.height);
  tmp.drawImage(cur, 0, 0);
  tmp.globalCompositeOperation = 'destination-out'; // 결 무늬만큼 획을 지운다
  tmp.drawImage(mask, 0, 0);
  tmp.restore();
}
function endStroke(base: CanvasRenderingContext2D, tmpC: HTMLCanvasElement, kind: 'crayon' | 'water' | 'chalk') {
  base.save();
  base.setTransform(1, 0, 0, 1, 0, 0);
  base.globalCompositeOperation = kind === 'water' ? 'multiply' : 'source-over'; // 수채는 겹치면 진하게
  base.drawImage(tmpC, 0, 0);
  base.restore();
}
/** 수채 도장 — 가장자리가 짙은 원 */
function mkWaterStamp(col: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col + '55'); gr.addColorStop(0.72, col + '99');
  gr.addColorStop(0.86, col + 'cc'); gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
// 수채 찍기: 두 점 사이를 1.6px 마다, globalAlpha 0.14, 반지름 8 ± 흔들림`,
    },
    pitfalls: [
      { title: '결 마스크를 바탕에 바로 쓰면 이미 칠한 그림까지 지워진다', fix: '획은 따로 한 겹에 그리고 그 겹에만 destination-out, 그 다음 바탕에 합친다.' },
      { title: '수채를 source-over 로 얹으면 겹쳐도 진해지지 않는다', fix: 'multiply 로 합친다 — 겹친 곳이 곱해져 진해지고 색이 섞인다.' },
      { title: '결 무늬를 획마다 새로 만들면 같은 곳을 칠해도 틈이 달라 지저분하다', fix: '종이 크기로 한 번 굽고 고정 — 진짜 종이 결처럼 늘 같은 자리가 빈다.' },
    ],
    prev: ['i312'],
    next: ['i330', 'i327'],
  },

  i314: {
    id: 'i314',
    summary: '누른 픽셀과 이어진 같은 색 칸을 너비 우선으로 찾아 채우고, 찾은 순서대로 조금씩 칠해 물결처럼 퍼지게 하는 페인트 통 도구.',
    terms: [
      { en: 'Flood fill (BFS)', ko: '영역 채우기 — 이웃으로 번지며 찾기' },
      { en: '4-connectivity', ko: '위 · 아래 · 왼쪽 · 오른쪽만 이웃으로' },
      { en: 'Line-art alpha threshold', ko: '선 알파가 문턱 넘으면 벽으로' },
      { en: 'ImageData Uint32Array', ko: '픽셀을 32비트 정수 배열로' },
    ],
    goal: '{target}에 페인트 통 채우기를 넣어 줘 — 누른 곳과 이어진 같은 색 칸을 찾아 물결처럼 채우고, 선 가장자리까지 빈틈없이. 분위기는 {style}.',
    targets: ['색칠하기 그림', '넓이 세기 (칸 수)', '지도 칠하기 퍼즐'],
    styles: ['손그림 선 색칠 공책', '깔끔한 도형', '도트 그림'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Texture2D.GetPixels32 로 같은 너비 우선 채우기를 하고 SetPixels32 · Apply.',
      godot: 'Godot 은 Image.get_pixel · set_pixel 로 같은 채우기 (큰 그림은 get_data 바이트 배열로).',
    },
    principle: [
      '선 그림 겹의 알파만 따로 배열(la)에 담아 둔다. 알파 > 100 이면 벽.',
      '누른 픽셀의 지금 색을 기억하고, 큐에 넣고 시작. 큐에서 하나 꺼내 위 · 아래 · 왼쪽 · 오른쪽 이웃 중 「방문 안 함 · 벽 아님 · 같은 색」만 다시 넣는다.',
      '벽에 닿은 이웃은 따로 모아 두었다가 다 채운 뒤에 함께 칠한다 — 선의 흐린 가장자리(안티앨리어싱) 아래 흰 테가 안 남는다.',
      '큐에 들어간 순서 = 누른 곳에서 가까운 순서. 그 순서대로 프레임마다 일정 개수씩 칠하면 물결처럼 퍼진다 (약 0.55초).',
    ],
    when: ['색칠 공책 · 그림 색칠 놀이', '「이 영역은 몇 칸?」 넓이 세기'],
    avoid: ['아주 큰 그림(수백만 픽셀)에서 한 번에 — 큐가 커진다. 줄 단위 채우기(scanline fill)가 메모리를 덜 쓴다', '선에 틈이 많은 손그림 — 틈으로 밖까지 샌다. 선을 굵게 하거나 닫힌 영역만 쓰기'],
    cost: 'light',
    costNote: '종이 크기 픽셀만큼 방문 배열 · 큐(Int32Array) 를 한 번 만들어 돌려 쓴다. 한 번 채우기는 영역 픽셀 수만큼.',
    level: 1,
    must: [
      '방문 · 큐 배열은 미리 한 번 만들어 재사용 (누를 때마다 new 하지 않기)',
      '선 판단은 선 겹의 알파로 — 칠한 색 겹과 선 겹을 따로 들기',
      '벽에 닿은 가장자리 픽셀도 마지막에 함께 칠하기 (흰 테 막기)',
      '이미 같은 색이면 바로 끝내기',
      '선을 새로 그으면 알파 배열을 다시 읽기',
    ],
    done: [
      '닫힌 영역을 누르면 누른 곳부터 물결처럼 색이 퍼져 영역만 꽉 찬다',
      '선 가장자리에 흰 테가 남지 않는다',
      '끌어서 선을 새로 그으면 그 선도 벽이 되어 영역이 나뉜다',
    ],
    code: {
      lang: 'ts',
      title: '너비 우선 채우기 (가장자리 포함 · 순서 기록)',
      from: 'demos/demosDrawTools.ts paintBucket() fillAt() 을 정리',
      body: `// la: 선 겹 알파(Uint8Array), col32: 칠한 색 겹 픽셀(Uint32Array), PW × PH
function fillAt(x: number, y: number, c32: number, la: Uint8Array, col32: Uint32Array,
                PW: number, PH: number, visited: Uint8Array, queue: Int32Array) {
  const N = PW * PH, s = y * PW + x;
  if (la[s] > 100) return null;                 // 선 위를 눌렀다
  const seed = col32[s];
  if (seed === c32) return null;                // 이미 같은 색
  visited.fill(0);
  let head = 0, tail = 0;
  queue[tail++] = s; visited[s] = 1;
  const edges: number[] = [];
  while (head < tail) {
    const i = queue[head++], ix = i % PW;
    const nb = [ix > 0 ? i - 1 : -1, ix < PW - 1 ? i + 1 : -1, i - PW, i + PW]; // 4 이웃
    for (const j of nb) {
      if (j < 0 || j >= N || visited[j]) continue;
      visited[j] = 1;
      if (la[j] > 100) { edges.push(j); continue; } // 벽 — 가장자리로 기억
      if (col32[j] !== seed) continue;
      queue[tail++] = j;
    }
  }
  return { order: queue.slice(0, tail), edges }; // order 를 앞에서부터 조금씩 칠하면 물결
}
// 칠하기: 프레임마다 speed × dt 개씩 col32[order[k]] = c32, 끝나면 edges 도 칠하고 putImageData`,
    },
    pitfalls: [
      { title: '선 아래 흐린 가장자리에 흰 테가 남는다', fix: '벽에 닿은 이웃 픽셀을 모아 두었다가 다 채운 뒤 같은 색으로 칠한다.' },
      { title: '재귀로 채우면 큰 영역에서 콜 스택이 넘친다', fix: '큐(Int32Array)로 너비 우선 — 재귀 없음.' },
      { title: '칠한 색 겹과 선 겹을 한 장에 두면 색이 선을 덮어 벽이 사라진다', fix: '선 겹을 따로 들고 벽 판단은 그 알파로만.' },
      { title: 'RGBA 색을 32비트로 만들 때 순서가 뒤집힌다', fix: '리틀 엔디안이라 (A << 24) | (B << 16) | (G << 8) | R. 견본 toC32 처럼 한 곳에서 바꾼다.' },
    ],
    prev: ['i312'],
    next: ['i317'],
  },

  i315: {
    id: 'i315',
    summary: '삐뚤게 그린 선에서 닫힘 · 꼭짓점 수 · 둥근 정도를 재어 원 · 타원 · 삼각형 · 사각형 · 직선을 알아채고, 반듯한 모양으로 착 바꿔 준다.',
    terms: [
      { en: 'Sketch shape recognition', ko: '손그림 도형 알아보기' },
      { en: 'Ramer–Douglas–Peucker simplification', ko: 'RDP — 덜 중요한 점을 빼 꼭짓점만 남기기' },
      { en: 'Resampling (equal spacing)', ko: '선을 같은 간격 점 64개로 다시 찍기' },
      { en: 'Coefficient of variation (ellipse fit)', ko: '중심 거리의 흩어짐으로 둥근 정도 재기' },
    ],
    goal: '{target}에 손그림 도형 알아보기를 넣어 줘 — 그린 선의 닫힘 · 꼭짓점 · 둥근 정도로 원 · 삼각형 · 사각형 · 직선을 알아채 반듯하게 바꾸고 이름표. 분위기는 {style}.',
    targets: ['도형 그리기 퀴즈', '손으로 그리는 작도', '화이트보드 도구'],
    styles: ['연필 공책', '깔끔한 화이트보드', '귀여운 스티커'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '선을 같은 간격 점 64개로 다시 찍는다. 처음 · 끝 거리가 길이의 22% 안이면 닫힌 모양, 아니면 직선(곧은 정도 > 0.9)이거나 자유 곡선.',
      '닫힌 모양은 중심에서 가장 먼 점과 그 점에서 가장 먼 점으로 둘로 나눠, 각각 RDP(허용 = 대각선 × 0.085)로 꼭짓점만 남긴다. 거의 곧게 이어지는 꼭짓점(꺾임 < 0.42 라디안)은 뺀다.',
      '상자에 맞춘 타원까지의 정규 거리를 재서 흩어짐(변동 계수)이 0.075 보다 작으면 원 · 타원. 가로세로 비 0.8 ~ 1.25 면 원.',
      '꼭짓점 3개 = 삼각형, 4개 = 주축 방향 직사각형(거의 수평이면 수평으로), 가로세로 비 0.88 ~ 1.14 면 정사각형. 선과 모양의 평균 어긋남으로 「몇 %」 확신을 낸다.',
      '손그림 점마다 새 모양 위 가장 가까운 점으로 0.38초 동안 back 이징으로 옮겨 「착」 붙는다.',
    ],
    when: ['「원을 그려 봐」 같은 도형 그리기 퀴즈', '손으로 대충 그린 도형을 반듯하게 바꾸는 그리기 도구'],
    avoid: ['글자 · 복잡한 그림 알아보기 — 꼭짓점 세기로는 안 된다. 대신 모양 비교(i316) 같은 템플릿 방식', '별 · 하트처럼 정해진 모양 여럿 — $1 인식기 같은 템플릿 비교가 더 맞다'],
    cost: 'light',
    costNote: '획 하나 끝날 때 점 64개로 한 번 계산 — 비용 없음.',
    level: 2,
    must: [
      '먼저 같은 간격으로 다시 찍기 (빠르게 · 느리게 그린 차이 없애기)',
      'RDP 허용값 · 판단 문턱은 모양 크기(대각선)에 비례하게',
      '알아보지 못하면 「모양 없음」으로 그대로 두기 (억지로 바꾸지 않기)',
      '바뀌는 순간을 애니메이션으로 — 점마다 새 모양 위 가장 가까운 점으로',
      '이름표에 확신 % 를 함께',
    ],
    done: [
      '대충 그린 원이 반듯한 원으로 착 바뀌고 「원 ✓ 90%」 이름표가 뜬다',
      '삐뚤한 네 꼭짓점 모양은 반듯한 직사각형(거의 같으면 정사각형)이 된다',
      '닫히지 않은 꼬불꼬불 선은 「모양 없음 — 그대로 둠」',
      '작게 그려도 크게 그려도 같은 결과',
    ],
    code: {
      lang: 'ts',
      title: 'RDP 로 꼭짓점 남기기 · 닫힌 모양 판정',
      from: 'demos/demosDrawTools.ts rdp() · recognize() 를 정리',
      body: `type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** 처음 · 끝을 잇는 선에서 가장 먼 점이 eps 보다 멀면 거기서 나눠 다시 */
function rdp(p: P[], eps: number): P[] {
  if (p.length < 3) return p.slice();
  const a = p[0], b = p[p.length - 1], L = dist(a, b) || 1e-6;
  let md = -1, mi = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const q = p[i];
    const d = Math.abs((b.x - a.x) * (a.y - q.y) - (a.x - q.x) * (b.y - a.y)) / L;
    if (d > md) { md = d; mi = i; }
  }
  if (md > eps) return rdp(p.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(p.slice(mi), eps));
  return [a, b];
}
/** 둥근 정도: 상자 타원까지 정규 거리의 변동 계수 (작을수록 원) */
function roundness(ring: P[], minx: number, maxx: number, miny: number, maxy: number) {
  const ex = (minx + maxx) / 2, ey = (miny + maxy) / 2;
  const ax = (maxx - minx) / 2 || 1, ay = (maxy - miny) / 2 || 1;
  let m = 0, m2 = 0;
  for (const q of ring) { const v = Math.hypot((q.x - ex) / ax, (q.y - ey) / ay); m += v; m2 += v * v; }
  m /= ring.length;
  return Math.sqrt(Math.max(0, m2 / ring.length - m * m)) / m;
}
// 판정: closed = dist(처음, 끝) < 0.22 × 길이
// (cv < 0.075 && 꼭짓점 ≥ 4) || 꼭짓점 ≥ 6 → 원/타원, 3 → 삼각형, 4 → 직사각형
// eps = 대각선 × 0.085, 꼭짓점 빼기: 꺾임 < 0.42 rad 이거나 변 < 대각선 × 0.08`,
    },
    pitfalls: [
      { title: '고정 문턱(px)을 쓰면 작은 그림 · 큰 그림 결과가 다르다', fix: 'RDP 허용값 · 꼭짓점 판단을 모양 대각선에 비례하게 (견본 0.085 · 0.08 · 0.12).' },
      { title: '원을 RDP 하면 꼭짓점이 여러 개라 다각형으로 나온다', fix: '먼저 둥근 정도(변동 계수)로 원인지 보고, 꼭짓점 6개 이상도 원으로 본다.' },
      { title: '닫힌 모양을 시작점에서 바로 RDP 하면 시작점이 꼭짓점이 된다', fix: '중심에서 가장 먼 점(실제 꼭짓점일 가능성이 큼)부터 돌려 시작하고 둘로 나눠 RDP.' },
    ],
    prev: ['i312'],
    next: ['i316', 'i320'],
    refs: [{ name: 'Wikipedia — Ramer–Douglas–Peucker algorithm', url: 'https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm' }],
  },

  i316: {
    id: 'i316',
    summary: '손으로 쓴 숫자를 28×28 칸으로 줄여 0 ~ 9 기준 모양 여럿과 거리 지도(챔퍼 거리)로 비교해, 가장 닮은 숫자와 몇 % 인지 맞힌다.',
    terms: [
      { en: 'Handwritten digit recognition (template matching)', ko: '손글씨 숫자 알아보기 — 기준 모양과 비교' },
      { en: 'Chamfer distance', ko: '두 그림의 선이 서로 얼마나 떨어져 있나' },
      { en: 'Distance transform (two-pass)', ko: '두 번 훑어 칸마다 가장 가까운 선까지 거리' },
      { en: 'Softmax', ko: '점수를 합이 1 인 확률로' },
    ],
    goal: '{target}에 손글씨 숫자 알아보기를 넣어 줘 — 쓴 숫자를 28×28 로 줄여 0 ~ 9 기준 모양과 거리 비교, 맞힌 숫자와 % 막대. 분위기는 {style}.',
    targets: ['손으로 답 쓰기 계산 문제', '숫자 쓰기 연습', '설명 화면 (기계는 어떻게 알아보나)'],
    styles: ['연필 공책', '깔끔한 화이트보드', '칠판 분필'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '쓴 획들의 상자를 구해 긴 변이 20칸이 되게 줄여 28×28 캔버스 가운데에 굵기 2.3 으로 다시 그린다 — 크기 · 자리 차이가 사라진다.',
      '거리 지도: 선 칸 = 0, 나머지 = 99 로 두고 왼쪽 위 → 오른쪽 아래, 다시 거꾸로 두 번 훑으며 이웃 + 1(대각선 + 1.414)로 줄인다.',
      '챔퍼 거리 = (내 선 칸에서 기준 거리 지도 값 평균) + (기준 선 칸에서 내 거리 지도 값 평균). 양쪽을 다 봐야 「덜 쓴 것」도 「더 쓴 것」도 벌점.',
      '기준 모양은 숫자마다 몇 가지 쓰는 법 × 기울기 3가지(−0.12 · 0 · 0.12)를 미리 구워 둔다. 숫자마다 가장 작은 거리 → exp(−5 × 거리) 로 확률.',
      '손 떼고 0.65초 기다렸다 맞힌다 — 여러 획 숫자(4 · 5)를 다 쓸 시간.',
    ],
    when: ['계산 문제 답을 손으로 쓰게 할 때 (숫자 한 자리)', '「컴퓨터는 어떻게 글씨를 알아보나」 설명'],
    avoid: ['여러 자리 · 글자 · 문장 — 한 칸 한 숫자만 된다. 대신 칸을 나눠 받거나 진짜 신경망(MNIST 학습 모델)', '틀리면 안 되는 시험 — 템플릿 비교는 90% 안팎. 고르기 단추를 함께 둔다'],
    cost: 'light',
    costNote: '28×28 = 784칸 × 기준 모양 수십 개 비교. 손 뗄 때 한 번 — 몇 ms.',
    level: 3,
    must: [
      '먼저 상자 기준으로 크기 · 자리 맞추기 (긴 변 20칸, 가운데)',
      '거리 지도는 두 번 훑기 (왼쪽 위 → 오른쪽 아래, 반대) — 픽셀마다 전부 찾기 금지',
      '챔퍼는 양방향 (내 → 기준 + 기준 → 나)',
      '기준 모양은 숫자마다 여러 쓰는 법 · 기울기로 미리 굽고 캐시',
      '마지막 획 뒤 잠깐 기다렸다 판정 (여러 획 숫자)',
    ],
    done: [
      '숫자를 쓰고 손을 떼면 잠시 뒤 큰 숫자와 「7 — 92%」, 0 ~ 9 막대가 자란다',
      '28×28 격자에 줄인 그림이 보인다',
      '크게 · 작게 · 비스듬히 써도 대체로 맞힌다',
      '결과가 나온 뒤 새로 쓰면 이전 글씨가 지워진다',
    ],
    code: {
      lang: 'ts',
      title: '두 번 훑는 거리 지도 · 양방향 챔퍼 거리',
      from: 'demos/demosDrawTools.ts distField() · chamfer() · digitRecog() classify() 를 정리',
      body: `/** gray: 28×28 (0 ~ 1). 칸마다 가장 가까운 선 칸까지 거리 */
function distField(gray: Float32Array): Float32Array {
  const D = new Float32Array(784);
  for (let i = 0; i < 784; i++) D[i] = gray[i] > 0.3 ? 0 : 99;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x > 27 || y > 27 ? 99 : D[y * 28 + x]);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {          // 왼쪽 위 → 오른쪽 아래
    const i = y * 28 + x;
    D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  }
  for (let y = 27; y >= 0; y--) for (let x = 27; x >= 0; x--) {        // 거꾸로
    const i = y * 28 + x;
    D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  }
  return D;
}
/** 양방향 — 덜 쓴 것도 더 쓴 것도 벌점 */
function chamfer(gu: Float32Array, du: Float32Array, gt: Float32Array, dt: Float32Array) {
  let a = 0, na = 0, b = 0, nb = 0;
  for (let i = 0; i < 784; i++) {
    if (gu[i] > 0.3) { a += dt[i]; na++; }
    if (gt[i] > 0.3) { b += du[i]; nb++; }
  }
  return a / Math.max(1, na) + b / Math.max(1, nb);
}
function classify(gray: Float32Array, tpls: { digit: number; gray: Float32Array; df: Float32Array }[]) {
  const df = distField(gray);
  const best = new Array(10).fill(99) as number[];
  for (const t of tpls) best[t.digit] = Math.min(best[t.digit], chamfer(gray, df, t.gray, t.df));
  const ex = best.map((s) => Math.exp(-s * 5));
  const sum = ex.reduce((p, q) => p + q, 0) || 1;
  return ex.map((v) => v / sum);                                         // 0 ~ 9 확률
}`,
    },
    pitfalls: [
      { title: '크기 · 자리를 맞추지 않으면 작게 쓴 숫자를 못 알아본다', fix: '상자 긴 변을 20칸으로, 28칸 가운데에 다시 그린다 (MNIST 와 같은 준비).' },
      { title: '한쪽 방향 거리만 보면 「1」이 모든 숫자와 가깝다', fix: '내 → 기준, 기준 → 나 양방향을 더한다.' },
      { title: '여러 획 숫자를 첫 획 끝에서 판정해 버린다', fix: '마지막 획 뒤 0.65초 기다렸다 판정, 새 획을 시작하면 기다림을 취소.' },
      { title: 'getImageData 를 자주 부르면 느리다는 경고가 뜬다', fix: '28×28 캔버스를 getContext("2d", { willReadFrequently: true }) 로 만든다.' },
    ],
    prev: ['i315'],
    next: ['i317'],
    refs: [{ name: 'Wikipedia — Distance transform', url: 'https://en.wikipedia.org/wiki/Distance_transform' }],
  },

  i317: {
    id: 'i317',
    summary: '획 하나를 명령 하나로 기록해 쌓고 「지금 위치」만 앞뒤로 옮겨 되돌리기 · 다시 하기를 만들고, 되돌린 뒤 새로 그으면 다시 하기 갈래를 잘라 낸다.',
    terms: [
      { en: 'Undo / redo (command pattern)', ko: '되돌리기 · 다시 하기 — 명령 기록' },
      { en: 'History stack with cursor index', ko: '기록 목록 + 지금 위치 번호' },
      { en: 'Replay (rebuild from commands)', ko: '처음부터 명령을 다시 그려 화면 만들기' },
      { en: 'Redo branch truncation', ko: '새 명령이 오면 다시 하기 쪽을 버림' },
    ],
    goal: '{target}에 되돌리기 · 다시 하기를 넣어 줘 — 획마다 명령으로 쌓고 지금 위치를 옮기기, 지우개도 획으로, 새로 그으면 다시 하기 갈래가 잘리게. 분위기는 {style}.',
    targets: ['그리기 판', '퍼즐 (수 되돌리기)', '판 만들기 편집기'],
    styles: ['깔끔한 도구 화면', '스케치북', '기록이 보이는 설명 화면'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 편집기 도구라면 Undo.RecordObject. 게임 안에선 같은 명령 목록을 직접.',
      godot: 'Godot 은 UndoRedo 클래스(create_action · add_do_method · add_undo_method)가 같은 구조다.',
    },
    principle: [
      '명령 = 다시 그리는 데 필요한 것 전부 (펜/지우개 · 점들 · 색). 목록 stack 과 「여기까지 적용됨」 번호 idx 를 든다.',
      '되돌리기 = idx − 1, 다시 하기 = idx + 1. 그런 뒤 빈 캔버스에 stack[0] ~ stack[idx − 1] 을 차례로 다시 그린다.',
      '지우개도 destination-out 으로 그리는 획 하나 — 그래서 지우기도 되돌릴 수 있다.',
      '되돌린 상태(idx < 길이)에서 새로 그으면 idx 뒤 명령들을 버리고 새 명령을 붙인다 — 갈래가 잘린다.',
      '그리는 중에는 새 점만 이어 그리고, 다시 그리기(rebuild)는 되돌리기 · 다시 하기 때만.',
    ],
    when: ['모든 그리기 · 편집 도구', '퍼즐에서 수 되돌리기 (명령 = 한 수)'],
    avoid: ['명령이 수천 개로 길어지는 그림 — 매번 처음부터 다시 그리면 느려진다. 몇십 개마다 그림을 찍어 둔(스냅샷) 지점부터 다시', '되돌릴 수 없어야 하는 게임 규칙 (주사위 등) — 기록에서 빼기'],
    cost: 'light',
    costNote: '되돌릴 때만 전체 다시 그리기 (명령 수 × 점 수). 수백 획까지는 순식간.',
    level: 1,
    must: [
      '상태가 아니라 명령(다시 그릴 재료)을 기록',
      '지우개도 명령으로 (destination-out) — 지운 것도 되돌리기',
      '되돌린 뒤 새 명령이면 idx 뒤를 잘라 내기',
      '그리는 중엔 마지막 점만 덧그리기, 전체 다시 그리기는 되돌리기 · 다시 하기 때만',
      '되돌릴 것이 없으면 단추를 흐리게',
    ],
    done: [
      '↶ 를 누르면 마지막 획부터 하나씩 사라지고, ↷ 로 다시 나타난다',
      '지우개로 지운 것도 ↶ 로 되살아난다',
      '되돌린 뒤 새로 그으면 기록 판의 뒤 명령들이 줄 그어지며 미끄러져 사라지고 「갈래가 잘려요」가 뜬다',
      '기록 판에 지금 위치 화살표가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '명령 목록 + 지금 위치 + 갈래 자르기',
      from: 'demos/demosDrawTools.ts undoRedo() 를 정리',
      body: `type P = { x: number; y: number };
type Cmd = { kind: 'pen' | 'erase'; pts: P[]; color: string };
let stack: Cmd[] = [];
let idx = 0;                                   // stack[0 .. idx-1] 이 화면에 적용됨
let cur: Cmd | null = null;

function drawCmd(g: CanvasRenderingContext2D, c: Cmd, from = 1) {
  g.save();
  g.globalCompositeOperation = c.kind === 'erase' ? 'destination-out' : 'source-over';
  g.strokeStyle = c.kind === 'erase' ? '#000' : c.color; g.lineWidth = c.kind === 'erase' ? 15 : 3.2;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  const s = Math.max(0, from - 1);
  g.moveTo(c.pts[s].x, c.pts[s].y);
  for (let i = s + 1; i < c.pts.length; i++) g.lineTo(c.pts[i].x, c.pts[i].y);
  if (c.pts.length === 1) g.lineTo(c.pts[0].x + 0.01, c.pts[0].y);
  g.stroke();
  g.restore();
}
function rebuild(g: CanvasRenderingContext2D) {
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  for (let i = 0; i < idx; i++) drawCmd(g, stack[i]);
}
const undo = (g: CanvasRenderingContext2D) => { if (idx > 0) { idx--; rebuild(g); } };
const redo = (g: CanvasRenderingContext2D) => { if (idx < stack.length) { idx++; rebuild(g); } };

function begin(g: CanvasRenderingContext2D, p: P, erase: boolean, color: string) {
  if (idx < stack.length) stack = stack.slice(0, idx); // 다시 하기 갈래 자르기
  cur = { kind: erase ? 'erase' : 'pen', pts: [p], color };
  stack.push(cur); idx = stack.length;
  drawCmd(g, cur);
}
function drag(g: CanvasRenderingContext2D, p: P) {
  if (!cur) return;
  cur.pts.push(p);
  drawCmd(g, cur, cur.pts.length - 1);         // 새 토막만 덧그림
}`,
    },
    pitfalls: [
      { title: '지우개를 「캔버스에서 직접 지우기」로 하면 되돌릴 수 없다', fix: '지우개도 destination-out 획 명령으로 기록한다.' },
      { title: '되돌린 뒤 새로 그었는데 다시 하기가 옛 획을 되살린다', fix: '새 명령을 넣기 전에 stack 을 idx 까지로 자른다.' },
      { title: '그릴 때마다 전체를 다시 그리면 획이 많아질수록 느려진다', fix: '그리는 중엔 새 토막만, 전체 다시 그리기는 되돌리기 · 다시 하기 때만.' },
    ],
    prev: ['i312'],
    next: ['i318'],
  },

  i318: {
    id: 'i318',
    summary: '한 번 그은 토막을 중심 둘레로 N 번 돌리고 거울로 한 번 더 뒤집어 그려, 대칭 축 수에 따라 만화경 · 눈송이 무늬가 저절로 생기게 한다.',
    terms: [
      { en: 'Rotational symmetry (N-fold)', ko: 'N 겹 회전 대칭 — 360° ÷ N 씩 돌려 복사' },
      { en: 'Reflection symmetry (kaleidoscope)', ko: '거울 대칭 — 위아래 뒤집어 한 번 더' },
      { en: '2D rotation matrix', ko: 'x cos − y sin, x sin + y cos' },
      { en: 'Dihedral group D_N', ko: '회전 N 개 + 거울 N 개 = 2N 겹' },
    ],
    goal: '{target}에 대칭 그리기를 넣어 줘 — 한 번 그으면 중심 둘레로 회전 · 거울 대칭으로 여러 개, 대칭 축 수 조절. 분위기는 {style}.',
    targets: ['대칭 단원 무늬 만들기', '눈송이 · 만다라 그리기', '꾸미기 놀이'],
    styles: ['무지개 색 만화경', '하얀 눈송이', '차분한 연필 선'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '중심 C 기준 좌표로 바꾼 토막 (a → b) 를 k = 0 … N−1 마다 각 k × 360° ÷ N 만큼 돌려 그린다.',
      '회전: (x, y) → (x cos θ − y sin θ, x sin θ + y cos θ). 거울을 켜면 돌리기 전에 y 를 −y 로 뒤집은 토막도 함께.',
      '토막이 추가될 때마다 그 토막만 2N 개로 그려 겹에 쌓는다. 축 수나 거울을 바꾸면 기록한 획을 처음부터 다시 그린다.',
      '점마다 색상(hue)을 조금씩 바꾸면 만화경처럼 무지개 무늬.',
    ],
    when: ['대칭 · 도형 단원 — 회전 대칭과 선대칭 차이 보여 주기', '아무렇게나 그어도 예쁜 무늬가 나오는 꾸미기 놀이'],
    avoid: ['대칭이 한 축(좌우)만 필요한 그림 — N = 1 + 거울로 충분', '획이 아주 많은 그림에서 축 수를 자주 바꾸기 — 다시 그리기가 축 수 × 2 배로 늘어난다'],
    cost: 'light',
    costNote: '토막 하나당 선 2N 개 (N = 12, 거울이면 24). 그리는 중에는 새 토막만.',
    level: 1,
    must: [
      '좌표는 중심 기준으로 바꿔 돌리고 다시 중심을 더하기',
      '거울은 돌리기 전에 y 를 뒤집기 (돌린 뒤에 뒤집으면 축이 어긋난다)',
      '획은 점 목록으로 기록 — 축 수를 바꾸면 다시 그리기',
      '대칭 축을 점선으로 보여 주기',
    ],
    done: [
      '한 번 그으면 중심 둘레로 같은 모양이 N 개(거울이면 2N 개) 동시에 그려진다',
      '대칭 축 수 1 ~ 12 를 바꾸면 이미 그린 무늬가 그 축 수로 다시 그려진다',
      '거울을 끄면 바람개비처럼 한 방향으로 도는 무늬, 켜면 눈송이처럼 좌우가 맞는 무늬',
      '오른쪽 아래에 「대칭 6 · 거울」 같은 표시',
    ],
    code: {
      lang: 'ts',
      title: '토막 하나를 회전 · 거울로 2N 개 그리기',
      from: 'demos/demosDrawTools.ts symmetry() seg() 를 정리',
      body: `type P = { x: number; y: number };
let N = 6, mirror = true;
function seg(g: CanvasRenderingContext2D, C: P, a: P, b: P, hue: number) {
  g.strokeStyle = 'hsl(' + (hue % 360) + ',78%,50%)';
  g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath();
  for (let k = 0; k < N; k++) {
    const an = (k / N) * Math.PI * 2;
    const c = Math.cos(an), s = Math.sin(an);
    for (const m of mirror ? [1, -1] : [1]) {   // 거울: 돌리기 전에 y 뒤집기
      const ax = a.x - C.x, ay = (a.y - C.y) * m;
      const bx = b.x - C.x, by = (b.y - C.y) * m;
      g.moveTo(C.x + ax * c - ay * s, C.y + ax * s + ay * c);
      g.lineTo(C.x + bx * c - by * s, C.y + bx * s + by * c);
    }
  }
  g.stroke();
}
// 그리는 중: 새 점이 오면 seg(layer, C, 앞 점, 새 점, 획 색 + 점 번호 × 0.8)
// N · 거울을 바꾸면 기록한 모든 획을 처음부터 seg 로 다시 그린다`,
    },
    pitfalls: [
      { title: '거울을 돌린 뒤에 뒤집으면 무늬가 중심에서 어긋난다', fix: '중심 기준 좌표에서 y 를 먼저 뒤집고 그 다음 돌린다.' },
      { title: '토막마다 beginPath · stroke 를 2N 번 하면 느리다', fix: '한 토막의 2N 개 선을 한 경로에 moveTo · lineTo 로 모아 stroke 한 번.' },
      { title: '축 수를 바꿨는데 이미 그린 무늬가 그대로다', fix: '획을 점 목록으로 기록해 두고, 바꿀 때 겹을 지우고 다시 그린다.' },
    ],
    prev: ['i317'],
    next: ['i319'],
  },

  i319: {
    id: 'i319',
    summary: '누르면 꼭짓점, 끌면 양쪽 대칭 곡선 손잡이를 만드는 펜 도구로 3차 베지에 곡선을 잇고, 첫 점을 누르면 닫힌 모양 · 손잡이를 끌어 고치게 한다.',
    terms: [
      { en: 'Pen tool (cubic Bézier path)', ko: '펜 도구 — 3차 베지에 곡선 잇기' },
      { en: 'Anchor point · control handle', ko: '꼭짓점 · 곡선 손잡이' },
      { en: 'Smooth (mirrored) handles', ko: '들어오는 손잡이 = 나가는 손잡이 반대쪽' },
      { en: 'bezierCurveTo', ko: '캔버스 3차 곡선 그리기' },
    ],
    goal: '{target}에 펜 도구를 넣어 줘 — 누르면 꼭짓점, 끌면 곡선 손잡이, 첫 점을 누르면 닫힌 모양, 손잡이를 끌어 고치기. 분위기는 {style}.',
    targets: ['곡선 · 함수 모양 그리기', '모양 편집기', '길 · 레일 그리기'],
    styles: ['깔끔한 디자인 도구', '연필 공책', '파란 설계도'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      web: 'SVG 의 path d="M … C …" 가 같은 3차 베지에다.',
      unity: 'Unity 는 Splines 패키지(BezierKnot · TangentIn/Out)가 같은 구조.',
      godot: 'Godot 은 Curve2D 의 add_point(위치, in, out) 이 같은 꼭짓점 · 손잡이다.',
    },
    principle: [
      '꼭짓점마다 { p, hin, hout } — 위치와 들어오는 · 나가는 손잡이. 손잡이가 위치와 같으면 뾰족한 꼭짓점.',
      '점 i 에서 i+1 까지 = bezierCurveTo(i.hout, (i+1).hin, (i+1).p). 닫힌 모양이면 마지막에서 첫 점까지 한 번 더.',
      '새 점을 누른 채 끌면 hout = 손가락, hin = 위치 기준 반대쪽 (2p − 손가락) — 매끈하게 이어진다.',
      '눌렀을 때 손잡이 · 꼭짓점 6px 안이면 그것을 끌어 고친다. 꼭짓점을 끌면 두 손잡이도 같이 옮긴다.',
      '그리는 중엔 마지막 점에서 마우스까지 점선 곡선으로 미리 보기, 첫 점 7px 안이면 닫기.',
    ],
    when: ['매끈한 곡선 · 모양을 정확히 만들고 고쳐야 할 때', '곡선 길 · 레일 · 경로 편집기'],
    avoid: ['아이들이 빠르게 그리는 놀이 — 손잡이 조작이 어렵다. 대신 부드러운 붓 선(i312)', '정확한 직선 · 각도 작도 — 스냅(i320)'],
    cost: 'light',
    costNote: '곡선 몇 개 다시 그리기 — 비용 없음.',
    level: 2,
    must: [
      '꼭짓점은 { 위치, 들어오는 손잡이, 나가는 손잡이 } 셋으로',
      '끌 때 반대 손잡이를 거울로 맞춰 매끈하게 (2 × 위치 − 손가락)',
      '누르기 판정 순서: 손잡이 → 꼭짓점 → 새 점 (손잡이가 꼭짓점에 가려 못 잡지 않게)',
      '첫 점 근처를 누르면 닫기, 닫힌 모양은 반투명 채우기',
      '손잡이 보기 끔/켬',
    ],
    done: [
      '누르기만 하면 꺾인 선, 누른 채 끌면 매끈한 곡선이 이어진다',
      '첫 점을 누르면 모양이 닫히고 색으로 채워진다',
      '손잡이 끝을 끌면 곡선 모양이 바뀌고, 꼭짓점을 끌면 손잡이와 함께 옮겨진다',
      '그리는 중 마지막 점에서 마우스까지 점선 미리 보기',
    ],
    code: {
      lang: 'ts',
      title: '꼭짓점 · 손잡이 구조와 그리기 · 끌기',
      from: 'demos/demosDrawTools.ts bezierPen() trace() · drag() 를 정리',
      body: `type P = { x: number; y: number };
type A = { p: P; hin: P; hout: P };            // 꼭짓점 + 들어오는 · 나가는 손잡이
type Path = { a: A[]; closed: boolean };

function trace(g: CanvasRenderingContext2D, path: Path) {
  const a = path.a;
  if (!a.length) return;
  g.beginPath();
  g.moveTo(a[0].p.x, a[0].p.y);
  const n = path.closed ? a.length : a.length - 1;
  for (let i = 0; i < n; i++) {
    const s = a[i], e = a[(i + 1) % a.length];
    g.bezierCurveTo(s.hout.x, s.hout.y, e.hin.x, e.hin.y, e.p.x, e.p.y);
  }
  if (path.closed) g.closePath();
}
/** kind: 새 점 · 나가는 손잡이 · 들어오는 손잡이 · 꼭짓점 */
function dragTo(kind: 'new' | 'out' | 'in' | 'anchor', a: A, p: P) {
  if (kind === 'new' || kind === 'out') {
    a.hout = { ...p };
    a.hin = { x: 2 * a.p.x - p.x, y: 2 * a.p.y - p.y };   // 반대쪽 거울 — 매끈
  } else if (kind === 'in') {
    a.hin = { ...p };
    a.hout = { x: 2 * a.p.x - p.x, y: 2 * a.p.y - p.y };
  } else {
    const dx = p.x - a.p.x, dy = p.y - a.p.y;            // 손잡이도 같이
    a.p = { x: a.p.x + dx, y: a.p.y + dy };
    a.hin = { x: a.hin.x + dx, y: a.hin.y + dy };
    a.hout = { x: a.hout.x + dx, y: a.hout.y + dy };
  }
}
// 새 점: { p, hin: p, hout: p } 로 넣고 dragTo('new', …), 첫 점 7px 안을 누르면 closed = true`,
    },
    pitfalls: [
      { title: '손잡이를 하나만 바꾸면 꼭짓점에서 곡선이 꺾인다', fix: '반대 손잡이를 2 × 위치 − 손가락으로 함께 맞춘다 (매끈한 꼭짓점).' },
      { title: '손잡이가 꼭짓점 위에 겹쳐 잡을 수 없다', fix: '누르기 판정에서 손잡이를 먼저 보고, 위치와 같은(길이 1 이하) 손잡이는 건너뛴다.' },
      { title: '닫힌 모양의 마지막 곡선이 빠진다', fix: '닫혔으면 마지막 꼭짓점 → 첫 꼭짓점 곡선까지 그리고 closePath.' },
    ],
    prev: ['i312'],
    next: ['i320'],
    refs: [{ name: 'MDN — CanvasRenderingContext2D.bezierCurveTo()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/bezierCurveTo' }],
  },

  i320: {
    id: 'i320',
    summary: '찍은 점을 다른 점 · 모눈 · 15° 각도 중 가까운 곳에 착 붙여, 대충 눌러도 반듯한 도형이 되고 변 길이 · 각도 · 넓이가 저절로 표시되게 한다.',
    terms: [
      { en: 'Snapping (grid · angle · point)', ko: '스냅 — 모눈 · 각도 · 다른 점에 붙이기' },
      { en: 'Magnet snap priority', ko: '자석 우선순위 — 점 → 모눈 → 각도' },
      { en: 'Shoelace formula', ko: '신발끈 공식 — 다각형 넓이' },
      { en: 'Rubber-band preview', ko: '고무줄 미리 보기 — 다음 변 길이' },
    ],
    goal: '{target}에 모눈 · 자석 맞춤을 넣어 줘 — 찍은 점이 다른 점 · 모눈 · 15° 각도에 착, 변 길이 · 직각 표시 · 넓이가 저절로. 분위기는 {style}.',
    targets: ['도형 작도 · 넓이 재기', '모눈종이 다각형 만들기', '평면도 · 지도 그리기'],
    styles: ['모눈종이 공책', '깔끔한 화이트보드', '파란 설계도'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 편집기의 Grid Snapping 과 같은 생각 — 게임 안에선 Mathf.Round(x / 칸) × 칸.',
      godot: 'Godot 은 Vector2.snapped(Vector2(칸, 칸)) 가 모눈 맞춤 한 줄.',
    },
    principle: [
      '자석 순서: 이미 찍은 점 8px 안 → 그 점, 아니면 모눈을 켰으면 가장 가까운 모눈점 = round((p − 원점) ÷ 칸) × 칸, 모눈을 끄면 앞 점에서의 각도를 15° 단위로 반올림.',
      '맞춰진 자리와 손이 누른 자리가 다르면 빨간 점선으로 「끌려간 길」을 0.6초 보여 준다.',
      '변마다 길이를 모눈 칸 수로 (정수에 가까우면 정수로) 변 바깥쪽에 표시. 꼭짓점 각이 90° ± 0.6 이면 직각 표시.',
      '첫 점(3점 이상일 때)을 다시 누르면 닫히고 신발끈 공식 넓이 ÷ 칸² 으로 「넓이 ○칸」.',
    ],
    when: ['작도 · 넓이 재기처럼 정확한 점이 필요한 수학 그리기', '폰 손가락처럼 정확히 누르기 어려울 때'],
    avoid: ['자유로운 그림 그리기 — 붙는 게 오히려 방해. 대신 부드러운 붓 선(i312)', '곡선 모양 — 펜 도구(i319)'],
    cost: 'light',
    costNote: '점 수십 개 비교 — 비용 없음.',
    level: 1,
    must: [
      '자석 우선순위를 정해 두기 (점 → 모눈 → 각도)',
      '모눈 밖으로 나가지 않게 칸 번호를 범위 안으로 자르기',
      '맞춰진 자리 표시 (원래 손 위치 → 붙은 자리 점선)',
      '길이는 칸 단위로, 정수 근처면 정수로 표시',
      '마우스 움직임에 따라 다음 변 고무줄 미리 보기 + 길이',
    ],
    done: [
      '대충 눌러도 점이 모눈 교차점에 착 붙고, 빨간 점선이 원래 누른 곳을 보여 준다',
      '변마다 「4」 「3」 같은 칸 길이, 직각에는 작은 네모 표시',
      '닫으면 「넓이 6칸」이 통 튀어나온다',
      '모눈을 끄면 앞 점에서 15° 단위 방향으로만 붙는다',
    ],
    code: {
      lang: 'ts',
      title: '점 · 모눈 · 각도 스냅 + 넓이',
      from: 'demos/demosDrawTools.ts snapTool() snap() 과 넓이 계산을 정리',
      body: `type P = { x: number; y: number };
const GS = 20, O = { x: 30, y: 36 }, COLS = 17, ROWS = 9;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function snap(p: P, allPts: P[], last: P | null, grid = true, angle = true): P {
  for (const q of allPts) if (dist(q, p) < 8) return { ...q };    // 1. 다른 점 자석
  if (grid) return {                                              // 2. 모눈
    x: O.x + clamp(Math.round((p.x - O.x) / GS), 0, COLS) * GS,
    y: O.y + clamp(Math.round((p.y - O.y) / GS), 0, ROWS) * GS,
  };
  if (angle && last) {                                            // 3. 15° 각도
    const a = Math.atan2(p.y - last.y, p.x - last.x);
    const s = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
    const d = dist(p, last);
    return { x: last.x + Math.cos(s) * d, y: last.y + Math.sin(s) * d };
  }
  return p;
}
/** 길이 표시: 정수 근처면 정수 */
const fmtLen = (d: number) => { const L = d / GS; return Math.abs(L - Math.round(L)) < 0.03 ? String(Math.round(L)) : L.toFixed(2); };
/** 넓이 (칸 수) — 신발끈 공식 */
function areaCells(v: P[]) {
  let A = 0;
  for (let i = 0; i < v.length; i++) { const j = (i + 1) % v.length; A += v[i].x * v[j].y - v[j].x * v[i].y; }
  return Math.abs(A) / 2 / (GS * GS);
}`,
    },
    pitfalls: [
      { title: '모눈 스냅이 먼저면 이미 찍은 점에 정확히 못 돌아간다', fix: '다른 점 자석을 가장 먼저 — 닫기 · 이어 그리기가 정확해진다.' },
      { title: '부동소수 길이 2.9999 가 그대로 보인다', fix: '정수와 0.03 안이면 정수로 표시.' },
      { title: '붙는 게 안 보이면 「내 손이 이상하다」고 느낀다', fix: '원래 누른 곳 → 붙은 자리 점선을 잠깐 보여 준다.' },
    ],
    prev: ['i315'],
    next: ['i321'],
  },

  i321: {
    id: 'i321',
    summary: '화면 위 자 · 컴퍼스 · 각도기를 손가락으로 대고 돌려 선 긋기 · 원호 그리기 · 각 재기를 하게 해, 두 원이 만나는 점으로 정삼각형을 작도한다.',
    terms: [
      { en: 'Geometric construction tools', ko: '작도 도구 — 자 · 컴퍼스 · 각도기' },
      { en: 'Compass arc (radius lock)', ko: '컴퍼스 — 반지름을 정한 뒤 고정해 돌리기' },
      { en: 'Angle unwrapping (atan2 delta)', ko: '각 변화를 −π ~ π 로 맞춰 쌓기' },
      { en: 'Point snapping', ko: '이미 있는 점에 바늘 · 끝 붙이기' },
    ],
    goal: '{target}에 자 · 컴퍼스 · 각도기 도구를 넣어 줘 — 끌어서 재고 긋기, 컴퍼스는 반지름을 정하고 돌려 원호, 각도기는 각 표시. 분위기는 {style}.',
    targets: ['작도 수업 (정삼각형 · 수직이등분선)', '각도 재기 놀이', '도형 퀴즈'],
    styles: ['진짜 문구 도구처럼', '연필 공책', '칠판'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '자: 누른 점 → 손가락까지 직선, 자 그림을 그 방향으로 돌려 놓고 길이를 cm(20px = 1cm)로 보여 준다.',
      '컴퍼스: 바늘 = 누른 점. 끌기 시작하면 반지름 = 손가락 거리, 각 변화를 −π ~ π 로 맞춰 쌓다가 0.3 라디안을 넘으면 반지름을 고정 — 그 뒤로는 각도만 따라 원 위 점을 찍는다.',
      '컴퍼스 다리는 두 다리 길이가 같은 이등변 삼각형 꼭대기(손잡이)를 √(L² − (r/2)²) 로 구해 그린다.',
      '각도기: 기준 점에서 손가락 쪽 각을 0 ~ 180° 로 (화면 y 를 뒤집어 반시계가 +). 모든 도구의 시작 · 끝은 이미 있는 점 7px 안이면 그 점에 붙는다.',
    ],
    when: ['작도 단원 — 자 · 컴퍼스로 정삼각형 · 수직이등분선', '「손으로 재 보는」 각도 · 길이 활동'],
    avoid: ['빠른 그리기 놀이 — 도구 조작이 느리다. 대신 스냅(i320)', '정확한 수치 입력이 필요한 문제 — 손 조작은 오차가 있다'],
    cost: 'light',
    costNote: '도구 그림 하나 + 기록한 선 · 원호 몇 개 — 비용 없음.',
    level: 2,
    must: [
      '컴퍼스는 「반지름 정하기 → 고정 → 돌리기」 두 단계 (계속 반지름이 바뀌면 원이 안 된다)',
      '각 변화는 −π ~ π 로 감아 쌓기 (180° 를 지날 때 튀지 않게)',
      '모든 도구의 시작 · 끝을 기존 점에 붙이기 (작도의 핵심 — 원의 교점에서 시작)',
      '자는 cm, 컴퍼스는 반지름, 각도기는 ° 숫자를 그리는 동안 보여 주기',
    ],
    done: [
      '자로 AB 를 긋고, A · B 에 컴퍼스 바늘을 대고 같은 반지름 원호 두 개를 그리면 교점 C 가 생긴다',
      'AC · BC 를 이으면 정삼각형이 되고, 각도기로 재면 60° 가 나온다',
      '컴퍼스를 끄는 동안 다리가 벌어졌다 돌아가며 「반지름 ○ cm」 가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '컴퍼스 — 반지름 정하고 고정해 돌리기',
      from: 'demos/demosDrawTools.ts instruments() drag() 의 컴퍼스 부분을 정리',
      body: `type P = { x: number; y: number };
type Op = { a: P; p: P; sweep: number; lastAng: number; r: number; trail: P[]; locked: boolean };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function compassDrag(op: Op, p0: P) {
  const ang = Math.atan2(p0.y - op.a.y, p0.x - op.a.x);
  const d = dist(p0, op.a);
  if (!op.locked) {
    if (d < 6) return;                          // 바늘 바로 옆은 무시
    if (op.r === 0) op.lastAng = ang;
    let da = ang - op.lastAng;                  // −π ~ π 로 감기
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    op.sweep += da; op.lastAng = ang; op.r = d; op.p = p0;
    if (Math.abs(op.sweep) > 0.3) {             // 충분히 돌렸으면 반지름 고정
      op.locked = true;
      const a0 = ang - op.sweep;
      for (let k = 0; k <= 8; k++) {            // 지금까지 돈 만큼 원호 채우기
        const a = a0 + (op.sweep * k) / 8;
        op.trail.push({ x: op.a.x + Math.cos(a) * op.r, y: op.a.y + Math.sin(a) * op.r });
      }
    }
  } else {                                       // 고정된 뒤엔 각도만 따른다
    const q = { x: op.a.x + Math.cos(ang) * op.r, y: op.a.y + Math.sin(ang) * op.r };
    op.trail.push(q); op.p = q;
  }
}
/** 각도기: 0 ~ 180° (화면 y 가 아래라 뒤집음) */
function angleOf(v: P, p: P) {
  let d = (Math.atan2(-(p.y - v.y), p.x - v.x) * 180) / Math.PI;
  if (d < 0) d += 360;
  return Math.min(180, d > 270 ? 0 : d);
}`,
    },
    pitfalls: [
      { title: '반지름을 계속 손가락 거리로 쓰면 찌그러진 원이 된다', fix: '0.3 라디안 돌린 순간 반지름을 고정하고, 그 뒤로는 각도만 따른다.' },
      { title: '180° 를 지날 때 각 변화가 2π 만큼 튄다', fix: '각 차이를 −π ~ π 로 감아서 쌓는다.' },
      { title: '원의 교점에서 정확히 시작할 수 없어 작도가 어긋난다', fix: '도구 시작 · 끝을 기존 점(선 끝 · 원 중심 · 이름표 점) 7px 안에 붙인다.' },
    ],
    prev: ['i320'],
    next: ['i322'],
  },

  i322: {
    id: 'i322',
    summary: '손을 떼는 순간 그은 선을 5px 간격 점 묶음으로 바꾸고, 베를레 적분 + 원래 모양 되맞추기로 단단한 물체처럼 떨어져 경사판을 굴러가게 한다.',
    terms: [
      { en: 'Drawn physics (line to rigid body)', ko: '그린 선 → 물리 물체' },
      { en: 'Verlet integration', ko: '베를레 — 지금 · 이전 위치로 속도 없이 적분' },
      { en: 'Shape matching (rigid)', ko: '모양 되맞추기 — 원래 모양을 가장 잘 맞는 각으로 돌려 덮기' },
      { en: 'Point–segment collision', ko: '점과 선분 충돌 · 밀어내기' },
    ],
    goal: '{target}에 「그린 선이 물체가 되는」 물리를 넣어 줘 — 손 떼면 선이 단단한 물체가 되어 떨어지고 경사판을 굴러가게. 분위기는 {style}.',
    targets: ['그려서 푸는 퍼즐', '그림 놀이 · 낙서 물리', '공 굴리기 장치 만들기'],
    styles: ['크레파스 스케치북', '깔끔한 만화', '칠판 분필'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 라면 선 점들로 EdgeCollider2D(열린 선)나 PolygonCollider2D(닫힌 모양) + Rigidbody2D 를 붙이면 된다.',
      godot: 'Godot 은 RigidBody2D 에 CollisionPolygon2D(닫힌) 또는 선분마다 SegmentShape2D 를 붙인다.',
    },
    principle: [
      '손을 떼면 선을 5px 간격으로 다시 찍고, 처음 · 끝이 가까우면 닫힌 모양으로. 무게중심 기준 원래 모양(rest)을 기억한다.',
      '베를레: 새 위치 = 지금 + (지금 − 이전) × 0.999 + 중력 × dt². 한 걸음 최대 3.5px 로 막아 뚫림을 줄인다. 한 프레임을 4번 나눠 돈다.',
      '각 점을 경사판 · 땅 · 벽 선분과 비교해 반지름 2.6 안이면 바깥으로 밀어내고, 이전 위치를 고쳐 미끄러짐(마찰 0.1) · 튐(0.15)을 낸다. 물체끼리는 점과 점 거리로 밀어낸다.',
      '모양 되맞추기: 무게중심을 구하고, 원래 모양을 가장 잘 맞게 돌리는 각 = atan2(Σ 외적, Σ 내적). 그 각으로 돌린 원래 모양으로 점을 덮으면 찌그러지지 않는 단단한 물체.',
    ],
    when: ['「선을 그려 공을 굴려 보내기」 같은 그려서 푸는 퍼즐 (SEVEN 레벨처럼)', '낙서가 살아 움직이는 놀이'],
    avoid: ['정확한 물리 퍼즐(쌓기 · 균형) — 점 묶음 흉내는 무게 · 회전 관성이 대략이다. 대신 planck.js 같은 강체 엔진', '물체가 수십 개 — 물체끼리 점 쌍 비교가 n² 로 늘어난다'],
    cost: 'light',
    costNote: '물체 6개까지, 점 수십 개 × 선분 5개 × 4 나눔 × 2 번. 물체끼리 점 쌍 비교가 가장 비싸다.',
    level: 2,
    must: [
      '손 뗄 때 선을 같은 간격 점으로 다시 찍기 (빠르게 그은 선도 고르게)',
      '한 프레임 여러 번 나눠 적분 + 한 걸음 최대 이동 제한 (얇은 경사판 뚫림 막기)',
      '충돌은 위치를 밀어내고 이전 위치를 고쳐 속도까지 바꾸기 (베를레 방식)',
      '매 걸음 모양 되맞추기로 원래 모양 유지',
      '물체 수 상한 · 화면 밖으로 떨어진 물체 지우기',
    ],
    done: [
      '동그라미를 그리고 손을 떼면 바퀴처럼 떨어져 경사판을 굴러 내려간다',
      '막대를 그으면 떨어져 비스듬히 미끄러지고, 세모는 툭 떨어져 구른다',
      '물체끼리 부딪히면 서로 밀어낸다',
      '물체가 찌그러지지 않고 그린 모양 그대로 돈다',
    ],
    code: {
      lang: 'ts',
      title: '베를레 한 걸음 + 모양 되맞추기',
      from: 'demos/demosDrawTools.ts lineToPhysics() step() · shapeMatch() 를 정리',
      body: `type P = { x: number; y: number };
type Body = { p: P[]; o: P[]; rest: P[] };      // 지금 · 이전 위치 · 무게중심 기준 원래 모양
const GRAV = 420;

function verlet(b: Body, dt: number) {
  for (let i = 0; i < b.p.length; i++) {
    const q = b.p[i], o = b.o[i];
    let vx = (q.x - o.x) * 0.999;
    let vy = (q.y - o.y) * 0.999 + GRAV * dt * dt;
    const v = Math.hypot(vx, vy);
    if (v > 3.5) { vx *= 3.5 / v; vy *= 3.5 / v; } // 한 걸음 최대 — 뚫림 막기
    o.x = q.x; o.y = q.y;
    q.x += vx; q.y += vy;
  }
}
/** 원래 모양을 가장 잘 맞는 각으로 돌려 덮는다 — 단단한 물체 */
function shapeMatch(b: Body) {
  const n = b.p.length;
  let cx = 0, cy = 0;
  for (const q of b.p) { cx += q.x; cy += q.y; }
  cx /= n; cy /= n;
  let sc = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const r = b.rest[i], dx = b.p[i].x - cx, dy = b.p[i].y - cy;
    sc += r.x * dx + r.y * dy;                   // 내적 합
    ss += r.x * dy - r.y * dx;                   // 외적 합
  }
  const a = Math.atan2(ss, sc), c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < n; i++) {
    const r = b.rest[i];
    b.p[i].x = cx + r.x * c - r.y * s;
    b.p[i].y = cy + r.x * s + r.y * c;
  }
}
// 프레임: dt = min(dt0, 1/30) / 4 로 4번 — verlet → (충돌 → shapeMatch) × 2`,
    },
    pitfalls: [
      { title: '빠르게 떨어지는 점이 얇은 경사판을 뚫고 지나간다', fix: '한 프레임을 4번 나누고, 한 걸음 이동을 3.5px 로 막는다.' },
      { title: '충돌 때 위치만 밀면 물체가 경사판에 붙어 미끄러지지 않거나 튄다', fix: '베를레는 이전 위치가 곧 속도 — 밀어낸 뒤 이전 위치를 고쳐 법선 · 접선 속도를 따로 줄인다 (마찰 0.1, 튐 0.15).' },
      { title: '점마다 따로 충돌하니 물체가 찌그러진다', fix: '충돌 뒤 매번 모양 되맞추기로 원래 모양을 덮는다.' },
    ],
    prev: ['i286', 'i312'],
    next: ['i287'],
  },

  i324: {
    id: 'i324',
    summary: '도형의 변을 하나씩 따로, 양 끝을 살짝 넘겨 떨리게 긋고 두 번 겹쳐 그어, 반듯한 도형을 연필로 슥슥 그린 스케치처럼 보이게 한다.',
    terms: [
      { en: 'Sketchy rendering (overshoot · double stroke)', ko: '스케치 선 — 모서리 넘침 · 두 번 긋기' },
      { en: 'Seeded hand jitter (1D noise along path)', ko: '길 따라 부드러운 잡음 떨림' },
      { en: 'Pressure taper (variable-width ribbon)', ko: '가운데 굵고 양끝 가는 띠로 한 획' },
      { en: 'Construction lines', ko: '연한 보조선 (구도 잡기)' },
    ],
    goal: '{target}을(를) 연필 스케치 선으로 그려 줘 — 변마다 따로 모서리를 살짝 넘겨 긋고 두 번 겹쳐, 연한 보조선도. 분위기는 {style}.',
    targets: ['도형 · 입체도형 그림', '그래프 · 도표 손그림', '설명 그림 전체'],
    styles: ['연필 공책 스케치', '볼펜 낙서', '깔끔한 화이트보드 손그림'],
    platforms: ['canvas', 'web', 'three'],
    platformHints: {
      web: 'SVG 라면 같은 점 계산으로 path 를 만들거나, rough.js 같은 손그림 라이브러리가 같은 일을 한다.',
      three: 'three.js 라면 캔버스로 구워 텍스처로 쓰거나, 선을 Line2(LineMaterial) 로 같은 점 목록으로 그린다.',
    },
    principle: [
      '꼭짓점이 9개 이하인 모양은 변마다 따로 떼어(explode) 긋는다 — 그래야 모서리마다 넘침이 보인다.',
      '선 양 끝을 진행 방향으로 「넘침 × (0.15 ~ 1.05)」만큼 늘린다. 닫힌 모양은 시작점을 무작위로 돌리고 끝을 첫 변 쪽으로 조금 더.',
      '1.6 간격으로 다시 찍고, 점마다 법선 방향으로 큰 잡음 + 작은 잡음 + 전체 휨(sin) 만큼 민다 — 씨앗이 같으면 늘 같은 선.',
      '한 획은 굵기가 변하는 띠: 굵기 = w × (0.32 + 0.68 × sin(π f)^0.45) — 가운데 굵고 양끝 가늘다. 끝은 반원으로 둥글게.',
      '두 번째 획은 다른 씨앗 · 0.8배 굵기 · 0.75 진하기로 겹친다. 종이 결로 군데군데 지우고(destination-out) 종이에 multiply.',
    ],
    when: ['도형 · 그래프 설명을 손으로 그린 공책 느낌으로', '스케치북 · 낙서 그림체 게임의 모든 선'],
    avoid: ['정확한 길이 · 각도를 재는 화면 — 넘침 · 떨림이 오해를 만든다. 대신 반듯한 선', '작은 아이콘 · 글씨 — 떨림이 읽기를 방해한다'],
    cost: 'light',
    costNote: '모양마다 한 번 화면 밖 캔버스에 굽고 drawImage. 굽기는 조절 값이 바뀔 때만.',
    level: 1,
    must: [
      '떨림 · 넘침은 씨앗이 정해진 난수(mulberry32) — Math.random 금지 (다시 그려도 같은 선)',
      '꼭짓점이 적은 모양은 변마다 따로 긋기 (한 경로로 이어 그으면 모서리 넘침이 안 생긴다)',
      '한 획은 굵기가 변하는 띠를 채워서 (lineWidth 하나로 긋지 않기)',
      '두 번째 획은 씨앗 · 굵기 · 진하기를 바꿔 살짝 어긋나게',
      '모양마다 미리 굽고, 조절 값이 바뀔 때만 다시 굽기',
    ],
    done: [
      '오른쪽 그림의 모서리마다 선이 살짝 넘쳐 교차하고, 선이 두 겹으로 보인다',
      '돋보기로 모서리를 확대하면 왼쪽은 딱 맞게 끝나고 오른쪽은 넘쳐 있다',
      '모서리 넘침 0 · 겹쳐 긋기 1번이면 떨리는 선 한 줄, 값을 올리면 스케치 느낌이 진해진다',
      '연한 보조선이 변 밖까지 길게 뻗어 구도를 잡은 듯 보인다',
    ],
    code: {
      lang: 'ts',
      title: '모서리 넘침 + 떨림 + 가운데 굵은 연필 획',
      from: 'demos/demosHandA.ts handPath() · pencilStroke() 를 정리 (닫힌 모양 · 잔 잡음은 줄임)',
      body: `type P = [number, number];
function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** 열린 선 한 개: 양 끝 넘침 · 법선 떨림 · 전체 휨 */
function handLine(a: P, b: P, seed: number, jit: number, over: number, step = 1.6): P[] {
  const r = mulberry(seed);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const o0 = over * (0.15 + r() * 0.9), o1 = over * (0.15 + r() * 0.9);
  const s0: P = [a[0] - ux * o0, a[1] - uy * o0], s1: P = [b[0] + ux * o1, b[1] + uy * o1];
  const LL = L + o0 + o1, n = Math.max(2, Math.ceil(LL / step) + 1);
  const bow = (r() - 0.5) * 2 * jit * 1.3, ph = r() * 10;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), s = f * LL;
    const off = jit * Math.sin(s / 24 + ph) * 0.9 + bow * Math.sin(Math.PI * f); // 견본은 1D 값 잡음 두 겹
    out.push([s0[0] + (s1[0] - s0[0]) * f - uy * off, s0[1] + (s1[1] - s0[1]) * f + ux * off]);
  }
  return out;
}
/** 가운데 굵고 양끝 가는 띠로 채우기 */
function pencilStroke(g: CanvasRenderingContext2D, p: P[], w: number) {
  const n = p.length, L: P[] = [], R: P[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const half = (w * (0.32 + 0.68 * Math.pow(Math.sin(Math.PI * (0.03 + f * 0.94)), 0.45))) / 2;
    const a = p[Math.max(0, i - 1)], c = p[Math.min(n - 1, i + 1)];
    const dl = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    const nx = -(c[1] - a[1]) / dl, ny = (c[0] - a[0]) / dl;
    L.push([p[i][0] + nx * half, p[i][1] + ny * half]); R.push([p[i][0] - nx * half, p[i][1] - ny * half]);
  }
  g.beginPath();
  [...L, ...R.reverse()].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath(); g.fill();
}
// 두 번 긋기: pass 0 → 씨앗 s, 굵기 w, 진하기 0.95 / pass 1 → 씨앗 s + 7919, 굵기 0.8w, 진하기 0.75`,
    },
    pitfalls: [
      { title: '닫힌 다각형을 한 경로로 그으면 모서리 넘침이 생기지 않는다', fix: '꼭짓점이 적은 모양은 변마다 따로 떼어 긋는다 (견본 explode — 9개 이하).' },
      { title: '두 번째 획을 같은 씨앗으로 그으면 한 줄처럼 겹쳐 버린다', fix: '씨앗을 바꾸고 굵기 0.8배 · 진하기 0.75 로 살짝 어긋나게.' },
      { title: '떨림을 점마다 따로 무작위로 주면 지글지글한 톱니가 된다', fix: '길 따라 부드럽게 변하는 1D 잡음 + 전체 휨(sin)으로 준다.' },
    ],
    prev: ['i312'],
    next: ['i323', 'i325'],
    source: [{ file: 'demosHandA.ts', symbol: 'handPath' }],
  },

  i325: {
    id: 'i325',
    summary: '면의 어둡기에 따라 빗금 겹 수를 정해 — 밝으면 한 겹, 어두울수록 방향을 바꾼 빗금이 한 겹씩 더 — 밝기를 선의 밀도로 나타내는 연필 명암.',
    terms: [
      { en: 'Hatching · cross-hatching', ko: '빗금 · 교차 빗금 명암' },
      { en: 'Tone thresholds (layered hatching)', ko: '어둡기 문턱마다 한 겹씩' },
      { en: 'Polygon scanline spans', ko: '기울인 줄로 면을 잘라 구간 구하기' },
      { en: 'Multiply compositing', ko: '겹 위에 곱하기로 얹기' },
    ],
    goal: '{target}에 연필 빗금 명암을 넣어 줘 — 어두운 면일수록 방향을 바꾼 빗금이 한 겹씩 더, 줄마다 손떨림. 분위기는 {style}.',
    targets: ['입체도형 명암 (정육면체 · 원기둥)', '설명 그림 그림자', '판화 · 펜화 느낌 장면'],
    styles: ['연필 공책', '펜 잉크 스케치', '옛 책 삽화'],
    platforms: ['canvas', 'three', 'web'],
    platformHints: {
      three: 'three.js 라면 빗금 텍스처 여러 장(TAM)을 밝기로 섞는 셰이더나, 화면 공간 빗금 후처리로 같은 생각을 한다.',
      web: 'SVG 라면 같은 계산으로 line 요소들을 만들고 clipPath 로 면 안에만.',
    },
    principle: [
      '면마다 어둡기 tone(0 ~ 1)이 있다. 문턱 [0.04, 0.32, 0.56, 0.76] 을 넘을 때마다 한 겹 — 가장 어두운 면은 4겹.',
      '겹마다 방향이 다르다: 45° → −45° → 0° → 90°. 교차를 끄면 모두 45° 로, 겹마다 간격을 1 / (1 + 0.8k) 로 좁혀 반 칸씩 엇갈린다.',
      '면을 그 각도로 돌린 좌표에서 간격마다 가로줄로 잘라 왼쪽 · 오른쪽 끝을 구한다(spans) — 볼록 다각형이면 줄 하나 = 구간 하나.',
      '줄마다 시작 · 끝을 안팎으로 조금씩 흔들고(−0.3 ~ 0.6 간격), 가운데를 살짝 휘게 2차 곡선으로, 진하기 0.5 ~ 0.95 · 굵기도 조금씩 다르게.',
      '겹마다 미리 구워 multiply 로 얹는다. 겹이 하나씩 쌓이는 순서를 보여 주면 원리가 바로 보인다.',
    ],
    when: ['입체도형의 밝은 면 · 어두운 면을 손그림으로', '흑백 펜 · 연필 그림체'],
    avoid: ['아주 작은 면 · 둥근 면이 많은 그림 — 빗금이 잘게 끊긴다. 대신 점묘(i331)나 연한 칠', '색이 중요한 그림 — 빗금은 명암만 말한다'],
    cost: 'light',
    costNote: '겹마다 한 번 굽기 (면 수 × 줄 수). 그 뒤 drawImage 4번.',
    level: 2,
    must: [
      '겹 수는 어둡기 문턱으로 (밝기 = 선 밀도)',
      '겹마다 각도를 바꿔 교차, 교차를 끄면 같은 방향으로 촘촘히',
      '줄 끝 · 가운데를 씨앗 난수로 흔들어 손으로 그은 느낌 (Math.random 금지)',
      '면 밖으로 너무 삐져나가지 않게 줄 끝 흔들림은 간격 크기 정도로',
      '겹마다 미리 굽고 multiply 로 얹기',
    ],
    done: [
      '정육면체의 밝은 윗면은 빗금 한 겹, 옆면은 두 겹, 가장 어두운 면은 네 방향이 교차한다',
      '왼쪽 회색 명암과 나란히 보면 밝기 순서가 같다',
      '빗금 간격 슬라이더로 촘촘 ↔ 성김, 교차 빗금을 끄면 한 방향 줄이 촘촘해진다',
      '겹이 하나씩 쌓이는 동안 오른쪽 위 「○겹」 표시가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '면을 기울인 줄로 자르기 + 어둡기 겹 빗금',
      from: 'demos/demosHandA.ts spans() · bakeHatchLayer() 를 정리',
      body: `type P = [number, number];
const HATCH_TH = [0.04, 0.32, 0.56, 0.76];                   // 이 어둡기를 넘으면 겹 하나 더
const HATCH_ANG = [Math.PI / 4, -Math.PI / 4, 0, Math.PI / 2];

/** 볼록 다각형을 각도 ang 의 줄로 gap 간격 자른 구간들 */
function spans(pts: P[], ang: number, gap: number): [P, P][] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const rp = pts.map((p): P => [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]);
  const ys = rp.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const out: [P, P][] = [];
  for (let y = y0 + gap * 0.5; y < y1; y += gap) {
    let xa = Infinity, xb = -Infinity;
    for (let i = 0; i < rp.length; i++) {
      const a = rp[i], b = rp[(i + 1) % rp.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const x = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        xa = Math.min(xa, x); xb = Math.max(xb, x);
      }
    }
    if (xb > xa) { const back = (x: number): P => [x * c - y * s, x * s + y * c]; out.push([back(xa), back(xb)]); }
  }
  return out;
}
/** 겹 k 하나: 어둡기가 문턱을 넘는 면에만 */
function hatchLayer(g: CanvasRenderingContext2D, fills: { pts: P[]; tone: number }[], k: number, gap: number, r: () => number) {
  const ang = HATCH_ANG[k], ca = Math.cos(ang), sa = Math.sin(ang);
  g.strokeStyle = '#2c2a35'; g.lineCap = 'round';
  for (const f of fills) {
    if (f.tone <= HATCH_TH[k]) continue;
    for (const [a, b] of spans(f.pts, ang, gap)) {
      const i0 = (r() * 0.9 - 0.3) * gap * 1.4, i1 = (r() * 0.9 - 0.3) * gap * 1.4; // 끝 흔들기
      const x0 = a[0] + ca * i0, y0 = a[1] + sa * i0, x1 = b[0] - ca * i1, y1 = b[1] - sa * i1;
      const bend = (r() - 0.5) * gap * 0.5;
      g.globalAlpha = 0.5 + r() * 0.45;
      g.lineWidth = 0.42 + r() * 0.35;
      g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 - sa * bend, (y0 + y1) / 2 + ca * bend, x1, y1);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}`,
    },
    pitfalls: [
      { title: '모든 면에 같은 빗금을 깔면 명암이 안 생긴다', fix: '어둡기 문턱마다 겹을 하나씩 — 겹 수가 곧 어둡기.' },
      { title: '줄을 자로 그은 듯 반듯하면 기계 무늬처럼 보인다', fix: '줄 끝 · 휨 · 진하기 · 굵기를 씨앗 난수로 조금씩 다르게.' },
      { title: 'spans 를 오목한 모양에 쓰면 오목한 틈까지 줄이 건너간다', fix: '견본 spans 는 볼록 다각형용(왼쪽 끝 · 오른쪽 끝만). 오목한 모양은 볼록 조각으로 나누거나 clip 으로 자른다.' },
    ],
    prev: ['i324'],
    next: ['i326', 'i331'],
    refs: [{ name: 'Wikipedia — Hatching', url: 'https://en.wikipedia.org/wiki/Hatching' }],
  },

  i326: {
    id: 'i326',
    summary: '면을 기울인 줄로 잘라 왔다 갔다 이어 한 줄 지그재그로 칠하고, 끝이 테두리를 살짝 삐져나가게 해, 색연필로 낙서하듯 칠한 느낌을 낸다.',
    terms: [
      { en: 'Scribble fill (zigzag hatching)', ko: '지그재그 칠하기 — 한 줄로 왔다 갔다' },
      { en: 'Boustrophedon path', ko: '밭갈이 길 — 줄마다 방향을 바꿔 잇기' },
      { en: 'Polyline reveal (draw up to length)', ko: '길이만큼만 그려 칠해지는 애니메이션' },
      { en: 'Pattern stroke (canvas pattern)', ko: '종이 결 무늬를 붓 색으로' },
    ],
    goal: '{target}을(를) 지그재그 낙서 칠로 채워 줘 — 면을 한 줄로 왔다 갔다, 끝이 테두리를 살짝 넘고, 칠해지는 순서가 보이게. 분위기는 {style}.',
    targets: ['색칠 영역 · 도형', '막대그래프 막대', '아이 그림 색칠'],
    styles: ['색연필 낙서', '크레파스 동화책', '볼펜 공책'],
    platforms: ['canvas', 'web'],
    platformHints: {
      web: 'SVG 라면 같은 점 목록으로 polyline 을 만들고 stroke-dasharray · dashoffset 으로 칠해지는 애니메이션.',
    },
    principle: [
      '면마다 칠 방향 각도를 무작위로 고른다 (±0.45 ~ 0.95 라디안). 그 각도로 간격(기본 0.022)마다 잘라 줄 구간들을 구한다.',
      '줄 i 의 끝 B → 다음 줄 시작 A2 → … 로 이어 한 줄을 만든다. 끝점은 줄 방향으로 「삐져나감 × 간격」만큼 앞뒤로 흔든다 — 테두리를 넘거나 못 미친다.',
      '각 이음 사이 가운데에 옆으로 휜 점을 하나 끼워 꺾이는 곳이 뾰족한 손 낙서처럼.',
      '만든 길의 누적 길이를 들고, 시간에 따라 「여기까지만」 그리면 칠해지는 모습이 보인다. 선 색은 종이 결을 뺀 색 무늬 패턴, multiply.',
    ],
    when: ['아이 그림 · 색연필 그림체의 면 칠', '막대그래프 같은 단순한 면을 손으로 칠한 느낌으로'],
    avoid: ['오목하거나 구멍 난 면 — 견본 spans 는 볼록 다각형만. 대신 볼록 조각으로 나누기', '넓은 배경 전체 — 줄이 너무 많아진다. 대신 수채(i327)나 결 칠(i330)'],
    cost: 'light',
    costNote: '면마다 길을 한 번 만들어 캐시. 그리기는 길 하나 stroke — 가볍다.',
    level: 1,
    must: [
      '면마다 한 줄로 이어진 길 (줄마다 따로 그으면 낙서 느낌이 안 난다)',
      '줄 끝을 테두리 기준으로 앞뒤로 흔들어 삐져나가게',
      '길은 단위 좌표로 한 번 만들어 캐시, 화면 크기에 맞춰 곱하기만',
      '칠해지는 순서 애니메이션 (누적 길이까지만 그리기)',
      '테두리 연필 선은 칠 위에 따로 얹기',
    ],
    done: [
      '면이 색연필로 왔다 갔다 칠한 한 줄로 채워지고, 끝이 테두리를 조금씩 넘는다',
      '칠이 한쪽 끝부터 차례로 그려지는 모습이 보인다',
      '줄 간격 · 삐져나감 슬라이더, 「다시 칠하기」로 다른 낙서',
      '선 색에 종이 결 틈이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '면을 지그재그 한 줄로',
      from: 'demos/demosHandA.ts zigzag() 를 정리 (spans 는 i325 와 같음)',
      body: `type P = [number, number];
declare function spans(pts: P[], ang: number, gap: number): [P, P][]; // i325 의 볼록 다각형 줄 자르기

function zigzag(pts: P[], r: () => number, gap: number, over: number): P[] {
  const ang = (r() < 0.5 ? 1 : -1) * (0.45 + r() * 0.5);   // 칠 방향
  const rows = spans(pts, ang, gap);
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const out: P[] = [];
  rows.forEach(([a, b], i) => {
    const eb = (r() - 0.35) * gap * over * 1.6;              // 끝이 넘거나 못 미침
    const A: P = i === 0 ? a : out[out.length - 1];
    const B: P = [b[0] + ca * eb, b[1] + sa * eb];
    const bend = (r() - 0.5) * gap * 1.2;
    if (i === 0) out.push(A);
    out.push([(A[0] + B[0]) / 2 - sa * bend, (A[1] + B[1]) / 2 + ca * bend]); // 가운데 휜 점
    out.push(B);
    const nx = rows[i + 1];
    if (nx) {                                                 // 다음 줄 시작으로 되돌아감
      const ea2 = (r() - 0.35) * gap * over * 1.6;
      const A2: P = [nx[0][0] - ca * ea2, nx[0][1] - sa * ea2];
      const bend2 = (r() - 0.5) * gap * 1.2;
      out.push([(B[0] + A2[0]) / 2 - sa * bend2, (B[1] + A2[1]) / 2 + ca * bend2]);
      out.push(A2);
    }
  });
  return out;
}
// 그리기: lineWidth = 그림 크기 × 0.013, lineJoin · lineCap round, multiply,
// 누적 길이 len 까지만 lineTo (끝 토막은 비율로 잘라) — 칠해지는 애니메이션`,
    },
    pitfalls: [
      { title: '줄마다 따로 그으면 줄무늬 무늬일 뿐 낙서처럼 안 보인다', fix: '줄 끝 → 다음 줄 시작으로 이어 한 줄 길로 만든다.' },
      { title: '끝을 테두리에 딱 맞추면 기계로 칠한 듯하다', fix: '끝을 줄 방향으로 앞뒤로 흔들어 조금씩 삐져나가게 (견본 −0.35 ~ 0.65 × 간격 × 넘침).' },
      { title: '매 프레임 길을 새로 만들면 낙서가 바뀌어 번쩍인다', fix: '씨앗 난수로 한 번 만들어 캐시하고, 「다시 칠하기」 때만 씨앗을 바꾼다.' },
    ],
    prev: ['i325'],
    next: ['i330', 'i329'],
  },

  i327: {
    id: 'i327',
    summary: '면 둘레를 여러 번 잘게 흔든 반투명 다각형을 수십 겹 쌓고 가장자리만 짙게 해, 물감이 종이에 스며 경계가 짙어지고 겹치면 진해지는 수채화를 만든다.',
    terms: [
      { en: 'Watercolor simulation (layered polygon deformation)', ko: '여러 겹 흔들린 다각형 수채 — Tyler Hobbs 방식' },
      { en: 'Recursive midpoint displacement', ko: '변 가운데 점을 가우스로 밀어 쪼개기를 되풀이' },
      { en: 'Edge darkening (blur subtract)', ko: '가장자리 짙게 — 흐린 겹을 빼 테두리 고리' },
      { en: 'Multiply blending', ko: '곱하기 — 겹친 곳이 진해짐' },
    ],
    goal: '{target}을(를) 수채화로 칠해 줘 — 흔들린 반투명 다각형을 여러 겹 쌓아 번지게, 가장자리는 짙게, 겹친 곳은 진하게. 분위기는 {style}.',
    targets: ['그림책 배경', '지도 · 섬 색칠', '설명 그림의 면'],
    styles: ['맑은 수채 그림책', '파스텔 동화', '빛바랜 옛 지도'],
    platforms: ['canvas', 'web', 'three'],
    platformHints: {
      three: 'three.js 라면 캔버스로 구운 수채 그림을 텍스처로 쓴다 (실시간 계산은 무겁다).',
    },
    principle: [
      '면의 점을 16개쯤으로 줄이고 중심 쪽으로 0.965 배 당겨 종이 흰 틈이 남게 한다.',
      '흔들기(deform): 변마다 가운데 점을 끼우고, 변 길이 × 번짐 × 가우스 난수만큼 옆으로(앞뒤로는 0.3 배) 민다. 이걸 2 ~ 3번 되풀이하면 점 수가 4 ~ 8 배로 늘며 번진 가장자리가 된다.',
      '기본 모양을 한 번 흔든 뒤, 그것을 다시 매번 다르게 3번 흔든 다각형을 26겹 — 겹마다 투명도 0.055 ~ 0.075 로 채운다. 많이 겹친 가운데는 진하고 가장자리는 들쭉날쭉 옅다.',
      '가장자리 짙게: 칠한 겹에서 흐리게 한 같은 겹을 destination-out 으로 빼면 안쪽 테두리 고리만 남는다. 그 고리를 더 짙은 색으로 칠해 두 번 얹는다.',
      '면마다 종이 결로 조금 지우고 multiply 로 종이에 얹어 겹친 면이 진해진다.',
    ],
    when: ['그림책 · 동화 배경, 지도 색칠', '정지 화면 — 한 번 구워 두고 오래 보여 주는 그림'],
    avoid: ['매 프레임 모양이 바뀌는 것 — 겹 26장 × 수백 점이라 실시간은 무겁다. 대신 한 번 구운 그림을 움직이기', '작고 또렷해야 하는 UI'],
    cost: 'medium',
    costNote: '면 하나 = 다각형 26겹 × 점 수백 개 + 흐림 필터 2번. 한 번 구우면 drawImage 뿐 — 구울 때 폰에서 수십 ms.',
    level: 2,
    must: [
      '흔들기는 가우스 난수(균등 난수 넷 더하기)로 — 균등 난수는 가장자리가 톱니 같다',
      '기본 모양을 먼저 흔들고, 겹마다 그것을 다시 다르게 흔들기 (두 단계)',
      '겹 투명도는 아주 낮게(0.05 ~ 0.08), 겹 수는 20 ~ 40',
      '가장자리 짙게는 흐린 겹 빼기로 안쪽 고리만',
      '한 번 굽고 캐시 — 조절 값이 바뀔 때만 다시',
    ],
    done: [
      '면 가장자리가 들쭉날쭉 번지고, 테두리 안쪽이 살짝 짙은 고리가 보인다',
      '두 색 면이 겹친 곳은 더 진하고 섞인 색이 된다',
      '번짐 슬라이더를 올리면 가장자리가 더 크게 흔들리고, 겹 수를 줄이면 옅고 거칠어진다',
      '「가장자리 짙게」 끔/켬 차이가 보인다',
    ],
    code: {
      lang: 'ts',
      title: '가우스 가운데 점 밀기 · 여러 겹 쌓기',
      from: 'demos/demosHandA.ts deform() · bakeWater() 를 정리',
      body: `type P = [number, number];
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) * 0.866; // 대략 정규분포

/** 변마다 가운데 점을 끼워 옆으로 민다 — depth 번 되풀이 */
function deform(pts: P[], depth: number, vr: number, r: () => number): P[] {
  let cur = pts;
  for (let d = 0; d < depth; d++) {
    const nx: P[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      const gn = gauss(r) * len * vr, ga = gauss(r) * len * vr * 0.3;
      nx.push(a, [(a[0] + b[0]) / 2 - uy * gn + ux * ga, (a[1] + b[1]) / 2 + ux * gn + uy * ga]);
    }
    cur = nx;
  }
  return cur;
}
/** 면 하나를 수채로 (lg = 그 면 전용 겹) */
function waterFill(lg: CanvasRenderingContext2D, base0: P[], color: string, r: () => number, spread = 1, layers = 26) {
  const base = deform(base0, 2, 0.16 * spread, r);         // 1단계: 기본 모양
  lg.fillStyle = color;
  for (let i = 0; i < layers; i++) {
    const poly = deform(base, 3, 0.13 * spread, r);         // 2단계: 겹마다 다르게
    lg.globalAlpha = 0.055 + 0.02 * r();
    lg.beginPath();
    poly.forEach(([x, y], k) => (k ? lg.lineTo(x, y) : lg.moveTo(x, y)));
    lg.closePath(); lg.fill();
  }
  lg.globalAlpha = 1;
}
// 가장자리 짙게: 같은 겹을 복사 → filter blur 로 흐린 겹을 destination-out → 남은 고리를
// source-in 으로 짙은 색 → 원래 겹에 두 번 얹기. 마지막에 종이에 multiply.`,
    },
    pitfalls: [
      { title: '한 겹만 진하게 칠하면 수채가 아니라 색종이 같다', fix: '아주 옅은 겹(0.05 ~ 0.08)을 26장쯤 — 겹이 많은 가운데가 진하고 가장자리가 들쭉날쭉.' },
      { title: '겹마다 처음 모양부터 크게 흔들면 면이 퍼져 모양을 잃는다', fix: '기본 모양을 한 번 흔든 것에서 겹마다 작게 다시 흔든다 (0.16 → 0.13).' },
      { title: '매 프레임 굽으면 폰이 멈춘다', fix: '한 번 구워 캐시하고 drawImage 만. 마르는 연출은 구운 그림에 흐림 · 투명도만 바꾼다.' },
      { title: 'ctx.filter 가 안 되는 브라우저에선 가장자리 고리가 사라진다', fix: '흐림 없이도 겹 쌓기만으로 괜찮게 보이는지 확인해 둔다.' },
    ],
    prev: ['i313'],
    next: ['i329', 'i330'],
    refs: [{ name: 'Tyler Hobbs — A Guide to Simulating Watercolor Paint with Generative Art', url: 'https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art' }],
  },

  i328: {
    id: 'i328',
    summary: '붓 길을 따라 굵기가 들어갈 때 꾹 · 몸통 · 빠질 때 가늘게 변하는 띠로 먹을 칠하고, 붓털 34가닥을 마를수록 끊기게 그어, 먹 붓의 압력과 갈필을 낸다.',
    terms: [
      { en: 'Ink brush stroke (sumi-e)', ko: '먹 붓 — 수묵화 붓선' },
      { en: 'Pressure profile (entry · body · tail)', ko: '들어갈 때 · 몸통 · 빠질 때 굵기 곡선' },
      { en: 'Dry brush (bristle gaps)', ko: '갈필 — 마른 붓털이 갈라져 흰 틈' },
      { en: 'Ink bleed (blur halo)', ko: '먹 번짐 — 한지에 스민 흐린 테' },
    ],
    goal: '{target}을(를) 먹 붓으로 그려 줘 — 꾹 눌러 굵게 시작해 가늘게 빠지고, 마른 붓끝은 결이 갈라지고, 한지에 먹이 살짝 번지게. 분위기는 {style}.',
    targets: ['붓글씨 · 제목 연출', '수묵화 풍 장면', '한국 전통 게임 그림'],
    styles: ['한지 위 수묵화', '힘찬 붓글씨', '옅은 담묵'],
    platforms: ['canvas', 'web'],
    principle: [
      '붓 길을 0.9 간격으로 다시 찍는다. 진행 f(0 ~ 1)마다 굵기 = 들어감(f < 0.07 에서 꾹 부풀기) × 몸통(0.8 ~ 1.06 잡음) × 빠짐(f > 0.62 부터 (1−f)/0.38 의 0.75 제곱으로 가늘게).',
      '「붓 압력 차이」 press 로 이 곡선을 얼마나 쓸지 섞는다 — 0 이면 같은 굵기 선.',
      '번짐: 몸통 띠를 흐림 필터 · 0.18 ~ 0.48 투명도로 먼저 깐다.',
      '몸통: 3점마다 사각 조각을 darken 으로 겹쳐 칠하고, 끝으로 갈수록 먹이 말라 옅어지게 색을 밝힌다.',
      '붓털 34가닥: 붓 폭 안에 가닥마다 자리를 두고 길을 따라 긋되, 「마름 × (0.05 + 1.1 f² + 바깥 가닥일수록 더)」보다 잡음이 크면 끊는다 — 끝 · 가장자리부터 갈라진다.',
    ],
    when: ['한국 전통 · 붓글씨 연출', '제목 글씨나 획이 적은 그림을 힘 있게'],
    avoid: ['실시간으로 손가락 따라 그리기 — 획마다 붓털 34가닥 × 수백 점이라 무겁다. 대신 굵기 곡선만 쓰고 붓털은 손 뗀 뒤 굽기', '작은 글씨 — 갈필 틈이 획을 끊는다'],
    cost: 'medium',
    costNote: '획 하나 = 몸통 조각 수백 개 + 붓털 34가닥 × 점 수백 + 흐림 1번. 미리 구우면 drawImage 뿐.',
    level: 3,
    must: [
      '굵기는 들어감 · 몸통 · 빠짐 세 부분 곱 (한 가지 사인 곡선으로 하지 않기)',
      '갈필은 붓털 가닥을 잡음 문턱으로 끊기 — 끝으로 갈수록 · 바깥 가닥일수록 더 끊기게',
      '몸통은 darken 으로 겹쳐 이음새 없이',
      '먹 번짐은 몸통 아래 먼저, 옅게',
      '한 번 굽고, 그려지는 연출은 굵은 가면 선을 길이만큼 그려 source-in 으로 보이기',
    ],
    done: [
      '획이 꾹 눌러 시작해 굵게 가다가 붓끝으로 가늘게 빠진다',
      '갈필을 올리면 획 끝 · 가장자리가 붓털 결로 갈라져 흰 틈이 생긴다',
      '먹 번짐을 올리면 획 둘레에 흐린 먹 테가 번진다',
      '붓 압력 차이 0 이면 같은 굵기 선이 된다',
    ],
    code: {
      lang: 'ts',
      title: '붓 굵기 곡선 · 갈필 붓털 끊기',
      from: 'demos/demosHandA.ts brushStroke() 를 정리',
      body: `const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** f = 0 ~ 1 진행, noise = 길 따라 0 ~ 1 잡음 */
function brushWidth(f: number, noise: number, Wmax: number, press: number) {
  const entry = f < 0.07 ? 0.82 + 0.35 * Math.sin((f / 0.07) * Math.PI) : 1; // 꾹 대기
  const body = 0.8 + 0.26 * noise;                                          // 몸통 흔들림
  const tail = f > 0.62 ? Math.pow(clamp01((1 - f) / 0.38), 0.75) : 1;      // 붓끝 빠짐
  const prof = entry * body * Math.max(0.05, tail);
  return Wmax * (1 - press + press * prof);                                // press 0 = 같은 굵기
}
/** 붓털 k (0 ~ M-1) 가 자리 i 에서 보이나 — 마를수록 · 끝일수록 · 바깥일수록 끊김 */
function bristleVisible(k: number, M: number, f: number, n: number, dry: number, ink: number) {
  const off = k / (M - 1) - 0.5;                 // −0.5 ~ 0.5 붓 폭 안 자리
  const edgeK = Math.abs(off) * 2;
  const gapT = dry * (0.05 + 1.1 * f * f + edgeK * edgeK * 0.6) - (ink - 0.75) * 0.5;
  return n <= 1 - gapT;
}
/** 몸통 색: 끝으로 갈수록 먹이 말라 옅어짐 (v 0 = 검정) */
function inkColor(f: number, dry: number, noise: number) {
  const v = 0.07 + 0.88 * dry * smooth(0, 1, f) * (0.7 + 0.3 * noise);
  return 'rgb(' + Math.round(v * 250 + 6) + ',' + Math.round(v * 238 + 5) + ',' + Math.round(v * 220 + 4) + ')';
}
// 그리기 순서: 번짐(blur, alpha 0.18 + bleed × 0.3) → 몸통 조각(darken, 3점마다) →
// 붓털 34가닥(굵기 Wmax / 34 × 1.1 ~ 2, 보이는 구간만 lineTo, 끊기면 moveTo)`,
    },
    pitfalls: [
      { title: '굵기를 sin 하나로 주면 붓이 아니라 나뭇잎 모양이 된다', fix: '들어갈 때 꾹 · 몸통 · 빠질 때 가늘게 세 부분으로 나눈다 (빠짐은 62% 지점부터).' },
      { title: '갈필을 아무 데나 무작위로 끊으면 점선처럼 보인다', fix: '길 따라 부드러운 잡음 + 끝 · 바깥 가닥일수록 높은 문턱 — 붓털 결 따라 길게 갈라진다.' },
      { title: '몸통 조각을 source-over 로 겹치면 이음새가 진하게 보인다', fix: 'darken 으로 겹쳐 겹친 곳이 더 진해지지 않게.' },
    ],
    prev: ['i312', 'i324'],
    next: ['i329'],
  },

  i329: {
    id: 'i329',
    summary: '마커 · 형광펜 줄을 곱하기(multiply) 혼합으로 그어, 겹친 줄은 더 진해지고 아래 인쇄 선 · 글씨는 가려지지 않고 비쳐 보이게 한다.',
    terms: [
      { en: 'Multiply blend mode', ko: '곱하기 혼합 — 아래 색 × 위 색' },
      { en: 'Highlighter / marker stroke', ko: '형광펜 · 마커 줄' },
      { en: 'Clip to hand-drawn boundary', ko: '손으로 따라 그은 테두리 안에만' },
      { en: 'Ink pooling', ko: '펜을 댄 곳에 잉크가 살짝 고임' },
    ],
    goal: '{target}에 마커 · 형광펜 줄을 넣어 줘 — 곱하기 혼합으로 겹친 줄이 진하고 아래 글씨가 비치게, 줄이 하나씩 쓱 그어지게. 분위기는 {style}.',
    targets: ['중요 표시 · 밑줄', '공책 필기 · 정답 표시', '면 색칠 (마커 칠)'],
    styles: ['형광펜 공부 노트', '색 마커 일러스트', '깔끔한 하얀 종이'],
    platforms: ['canvas', 'web', 'three'],
    platformHints: {
      web: 'CSS 는 mix-blend-mode: multiply 로 같은 효과 (글씨 위에 반투명 형광 띠).',
      three: 'three.js 는 material.blending = THREE.MultiplyBlending (premultipliedAlpha 와 함께).',
    },
    principle: [
      '곱하기: 결과 = 아래 색 × 위 색 (0 ~ 1). 흰 종이 위는 펜 색 그대로, 검은 글씨 위는 검정 그대로 — 그래서 글씨가 가려지지 않는다.',
      '같은 펜 줄이 두 번 겹치면 펜 색² 이 되어 더 진하다. 노랑 위 분홍은 둘이 섞인 주황빛.',
      '덮어 칠하기(source-over)는 위 색이 아래를 가린다 — 왼쪽 비교 그림에서 글씨가 사라진다.',
      '면을 마커로 칠할 땐 면을 기울인 줄로 잘라 줄마다 끝을 조금 넘기고, 손으로 따라 그은 듯 살짝 큰 테두리 안으로 clip 한다. 펜을 댄 시작점엔 잉크 고임 타원(투명도 0.18).',
    ],
    when: ['중요 표시 · 밑줄 · 정답 형광펜', '마커로 칠한 일러스트 느낌'],
    avoid: ['어두운 바탕 — 곱하기는 더 어둡게만 해서 안 보인다. 대신 screen 이나 lighter', '불투명하게 덮어야 하는 칠 — 그냥 source-over'],
    cost: 'light',
    costNote: '혼합 모드만 바꾼 stroke — 비용 차이 거의 없음.',
    level: 1,
    must: [
      'globalCompositeOperation = multiply 로 줄 긋기 (끝나면 source-over 로 되돌리기)',
      '줄 끝은 lineCap butt — 형광펜처럼 네모난 끝',
      '줄을 하나씩 쓱 그어지게 (시작에서 끝으로 늘이기)',
      '면 칠은 손으로 따라 그은 테두리 안으로 clip',
      '덮어 칠하기와 나란히 비교',
    ],
    done: [
      '오른쪽은 형광 줄 아래 글씨 · 선이 그대로 비치고, 왼쪽(덮어 칠하기)은 가려진다',
      '노랑 · 분홍 형광펜이 겹친 곳이 섞인 진한 색이 된다',
      '마커 줄끼리 겹친 곳이 줄무늬처럼 더 진하다',
      '잉크 진하기 · 줄 간격 슬라이더로 겹침 정도가 바뀐다',
    ],
    code: {
      lang: 'ts',
      title: '곱하기 혼합 형광펜 줄 (쓱 그어지게)',
      from: 'demos/demosHandA.ts i329 panel() 의 형광펜 · 마커 부분을 정리',
      body: `type P = [number, number];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** t0 초에 시작해 0.35초 동안 a → b 로 그어지는 형광펜 */
function highlight(g: CanvasRenderingContext2D, a: P, b: P, color: string, width: number,
                   tc: number, t0: number, ink = 0.85, multiply = true) {
  const f = clamp01((tc - t0) / 0.35);
  if (f <= 0) return;
  g.save();
  g.globalCompositeOperation = multiply ? 'multiply' : 'source-over'; // 겹치면 진하게 · 글씨 비침
  g.globalAlpha = (multiply ? ink : 1) * 0.9;
  g.strokeStyle = color;
  g.lineCap = 'butt';                          // 형광펜 네모 끝
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f);
  g.stroke();
  if (multiply) {                              // 펜을 댄 곳 잉크 고임
    g.globalAlpha = ink * 0.18;
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(a[0], a[1], width * 0.22, width * 0.48, Math.atan2(b[1] - a[1], b[0] - a[0]), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
// 글씨를 먼저 그리고 그 위에: highlight(g, [x0, y], [x1, y], '#ffe94d', 글자 크기 × 1.05, tc, 2.7)
//                         highlight(g, [x2, y + 1], [x3, y + 1], '#ff8cc6', …, tc, 3.1)`,
    },
    pitfalls: [
      { title: '형광펜을 source-over 로 그으면 아래 글씨가 가려진다', fix: 'multiply 로 — 흰 곳만 물들고 검은 글씨는 그대로 비친다.' },
      { title: '어두운 배경에서 곱하기 줄이 안 보인다', fix: '곱하기는 밝은 종이용. 어두운 화면이면 screen · lighter 를 쓴다.' },
      { title: '혼합 모드를 되돌리지 않아 다음 그림까지 곱해진다', fix: 'save · restore 로 감싸거나 끝나면 source-over 로 되돌린다.' },
    ],
    prev: ['i326'],
    next: ['i330'],
    refs: [{ name: 'MDN — globalCompositeOperation', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' }],
  },

  i330: {
    id: 'i330',
    summary: '칠한 겹의 알파를 종이 결 높낮이 지도와 비교해 골짜기만 비게 해, 크레파스 · 색연필 색이 군데군데 하얗게 빠지고 세게 누를수록 메워지는 질감을 낸다.',
    terms: [
      { en: 'Paper tooth texture', ko: '종이 이 — 종이 결의 높낮이' },
      { en: 'Height-threshold alpha mask', ko: '결 높이가 문턱보다 낮은 곳의 색 지우기' },
      { en: 'Pressure-dependent threshold', ko: '누르는 힘이 셀수록 문턱이 낮아짐' },
      { en: 'Tileable noise field', ko: '이음새 없이 반복되는 잡음 256×256' },
    ],
    goal: '{target}에 색연필 · 크레파스 결 질감을 넣어 줘 — 종이 결 골짜기엔 색이 안 묻어 하얗게 비고, 세게 누를수록 메워지게. 분위기는 {style}.',
    targets: ['아이 그림 느낌 색칠', '스케치북 게임 그림', '크레파스 제목 글씨'],
    styles: ['크레파스 동화책', '색연필 스케치북', '분필 칠판'],
    platforms: ['canvas', 'three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 는 종이 결 텍스처를 셰이더에서 읽어 smoothstep(문턱 − 부드러움, 문턱 + 부드러움, 결) 로 알파를 깎는다 (onBeforeCompile 이나 ShaderMaterial).',
      unity: 'Unity 는 Shader Graph 에서 결 텍스처 × Step/Smoothstep 으로 알파 클립.',
      godot: 'Godot 은 CanvasItem 셰이더에서 같은 smoothstep 으로 ALPHA 를 줄인다.',
    },
    principle: [
      '종이 결 지도: 256×256 이음새 없는 잡음 두 겹 + 픽셀 잡음 — 값이 높으면 종이 산, 낮으면 골짜기. 한 번 만들어 모든 그림이 같이 쓴다.',
      '면을 줄로 칠한 겹을 다 그린 뒤, 픽셀마다 결 값 tv 와 문턱 th 를 smoothstep(th − soft, th + soft, tv) 로 비교해 알파에 곱한다 — 골짜기는 색이 빠진다.',
      '누르는 힘 p 가 셀수록 문턱이 낮아진다: 크레파스 th = 0.55 − 0.55p, 색연필 th = 0.7 − 0.4p. 세게 누르면 골짜기까지 메워진다.',
      '크레파스는 덜 겹친(옅은) 곳일수록 골짜기를 더 건너뛰게 tv + (알파 − 1) × 0.95 를 비교해 결 따라 줄무늬가 생긴다. 색연필은 가는 줄 두 방향 + 부드러운 문턱(0.12).',
    ],
    when: ['아이 그림 · 크레파스 그림체의 면 칠', '도장 붓(i313) · 지그재그 칠(i326)에 종이 결을 더할 때'],
    avoid: ['매 프레임 바뀌는 큰 그림 — getImageData · putImageData 가 화면 크기마다 무겁다. 대신 셰이더로 하거나 한 번 굽기', '매끈한 디지털 그림체'],
    cost: 'medium',
    costNote: '굽는 순간 그림 크기 픽셀을 한 번 훑음 (500×500 = 25만 픽셀). 구운 뒤엔 drawImage 뿐.',
    level: 1,
    must: [
      '종이 결 지도는 한 번만 만들고 이음새 없이 반복 (& 255 로 감싸 읽기)',
      '결은 종이에 고정 — 그림을 옮겨도 같은 자리가 비게 (그림 좌표가 아니라 캔버스 좌표로 읽기)',
      '문턱은 누르는 힘으로, 경계는 smoothstep 으로 부드럽게',
      '결 깎기는 칠한 겹에만 (테두리 · 바탕까지 같이 깎지 않게 따로 겹)',
      '한 번 굽고 캐시',
    ],
    done: [
      '칠한 면에 종이 결 모양으로 하얀 틈이 군데군데 보인다',
      '누르는 힘을 약 → 강으로 바꾸면 틈이 점점 메워진다',
      '크레파스는 굵고 거친 결 줄무늬, 색연필은 가늘고 촘촘한 결',
      '왼쪽 꽉 찬 칠과 나란히 보면 차이가 바로 보인다',
    ],
    code: {
      lang: 'ts',
      title: '종이 결 문턱으로 칠한 겹 깎기',
      from: 'demos/demosHandA.ts toothMask() 를 정리 (toothField 는 256×256 잡음)',
      body: `const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** T: 256×256 결 높이(0 ~ 1, 이음새 없음). lc: 칠한 겹 캔버스 */
function toothMask(lc: HTMLCanvasElement, T: Float32Array, th: number, soft: number,
                   scale: number, keepMul: number, waxy: boolean) {
  const g = lc.getContext('2d')!;
  const im = g.getImageData(0, 0, lc.width, lc.height);
  const d = im.data, W = lc.width, H = lc.height, inv = 1 / scale;
  for (let y = 0; y < H; y++) {
    const ty = (Math.floor(y * inv) & 255) * 256;          // 반복해서 읽기
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4 + 3;
      const a = d[o];
      if (a === 0) continue;
      const tv = T[ty + (Math.floor(x * inv) & 255)];
      if (waxy) d[o] = 255 * smooth(th - soft, th + soft, tv + (a / 255 - 1) * 0.95); // 크레파스: 옅은 곳이 더 빔
      else d[o] = a * smooth(th - soft, th + soft, tv) * keepMul;                     // 색연필
    }
  }
  g.putImageData(im, 0, 0);
}
// 누르는 힘 p (0 ~ 1):
// 크레파스  toothMask(lc, T, 0.55 - p * 0.55, 0.05, 1.05 * dpr, 1, true)
// 색연필    toothMask(lc, T, 0.7 - p * 0.4, 0.12, 0.6 * dpr, 0.55 + p * 0.45, false)`,
    },
    pitfalls: [
      { title: '결 무늬를 그림마다 다르게 만들면 같은 종이 위인데 질감이 제각각이다', fix: '결 지도 하나를 모든 그림이 같이 쓰고, 캔버스 좌표로 읽어 종이에 고정한다.' },
      { title: '문턱을 딱 자르면(0/1) 가장자리가 계단처럼 깨진다', fix: 'smoothstep 으로 문턱 둘레를 부드럽게 (크레파스 0.05 · 색연필 0.12).' },
      { title: '매 프레임 getImageData 로 깎으면 폰에서 끊긴다', fix: '한 번 구워 캐시. 실시간이 필요하면 같은 계산을 셰이더로 옮긴다.' },
      { title: '레티나 화면에서 결이 너무 잘다', fix: '결 읽는 배율에 기기 픽셀 비율(dpr)을 곱한다 (견본 scale × b.d).' },
    ],
    prev: ['i313', 'i326'],
    next: ['i323'],
  },
};

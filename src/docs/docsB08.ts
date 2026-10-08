import type { TechDoc } from './types';

/**
 * 기술 문서 B08 — 성능(i32 · i34 · i78) · 2D 그리기(u52 · u54 · u56 · u57 · u58 · u60 · i73 · i80) ·
 * 2D 그림 효과(u19 · i233 ~ i236 · i294 ~ i304) · 쿼드트리(i263) · 2D 움직임 · 충돌(i282 ~ i286).
 * 코드는 견본(demos/*.ts)의 실제 코드에서 발췌 · 정리했다. 견본이 개념 그림뿐인 것(i32 · i34)은 새로 썼다 (from 에 표시).
 */
export const DOCS: Record<string, TechDoc> = {
  i32: {
    id: 'i32',
    summary: '시작할 때 큰 캔버스 무늬를 굽는 일을 일꾼(Worker) 안의 화면 밖 캔버스로 넘겨, 굽는 동안에도 게임 화면이 먼저 열리게 한다.',
    terms: [
      { en: 'OffscreenCanvas', ko: '화면에 붙지 않은 캔버스 — 일꾼 안에서도 그릴 수 있다' },
      { en: 'Web Worker', ko: '화면 줄(메인 스레드)과 따로 도는 일꾼' },
      { en: 'transferToImageBitmap · Transferable', ko: '다 그린 그림을 복사 없이 화면 줄로 넘기기' },
      { en: 'Main-thread blocking', ko: '화면 줄이 막혀 하얀 화면 · 멈춤이 생기는 것' },
    ],
    goal: '{target}을(를) 시작할 때 굽는 큰 무늬를 Web Worker 안의 OffscreenCanvas 에서 그리게 바꿔 줘 — 게임은 먼저 열리고 무늬는 다 되면 갈아 끼운다. 기다리는 동안은 {style}.',
    targets: ['캔버스 무늬를 많이 굽는 게임', '시작 화면 배경 · 하늘 그림', '3D 무대에 쓰는 캔버스 텍스처'],
    styles: ['빈 자리에 옅은 바탕색', '돌아가는 점 로딩 표시', '흐린 작은 그림을 먼저'],
    platforms: ['web', 'canvas', 'three'],
    platformHints: {
      three: 'three.js 는 ImageBitmap 을 그대로 텍스처로 쓸 수 있다 (new THREE.Texture(bmp) · needsUpdate). ImageBitmap 은 flipY 가 안 먹으니 그릴 때 위아래를 맞춘다.',
    },
    principle: [
      '보통 캔버스는 화면 줄에서만 그릴 수 있어서, 큰 무늬를 굽는 동안 화면이 멈춘다 (견본 위 줄: 굽는 2초 동안 하얀 화면).',
      'OffscreenCanvas 는 화면에 붙지 않은 캔버스라 일꾼 안에서 만들고 그릴 수 있다.',
      '일꾼이 다 그리면 transferToImageBitmap() 으로 그림을 꺼내 postMessage 로 넘긴다 — 두 번째 인자에 넣으면 복사 없이 옮겨진다.',
      '화면 줄은 그동안 게임을 먼저 열고(견본 아래 줄: 0.6초), 그림이 오면 drawImage 나 텍스처로 갈아 끼운다.',
    ],
    when: ['시작할 때 잡음 · 무늬 캔버스를 여러 장 굽느라 첫 화면이 늦을 때', '판을 바꿀 때마다 큰 배경을 새로 그려야 할 때'],
    avoid: ['그림이 작아 몇 ms 안에 끝날 때 — 일꾼을 띄우는 비용이 더 크다', 'DOM · 글꼴 측정이 꼭 필요한 그림 — 일꾼에는 document 가 없다. 대신 화면 줄에서 프레임마다 조금씩 나눠 굽는다'],
    cost: 'light',
    costNote: '굽는 비용은 그대로지만 화면 줄 밖에서 돈다. 일꾼 하나를 띄우는 데 수십 ms, 그림 넘기기는 복사가 없어 거의 0.',
    level: 2,
    must: [
      '그림을 넘길 때 postMessage(bmp, [bmp]) 처럼 옮기기 목록에 넣어 복사하지 않기',
      '일꾼 안에서는 document · window · Image 를 쓰지 않기 (OffscreenCanvas · fetch · createImageBitmap 만)',
      'OffscreenCanvas 가 없는 브라우저면 화면 줄에서 같은 함수로 굽는 대비 길을 두기 (그리기 함수는 캔버스 종류와 상관없게)',
      '그림이 오기 전에도 게임이 바로 열리고, 오면 그 자리만 갈아 끼우기 (전체 다시 그리기 금지)',
    ],
    done: [
      '켬/끔 비교: 끔이면 시작할 때 하얀 화면이 굽는 시간만큼 이어지고, 켬이면 바로 게임 화면이 뜬 뒤 무늬가 들어온다',
      '성능 패널(Performance)에서 굽는 동안 화면 줄에 50ms 넘는 긴 작업이 없다',
      'OffscreenCanvas 를 끈 대비 길에서도 같은 무늬가 나온다',
      '폰에서도 첫 화면이 굽는 시간과 상관없이 뜬다',
    ],
    code: {
      lang: 'ts',
      title: '일꾼 안에서 무늬 굽기 → 그림만 넘겨 받기',
      from: '새로 씀 (견본 demos/demosSystem.ts i32 는 개념 그림 — 6×6 네 가지 색 무늬는 견본 pat() 과 같게)',
      body: `// bake.worker.ts — 일꾼: 화면 밖 캔버스에 무늬를 굽고 그림만 넘긴다
self.onmessage = (e: MessageEvent<{ size: number }>) => {
  const s = e.data.size;
  const cv = new OffscreenCanvas(s, s);
  const g = cv.getContext('2d')!;
  const cols = ['#ff9ab0', '#ffd23f', '#7ad0ff', '#9af0b8'];
  const n = 6;
  const c = s / n;
  for (let i = 0; i < n * n; i++) {
    const cx = i % n;
    const cy = Math.floor(i / n);
    g.fillStyle = cols[(cx + cy * 2) % 4]!;
    g.fillRect(cx * c, cy * c, c, c);
  }
  const bmp = cv.transferToImageBitmap();
  (self as unknown as Worker).postMessage(bmp, [bmp]); // 복사 없이 옮기기
};

// main.ts — 게임은 먼저 열고, 그림이 오면 그 자리만 갈아 끼운다
let pattern: ImageBitmap | null = null;
const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e: MessageEvent<ImageBitmap>) => {
  pattern = e.data;
  worker.terminate();
};
worker.postMessage({ size: 1024 });

function drawBoard(g: CanvasRenderingContext2D) {
  if (pattern) g.drawImage(pattern, 0, 0, 240, 240);
  else { g.fillStyle = '#e8ecf8'; g.fillRect(0, 0, 240, 240); } // 오기 전엔 옅은 바탕
}`,
    },
    pitfalls: [
      { title: '그림을 옮기기 목록 없이 보내면 큰 그림이 복사된다', fix: 'postMessage(bmp, [bmp]) 로 넘겨야 복사 없이 옮겨진다. 넘긴 뒤 일꾼 쪽 bmp 는 못 쓴다.' },
      { title: '일꾼 안에서 document · new Image() 를 쓰면 바로 오류가 난다', fix: '그림 파일은 fetch → createImageBitmap 으로 읽고, 글꼴은 FontFace 를 self.fonts 에 넣어 쓴다.' },
      { title: 'OffscreenCanvas 가 없는 옛 브라우저에서 무늬가 안 나온다', fix: "typeof OffscreenCanvas === 'undefined' 이면 화면 줄에서 같은 그리기 함수를 부르는 대비 길을 둔다." },
      { title: '그림 하나 받을 때마다 일꾼을 새로 띄우면 오히려 느리다', fix: '일꾼 하나에 굽기 일을 여러 개 맡기고, 다 끝나면 terminate 한다.' },
    ],
    prev: ['i359'],
    next: ['i78', 'u54'],
    refs: [
      { name: 'MDN — OffscreenCanvas', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas' },
      { name: 'MDN — OffscreenCanvas.transferToImageBitmap()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/transferToImageBitmap' },
    ],
  },

  i34: {
    id: 'i34',
    summary: '모양이 서로 다른 소품 여러 개를 BatchedMesh 한 묶음에 넣어, 그리기 호출 수십 번을 한 번으로 줄인다.',
    terms: [
      { en: 'BatchedMesh', ko: 'three.js — 모양이 달라도 재질이 같으면 한 번에 그리는 묶음 메시 (r159+)' },
      { en: 'Draw call', ko: '그리기 호출 — CPU 가 GPU 에 「이거 그려」 하는 한 번' },
      { en: 'Multi-draw (WEBGL_multi_draw)', ko: '여러 조각을 호출 한 번에 그리는 확장' },
      { en: 'InstancedMesh (비교)', ko: '같은 모양 여러 개만 한 번에 — 모양이 다르면 BatchedMesh' },
    ],
    goal: '{target}의 소품들을 BatchedMesh 한 묶음으로 바꿔서 그리기 호출을 한 번으로 줄여 줘 — 모양 · 위치 · 색은 그대로. 장면 분위기는 {style}.',
    targets: ['나무 · 바위 · 꽃 · 고깔 같은 소품 40개', '판 둘레 장식 소품', '마을 집 · 울타리 · 가로등'],
    styles: ['밝은 낮 들판', '귀엽고 아기자기', '저녁 노을'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 SRP Batcher · GPU Resident Drawer(BatchRendererGroup)가 같은 일을 한다. 같은 메시만이면 Graphics.RenderMeshInstanced.',
      godot: 'Godot 은 같은 메시면 MultiMesh(MultiMeshInstance3D). 모양이 다르면 정적 메시를 합치는 쪽이 가깝다.',
    },
    principle: [
      '물체 하나를 그릴 때마다 CPU 가 행렬 계산 · 재질 바꾸기 · 그리기 호출을 한다. 소품 40개면 호출 40번 (견본 왼쪽).',
      'BatchedMesh 는 여러 모양(geometry)을 큰 버퍼 하나에 모아 두고, 놓인 자리(instance)마다 행렬 · 색만 따로 가진다.',
      '그래서 모양이 달라도 재질이 같으면 호출 한 번에 다 그린다 (견본 오른쪽: 40 → 1).',
      '먼저 모든 모양의 꼭짓점 · 색인 수를 더해 버퍼 크기를 정하고 → addGeometry → addInstance → setMatrixAt · setColorAt.',
    ],
    when: ['모양은 몇 가지인데 각각 놓인 자리가 많은 소품 무대', '움직이는 소품이라 고정 메시 합치기(mergeStatic)를 못 쓸 때 — 행렬만 바꾸면 된다'],
    avoid: ['같은 모양 하나만 수천 개 — InstancedMesh(u36)가 더 단순하고 빠르다', '재질이 다 다른 물체 — 재질마다 묶음이 따로 생겨 이득이 없다. 대신 색은 setColorAt 으로'],
    cost: 'light',
    costNote: 'CPU 쪽 비용이 물체 수만큼 → 묶음 수만큼으로 줄어든다. 삼각형 수는 그대로라 GPU 비용은 같다.',
    level: 2,
    must: [
      'BatchedMesh(최대 자리 수, 최대 꼭짓점 수, 최대 색인 수, 재질) — 꼭짓점 · 색인 수는 넣을 모양들의 합으로 계산',
      '넣는 모양은 모두 색인(index)이 있거나 모두 없어야 하고, 속성(position · normal · uv)도 같아야 한다',
      '색 차이는 재질을 나누지 말고 setColorAt 으로',
      '바꾸기 전/후 renderer.info.render.calls 를 화면에 보여 주기',
    ],
    done: [
      '바꾸기 전과 같은 자리 · 크기 · 색으로 소품이 보인다 (전/후 스크린숏이 같다)',
      'renderer.info.render.calls 가 소품 수만큼 → 1(묶음 수)로 줄어든다',
      '소품 하나의 행렬을 바꾸면 그것만 움직인다',
      '폰에서 FPS 가 같거나 오른다',
    ],
    code: {
      lang: 'ts',
      title: '모양 4가지 · 자리 40개를 BatchedMesh 한 묶음으로',
      from: '새로 씀 (견본 demos/demosSystem.ts i34 는 개념 그림 — 소품 40개 · 4종 · 크기 0.7~1.3 은 견본과 같게)',
      body: `import * as THREE from 'three';

// 모두 색인이 있는 모양만 (색인 있음/없음을 섞으면 넣을 수 없다)
const geos = [
  new THREE.ConeGeometry(0.4, 1, 8),          // 나무
  new THREE.SphereGeometry(0.3, 12, 8),       // 바위
  new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), // 꽃대
  new THREE.BoxGeometry(0.4, 0.4, 0.4),       // 상자
];
const COLORS = ['#3ccf7a', '#a8b0c0', '#ff7ab0', '#ffb22e'];
let maxV = 0;
let maxI = 0;
for (const g of geos) {
  maxV += g.getAttribute('position').count;
  maxI += g.index!.count;
}
const N = 40;
const batch = new THREE.BatchedMesh(N, maxV, maxI, new THREE.MeshStandardMaterial({ roughness: 0.7 }));
const ids = geos.map((g) => batch.addGeometry(g));

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const col = new THREE.Color();
for (let i = 0; i < N; i++) {
  const k = i % 4;
  const inst = batch.addInstance(ids[k]!);
  p.set(Math.random() * 10 - 5, 0, Math.random() * 10 - 5);
  s.setScalar(0.7 + Math.random() * 0.6);
  batch.setMatrixAt(inst, m.compose(p, q, s));
  batch.setColorAt(inst, col.set(COLORS[k]!));
}
scene.add(batch);
// 확인: renderer.info.render.calls — 소품 40개인데 1`,
    },
    pitfalls: [
      { title: '버퍼 크기를 어림으로 주면 addGeometry 에서 오류가 난다', fix: '넣을 모양들의 position.count · index.count 를 더해 정확히 준다. 나중에 더 넣을 거면 그만큼 여유를.' },
      { title: '색인 있는 모양과 없는 모양(Tetrahedron 등)을 섞으면 넣을 수 없다', fix: '모두 색인이 있게 맞추거나(mergeVertices) 묶음을 나눈다.' },
      { title: '색마다 재질을 따로 만들면 묶음이 쪼개진다', fix: '재질은 하나, 색은 setColorAt 으로.' },
      { title: '같은 모양 하나뿐인데 BatchedMesh 를 쓰면 손해다', fix: '그럴 땐 InstancedMesh(u36)가 더 가볍다. 움직이지 않으면 고정 메시 합치기(i391)도 된다.', seen: true },
    ],
    prev: ['u36', 'i391'],
    next: ['i78'],
    refs: [
      { name: 'three.js 문서 — BatchedMesh', url: 'https://threejs.org/docs/#api/en/objects/BatchedMesh' },
      { name: 'three.js 예제 — webgl_mesh_batch', url: 'https://threejs.org/examples/#webgl_mesh_batch' },
    ],
  },

  i78: {
    id: 'i78',
    summary: '큰 지도를 512×256 조각 캔버스로 미리 구워 두고 카메라에 걸친 조각만 붙여 그리며, 오래 안 쓴 조각부터 버려 메모리를 지킨다.',
    terms: [
      { en: 'Chunked tile cache', ko: '지도를 조각으로 나눠 구워 두는 캐시' },
      { en: 'LRU eviction (least recently used)', ko: '가장 오래 안 쓴 것부터 버리기' },
      { en: 'Prefetch (idle baking)', ko: '쉴 때 둘레 조각을 미리 굽기' },
      { en: 'Frame cycling (water 4 frames)', ko: '물 조각만 4장 구워 돌려 그리기' },
    ],
    goal: '{target}을(를) 조각 캐시로 그려 줘 — 지도를 512×256 조각으로 구워 두고, 화면에 걸친 조각만 붙이고, 넘치면 가장 오래 안 쓴 조각부터 버린다. 지도는 {style}.',
    targets: ['넓은 등각(아이소) 타일 지도', '스크롤되는 큰 판 게임', '확대 · 축소되는 세계 지도'],
    styles: ['잔디 · 모래 · 물이 있는 섬', '도트 그림 마을', '눈 덮인 들판'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Tilemap 은 TilemapRenderer 의 Mode = Chunk 로 같은 식으로 묶어 그린다.',
      godot: 'Godot 4 TileMapLayer 는 rendering_quadrant_size 칸씩 묶어 그린다.',
    },
    principle: [
      '타일 수천 개를 프레임마다 하나씩 그리면 느리다. 지도를 일정한 조각(견본 512×256)으로 나눠 조각마다 캔버스 한 장에 미리 굽는다.',
      '화면에는 카메라 네모에 걸친 조각 몇 장만 drawImage 로 붙인다 — 프레임마다 그리는 일은 조각 수만큼.',
      '조각 캔버스가 쌓이면 메모리가 넘치니, 조각마다 마지막으로 쓴 때(used)를 적어 두고 상한(견본 12장)을 넘으면 가장 오래된 것부터 버린다(LRU).',
      '카메라가 멈춰 있을 때는 0.2초마다 둘레 조각을 하나씩 미리 굽는다. 물이 있는 조각만 4장을 구워 돌려 그려 물결이 흐르게 한다.',
    ],
    when: ['지도가 화면보다 몇 배 넓고 타일 그리기가 무거울 때', '폰에서 스크롤할 때 프레임이 떨어질 때'],
    avoid: ['한 화면에 다 들어가는 작은 판 — 통째로 한 장 굽기면 충분', '타일이 매 프레임 바뀌는 지도 — 조각을 계속 다시 구워야 해서 이득이 없다. 바뀌는 것만 위에 따로 그린다'],
    cost: 'light',
    costNote: '굽기는 조각이 처음 보일 때만. 메모리는 조각 크기 × 상한 (견본은 해상도 1/4 로 128×64 × 최대 24장). 물 조각은 4배.',
    level: 2,
    must: [
      '조각 크기는 고정(예: 512×256), 열쇠는 조각 칸 번호(cy·GX + cx)',
      '화면에 보이는 조각은 버리지 않기 — LRU 는 보이지 않는 것 중에서 가장 오래된 것',
      '쉴 때 미리 굽기는 한 번에 한 조각씩 (프레임이 튀지 않게)',
      '굽기 · 버리기 · 캐시 크기 수를 화면에 보여 주기',
    ],
    done: [
      '카메라를 움직이면 새로 걸친 조각만 구워지고(흰 번쩍), 나머지는 붙이기만 한다',
      '「캐시 크기」 슬라이더를 줄이면 버림(LRU) 수가 늘고, 다시 돌아간 곳은 다시 굽는다',
      '멈춰 있으면 둘레 조각이 미리 구워져, 그쪽으로 움직일 때 굽기가 없다',
      '폰에서 스크롤 중에도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '보이는 조각 굽기 · 쉴 때 미리 굽기 · LRU 버리기',
      from: 'demos/demosEpic.ts makeI78() 의 ensure · 버리기를 정리',
      body: `const CW = 512, CH = 256, CAP = 12;
interface Chunk { key: number; cv: HTMLCanvasElement[]; used: number }
const cache = new Map<number, Chunk>();

function ensure(cx: number, cy: number, t: number, pre: boolean) {
  const key = cy * GX + cx;
  let ch = cache.get(key);
  if (!ch) {
    const frames = hasWater[key] ? 4 : 1; // 물 조각만 4장
    ch = { key, cv: Array.from({ length: frames }, (_, f) => bakeChunk(cx, cy, f)), used: t };
    cache.set(key, ch);
  }
  if (!pre) ch.used = t; // 미리 굽기는 「썼다」로 치지 않는다
}

function frame(t: number, cam: { x: number; y: number; w: number; h: number }, resting: boolean) {
  const vis = new Set<number>();
  const x0 = Math.floor((cam.x - cam.w / 2) / CW), x1 = Math.floor((cam.x + cam.w / 2) / CW);
  const y0 = Math.floor((cam.y - cam.h / 2) / CH), y1 = Math.floor((cam.y + cam.h / 2) / CH);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) { vis.add(cy * GX + cx); ensure(cx, cy, t, false); }
  // 쉴 때: 둘레 한 칸 중 아직 없는 조각 하나만 (0.2초마다)
  if (resting && t - lastPre > 0.2) prefetchOne(x0 - 1, x1 + 1, y0 - 1, y1 + 1, t);
  // 넘치면 보이지 않는 것 중 가장 오래 안 쓴 것부터
  while (cache.size > CAP) {
    let old: Chunk | null = null;
    for (const c of cache.values()) if (!vis.has(c.key) && (!old || c.used < old.used)) old = c;
    if (!old) break;
    cache.delete(old.key);
  }
  const wf = Math.floor(t * 4) % 4; // 물 4장 돌리기
  for (const key of vis) {
    const ch = cache.get(key)!;
    const cx = key % GX, cy = Math.floor(key / GX);
    g.drawImage(ch.cv[ch.cv.length > 1 ? wf : 0]!, cx * CW - (cam.x - cam.w / 2), cy * CH - (cam.y - cam.h / 2), CW, CH);
  }
}`,
    },
    pitfalls: [
      { title: '보이는 조각까지 LRU 로 버리면 깜빡이며 매 프레임 다시 굽는다', fix: '버릴 후보에서 지금 보이는 조각(vis)을 뺀다. 상한은 「보이는 조각 수 + 둘레」보다 크게.' },
      { title: '미리 굽기를 한 번에 여러 장 하면 멈춘 순간 프레임이 튄다', fix: '한 번에 한 조각, 0.2초 간격으로.' },
      { title: '미리 구운 조각에 used 를 적으면 진짜 쓰는 조각이 먼저 버려진다', fix: '미리 굽기는 used 를 갱신하지 않는다 (견본 ensure 의 pre).' },
      { title: '조각을 붙일 때 이음새에 실선이 보인다', fix: '조각 경계에 걸친 타일도 양쪽 조각에 모두 그리고(경계 상자 검사), 놓을 자리는 정수로 맞춘다.' },
    ],
    prev: ['i32'],
    next: ['i263'],
    refs: [
      { name: 'Wikipedia — Cache replacement policies (LRU)', url: 'https://en.wikipedia.org/wiki/Cache_replacement_policies' },
    ],
  },

  u52: {
    id: 'u52',
    summary: '단색 원 대신 방사 그러데이션 · 흐림 필터 · 빛 번짐 그림자 · 더하기 혼합을 겹쳐, 겹친 곳이 환하게 빛나는 빛 덩어리를 캔버스로 그린다.',
    terms: [
      { en: 'Canvas radial gradient (createRadialGradient)', ko: '가운데서 바깥으로 색이 바뀌는 칠' },
      { en: "globalCompositeOperation = 'lighter'", ko: '더하기 혼합 — 겹치면 밝아진다' },
      { en: 'shadowBlur · shadowColor (glow)', ko: '그림 둘레로 번지는 빛' },
      { en: 'ctx.filter = blur()', ko: '그리는 것을 통째로 흐리게' },
    ],
    goal: '{target}을(를) 캔버스 2D 로 빛나게 그려 줘 — 방사 그러데이션 · 흐린 배경 덩어리 · shadowBlur 빛 번짐 · lighter 더하기 혼합을 겹친다. 분위기는 {style}.',
    targets: ['떠다니는 빛 구슬', '보상 · 별 · 마법 빛', '배경의 흐린 색 덩어리'],
    styles: ['짙은 남색 밤하늘', '귀엽고 몽글몽글', '네온 사인'],
    platforms: ['canvas', 'web'],
    principle: [
      '방사 그러데이션: 가운데 흰빛(#ffffffcc) → 제 색 → 바깥은 투명(c00)으로 끝내면 가장자리가 부드럽게 사라진다.',
      "더하기 혼합('lighter'): 겹친 화소의 색을 더하므로 겹친 곳이 하얗게 빛난다. 보통 혼합(source-over)은 위에 덮을 뿐이다.",
      'shadowBlur 는 그린 모양 둘레로 shadowColor 빛을 번지게 한다 — 같은 색으로 주면 빛무리.',
      '뒤 배경 덩어리는 ctx.filter = blur(10px) 로 그리고 바로 none 으로 돌려 놓는다.',
    ],
    when: ['어두운 바탕에 빛 · 마법 · 보상을 그릴 때', '3D 없이 2D 로 은은한 배경 분위기를 낼 때'],
    avoid: ['밝은 흰 바탕 — 더하기 혼합은 바탕이 밝으면 하얗게 날아간다. 대신 보통 혼합 + 그러데이션', '수백 개를 매 프레임 — shadowBlur · filter 는 비싸다. 대신 빛 그림을 한 번 구워 drawImage'],
    cost: 'medium',
    costNote: 'shadowBlur · filter blur 는 그릴 때마다 흐림 계산을 한다. 구슬 5개는 가볍지만 수백 개면 폰에서 느려진다 — 구워 두고 붙이기.',
    level: 1,
    must: [
      '그러데이션 마지막 색은 같은 색의 알파 0 (검정 투명 rgba(0,0,0,0) 이 아니라) — 아니면 가장자리가 탁해진다',
      'globalCompositeOperation · filter · shadowBlur · globalAlpha 는 쓰고 나서 바로 원래대로 (source-over · none · 0 · 1)',
      '더하기 혼합은 어두운 바탕 위에서만',
      '흐림 · 빛 번짐 세기를 슬라이더로',
    ],
    done: [
      '왼쪽 단색 원 · 오른쪽 빛 구슬을 나란히 보면, 오른쪽은 가장자리가 부드럽고 겹친 곳이 하얗게 빛난다',
      "「겹치면 더하기」를 끄면 겹친 곳이 그냥 덮인다",
      '빛 번짐(shadowBlur) 0~40 슬라이더로 빛무리 크기가 바뀐다',
      '혼합 설정이 다른 그림(글자 · 단추)에 새어 나가지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '흐린 배경 덩어리 + 빛 구슬 (그러데이션 · 빛 번짐 · 더하기)',
      from: 'demos/demosDraw2d.ts u52 orbs() 의 fancy 쪽을 정리',
      body: `function glowOrbs(g: CanvasRenderingContext2D, orbs: { x: number; y: number; r: number; c: string }[], blur = 16) {
  // 1) 뒤 배경 덩어리 — 통째로 흐리게
  g.filter = 'blur(10px)';
  for (const [i, c] of ['#3b2a8f', '#16608f', '#7a2a7f'].entries()) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(80 + i * 90, 70 + (i % 2) * 40, 34, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
  // 2) 빛 구슬 — 겹치면 더하기
  g.globalCompositeOperation = 'lighter';
  for (const o of orbs) {
    const gr = g.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.3, 0, o.x, o.y, o.r * 1.7);
    gr.addColorStop(0, '#ffffffcc');
    gr.addColorStop(0.18, o.c + 'cc');
    gr.addColorStop(0.55, o.c + '55');
    gr.addColorStop(1, o.c + '00'); // 같은 색의 투명으로 끝내기
    g.shadowColor = o.c;
    g.shadowBlur = blur;
    g.globalAlpha = 0.85;
    g.fillStyle = gr;
    g.beginPath();
    g.arc(o.x, o.y, o.r * 1.7, 0, Math.PI * 2);
    g.fill();
  }
  // 3) 꼭 되돌리기
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-over';
}
// 색은 '#ff5fa2' 처럼 6자리 hex — 뒤에 알파 2자리를 붙인다`,
    },
    pitfalls: [
      { title: '그러데이션 끝을 검정 투명으로 하면 가장자리에 회색 테가 생긴다', fix: "같은 색에 알파만 0 (예: '#ff5fa2' + '00') 으로 끝낸다." },
      { title: 'lighter 를 되돌리지 않으면 뒤에 그린 글자 · 단추까지 빛난다', fix: "그린 뒤 바로 source-over 로. save()/restore() 로 감싸도 된다." },
      { title: 'shadowBlur 를 켠 채로 많이 그리면 폰에서 느려진다', fix: '빛 구슬 하나를 작은 캔버스에 구워 두고 drawImage 로 찍는다.' },
      { title: '3자리 hex(#f5a) 뒤에 알파를 붙이면 엉뚱한 색이 된다', fix: '색은 6자리 hex 로 맞춘 뒤 알파 2자리를 붙인다.' },
    ],
    next: ['u54', 'i302', 'u19'],
    refs: [
      { name: 'MDN — CanvasRenderingContext2D.createRadialGradient()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/createRadialGradient' },
      { name: 'MDN — globalCompositeOperation', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' },
      { name: 'MDN — CanvasRenderingContext2D.filter', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter' },
    ],
  },

  u54: {
    id: 'u54',
    summary: '도메인 워프 잡음을 64×40 작은 캔버스에 화소로 계산한 뒤 부드럽게 크게 키우고 별을 얹어, 가볍게 흐르는 성운 하늘을 만든다.',
    terms: [
      { en: 'fBm (fractal Brownian motion)', ko: '잡음을 크기 반씩 여러 겹 더한 것 — 구름 · 성운 결' },
      { en: 'Domain warping', ko: '잡음 좌표를 다른 잡음으로 휘게 해 소용돌이 무늬' },
      { en: 'Value noise', ko: '격자점 난수를 부드럽게 이은 잡음' },
      { en: 'Low-res render + upscale', ko: '작게 계산하고 크게 키우기' },
    ],
    goal: '{target}을(를) 도메인 워프 fBm 잡음 성운으로 그려 줘 — 작은 캔버스(64×40)에 계산하고 부드럽게 키운 뒤 반짝이는 별을 얹는다. 색은 {style}.',
    targets: ['게임 배경 밤하늘', '시작 화면 우주', '한붓그리기 같은 2D 판 뒤 하늘'],
    styles: ['남색 → 보라 → 분홍 → 하늘', '초록 · 청록 오로라', '주황 · 빨강 불꽃 성운'],
    platforms: ['canvas', 'three', 'godot'],
    platformHints: {
      three: 'three.js 에선 같은 식을 작은 DataTexture 에 구워 배경 판에 붙이거나, 셰이더로 옮길 땐 반복 잡음 대신 미리 구운 잡음 텍스처를 읽는다.',
      godot: 'Godot 은 NoiseTexture2D(FastNoiseLite — domain_warp 켜기)로 같은 무늬를 바로 만든다.',
    },
    principle: [
      'fBm = 잡음을 크기 1/2 · 좌표 2배씩 4겹 더한 것. 큰 덩어리 위에 잔결이 얹힌다.',
      '도메인 워프: 먼저 잡음 두 개로 q = (fbm(p), fbm(p + 5.2)) 를 만들고, 최종 값은 fbm(p + warp·q). 좌표가 휘어 소용돌이 성운이 된다.',
      '이 계산은 화소마다 fbm 세 번이라 무겁다 — 64×40 = 2,560 화소만 계산하고 크게 키운다. 0.06초마다만 다시 칠한다.',
      '키울 때 imageSmoothingQuality = high + 살짝 흐림(1.2px)으로 도트 티를 지우고, 별은 lighter 로 얹어 반짝이게.',
    ],
    when: ['2D 배경 하늘에 움직이는 성운 · 구름 결이 필요할 때', '그림 파일 없이 코드로 매번 다른 하늘을 만들 때'],
    avoid: ['큰 해상도에서 매 프레임 계산 — 1920×1080 이면 200만 화소 × fbm 3번. 꼭 작게 계산', '셰이더 안에서 반복문 잡음을 여러 번 부르기 — 컴파일 멈춤. 대신 잡음 텍스처'],
    cost: 'light',
    costNote: '64×40 × fbm 3번(4겹) ≈ 3만 번 잡음 계산을 0.06초마다. 폰에서도 1ms 안쪽.',
    level: 2,
    must: [
      '잡음 계산은 작은 캔버스(64×40 정도)에서만, 다시 칠하기는 0.06초마다',
      '도메인 워프 세기(warp)를 슬라이더로 (0 이면 그냥 fbm)',
      '크게 그릴 때 imageSmoothingEnabled = true · quality high (도트로 보이지 않게)',
      '별은 큰 캔버스 위에 따로 — 작은 캔버스에 찍으면 키울 때 뭉개진다',
    ],
    done: [
      '왼쪽 64×40 원본 도트와 오른쪽 크게 키운 성운이 같은 무늬로 보인다',
      '워프 0 → 5 로 올리면 덩어리가 소용돌이처럼 휘어진다',
      '성운이 천천히 흐르고, 별은 따로 반짝인다',
      '폰에서 60fps',
    ],
    code: {
      lang: 'ts',
      title: '도메인 워프 성운을 작게 계산 → 크게 키우기',
      from: 'demos/demosDraw2d.ts u54 paint() · fbm() · vnoise() 를 정리',
      body: `function hash2(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y); x = x * 2.03 + 17.1; y = y * 2.01 + 3.7; a *= 0.5; }
  return s;
}
const SW = 64, SH = 40;
const small = document.createElement('canvas');
small.width = SW; small.height = SH;
const sg = small.getContext('2d')!;
const img = sg.createImageData(SW, SH);
function paint(t: number, warp = 2) {
  const d = img.data, tt = t * 0.06;
  for (let y = 0; y < SH; y++)
    for (let x = 0; x < SW; x++) {
      const px = x / 22, py = y / 22;
      const qx = fbm(px + tt, py, 3), qy = fbm(px + 5.2, py + 1.3 - tt, 3);
      const k = Math.min(1, Math.max(0, (fbm(px + warp * qx, py + warp * qy, 4) - 0.25) * 1.9));
      const i = (y * SW + x) * 4;
      d[i] = Math.min(255, 12 + 230 * k * k * (0.4 + qx) + 40 * qy * k);
      d[i + 1] = Math.min(255, 14 + 120 * k * k * qy * 1.6 + 30 * k);
      d[i + 2] = Math.min(255, 40 + 190 * k * (0.5 + qy * 0.6));
      d[i + 3] = 255;
    }
  sg.putImageData(img, 0, 0);
}
// 그리기: 0.06초마다 paint(t) → g.imageSmoothingQuality = 'high'; g.filter = 'blur(1.2px)';
// g.drawImage(small, x - 4, y - 4, w + 8, h + 8); g.filter = 'none'; 그 위에 별은 'lighter' 로`,
    },
    pitfalls: [
      { title: '큰 캔버스에서 바로 잡음을 계산하면 프레임이 무너진다', fix: '64×40 처럼 작게 계산하고 키운다. 다시 칠하기도 0.06초마다면 충분하다.' },
      { title: '키울 때 흐림 없이 그리면 가장자리에 도트 계단이 보인다', fix: '살짝 흐림(1.2px)을 주고 4px 바깥까지 넘치게 그려 테두리 번짐을 숨긴다.' },
      { title: '같은 잡음을 셰이더에 반복문으로 옮기면 윈도에서 컴파일이 멈춘다', fix: '보물 동굴에서 17~20초 멈췄다. 셰이더에서는 미리 구운 잡음 텍스처를 읽기만 한다.', seen: true },
      { title: '별을 작은 캔버스에 찍으면 키울 때 번진 얼룩이 된다', fix: '별은 큰 화면에 따로 그린다.' },
    ],
    prev: ['u52'],
    next: ['i236', 'i32'],
    refs: [
      { name: 'Inigo Quilez — Domain Warping', url: 'https://iquilezles.org/articles/warp/' },
      { name: 'Inigo Quilez — fBM', url: 'https://iquilezles.org/articles/fbm/' },
    ],
  },
  u56: {
    id: 'u56',
    summary: '테두리 그림을 9조각으로 잘라 귀퉁이는 그대로 두고 변 · 가운데만 늘이되, 캔버스 한 장에 이어 그려 확대해도 조각 사이 실선이 생기지 않게 한다.',
    terms: [
      { en: '9-slice scaling (nine-patch)', ko: '9조각 늘리기 — 귀퉁이는 그대로, 변과 가운데만 늘림' },
      { en: 'CSS border-image', ko: 'CSS 의 9조각 테두리 (조각마다 따로 그려 이음새가 생김)' },
      { en: 'drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh)', ko: '그림 일부를 잘라 원하는 크기로 그리기' },
      { en: 'ResizeObserver', ko: '요소 크기가 바뀌면 알려 주는 감시자' },
    ],
    goal: '{target}을(를) 9조각 그림으로 늘려 줘 — 귀퉁이 장식은 찌그러지지 않고, 캔버스 한 장에 이어 그려 이음새 실선이 없게. 그림은 {style}.',
    targets: ['종이 · 서류 같은 테두리 판', '게임 단추 · 이름표', '말풍선 · 팁 띠'],
    styles: ['금테 두른 크림 종이', '나무 판자', '얼음빛 유리 판'],
    platforms: ['web', 'canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Sprite Editor 에서 Border 를 정하고 UI Image 의 Image Type = Sliced.',
      godot: 'Godot 은 NinePatchRect (patch_margin_left/top/right/bottom).',
    },
    principle: [
      '그림을 자를 자리 네 개(위 · 오른쪽 · 아래 · 왼쪽)로 3×3 조각을 낸다. 귀퉁이 4조각은 크기 그대로, 위아래 변은 가로로만, 좌우 변은 세로로만, 가운데는 양쪽으로 늘린다.',
      '그냥 늘리면 귀퉁이 장식까지 찌그러진다 (견본 왼쪽).',
      'CSS border-image 는 9조각을 따로 그려서, 화면을 확대 · 축소하면 조각 사이에 얇은 선이 보인다.',
      '그래서 요소 크기에 맞는 캔버스 한 장에 9조각을 정수 좌표로 딱 붙여 그리고, 그 그림을 배경으로 깐다. 크기가 바뀌면 다시 굽는다.',
    ],
    when: ['테두리 그림 하나로 크기가 다른 판 · 단추를 많이 만들 때', '화면 크기에 맞춰 늘어나는 HTML 판에 그린 테두리를 입힐 때'],
    avoid: ['가운데에 무늬 · 글자가 있는 그림 — 가운데도 늘어나 찌그러진다. 대신 가운데는 단색, 무늬는 따로 얹기', '테두리를 코드로 그릴 수 있는 단순한 모양 — CSS border · SVG 가 더 가볍다'],
    cost: 'light',
    costNote: '크기가 바뀔 때만 한 번 굽는다 (해상도 2배). 같은 크기는 캐시에서 재사용 (견본 코드는 최대 60장).',
    level: 1,
    must: [
      '자르는 자리는 그림 좌표, 놓는 자리는 캔버스 좌표 — 놓는 자리는 Math.round 로 정수에 맞춰 조각이 딱 붙게',
      '테두리 두께는 요소의 CSS border 두께를 그대로 쓰기',
      '캔버스 해상도는 2배(RES 2)로 — 확대돼 보여도 흐리지 않게',
      '그림이 준비되기 전에는 CSS border-image 가 그대로 보이게 (빈칸 금지)',
      '크기가 바뀌면 다시 굽고, 같은 크기는 캐시에서',
    ],
    done: [
      '그냥 늘리기 · 9분할을 나란히 보면 9분할 쪽 귀퉁이 장식이 찌그러지지 않는다',
      '브라우저를 125% · 150% 로 확대해도 조각 사이 실선이 없다',
      '판 크기를 바꾸면 테두리가 다시 맞춰진다',
      '「자르는 선 보기」를 켜면 9조각 경계가 점선으로 보인다',
    ],
    code: {
      lang: 'ts',
      title: '9조각을 캔버스 한 장에 이어 그려 배경으로',
      from: 'src/game/core/nineSlice.ts render() 를 정리',
      body: `const RES = 2; // 확대돼도 또렷하게
async function nineToBg(el: HTMLElement, img: HTMLImageElement, s: [number, number, number, number]) {
  const cs = getComputedStyle(el);
  const b = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map((v) => parseFloat(v) * RES);
  const W = Math.round(el.offsetWidth * RES);
  const H = Math.round(el.offsetHeight * RES);
  const [st, sr, sb, sl] = s; // 그림에서 자를 자리 (border-image-slice 와 같은 값)
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const sx = [0, sl, iw - sr, iw];
  const sy = [0, st, ih - sb, ih];
  // 놓는 자리는 정수로 — 조각이 딱 붙어 실선이 없다
  const dx = [0, Math.round(b[3]!), W - Math.round(b[1]!), W];
  const dy = [0, Math.round(b[0]!), H - Math.round(b[2]!), H];
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const sw = sx[c + 1]! - sx[c]!, sh = sy[r + 1]! - sy[r]!;
      const dw = dx[c + 1]! - dx[c]!, dh = dy[r + 1]! - dy[r]!;
      if (sw > 0 && sh > 0 && dw > 0 && dh > 0) g.drawImage(img, sx[c]!, sy[r]!, sw, sh, dx[c]!, dy[r]!, dw, dh);
    }
  const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok));
  if (!blob) return;
  el.style.backgroundImage = 'url(' + URL.createObjectURL(blob) + ')';
  el.style.backgroundSize = '100% 100%';
  el.style.backgroundOrigin = 'border-box';
  el.style.borderImageSource = 'none'; // 이음새 나는 border-image 는 끈다
}
// 크기가 바뀌면 다시: new ResizeObserver((l) => l.forEach((e) => nineToBg(e.target as HTMLElement, img, s))).observe(el)`,
    },
    pitfalls: [
      { title: 'CSS border-image 만 쓰면 확대 · 축소할 때 조각 사이에 얇은 선이 보인다', fix: '9조각을 캔버스 한 장에 정수 좌표로 이어 그려 배경으로 깐다 (수학 검문소 자료 종이 · 근무 일지에서 겪고 고침).', seen: true },
      { title: '놓는 자리를 소수로 두면 조각 사이에 반 화소 틈이 생긴다', fix: 'dx · dy 를 Math.round 로 정수에 맞춘다.' },
      { title: '게임 CSS 가 background 에 !important 를 쓰면 깐 그림이 안 보인다', fix: "style.setProperty(k, v, 'important') 로 같이 important 로 넣는다 (nineSlice.ts 가 이렇게 한다).", seen: true },
      { title: '크기가 바뀔 때마다 새 그림 주소를 만들면 메모리가 샌다', fix: '열쇠(그림 · 크기 · 두께)로 캐시하고, 넘치면 오래된 주소를 URL.revokeObjectURL 로 놓아준다.' },
    ],
    next: ['u60', 'u58'],
    refs: [
      { name: 'Wikipedia — 9-slice scaling', url: 'https://en.wikipedia.org/wiki/9-slice_scaling' },
      { name: 'MDN — border-image-slice', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/border-image-slice' },
    ],
  },

  u57: {
    id: 'u57',
    summary: '아이콘 · 마스코트 · 도장을 그림 파일 대신 SVG 코드로 그려, 글자가 번역되고 크기가 바뀌어도 또렷하며 속성만 바꿔 움직인다.',
    terms: [
      { en: 'Inline SVG', ko: 'HTML 안에 직접 쓴 벡터 그림' },
      { en: 'Procedural SVG path (d attribute)', ko: '코드로 계산해 만든 경로 — 톱니 · 별' },
      { en: 'SVG transform · setAttribute animation', ko: '속성 값만 바꿔 움직이기' },
      { en: 'viewBox · preserveAspectRatio', ko: '그림 좌표계 · 맞춤 방식' },
    ],
    goal: '{target}을(를) 그림 파일 없이 SVG 코드로 그려 줘 — 글자는 <text> 로 두어 번역되게, 모양은 코드로 계산해서. 그림체는 {style}.',
    targets: ['통과 · 반려 도장', '게임 아이콘 · 단추 무늬', '눈 깜빡이는 마스코트'],
    styles: ['굵은 선 귀여운 아이콘', '빨간 인주 도장', '금빛 휘장'],
    platforms: ['web'],
    principle: [
      'SVG 는 점 · 선 · 곡선으로 그린 벡터라 크게 해도 흐려지지 않는다. viewBox 로 그림 좌표를 정하면 화면 크기와 상관없이 맞춰진다.',
      '글자를 그림에 굽지 않고 <text> 로 두면 번역 사전으로 바로 바뀐다 — 도장의 「통과/반려」 처럼.',
      '톱니 · 별 같은 규칙 있는 모양은 각도를 돌며 점을 계산해 path 의 d · polygon 의 points 문자열로 만든다.',
      '움직임은 매 프레임 setAttribute 로 transform · ry · points 값만 바꾼다 — 바뀐 글자 · 색은 바뀔 때만 넣는다.',
    ],
    when: ['번역되는 글자가 든 도장 · 이름표 · 배너', '크기가 여러 가지인 아이콘', '모양이 수(꼭짓점 수 등)에 따라 바뀌는 그림'],
    avoid: ['사진 · 붓질 질감 그림 — 벡터로는 무겁고 어색하다. 대신 그림 파일', '요소 수천 개를 매 프레임 바꾸기 — DOM 이 느려진다. 대신 캔버스'],
    cost: 'light',
    costNote: '요소 수십 개 · 속성 몇 개를 바꾸는 정도는 가볍다. 매 프레임 수백 요소를 바꾸면 레이아웃 비용이 쌓인다.',
    level: 1,
    must: [
      '그림에 글자를 넣지 않는다 — 글자는 모두 <text> (번역 키로 바꿀 수 있게)',
      'viewBox 를 정하고 width · height 는 100% (크기는 바깥 상자가 정함)',
      '규칙 있는 모양은 코드로 점을 계산 (손으로 좌표를 늘어놓지 않기)',
      '글자 · 색 같은 값은 바뀔 때만 다시 넣기 (매 프레임 textContent 쓰기 금지)',
    ],
    done: [
      '화면을 크게 · 작게 해도 선이 또렷하다',
      '언어를 바꾸면 도장 글자가 그 언어로 바뀐다',
      '별의 꼭짓점 수 n 을 바꾸면 모양이 바로 다시 계산된다',
      '도장이 쾅 찍힐 때 크기 1.9 → 1 로 줄며 살짝 흔들린다',
    ],
    code: {
      lang: 'ts',
      title: '코드로 만든 톱니 · 별 경로 + 쾅 찍히는 도장',
      from: 'demos/demosDraw2d.ts u57 (톱니 경로 · update) 를 정리',
      body: `// 톱니: 이 4개 중 2개는 바깥(24), 2개는 안쪽(17) 반지름
function gearPath(teeth = 8, rOut = 24, rIn = 17) {
  let d = '';
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? rOut : rIn;
    d += (i ? 'L' : 'M') + (Math.cos(a) * r).toFixed(2) + ' ' + (Math.sin(a) * r).toFixed(2);
  }
  return d + 'Z';
}
// 별: 꼭짓점 n 개, 바깥 30 · 안쪽 13
function starPoints(n: number, spin: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n + spin;
    const r = i % 2 ? 13 : 30;
    pts.push((Math.cos(a) * r).toFixed(2) + ',' + (Math.sin(a) * r).toFixed(2));
  }
  return pts.join(' ');
}
gear.setAttribute('d', gearPath());

let lastWord = '';
function update(t: number) {
  // 도장: 2.4초마다 1.9 배 → 1 배로 쾅, 닿은 뒤 0.18초 흔들
  const ph = t % 2.4;
  const k = Math.min(1, ph / 0.22);
  const sc = 1.9 - 0.9 * (1 - (1 - k) * (1 - k));
  const shake = ph > 0.22 && ph < 0.4 ? Math.sin(ph * 120) * 2 : 0;
  stamp.setAttribute('transform', 'translate(' + shake + ' 0) rotate(-12) scale(' + sc + ')');
  const word = Math.floor(t / 2.4) % 2 ? $t('반려') : $t('통과'); // 글자는 번역 키로
  if (word !== lastWord) { lastWord = word; stampText.textContent = word; }
  star.setAttribute('points', starPoints(5 + (Math.floor(t / 1.5) % 4), t * 0.3));
  gear.setAttribute('transform', 'rotate(' + ((t * 60) % 360) + ')');
}`,
    },
    pitfalls: [
      { title: '도장 · 단추 글씨를 그림 파일에 넣으면 번역이 안 된다', fix: '그림에는 글자를 넣지 않고 SVG <text> 로 그린다 — 수학 검문소에서 사용자와 정한 규칙.', seen: true },
      { title: '매 프레임 textContent 를 다시 쓰면 글자 레이아웃이 계속 다시 계산된다', fix: '값이 바뀔 때만 넣는다 (lastWord 비교).' },
      { title: 'toFixed 없이 긴 소수를 경로에 넣으면 문자열이 커진다', fix: '좌표는 toFixed(2) 정도로 줄인다.' },
      { title: 'SVG 글꼴이 늦게 와서 첫 화면 글자가 다른 글꼴로 보인다', fix: 'document.fonts.ready 뒤에 한 번 더 그리거나, 글꼴을 미리 불러 둔다.' },
    ],
    next: ['u58', 'i80'],
    refs: [
      { name: 'MDN — SVG <path> d 속성', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d' },
      { name: 'MDN — SVG viewBox', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/viewBox' },
    ],
  },

  u58: {
    id: 'u58',
    summary: 'SVG 필터의 feTurbulence 잡음으로 가장자리를 찢고 섬유 결 · 얼룩을 입혀, 그냥 네모를 손으로 만든 종이처럼 보이게 한다.',
    terms: [
      { en: 'SVG filter feTurbulence (fractalNoise)', ko: '필터 안에서 만드는 잡음 무늬' },
      { en: 'feDisplacementMap', ko: '잡음 값만큼 그림 화소를 밀어 가장자리 흔들기' },
      { en: 'feColorMatrix · feComposite operator="in"', ko: '잡음을 색으로 바꾸고, 그림 안에만 남기기' },
      { en: 'feDropShadow', ko: '종이 그림자' },
    ],
    goal: '{target}에 SVG 필터로 종이 결을 입혀 줘 — feTurbulence 로 가장자리를 찢고 섬유 결 · 얼룩을 그림 안에만 얹는다. 종이는 {style}.',
    targets: ['보고서 · 서류 종이 판', '게임 안 메모 · 쪽지', '배너 바탕 종이'],
    styles: ['누런 크림 종이', '하얀 공책 종이', '낡은 양피지'],
    platforms: ['web'],
    principle: [
      'feTurbulence 는 필터 안에서 잡음 그림을 만든다. baseFrequency 가 작으면 큰 얼룩(0.012), 크면 잔결(0.9). 가로·세로를 따로 주면(0.9 0.05) 한쪽으로 긴 섬유 결.',
      'feDisplacementMap 이 잡음 R · G 값만큼 원래 그림 화소를 밀어 가장자리가 찢긴 듯 흔들린다 (scale 12).',
      '섬유 · 얼룩 잡음은 feColorMatrix 로 갈색 반투명으로 바꾸고, feComposite operator="in" 으로 찢긴 종이 안에만 남긴다.',
      'feMerge 로 「찢긴 종이 → 섬유 → 얼룩」을 겹치고, 바깥에 feDropShadow 로 그림자. seed 를 바꾸면 다른 종이가 된다.',
    ],
    when: ['HTML · SVG 판을 손으로 만든 종이처럼 보이게 할 때', '같은 판을 여러 장 다르게 보이게 (seed 만 바꿔서)'],
    avoid: ['매 프레임 크기가 바뀌는 큰 판 — 필터를 계속 다시 계산해 느리다. 대신 한 번 구운 그림', '아주 큰 화면 전체에 — 필터 영역이 클수록 비싸다'],
    cost: 'medium',
    costNote: '필터는 그 영역 화소마다 잡음 3장을 계산한다. 작은 판 몇 장은 괜찮지만 판이 움직이거나 커지면 폰에서 무거울 수 있다.',
    level: 2,
    must: [
      '필터 id 는 화면마다 겹치지 않게 (같은 id 가 둘이면 엉뚱한 필터가 걸린다)',
      'filter 영역을 x/y -10% · width/height 120% 로 넓혀 찢긴 가장자리가 잘리지 않게',
      '섬유 · 얼룩은 feComposite operator="in" 으로 종이 안에만',
      'seed 와 찢김 세기(scale)를 조절할 수 있게',
    ],
    done: [
      '그냥 네모와 나란히 보면 오른쪽만 가장자리가 찢기고 섬유 결 · 얼룩이 보인다',
      '「찢김 세기」 0 → 30 으로 가장자리 흔들림이 커진다',
      'seed 를 바꾸면 다른 무늬의 종이가 된다',
      '종이 위 글자 · 줄은 흔들리지 않는다 (필터는 종이 사각형에만)',
    ],
    code: {
      lang: 'ts',
      title: '찢긴 가장자리 + 섬유 결 + 얼룩 종이 필터',
      from: 'demos/demosDraw2d.ts u58 의 <filter> 를 정리',
      body: `function paperFilter(id: string, seed = 2) {
  return [
    '<filter id="' + id + '" x="-10%" y="-10%" width="120%" height="120%">',
    // 큰 잡음으로 가장자리 밀기 = 찢긴 종이
    '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="' + seed + '" result="n"/>',
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="12" xChannelSelector="R" yChannelSelector="G" result="torn"/>',
    // 가로로 긴 섬유 결 → 갈색 반투명 → 종이 안에만
    '<feTurbulence type="fractalNoise" baseFrequency="0.9 0.05" numOctaves="2" seed="' + (seed + 3) + '" result="fib"/>',
    '<feColorMatrix in="fib" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.33  0 0 0 0 0.16  0 0 0 0.7 -0.18" result="fibc"/>',
    '<feComposite in="fibc" in2="torn" operator="in" result="fibIn"/>',
    // 큰 얼룩
    '<feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="' + (seed + 6) + '" result="blot"/>',
    '<feColorMatrix in="blot" type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.45  0 0 0 0 0.2  0 0 0 0.6 -0.25" result="blotc"/>',
    '<feComposite in="blotc" in2="torn" operator="in" result="blotIn"/>',
    '<feMerge><feMergeNode in="torn"/><feMergeNode in="fibIn"/><feMergeNode in="blotIn"/></feMerge>',
    '</filter>',
    '<filter id="' + id + 's"><feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity=".45"/></filter>',
  ].join('');
}
// 쓰기: 종이 사각형에만 필터, 글자는 그 위에 따로 (흔들리지 않게)
// <defs>paperFilter('pf1')</defs>
// <g filter="url(#pf1s)"><rect width="124" height="148" fill="#f3e6c8" filter="url(#pf1)"/></g>
// <text ...>검사 보고서</text>`,
    },
    pitfalls: [
      { title: '필터 영역을 넓히지 않으면 찢긴 가장자리가 네모로 잘린다', fix: 'filter 에 x="-10%" y="-10%" width="120%" height="120%".' },
      { title: '글자까지 같은 필터 안에 넣으면 글자가 흔들려 읽기 어렵다', fix: '필터는 종이 사각형에만 걸고, 글자 · 줄은 바깥 g 에 따로 그린다.' },
      { title: '같은 화면에 같은 필터 id 가 둘이면 엉뚱한 필터가 걸린다', fix: '견본처럼 번호를 붙여(d2pf1, d2pf2 …) id 를 겹치지 않게.' },
      { title: '판이 움직이거나 커지는 애니메이션에 걸면 폰에서 버벅인다', fix: '정지한 판에만 쓰거나, 한 번 그림으로 구워 둔다.' },
    ],
    prev: ['u57'],
    next: ['u56'],
    refs: [
      { name: 'MDN — <feTurbulence>', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feTurbulence' },
      { name: 'MDN — <feDisplacementMap>', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDisplacementMap' },
    ],
  },
  u60: {
    id: 'u60',
    summary: '두께 → 몸통 그러데이션 → 흰 테 → 윗빛 → 글자를 한 겹씩 캔버스에 쌓아 반질반질한 게임 단추를 굽고, 색 세 개만 바꿔 여러 벌 만든다.',
    terms: [
      { en: 'Glossy button (layered canvas painting)', ko: '반짝 단추 — 겹을 쌓아 그리기' },
      { en: 'Linear gradient body', ko: '위 밝고 아래 진한 몸통' },
      { en: 'Gloss highlight band', ko: '윗부분 흰 빛 띠' },
      { en: 'Texture baking (canvas → texture)', ko: '한 번 구워 그림처럼 재사용' },
    ],
    goal: '{target}을(를) 반질반질한 게임 단추로 구워 줘 — 바닥 두께 · 몸통 그러데이션 · 흰 테 · 윗빛 띠 · 테두리 글자를 차례로 쌓고, 색 세 개(위 · 아래 · 두께)만 바꿔 여러 벌. 느낌은 {style}.',
    targets: ['「시작!」 같은 큰 단추', '보기 고르기 카드', '정답 · 오답 표시 판'],
    styles: ['캐주얼 모바일 게임', '파스텔 사탕', '진한 원색 장난감'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '바닥 두께: 몸통보다 edge(높이의 16%)만큼 아래에 진한 색 둥근 네모를 먼저 그린다 — 눌리면 몸통이 그만큼 내려간다.',
      '몸통: 위 밝은 색 → 아래 색 세로 그러데이션.',
      '흰 테: 몸통 안쪽으로 반 두께 들인 둥근 네모를 흰 선으로.',
      '윗빛: 위쪽 36% 높이에 흰색 0.75 → 0.08 그러데이션 띠, 글자는 두께 색 테두리 + 흰 채움. 색 세트는 [위, 아래, 두께] 세 개뿐이라 옷 갈아입히기가 쉽다.',
    ],
    when: ['아이들 게임의 큰 단추 · 카드를 그림 파일 없이 만들 때', 'Phaser 처럼 그러데이션을 직접 못 그리는 엔진에 쓸 텍스처'],
    avoid: ['납작한(flat) 디자인 화면 — 어울리지 않는다', '크기가 매 프레임 바뀌는 단추 — 그때마다 굽게 된다. 대신 크기별로 한 번 굽고 확대만'],
    cost: 'light',
    costNote: '크기 · 색마다 한 번 굽고(해상도 2배) 계속 재사용. 그리기 비용은 그림 한 장.',
    level: 1,
    must: [
      '겹 순서: 두께 → 몸통 → (무늬) → 흰 테 → 윗빛 → 글자',
      '색은 [위, 아래, 두께] 세 개로만 정하고 이름 붙인 세트로 (blue · orange · correct · wrong …)',
      '텍스처는 해상도 2배로 굽고 1/2 로 줄여 놓기 (또렷하게)',
      '같은 열쇠(종류-색-크기)면 다시 굽지 않기',
      '눌림은 몸통만 두께만큼 내려가게',
    ],
    done: [
      '단계를 하나씩 켜 보면 두께 · 몸통 · 흰 테 · 윗빛 · 글자가 차례로 쌓인다',
      '색 세트를 바꾸면 같은 모양의 다른 색 단추가 나온다',
      '누르면 몸통이 두께만큼 내려가고 바닥 두께는 그대로다',
      '확대해도 테두리 · 글자가 흐리지 않다',
    ],
    code: {
      lang: 'ts',
      title: '반짝 단추 한 장 굽기 (두께 · 몸통 · 흰 테 · 윗빛)',
      from: 'src/game/ui/glossy.ts paintGlossy() 를 캔버스만 쓰게 정리',
      body: `const SKINS = {
  blue: ['#7fbcff', '#2f74e8', '#1d4fb8'],
  orange: ['#ffcb7a', '#ff8a1f', '#c95e00'],
  correct: ['#7cf0b4', '#1fb868', '#138248'],
} as const; // [위 밝은 색, 아래 색, 두께 · 글자 테 색]
const RES = 2, PAD = 6;

function paintGlossy(skin: keyof typeof SKINS, w: number, h: number, edge = 9, radius = 30, border = 5) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((w + PAD * 2) * RES);
  cv.height = Math.ceil((h + edge + PAD * 2) * RES);
  const ctx = cv.getContext('2d')!;
  ctx.scale(RES, RES);
  const [top, bottom, edgeColor] = SKINS[skin];
  const x = PAD, y = PAD, r = Math.min(radius, w / 2, h / 2);
  // 1) 두께 (바닥)
  ctx.fillStyle = edgeColor;
  ctx.beginPath(); ctx.roundRect(x, y + edge, w, h, r); ctx.fill();
  // 2) 몸통
  const face = ctx.createLinearGradient(0, y, 0, y + h);
  face.addColorStop(0, top);
  face.addColorStop(1, bottom);
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  // 3) 흰 테
  ctx.lineWidth = border;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath(); ctx.roundRect(x + border / 2, y + border / 2, w - border, h - border, Math.max(4, r - border / 2)); ctx.stroke();
  // 4) 윗빛 띠 + 반짝 점
  const band = ctx.createLinearGradient(0, y + 8, 0, y + h * 0.5);
  band.addColorStop(0, 'rgba(255,255,255,0.55)');
  band.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = band;
  const inset = Math.min(12, w * 0.05);
  ctx.beginPath(); ctx.roundRect(x + inset, y + 9, w - inset * 2, h * 0.42, [Math.max(4, r - 12), Math.max(4, r - 12), 14, 14]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(x + Math.min(34, w * 0.14), y + Math.min(26, h * 0.16), 9, 5, -0.5, 0, Math.PI * 2); ctx.fill();
  return cv; // 그릴 땐 1/RES 로 줄여서, 본체 중심은 y + edge/2 아래
}`,
    },
    pitfalls: [
      { title: 'Phaser Graphics 로 그리면 그러데이션이 안 된다', fix: 'Canvas 2D 로 굽고 텍스처로 등록한다 (glossy.ts 가 이렇게 한다).', seen: true },
      { title: '해상도 1배로 구우면 폰 고해상도 화면에서 흐리다', fix: '2배(RES 2)로 굽고 1/2 로 줄여 놓는다.' },
      { title: '내용을 올릴 흰 카드에도 윗빛 띠를 넣으면 글자가 안 읽힌다', fix: '흰 카드(paper)는 gloss 를 끄고 테두리도 옅은 파랑으로.', seen: true },
      { title: '이미지를 그냥 가운데에 두면 두께 때문에 단추가 아래로 치우친다', fix: '본체 중심이 맞도록 y + edge/2 에 놓는다 (glossyImage).' },
    ],
    prev: ['u52'],
    next: ['i301', 'u56'],
    refs: [
      { name: 'MDN — CanvasRenderingContext2D.roundRect()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/roundRect' },
    ],
  },

  i73: {
    id: 'i73',
    summary: '구 · 캡슐로 짠 3D 인물에 화소마다 광선을 쏘아 2:1 등각 2D 그림으로 굽고, 몇 단계 명암 · 디더 · 테두리를 넣어 그림 없이 8방향 걷기 스프라이트를 만든다.',
    terms: [
      { en: 'Pre-rendered sprites', ko: '3D 를 미리 2D 그림으로 구워 쓰기' },
      { en: 'Sphere tracing (SDF ray marching)', ko: '거리 함수로 광선을 성큼성큼 보내 표면 찾기' },
      { en: 'Dimetric (2:1 isometric) projection', ko: '고도 30° 정사영 — 땅 네모가 2:1 마름모' },
      { en: 'Ordered (Bayer) dithering · toon ramp', ko: '4×4 바이어 디더 · 몇 단계 명암' },
    ],
    goal: '{target}을(를) 3D 기본 도형(타원체 · 캡슐)으로 짜고 2:1 등각 카메라로 화소마다 광선을 쏘아 2D 스프라이트로 구워 줘 — 4단계 명암 · 4×4 디더 · 바깥 테두리 · 안쪽 깊이 선, 8방향 × 걷기 4장. 그림체는 {style}.',
    targets: ['모자 쓴 아이 캐릭터', '동물 · 펫', '나무 · 바위 소품'],
    styles: ['따뜻한 도트 그림', '파스텔 장난감', '진한 레트로 게임'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 에선 모델을 Orthographic 카메라 + RenderTexture 로 방향마다 찍고 Point 필터로 줄인다.',
      godot: 'Godot 은 SubViewport + Camera3D(Orthogonal)로 방향마다 찍어 SpriteFrames 로.',
    },
    principle: [
      '인물을 타원체 · 캡슐 14개로 짠다. 각 도형은 「점에서 표면까지 거리」 함수(SDF)를 가진다.',
      '화소마다 2:1 등각 방향(고도 30°)으로 광선을 쏘고, 가장 가까운 도형 거리만큼 성큼 나아가다(최대 64걸음) 0.05 안쪽이면 맞은 것.',
      '맞은 곳의 법선 · 빛(N·L)으로 명암 값을 내고, 4×4 바이어 디더를 더해 4단계로 끊어 도형별 색 사다리에서 고른다.',
      '빈 칸인데 이웃이 몸이면 진한 자두색 테두리, 옆 화소가 3.2 넘게 앞에 있으면 안쪽 깊이 선. 눈 · 볼은 3D 점을 투영해 화소 하나로 찍는다.',
      '8방향 중 5방향(남 ~ 북)만 굽고 서쪽 셋은 좌우 뒤집기. 굽기는 한 프레임에 한 장씩 (20장).',
    ],
    when: ['그림 그릴 사람 없이 등각 2D 게임 캐릭터 · 소품이 많이 필요할 때', '방향 · 동작별 그림이 많은 스프라이트를 같은 그림체로 맞출 때'],
    avoid: ['실시간 3D 로 바로 그려도 되는 게임 — 굽는 단계가 필요 없다', '아주 큰 그림(수백 화소 넘게) — 화소마다 광선 64걸음이라 굽기가 느리다. 대신 three.js 로 찍어 줄이기'],
    cost: 'light',
    costNote: '굽기는 처음 한 번: 40×52 화소 × 광선 최대 64걸음 × 도형 14개. 한 프레임에 한 장씩 나눠 구워 멈춤 없음. 게임 중엔 drawImage 만.',
    level: 3,
    must: [
      '카메라는 정사영 2:1 등각(고도 30°) — 원근 금지',
      '명암은 몇 단계(기본 4) + 4×4 바이어 디더, 색은 도형 재질마다 4칸 색 사다리',
      '바깥 테두리는 검정이 아닌 진한 색(자두색), 안쪽 깊이 선도 넣기',
      '서쪽 3방향은 동쪽을 좌우 뒤집어 재사용, 굽기는 프레임당 한 장 (멈춤 없게)',
      '그릴 때 imageSmoothingEnabled = false 로 정수 배 확대',
    ],
    done: [
      '같은 인물을 「3D 도형(매끈한 명암)」과 「구운 그림(4단계 · 디더 · 테두리)」으로 나란히 보여 준다',
      '8방향 바퀴에서 인물이 걷기 4장으로 걷고, 서쪽은 뒤집힌 표시(⇋)가 있다',
      '명암 단계 2~6 슬라이더 · 테두리 켬/끔으로 다시 구워진다',
      '굽는 동안에도 화면이 멈추지 않는다 (굽는 중 n/20 표시)',
    ],
    code: {
      lang: 'ts',
      title: '맞은 화소를 4단계 명암 + 디더 + 테두리로 칠하기',
      from: 'demos/demosEpic.ts bake73() 를 정리 (광선 쏘기는 castAll)',
      body: `const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
const OUT = [58, 36, 48]; // 테두리: 검정 대신 진한 자두색

// H = castAll(prims, W, H, ...) — 화소마다 id(맞은 도형, 없으면 -1) · depth · 법선 nx ny nz
for (let k = 0; k < W * Ht; k++) {
  const x = k % W, y = (k / W) | 0;
  const id = H.id[k]!;
  const inside = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < Ht && H.id[yy * W + xx]! >= 0;
  if (id < 0) {
    // 빈 칸인데 이웃이 몸이면 바깥 테두리
    if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) put(k, OUT);
    continue;
  }
  const lam = Math.max(0, H.nx[k]! * L[0] + H.ny[k]! * L[1] + H.nz[k]! * L[2]);
  const shade = Math.min(1, 0.26 + 0.74 * lam);
  // 몇 단계 + 디더: 값에 바이어 문턱을 더해 반올림
  const v = shade * (steps - 1) + (bayer(x, y) - 0.5) * 0.95;
  const lvl = Math.max(0, Math.min(steps - 1, Math.round(v)));
  let col = rampAt(RAMPS[prims[id]!.m]!, lvl / (steps - 1));
  // 안쪽 깊이 선: 옆 화소가 3.2 넘게 앞이면 (나는 뒤) 어둡게
  const me = H.depth[k]!;
  const front = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < Ht && H.depth[yy * W + xx]! < me - 3.2;
  if (front(x - 1, y) || front(x + 1, y) || front(x, y - 1) || front(x, y + 1)) {
    const d0 = RAMPS[prims[id]!.m]![0]!;
    col = [(d0[0] + OUT[0]) / 2, (d0[1] + OUT[1]) / 2, (d0[2] + OUT[2]) / 2];
  }
  put(k, col);
}
// 8방향: dir 0~4 만 굽고, 5~7 은 8 - dir 을 좌우 뒤집어 그린다 (g.scale(-1, 1))`,
    },
    pitfalls: [
      { title: '테두리를 검정으로 하면 그림이 딱딱하고 어둡다', fix: '진한 자두색(58,36,48)처럼 어두운 따뜻한 색으로.' },
      { title: '디더 없이 단계만 끊으면 넓은 면에 줄무늬 띠가 생긴다', fix: '4×4 바이어 문턱을 더한 뒤 반올림한다.' },
      { title: '20장을 한 번에 구우면 시작할 때 멈춘다', fix: '한 프레임에 한 장씩 큐에서 꺼내 굽고 「굽는 중」 표시. 조절 값이 바뀌면 큐를 다시 채운다.' },
      { title: '눈 · 볼을 도형으로 만들면 너무 작아 사라지거나 뭉개진다', fix: '3D 점을 투영해 화소 하나로 찍고, 그 화소가 앞을 보고 깊이가 맞을 때만 그린다.' },
    ],
    prev: ['i446'],
    next: ['i304', 'i296'],
    refs: [
      { name: 'Wikipedia — Ordered dithering', url: 'https://en.wikipedia.org/wiki/Ordered_dithering' },
      { name: 'Inigo Quilez — distance functions', url: 'https://iquilezles.org/articles/distfunctions/' },
    ],
  },

  i80: {
    id: 'i80',
    summary: 'SVG 선에 「선 길이만큼의 점선 간격」을 주고 시작점을 길이 → 0 으로 밀어 선이 그려지는 것처럼 보이게 하고, 점을 살짝 흔들어 손그림 느낌을 낸다.',
    terms: [
      { en: 'SVG line drawing animation (stroke-dashoffset)', ko: '점선 시작점을 밀어 선이 그려지는 효과' },
      { en: 'stroke-dasharray', ko: '점선의 선 · 빈칸 길이' },
      { en: 'getTotalLength · getPointAtLength', ko: '경로 전체 길이 · 길이 위치의 점 (펜 끝 따라가기)' },
      { en: 'Hand-drawn jitter (wobble)', ko: '점을 조금씩 흔들어 손떨림' },
    ],
    goal: '{target}을(를) 펜이 그리듯 한 획씩 그려지게 해 줘 — stroke-dasharray = 선 길이, stroke-dashoffset 을 길이 → 0 으로. 점은 살짝 흔들어 {style}.',
    targets: ['도형 · 작도 단계', '증명 그림 · 그래프', '별 · 나선 같은 장식 선'],
    styles: ['화이트보드 손그림', '연필 스케치', '깔끔한 칠판 그림'],
    platforms: ['web', 'canvas'],
    platformHints: {
      canvas: '캔버스 2D 에서는 setLineDash([len, len]) + lineDashOffset 으로 같은 효과.',
    },
    principle: [
      '점선 간격(dasharray)을 선 전체 길이로 주면 「선 하나 + 같은 길이의 빈칸」이 된다.',
      '점선 시작점(dashoffset)을 길이만큼 밀면 빈칸만 보이고, 0 으로 줄이면 선이 처음부터 끝까지 드러난다 — 그려지는 것처럼.',
      '길이는 path.getTotalLength() 로 잰다. 펜 끝은 getPointAtLength(길이 × 진행) 자리에 둔다.',
      '손떨림: 점마다 씨앗 고정 난수로 ±wob/2 흔들고(끝점은 절반만), 점 사이는 이차 곡선(Q)으로 부드럽게 잇는다.',
    ],
    when: ['작도 · 풀이 과정을 순서대로 보여 줄 때', '선 그림을 손으로 그리는 듯 등장시키고 싶을 때'],
    avoid: ['채운 도형 · 그림 — 선(stroke)에만 된다. 대신 채움은 선이 끝난 뒤 투명도로', '아주 많은 선을 동시에 — DOM 이 무거워진다. 대신 캔버스'],
    cost: 'light',
    costNote: '선마다 속성 하나를 매 프레임 바꾸는 정도. 선 수십 개는 가볍다.',
    level: 1,
    must: [
      'dasharray 와 시작 dashoffset 은 getTotalLength() 로 잰 실제 길이',
      '손떨림은 씨앗 고정 난수 — 프레임마다 다시 흔들면 선이 떤다',
      '진행은 처음 빠르고 끝에서 느리게 (1 - (1-k)^1.6)',
      '펜 그림이 있으면 getPointAtLength 로 선 끝을 따라가게',
    ],
    done: [
      '별 → 나선 → 직선이 차례로 펜 끝을 따라 그려진다',
      '「손떨림」 0 → 8 로 선이 점점 삐뚤빼뚤해지고, 그 사이에도 떨리지는 않는다',
      '그리는 중 선 끝에 펜이 붙어 다닌다',
      '다 그린 뒤 다시 처음부터 반복된다',
    ],
    code: {
      lang: 'ts',
      title: '손떨림 경로 만들기 + 길이만큼 점선을 밀어 그리기',
      from: 'demos/demosWhiteboard.ts path() · board() build/update 를 정리',
      body: `type P = [number, number];
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// 점들을 손떨림 + 부드러운 곡선 경로로 (씨앗 고정 — 떨지 않는다)
function wobblyPath(pts: P[], wob: number, seed: number) {
  const r = rng(seed);
  const q = pts.map(([x, y], i) => {
    const k = i === 0 || i === pts.length - 1 ? 0.5 : 1; // 끝점은 덜 흔들기
    return [x + (r() - 0.5) * wob * k, y + (r() - 0.5) * wob * k] as P;
  });
  let d = 'M' + q[0]![0].toFixed(1) + ',' + q[0]![1].toFixed(1);
  for (let i = 1; i < q.length - 1; i++) {
    const [x, y] = q[i]!, [nx, ny] = q[i + 1]!;
    d += ' Q' + x.toFixed(1) + ',' + y.toFixed(1) + ' ' + ((x + nx) / 2).toFixed(1) + ',' + ((y + ny) / 2).toFixed(1);
  }
  const l = q[q.length - 1]!;
  return d + ' L' + l[0].toFixed(1) + ',' + l[1].toFixed(1);
}

const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
path.setAttribute('d', wobblyPath(starPts, 2, 40));
path.setAttribute('fill', 'none');
svg.appendChild(path);
const len = path.getTotalLength();
path.style.strokeDasharray = String(len);
path.style.strokeDashoffset = String(len); // 처음엔 빈칸만

function update(lt: number, t0 = 0.4, dur = 2) {
  const k = Math.max(0, Math.min(1, (lt - t0) / dur));
  const e = k < 1 ? 1 - Math.pow(1 - k, 1.6) : 1;
  path.style.strokeDashoffset = String(len * (1 - e));
  if (k > 0 && k < 1) {
    const p = path.getPointAtLength(len * e); // 펜 끝
    pen.setAttribute('transform', 'translate(' + p.x + ' ' + p.y + ')');
  }
}`,
    },
    pitfalls: [
      { title: '손떨림을 매 프레임 새 난수로 만들면 선이 부들부들 떤다', fix: '획마다 씨앗을 고정해 한 번만 경로를 만든다. 떨림 값을 바꿀 때만 다시 만든다.' },
      { title: '길이를 어림으로 주면 선이 덜 그려지거나 점선이 보인다', fix: 'getTotalLength() 로 잰 값을 dasharray · dashoffset 둘 다에.' },
      { title: 'stroke-linecap round 면 시작 전에 점 하나가 보인다', fix: '진행 0 일 때는 opacity 0 으로 숨기거나 offset 을 길이보다 조금 더 크게.' },
      { title: '화면 크기에 따라 선 굵기가 바뀌어 보인다', fix: 'viewBox 좌표로 그리면 굵기도 함께 맞춰진다. 고정 화소 굵기가 필요하면 vector-effect="non-scaling-stroke".' },
    ],
    prev: ['u57'],
    next: ['i79', 'i323'],
    refs: [
      { name: 'MDN — stroke-dashoffset', url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset' },
      { name: 'MDN — SVGGeometryElement.getTotalLength()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement/getTotalLength' },
    ],
  },
  u19: {
    id: 'u19',
    summary: '어두운 바탕빛에 손전등 · 전등 빛을 더한 「빛 지도」를 따로 그려 그림에 곱해, 2D 장면에 어둠 속 빛을 만든다.',
    terms: [
      { en: '2D lighting (light map multiply)', ko: '빛 지도를 그림에 곱하는 2D 조명' },
      { en: 'Ambient light', ko: '어디나 깔리는 어두운 바탕빛' },
      { en: "globalCompositeOperation 'lighter' · 'multiply'", ko: '빛끼리는 더하고, 그림에는 곱하기' },
      { en: 'Light2D (Unity URP)', ko: '유니티 2D 조명 — 이 방식의 원본' },
    ],
    goal: '{target}에 2D 조명을 넣어 줘 — 화면 밖 캔버스에 어두운 바탕빛을 깔고 손전등 · 전등 빛을 더한 뒤, 그 빛 지도를 그림에 곱한다. 분위기는 {style}.',
    targets: ['어두운 방 · 동굴 장면', '손전등으로 단서 찾기 화면', '밤 마을 배경'],
    styles: ['따뜻한 전등 빛', '푸르스름한 밤', '으스스한 손전등'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 2D Renderer 의 Light 2D (Global · Point · Freeform) 가 같은 일을 한다.',
      godot: 'Godot 은 CanvasModulate 로 어둡게 하고 PointLight2D 로 빛을 더한다.',
    },
    principle: [
      '그림(방)은 밝게 그대로 그려 둔다. 빛은 반 해상도 캔버스(빛 지도)에 따로 그린다.',
      '빛 지도를 먼저 어두운 바탕빛(amb 0.18, 파랑을 1.9배 — 푸른 어둠)으로 채운다.',
      "그 위에 'lighter'(더하기)로 빛마다 방사 그러데이션을 그린다 — 밝기는 (1 − 거리)^1.6 로 줄어든다. 전등은 0.85 + 0.15·sin(11t)·sin(5.3t) 으로 일렁인다.",
      "결과 = 그림을 그리고 그 위에 빛 지도를 'multiply'(곱하기)로 덮기. 빛 없는 곳은 바탕빛만큼 어둡고, 빛 아래만 원래 색이 산다.",
    ],
    when: ['2D 장면에 어둠 · 손전등 · 등불 분위기가 필요할 때', '유니티 2D 조명을 쓰던 게임을 웹으로 옮길 때 (SEVEN)'],
    avoid: ['입체 음영(요철)까지 필요할 때 — 곱하기 빛은 평평하다. 대신 노멀 맵 스프라이트 조명(i234)', '벽 뒤가 가려져야 할 때 — 빛이 벽을 뚫는다. 대신 시야 다각형(i235)으로 빛을 자르기'],
    cost: 'light',
    costNote: '빛 지도는 반 해상도라 칠할 화소가 1/4. 빛 몇 개 + 곱하기 한 번이면 폰도 가볍다.',
    level: 1,
    must: [
      '빛 지도는 따로 캔버스(반 해상도), 빛끼리는 lighter 로 더하기',
      '그림에는 multiply 로 곱하기 — 빛이 원래 색보다 밝게 만들지는 않는다',
      '바탕빛은 0 이 아니게 (완전 검정이면 아무것도 안 보인다), 조절 가능하게',
      '그리고 나면 globalCompositeOperation 을 source-over 로 되돌리기',
    ],
    done: [
      '「그림 × 빛 지도 = 결과」 세 장을 나란히 보여 주면 결과가 빛 자리만 밝다',
      '손전등이 움직이면 그 자리만 밝아지고, 전등은 살짝 일렁인다',
      '바탕빛 슬라이더를 올리면 어둠이 옅어진다',
      '조명 끔 / 켬 비교가 된다',
    ],
    code: {
      lang: 'ts',
      title: '빛 지도 그리기 → 그림에 곱하기',
      from: 'demos/demosLight.ts u19 draw() 를 정리',
      body: `// room: 밝게 그린 그림 (RW × RH) · light: 반 해상도 빛 지도 · out: 결과
const light = document.createElement('canvas');
light.width = RW / 2;
light.height = RH / 2;

function renderLit(o: CanvasRenderingContext2D, t: number, amb = 0.18) {
  const l = light.getContext('2d')!;
  const s = light.width / RW;
  // 1) 어두운 바탕빛 (파랑을 더 — 푸른 어둠)
  const a = Math.round(amb * 255);
  l.globalCompositeOperation = 'source-over';
  l.fillStyle = 'rgb(' + a + ',' + Math.round(a * 1.1) + ',' + Math.min(255, Math.round(a * 1.9)) + ')';
  l.fillRect(0, 0, light.width, light.height);
  // 2) 빛은 더하기
  l.globalCompositeOperation = 'lighter';
  const spot = (x: number, y: number, rad: number, c: [number, number, number], k: number) => {
    const gr = l.createRadialGradient(x * s, y * s, 0, x * s, y * s, rad * s);
    for (let i = 0; i <= 6; i++) {
      const q = i / 6;
      const v = Math.pow(1 - q, 1.6) * k;
      gr.addColorStop(q, 'rgb(' + Math.round(c[0] * v) + ',' + Math.round(c[1] * v) + ',' + Math.round(c[2] * v) + ')');
    }
    l.fillStyle = gr;
    l.beginPath();
    l.arc(x * s, y * s, rad * s, 0, Math.PI * 2);
    l.fill();
  };
  spot(RW / 2 + Math.sin(t * 0.7) * 200, 250 + Math.sin(t * 1.3) * 80, 125, [255, 250, 230], 1.1); // 손전등
  spot(380, 95, 170, [255, 210, 120], 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 5.3)); // 일렁이는 전등
  // 3) 그림 위에 빛 지도를 곱하기
  o.globalCompositeOperation = 'source-over';
  o.drawImage(room, 0, 0);
  o.globalCompositeOperation = 'multiply';
  o.drawImage(light, 0, 0, RW, RH);
  o.globalCompositeOperation = 'source-over';
}`,
    },
    pitfalls: [
      { title: '빛을 그림 위에 lighter 로 바로 더하면 어둠이 안 생기고 하얗게 뜬다', fix: '빛은 따로 빛 지도에 모아 두고, 그림에는 multiply 로 곱한다.' },
      { title: '바탕빛을 0 으로 두면 빛 밖이 새까매 아무것도 안 보인다', fix: '0.15~0.25 정도로, 파랑을 조금 더해 밤 느낌을 낸다.' },
      { title: '빛 지도를 전체 해상도로 그리면 폰에서 무겁다', fix: '반 해상도로 그리고 늘려 곱한다 — 빛은 부드러워서 티가 안 난다.' },
      { title: '글자 · 단추까지 곱하기 안에 넣으면 같이 어두워진다', fix: 'UI 는 곱하기를 끝낸 뒤 그 위에 그린다.' },
    ],
    prev: ['u52'],
    next: ['i234', 'i235'],
    refs: [
      { name: 'MDN — globalCompositeOperation (multiply · lighter)', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' },
    ],
  },

  i233: {
    id: 'i233',
    summary: '서기 · 걷기 · 뛰기 · 점프를 상태기가 고르고, 바뀔 때 0.3초 동안 앞뒤 두 자세 · 걸음 빠르기를 섞어 동작이 툭 끊기지 않게 한다.',
    terms: [
      { en: 'Animation state machine', ko: '동작 상태기 — 지금 어떤 동작인지 하나를 고른다' },
      { en: 'Cross-fade blending', ko: '바뀔 때 두 동작을 잠깐 섞기' },
      { en: 'Pose interpolation (lerp)', ko: '관절 각도를 사이값으로' },
      { en: 'Phase-synced cycles', ko: '걷기 · 뛰기가 같은 걸음 위상을 함께 써서 발이 튀지 않음' },
    ],
    goal: '{target}의 동작을 상태기로 바꿔 줘 — 서기 · 걷기 · 뛰기 · 점프 중 하나를 고르고, 바뀔 때 0.3초 동안 앞뒤 자세와 걸음 빠르기를 섞는다. 그림체는 {style}.',
    targets: ['옆으로 달리는 2D 캐릭터', '발판 게임 주인공', '걷는 동물 친구'],
    styles: ['밝은 만화', '귀엽고 통통한', '도트 레트로'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity Animator 의 상태 · 전환(Transition Duration)이 같은 일, 걷기↔뛰기는 Blend Tree.',
      godot: 'Godot 은 AnimationTree 의 AnimationNodeStateMachine (전환 xfade_time).',
    },
    principle: [
      '동작마다 「위상 p(0~1) → 자세(관절 각도 묶음)」 함수를 둔다 — 걷기는 엉덩이 ±0.5 rad, 뛰기는 ±0.95 rad.',
      '상태가 바뀌면 이전 상태 · 바뀐 시각을 적고, 섞는 무게 w = smooth(0, 0.3, 지난 시간) 을 0 → 1 로 올린다.',
      '자세 = lerp(이전 동작 자세, 지금 동작 자세, w). 걸음 빠르기(rate)도 같이 섞어 위상이 툭 튀지 않는다.',
      '걷기 · 뛰기는 같은 위상 p 를 함께 쓴다 — 왼발이 앞일 때 바뀌면 두 동작 다 왼발 앞이라 자연스럽다. 점프는 따로 시간(0.8초)으로.',
    ],
    when: ['동작이 3개 넘는 캐릭터', '달리다 멈추기 · 점프 뒤 착지가 툭 끊겨 보일 때'],
    avoid: ['동작 하나뿐인 소품 · 장식 — 그냥 반복 애니메이션', '프레임 그림만 있는 스프라이트 — 자세를 섞을 수 없다. 대신 아주 짧은 전환 프레임을 넣거나 겹쳐 흐리기'],
    cost: 'light',
    costNote: '관절 각도 11개를 섞는 정도라 계산은 거의 없다.',
    level: 2,
    must: [
      '상태는 한 번에 하나, 바뀐 순간(changeAt)과 이전 상태(prev)를 기억',
      '섞는 시간은 조절 가능하게 (기본 0.3초), 끄면 툭 바뀌는 것과 비교',
      '자세뿐 아니라 걸음 빠르기 · 이동 속도도 섞기',
      '걷기 · 뛰기는 같은 위상을 함께 쓰기',
      '프레임 시간은 고정 간격으로 나눠 돌리기 (느린 폰에서 슬로모션 금지)',
    ],
    done: [
      '서기 → 걷기 → 뛰기 → 점프 → 뛰기 → 걷기 → 서기가 이어지는 동안 팔다리가 튀지 않는다',
      '「섞기 끔」으로 바꾸면 상태가 바뀌는 순간 자세가 툭 바뀌는 것이 보인다',
      '오른쪽 위 상태 그래프에 지금 상태와 섞는 무게가 보인다',
      '섞는 시간 슬라이더로 0.1 ~ 0.6초를 바꿔 볼 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '상태 바뀜 → 0.3초 동안 자세 · 빠르기 섞기',
      from: 'demos/demosLook2.ts makeSpriteSM() 를 정리',
      body: `type Pose = Record<'hipL' | 'hipR' | 'kneeL' | 'kneeR' | 'shL' | 'shR' | 'bob' | 'lean', number>;
const TAU = Math.PI * 2;
const ANIMS: Record<string, (p: number) => Pose> = {
  idle: (p) => { const s = Math.sin(p * TAU); return { hipL: 0.06, hipR: -0.06, kneeL: 0.05, kneeR: 0.05, shL: 0.12 + s * 0.04, shR: -0.12 - s * 0.04, bob: s * 1.2, lean: 0 }; },
  walk: (p) => { const s = Math.sin(p * TAU), c = Math.cos(p * TAU); return { hipL: s * 0.5, hipR: -s * 0.5, kneeL: Math.max(0, -c) * 0.7 + 0.05, kneeR: Math.max(0, c) * 0.7 + 0.05, shL: -s * 0.45, shR: s * 0.45, bob: -Math.abs(s) * 2.5 + 1, lean: 0.06 }; },
  run: (p) => { const s = Math.sin(p * TAU), c = Math.cos(p * TAU); return { hipL: s * 0.95, hipR: -s * 0.95, kneeL: Math.max(0, -c) * 1.5 + 0.2, kneeR: Math.max(0, c) * 1.5 + 0.2, shL: -s, shR: s, bob: -Math.abs(s) * 5 + 2, lean: 0.22 }; },
};
const RATE: Record<string, number> = { idle: 0.45, walk: 1.25, run: 2.2 }; // 1초에 걸음 몇 번
const smooth = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerpPose = (a: Pose, b: Pose, k: number) => {
  const o = {} as Pose;
  for (const key of Object.keys(a) as (keyof Pose)[]) o[key] = a[key] + (b[key] - a[key]) * k;
  return o;
};

let cur = 'idle', prev = 'idle', changeAt = -10, phase = 0;
function step(t: number, h: number, want: string, blendDur = 0.3): Pose {
  if (want !== cur) { prev = cur; cur = want; changeAt = t; } // 상태 바뀜
  const w = smooth(0, blendDur, t - changeAt);               // 0 → 1
  phase = (phase + (RATE[prev]! + (RATE[cur]! - RATE[prev]!) * w) * h) % 1; // 빠르기도 섞기
  return lerpPose(ANIMS[prev]!(phase), ANIMS[cur]!(phase), w); // 같은 위상 · 두 자세 섞기
}`,
    },
    pitfalls: [
      { title: '동작마다 위상을 따로 두면 바뀌는 순간 발이 앞뒤로 튄다', fix: '걷기 · 뛰기는 같은 위상 p 를 함께 쓰고, 빠르기만 섞는다.' },
      { title: '자세만 섞고 이동 속도는 그대로 두면 미끄러지듯 보인다', fix: '이동 속도도 목표로 천천히 따라가게 (lerp(speed, target, dt·4)).' },
      { title: '섞는 중에 또 상태가 바뀌면 자세가 튄다', fix: '바뀔 때 「지금 섞인 자세」를 이전 자세로 저장해 두고 거기서 섞는다.' },
      { title: '프레임 시간을 0.05 로 자르면 느린 폰에서 동작이 슬로모션이 된다', fix: '실제 시간은 그대로 쓰고 고정 간격 조각으로 나눠 돌린다 (사이트 전체에서 고친 일).', seen: true },
    ],
    prev: ['i300'],
    next: ['i282'],
    refs: [
      { name: 'Unity 매뉴얼 — Animation State Machines', url: 'https://docs.unity3d.com/Manual/AnimationStateMachines.html' },
    ],
  },

  i234: {
    id: 'i234',
    summary: '평평한 그림 한 장에 높이 지도를 더해 화소마다 법선을 구하고, 움직이는 횃불 빛으로 음영 · 반사를 계산해 2D 그림이 입체로 보이게 한다.',
    terms: [
      { en: 'Normal-mapped sprite lighting', ko: '노멀 맵 스프라이트 조명' },
      { en: 'Height map → normal (central differences)', ko: '높이 지도 이웃 차이로 법선 만들기' },
      { en: 'Point light attenuation 1/(1 + k·d²)', ko: '거리 따라 약해지는 점광원' },
      { en: 'Blinn-Phong specular', ko: '반쯤 벡터로 반짝임' },
    ],
    goal: '{target}에 노멀 맵 조명을 넣어 줘 — 색 그림 + 높이 지도로 화소마다 법선을 구하고, 움직이는 점광원으로 음영 · 반짝임을 계산한다. 분위기는 {style}.',
    targets: ['돌벽 · 방패 · 금화가 있는 2D 배경', '동굴 속 단서 그림', '2D 캐릭터 스프라이트'],
    styles: ['일렁이는 횃불', '푸른 손전등', '따뜻한 촛불'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: {
      three: 'three.js 는 판 하나에 ShaderMaterial 로 (견본 방식). MeshStandardMaterial + normalMap + PointLight 로도 된다.',
      unity: 'Unity URP 2D 는 스프라이트 Secondary Texture 에 _NormalMap 을 넣고 Light 2D 의 Normal Maps 를 켠다.',
      godot: 'Godot 은 CanvasTexture 의 normal_texture 에 넣고 PointLight2D 를 비춘다.',
    },
    principle: [
      '색 그림(알베도)과 같은 크기의 높이 지도(흰 = 높음)를 그린다. 견본은 둘 다 캔버스로 — 방패 둥근 면은 방사 그러데이션, 숫자 7 은 흐림을 줄여 가며 겹쳐 둥근 턱.',
      '화소마다 좌우 · 위아래 이웃 높이 차로 법선 N = normalize((hl − hr)·세기, (hd − hu)·세기, 1). 세기 7.',
      '빛 L 은 화소에서 점광원으로 가는 방향. 밝기 = max(N·L, 0) × 감쇠 1/(1 + 3.5·d²).',
      '금속(색이 빨강 > 파랑인 곳)은 반짝임을 세게 · 좁게: pow(N·H, 18~60) × 0.15~1.6. 빛 자체 둘레엔 빛무리를 더한다.',
    ],
    when: ['2D 그림에 움직이는 빛을 비춰 입체감을 줄 때', '어둠 속 횃불로 벽의 요철 · 새긴 숫자를 드러낼 때'],
    avoid: ['빛이 움직이지 않는 장면 — 음영을 그림에 미리 그려 두는 게 낫다', '높이 지도를 만들 수 없는 그림 — 대신 2D 빛 지도 곱하기(u19)'],
    cost: 'light',
    costNote: '화소마다 텍스처 5번 읽기 + 몇 줄 계산. 화면 하나 크기 판은 폰도 가볍다.',
    level: 2,
    must: [
      '법선은 이웃 높이 차(중앙 차분)로 — 간격은 텍스처 화소 1.5칸',
      '높이 지도는 sRGB 변환 없이(선형) 읽기',
      '요철 세기 · 빛 높이를 조절 가능하게',
      '셰이더 안에 잡음 반복문 금지 — 높이는 미리 그린 텍스처로',
      '화면을 나눠 「그림만(평면 법선)」과 비교할 수 있게',
    ],
    done: [
      '빛이 움직이면 돌벽 틈 · 방패 테 · 숫자 7 의 빛 받는 쪽과 그늘이 바뀐다',
      '나눠 비교: 왼쪽 평면 조명은 납작, 오른쪽은 입체',
      '요철 세기 0 이면 납작해지고 16 이면 깊게 파인다',
      '금속 부분만 반짝임이 좁고 세다',
    ],
    code: {
      lang: 'glsl',
      title: '높이 지도 → 법선 → 점광원 음영 · 반짝임',
      from: 'demos/demosLook2.ts makeNormalSprite() 프래그먼트 셰이더를 정리',
      body: `uniform sampler2D uH, uA;  // 높이 지도 · 색 그림
uniform vec3 uLight;         // 빛 위치 (x 0~1.6, y 0~1, z 높이 0.14)
uniform float uStr;          // 요철 세기 (7)
uniform float uFl;           // 일렁임 0.9 + 0.1·sin(17t)·sin(7.3t)
varying vec2 vUv;
void main() {
  vec2 e = vec2(1.5 / 640.0, 1.5 / 400.0);
  float h  = texture2D(uH, vUv).r;
  float hl = texture2D(uH, vUv - vec2(e.x, 0.0)).r, hr = texture2D(uH, vUv + vec2(e.x, 0.0)).r;
  float hd = texture2D(uH, vUv - vec2(0.0, e.y)).r, hu = texture2D(uH, vUv + vec2(0.0, e.y)).r;
  vec3 N = normalize(vec3((hl - hr) * uStr, (hd - hu) * uStr, 1.0));
  vec3 alb = texture2D(uA, vUv).rgb;
  vec3 P = vec3(vUv.x * 1.6, vUv.y, h * 0.05);
  vec3 Lv = uLight - P; float d = length(Lv); vec3 L = Lv / d;
  float diff = max(dot(N, L), 0.0);
  float metal = smoothstep(0.05, 0.25, alb.r - alb.b);       // 금빛일수록 금속
  vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, Hh), 0.0), mix(18.0, 60.0, metal)) * mix(0.15, 1.6, metal);
  float att = 1.0 / (1.0 + d * d * 3.5);
  vec3 lc = vec3(1.0, 0.66, 0.32) * uFl;                      // 횃불 색
  vec3 col = alb * (vec3(0.025, 0.03, 0.05) + diff * lc * att * 3.2) + lc * spec * att * 2.0;
  float g = length(P.xy - uLight.xy);
  col += lc * (exp(-g * 22.0) * 0.9 + exp(-g * 6.0) * 0.08); // 빛 둘레 빛무리
  gl_FragColor = vec4(col, 1.0);
}`,
    },
    pitfalls: [
      { title: '높이 지도를 sRGB 색 텍스처로 읽으면 요철이 한쪽으로 치우친다', fix: '높이 텍스처는 색 공간 변환 없이(NoColorSpace) 읽는다. 견본도 canvasTex(hc, false) 로 따로 만든다.' },
      { title: '이웃 간격을 1화소로 두면 잡티까지 법선이 튄다', fix: '1.5화소 간격 + 높이 지도를 살짝 흐리게(blur 2px) 그려 둔다.' },
      { title: '그림 비율과 판 비율이 다르면 빛 자리와 음영이 어긋난다', fix: '빛 좌표와 화소 위치 P 를 같은 비율(가로 1.6 : 세로 1)로 계산한다.' },
      { title: '셰이더에서 잡음으로 요철을 만들면 컴파일이 멈춘다', fix: '요철은 미리 그린 높이 텍스처로. 반복문 잡음 셰이더는 윈도에서 17~20초 멈췄다.', seen: true },
    ],
    prev: ['u19', 'u10'],
    next: ['i235'],
    refs: [
      { name: 'Wikipedia — Normal mapping', url: 'https://en.wikipedia.org/wiki/Normal_mapping' },
      { name: 'Wikipedia — Blinn–Phong reflection model', url: 'https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model' },
    ],
  },

  i235: {
    id: 'i235',
    summary: '벽 꼭짓점마다 광선 3개를 쏘아 맞은 점을 각도 순으로 이어 「보이는 다각형」을 만들고, 그 안만 밝혀 벽 뒤는 어둠 속에 숨긴다.',
    terms: [
      { en: 'Visibility polygon (2D field of view)', ko: '한 점에서 보이는 영역 다각형' },
      { en: 'Ray casting to segment endpoints', ko: '벽 끝점마다 광선 쏘기 (±0.0001 rad 둘 더)' },
      { en: 'Ray–segment intersection', ko: '광선과 선분이 만나는 점' },
      { en: 'Clip path (ctx.clip)', ko: '다각형 안에만 그리기' },
    ],
    goal: '{target}의 시야를 2D 시야 다각형으로 그려 줘 — 벽 꼭짓점마다 광선 3개를 쏘아 맞은 점을 각도 순으로 잇고, 그 안만 밝힌다. 화면은 {style}.',
    targets: ['순찰하는 경비원 시야', '손전등 · 등불 빛 범위', '레이저 · 거울 퍼즐의 빛 닿는 곳'],
    styles: ['어둠 속 따뜻한 빛', '푸른 감시 카메라', '밝은 퍼즐 판'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity URP 2D 는 Shadow Caster 2D 를 벽에 붙이면 Light 2D 가 같은 그림자를 낸다.',
      godot: 'Godot 은 벽에 LightOccluder2D 를 두면 PointLight2D 그림자가 생긴다.',
    },
    principle: [
      '벽은 선분 목록. 보이는 영역의 모서리는 늘 어떤 벽의 끝점 방향에서만 꺾인다.',
      '그래서 끝점마다 각도 a 로 광선을 쏘되, a − 0.0001 · a · a + 0.0001 셋을 쏜다 — 모서리를 스쳐 뒤 벽까지 가는 광선을 잡으려고.',
      '광선마다 모든 선분과 만나는 점 중 가장 가까운 것(t 가 가장 작은 것)이 맞은 점.',
      '맞은 점들을 각도 순으로 정렬해 이으면 보이는 다각형. 그 안에만 clip 하고 바닥 · 빛을 그린다. 시야각을 줄이면 부채꼴 밖 각도는 버리고 경계 각도 17개를 더한다.',
      '보석 같은 물체는 그쪽으로 광선을 쏘아 벽보다 먼저 닿으면 「보임」.',
    ],
    when: ['경비원 · 적의 시야, 숨바꼭질 게임', '빛이 벽에 가려지는 2D 장면', '각도 · 반사 퍼즐'],
    avoid: ['벽 선분이 수천 개 — 광선 × 선분 계산이 많아진다. 대신 격자 그림자 투사나 공간 나누기(i263)로 후보 벽만', '벽이 둥근 곡선 — 선분으로 잘게 나눠야 한다'],
    cost: 'light',
    costNote: '광선 수 = 끝점 × 3, 광선마다 선분 전부 검사. 견본(선분 34개 → 광선 약 200개 × 34) 은 프레임당 수천 번 곱셈으로 가볍다.',
    level: 2,
    must: [
      '끝점마다 광선 3개 (a − ε, a, a + ε, ε = 0.0001)',
      '바깥 테두리도 벽 선분에 넣기 (광선이 무한히 나가지 않게)',
      '맞은 점은 각도 순으로 정렬해서 잇기 (360° 일 때 −π 부터, 부채꼴은 시작 각도부터)',
      '밝은 바닥은 다각형 clip 안에서만 그리기',
      '광선 보기 켬/끔 · 시야각 슬라이더',
    ],
    done: [
      '경비원이 돌아다니면 벽 뒤는 어둡고 보이는 곳만 밝다',
      '「광선 보기」를 켜면 꼭짓점마다 붉은 광선이 보인다',
      '시야각을 360° → 60° 로 줄이면 부채꼴이 되고 방향을 따라 돈다',
      '보이는 보석만 반짝이고 가려진 보석은 어둡다',
    ],
    code: {
      lang: 'ts',
      title: '끝점마다 광선 3개 → 각도 순 다각형',
      from: 'demos/demosLook2.ts makeVisibility() 의 cast · 각도 모으기를 정리',
      body: `type Seg = [number, number, number, number];
// 광선 (ox,oy) + t·(dx,dy) 와 선분이 만나는 가장 가까운 점
function cast(segs: Seg[], ox: number, oy: number, dx: number, dy: number): [number, number] {
  let best = 1e9;
  for (const [x1, y1, x2, y2] of segs) {
    const sx = x2 - x1, sy = y2 - y1;
    const den = dx * sy - dy * sx;
    if (Math.abs(den) < 1e-9) continue; // 나란함
    const t = ((x1 - ox) * sy - (y1 - oy) * sx) / den; // 광선 쪽 거리
    const s = ((x1 - ox) * dy - (y1 - oy) * dx) / den; // 선분 쪽 0~1
    if (t > 0 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return [ox + dx * best, oy + dy * best];
}

function visibility(segs: Seg[], px: number, py: number): [number, number][] {
  const angs: number[] = [];
  for (const [x1, y1, x2, y2] of segs)
    for (const [x, y] of [[x1, y1], [x2, y2]] as const) {
      const a = Math.atan2(y - py, x - px);
      angs.push(a - 1e-4, a, a + 1e-4); // 모서리를 스쳐 지나가는 광선까지
    }
  angs.sort((a, b) => a - b);
  return angs.map((a) => cast(segs, px, py, Math.cos(a), Math.sin(a)));
}

// 그리기: 다각형 안에만 밝은 바닥
const pts = visibility(segs, px, py);
g.save();
g.beginPath();
pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
g.closePath();
g.clip();
const gr = g.createRadialGradient(px, py, 4, px, py, 190);
gr.addColorStop(0, '#fff3c4');
gr.addColorStop(0.35, '#e8c27a');
gr.addColorStop(1, '#4a3a2a');
g.fillStyle = gr;
g.fillRect(0, 0, 280, 175);
g.restore();`,
    },
    pitfalls: [
      { title: '끝점 정확히 한 방향으로만 쏘면 모서리 뒤로 새는 빛이 빠진다', fix: '±0.0001 rad 광선 두 개를 더 쏜다.' },
      { title: '바깥 테두리 벽이 없으면 광선이 끝없이 나가 다각형이 깨진다', fix: '화면 네 변도 선분으로 넣는다.' },
      { title: '부채꼴 시야에서 각도를 −π 부터 정렬하면 다각형이 꼬인다', fix: '시야 시작 각도(방향 − 반각)로부터의 거리로 정렬하고, 경비원 자리에서 시작해 닫는다.' },
      { title: '벽이 많아지면 프레임이 떨어진다', fix: '광선 × 선분이 늘어나니, 경비원 둘레 상자 안 벽만 후보로 골라 검사한다 (쿼드트리 i263).' },
    ],
    prev: ['u19'],
    next: ['i306', 'i263'],
    refs: [
      { name: 'Wikipedia — Visibility polygon', url: 'https://en.wikipedia.org/wiki/Visibility_polygon' },
    ],
  },

  i236: {
    id: 'i236',
    summary: '그림은 색 번호로만 그려 두고 팔레트의 몇 칸만 매 프레임 돌려, 그림을 다시 그리지 않고도 폭포 · 물결 · 반짝이가 흐르게 한다.',
    terms: [
      { en: 'Palette color cycling', ko: '팔레트 색 순환 — 색 표만 돌려 움직임' },
      { en: 'Indexed color image', ko: '색 번호(0~255)로 그린 그림' },
      { en: 'Palette rotation (modulo)', ko: '나머지 연산으로 색 칸 돌리기' },
      { en: 'Uint32Array pixel buffer', ko: '화소를 32비트 한 덩이로 빠르게 쓰기' },
    ],
    goal: '{target}을(를) 팔레트 색 순환으로 움직여 줘 — 그림은 색 번호로 한 번만 그리고, 폭포 · 물결 칸의 팔레트만 매 프레임 돌린다. 그림체는 {style}.',
    targets: ['폭포 · 호수가 있는 배경', '네온 간판 · 불빛 줄', '흐르는 강 · 용암'],
    styles: ['레트로 도트 노을', '파스텔 동화', '밤 네온'],
    platforms: ['canvas', 'three', 'godot'],
    platformHints: {
      three: 'three.js 에선 색 번호 텍스처 + 팔레트 1줄 DataTexture(NearestFilter)를 셰이더에서 찾아 읽고, 팔레트 텍스처만 매 프레임 갱신한다.',
      godot: 'Godot 은 같은 방식을 CanvasItem 셰이더로 — 색 번호 텍스처 · 팔레트 텍스처 둘 다 filter_nearest.',
    },
    principle: [
      '그림은 화소마다 색이 아니라 「색 번호」(Uint8Array)를 가진다. 실제 색은 팔레트 표(256칸)에서 찾는다.',
      '폭포는 32~47번 16칸에 흰 줄이 섞인 색을, 그림에는 세로로 (y − 열마다 다른 값) mod 16 번호를 칠해 둔다.',
      '매 프레임 그 16칸만 (i − 밀림) mod 16 으로 돌려 보여 줄 표를 만든다 — 번호는 그대로인데 흰 줄이 아래로 흐른다.',
      '칸 묶음마다 빠르기를 다르게 (폭포 1 · 호수 0.5 · 해 반사 0.7). 화소는 Uint32Array 로 한 번에 써서 putImageData.',
    ],
    when: ['물 · 불 · 빛이 흐르는 레트로 배경을 가볍게 움직일 때', '주기 · 나머지를 눈으로 보여 주고 싶을 때'],
    avoid: ['사진 · 그러데이션이 많은 그림 — 색 번호로 줄이기 어렵다', '물체가 실제로 움직여야 할 때 — 색 순환은 「흐르는 느낌」만. 대신 스프라이트 이동'],
    cost: 'light',
    costNote: '192×120 = 2.3만 화소를 표 찾기로 칠하는 정도. 그림을 다시 그리지 않으니 폰도 가볍다.',
    level: 2,
    must: [
      '그림은 색 번호로 한 번만 만들고, 매 프레임은 팔레트만 돌리기',
      '도는 칸 묶음마다 길이(16 · 8)와 빠르기를 따로',
      '음수 나머지 주의 — ((i − o) % n + n) % n',
      '키울 때 imageSmoothingEnabled = false (번호 경계가 섞이지 않게)',
      '도는 팔레트 띠를 아래에 보여 주기',
    ],
    done: [
      '색 순환을 켜면 폭포 흰 줄이 흐르고 호수 물결 · 해 반사가 반짝인다',
      '끄면 같은 그림이 멈춘 그림이 된다 — 그림 자체는 바뀌지 않음',
      '아래 팔레트 띠의 칸들이 옆으로 도는 것이 보인다',
      '빠르기 0 ~ 4 슬라이더',
    ],
    code: {
      lang: 'ts',
      title: '색 번호 그림 + 팔레트 칸만 돌리기',
      from: 'demos/demosLook2.ts makeCycle() draw() 를 정리',
      body: `const W = 192, H = 120;
const idx = new Uint8Array(W * H);  // 그림 = 색 번호 (한 번만 그린다)
const pal = new Uint32Array(256);   // 원래 팔레트 (ABGR 한 덩이)
const rgb = (r: number, g: number, b: number) => (255 << 24) | (b << 16) | (g << 8) | r;
// 폭포 32..47: 흰 줄이 섞인 16색
[255, 220, 170, 120, 90, 70, 60, 70, 90, 120, 150, 110, 80, 70, 100, 180]
  .forEach((v, i) => (pal[32 + i] = rgb(Math.round(v * 0.75), Math.round(v * 0.92), Math.min(255, v + 40))));
// … 하늘 0..15 · 바위 16..27 · 호수 48..63 · 해 반사 64..71 도 같은 식으로
// 그림 칠하기 예: 폭포 칸은 세로로 번호가 이어지게 → idx[i] = 32 + (((y - col) % 16) + 16) % 16

const cv = document.createElement('canvas');
cv.width = W; cv.height = H;
const cg = cv.getContext('2d')!;
const img = cg.createImageData(W, H);
const buf = new Uint32Array(img.data.buffer);
const shown = new Uint32Array(256);
let off = 0;
const rot = (base: number, n: number, o: number) => {
  for (let i = 0; i < n; i++) shown[base + i] = pal[base + ((((i - o) % n) + n) % n)]!;
};
function draw(g: CanvasRenderingContext2D, dt: number, speed = 1) {
  off += dt * speed * 12;
  shown.set(pal);
  rot(32, 16, Math.floor(off));       // 폭포
  rot(48, 16, Math.floor(off * 0.5)); // 호수 (느리게)
  rot(64, 8, Math.floor(off * 0.7));  // 해 반사
  for (let i = 0; i < W * H; i++) buf[i] = shown[idx[i]!]!;
  cg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;   // 번호 경계를 섞지 않게
  g.drawImage(cv, 0, 0, W * 4, H * 4);
}`,
    },
    pitfalls: [
      { title: '음수 나머지를 그대로 쓰면 팔레트 칸 밖을 읽는다', fix: 'JS 의 % 는 음수를 돌려주니 ((i − o) % n + n) % n 으로.' },
      { title: '그림에 번호를 줄무늬 없이 한 칸으로 칠하면 돌려도 깜빡이기만 한다', fix: '흐르는 쪽으로 번호가 차례로 이어지게 (y − 열 값) mod 16 으로 칠한다.' },
      { title: 'Uint32 색을 RGBA 순서로 넣으면 색이 뒤바뀐다', fix: '보통 컴퓨터(리틀 엔디언)는 (A << 24) | (B << 16) | (G << 8) | R 순서.' },
      { title: '키울 때 부드럽게 그리면 번호 경계가 흐려진다', fix: 'imageSmoothingEnabled = false 로 정수 배.' },
    ],
    prev: ['i296'],
    next: ['u54'],
    refs: [
      { name: 'Wikipedia — Indexed color', url: 'https://en.wikipedia.org/wiki/Indexed_color' },
    ],
  },
  i294: {
    id: 'i294',
    summary: '그림 알파 둘레로 거리 지도를 만들어 n칸 넓힌 테와 멀리 옅게 퍼지는 빛 무리를 구워, 고른 캐릭터만 테두리가 빛나게 한다.',
    terms: [
      { en: 'Sprite outline (alpha dilation)', ko: '알파 넓히기로 만든 그림 테두리' },
      { en: 'Distance transform (chamfer 1 · √2)', ko: '각 화소에서 가장 가까운 그림까지 거리 — 두 번 훑기' },
      { en: 'Glow halo exp(−d/k)', ko: '거리 따라 옅어지는 빛 무리' },
      { en: 'Selection highlight', ko: '고른 것 표시' },
    ],
    goal: '{target}에 고르면 빛나는 테두리를 넣어 줘 — 그림 알파로 거리 지도를 만들어 n칸 넓힌 테 + 멀리 옅게 퍼지는 빛 무리. 색은 {style}.',
    targets: ['고른 캐릭터 · 친구', '주울 수 있는 아이템', '누를 수 있는 카드'],
    styles: ['노란 빛 테', '하늘빛 테', '분홍 반짝 테'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 스프라이트 셰이더에서 둘레 몇 방향 알파를 읽어 최댓값으로 테를 만든다 (Shader Graph 로도).',
      godot: 'Godot 은 CanvasItem 셰이더에서 TEXTURE_PIXEL_SIZE 만큼 둘레 알파를 읽어 테를 만든다.',
    },
    principle: [
      '그림을 둘레 여백(PAD 26)을 둔 캔버스에 놓고, 알파가 110 넘는 화소는 거리 0, 나머지는 아주 큰 값으로 시작한다.',
      '위→아래 · 왼→오른 한 번, 반대로 한 번 훑으며 이웃 거리 + 1(옆) · +√2(대각)로 줄여 나가면 「가장 가까운 그림까지 거리」 d 가 된다.',
      '테: 알파 = clamp(r + 0.5 − d) — r칸 안쪽은 꽉 차고 경계는 반 칸 부드럽게. 빛 무리: 알파 = exp(−d/7)·0.95.',
      '테 · 빛 무리는 두께 · 색마다 한 번 구워 캐시하고, 빛 무리는 lighter 로 깜빡이게 겹친 뒤 → 테 → 원래 그림 순으로 그린다.',
    ],
    when: ['고른 것 · 누를 수 있는 것을 또렷하게 표시할 때', '모양이 제각각인 그림에 고른 두께의 테두리가 필요할 때'],
    avoid: ['네모 카드 · 단추 — CSS outline · box-shadow 가 더 간단하다', '매 프레임 모양이 바뀌는 그림 — 거리 지도를 계속 다시 구워야 한다. 대신 셰이더로 둘레 알파 읽기'],
    cost: 'light',
    costNote: '거리 지도는 그림마다 한 번 (180×180 화소 두 번 훑기). 테 · 빛 무리는 두께 · 색마다 한 번 굽고 drawImage 만.',
    level: 2,
    must: [
      '테 두께는 거리 지도로 — 그림을 여러 방향으로 밀어 찍는 꼼수는 두꺼우면 울퉁불퉁하다',
      '여백(PAD)을 테 + 빛 무리보다 넉넉히 (견본 26)',
      '테 · 빛 무리는 두께 · 색 열쇠로 캐시',
      '그리는 순서: 빛 무리(lighter) → 테 → 원래 그림',
      '고른 것만 표시 — 나머지는 원래 그림만',
    ],
    done: [
      '고른 친구 둘레에 고른 두께의 테가 생기고, 다른 친구는 테가 없다',
      '테 두께 1 ~ 12 슬라이더로 두께가 바뀌어도 모서리가 둥글고 고르다',
      '빛 무리를 켜면 테 바깥으로 옅은 빛이 깜빡인다',
      '테 색 바꾸기 단추로 노랑 · 하늘 · 분홍',
    ],
    code: {
      lang: 'ts',
      title: '알파 → 거리 지도(두 번 훑기) → 테 · 빛 무리',
      from: 'demos/demos2dLook.ts distField() · fieldCanvas() · mkI294() 를 정리',
      body: `function distField(src: HTMLCanvasElement, pad: number) {
  const W = src.width + pad * 2, H = src.height + pad * 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, pad, pad);
  const a = x.getImageData(0, 0, W, H).data;
  const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) d[i] = a[i * 4 + 3]! > 110 ? 0 : 1e6;
  const D = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { // 앞으로 훑기
    const i = y * W + xx; let v = d[i]!;
    if (xx > 0) v = Math.min(v, d[i - 1]! + 1);
    if (y > 0) { v = Math.min(v, d[i - W]! + 1); if (xx > 0) v = Math.min(v, d[i - W - 1]! + D); if (xx < W - 1) v = Math.min(v, d[i - W + 1]! + D); }
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let xx = W - 1; xx >= 0; xx--) { // 거꾸로 훑기
    const i = y * W + xx; let v = d[i]!;
    if (xx < W - 1) v = Math.min(v, d[i + 1]! + 1);
    if (y < H - 1) { v = Math.min(v, d[i + W]! + 1); if (xx < W - 1) v = Math.min(v, d[i + W + 1]! + D); if (xx > 0) v = Math.min(v, d[i + W - 1]! + D); }
    d[i] = v;
  }
  return { d, W, H, c }; // c = 여백 둔 원래 그림
}
function fieldCanvas(f: { d: Float32Array; W: number; H: number }, fn: (d: number) => number, col: [number, number, number]) {
  const c = document.createElement('canvas');
  c.width = f.W; c.height = f.H;
  const x = c.getContext('2d')!;
  const im = x.createImageData(f.W, f.H);
  for (let i = 0; i < f.W * f.H; i++) {
    const a = fn(f.d[i]!);
    if (a <= 0) continue;
    im.data.set([col[0], col[1], col[2], Math.round(Math.min(1, a) * 255)], i * 4);
  }
  x.putImageData(im, 0, 0);
  return c;
}
const f = distField(buddyCanvas, 26);
const ring = fieldCanvas(f, (d) => (d <= 0 ? 1 : Math.max(0, Math.min(1, 5 + 0.5 - d))), [255, 243, 166]); // 5칸 테
const halo = fieldCanvas(f, (d) => Math.exp(-d / 7) * 0.95, [255, 243, 166]);
// 그리기: 'lighter' 로 halo (알파 0.45 + 0.3·sin(6t)) → ring → f.c`,
    },
    pitfalls: [
      { title: '그림을 8방향으로 밀어 찍어 테를 만들면 두꺼울 때 모서리가 각진다', fix: '거리 지도로 만들면 어떤 두께든 둥글고 고르다.' },
      { title: '여백 없이 구우면 테가 캔버스 끝에서 잘린다', fix: '테 + 빛 무리 길이보다 넉넉한 여백(26)을 두고, 그릴 때 그만큼 바깥으로 놓는다.' },
      { title: '반투명 가장자리(안티앨리어스)까지 그림으로 치면 테가 뚱뚱해진다', fix: '알파 문턱(110)을 넘는 화소만 그림으로 친다.' },
      { title: '두께를 바꿀 때마다 매 프레임 다시 구우면 끊긴다', fix: '두께 · 색을 열쇠로 캐시한다.' },
    ],
    prev: ['u52'],
    next: ['i301', 'i296'],
    refs: [
      { name: 'Wikipedia — Distance transform', url: 'https://en.wikipedia.org/wiki/Distance_transform' },
    ],
  },

  i296: {
    id: 'i296',
    summary: '도트 그림을 색 번호(0~7)로 한 번만 그리고 색 표만 갈아 끼워, 같은 그림으로 팀 색 · 피격 깜빡임 · 얼음 · 무지개 돌리기를 만든다.',
    terms: [
      { en: 'Palette swap', ko: '색 표 바꾸기 — 같은 그림, 다른 색' },
      { en: 'Indexed sprite', ko: '색 번호로 그린 스프라이트' },
      { en: 'Hit flash', ko: '맞았을 때 흰색 · 빨강 번갈아 깜빡' },
      { en: 'Hue rotation palette', ko: '색상(hue)을 돌린 색 표' },
    ],
    goal: '{target}을(를) 색 번호 그림 + 색 표로 바꿔 줘 — 같은 그림에 색 표만 갈아 끼워 팀 색 · 피격 깜빡임 · 얼음 상태를 낸다. 그림체는 {style}.',
    targets: ['16×16 도트 슬라임', '팀마다 색이 다른 말 · 유닛', '상태(얼음 · 독)가 바뀌는 캐릭터'],
    styles: ['선명한 도트', '파스텔', '진한 레트로'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 색 번호를 담은 그레이 그림 + 팔레트 텍스처를 셰이더에서 찾아 읽는다 (Point 필터, 압축 끔).',
      godot: 'Godot 은 CanvasItem 셰이더에서 색 번호로 팔레트 텍스처를 읽는다 (filter_nearest).',
    },
    principle: [
      '그림은 화소마다 번호 0~7 만 가진다: 0 투명 · 1 외곽선 · 2 몸 · 3 그늘 · 4 빛 · 5 눈 흰자 · 6 장식 · 7 볼.',
      '색 표는 번호 → 색 배열 8칸. 원래 · 파랑 팀 · 피격(빨강) · 흰색 · 얼음 표를 따로 둔다.',
      '표마다 한 번 칠해 작은 캔버스로 구워 두고 골라 쓴다 — 그림을 새로 그릴 일이 없다.',
      '피격: 0.45초 동안 0.07초마다 「피격 ↔ 흰색」 표를 번갈아. 무지개는 hue 가 바뀔 때만 표를 새로 만들어 다시 굽는다.',
    ],
    when: ['같은 캐릭터를 팀 · 상태별 색으로 여러 벌 쓸 때', '맞았을 때 깜빡임 · 얼어붙음 같은 상태 표시'],
    avoid: ['그러데이션 · 사진 그림 — 번호 몇 개로 나눌 수 없다. 대신 색 곱하기(source-atop) 물들이기', '색만 살짝 어둡게 — filter brightness 가 더 간단'],
    cost: 'light',
    costNote: '색 표마다 16×16 한 번 굽기. 게임 중엔 drawImage 만. 무지개도 hue 가 바뀔 때만 다시 굽는다.',
    level: 1,
    must: [
      '그림은 번호 배열 하나, 색은 표에서만 — 그림에 색을 직접 칠하지 않기',
      '번호의 뜻(외곽선 · 몸 · 그늘 …)을 정해 두고 모든 표가 같은 뜻을 따르기',
      '표마다 한 번 구워 캐시, 키울 땐 imageSmoothingEnabled = false',
      '피격 깜빡임은 0.07초 간격으로 표 두 개 번갈아',
    ],
    done: [
      '같은 슬라임이 원래 · 파랑 팀 · 피격 · 얼음 · 무지개로 나란히 보인다',
      '피격은 0.45초 동안 빨강 ↔ 흰색으로 깜빡이며 살짝 흔들린다',
      '색 표 보기를 켜면 각 슬라임 아래 7칸 색 표가 보인다',
      '확대해도 칸 경계가 번지지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '색 번호 그림 × 색 표 → 구워 두고 골라 쓰기',
      from: 'demos/demos2dLook.ts pixCanvas() · SL_PAL · mkI296() 를 정리',
      body: `const PN = 16;
type Pal = (string | null)[]; // 번호 → 색 (0 = 투명)
const PALS: Record<string, Pal> = {
  orig:  [null, '#1d3b2a', '#7ad65a', '#3f9c46', '#e4ffd2', '#ffffff', '#ffb43c', '#ff8fa8'],
  team:  [null, '#16213e', '#5ea8ff', '#2f5fd0', '#dff0ff', '#ffffff', '#ffd43c', '#ff9ac0'],
  hit:   [null, '#5a0f14', '#ff4d5e', '#c21f35', '#ffd0d6', '#ffffff', '#ffe0a0', '#ffffff'],
  white: [null, '#ffffff', '#ffffff', '#ffe9ec', '#ffffff', '#ffffff', '#ffffff', '#ffffff'],
  ice:   [null, '#1c4b66', '#bdf4ff', '#7ccde8', '#ffffff', '#ffffff', '#9be7ff', '#ffc9e0'],
};
function pixCanvas(idx: Uint8Array, pal: Pal) {
  const c = document.createElement('canvas');
  c.width = c.height = PN;
  const x = c.getContext('2d')!;
  const im = x.createImageData(PN, PN);
  for (let i = 0; i < PN * PN; i++) {
    const col = pal[idx[i]!];
    if (!col) continue;
    const n = parseInt(col.slice(1), 16);
    im.data.set([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255], i * 4);
  }
  x.putImageData(im, 0, 0);
  return c;
}
// 표마다 한 번 굽기
const baked = Object.fromEntries(Object.entries(PALS).map(([k, p]) => [k, pixCanvas(SLIME, p)]));

function spriteFor(state: 'orig' | 'team' | 'ice' | 'hit', hitT: number) {
  if (state === 'hit' && hitT < 0.45) return Math.floor(hitT / 0.07) % 2 ? baked.hit! : baked.white!; // 깜빡
  return baked[state]!;
}
// 그리기: g.imageSmoothingEnabled = false; g.drawImage(spriteFor(s, t % 2.2), x, y, 32, 32);`,
    },
    pitfalls: [
      { title: '색을 그림에 직접 칠해 두면 팀 색을 바꿀 때마다 그림을 새로 그려야 한다', fix: '그림은 번호로, 색은 표로 나눈다.' },
      { title: '번호 뜻이 표마다 다르면 눈 · 볼 자리 색이 뒤죽박죽된다', fix: '번호마다 부위를 정해 두고(1 외곽선 · 2 몸 …) 모든 표가 따른다.' },
      { title: '피격 깜빡임을 매 프레임 바꾸면 너무 빨라 회색으로 보인다', fix: '0.07초 간격으로 표 두 개를 번갈아 쓴다.' },
      { title: '무지개 표를 매 프레임 다시 구우면 쓸데없이 바쁘다', fix: 'hue 정수가 바뀔 때만 다시 굽는다.' },
    ],
    prev: ['i73'],
    next: ['i236', 'i294'],
    refs: [
      { name: 'Wikipedia — Palette swap', url: 'https://en.wikipedia.org/wiki/Palette_swap' },
    ],
  },

  i297: {
    id: 'i297',
    summary: '같은 그림을 납작하게 눌러 해 반대쪽으로 기울이면 바닥 그림자, 거꾸로 뒤집어 줄마다 흔들면 물 반사가 되어 2D 장면에 깊이가 생긴다.',
    terms: [
      { en: 'Projected sprite shadow (skew + squash)', ko: '눌러 기울인 그림자' },
      { en: 'Water reflection (flip + scanline wave)', ko: '거꾸로 뒤집고 줄마다 흔든 반사' },
      { en: 'ctx.transform(a, b, c, d, e, f)', ko: '캔버스 기울이기 · 누르기 행렬' },
      { en: 'Silhouette tint (source-atop)', ko: '그림 모양 그대로 한 색으로 칠하기' },
    ],
    goal: '{target}에 2D 바닥 그림자와 물 반사를 넣어 줘 — 그림을 눌러 해 반대쪽으로 기울인 흐린 그림자, 물에는 거꾸로 뒤집어 줄마다 흔든 반사. 분위기는 {style}.',
    targets: ['물가에 선 캐릭터 · 버섯', '연못 위를 뛰는 친구', '바닥에 놓인 소품'],
    styles: ['노을 진 물가', '맑은 낮 호수', '달밤 연못'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 그림자용 SpriteRenderer 를 하나 더 두고 Transform 을 눌러 기울이거나, 반사는 flipY 스프라이트 + 물결 셰이더.',
      godot: 'Godot 은 그림자 Sprite2D 에 skew · scale 을, 반사는 flip_v + 물결 셰이더.',
    },
    principle: [
      '그림자: 그림을 어두운 보라 한 색으로 칠하고(source-atop) 3px 흐리게 구워 둔다.',
      '발 자리에서 transform(1, 0, skew, 0.32, 0, 0) — 세로를 0.32 로 누르고 위쪽을 옆으로 밀어 해 반대쪽으로 눕힌다. 해가 움직이면 skew 가 따라 바뀐다.',
      '뛰어오르면 그림자를 옅게(0.45 → 최대 60% 줄임) · 작게 한다.',
      '반사: 물 아래만 clip 하고 그림을 22줄로 잘라 줄마다 위아래 뒤집어 그린다. 줄마다 sin(3t + 0.7·i) × 물결 세기만큼 옆으로 밀고, 아래로 갈수록 옅게.',
    ],
    when: ['위에서 비스듬히 보는 2D 장면에 바닥감 · 깊이감을 줄 때', '물가 장면에 반사를 넣을 때'],
    avoid: ['위에서 바로 내려다보는 판 — 기울인 그림자보다 발밑 동그란 그림자가 맞다', '반사할 물체가 아주 많을 때 — 22줄 × 물체 수만큼 drawImage. 대신 장면을 한 번 그린 캔버스를 통째로 뒤집기'],
    cost: 'light',
    costNote: '그림자는 미리 구운 그림 한 장, 반사는 물체마다 drawImage 22번. 물체 몇 개는 가볍다.',
    level: 1,
    must: [
      '그림자는 원래 그림을 한 색 + 흐림으로 미리 구워 두기 (매 프레임 흐림 금지)',
      '그림자 기울기는 해 위치를 따라가게',
      '반사는 물 영역 clip 안에서만, 줄마다 다른 위상으로 흔들기',
      '반사는 아래로 갈수록 옅게',
      '그림자 · 반사 켬/끔 · 물결 세기 조절',
    ],
    done: [
      '해가 왼쪽에서 오른쪽으로 가면 그림자가 반대쪽으로 기운다',
      '친구가 뛰어오르면 그림자가 옅고 작아진다',
      '물에 거꾸로 비친 그림이 줄마다 일렁인다',
      '물결 세기 0 이면 반사가 거울처럼 또렷하다',
    ],
    code: {
      lang: 'ts',
      title: '눌러 기울인 그림자 + 줄마다 흔든 물 반사',
      from: 'demos/demos2dLook.ts mkI297() putObj() 를 정리',
      body: `const S = 128; // 원래 그림 크기
function tinted(src: HTMLCanvasElement, col: string) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop'; // 그림 모양 안에만 칠하기
  x.fillStyle = col;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
function shadowOf(src: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  c.width = c.height = S + 24;
  const x = c.getContext('2d')!;
  x.filter = 'blur(3px)';
  x.drawImage(tinted(src, '#1a1030'), 12, 12);
  return c;
}

function putObj(g: CanvasRenderingContext2D, img: HTMLCanvasElement, sh: HTMLCanvasElement, x: number, D: number, hop: number, t: number, skew: number, GROUND = 112, WATER = 118, wave = 1) {
  const k = D / S;
  // 그림자: 세로 0.32 로 누르고 skew 만큼 눕히기
  g.save();
  g.translate(x, GROUND);
  g.transform(1, 0, skew, 0.32, 0, 0);
  const up = Math.min(1, hop / 40);
  g.globalAlpha = 0.45 * (1 - up * 0.6);
  const sc = 1 - up * 0.2;
  g.drawImage(sh, (-(S + 24) / 2) * k * sc, -(12 + S * 0.9) * k * sc, (S + 24) * k * sc, (S + 24) * k * sc);
  g.restore();
  // 반사: 물 아래만, 22줄로 잘라 뒤집고 줄마다 흔들기
  g.save();
  g.beginPath(); g.rect(x - D, WATER, D * 2, 200); g.clip();
  const strips = 22;
  for (let i = 0; i < strips; i++) {
    const sh2 = (S * 0.9) / strips;
    const sy0 = S * 0.9 - sh2 * (i + 1);
    const dy = GROUND + hop + (S * 0.9 - sy0 - sh2) * k;
    const off = Math.sin(t * 3 + i * 0.7) * wave * (0.4 + i * 0.06);
    g.globalAlpha = 0.5 * (1 - i / strips) + 0.1;
    g.save();
    g.translate(x - D / 2 + off, dy + sh2 * k);
    g.scale(1, -1);
    g.drawImage(img, 0, sy0, S, sh2, 0, 0, D, sh2 * k + 0.6);
    g.restore();
  }
  g.restore();
  g.globalAlpha = 1;
  g.drawImage(img, x - D / 2, GROUND - hop - S * 0.9 * k, D, D); // 원래 그림
}
// skew = Math.sin(t * 0.35) * 1.4 — 해와 반대로`,
    },
    pitfalls: [
      { title: '매 프레임 filter blur 로 그림자를 흐리면 폰에서 느리다', fix: '한 색 + 흐림으로 한 번 구워 두고 drawImage 로 찍는다.' },
      { title: '반사를 통째로 한 장 뒤집으면 물결이 안 생긴다', fix: '줄로 잘라 줄마다 다른 위상으로 옆으로 민다.' },
      { title: '줄 사이에 가는 틈이 보인다', fix: '줄 높이를 0.6px 더 크게 그려 겹친다.' },
      { title: '반사가 물 밖 땅까지 그려진다', fix: '물 영역을 clip 한 뒤에 그린다.' },
    ],
    prev: ['u52'],
    next: ['i298'],
    refs: [
      { name: 'MDN — CanvasRenderingContext2D.transform()', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/transform' },
    ],
  },

  i298: {
    id: 'i298',
    summary: '지난 0.6초 위치를 기억해 두었다가 0.035초 간격 자리마다 색을 입힌 반투명 복제를 그려, 대시할 때 캐릭터 뒤로 잔상이 사라지게 한다.',
    terms: [
      { en: 'Afterimage (ghost trail)', ko: '잔상 — 지난 자리에 반투명 복제' },
      { en: 'Position history buffer', ko: '지난 위치 기록' },
      { en: 'Time-based sampling (interpolation)', ko: '정해진 시간 전 자리를 기록 사이에서 보간' },
      { en: 'Additive tinted ghosts', ko: '색 입혀 더하기로 그린 잔상' },
    ],
    goal: '{target}이(가) 빠르게 움직일 때 뒤로 잔상을 남겨 줘 — 지난 위치를 기억해 일정 시간 간격으로 반투명 복제를 그리고, 뒤로 갈수록 옅게. 색은 {style}.',
    targets: ['대시하는 캐릭터', '순간이동 · 빠른 공격', '튕겨 나가는 공'],
    styles: ['하늘 → 보라 → 분홍 네온', '원래 색 그대로', '흰빛 잔상'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 대시 동안 일정 간격으로 SpriteRenderer 복제를 남기고 알파를 줄여 없앤다 (오브젝트 풀).',
      godot: 'Godot 은 Sprite2D 복제를 타이머로 남기고 Tween 으로 modulate.a 를 0 으로.',
    },
    principle: [
      '매 프레임 (시각, 위치, 늘어남)을 기록 배열에 넣고, 0.6초보다 오래된 것은 앞에서 버린다.',
      '잔상 i 번째(1 ~ n) 는 「지금 − i·0.035초」 시각의 위치 — 기록 두 칸 사이를 보간해 구한다. 프레임 빠르기가 달라도 간격이 같다.',
      '알파 = 0.6·(1 − i/n) + 0.08 — 뒤로 갈수록 옅게. 색은 하늘 → 파랑 → 보라 → 분홍 4장을 미리 물들여 두고 골라 쓴다.',
      '색 잔상은 lighter(더하기)로 그려 빛처럼. 지금 위치와 거의 같은(2px 안) 잔상은 건너뛴다 — 서 있을 땐 안 보이게.',
    ],
    when: ['대시 · 순간이동처럼 아주 빠른 움직임을 눈에 보이게 할 때', '속도감 있는 손맛 연출'],
    avoid: ['늘 천천히 움직이는 캐릭터 — 잔상이 겹쳐 지저분하다', '아주 많은 물체에 동시에 — drawImage 가 n배. 대신 주인공 · 빠른 것만'],
    cost: 'light',
    costNote: '잔상 n개(기본 6) = drawImage n번. 색 물들인 그림은 4장만 미리 굽는다.',
    level: 1,
    must: [
      '잔상 위치는 「프레임 몇 개 전」이 아니라 「몇 초 전」으로 (프레임 빠르기와 상관없게)',
      '기록은 0.6초만 남기고 버리기',
      '지금 위치와 거의 같은 잔상은 그리지 않기 (멈춰 있을 때 겹침 방지)',
      '색 물들인 그림은 미리 구워 두기',
      '잔상 켬/끔 · 개수 2~12 · 색 입히기 켬/끔',
    ],
    done: [
      '대시하는 순간 캐릭터 뒤로 색 잔상이 늘어섰다가 멈추면 사라진다',
      '잔상 개수를 늘리면 꼬리가 길어진다',
      '색 입히기를 끄면 원래 색 반투명 잔상이 된다',
      '60fps · 30fps 어디서든 잔상 간격이 같다',
    ],
    code: {
      lang: 'ts',
      title: '지난 위치 기록 → 시간 간격으로 잔상 그리기',
      from: 'demos/demos2dLook.ts mkI298() 를 정리',
      body: `interface Rec { t: number; x: number; sx: number; sy: number }
const hist: Rec[] = [];
// 하늘 → 파랑 → 보라 → 분홍, 0.75 만큼 물들인 그림 4장 (tinted 는 source-atop 칠하기)
const tints = ['#6ff6ff', '#8aa8ff', '#c08bff', '#ff8be0'].map((c) => tinted(bud, c, 0.75));

function at(tt: number): Rec | null { // 기록 두 칸 사이 보간
  for (let i = hist.length - 1; i > 0; i--) {
    const a = hist[i - 1]!, b = hist[i]!;
    if (a.t <= tt && b.t >= tt) {
      const k = (tt - a.t) / Math.max(1e-6, b.t - a.t);
      return { t: tt, x: a.x + (b.x - a.x) * k, sx: a.sx + (b.sx - a.sx) * k, sy: a.sy + (b.sy - a.sy) * k };
    }
  }
  return null;
}

function drawGhosts(g: CanvasRenderingContext2D, t: number, p: Rec, count = 6, D = 70, floorY = 128) {
  hist.push({ t, x: p.x, sx: p.sx, sy: p.sy });
  while (hist.length > 2 && hist[0]!.t < t - 0.6) hist.shift(); // 0.6초만
  for (let i = count; i >= 1; i--) { // 먼 것부터 그려 가까운 잔상이 위에
    const q = at(t - i * 0.035);
    if (!q || Math.abs(q.x - p.x) < 2) continue; // 서 있으면 건너뛰기
    const k = i / count;
    g.globalAlpha = 0.6 * (1 - k) + 0.08;
    g.globalCompositeOperation = 'lighter';
    const img = tints[Math.min(tints.length - 1, Math.floor(k * tints.length))]!;
    g.drawImage(img, q.x - (D * q.sx) / 2, floorY - D * q.sy * 0.9, D * q.sx, D * q.sy);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // 그다음 본체를 그린다
}`,
    },
    pitfalls: [
      { title: '「프레임 몇 개 전」으로 잔상을 뽑으면 빠른 화면에선 짧고 느린 화면에선 길다', fix: '「몇 초 전」 시각으로 뽑고 기록 사이를 보간한다.' },
      { title: '멈춰 있어도 잔상이 겹쳐 그려져 캐릭터가 번져 보인다', fix: '지금 위치와 2px 안이면 건너뛴다.' },
      { title: '잔상 색 그림을 매 프레임 만들면 느리다', fix: '물들인 그림 4장을 미리 굽는다.' },
      { title: '잔상을 본체 뒤가 아니라 위에 그리면 본체가 가려진다', fix: '잔상을 먼저(먼 것부터) 그리고 본체를 마지막에.' },
    ],
    prev: ['i297'],
    next: ['i302'],
  },

  i299: {
    id: 'i299',
    summary: '그림 한 장을 7×7 격자 삼각형으로 잘라 꼭짓점만 움직이고 삼각형마다 그림을 아핀 변환으로 붙여, 숨쉬기 · 깃발 출렁 · 당기기 · 말랑 흔들기를 만든다.',
    terms: [
      { en: 'Mesh deformation (2D warp)', ko: '격자 꼭짓점을 움직여 그림 휘기' },
      { en: 'Affine texture mapping per triangle', ko: '삼각형마다 원래 → 새 자리 아핀 변환' },
      { en: 'ctx.clip + ctx.transform', ko: '삼각형만 잘라 변환해 그리기' },
      { en: 'Squash & stretch / breathing', ko: '찌그러짐 · 숨쉬기' },
    ],
    goal: '{target}을(를) 격자 변형으로 움직여 줘 — 그림을 7×7 격자 삼각형으로 잘라 꼭짓점만 움직이고, 삼각형마다 그림을 아핀 변환으로 붙인다. 움직임은 {style}.',
    targets: ['숨쉬는 캐릭터 그림', '바람에 출렁이는 깃발 · 현수막', '잡아당기면 늘어나는 젤리'],
    styles: ['숨쉬기 (위아래 눌림 + 가운데 볼록)', '깃발 출렁 (오른쪽일수록 크게)', '말랑 흔들 (아래 고정)'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 2D Animation 패키지의 Sprite Skin(뼈 · 꼭짓점 무게)이 같은 방식이다.',
      godot: 'Godot 은 Polygon2D 에 texture · uv · polygon 을 주고 꼭짓점을 움직인다 (뼈는 Skeleton2D).',
    },
    principle: [
      '그림을 N×N(7×7) 칸으로 나누고 칸마다 삼각형 2개. 꼭짓점 (N+1)² = 64개만 계산한다.',
      '삼각형마다 원래 그림 세 점 S → 새 세 점 D 로 가는 아핀 행렬을 푼다: M = D·S⁻¹ (2×2 역행렬 + 이동).',
      '삼각형 모양으로 clip 하고 transform(M) 뒤 그림 전체를 drawImage — 그 삼각형 부분만 새 자리에 붙는다.',
      '삼각형을 0.7px 바깥으로 넓혀 clip 해야 삼각형 사이 실금이 안 생긴다.',
      '변형 식: 숨쉬기는 세로 1 − 0.09·sin(3.2t) + 가운데 볼록 0.13·sin(π v), 깃발은 u·12·sin(5.5u − 5t) 로 오른쪽일수록 크게.',
    ],
    when: ['그림 한 장으로 숨쉬기 · 출렁 같은 작은 생기를 줄 때', '잡아당기기 · 누르기에 반응하는 말랑한 물체'],
    avoid: ['팔다리가 크게 움직이는 동작 — 격자가 꼬인다. 대신 뼈대(i300)', '격자를 아주 촘촘하게 (20×20 넘게) — 삼각형마다 clip · drawImage 라 느려진다'],
    cost: 'medium',
    costNote: '7×7 = 삼각형 98개 × (clip + drawImage). 그림 하나는 괜찮지만 여러 개면 폰에서 무거워진다. WebGL 이면 같은 일이 훨씬 싸다.',
    level: 2,
    must: [
      '꼭짓점만 계산하고, 그림은 삼각형마다 아핀 변환으로 붙이기',
      '삼각형 clip 은 중심에서 0.7px 바깥으로 넓혀 실금 막기',
      '행렬식(det)이 0 에 가까운 삼각형은 건너뛰기',
      '변형 4가지(숨쉬기 · 깃발 · 당기기 · 말랑)를 바꿔 볼 수 있게, 격자 보기 켬/끔',
    ],
    done: [
      '격자 보기를 켜면 분홍 꼭짓점 · 선이 움직이고 그림이 그 격자를 따라 휜다',
      '숨쉬기에선 위아래로 눌리며 가운데가 볼록해진다',
      '깃발에선 오른쪽 끝일수록 크게 출렁이고 물결 그늘이 진다',
      '삼각형 사이에 실금이 보이지 않는다',
    ],
    code: {
      lang: 'ts',
      title: '삼각형 하나를 새 자리로 아핀 변환해 그리기',
      from: 'demos/demos2dLook.ts drawTri() · mkI299() 를 정리',
      body: `function drawTri(g: CanvasRenderingContext2D, img: CanvasImageSource,
  s0x: number, s0y: number, s1x: number, s1y: number, s2x: number, s2y: number,   // 원래 그림 세 점
  d0x: number, d0y: number, d1x: number, d1y: number, d2x: number, d2y: number) { // 새 세 점
  const cx = (d0x + d1x + d2x) / 3, cy = (d0y + d1y + d2y) / 3;
  const ex = (x: number, y: number) => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / l) * 0.7, y + ((y - cy) / l) * 0.7]; };
  const a = ex(d0x, d0y), b = ex(d1x, d1y), c = ex(d2x, d2y);
  g.save();
  g.beginPath(); g.moveTo(a[0]!, a[1]!); g.lineTo(b[0]!, b[1]!); g.lineTo(c[0]!, c[1]!); g.closePath();
  g.clip(); // 0.7px 넓힌 삼각형 — 실금 막기
  const S00 = s1x - s0x, S01 = s2x - s0x, S10 = s1y - s0y, S11 = s2y - s0y;
  const det = S00 * S11 - S01 * S10;
  if (Math.abs(det) > 1e-9) {
    const i00 = S11 / det, i01 = -S01 / det, i10 = -S10 / det, i11 = S00 / det; // S 의 역행렬
    const D00 = d1x - d0x, D01 = d2x - d0x, D10 = d1y - d0y, D11 = d2y - d0y;
    const ma = D00 * i00 + D01 * i10, mc = D00 * i01 + D01 * i11; // M = D · S⁻¹
    const mb = D10 * i00 + D11 * i10, md = D10 * i01 + D11 * i11;
    g.transform(ma, mb, mc, md, d0x - ma * s0x - mc * s0y, d0y - mb * s0x - md * s0y);
    g.drawImage(img, 0, 0);
  }
  g.restore();
}

// 7×7 격자: 꼭짓점 (i, j) 의 새 자리 → 칸마다 삼각형 2개
const N = 7, IS = 160, SZ = 118, cs = IS / N;
for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
  const u = i / N, v = j / N;
  let x = X0 + u * SZ, y = Y0 + v * SZ;
  const s = Math.sin(t * 3.2); // 숨쉬기
  x = 140 + (x - 140) * (1 + 0.13 * s * Math.sin(Math.PI * v));
  y = Y0 + SZ - (Y0 + SZ - y) * (1 - 0.09 * s);
  vx[j * (N + 1) + i] = x; vy[j * (N + 1) + i] = y;
}
// drawTri(g, pic, sx, sy, sx+cs, sy, sx, sy+cs, A, B, C) · drawTri(g, pic, sx+cs, sy, sx+cs, sy+cs, sx, sy+cs, B, D, C)`,
    },
    pitfalls: [
      { title: '삼각형을 딱 맞게 clip 하면 삼각형 사이에 실금이 보인다', fix: '중심에서 0.7px 바깥으로 넓혀 clip 한다.' },
      { title: '꼭짓점이 뒤집혀(접혀) 행렬식이 0 이면 그림이 사라지거나 튄다', fix: '|det| 가 아주 작으면 그 삼각형은 건너뛰고, 변형 크기를 칸 크기보다 작게.' },
      { title: '그림 전체를 삼각형마다 drawImage 하니 큰 그림이면 느리다', fix: '그림을 필요한 크기로 미리 줄여 두거나, 많으면 WebGL 메시로.' },
      { title: '말랑 흔들기에서 바닥까지 흔들리면 미끄러져 보인다', fix: '아래 줄(v = 1)은 고정하고 위로 갈수록 크게 (1 − v) 를 곱한다.' },
    ],
    prev: ['i297'],
    next: ['i300', 'i287'],
    refs: [
      { name: 'Wikipedia — Affine transformation', url: 'https://en.wikipedia.org/wiki/Affine_transformation' },
    ],
  },
  i300: {
    id: 'i300',
    summary: '팔 · 다리를 뼈로 이어 각도만 돌려 걷게 하고(FK), 앞팔은 손 끝이 목표에 닿도록 두 뼈 각도를 코사인 법칙으로 거꾸로 계산한다(IK).',
    terms: [
      { en: '2D skeletal animation (forward kinematics)', ko: '뼈 각도를 정하면 끝 자리가 따라온다' },
      { en: 'Two-bone IK (law of cosines)', ko: '끝 자리를 정하면 두 뼈 각도를 거꾸로' },
      { en: 'Walk cycle (phase)', ko: '걷기 위상 — 양다리 반 바퀴 차이' },
      { en: 'Reach clamp', ko: '팔 길이보다 먼 목표는 길이까지만' },
    ],
    goal: '{target}을(를) 코드 뼈대로 움직여 줘 — 다리 · 뒷팔은 위상으로 각도를 돌려 걷고(FK), 앞팔은 손 끝이 목표를 따라가게 두 뼈 IK. 그림체는 {style}.',
    targets: ['걷는 2D 캐릭터', '별을 잡으려는 아이', '물건을 가리키는 마스코트'],
    styles: ['굵은 선 만화', '귀엽고 통통한', '종이 인형'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 2D Animation 패키지의 뼈 + 2D IK 의 Limb Solver 2D.',
      godot: 'Godot 은 Skeleton2D + Bone2D, 두 뼈 IK 는 SkeletonModification2DTwoBoneIK.',
    },
    principle: [
      'FK: 엉덩이에서 허벅지 각도 a1 로 길이 L1 만큼 가면 무릎, 거기서 a1 + 굽힘 으로 L2 만큼 가면 발.',
      '걷기: 허벅지 θ = 0.48·sin(p), 무릎 굽힘 = 0.95·max(0, cos p). 반대쪽 다리는 p + π (반 바퀴 늦게). 엉덩이는 |cos p|·2.5 만큼 위아래로.',
      'IK: 어깨에서 목표까지 거리 d 를 팔 길이 합보다 조금 짧게 자르고, 코사인 법칙 cos A = (U1² + d² − U2²) / (2·U1·d) 로 위팔이 기준선에서 벌어질 각 A 를 구한다.',
      '위팔 각도 = 목표 방향 + A, 팔꿈치 = 어깨 + U1·(cos, sin), 손 = 목표. 굽는 쪽(+A / −A)을 바꾸면 팔꿈치가 반대로 꺾인다.',
    ],
    when: ['프레임 그림 없이 걷기 · 손 뻗기 동작을 만들 때', '손 · 발이 물체에 정확히 닿아야 할 때 (잡기 · 가리키기 · 발 디딤)'],
    avoid: ['관절이 3개 넘는 사슬 (꼬리 · 촉수) — 두 뼈 공식이 안 맞는다. 대신 FABRIK · CCD 반복 풀이', '그림이 한 장으로 붙은 캐릭터 — 뼈로 나누기 어렵다. 대신 격자 변형(i299)'],
    cost: 'light',
    costNote: '관절마다 삼각함수 몇 번. 캐릭터 수십 명도 가볍다.',
    level: 2,
    must: [
      'FK 는 부모 끝 자리에서 자식 각도를 더해 이어 가기',
      'IK 목표가 팔 길이보다 멀면 거리를 U1 + U2 − 0.01 로 자르기 (acos 범위 밖 방지)',
      'cos 값은 −1 ~ 1 로 clamp 한 뒤 acos',
      '반대쪽 다리는 위상 π 차이, 걷기 속도 0 이면 다리 · 팔 흔들림도 0',
      '뼈 보기 · IK 켬/끔 · 걷기 속도 조절',
    ],
    done: [
      '걷기 속도를 올리면 다리 흔들림 · 무릎 굽힘이 함께 커지고, 0 이면 가만히 선다',
      'IK 를 켜면 앞팔 손 끝이 움직이는 별을 계속 따라간다',
      '별이 팔 길이 밖으로 나가도 팔이 쭉 뻗을 뿐 꺾이거나 튀지 않는다',
      '뼈 보기를 켜면 관절 점과 뼈 선이 보인다',
    ],
    code: {
      lang: 'ts',
      title: '걷는 다리(FK) + 손 끝이 목표를 따라가는 팔(두 뼈 IK)',
      from: 'demos/demos2dLook.ts mkI300() 를 정리',
      body: `type V = [number, number];
const L1 = 21, L2 = 21; // 허벅지 · 정강이
function leg(hipX: number, hipY: number, p: number, off: number, speed: number) {
  const s = p + off;
  const th = 0.48 * Math.sin(s) * Math.min(1, speed);       // 허벅지 흔들기
  const bend = 0.95 * Math.max(0, Math.cos(s)) * Math.min(1, speed); // 앞으로 갈 때만 무릎 굽힘
  const a1 = Math.PI / 2 - th;
  const knee: V = [hipX + Math.cos(a1) * L1, hipY + Math.sin(a1) * L1];
  const a2 = a1 + bend;
  const foot: V = [knee[0] + Math.cos(a2) * L2, knee[1] + Math.sin(a2) * L2];
  return { knee, foot };
}

const U1 = 17, U2 = 16; // 위팔 · 아래팔
function twoBoneIK(shX: number, shY: number, tx: number, ty: number) {
  let dx = tx - shX, dy = ty - shY;
  let d = Math.hypot(dx, dy);
  const maxd = U1 + U2 - 0.01; // 너무 멀면 팔 길이까지만
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
  const base = Math.atan2(dy, dx);
  const cosA = Math.max(-1, Math.min(1, (U1 * U1 + d * d - U2 * U2) / (2 * U1 * d))); // 코사인 법칙
  const a = base + Math.acos(cosA); // − 로 바꾸면 팔꿈치가 반대로
  const elbow: V = [shX + Math.cos(a) * U1, shY + Math.sin(a) * U1];
  const hand: V = [shX + dx, shY + dy];
  return { elbow, hand };
}

// 매 프레임: phase += dt * 6.5 * speed
const hipY = 106 - Math.abs(Math.cos(phase)) * 2.5; // 걸음마다 위아래
const back = leg(128, hipY, phase, Math.PI, speed);  // 반 바퀴 늦은 다리
const front = leg(128, hipY, phase, 0, speed);
const arm = twoBoneIK(shX, shY, starX, starY);`,
    },
    pitfalls: [
      { title: '목표가 팔 길이보다 멀면 acos 가 NaN 이 되어 팔이 사라진다', fix: '거리를 U1 + U2 − 0.01 로 자르고 cos 값을 −1 ~ 1 로 clamp 한다.' },
      { title: '두 다리 위상이 같으면 깡충 뛰는 것처럼 보인다', fix: '한쪽은 p, 다른 쪽은 p + π.' },
      { title: '무릎이 앞뒤로 다 굽으면 다리가 거꾸로 꺾여 보인다', fix: '굽힘은 max(0, cos p) 로 한쪽으로만.' },
      { title: '팔꿈치가 몸 안쪽으로 꺾인다', fix: 'base + acos 와 base − acos 중 몸 바깥쪽인 것을 고른다.' },
    ],
    prev: ['i459'],
    next: ['i233', 'i299'],
    refs: [
      { name: 'Wikipedia — Law of cosines', url: 'https://en.wikipedia.org/wiki/Law_of_cosines' },
      { name: 'Wikipedia — Inverse kinematics', url: 'https://en.wikipedia.org/wiki/Inverse_kinematics' },
    ],
  },

  i301: {
    id: 'i301',
    summary: '동전 · 카드 · 금 글씨 위로 대각 빛 띠를 지나가게 하되 source-atop 으로 그림이 있는 화소에만 칠해, 보상이 반짝 빛나 보이게 한다.',
    terms: [
      { en: 'Sheen sweep (shine highlight)', ko: '반짝 쓸기 — 그림 위를 지나가는 빛 띠' },
      { en: "globalCompositeOperation 'source-atop'", ko: '이미 그려진 화소 위에만 칠하기' },
      { en: 'Diagonal linear gradient band', ko: '대각 선형 그러데이션 띠' },
      { en: 'Glint sparkle', ko: '띠가 지날 때 번쩍이는 네 갈래 반짝' },
    ],
    goal: '{target} 위로 대각 빛 띠가 지나가게 해 줘 — 그림을 작은 캔버스에 복사하고 source-atop 으로 그림 화소에만 흰 띠를 칠한다. 느낌은 {style}.',
    targets: ['금화 · 보상 아이콘', '레어 카드', '「받기」 단추 · 금 글씨'],
    styles: ['짧고 또렷한 흰 빛', '부드럽고 넓은 빛', '두 줄 반짝'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      web: 'HTML 요소라면 ::after 에 대각 linear-gradient 를 두고 mask(또는 overflow hidden)로 모양 안에만 지나가게.',
      unity: 'Unity UI 는 Mask 안에 대각 그러데이션 Image 를 두고 움직이거나, 셰이더에서 uv.x + uv.y 띠를 더한다.',
      godot: 'Godot 은 CanvasItem 셰이더에서 UV.x + UV.y 띠를 COLOR 에 더하고 알파는 원래 것으로.',
    },
    principle: [
      '물체마다 같은 크기 작은 캔버스(scr)를 하나 두고, 매 프레임 원래 그림을 복사한다.',
      "그 위에 source-atop 으로 띠를 칠하면 그림이 있는 화소에만 칠해지고 투명한 곳은 그대로다 — 동전 모양 그대로 빛이 지나간다.",
      '띠는 대각 선형 그러데이션: 0 → 0.42 옅게 → 0.5 거의 흰색(0.95) → 0.58 → 1 투명. 앞쪽에 가는 띠를 하나 더 두면 두 줄 반짝.',
      '2.4초 주기 중 앞 55% 동안만 띠가 W + H 길이를 가로지르고, 지나가는 끝 무렵 오른쪽 위에 네 갈래 반짝을 그린다.',
    ],
    when: ['보상 · 금화 · 레어 카드처럼 「좋은 것」을 눈에 띄게 할 때', '누를 단추를 은근히 알릴 때'],
    avoid: ['화면 가득 많은 물체에 동시에 — 다 같이 빛나면 오히려 안 보인다. 대신 하나씩 엇갈리게(ph)', '글자 많은 판 — 띠가 지날 때 읽기 어렵다'],
    cost: 'light',
    costNote: '물체마다 작은 캔버스 복사 + 그러데이션 칠하기 한 번. 수십 개도 가볍다.',
    level: 1,
    must: [
      "띠는 source-atop 으로 — 그림 바깥(투명한 곳)에는 칠해지지 않게",
      '원래 그림은 그대로 두고 복사본(scr)에 칠하기',
      '물체마다 시작 위상(ph)을 달리해 동시에 빛나지 않게',
      '띠 폭 · 속도 조절, 켬/끔 비교',
    ],
    done: [
      '동전 · 카드 · 금 글씨 · 단추 모양 그대로 빛 띠가 지나가고, 바깥에는 빛이 새지 않는다',
      '띠가 끝날 무렵 오른쪽 위에 반짝이 번쩍인다',
      '띠 폭 0.05 ~ 0.4 · 속도 0.3 ~ 3 슬라이더',
      '네 물체가 차례로 엇갈려 빛난다',
    ],
    code: {
      lang: 'ts',
      title: '그림 화소에만 대각 빛 띠 (source-atop)',
      from: 'demos/demos2dLook.ts mkI301() draw() 를 정리',
      body: `// img: 원래 그림 · scr: 같은 크기 작업 캔버스 · ph: 물체마다 다른 시작 위상
function sheen(img: HTMLCanvasElement, scr: HTMLCanvasElement, t: number, ph: number, bw = 0.18, spd = 1) {
  const x = scr.getContext('2d')!;
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, scr.width, scr.height);
  x.drawImage(img, 0, 0);
  const cyc = ((t * spd) / 2.4 + ph) % 1;
  if (cyc < 0.55) {
    const W = scr.width, H = scr.height;
    const k = cyc / 0.55;
    const c = -H * 0.6 + k * (W + H + H * 0.6); // 띠 가운데가 왼쪽 위 → 오른쪽 아래로
    const half = bw * Math.max(W, H);
    x.globalCompositeOperation = 'source-atop'; // 그림 있는 화소에만
    const gr = x.createLinearGradient(c - half, 0, c + half, half * 0.9);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.42, 'rgba(255,255,255,.25)');
    gr.addColorStop(0.5, 'rgba(255,255,255,.95)');
    gr.addColorStop(0.58, 'rgba(255,255,255,.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);
    const gr2 = x.createLinearGradient(c - half * 1.9, 0, c - half * 1.5, half * 0.4); // 앞의 가는 띠
    gr2.addColorStop(0, 'rgba(255,255,255,0)');
    gr2.addColorStop(0.5, 'rgba(255,255,255,.5)');
    gr2.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr2;
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over';
  }
  return cyc; // 0.45 ~ 0.62 사이면 오른쪽 위에 반짝 그리기
}
// 그리기: g.drawImage(scr, o.x, o.y, o.w, o.h)`,
    },
    pitfalls: [
      { title: '화면 캔버스에 바로 띠를 칠하면 물체 바깥 배경까지 하얘진다', fix: '작은 작업 캔버스에 그림을 복사하고 source-atop 으로 칠한 뒤 붙인다.' },
      { title: '원래 그림 캔버스에 칠하면 빛이 누적돼 점점 하얘진다', fix: '원래 그림은 그대로 두고 매 프레임 복사본에만.' },
      { title: '모든 물체가 같은 순간 빛나면 산만하다', fix: '물체마다 위상(ph 0 · 0.25 · 0.5 · 0.7)을 다르게.' },
      { title: '작업 캔버스를 매 프레임 새로 만들면 메모리가 늘어난다', fix: '물체마다 하나를 만들어 계속 쓴다.' },
    ],
    prev: ['u60', 'i294'],
    next: ['i302'],
    refs: [
      { name: 'MDN — globalCompositeOperation (source-atop)', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation' },
    ],
  },

  i302: {
    id: 'i302',
    summary: '방출기마다 수명 · 힘 · 크기 · 색이 다른 입자를 쏘고 미리 구운 점 그림으로 그려, 불 · 연기 · 반짝이 · 꽃잎을 캔버스 2D 하나로 만든다.',
    terms: [
      { en: 'Particle system (emitter · lifetime)', ko: '입자 체계 — 방출기 · 수명' },
      { en: 'Emission rate accumulator', ko: '초당 방출 수를 쌓아 두었다 정수만큼 쏘기' },
      { en: "Additive blending ('lighter')", ko: '불 · 반짝이는 더하기 혼합' },
      { en: 'Swap-and-pop removal', ko: '죽은 입자를 맨 끝 것과 바꿔 빼기' },
    ],
    goal: '{target}을(를) 캔버스 2D 입자로 만들어 줘 — 방출기마다 수명 · 힘 · 크기 · 색을 정하고, 불 · 반짝이는 더하기 혼합, 연기 · 꽃잎은 보통 혼합. 분위기는 {style}.',
    targets: ['모닥불 · 연기 · 요술봉 반짝이 · 꽃잎', '보상 터짐 · 별 가루', '눈 · 비 · 낙엽'],
    styles: ['따뜻한 밤', '귀엽고 화사한', '몽환적인 빛'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Particle System (Emission Rate · Start Lifetime · Color over Lifetime · Additive 재질).',
      godot: 'Godot 은 GPUParticles2D / CPUParticles2D (amount · lifetime · ParticleProcessMaterial) + CanvasItemMaterial blend_mode Add.',
    },
    principle: [
      '방출기마다 초당 방출 수(불 70 · 연기 14 · 반짝이 40 · 꽃잎 6)를 시간만큼 누적해 1 넘을 때마다 하나씩 쏜다. 전체는 900개까지.',
      '입자 = 자리 · 속도 · 나이 · 수명 · 크기 · 돌기. 매 프레임 종류마다 다른 힘: 불은 가운데로 끌리며 위로, 연기는 옆바람에 흔들리며 느려짐, 반짝이는 감속 + 약한 중력, 꽃잎은 좌우로 살랑.',
      '그림은 방사 그러데이션 점 · 별 · 꽃잎을 미리 구워 drawImage — 불은 나이에 따라 흰 → 노랑 → 주황 → 빨강 4장 중 고른다.',
      "그리는 순서: 연기 · 꽃잎(보통 혼합) 먼저, 불 · 반짝이는 'lighter' 로 나중에. 죽은 입자는 맨 끝 것과 바꿔 pop.",
    ],
    when: ['2D 게임의 불 · 연기 · 반짝 · 날씨 연출', '라이브러리 없이 가벼운 효과가 필요할 때'],
    avoid: ['입자 수천 개를 넘게 — 캔버스 2D drawImage 가 버겁다. 대신 WebGL(three.js Points · 인스턴싱)', '물리 충돌이 필요한 입자 — 대신 물리 엔진'],
    cost: 'medium',
    costNote: '입자 하나 = drawImage 한 번. 견본 상한 900개는 PC 는 가볍고, 폰에선 300~500개 안쪽이 좋다. shadowBlur 는 쓰지 않는다.',
    level: 2,
    must: [
      '방출은 「초당 개수 × 시간」을 쌓아서 — 프레임 빠르기와 상관없이 같은 양',
      '입자 그림은 미리 구워 drawImage (매번 그러데이션 · shadowBlur 금지)',
      '전체 입자 수 상한 (예: 900)',
      '죽은 입자 빼기는 swap-and-pop (splice 금지)',
      '프레임 시간을 잘라 느리게 만들지 말고, 긴 프레임은 고정 조각으로 나눠 돌리기',
    ],
    done: [
      '모닥불 · 냄비 연기 · 요술봉 반짝이 · 나뭇가지 꽃잎이 동시에 돈다',
      '「더하기 혼합」을 끄면 불 · 반짝이가 겹친 곳이 덜 빛난다',
      '방출량 0.2 ~ 2.5 슬라이더로 입자 수가 바뀌고, 현재 입자 수가 보인다',
      '폰에서도 60fps',
    ],
    code: {
      lang: 'ts',
      title: '방출 누적 · 종류별 힘 · swap-and-pop · 혼합 나눠 그리기',
      from: 'demos/demos2dLook.ts mkI302() 를 정리',
      body: `interface P { k: number; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number }
const ps: P[] = [];
const RATES = [70, 14, 40, 6]; // 불 · 연기 · 반짝이 · 꽃잎 (초당)
const acc = [0, 0, 0, 0];
const R = Math.random;
function emit(k: number) {
  if (k === 0) ps.push({ k, x: 40 + (R() - 0.5) * 16, y: 132, vx: (R() - 0.5) * 8, vy: -38 - R() * 30, life: 0, max: 0.6 + R() * 0.5, size: 9 + R() * 6 });
  else if (k === 1) ps.push({ k, x: 108 + (R() - 0.5) * 6, y: 112, vx: (R() - 0.5) * 6, vy: -16 - R() * 10, life: 0, max: 2.2 + R(), size: 5 });
  // 반짝이 · 꽃잎도 같은 식
}
function update(dt: number, t: number, rate = 1) {
  for (let k = 0; k < 4; k++) {
    acc[k]! += RATES[k]! * rate * dt;
    while (acc[k]! >= 1 && ps.length < 900) { acc[k]! -= 1; emit(k); }
  }
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i]!;
    p.life += dt;
    if (p.life >= p.max) { ps[i] = ps[ps.length - 1]!; ps.pop(); continue; } // swap-and-pop
    if (p.k === 0) { p.vx += (40 - p.x) * 1.5 * dt; p.vy -= 10 * dt; }                 // 불: 가운데로 · 위로
    else if (p.k === 1) { p.vx += Math.sin(t * 0.8 + p.y * 0.05) * 6 * dt + 4 * dt; p.vy *= 1 - 0.3 * dt; } // 연기: 바람
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
function draw(g: CanvasRenderingContext2D, add = true) {
  g.globalCompositeOperation = 'source-over'; // 연기 먼저
  for (const p of ps) if (p.k === 1) {
    const k = p.life / p.max, s = p.size + k * 22;
    g.globalAlpha = 0.45 * Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * (1 - k);
    g.drawImage(SMOKE, p.x - s, p.y - s, s * 2, s * 2);
  }
  g.globalCompositeOperation = add ? 'lighter' : 'source-over'; // 불은 더하기
  for (const p of ps) if (p.k === 0) {
    const k = p.life / p.max, s = p.size * (1 - k * 0.7);
    g.globalAlpha = (1 - k) * 0.9;
    g.drawImage(FIRE[Math.min(3, Math.floor(k * 4))]!, p.x - s, p.y - s, s * 2, s * 2); // 흰 → 노랑 → 주황 → 빨강
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}`,
    },
    pitfalls: [
      { title: '프레임마다 정해진 개수를 쏘면 화면 빠르기에 따라 양이 달라진다', fix: '초당 개수 × dt 를 쌓아 두었다가 1 넘을 때마다 쏜다.' },
      { title: '죽은 입자를 splice 로 빼면 입자가 많을 때 느려진다', fix: '맨 끝 입자와 바꿔 pop 한다 (뒤에서부터 돌면서).' },
      { title: '프레임 시간을 Math.min(dt, 0.05) 로 자르면 느린 폰에서 연출이 슬로모션이 된다', fix: '실제 시간을 쓰고 긴 프레임은 고정 조각으로 나눠 돌린다 — 사이트 게임 34개를 이렇게 고쳤다.', seen: true },
      { title: '연기를 더하기 혼합으로 그리면 하얗게 떠서 연기 같지 않다', fix: '연기 · 꽃잎은 보통 혼합으로 먼저, 불 · 반짝이만 lighter.' },
    ],
    prev: ['u52', 'i298'],
    next: ['i303'],
    refs: [
      { name: 'Wikipedia — Particle system', url: 'https://en.wikipedia.org/wiki/Particle_system' },
    ],
  },

  i304: {
    id: 'i304',
    summary: '도트 그림을 정수 배로만 키우고 위치도 정수 칸에 맞추며, 필요하면 scale2x(EPX)로 대각선만 매끈하게 해 흐림 · 떨림 없이 또렷하게 보이게 한다.',
    terms: [
      { en: 'Integer scaling (nearest neighbor)', ko: '정수 배 · 가까운 점 확대' },
      { en: 'Scale2x / EPX pixel-art scaling', ko: '이웃 색을 보고 대각 계단만 다듬는 2배 확대' },
      { en: 'imageSmoothingEnabled = false', ko: '캔버스 부드럽게 그리기 끄기' },
      { en: 'Sub-pixel jitter (pixel snapping)', ko: '반 칸 위치 때문에 번지고 떨리는 것 · 칸에 맞추기' },
    ],
    goal: '{target}을(를) 또렷하게 키워 줘 — 정수 배 가까운 점 확대, 위치는 정수 칸에 맞추고, 원하면 scale2x 로 대각선만 매끈하게. 결과는 {style}.',
    targets: ['16×16 도트 캐릭터', '도트 타일 지도', '움직이는 카메라가 있는 도트 게임'],
    styles: ['계단 그대로 또렷하게', '대각선만 매끈하게 (scale2x)', '레트로 화면 그대로'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      web: "CSS 로 키우는 그림은 image-rendering: pixelated.",
      unity: 'Unity 는 텍스처 Filter Mode = Point · 압축 끔 + Pixel Perfect Camera (URP 2D).',
      godot: 'Godot 은 텍스처 Filter Nearest + 프로젝트 설정 Snap 2D Transforms to Pixel · 창 Stretch Scale Mode = integer.',
    },
    principle: [
      '부드럽게 키우면(보간) 칸 경계가 섞여 흐릿해진다. imageSmoothingEnabled = false 로 가까운 점 확대를 하면 계단이 그대로 또렷하다.',
      '배수는 정수(×2 · ×3 · ×4)로. ×2.5 같은 배수는 칸마다 2화소 · 3화소가 섞여 크기가 들쭉날쭉하다.',
      'scale2x(EPX): 화소 P 와 위 A · 오른쪽 B · 왼쪽 C · 아래 D 를 보고, 예를 들어 C = A 이고 C ≠ D, A ≠ B 이면 왼쪽 위 칸을 A 로 — 대각 계단 모서리만 채운다. 두 번 하면 ×4.',
      '움직일 때 위치가 반 칸(소수)이면 칸이 번지고 떨린다 — 그리는 자리는 Math.round 로 정수 칸에.',
    ],
    when: ['도트 그림 게임을 화면에 크게 키워 보일 때', '카메라가 움직이는 도트 게임에서 떨림 · 번짐이 보일 때'],
    avoid: ['매끈한 그림 · 사진 — 가까운 점 확대는 계단을 드러낸다. 대신 부드럽게', '아주 작은 배수 차이가 필요한 화면 맞춤 — 정수 배 + 남는 곳은 테두리로 채운다'],
    cost: 'light',
    costNote: '가까운 점 확대는 공짜. scale2x 는 그림마다 한 번 (16×16 → 64×64) 미리 계산.',
    level: 1,
    must: [
      'imageSmoothingEnabled = false (캔버스를 다시 만들거나 크기가 바뀌면 다시 설정)',
      '배수는 정수, 그리는 위치도 Math.round 로 정수',
      'scale2x 는 미리 한 번 계산해 둔 그림을 쓰기',
      '카메라 위치도 칸 단위로 맞추기 (소수 이동은 내부 값으로만)',
    ],
    done: [
      '가까운 점 · scale2x · 부드럽게 세 가지를 나란히 보면 각각 계단 · 매끈한 대각선 · 흐릿함이 보인다',
      '정수 칸에 맞춘 줄은 움직여도 또렷하고, 반 칸 줄은 번지고 떨린다',
      '확대해도 칸 크기가 모두 같다',
      '폰 고해상도 화면에서도 흐리지 않다',
    ],
    code: {
      lang: 'ts',
      title: 'scale2x(EPX) + 정수 칸 위치로 또렷하게',
      from: 'demos/demos2dLook.ts epx() · mkI304() 를 정리',
      body: `// src: 화소 색 (Uint32) · W × H → 2W × 2H
function epx(src: Uint32Array, W: number, H: number): Uint32Array {
  const o = new Uint32Array(W * 2 * H * 2);
  const at = (x: number, y: number) => src[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))]!;
  const W2 = W * 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      let p1 = P, p2 = P, p3 = P, p4 = P;
      if (C === A && C !== D && A !== B) p1 = A; // 왼쪽 위
      if (A === B && A !== C && B !== D) p2 = B; // 오른쪽 위
      if (D === C && D !== B && C !== A) p3 = C; // 왼쪽 아래
      if (B === D && B !== A && D !== C) p4 = D; // 오른쪽 아래
      o[y * 2 * W2 + x * 2] = p1;
      o[y * 2 * W2 + x * 2 + 1] = p2;
      o[(y * 2 + 1) * W2 + x * 2] = p3;
      o[(y * 2 + 1) * W2 + x * 2 + 1] = p4;
    }
  return o;
}
// ×4 = epx 두 번 (미리 한 번만)
const d0 = new Uint32Array(base.getContext('2d')!.getImageData(0, 0, 16, 16).data.buffer.slice(0));
const e2 = epx(epx(d0, 16, 16), 32, 32);

function drawSprite(g: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, scale: number) {
  g.imageSmoothingEnabled = false;             // 가까운 점
  g.drawImage(img, Math.round(x), Math.round(y), 16 * scale, 16 * scale); // 정수 칸 · 정수 배
}`,
    },
    pitfalls: [
      { title: '캔버스 크기를 바꾸면 imageSmoothingEnabled 가 다시 켜진다', fix: '크기를 바꾼 뒤마다 다시 false 로 설정한다.' },
      { title: '위치가 소수면 움직일 때 도트가 번지고 떨린다', fix: '그리는 자리를 Math.round 로. 속도 · 위치 계산은 소수로 두고 그릴 때만 정수.' },
      { title: '×1.5 · ×2.5 처럼 키우면 칸 크기가 들쭉날쭉하다', fix: '정수 배로만 키우고 남는 화면은 테두리로 채운다.' },
      { title: 'scale2x 를 매 프레임 계산하면 쓸데없이 바쁘다', fix: '그림마다 한 번 계산해 캔버스로 구워 둔다.' },
    ],
    prev: ['i500'],
    next: ['i501', 'i296'],
    refs: [
      { name: 'Wikipedia — Pixel-art scaling algorithms', url: 'https://en.wikipedia.org/wiki/Pixel-art_scaling_algorithms' },
      { name: 'MDN — imageSmoothingEnabled', url: 'https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled' },
    ],
  },

  i263: {
    id: 'i263',
    summary: '물체가 많은 칸만 4칸씩 더 쪼개는 쿼드트리를 만들어, 범위 찾기 · 충돌 검사 때 겹치는 칸 안의 물체만 열어 보아 검사 수를 크게 줄인다.',
    terms: [
      { en: 'Quadtree', ko: '네모를 넷으로 계속 쪼개는 공간 나무' },
      { en: 'Spatial partitioning', ko: '공간 나누기 — 가까운 것만 찾기' },
      { en: 'Range query (AABB overlap)', ko: '상자 안 물체 찾기 — 겹치지 않는 칸은 통째로 건너뜀' },
      { en: 'Node capacity · max depth', ko: '칸 하나에 둘 물체 수 · 최대 깊이' },
    ],
    goal: '{target}을(를) 쿼드트리로 빠르게 찾게 해 줘 — 물체가 칸 용량(4)을 넘으면 그 칸만 4칸으로 쪼개고(최대 깊이 7), 찾을 땐 상자와 겹치는 칸만 연다. 화면은 {style}.',
    targets: ['몰려다니는 물체 수백 개', '총알 · 적 충돌 검사', '지도 위 표시 · 클릭 찾기'],
    styles: ['칸 선 · 검사 수가 보이는 설명 화면', '게임 화면 (칸 숨김)', '깊이별 색 칸'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    principle: [
      '전체 네모가 뿌리 칸. 물체를 넣다가 칸에 4개(cap)를 넘으면 그 칸을 4칸으로 쪼개고, 들어 있던 물체를 아이 칸으로 다시 나눈다. 깊이는 7까지.',
      '물체가 몰린 곳만 잘게, 빈 곳은 큰 칸 그대로 — 고른 격자보다 몰림에 강하다.',
      '찾기(질의): 칸이 찾는 상자와 안 겹치면 그 아래는 통째로 건너뛴다. 겹치는 잎 칸 안 물체만 하나씩 검사한다.',
      '견본은 물체가 움직이므로 매 프레임 나무를 새로 짓는다 (260개 · 짓기 가벼움). 검사 수(checked)를 모든 물체 수와 비교해 보여 준다.',
    ],
    when: ['물체가 수백 개 넘고 한곳에 몰려다닐 때', '「이 근처에 뭐가 있나」를 자주 물을 때 (충돌 · 클릭 · 시야)'],
    avoid: ['물체가 수십 개뿐 — 그냥 전부 검사하는 게 빠르다', '물체가 화면에 고르게 퍼져 있을 때 — 고른 격자(칸 해시)가 더 단순하고 빠르다'],
    cost: 'light',
    costNote: '짓기는 물체 수 × 깊이 정도 (260개면 아주 가볍다). 찾기는 모두 검사(260번) 대신 겹친 칸 안 몇십 개.',
    level: 2,
    must: [
      '칸 용량(cap)과 최대 깊이(7)를 둬서 같은 자리에 겹친 물체로 끝없이 쪼개지지 않게',
      '쪼갤 때 들어 있던 물체를 아이 칸으로 다시 나누기',
      '찾기에서 겹치지 않는 칸은 아래를 통째로 건너뛰기',
      '검사 수 / 전체 수를 화면에 보여 주기 (효과 확인)',
      '물체 수 · 칸 용량 조절, 칸 선 보기 켬/끔',
    ],
    done: [
      '물체가 몰린 곳만 칸이 잘게 쪼개지고, 무리가 움직이면 칸도 따라 바뀐다',
      '노란 찾기 상자가 지나가면 겹친 칸만 노랗게 열리고, 검사 수가 전체 수보다 훨씬 적다',
      '칸 용량을 키우면 칸이 덜 쪼개지고 검사 수가 는다',
      '찾은 물체 수는 모두 검사했을 때와 같다',
    ],
    code: {
      lang: 'ts',
      title: '쿼드트리 짓기 (용량 넘으면 쪼개기) + 상자 찾기',
      from: 'demos/demosMapA.ts i263 build() · q() 를 정리',
      body: `interface Pt { x: number; y: number } // 0~1 좌표
interface QN { x: number; y: number; s: number; d: number; items: number[]; kids: QN[] | null }

function build(pts: Pt[], cap = 4, maxDepth = 7): QN {
  const root: QN = { x: 0, y: 0, s: 1, d: 0, items: [], kids: null };
  const ins = (n: QN, i: number): void => {
    if (n.kids) {
      const p = pts[i]!;
      const k = (p.x >= n.x + n.s / 2 ? 1 : 0) + (p.y >= n.y + n.s / 2 ? 2 : 0); // 0 왼위 1 오위 2 왼아 3 오아
      ins(n.kids[k]!, i);
      return;
    }
    n.items.push(i);
    if (n.items.length > cap && n.d < maxDepth) { // 넘치면 넷으로
      const h = n.s / 2;
      n.kids = [
        { x: n.x, y: n.y, s: h, d: n.d + 1, items: [], kids: null },
        { x: n.x + h, y: n.y, s: h, d: n.d + 1, items: [], kids: null },
        { x: n.x, y: n.y + h, s: h, d: n.d + 1, items: [], kids: null },
        { x: n.x + h, y: n.y + h, s: h, d: n.d + 1, items: [], kids: null },
      ];
      const it = n.items;
      n.items = [];
      for (const j of it) ins(n, j); // 들어 있던 것 다시 나누기
    }
  };
  for (let i = 0; i < pts.length; i++) ins(root, i);
  return root;
}

function query(n: QN, pts: Pt[], qx: number, qy: number, qw: number, qh: number, out: number[], stat = { checked: 0 }) {
  if (n.x > qx + qw || n.x + n.s < qx || n.y > qy + qh || n.y + n.s < qy) return; // 안 겹치면 통째로 건너뜀
  if (n.kids) { for (const k of n.kids) query(k, pts, qx, qy, qw, qh, out, stat); return; }
  for (const i of n.items) {
    stat.checked++;
    const p = pts[i]!;
    if (p.x >= qx && p.x <= qx + qw && p.y >= qy && p.y <= qy + qh) out.push(i);
  }
}
// 매 프레임: const root = build(pts); const found: number[] = []; query(root, pts, qx, qy, 0.26, 0.2, found);`,
    },
    pitfalls: [
      { title: '같은 자리에 물체가 많으면 끝없이 쪼개진다', fix: '최대 깊이(7)를 둔다. 그 깊이에선 용량을 넘어도 그냥 담는다.' },
      { title: '쪼갠 뒤 원래 물체를 옮기지 않으면 찾기에서 빠진다', fix: '쪼갤 때 들어 있던 물체를 아이 칸으로 다시 넣는다.' },
      { title: '크기 있는 물체를 점으로만 넣으면 칸 경계에 걸친 충돌을 놓친다', fix: '찾을 상자를 물체 반지름만큼 넓혀 묻거나, 걸친 물체는 부모 칸에 둔다.' },
      { title: '물체가 고르게 퍼져 있는데 쿼드트리를 쓰면 이득이 적다', fix: '그럴 땐 고른 격자 칸(해시)이 더 단순하다.' },
    ],
    prev: ['i78'],
    next: ['i284', 'i285', 'i235'],
    refs: [
      { name: 'Wikipedia — Quadtree', url: 'https://en.wikipedia.org/wiki/Quadtree' },
    ],
  },
  i282: {
    id: 'i282',
    summary: '발판을 막 벗어나도 0.1초는 점프되고(코요테), 땅에 닿기 0.12초 전에 누른 점프를 기억하며(버퍼), 일찍 떼면 낮게 뛰게(가변 점프) 해 점프 손맛을 살린다.',
    terms: [
      { en: 'Coyote time', ko: '발판을 벗어난 뒤 잠깐 점프 허용' },
      { en: 'Jump buffering', ko: '땅에 닿기 직전에 누른 점프를 기억' },
      { en: 'Variable jump height (jump cut)', ko: '단추를 일찍 떼면 위로 속도를 잘라 낮게' },
      { en: 'Fixed timestep (1/120 s)', ko: '물리는 고정 간격으로' },
    ],
    goal: '{target}의 점프에 손맛 세 가지를 넣어 줘 — 코요테 타임 0.1초 · 점프 버퍼 0.12초 · 일찍 떼면 위로 속도 × 0.4. 같은 입력으로 켬/끔을 나란히 비교할 수 있게, 화면은 {style}.',
    targets: ['2D 발판 게임 주인공', '수직선 위 점프 놀이', '장애물 넘기 달리기'],
    styles: ['위아래 켬/끔 비교 화면', '밝은 들판 발판', '「코요테!」 같은 글자가 뜨는 설명 화면'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Rigidbody2D 속도를 FixedUpdate 에서 다루고, 땅에서 떨어진 시각 · 누른 시각을 타이머로 둔다.',
      godot: 'Godot 은 CharacterBody2D 의 _physics_process 에서 is_on_floor() 와 타이머 두 개로.',
    },
    principle: [
      '코요테: 땅에 있으면 coy = 0.1 초, 공중이면 매 걸음 줄인다. coy > 0 이면 공중이어도 점프된다 — 발판 끝에서 「늦게 누른」 점프를 살린다.',
      '버퍼: 누른 순간 buf = 0.12 초. buf > 0 인 동안 땅에 닿으면 바로 점프 — 착지 직전 「일찍 누른」 점프를 살린다.',
      '가변 점프: 오르는 중(vy < 0)에 단추를 떼면 vy × 0.4 — 짧게 누르면 낮게, 길게 누르면 높게.',
      '값: 중력 900 · 점프 300 · 달리기 100 · 떨어지는 속도 최대 520. 물리는 1/120초 고정 간격으로 돌린다.',
    ],
    when: ['발판 게임 · 점프가 핵심인 게임', '「눌렀는데 안 뛰었다」는 답답함이 있을 때'],
    avoid: ['점프 높이가 정확히 정해져야 하는 퍼즐 (칸 수 세기) — 가변 점프는 끈다', '턴제 · 칸 이동 게임 — 손맛 타이머가 필요 없다'],
    cost: 'light',
    costNote: '타이머 두 개와 곱셈 하나. 비용 없음.',
    level: 1,
    must: [
      '코요테 0.1초 · 버퍼 0.12초 · 가변 점프 × 0.4 를 각각 켬/끔 할 수 있게',
      '「누른 순간」은 단추 상태가 끔 → 켬으로 바뀐 순간으로 (누르고 있는 동안 계속 점프 금지)',
      '점프할 때 coy · buf 를 0 으로 (두 번 뛰기 방지)',
      '물리는 1/120초 고정 간격 — 화면 프레임과 상관없이 같은 높이',
      '같은 입력을 켬 · 끔 두 캐릭터에 똑같이 넣어 나란히 보여 주기',
    ],
    done: [
      '발판 끝을 지나서 누르면 켬 쪽은 점프(「코요테!」), 끔 쪽은 떨어진다',
      '착지 직전에 누르면 켬 쪽은 닿자마자 다시 뛰고(「버퍼!」), 끔 쪽은 그냥 선다',
      '짧게 누르면 켬 쪽만 낮게 뛴다(「짧게!」)',
      '30fps · 120fps 어디서든 점프 높이가 같다',
    ],
    code: {
      lang: 'ts',
      title: '코요테 · 버퍼 · 가변 점프 (고정 간격 한 걸음)',
      from: 'demos/demos2dMove.ts heroStep() · PF 를 정리',
      body: `const PF = { G: 900, JUMP: 300, RUN: 100, COY: 0.1, BUF: 0.12, CUT: 0.4 };
interface Hero { x: number; y: number; vx: number; vy: number; ground: boolean; coy: number; buf: number; held: boolean; jumping: boolean }
interface Feel { coyote: boolean; buffer: boolean; variable: boolean }

function heroStep(s: Hero, h: number, left: boolean, right: boolean, jump: boolean, feel: Feel) {
  const edge = jump && !s.held; // 막 누른 순간만
  s.held = jump;
  const tv = ((right ? 1 : 0) - (left ? 1 : 0)) * PF.RUN;
  s.vx += (tv - s.vx) * (1 - Math.pow(0.0001, h)); // 부드럽게 목표 속도로
  if (edge) s.buf = feel.buffer ? PF.BUF : h * 0.5;  // 버퍼 끄면 이번 걸음만
  if (s.ground) s.coy = feel.coyote ? PF.COY : 0;
  else s.coy -= h;
  if (s.buf > 0 && (s.ground || s.coy > 0)) {        // 땅이거나 코요테 안
    s.vy = -PF.JUMP;
    s.ground = false;
    s.coy = 0;
    s.buf = 0;
    s.jumping = true;
  }
  s.buf -= h;
  if (s.jumping && !s.held && s.vy < 0) {            // 오르다 떼면
    if (feel.variable) s.vy *= PF.CUT;
    s.jumping = false;
  }
  if (s.vy >= 0) s.jumping = false;
  s.vy = Math.min(s.vy + PF.G * h, 520);
  moveAndCollide(s, h); // 가로 먼저 · 세로 나중 (i283)
}

// 고정 간격: 프레임이 들쭉날쭉해도 1/120초씩 같은 걸음
let acc = 0;
function frame(dt: number) {
  acc += Math.min(Math.max(dt, 0), 0.1);
  let n = 0;
  while (acc >= 1 / 120 && n < 40) { heroStep(hero, 1 / 120, inp.left, inp.right, inp.jump, feel); acc -= 1 / 120; n++; }
}`,
    },
    pitfalls: [
      { title: '「누르고 있는 동안」을 점프로 치면 착지하자마자 계속 뛴다', fix: '끔 → 켬으로 바뀐 순간(edge)만 버퍼에 넣는다.' },
      { title: '점프 뒤 coy 를 0 으로 안 하면 공중에서 한 번 더 뛴다', fix: '점프하는 순간 coy · buf 를 둘 다 0 으로.' },
      { title: '물리를 화면 프레임마다 dt 로 돌리면 기기마다 점프 높이가 다르다', fix: '1/120초 고정 간격으로 여러 번 돌린다. 한 프레임에 40걸음 넘으면 쌓인 시간을 버린다.' },
      { title: '가변 점프를 떨어지는 중에도 걸면 공중에서 멈칫한다', fix: '오르는 중(vy < 0)에 뗐을 때만 자른다.' },
    ],
    prev: ['i283'],
    next: ['i233', 'i285'],
  },

  i283: {
    id: 'i283',
    summary: '캐릭터를 가로로 먼저 움직여 벽에서 밀어내고 세로로 나중에 움직여 바닥 · 천장에서 밀어내며, 경사는 발 높이를 맞추고 한쪽 발판은 위에서만 밟히게 한다.',
    terms: [
      { en: 'Tile collision (axis-separated resolution)', ko: '축마다 따로 움직이고 밀어내기' },
      { en: 'AABB vs tile grid', ko: '상자 캐릭터와 타일 칸 검사' },
      { en: 'Slope tiles (height function)', ko: '경사 칸 — 칸 안 x 로 바닥 높이 계산' },
      { en: 'One-way platform (drop-through)', ko: '아래에서는 통과, 위에서만 밟힘 · 아래키로 내려가기' },
    ],
    goal: '{target}에 타일 충돌을 넣어 줘 — 가로로 먼저 움직여 앞쪽 칸 벽에서 밀고, 세로로 나중에 움직여 바닥 · 천장에서 민다. 경사 · 한쪽 발판까지, 화면은 {style}.',
    targets: ['2D 발판 게임 지도', '미로 · 동굴 타일 지도', '경사 언덕이 있는 들판'],
    styles: ['검사한 칸이 깜빡이는 설명 화면', '밝은 도트 흙 · 잔디', '어두운 동굴'],
    platforms: ['canvas', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Tilemap Collider 2D (+ Composite Collider 2D) 와 Rigidbody2D, 한쪽 발판은 Platform Effector 2D.',
      godot: 'Godot 은 TileMapLayer 물리 층 + CharacterBody2D.move_and_slide(), 한쪽 발판은 타일 충돌의 One Way.',
    },
    principle: [
      '한 번에 대각으로 움직이고 겹침을 풀면 「벽인지 바닥인지」 헷갈려 모서리에 걸린다. 그래서 축을 나눈다.',
      '① 가로: x 만 움직이고, 앞쪽 끝(오른쪽이면 x + 반폭)이 든 칸 열에서 몸 높이에 걸친 칸들을 본다. 벽이면 그 칸 경계에 딱 붙인다.',
      '② 세로: 중력을 더해 y 만 움직이고, 내려가는 중이면 발밑 칸, 올라가는 중이면 머리 위 칸을 본다. 바닥이면 y = 칸 윗면 · vy = 0 · 땅 위.',
      '경사(/ \\)는 칸 안 위치 fx 로 바닥 높이 = 칸 위 + 칸 크기 × (1 − fx) 또는 fx. 땅에 있다가 7 안쪽이면 붙여 줘서 내리막에서 뜨지 않는다.',
      '한쪽 발판(-)은 이전 발 높이가 발판 윗면보다 위였을 때만 밟힌다. 아래키를 누르면 0.25초 동안 무시해 내려간다.',
    ],
    when: ['칸(타일) 지도 위를 걷고 뛰는 게임', '물리 엔진 없이 또렷한 발판 감각이 필요할 때'],
    avoid: ['돌아가는 물체 · 둥근 모양끼리 충돌 — 대신 분리축(i284) · 물리 엔진', '한 걸음에 칸보다 멀리 가는 빠른 물체 — 칸을 건너뛴다. 대신 쓸기 검사(i285) 또는 걸음을 쪼개기'],
    cost: 'light',
    costNote: '걸음마다 걸친 칸 몇 개만 본다. 고정 간격 1/120초로 돌려도 가볍다.',
    level: 2,
    must: [
      '가로 먼저 · 세로 나중 — 순서를 지키기',
      '가로 검사는 앞쪽 끝 열의 칸, 세로 검사는 발밑(내려갈 때) · 머리 위(올라갈 때) 줄의 칸',
      '땅에 서 있을 때 가로 검사 아래 끝을 6 정도 올려, 바닥 칸을 벽으로 착각하지 않게',
      '한쪽 발판은 이전 발 높이로 판단, 아래키로 0.25초 통과',
      '물리는 고정 간격(1/120초)',
    ],
    done: [
      '벽에 붙어 달려도 떨리지 않고 딱 붙어 선다',
      '경사를 오르내릴 때 발이 경사면에 붙어 있다 (내리막에서 통통 튀지 않음)',
      '한쪽 발판은 아래에서 점프하면 통과하고, 위에서는 밟히고, 아래키로 내려갈 수 있다',
      '설명 보기에서 ① 가로 · ② 세로로 검사한 칸이 차례로 표시된다',
    ],
    code: {
      lang: 'ts',
      title: '① 가로 밀어내기 → ② 세로 밀어내기 (+ 한쪽 발판)',
      from: 'demos/demos2dMove.ts i283 physics() 를 정리 (경사는 줄임)',
      body: `const T = 14, HW = 5, HH = 12, GR = 700; // 칸 크기 · 반폭 · 키 · 중력
// tile(c, r): '#' 벽 · '-' 한쪽 발판 · '.' 빈칸 (밖은 '#')
function physics(p: { x: number; y: number; vx: number; vy: number; ground: boolean; drop: number }, h: number) {
  // ① 가로: x 만 움직이고 앞쪽 끝 열의 칸들
  if (p.vx !== 0) {
    p.x += p.vx * h;
    const top = p.y - HH;
    const bot = p.y - (p.ground ? 6 : 0.5); // 서 있으면 발밑 칸은 빼기
    const lead = p.vx > 0 ? p.x + HW : p.x - HW;
    const c = Math.floor(lead / T);
    for (let r = Math.floor(top / T); r <= Math.floor(bot / T); r++)
      if (tile(c, r) === '#') { p.x = p.vx > 0 ? c * T - HW : (c + 1) * T + HW; break; }
  }
  // ② 세로: 중력 → y 만 움직이고 발밑 · 머리 위 줄
  p.vy = Math.min(p.vy + GR * h, 480);
  const prev = p.y;
  p.y += p.vy * h;
  p.ground = false;
  p.drop -= h;
  const cL = Math.floor((p.x - HW + 0.01) / T), cR = Math.floor((p.x + HW - 0.01) / T);
  if (p.vy >= 0) {
    const r = Math.floor((p.y - 0.001) / T);
    for (let c = cL; c <= cR; c++) {
      const ch = tile(c, r);
      const oneWay = ch === '-' && prev <= r * T + 0.5 && p.drop <= 0; // 위에서 내려올 때만
      if (ch === '#' || oneWay) { p.y = r * T; p.vy = 0; p.ground = true; break; }
    }
  } else {
    const r = Math.floor((p.y - HH) / T);
    for (let c = cL; c <= cR; c++)
      if (tile(c, r) === '#') { p.y = (r + 1) * T + HH; p.vy = 0; break; } // 천장
  }
}
// 아래키 + 한쪽 발판 위면: p.drop = 0.25 (0.25초 동안 통과)
// 경사 칸 바닥 높이: surf = r*T + T * (ch === '/' ? 1 - fx : fx), fx = (x - c*T) / T`,
    },
    pitfalls: [
      { title: '대각으로 한 번에 움직이고 풀면 벽 모서리에 걸려 멈춘다', fix: '가로 · 세로를 따로 움직이고 따로 민다.' },
      { title: '땅에 서서 걸으면 바닥 칸을 벽으로 착각해 멈춘다', fix: '서 있을 땐 가로 검사 아래 끝을 발 위 6 으로 올린다.' },
      { title: '내리막 경사에서 캐릭터가 통통 튄다', fix: '땅에 있던 걸음이면 경사면이 발 아래 7 안쪽일 때 붙여 준다.' },
      { title: '한쪽 발판을 지금 발 높이로만 판단하면 아래에서 뛰어도 걸린다', fix: '이전 걸음의 발 높이가 발판 윗면 위였을 때만 밟히게 한다.' },
    ],
    next: ['i282', 'i284'],
  },

  i284: {
    id: 'i284',
    summary: '두 볼록 다각형을 변마다의 법선 축에 그림자로 비춰 보고, 하나라도 틈이 있으면 안 겹침 · 다 겹치면 가장 얕게 겹친 축으로 그만큼 밀어낸다.',
    terms: [
      { en: 'Separating Axis Theorem (SAT)', ko: '분리축 정리 — 갈라 놓는 축이 하나라도 있으면 안 겹침' },
      { en: 'Projection interval [min, max]', ko: '축에 비춘 그림자 구간' },
      { en: 'Minimum Translation Vector (MTV)', ko: '가장 얕은 축 × 겹친 깊이 = 밀어낼 양' },
      { en: 'Convex polygon', ko: '볼록 다각형 (오목하면 나눠야 함)' },
    ],
    goal: '{target}의 충돌을 분리축(SAT)으로 검사해 줘 — 두 다각형 변의 법선마다 그림자 구간을 비교하고, 다 겹치면 가장 얕은 축으로 그 깊이만큼 밀어낸다. 화면은 {style}.',
    targets: ['돌아가는 다각형 조각 끼우기', '탱그램 · 도형 퍼즐', '회전하는 장애물'],
    styles: ['축 · 그림자 구간이 보이는 설명 화면', '귀여운 얼굴 도형', '깔끔한 퍼즐 판'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 2D 물리는 PolygonCollider2D 끼리 이미 이렇게 검사한다 — 직접 쓰려면 Physics2D.Distance 로 겹침 깊이를 얻는다.',
      godot: 'Godot 은 CollisionPolygon2D · ConvexPolygonShape2D 와 Shape2D.collide_and_get_contacts.',
    },
    principle: [
      '두 볼록 도형이 안 겹치면, 둘 사이를 가르는 직선이 있다. 그 직선에 수직인 축에 비춘 두 그림자는 서로 떨어져 있다.',
      '다각형에서 그런 축 후보는 각 변의 법선뿐이다 — A 변들 + B 변들의 법선(길이 1)을 모두 시험한다.',
      '축마다 꼭짓점을 내적해 [min, max] 그림자를 만들고 겹침 ov = min(maxA, maxB) − max(minA, minB). ov ≤ 0 인 축이 하나라도 있으면 안 겹침.',
      '모두 겹치면 ov 가 가장 작은 축이 밀어낼 방향. 방향은 중심 A − B 쪽을 보게 부호를 맞추고, A 를 n × 깊이만큼 옮긴다.',
    ],
    when: ['돌아간 다각형끼리 정확한 겹침 · 밀어내기가 필요할 때', '물리 엔진 없이 도형 퍼즐의 「끼워지나」를 판단할 때'],
    avoid: ['오목한 도형 — 그대로는 틀린다. 대신 볼록 조각으로 나누기', '원 · 둥근 모양 — 원끼리는 거리만 비교하면 된다', '아주 빠른 물체 — 한 걸음에 지나쳐 버린다. 대신 쓸기 검사(i285)'],
    cost: 'light',
    costNote: '축 수 = 두 도형 변 수의 합, 축마다 꼭짓점 내적. 다각형 몇 쌍은 아무 부담 없다. 쌍이 많으면 먼저 쿼드트리(i263)로 가까운 쌍만.',
    level: 2,
    must: [
      '두 도형 모두의 변 법선을 축으로 (한쪽만 보면 틀린다)',
      '법선은 길이 1 로 — 겹침 깊이가 실제 거리가 되게',
      '밀어낼 방향은 A 중심 − B 중심 쪽으로 부호 맞추기',
      '오목 도형은 볼록 조각으로 나눠서',
      '축 · 그림자 구간 보기 켬/끔, 밀어내기 켬/끔',
    ],
    done: [
      '도형을 끌어 겹치면 빨갛게 바뀌고, 떼면 원래 색',
      '설명 보기에서 축마다 두 그림자 구간이 보이고, 틈이 있는 축이 표시된다',
      '밀어내기를 켜면 겹친 도형이 가장 얕은 축으로 딱 붙을 만큼만 밀려난다',
      '도형이 돌아가도 판정이 맞다',
    ],
    code: {
      lang: 'ts',
      title: '분리축 검사 + 가장 얕은 축으로 밀어내기',
      from: 'demos/demos2dMove.ts axesOf() · proj() · sat() 를 정리',
      body: `type Pt = [number, number];
function axesOf(P: Pt[]): Pt[] { // 변마다 법선 (길이 1)
  const out: Pt[] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i]!, b = P[(i + 1) % P.length]!;
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    out.push([ey / l, -ex / l]);
  }
  return out;
}
function proj(P: Pt[], n: Pt): [number, number] { // 축에 비친 그림자 [min, max]
  let mn = Infinity, mx = -Infinity;
  for (const p of P) { const d = p[0] * n[0] + p[1] * n[1]; if (d < mn) mn = d; if (d > mx) mx = d; }
  return [mn, mx];
}
const center = (P: Pt[]): Pt => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];

function sat(A: Pt[], B: Pt[]): { hit: boolean; depth: number; n: Pt } {
  const ca = center(A), cb = center(B);
  let depth = Infinity;
  let best: Pt = [1, 0];
  for (const n of [...axesOf(A), ...axesOf(B)]) {
    const a = proj(A, n), b = proj(B, n);
    const ov = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
    if (ov <= 0) return { hit: false, depth: 0, n }; // 틈 있는 축 하나면 끝
    if (ov < depth) {
      depth = ov;
      const s = (ca[0] - cb[0]) * n[0] + (ca[1] - cb[1]) * n[1] < 0 ? -1 : 1; // A 쪽을 보게
      best = [n[0] * s, n[1] * s];
    }
  }
  return { hit: true, depth, n: best };
}

// 밀어내기: A 를 n × depth 만큼
const r = sat(A, B);
if (r.hit) { ax += r.n[0] * r.depth; ay += r.n[1] * r.depth; }`,
    },
    pitfalls: [
      { title: '한 도형의 축만 보면 안 겹친 것을 겹쳤다고 한다', fix: 'A 변 법선 + B 변 법선을 모두 시험한다.' },
      { title: '법선을 정규화하지 않으면 밀어내는 거리가 틀린다', fix: '법선을 길이 1 로 나눈다.' },
      { title: '밀어낼 방향 부호를 안 맞추면 오히려 더 파고든다', fix: '중심 A − B 와 내적해 음수면 뒤집는다.' },
      { title: '오목한 도형(별 · L 모양)에 그대로 쓰면 틈 사이를 겹침으로 본다', fix: '볼록 조각 여러 개로 나눠 조각마다 검사한다.' },
    ],
    prev: ['i263'],
    next: ['i285'],
    refs: [
      { name: 'Wikipedia — Hyperplane separation theorem', url: 'https://en.wikipedia.org/wiki/Hyperplane_separation_theorem' },
    ],
  },

  i285: {
    id: 'i285',
    summary: '한 걸음에 벽을 건너뛰는 빠른 총알을, 그 순간 자리만 보지 않고 지나온 선분을 반지름만큼 넓힌 벽과 맞대어 닿는 순간을 찾아 뚫림을 막는다.',
    terms: [
      { en: 'Continuous collision detection (swept test)', ko: '쓸고 지나는 충돌 — 지나온 길 전체 검사' },
      { en: 'Tunneling', ko: '빠른 물체가 벽을 뚫고 지나가는 것' },
      { en: 'Minkowski sum (inflated wall)', ko: '벽을 공 반지름만큼 넓혀 점 하나로 검사' },
      { en: 'Time of impact (TOI)', ko: '닿는 순간 — 이번 걸음 안 비율 t' },
    ],
    goal: '{target}이(가) 벽을 뚫지 않게 쓸고 지나는 충돌을 넣어 줘 — 이번 걸음 시작점 → 끝점 선분이 반지름만큼 넓힌 벽과 만나는 순간을 찾아 거기서 멈춘다. 화면은 {style}.',
    targets: ['빠른 총알 · 공', '레이저 · 화살', '낙하하는 작은 물체'],
    styles: ['순간 검사 · 쓸기 검사 두 줄 비교', '불꽃 튀는 사격장', '깔끔한 설명 화면'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Rigidbody2D 의 Collision Detection = Continuous, 직접 하려면 Physics2D.CircleCast.',
      godot: 'Godot 은 RigidBody2D 의 continuous_cd, 직접 하려면 PhysicsDirectSpaceState2D.cast_motion.',
    },
    principle: [
      '1초에 20번 보는데 총알이 초속 560 이면 한 번에 28씩 간다. 벽 두께가 4 면 「그 순간」 자리만 보면 벽 앞 → 벽 뒤로 건너뛰어 놓친다 (견본 위 줄).',
      '공(반지름 3)과 벽 대신, 벽을 양쪽으로 3씩 넓히고 공을 점으로 본다 (민코프스키 합). 넓힌 벽 왼쪽 면 L = 벽 x − 3.',
      '이번 걸음 x0 → x1 에서 x0 ≤ L ≤ x1 이면 지나온 길에 벽이 있다. 닿는 비율 t = (L − x0) / (x1 − x0), 그 자리 L 에 멈춘다.',
      '닿은 뒤엔 튕김: vx × −0.25 · vy = −120 위로 튀며 불꽃.',
    ],
    when: ['한 걸음 이동이 벽 두께보다 클 수 있는 빠른 물체', '검사 횟수(물리 빈도)를 낮춰야 하는 폰 게임'],
    avoid: ['느린 물체 — 순간 검사로 충분하다', '서로 빠르게 움직이는 두 물체 — 한쪽 기준으로 상대 속도를 써야 한다. 대신 물리 엔진의 연속 충돌'],
    cost: 'light',
    costNote: '걸음마다 선분 × 벽 검사 하나. 벽이 많으면 지나는 길 상자 안 벽만 고른다.',
    level: 2,
    must: [
      '공 반지름만큼 벽을 넓혀(민코프스키) 점 · 선분 검사로 바꾸기',
      '이번 걸음의 시작점 · 끝점으로 검사 (끝점만 보지 않기)',
      '닿는 순간 자리에 멈추고, 남은 걸음은 튕김으로',
      '같은 입력의 「순간 검사」와 나란히 비교, 빠르기 · 검사 횟수 조절',
    ],
    done: [
      '빠르기를 올리거나 검사 횟수를 내리면 위 줄(순간 검사)은 벽을 뚫고, 아래 줄(쓸기)은 늘 벽에서 튕긴다',
      '뚫림 · 막음 횟수가 줄마다 쌓여 보인다',
      '「넓힌 벽」 보기를 켜면 반지름만큼 넓힌 벽이 보인다',
      '닿는 자리가 벽 면에 딱 맞는다',
    ],
    code: {
      lang: 'ts',
      title: '이번 걸음 선분 × 넓힌 벽 → 닿는 순간에 멈추기',
      from: 'demos/demos2dMove.ts i285 physTick() 을 정리',
      body: `const WX = 168, WW = 4, RAD = 3; // 벽 x · 두께 · 총알 반지름
interface B { x: number; vx: number; y: number; vy: number; hit: boolean }

// 위 줄 — 순간 검사: 끝점만 본다 (빠르면 뚫린다)
function stepPoint(b: B, h: number) {
  b.x += b.vx * h;
  if (b.x > WX - RAD && b.x < WX + WW + RAD) b.hit = true;
}

// 아래 줄 — 쓸기 검사: 지나온 길 x0 → x1 이 넓힌 벽 면 L 을 건너면 닿음
function stepSwept(b: B, h: number) {
  const x0 = b.x;
  const x1 = b.x + b.vx * h;
  const L = WX - RAD; // 벽을 반지름만큼 넓힌 왼쪽 면 (민코프스키)
  if (x0 <= L && x1 >= L) {
    const t = (L - x0) / (x1 - x0); // 이번 걸음 안 닿는 비율 (0~1)
    void t;                          // 남은 (1 - t) 만큼은 튕긴 뒤 쓸 수 있다
    b.x = L;
    b.hit = true;
  } else b.x = x1;
  if (b.hit) {
    b.vx = -b.vx * 0.25; // 튕김
    b.vy = -120;
  }
}

// 1초에 hz 번 고정 간격
let acc = 0;
function frame(dt: number, hz = 20) {
  acc += Math.min(dt, 0.1);
  const H = 1 / hz;
  while (acc >= H) { acc -= H; stepPoint(top, H); stepSwept(bottom, H); }
}`,
    },
    pitfalls: [
      { title: '끝점만 검사하면 빠른 총알이 얇은 벽을 뚫는다', fix: '이번 걸음 시작점 → 끝점 선분이 벽을 건너는지 본다.' },
      { title: '공을 점으로 보면서 벽을 안 넓히면 공이 벽에 반쯤 박힌다', fix: '벽을 반지름만큼 넓혀(민코프스키) 점 검사로 바꾼다.' },
      { title: '닿은 뒤 끝점으로 옮기면 벽 안에 들어가 다음 걸음에 갇힌다', fix: '닿는 자리(L)에 멈추고 속도를 바꾼다.' },
      { title: '검사 횟수만 올려 막으면 폰에서 무겁다', fix: '쓸기 검사는 검사 횟수가 적어도 막는다 — 빈도를 올리는 대신 쓸기를.' },
    ],
    prev: ['i284', 'i283'],
    next: ['i263'],
    refs: [
      { name: 'Wikipedia — Minkowski addition', url: 'https://en.wikipedia.org/wiki/Minkowski_addition' },
      { name: 'Wikipedia — Collision detection', url: 'https://en.wikipedia.org/wiki/Collision_detection' },
    ],
  },

  i286: {
    id: 'i286',
    summary: '점들을 지난 자리와의 차로 움직이고(베를레) 「이웃 점과 길이 지키기」를 12번 되풀이해 풀어, 출렁이는 밧줄 · 다리를 만들고 가위로 자르면 사탕이 떨어진다.',
    terms: [
      { en: 'Verlet integration', ko: '속도 대신 「지금 − 지난 자리」로 움직이기' },
      { en: 'Distance constraint (relaxation)', ko: '두 점 길이 지키기 — 여러 번 되풀이해 풀기' },
      { en: 'Inverse mass (pinned points)', ko: '역질량 0 = 고정된 점, 클수록 가볍다' },
      { en: 'Segment–segment intersection (cutting)', ko: '자르는 선과 밧줄 마디가 만나는지' },
    ],
    goal: '{target}을(를) 베를레 점 + 길이 제약으로 만들어 줘 — 점은 지난 자리와의 차로 움직이고, 길이 지키기를 12번 되풀이해 풀며, 끌어서 자를 수 있게. 화면은 {style}.',
    targets: ['사탕을 매단 밧줄 두 가닥', '출렁이는 줄다리', '흔들리는 사슬 · 덩굴'],
    styles: ['밧줄 자르기 퍼즐', '귀엽고 아기자기', '숲속 흔들다리'],
    platforms: ['canvas', 'web', 'unity', 'godot'],
    platformHints: {
      unity: 'Unity 는 Rigidbody2D 마디를 DistanceJoint2D · HingeJoint2D 로 이어 사슬을 만든다.',
      godot: 'Godot 은 RigidBody2D 마디를 PinJoint2D 로 잇는다.',
    },
    principle: [
      '점마다 지금 자리 p 와 지난 자리 o 만 둔다. 속도 = (p − o) × 0.997(공기 저항), 새 자리 = p + 속도 + 중력 520 × h².',
      '마디마다 「두 점 거리 = 정한 길이」 제약. 길이가 d 면 차이 (d − len)/d 만큼 두 점을 서로 쪽으로 옮긴다 — 역질량 비율로 나눠서.',
      '한 마디를 맞추면 이웃 마디가 틀어지므로 전체를 12번 되풀이해 푼다 (많을수록 덜 늘어난다).',
      '고정점은 역질량 0 (안 움직임), 사탕은 0.2 (무겁다). 줄은 길이 × 1.02, 다리는 × 1.07 로 살짝 늘어지게.',
      '자르기: 끌어 그은 선분과 밧줄 마디 선분이 만나면 그 제약을 끈다 — 사탕이 다리로 떨어진다.',
    ],
    when: ['밧줄 · 사슬 · 다리처럼 출렁이는 줄', '자르기 · 매달기 퍼즐'],
    avoid: ['딱딱한 막대 · 상자 — 강체 물리가 낫다', '아주 긴 줄(마디 수백) — 되풀이 횟수를 크게 올려야 늘어나지 않는다. 대신 물리 엔진의 관절'],
    cost: 'light',
    costNote: '점 수십 개 × 제약 수십 개 × 12번. 1/120초 고정 간격으로도 폰이 가볍다.',
    level: 2,
    must: [
      '점 움직임은 베를레 (p − o) — 속도 변수를 따로 두지 않기',
      '길이 제약은 역질량 비율로 나눠 옮기고, 전체를 여러 번(기본 12) 되풀이',
      '고정점은 역질량 0',
      '물리는 고정 간격 1/120초',
      '되풀이 횟수 조절 · 자르기(끌어 긋기) · 다시 시작',
    ],
    done: [
      '사탕이 두 줄에 매달려 출렁이다 가만히 멈춘다',
      '한 줄을 자르면 사탕이 다른 줄에 매달려 크게 흔들리고, 둘 다 자르면 다리에 떨어져 다리가 출렁인다',
      '되풀이 횟수를 1~2 로 내리면 줄이 고무줄처럼 늘어나고, 올리면 팽팽하다',
      '사탕을 끌어 흔들 수 있다',
    ],
    code: {
      lang: 'ts',
      title: '베를레 걸음 + 길이 제약 되풀이 풀기',
      from: 'demos/demos2dMove.ts i286 physics() 를 정리 (사탕 ↔ 다리 충돌은 줄임)',
      body: `const px: number[] = [], py: number[] = [], ox: number[] = [], oy: number[] = [], inv: number[] = [];
interface Con { a: number; b: number; len: number; alive: boolean }
const cons: Con[] = [];
const add = (x: number, y: number, w: number) => { px.push(x); py.push(y); ox.push(x); oy.push(y); inv.push(w); return px.length - 1; };
// a → b 사이에 점 n-1 개, 길이는 slack 배로 (줄 1.02 · 다리 1.07)
function chain(a: number, b: number, n: number, slack: number) {
  const ids = [a];
  for (let i = 1; i < n; i++) ids.push(add(px[a]! + ((px[b]! - px[a]!) * i) / n, py[a]! + ((py[b]! - py[a]!) * i) / n, 1));
  ids.push(b);
  const d = Math.hypot(px[b]! - px[a]!, py[b]! - py[a]!) / n;
  for (let i = 0; i < n; i++) cons.push({ a: ids[i]!, b: ids[i + 1]!, len: d * slack, alive: true });
}

function physics(h: number, iters = 12) {
  const G = 520;
  for (let i = 0; i < px.length; i++) { // 베를레: 지난 자리와의 차가 속도
    if (inv[i] === 0) continue;          // 고정점
    const vx = (px[i]! - ox[i]!) * 0.997, vy = (py[i]! - oy[i]!) * 0.997;
    ox[i] = px[i]!; oy[i] = py[i]!;
    px[i] = px[i]! + vx;
    py[i] = py[i]! + vy + G * h * h;
  }
  for (let it = 0; it < iters; it++)      // 길이 지키기를 여러 번
    for (const c of cons) {
      if (!c.alive) continue;
      const wa = inv[c.a]!, wb = inv[c.b]!, ws = wa + wb;
      if (ws === 0) continue;
      const dx = px[c.b]! - px[c.a]!, dy = py[c.b]! - py[c.a]!;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - c.len) / d;
      px[c.a] = px[c.a]! + dx * diff * (wa / ws); py[c.a] = py[c.a]! + dy * diff * (wa / ws);
      px[c.b] = px[c.b]! - dx * diff * (wb / ws); py[c.b] = py[c.b]! - dy * diff * (wb / ws);
    }
}
// 만들기: const p1 = add(92, 14, 0), p2 = add(204, 24, 0), candy = add(150, 80, 0.2);
// chain(p1, candy, 13, 1.02); chain(p2, candy, 12, 1.02);
// 자르기: 그은 선분과 마디 선분이 만나면 c.alive = false`,
    },
    pitfalls: [
      { title: '제약을 한 번만 풀면 줄이 고무줄처럼 늘어난다', fix: '전체를 여러 번(12) 되풀이한다. 마디가 많을수록 더 필요하다.' },
      { title: '두 점을 반씩만 옮기면 고정점이 끌려 움직인다', fix: '역질량 비율(wa/ws · wb/ws)로 나누고 고정점은 역질량 0.' },
      { title: 'dt 를 프레임마다 바꾸면 베를레가 터지거나 힘이 바뀐다', fix: '베를레는 걸음 간격이 같다고 보는 식이라 1/120초 고정 간격으로 돌린다.' },
      { title: '공기 저항(0.997)이 없으면 영원히 흔들린다', fix: '속도에 1보다 조금 작은 값을 곱한다.' },
    ],
    prev: ['i282'],
    next: ['i287', 'i288'],
    refs: [
      { name: 'Wikipedia — Verlet integration', url: 'https://en.wikipedia.org/wiki/Verlet_integration' },
    ],
  },
};

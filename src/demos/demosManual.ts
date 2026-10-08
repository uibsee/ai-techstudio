import * as THREE from 'three';
import type { Control, DemoMap } from './types';

/**
 * 설명서 그림체 — 건축 · 제품 설명서처럼 「2D 같은데 돌려 볼 수 있는 3D」 (참고: @Skylartkitchen 의 텃밭 설명서, Opus 5.5).
 * 견본: 쌓기나무 탑 조립 설명서.
 *  - 정사영 카메라 · 흰 단색 세계 · 이번 단계 부품만 주황 · 가는 회색 모서리 선 · 반투명 배경(집 · 나무 · 모눈) · 밝은 그림자
 *  - 단계 넘기기 + 카메라 이동 · 부품이 화살표를 따라 떨어져 끼워짐
 *  - 번호 지시점 ①② · 확대 원(깃발) · 축척 막대 · 평면도 미니맵(위에서 본 모양 + 높이 숫자) · 부품 칸 · 단계 글
 * 세 카드가 같은 장면을 쓴다: i70 종합 · i71 단색 + 강조색(평소 그림과 번갈아) · i72 도면 장치.
 */

type Mode = 'full' | 'accent' | 'devices';
const ORANGE = 0xff7a1a;
const UNIT = '1칸';

interface Part {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  step: number;
  /** 설명 번호 (그 단계 안에서) */
  no: number;
  /** 평소 그림의 색 */
  color: number;
  /** 미니맵 칸 (쌓기나무만) */
  cell?: [number, number];
}
interface Step {
  title: string;
  items: string[];
  meta: string;
  note?: string;
  target: [number, number, number];
  size: number;
  parts: { icon: 'board' | 'cube' | 'flag'; name: string; n: number }[];
  zoom?: boolean;
}

const STEPS: Step[] = [
  {
    title: '무엇을 만드나',
    items: ['받침판 위에 쌓기나무 7개로 3층 탑을 쌓아요', '위에서 보면 칸마다 몇 개 쌓였는지 숫자로 볼 수 있어요'],
    meta: '≈5분 · 받침판 1 · 쌓기나무 7 · 깃발 1',
    note: '오른쪽 위 평면도는 위에서 본 모양이에요.',
    target: [0, 1.2, 0],
    size: 8.5,
    parts: [
      { icon: 'board', name: '받침판', n: 1 },
      { icon: 'cube', name: '쌓기나무', n: 7 },
      { icon: 'flag', name: '깃발', n: 1 },
    ],
  },
  {
    title: '받침판 놓기',
    items: ['평평한 곳에 받침판을 놓아요', '모눈 한 칸 = 쌓기나무 한 변'],
    meta: '≈1분 · 받침판 1',
    target: [0, 0.4, 0],
    size: 5.2,
    parts: [{ icon: 'board', name: '받침판', n: 1 }],
  },
  {
    title: '첫째 층 — 네 칸',
    items: ['왼쪽 뒤', '오른쪽 뒤', '왼쪽 앞', '오른쪽 앞'],
    meta: '쌓기나무 4개 · 지금까지 4',
    note: '모서리를 받침판 선에 맞춰요.',
    target: [0, 0.7, 0],
    size: 5,
    parts: [{ icon: 'cube', name: '쌓기나무', n: 4 }],
  },
  {
    title: '둘째 층 — 왼쪽 줄',
    items: ['왼쪽 뒤 위에', '왼쪽 앞 위에'],
    meta: '쌓기나무 2개 · 지금까지 6',
    target: [-0.3, 1.3, 0],
    size: 5,
    parts: [{ icon: 'cube', name: '쌓기나무', n: 2 }],
  },
  {
    title: '꼭대기와 깃발',
    items: ['왼쪽 뒤 칸 맨 위에 하나', '깃발을 구멍에 꽂아요 — 확대 그림'],
    meta: '쌓기나무 1개 + 깃발 · 모두 7개',
    target: [-0.4, 2.2, -0.2],
    size: 5,
    parts: [
      { icon: 'cube', name: '쌓기나무', n: 1 },
      { icon: 'flag', name: '깃발', n: 1 },
    ],
    zoom: true,
  },
  {
    title: '완성 — 몇 개일까?',
    items: ['위에서 본 칸마다 높이: 3 · 2 · 1 · 1', '더하면 3 + 2 + 1 + 1 = 7개'],
    meta: '평면도의 숫자를 모두 더하면 쌓기나무 수',
    target: [0, 1.3, 0],
    size: 7,
    parts: [],
  },
];

const CSS = `
.mn-root{position:absolute;inset:0;overflow:hidden;background:#fafaf8;font-family:'Pretendard Variable',Pretendard,system-ui,sans-serif;color:#151515;--s:1}
.mn-root canvas.mn-gl{position:absolute;left:0;top:0;width:100%;height:calc(100% - var(--ph));display:block}
.mn-top{position:absolute;left:0;right:0;top:0;height:calc(34px*var(--s));display:flex;justify-content:space-between;align-items:center;padding:0 calc(12px*var(--s));border-bottom:1px solid #e3e3e0;background:#fafaf8;z-index:3}
.mn-top b{font-size:calc(13px*var(--s));font-weight:700}.mn-top small{font-size:calc(10px*var(--s));color:#777;display:block;font-weight:400}
.mn-top span{font-size:calc(11px*var(--s));color:#555;font-family:ui-monospace,Menlo,monospace}
.mn-svg{position:absolute;left:0;top:0;width:100%;height:calc(100% - var(--ph));pointer-events:none;z-index:2}
.mn-tray{position:absolute;left:calc(10px*var(--s));top:calc(42px*var(--s));background:rgba(250,250,248,.92);border:1px solid #e3e3e0;padding:calc(6px*var(--s));z-index:3}
.mn-tray i{display:block;font-style:normal;font-size:calc(9px*var(--s));color:#777;font-family:ui-monospace,Menlo,monospace;margin-bottom:calc(4px*var(--s))}
.mn-tray div{display:flex;gap:calc(6px*var(--s))}
.mn-tray figure{margin:0;width:calc(46px*var(--s));text-align:center;font-size:calc(9px*var(--s));line-height:1.2;color:#333}
.mn-tray figure span{position:relative;display:block;width:calc(40px*var(--s));height:calc(40px*var(--s));margin:0 auto calc(3px*var(--s));background:#fff;border:1px solid #e6e6e2}
.mn-tray figure em{position:absolute;right:-3px;bottom:-3px;background:#151515;color:#fff;font-style:normal;font-size:calc(9px*var(--s));padding:0 calc(3px*var(--s))}
.mn-mini{position:absolute;right:calc(10px*var(--s));top:calc(42px*var(--s));background:rgba(250,250,248,.92);border:1px solid #e3e3e0;padding:calc(4px*var(--s));z-index:3}
.mn-mini i{display:block;font-style:normal;font-size:calc(9px*var(--s));color:#777;font-family:ui-monospace,Menlo,monospace}
.mn-scale{position:absolute;left:calc(12px*var(--s));bottom:calc(var(--ph) + 10px*var(--s));font-size:calc(10px*var(--s));font-family:ui-monospace,Menlo,monospace;color:#333;display:flex;align-items:center;gap:calc(6px*var(--s));z-index:3}
.mn-scale u{display:block;height:calc(6px*var(--s));border:1px solid #333;border-top:0;text-decoration:none}
.mn-zoom{position:absolute;border-radius:50%;border:1.5px solid #333;z-index:3;pointer-events:none;background:radial-gradient(circle,transparent 69%,#fafaf8 70.5%)}
.mn-panel{position:absolute;left:0;right:0;bottom:0;height:var(--ph);background:#fff;border-top:1px solid #e3e3e0;padding:calc(10px*var(--s)) calc(14px*var(--s)) 0;display:grid;grid-template-columns:auto 1fr;column-gap:calc(12px*var(--s));z-index:3}
.mn-no{font-size:calc(34px*var(--s));font-weight:800;line-height:1}
.mn-panel h3{margin:0 0 calc(3px*var(--s));font-size:calc(14px*var(--s));font-weight:700}
.mn-panel ol{margin:0;padding:0;list-style:none;display:grid;gap:calc(3px*var(--s))}
.mn-panel li{display:flex;gap:calc(6px*var(--s));align-items:center;font-size:calc(12px*var(--s))}
.mn-panel li b{display:inline-grid;place-items:center;width:calc(15px*var(--s));height:calc(15px*var(--s));border-radius:50%;background:#151515;color:#fff;font-size:calc(9px*var(--s));flex:none}
.mn-meta{margin-top:calc(5px*var(--s));font-size:calc(10px*var(--s));color:#666;font-family:ui-monospace,Menlo,monospace}
.mn-note{margin-top:calc(4px*var(--s));font-size:calc(10.5px*var(--s));color:#555;border-left:2px solid #ddd;padding-left:calc(6px*var(--s))}
.mn-btns{position:absolute;left:calc(14px*var(--s));right:calc(14px*var(--s));bottom:calc(10px*var(--s));display:grid;grid-template-columns:1fr 2fr;gap:calc(8px*var(--s))}
.mn-btns button{height:calc(30px*var(--s));font:inherit;font-size:calc(12px*var(--s));font-weight:600;border:1px solid #151515;background:#fff;color:#151515;cursor:pointer}
.mn-btns button.go{background:#151515;color:#fff}
.mn-tag{position:absolute;left:50%;top:calc(42px*var(--s));transform:translateX(-50%);z-index:4;font-size:calc(11px*var(--s));font-weight:700;padding:calc(3px*var(--s)) calc(10px*var(--s));border-radius:99px;background:#151515;color:#fff}
.mn-root.small .mn-panel ol,.mn-root.small .mn-note,.mn-root.small .mn-meta,.mn-root.small .mn-tray i{display:none}
.mn-root.colorful{background:#cfe9ff}
`;

function iconSvg(kind: 'board' | 'cube' | 'flag'): string {
  const o = '#ff7a1a';
  const d = '#c4560a';
  if (kind === 'board')
    return `<svg viewBox="0 0 40 40"><path d="M4 24 L20 16 L36 24 L20 32Z" fill="${o}" stroke="#333" stroke-width=".8"/><path d="M4 24 L4 27 L20 35 L20 32Z" fill="${d}" stroke="#333" stroke-width=".8"/><path d="M36 24 L36 27 L20 35 L20 32Z" fill="#e0680f" stroke="#333" stroke-width=".8"/></svg>`;
  if (kind === 'cube')
    return `<svg viewBox="0 0 40 40"><path d="M20 7 L32 13 L20 19 L8 13Z" fill="${o}" stroke="#333" stroke-width=".8"/><path d="M8 13 L20 19 L20 33 L8 27Z" fill="${d}" stroke="#333" stroke-width=".8"/><path d="M32 13 L20 19 L20 33 L32 27Z" fill="#e0680f" stroke="#333" stroke-width=".8"/></svg>`;
  return `<svg viewBox="0 0 40 40"><path d="M14 34 L14 6" stroke="#333" stroke-width="1.6"/><path d="M14 7 L30 12 L14 17Z" fill="${o}" stroke="#333" stroke-width=".8"/></svg>`;
}

function make(mode: Mode) {
  return (box: HTMLElement) => {
    const root = document.createElement('div');
    root.className = 'mn-root';
    root.innerHTML = `<style>${CSS}</style>
      <div class="mn-top"><div><b>쌓기나무 탑 설명서</b><small>설명서 그림체 견본</small></div><span class="mn-step"></span></div>
      <canvas class="mn-gl"></canvas><svg class="mn-svg"></svg>
      <div class="mn-tray"><i>이번 단계 부품</i><div></div></div>
      <div class="mn-mini"><i>평면도</i><canvas></canvas></div>
      <div class="mn-scale"><u></u><span>${UNIT}</span></div>
      <div class="mn-zoom"></div>
      <div class="mn-tag"></div>
      <div class="mn-panel"><div class="mn-no"></div><div><h3></h3><ol></ol><div class="mn-meta"></div><div class="mn-note"></div></div>
        <div class="mn-btns"><button class="back">이전</button><button class="go">다음 단계</button></div></div>`;
    box.appendChild(root);
    const $ = <T extends Element>(s: string): T => root.querySelector(s) as T;
    const canvas = $<HTMLCanvasElement>('canvas.mn-gl');
    const svg = $<SVGSVGElement>('svg.mn-svg');
    const mini = $<HTMLCanvasElement>('.mn-mini canvas');
    const zoomEl = $<HTMLElement>('.mn-zoom');
    const tag = $<HTMLElement>('.mn-tag');

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xfafaf8);
    renderer.autoClear = false;

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd4d6da, 2.35));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(-4, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    /* 재질 — 흰 · 강조 · 반투명 배경 · 선 */
    const white = new THREE.MeshLambertMaterial({ color: 0xf6f6f3 });
    const accent = new THREE.MeshLambertMaterial({ color: ORANGE });
    const ghost = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
    const groundM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const lineM = new THREE.LineBasicMaterial({ color: 0x8c8c88 });
    const ghostLineM = new THREE.LineBasicMaterial({ color: 0xc8c8c4 });
    const colorMats = new Map<number, THREE.MeshLambertMaterial>();
    const colorMat = (c: number): THREE.MeshLambertMaterial => {
      let m = colorMats.get(c);
      if (!m) colorMats.set(c, (m = new THREE.MeshLambertMaterial({ color: c })));
      return m;
    };
    const geos: THREE.BufferGeometry[] = [];
    const lines: THREE.LineSegments[] = [];
    const edged = (geo: THREE.BufferGeometry, mat: THREE.Material, lm = lineM): THREE.Mesh => {
      geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      const eg = new THREE.EdgesGeometry(geo, 25);
      geos.push(eg);
      const l = new THREE.LineSegments(eg, lm);
      m.add(l);
      lines.push(l);
      return m;
    };

    /* 바닥 · 모눈 · 배경(집 · 나무) */
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
    geos.push(ground.geometry);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(24, 24, 0xdcdcd8, 0xe8e8e4);
    grid.position.y = 0.002;
    scene.add(grid);
    const ghosts: { m: THREE.Mesh; color: number }[] = [];
    const addGhost = (geo: THREE.BufferGeometry, x: number, y: number, z: number, color: number, ry = 0): void => {
      const m = edged(geo, ghost, ghostLineM);
      m.castShadow = true;
      m.position.set(x, y, z);
      m.rotation.y = ry;
      scene.add(m);
      ghosts.push({ m, color });
    };
    // 집 (몸통 + 지붕)
    addGhost(new THREE.BoxGeometry(3.2, 2.4, 2.6), -4.6, 1.2, -3.6, 0xf2d7a8);
    const roof = new THREE.ConeGeometry(2.5, 1.3, 4);
    roof.rotateY(Math.PI / 4);
    addGhost(roof, -4.6, 3.05, -3.6, 0xc8553a);
    // 나무 (원뿔 + 줄기)
    for (const [x, z, s] of [
      [4.2, -3.8, 1.2],
      [5.4, -1.2, 0.9],
      [-6.2, 2.2, 1],
    ] as const) {
      addGhost(new THREE.ConeGeometry(0.8 * s, 2.4 * s, 10), x, 1.6 * s, z, 0x5ab25a);
      addGhost(new THREE.CylinderGeometry(0.1 * s, 0.12 * s, 0.6 * s, 8), x, 0.3 * s, z, 0x8a5a36);
    }

    /* 부품 */
    const parts: Part[] = [];
    const board = edged(new THREE.BoxGeometry(2.4, 0.2, 2.4), white);
    scene.add(board);
    parts.push({ mesh: board, home: new THREE.Vector3(0, 0.1, 0), step: 1, no: 1, color: 0xd9a46a });
    const cubeGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const cubeCols = [0x3a8ee8, 0xe8453c, 0xffc53a, 0x4ab85a, 0x9a6ae8, 0x2ac0c8, 0xff8a3a];
    const cubes: [number, number, number, number, [number, number]][] = [
      // x, layer, z, step, cell(col,row)
      [-0.5, 0, -0.5, 2, [0, 0]],
      [0.5, 0, -0.5, 2, [1, 0]],
      [-0.5, 0, 0.5, 2, [0, 1]],
      [0.5, 0, 0.5, 2, [1, 1]],
      [-0.5, 1, -0.5, 3, [0, 0]],
      [-0.5, 1, 0.5, 3, [0, 1]],
      [-0.5, 2, -0.5, 4, [0, 0]],
    ];
    const noIn: Record<number, number> = {};
    cubes.forEach(([x, layer, z, step, cell], i) => {
      const m = edged(i === 0 ? cubeGeo : cubeGeo.clone(), white);
      scene.add(m);
      noIn[step] = (noIn[step] ?? 0) + 1;
      parts.push({ mesh: m, home: new THREE.Vector3(x, 0.2 + 0.5 + layer, z), step, no: noIn[step]!, color: cubeCols[i]!, cell });
    });
    // 깃발 (막대 + 천)
    const flag = new THREE.Group();
    const pole = edged(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), white);
    pole.position.y = 0.45;
    const cloth = edged(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.42, -0.13), new THREE.Vector2(0, -0.26)]), { depth: 0.02, bevelEnabled: false }), white);
    cloth.position.set(0.02, 0.88, 0);
    flag.add(pole, cloth);
    scene.add(flag);
    parts.push({ mesh: flag, home: new THREE.Vector3(-0.5, 0.2 + 3, -0.5), step: 4, no: 2, color: 0xe8453c });

    /* 화살표 (부품마다 하나) */
    const arrows = parts.map(() => {
      const g = new THREE.Group();
      const am = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 8), am);
      shaft.position.y = 0.55;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 12), am);
      head.rotation.x = Math.PI;
      head.position.y = 0.05;
      geos.push(shaft.geometry, head.geometry);
      g.add(shaft, head);
      g.visible = false;
      scene.add(g);
      return { g, am };
    });

    /* 카메라 — 정사영 (설명서) / 원근 (비교) */
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const persp = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    const DIR = new THREE.Vector3(1, 0.86, 1.1).normalize();
    const zoomCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const cam = { target: new THREE.Vector3(0, 1.2, 0), size: 8.5, toTarget: new THREE.Vector3(0, 1.2, 0), toSize: 8.5 };

    /* 상태 */
    let step = mode === 'devices' ? 4 : 0;
    let stepT = 0;
    let auto = true;
    let usePersp = false;
    let accentOn = true;
    let linesOn = true;
    let colorful = false;
    let flipT = 0;
    let w = 1;
    let h = 1;
    let ph = 0;

    const setStep = (k: number): void => {
      step = (k + STEPS.length) % STEPS.length;
      stepT = 0;
      cam.toTarget.set(...STEPS[step]!.target);
      cam.toSize = STEPS[step]!.size;
      drawPanel();
    };
    $<HTMLButtonElement>('.mn-btns .back').onclick = () => {
      auto = false;
      setStep(step - 1);
    };
    $<HTMLButtonElement>('.mn-btns .go').onclick = () => {
      auto = false;
      setStep(step + 1);
    };

    function drawPanel(): void {
      const s = STEPS[step]!;
      $<HTMLElement>('.mn-step').textContent = `${step} / ${STEPS.length - 1}`;
      $<HTMLElement>('.mn-no').textContent = step ? String(step) : '◎';
      $<HTMLElement>('.mn-panel h3').textContent = s.title;
      $<HTMLElement>('.mn-panel ol').innerHTML = s.items.map((t, i) => `<li><b>${i + 1}</b>${t}</li>`).join('');
      $<HTMLElement>('.mn-meta').textContent = s.meta;
      const note = $<HTMLElement>('.mn-note');
      note.textContent = s.note ?? '';
      note.style.display = s.note ? '' : 'none';
      $<HTMLElement>('.mn-tray div').innerHTML = s.parts
        .map((p) => `<figure><span>${iconSvg(p.icon)}<em>×${p.n}</em></span>${p.name}</figure>`)
        .join('');
      $<HTMLElement>('.mn-tray').style.display = s.parts.length ? '' : 'none';
      $<HTMLButtonElement>('.mn-btns .go').textContent = step === STEPS.length - 1 ? '처음으로' : '다음 단계';
    }

    function drawMini(): void {
      const sz = Math.round(70 * Number(root.style.getPropertyValue('--s') || 1));
      const dpr = Math.min(devicePixelRatio, 2);
      if (mini.width !== sz * dpr) {
        mini.width = mini.height = sz * dpr;
        mini.style.width = mini.style.height = `${sz}px`;
      }
      const g = mini.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, sz, sz);
      const c = sz / 2;
      const cell = sz * 0.3;
      g.strokeStyle = '#bbb';
      g.lineWidth = 1;
      g.strokeRect(c - cell * 1.2, c - cell * 1.2, cell * 2.4, cell * 2.4);
      const height: number[][] = [
        [0, 0],
        [0, 0],
      ];
      const cur: boolean[][] = [
        [false, false],
        [false, false],
      ];
      for (const p of parts) {
        if (!p.cell || p.step > step) continue;
        height[p.cell[1]]![p.cell[0]]!++;
        if (p.step === step) cur[p.cell[1]]![p.cell[0]] = true;
      }
      for (let r = 0; r < 2; r++)
        for (let q = 0; q < 2; q++) {
          const x = c - cell + q * cell;
          const y = c - cell + r * cell;
          const n = height[r]![q]!;
          g.fillStyle = n ? (cur[r]![q] && accentOn ? '#ff7a1a' : '#e6e6e2') : '#fff';
          g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
          g.strokeStyle = '#666';
          g.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
          if (n) {
            g.fillStyle = cur[r]![q] && accentOn ? '#fff' : '#151515';
            g.font = `700 ${Math.round(cell * 0.5)}px Pretendard, system-ui`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(String(n), x + cell / 2, y + cell / 2 + 1);
          }
        }
    }

    const easeBounce = (x: number): number => {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    };

    const proj = (v: THREE.Vector3, c: THREE.Camera): [number, number] => {
      const p = v.clone().project(c);
      return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * (h - ph)];
    };

    setStep(step);

    const controls: Control[] = [
      { type: 'button', label: '다음 단계', on: () => ((auto = false), setStep(step + 1)) },
      { type: 'button', label: '처음부터', on: () => setStep(0) },
      { type: 'toggle', label: '저절로 넘기기', value: true, on: (v) => (auto = v) },
      { type: 'toggle', label: '원근 카메라로 (끄면 정사영)', value: false, on: (v) => (usePersp = v) },
      { type: 'toggle', label: '강조색 (이번 단계만 주황)', value: true, on: (v) => ((accentOn = v), drawMini()) },
      { type: 'toggle', label: '모서리 선', value: true, on: (v) => (linesOn = v) },
      { type: 'toggle', label: '평소 그림 (색 · 질감)', value: false, on: (v) => (colorful = v) },
    ];

    return {
      controls,
      update(t: number, dt: number): void {
        w = Math.max(1, box.clientWidth);
        h = Math.max(1, box.clientHeight);
        const sc = Math.max(0.45, Math.min(1.25, Math.min(w / 820, h / 640)));
        root.style.setProperty('--s', String(sc));
        const small = w < 520;
        root.classList.toggle('small', small);
        ph = Math.round((small ? 64 : 150) * sc);
        root.style.setProperty('--ph', `${ph}px`);
        const gh = h - ph;

        // 저절로 넘기기 · i71 은 평소 그림 ↔ 설명서 그림을 번갈아
        stepT += dt;
        if (auto && stepT > (step === 0 || step === STEPS.length - 1 ? 3.2 : 2.8)) setStep(mode === 'devices' && step === STEPS.length - 1 ? 3 : step + 1);
        let showColor = colorful;
        if (mode === 'accent') {
          flipT += dt;
          showColor = colorful || Math.floor(flipT / 2.6) % 2 === 1;
          tag.textContent = showColor ? '평소 그림' : '설명서 그림 — 단색 + 강조색';
          tag.style.display = '';
        } else tag.style.display = 'none';
        root.classList.toggle('colorful', showColor);

        // 부품 — 떨어져 끼워짐 · 색
        const s = STEPS[step]!;
        let order = 0;
        parts.forEach((p, i) => {
          const a = arrows[i]!;
          if (p.step > step || (step === 0 && false)) {
            p.mesh.visible = step === 0;
            a.g.visible = false;
            p.mesh.position.copy(p.home);
          } else {
            p.mesh.visible = true;
            if (p.step === step) {
              const k = Math.min(1, Math.max(0, (stepT - 0.25 - order * 0.22) / 0.7));
              order++;
              const drop = (1 - easeBounce(k)) * 2.6;
              p.mesh.position.set(p.home.x, p.home.y + drop, p.home.z);
              a.g.visible = k < 1 && accentOn && !showColor;
              a.g.position.set(p.home.x, p.home.y + drop + 0.55, p.home.z);
              a.am.opacity = 1 - k * 0.6;
            } else {
              p.mesh.position.copy(p.home);
              a.g.visible = false;
            }
          }
          const cur = p.step === step || step === 0;
          const mat = showColor ? colorMat(p.color) : cur && accentOn && step !== 0 ? accent : white;
          p.mesh.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) m.material = mat;
          });
        });
        // 처음 화면: 모든 부품을 주황으로 「무엇을 만드나」
        if (step === 0)
          parts.forEach((p) =>
            p.mesh.traverse((o) => {
              const m = o as THREE.Mesh;
              if (m.isMesh) m.material = showColor ? colorMat(p.color) : accentOn ? accent : white;
            }),
          );
        for (const gh2 of ghosts) gh2.m.material = showColor ? colorMat(gh2.color) : ghost;
        groundM.color.setHex(showColor ? 0x8fcf6a : 0xffffff);
        grid.visible = !showColor;
        renderer.setClearColor(showColor ? 0xcfe9ff : 0xfafaf8);
        for (const l of lines) l.visible = linesOn && !showColor;

        // 카메라 — 단계마다 부드럽게
        const kk = 1 - Math.exp(-dt * 3);
        cam.target.lerp(cam.toTarget, kk);
        cam.size += (cam.toSize - cam.size) * kk;
        const aspect = w / gh;
        const sway = Math.sin(t * 0.25) * 0.08;
        const dir = DIR.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sway);
        ortho.left = (-cam.size / 2) * aspect;
        ortho.right = (cam.size / 2) * aspect;
        ortho.top = cam.size / 2;
        ortho.bottom = -cam.size / 2;
        ortho.position.copy(cam.target).addScaledVector(dir, 30);
        ortho.lookAt(cam.target);
        ortho.updateProjectionMatrix();
        persp.aspect = aspect;
        const dist = cam.size / 2 / Math.tan(THREE.MathUtils.degToRad(persp.fov / 2));
        persp.position.copy(cam.target).addScaledVector(dir, dist * 0.62);
        persp.lookAt(cam.target);
        persp.fov = 52;
        persp.updateProjectionMatrix();
        const camera = usePersp ? persp : ortho;
        camera.updateMatrixWorld();

        // 그리기
        const dpr = renderer.getPixelRatio();
        const size = renderer.getSize(new THREE.Vector2());
        if (size.x !== w || size.y !== gh) renderer.setSize(w, gh, false);
        renderer.setViewport(0, 0, w, gh);
        renderer.setScissorTest(false);
        renderer.clear();
        renderer.render(scene, camera);

        // 화면 위 장치 — 지시점 · 확대 원 · 축척
        let svgHtml = '';
        const R = 8 * sc;
        if (!showColor && step > 0 && step < STEPS.length - 1) {
          for (const p of parts) {
            if (p.step !== step || (s.zoom && p.mesh === flag)) continue;
            const top = p.home.clone().add(new THREE.Vector3(0, p.mesh === board ? 0.1 : 0.5, 0));
            const [x, y] = proj(top, camera);
            const ox = x - 26 * sc;
            const oy = y - 30 * sc;
            svgHtml += `<line x1="${x}" y1="${y}" x2="${ox}" y2="${oy}" stroke="#151515" stroke-width="1"/><circle cx="${x}" cy="${y}" r="${2 * sc}" fill="#151515"/><circle cx="${ox}" cy="${oy}" r="${R}" fill="#fff" stroke="#151515" stroke-width="1.2"/><text x="${ox}" y="${oy + 3.5 * sc}" text-anchor="middle" font-size="${10 * sc}" font-weight="700" fill="#151515">${p.no}</text>`;
          }
        }
        // 확대 원 (깃발)
        const showZoom = !showColor && s.zoom && !small;
        zoomEl.style.display = showZoom ? '' : 'none';
        if (showZoom) {
          const zr = Math.round(Math.min(w, gh) * 0.2);
          const zx = Math.round(w - zr - 22 * sc);
          const zy = Math.round(gh * 0.62 - zr);
          zoomEl.style.left = `${zx}px`;
          zoomEl.style.top = `${zy}px`;
          zoomEl.style.width = zoomEl.style.height = `${zr * 2}px`;
          const fp = flag.position.clone().add(new THREE.Vector3(0.1, 0.55, 0));
          zoomCam.left = -0.75;
          zoomCam.right = 0.75;
          zoomCam.top = 0.75;
          zoomCam.bottom = -0.75;
          zoomCam.position.copy(fp).addScaledVector(dir, 30);
          zoomCam.lookAt(fp);
          zoomCam.updateProjectionMatrix();
          // 아래에서 위로 재는 WebGL 좌표
          renderer.setScissorTest(true);
          const vy = gh - (zy + zr * 2);
          renderer.setViewport(zx, vy, zr * 2, zr * 2);
          renderer.setScissor(zx, vy, zr * 2, zr * 2);
          renderer.setClearColor(0xfafaf8);
          renderer.clear();
          renderer.render(scene, zoomCam);
          renderer.setScissorTest(false);
          renderer.setViewport(0, 0, w, gh);
          const [fx, fy] = proj(fp, camera);
          const cx = zx + zr;
          const cy = zy + zr;
          const ang = Math.atan2(fy - cy, fx - cx);
          svgHtml += `<line x1="${fx}" y1="${fy}" x2="${cx + Math.cos(ang) * zr}" y2="${cy + Math.sin(ang) * zr}" stroke="#151515" stroke-width="1"/><circle cx="${fx}" cy="${fy}" r="${5 * sc}" fill="none" stroke="#151515" stroke-width="1"/>`;
          svgHtml += `<circle cx="${cx - zr * 0.62}" cy="${cy - zr * 0.62}" r="${R}" fill="#fff" stroke="#151515" stroke-width="1.2"/><text x="${cx - zr * 0.62}" y="${cy - zr * 0.62 + 3.5 * sc}" text-anchor="middle" font-size="${10 * sc}" font-weight="700" fill="#151515">2</text>`;
        }
        svg.setAttribute('viewBox', `0 0 ${w} ${gh}`);
        svg.innerHTML = svgHtml;
        void dpr;
        // 축척 막대 — 1칸(= 1) 의 화면 길이
        const a = proj(cam.target, camera);
        const b = proj(cam.target.clone().add(new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), sway - Math.PI / 4 + Math.atan2(dir.x, dir.z))), camera);
        const len = Math.max(8, Math.hypot(b[0] - a[0], b[1] - a[1]));
        const u = root.querySelector<HTMLElement>('.mn-scale u')!;
        u.style.width = `${len}px`;
        root.querySelector<HTMLElement>('.mn-scale span')!.textContent = usePersp ? `${UNIT} (원근: 가까울수록 커져요)` : UNIT;
        // 장치 보이기
        const devOn = !showColor;
        root.querySelector<HTMLElement>('.mn-scale')!.style.display = devOn ? '' : 'none';
        root.querySelector<HTMLElement>('.mn-mini')!.style.display = devOn && !small ? '' : 'none';
        root.querySelector<HTMLElement>('.mn-tray')!.style.display = devOn && s.parts.length && !(small && mode !== 'full') ? '' : 'none';
        if (devOn && !small) drawMini();
      },
      dispose(): void {
        for (const g of geos) g.dispose();
        for (const m of [white, accent, ghost, groundM, lineM, ghostLineM, ...colorMats.values()]) m.dispose();
        for (const a of arrows) a.am.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        root.remove();
      },
    };
  };
}

export const DEMOS: DemoMap = {
  i70: { kind: 'dom', caption: '쌓기나무 탑 조립 설명서 — 정사영 · 흰 단색 · 이번 부품만 주황 · 모서리 선 · 단계마다 카메라 이동 · 지시점 · 확대 원 · 평면도', make: make('full') },
  i71: { kind: 'dom', caption: '평소 그림(색 · 질감)과 설명서 그림(흰 단색 + 이번 단계만 주황)을 번갈아 — 무엇을 봐야 할지 바로 보여요', make: make('accent') },
  i72: { kind: 'dom', caption: '번호 지시점 ①② · 확대 원 · 축척 막대 「1칸」 · 평면도 미니맵(위에서 본 모양 + 높이 숫자)', make: make('devices') },
};

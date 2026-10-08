import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { makeToonKit } from '@/game/core/toon';
import '@/game/games/numbaseball/ballfx.css';

/**
 * 실전 무대 — 실제 게임 무대(또는 같은 도구)를 띄워 기술을 손으로 시험하는 칸들 (스튜디오 「실전 무대」).
 * 칸 하나 = { id, title, sub, techs(관련 기술), games, files, notes, mount(box) → 정리 함수 }.
 */

export interface Section {
  /** 관련 기술 id (catalog) */
  techs?: string[];
  id: string;
  group: string;
  title: string;
  sub: string;
  games: string[];
  files: string[];
  notes: string[];
  /** 데모 — 정리 함수를 돌려준다 */
  mount?: (box: HTMLElement) => (() => void) | void;
}

/* ───────────── 작은 도구 ───────────── */

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, on: (v: number) => void): void {
  const row = h('label', 'st-row');
  const top = h('span', '', `${label} <b>${value}</b>`);
  const inp = h('input');
  Object.assign(inp, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  inp.addEventListener('input', () => {
    top.querySelector('b')!.textContent = inp.value;
    on(Number(inp.value));
  });
  row.append(top, inp);
  parent.appendChild(row);
}
function button(parent: HTMLElement, label: string, on: (b: HTMLButtonElement) => void, cls = ''): HTMLButtonElement {
  const b = h('button', `st-btn ${cls}`, label);
  b.addEventListener('click', () => on(b));
  parent.appendChild(b);
  return b;
}
function toggle(parent: HTMLElement, label: string, value: boolean, on: (v: boolean) => void): void {
  const l = h('label', 'st-toggle');
  const c = h('input');
  c.type = 'checkbox';
  c.checked = value;
  c.addEventListener('change', () => on(c.checked));
  l.append(c, document.createTextNode(label));
  parent.appendChild(l);
}
function panel(ctrl: HTMLElement, title: string): HTMLElement {
  const p = h('div', 'st-ctrl');
  p.appendChild(h('h3', '', title));
  ctrl.appendChild(p);
  return p;
}
/** 크기 따라가는 renderer + 그리기 고리 */
function viewport(view: HTMLElement, opts: { tone?: THREE.ToneMapping; draw: (dt: number, t: number) => void }): { renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; stop: () => void; size: () => [number, number] } {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = opts.tone ?? THREE.NoToneMapping;
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  view.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const size = (): [number, number] => [view.clientWidth, view.clientHeight];
  const ro = new ResizeObserver(() => {
    const [w, hh] = size();
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  });
  ro.observe(view);
  let raf = 0;
  let last = performance.now();
  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    opts.draw(dt, now / 1000);
  };
  raf = requestAnimationFrame(loop);
  return {
    renderer,
    camera,
    size,
    stop: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** 견본 물체 다섯 — 야구공 · 장난감 차 · 버섯 집 · 공주 인형 · 매듭 (일반 재질) */
function samples(): THREE.Group {
  const g = new THREE.Group();
  const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
  // 야구공
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fbf8f0';
  x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#d8403a';
  x.lineWidth = 4;
  for (const off of [0, 128])
    for (const s of [-1, 1]) {
      x.beginPath();
      for (let u = 0; u <= 128; u += 4) {
        const y = 64 + s * (34 + Math.cos((u / 128) * Math.PI * 2) * 18);
        if (u) x.lineTo(off + u, y);
        else x.moveTo(off + u, y);
      }
      x.stroke();
    }
  const bt = new THREE.CanvasTexture(c);
  bt.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 40, 24), std(0xffffff, { map: bt }));
  ball.position.set(-1.7, 0.75, -1.3);
  g.add(ball);
  // 장난감 차
  const car = new THREE.Group();
  car.add(new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.55, 0.95, 3, 0.16), std(0xe8453c)));
  const cab = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.45, 0.8, 3, 0.14), std(0xa8e0ff));
  cab.position.set(-0.15, 0.45, 0);
  car.add(cab);
  for (const [wx, wz] of [
    [-0.55, 0.48],
    [0.55, 0.48],
    [-0.55, -0.48],
    [0.55, -0.48],
  ] as const) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 20), std(0x2a2a3a));
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, -0.25, wz);
    car.add(w);
  }
  for (const ez of [-0.2, 0.2]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), std(0xffffff));
    e.position.set(0.86, 0.08, ez);
    car.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), std(0x1c1a2e));
    p.position.set(0.97, 0.08, ez);
    car.add(p);
  }
  car.position.set(1.6, 0.5, -1.4);
  car.rotation.y = -0.5;
  g.add(car);
  // 버섯 집
  const mush = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 24), std(0xfff0d8));
  stem.position.y = 0.45;
  mush.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe8453c));
  cap.position.y = 0.85;
  cap.scale.y = 0.75;
  mush.add(cap);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), std(0xffffff));
    d.position.set(Math.cos(a) * 0.55, 1.25, Math.sin(a) * 0.55);
    mush.add(d);
  }
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.4, 0.1, 2, 0.05), std(0x8a5a36));
  door.position.set(0, 0.3, 0.46);
  mush.add(door);
  mush.position.set(-2.7, 0, 1.2);
  g.add(mush);
  // 공주 인형
  const pr = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 32), std(0xf08ab8));
  dress.position.y = 0.55;
  pr.add(dress);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), std(0xffdcc0));
  head.position.y = 1.35;
  pr.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a5a2a));
  hair.position.y = 1.4;
  pr.add(hair);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.14, 8, 1, true), std(0xffd23a, { metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }));
  crown.position.y = 1.72;
  pr.add(crown);
  pr.position.set(0, 0, 1.4);
  g.add(pr);
  // 매듭
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.16, 120, 16), std(0x2ac0c8));
  knot.position.set(2.7, 0.85, 1.2);
  g.add(knot);
  // 바닥
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.2, 64), std(0x6ab858));
  floor.position.y = -0.1;
  floor.scale.z = 0.72;
  floor.userData['noInk'] = true;
  g.add(floor);
  return g;
}

/* ───────────── 칸들 ───────────── */

export const LABS: Section[] = [
  {
    id: 'toon',
    techs: ['u01', 'u02'],
    group: '그림체',
    title: '툰 셰이딩 · 외곽선',
    sub: '3단 명암 + 검은 선 — 만화 그림체',
    games: ['숫자 야구', '빵빵 주차장 탈출'],
    files: ['src/game/core/toon.ts', 'numbaseball/stage.ts (toon · ink)'],
    notes: [
      '<b>툰 셰이딩</b> — 빛을 받는 정도를 매끄러운 그러데이션 대신 <b>몇 단계 계단</b>으로 끊어(gradientMap) 셀 애니메이션처럼 보이게 합니다. 톤 매핑은 끄고(NoToneMapping) 빛 세기를 낮춰 맞춥니다.',
      '<b>외곽선</b> — 같은 모양을 조금 크게 만들어 <b>뒷면만 검게</b> 그립니다(뒤집은 껍데기). 얇은 판 · 아주 작은 조각 · 투명한 것은 건너뜁니다.',
      '공통 도구 <b>makeToonKit().toonify(무대)</b> 한 줄이면 이미 만든 무대도 툰으로 바뀝니다. <b>setEnabled</b> 로 켜고 끌 수 있어요.',
    ],
    mount(box) {
      const split = h('div', 'st-split');
      const a = h('div', 'st-view', '<span class="st-label">일반 재질 (ACES 톤 매핑)</span>');
      const b = h('div', 'st-view', '<span class="st-label">툰 셰이딩 + 외곽선</span>');
      split.append(a, b);
      const ctrl = h('div', 'st-demo');
      const left = h('div');
      left.appendChild(split);
      const side = h('div');
      ctrl.append(left, side);
      box.appendChild(ctrl);
      const kit = makeToonKit([75, 168, 255]);
      const mk = (toon: boolean): { scene: THREE.Scene; root: THREE.Group; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x9ad0f0);
        const hemi = new THREE.HemisphereLight(0xfff8e6, 0x8aa86a, toon ? 0.95 : 1.0);
        const sun = new THREE.DirectionalLight(0xfff0d6, toon ? 1.35 : 2.5);
        sun.position.set(-4, 8, 6);
        scene.add(hemi, sun);
        const root = samples();
        scene.add(root);
        if (toon) kit.toonify(root, { outline: 0.03, minSize: 0.1 });
        return { scene, root, sun, hemi };
      };
      const A = mk(false);
      const B = mk(true);
      let spin = true;
      let ang = 0;
      const cam = (c: THREE.PerspectiveCamera): void => {
        c.position.set(0, 5.2, 10.5);
        c.lookAt(0, 0.6, 0);
      };
      const va = viewport(a, { tone: THREE.ACESFilmicToneMapping, draw: (dt) => {
        if (spin) ang += dt * 0.4;
        for (const S of [A, B]) S.root.children.forEach((o, i) => i < 5 && (o.rotation.y = ang + i));
        va.renderer.render(A.scene, va.camera);
      } });
      const vb = viewport(b, { draw: () => vb.renderer.render(B.scene, vb.camera) });
      cam(va.camera);
      cam(vb.camera);
      const p1 = panel(side, '명암 단계');
      const steps = [75, 168, 255];
      slider(p1, '그늘 밝기', 0, 255, 1, steps[0]!, (v) => {
        steps[0] = v;
        kit.setSteps(steps);
      });
      slider(p1, '중간 밝기', 0, 255, 1, steps[1]!, (v) => {
        steps[1] = v;
        kit.setSteps(steps);
      });
      const p2 = panel(side, '외곽선');
      slider(p2, '굵기', 0, 0.1, 0.005, 0.03, (v) => kit.setOutline(B.root, v));
      toggle(p2, '툰 켜기 (끄면 일반 재질)', true, (v) => kit.setEnabled(B.root, v));
      const p3 = panel(side, '빛');
      slider(p3, '해 방향', -180, 180, 1, -34, (v) => {
        const r = THREE.MathUtils.degToRad(v);
        for (const S of [A, B]) S.sun.position.set(Math.sin(r) * 7, 8, Math.cos(r) * 7);
      });
      slider(p3, '툰 쪽 해 세기', 0, 3, 0.05, 1.35, (v) => (B.sun.intensity = v));
      toggle(p3, '돌리기', true, (v) => (spin = v));
      return () => {
        va.stop();
        vb.stop();
        kit.dispose();
      };
    },
  },
  {
    id: 'bloom',
    techs: ['u20', 'u21'],
    group: '그림체',
    title: '빛 번짐 (Bloom)',
    sub: '밝은 곳이 번져 빛나 보이게',
    games: ['숫자 야구 (전광판 · 전구)', '주차장 · 천문대 · 버섯 마을 등'],
    files: ['UnrealBloomPass (three/examples)'],
    notes: [
      '화면을 한 번 그린 뒤 <b>문턱보다 밝은 곳</b>만 뽑아 흐리게 번지게 겹칩니다. 전광판 · 전구 · 별처럼 스스로 빛나는 것을 살립니다.',
      '<b>주의</b> — 글씨가 문턱을 넘으면 번져서 읽기 어렵습니다(숫자 야구 전광판에서 겪음). 글씨 색을 문턱 아래로 두거나 문턱을 올리세요.',
    ],
    mount(box) {
      const wrap = h('div', 'st-demo');
      const view = h('div', 'st-view');
      const side = h('div');
      wrap.append(view, side);
      box.appendChild(wrap);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x070b20);
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      // LED 판 · 전구 고리 · 빛 구슬
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d')!;
      const drawLed = (white: number): void => {
        g.fillStyle = '#04060d';
        g.fillRect(0, 0, 512, 256);
        g.font = '400 110px "Black Han Sans", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = `rgb(${white},${white},${white})`;
        g.fillText('7 4 1', 256, 110);
        g.fillStyle = '#4aff7a';
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.arc(200 + k * 56, 210, 18, 0, Math.PI * 2);
          g.fill();
        }
      };
      drawLed(255);
      const lt = new THREE.CanvasTexture(c);
      lt.colorSpace = THREE.SRGBColorSpace;
      const led = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: lt, toneMapped: false }));
      scene.add(led);
      const bulbs: THREE.Mesh[] = [];
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
        b.position.set(Math.cos(a) * 2.6, Math.sin(a) * 1.6, 0.1);
        scene.add(b);
        bulbs.push(b);
      }
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshStandardMaterial({ color: 0x5fd0ff, emissive: 0x5fd0ff, emissiveIntensity: 2 }));
      orb.position.set(2.6, -1.4, 0.4);
      scene.add(orb);
      let composer: EffectComposer | null = null;
      const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.45, 0.85);
      let on = true;
      const v = viewport(view, { draw: (_dt, t) => {
        bulbs.forEach((b, k) => ((b.material as THREE.MeshBasicMaterial).color.setHex((Math.floor(t * 6) + k) % 3 === 0 ? 0xfff4c0 : 0x8a5a20)));
        if (!composer) {
          composer = new EffectComposer(v.renderer);
          composer.addPass(new RenderPass(scene, v.camera));
          composer.addPass(bloom);
          composer.addPass(new OutputPass());
        }
        const [w, hh] = v.size();
        composer.setSize(w, hh);
        bloom.enabled = on;
        composer.render();
      } });
      v.camera.position.set(0, 0, 7);
      const p = panel(side, '빛 번짐');
      toggle(p, '켜기', true, (x) => (on = x));
      slider(p, '세기', 0, 2, 0.05, 0.6, (x) => (bloom.strength = x));
      slider(p, '퍼짐', 0, 1, 0.05, 0.45, (x) => (bloom.radius = x));
      slider(p, '문턱', 0, 1, 0.01, 0.85, (x) => (bloom.threshold = x));
      const p2 = panel(side, '전광판 글씨 밝기');
      slider(p2, '흰 글씨 (0~255)', 120, 255, 1, 255, (x) => {
        drawLed(x);
        lt.needsUpdate = true;
      });
      return () => {
        v.stop();
        composer?.dispose();
      };
    },
  },
  {
    id: 'comic',
    techs: ['u38'],
    group: '연출',
    title: '만화 연출 (화면 위 층)',
    sub: '집중선 · 컷인 띠 · 별 터짐 글자 · 딱지 · 꽃가루',
    games: ['숫자 야구'],
    files: ['numbaseball/ballfx.css', 'numbaseball/stage.ts (showComic · cutin · tag · confetti)'],
    notes: [
      '3D 화면 위에 <b>HTML 층</b>을 겹쳐 그립니다 — 글자가 또렷하고, 애니메이션은 CSS 로 가볍습니다. 판이 보이는 자리 가운데(--cx · --cy)에 맞춥니다.',
      '<b>집중선</b>은 repeating-conic-gradient + 가운데를 비운 mask, <b>컷인 띠</b>는 기울인 띠가 미끄러져 들어왔다 나가고, <b>별 터짐</b>은 SVG 다각형.',
    ],
    mount(box) {
      const wrap = h('div', 'st-demo');
      const view = h('div', 'st-view st-fxstage', '<div class="st-fxball"></div>');
      const side = h('div');
      wrap.append(view, side);
      box.appendChild(wrap);
      const fx = h('div', 'nb-fx', '<div class="nb-speed"></div><div class="nb-flash"></div><div class="nb-comic"></div>');
      view.appendChild(fx);
      const setVars = (): void => {
        fx.style.setProperty('--cx', `${view.clientWidth / 2}px`);
        fx.style.setProperty('--cy', `${view.clientHeight / 2}px`);
        fx.style.setProperty('--fw', `${view.clientWidth}px`);
        fx.style.setProperty('--fh', `${view.clientHeight}px`);
      };
      setVars();
      const ro = new ResizeObserver(setVars);
      ro.observe(view);
      const speed = fx.querySelector<HTMLElement>('.nb-speed')!;
      const flash = fx.querySelector<HTMLElement>('.nb-flash')!;
      const comic = fx.querySelector<HTMLElement>('.nb-comic')!;
      const burst = (spikes: number, outer: number, inner: number): string =>
        Array.from({ length: spikes * 2 }, (_, k) => {
          const a = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
          const r = k % 2 ? inner : outer * (0.9 + ((k * 37) % 10) / 100);
          return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
        }).join(' ');
      const showComic = (kind: 'hit' | 'out' | 'hr', text: string): void => {
        comic.className = `nb-comic ${kind}`;
        comic.innerHTML = `<svg viewBox="-100 -100 200 200"><polygon points="${burst(kind === 'hr' ? 24 : 18, 98, kind === 'hr' ? 62 : 70)}"/><polygon class="in" points="${burst(kind === 'hr' ? 24 : 18, 80, kind === 'hr' ? 52 : 58)}"/></svg><b></b>`;
        const b = comic.querySelector('b')!;
        text.split('\n').forEach((ln, i) => {
          if (i) b.appendChild(h('br'));
          b.appendChild(document.createTextNode(ln));
        });
        void comic.offsetWidth;
        comic.classList.add('on');
      };
      const p1 = panel(side, '집중선');
      for (const [k, l] of [
        ['', '기본'],
        ['burst', '세게'],
        ['burst fire', '불꽃'],
        ['burst bolt', '번개'],
        ['burst ghost', '도깨비'],
        ['burst twist', '회오리'],
        ['burst gold rainbow', '무지개'],
      ] as const)
        button(p1, l, () => (speed.className = `nb-speed on ${k}`));
      button(p1, '끄기', () => (speed.className = 'nb-speed'));
      const p2 = panel(side, '컷인 띠 (필살 기술 이름)');
      for (const [k, l] of [
        ['fire', '불꽃 강속구!'],
        ['bolt', '번개 직구!'],
        ['ghost', '도깨비 공!'],
        ['twist', '회오리 볼!'],
        ['ult', '필살! 무지개 유성구!'],
      ] as const)
        button(p2, l, () => {
          const el = h('div', `nb-cutin ${k}`);
          el.appendChild(h('b', '', l));
          fx.appendChild(el);
          setTimeout(() => el.remove(), k === 'ult' ? 1300 : 900);
        });
      const p3 = panel(side, '결과 글자 · 딱지 · 꽃가루');
      button(p3, '1 스트라이크 / 0 볼', () => showComic('hit', '1 스트라이크\n0 볼'));
      button(p3, '아웃!', () => showComic('out', '아웃!'));
      button(p3, '홈런!', () => {
        showComic('hr', '홈런!');
        flash.className = 'nb-flash';
        void flash.offsetWidth;
        flash.className = 'nb-flash on strong';
      }, 'gold');
      for (const [k, l] of [
        ['S', '스트라이크!'],
        ['B', '볼!'],
      ] as const)
        button(p3, `딱지 ${l}`, () => {
          const el = h('div', `nb-tag ${k}`, l);
          el.style.left = `${30 + Math.random() * 40}%`;
          el.style.top = `${30 + Math.random() * 30}%`;
          fx.appendChild(el);
          setTimeout(() => el.remove(), 1400);
        });
      button(p3, '꽃가루', () => {
        const c = h('div', 'nb-confetti');
        const cols = ['#ff5a7a', '#ffd23a', '#5ab8ff', '#7ae08a', '#ff9a3a', '#c08aff', '#ffffff'];
        for (let k = 0; k < 90; k++) {
          const i = h('i');
          i.style.left = `${Math.random() * 100}%`;
          i.style.background = cols[k % cols.length]!;
          i.style.animationDelay = `${Math.random() * 0.9}s`;
          i.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
          i.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
          i.style.setProperty('--r', `${Math.random() * 1080 - 540}deg`);
          c.appendChild(i);
        }
        fx.appendChild(c);
        setTimeout(() => c.remove(), 4200);
      });
      button(p3, '지우기', () => {
        comic.className = 'nb-comic';
        speed.className = 'nb-speed';
      });
      return () => ro.disconnect();
    },
  },
  {
    id: 'baseball',
    techs: ['u37', 'i426', 'u36', 'u01'],
    group: '실전 무대',
    title: '숫자 야구 무대',
    sub: '필살 투구 · 연출 카메라 · 툰 관중',
    games: ['숫자 야구'],
    files: ['numbaseball/stage.ts', 'numbaseball/ballfx.css'],
    notes: [
      '실제 게임 무대를 그대로 띄웠습니다. 단추로 결과를 정해 던져 보세요.',
      '숫자 공이 전광판 줄에 꽂힌 뒤 <b>숫자 없는 투구</b>가 결과 수만큼 — 스트라이크는 필살 투구(불꽃 · 번개 · 도깨비 · 회오리, 3스트라이크 마지막은 무지개 유성구), 볼은 휘는 변화구, 헛공은 툭. 어느 숫자가 스트라이크인지는 드러내지 않습니다.',
      '<b>연출 카메라</b> — 공 바로 뒤 같은 축에서 전광판을 정면으로 따라가 꽂히는 순간 확대 → 원래 구도로.',
    ],
    mount(box) {
      const view = h('div', 'st-view');
      view.style.height = 'min(66vh, 680px)';
      const wrap = h('div', 'st-demo');
      const side = h('div');
      wrap.append(view, side);
      box.appendChild(wrap);
      let stage: import('@/game/games/numbaseball/stage').BallStage | null = null;
      let dead = false;
      const clues: { g: string; s: number; b: number }[] = [];
      let busy = false;
      const info = (): string => `스튜디오 · ${clues.length}번 던짐`;
      void import('@/game/games/numbaseball/stage').then(({ BallStage }) => {
        if (dead) return;
        stage = new BallStage(view);
        stage.setGame(3, 1, 9);
        const fit = (): void => stage?.setFree({ x: 0, y: 0, w: view.clientWidth, h: view.clientHeight });
        fit();
        new ResizeObserver(fit).observe(view);
      });
      const pick = (): string => {
        const ds = '123456789'.split('').sort(() => Math.random() - 0.5);
        return ds.slice(0, 3).join('');
      };
      const throwIt = (s: number, b: number): void => {
        if (!stage || busy) return;
        busy = true;
        const g = pick();
        stage.setPicked(g.split(''));
        setTimeout(() => {
          if (!stage) return;
          const ms = stage.pitch(s, b, 3, g);
          setTimeout(() => {
            if (!stage) return;
            clues.push({ g, s, b });
            stage.setPicked([]);
            stage.drawBoard(clues, 3, s === 3 ? g : '', 8, info());
            if (s === 3) stage.celebrate();
            busy = false;
          }, ms);
        }, 650);
      };
      const p = panel(side, '결과를 정해 던지기');
      for (const [s, b, l] of [
        [1, 0, '1 스트라이크'],
        [0, 1, '1 볼'],
        [1, 1, '1S 1B'],
        [2, 1, '2S 1B'],
        [0, 3, '0S 3B'],
        [0, 0, '아웃'],
      ] as const)
        button(p, l, () => throwIt(s, b));
      button(p, '3 스트라이크 — 홈런', () => throwIt(3, 0), 'gold');
      const p2 = panel(side, '판');
      button(p2, '새로 (전광판 지우기)', () => {
        if (!stage || busy) return;
        clues.length = 0;
        stage.setGame(3, 1, 9);
        stage.setFree({ x: 0, y: 0, w: view.clientWidth, h: view.clientHeight });
      });
      button(p2, '숫자 공 셋 고르기만', () => stage?.setPicked(pick().split('')));
      return () => {
        dead = true;
        stage?.dispose();
      };
    },
  },
  {
    id: 'parking',
    techs: ['u01', 'u02', 'u17'],
    group: '실전 무대',
    title: '빵빵 주차장 — 툰 비교',
    sub: '같은 무대를 툰 켜고 / 끄고',
    games: ['빵빵 주차장 탈출'],
    files: ['parking/stage.ts (setToon)', 'src/game/core/toon.ts'],
    notes: [
      '실제 주차장 무대입니다. <b>툰 켜기</b>를 끄면 예전 그림체(일반 재질 · ACES 톤 매핑 · 센 빛)로 돌아가 바로 비교됩니다.',
      '위에서 내려다보는 구도라 명암 계단보다 <b>또렷한 평면 색 · 둥근 부품 외곽선</b>이 더 눈에 띕니다.',
    ],
    mount(box) {
      const view = h('div', 'st-view');
      view.style.height = 'min(66vh, 680px)';
      const wrap = h('div', 'st-demo');
      const side = h('div');
      wrap.append(view, side);
      box.appendChild(wrap);
      // 주차장 게임은 아직 저장소에 없을 수도 있다 — glob 으로 「있으면」 불러와 타입 검사(tsc)가 깨지지 않게
      type PStage = { setBoard(b: unknown, pos: number[]): void; setFree(r: { x: number; y: number; w: number; h: number }): void; setToon(on: boolean): void; driveOut(done: () => void): void; dispose(): void; scene: unknown; toon: { setSteps(s: number[]): void; setOutline(root: unknown, t: number): void } };
      const PG = import.meta.glob(['./game/games/parking/stage.ts', './game/games/parking/logic.ts', './game/games/parking/levels.ts']) as Record<string, () => Promise<Record<string, unknown>>>;
      let stage: PStage | null = null;
      let dead = false;
      let lv = 12;
      let mods: { parse: (rows: string[]) => { b: unknown; pos: number[] }; LEVELS: { rows: string[] }[] } | null = null;
      const load = (): void => {
        if (!stage || !mods) return;
        const p = mods.parse(mods.LEVELS[lv]!.rows);
        stage.setBoard(p.b, p.pos);
        stage.setFree({ x: 0, y: 0, w: view.clientWidth, h: view.clientHeight });
      };
      const load3 = PG['./game/games/parking/stage.ts'] && PG['./game/games/parking/logic.ts'] && PG['./game/games/parking/levels.ts'];
      if (!load3) view.innerHTML = '<div class="hub-wait">주차장 게임 파일이 없어요</div>';
      else void Promise.all([PG['./game/games/parking/stage.ts']!(), PG['./game/games/parking/logic.ts']!(), PG['./game/games/parking/levels.ts']!()]).then(([S0, L0, V0]) => {
        const S = S0 as { ParkStage: new (el: HTMLElement) => PStage };
        const L = L0 as { parse: (rows: string[]) => { b: unknown; pos: number[] } };
        const V = V0 as { LEVELS: { rows: string[] }[] };
        if (dead) return;
        stage = new S.ParkStage(view);
        mods = { parse: L.parse, LEVELS: V.LEVELS };
        load();
        new ResizeObserver(() => stage?.setFree({ x: 0, y: 0, w: view.clientWidth, h: view.clientHeight })).observe(view);
      });
      const p = panel(side, '툰');
      toggle(p, '툰 켜기', true, (v) => stage?.setToon(v));
      const steps = [75, 168, 255];
      slider(p, '그늘 밝기', 0, 255, 1, 75, (v) => {
        steps[0] = v;
        stage?.toon.setSteps(steps);
      });
      slider(p, '중간 밝기', 0, 255, 1, 168, (v) => {
        steps[1] = v;
        stage?.toon.setSteps(steps);
      });
      slider(p, '덧붙인 외곽선 굵기', 0, 0.08, 0.005, 0.03, (v) => stage && stage.toon.setOutline(stage.scene, v));
      const p2 = panel(side, '판');
      button(p2, '◀ 앞 판', () => {
        lv = Math.max(0, lv - 1);
        load();
      });
      button(p2, '다음 판 ▶', () => {
        lv = Math.min((mods?.LEVELS.length ?? 1) - 1, lv + 1);
        load();
      });
      button(p2, '탈출 연출', () => stage?.driveOut(() => setTimeout(load, 800)), 'gold');
      return () => {
        dead = true;
        stage?.dispose();
      };
    },
  },
];


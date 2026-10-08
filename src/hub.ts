import { GAME_TITLES } from './gameTitles';
import * as THREE from 'three';
import type { Control, Demo, DemoMap, Scene3D } from './demos/types';

/**
 * 견본 엔진 — 화면 안의 여러 견본 상자를 한 고리로 돌린다.
 *  - 작은 상자(카드): 보일 때만 살리고, 3D 는 renderer 하나를 돌려 쓰며 한 프레임에 몇 장씩.
 *  - 큰 상자(기술 페이지): 따로 renderer 로 매 프레임.
 * 견본은 demos/demos*.ts 의 DEMOS 를 모두 모은다 (파일이 없어도 멈추지 않음).
 */

const mods = import.meta.glob('./demos/demos*.ts', { eager: true }) as Record<string, { DEMOS?: DemoMap }>;
export const DEMOS: DemoMap = Object.assign({}, ...Object.values(mods).map((m) => m.DEMOS ?? {}));

const SHOTS = import.meta.glob('./shots/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const shotOf = (id: string): string | undefined => SHOTS[`./shots/${id}.jpg`];

export const GAME_TITLE: Record<string, string> = GAME_TITLES;
export const GAME_COUNT = Object.keys(GAME_TITLE).length;

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** 게임은 수학 놀이터 사이트에 있다 (스튜디오와 따로라 그 게임을 바로 띄우지는 못하고 사이트를 연다) */
export function openGame(_id: string): void {
  window.open('https://mathmiri.com/', '_blank', 'noopener');
}

interface Live {
  demo: Demo;
  box: HTMLElement;
  big: boolean;
  canvas?: HTMLCanvasElement;
  s3?: Scene3D;
  d2?: ReturnType<Extract<Demo, { kind: '2d' }>['make']>;
  dom?: ReturnType<Extract<Demo, { kind: 'dom' }>['make']>;
  controls: Control[];
  t0: number;
  dead?: boolean;
  /** 3D: 셰이더를 뒤에서 굽는 중이면 'busy' — 다 구울 때까지 그리지 않는다 (첫 컴파일로 페이지가 멈추지 않게) */
  warm?: 'busy' | 'done';
}

function start(demo: Demo, box: HTMLElement, big: boolean): Live {
  box.innerHTML = '';
  const live: Live = { demo, box, big, controls: [], t0: performance.now() };
  try {
    if (demo.kind === 'dom') {
      live.dom = demo.make(box);
      live.controls = live.dom.controls ?? [];
    } else {
      const c = h('canvas', 'hub-canvas');
      box.appendChild(c);
      live.canvas = c;
      if (demo.kind === '2d') {
        live.d2 = demo.make();
        live.controls = live.d2.controls ?? [];
      } else {
        live.s3 = demo.make(THREE);
        live.controls = live.s3.controls ?? [];
      }
    }
  } catch (e) {
    box.innerHTML = `<div class="hub-err">견본 오류<small>${String(e).slice(0, 120)}</small></div>`;
    console.error('[studio] 견본 오류', e);
    live.dead = true;
  }
  return live;
}
function stop(l: Live): void {
  try {
    l.s3?.dispose?.();
    l.d2?.dispose?.();
    l.dom?.dispose?.();
  } catch (e) {
    console.warn('[studio] 정리 오류', e);
  }
  l.box.innerHTML = '';
  l.dead = true;
}
function step(l: Live, renderer: THREE.WebGLRenderer | null, dt: number): void {
  if (l.dead) return;
  const t = (performance.now() - l.t0) / 1000;
  const w = Math.max(1, l.box.clientWidth);
  const hh = Math.max(1, l.box.clientHeight);
  try {
    if (l.dom) {
      l.dom.update?.(t, dt);
      return;
    }
    const c = l.canvas!;
    const dpr = Math.min(devicePixelRatio, l.big ? 2 : 1.5);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hh * dpr);
    }
    const g = c.getContext('2d')!;
    if (l.d2) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      l.d2.draw(g, w, hh, t, dt);
      return;
    }
    if (l.s3 && renderer) {
      const s = l.s3;
      // 셰이더를 뒤에서 굽는 동안은 그리지 않는다 (아래 「연습 한 번」)
      if (l.warm === 'busy') return;
      s.update?.(t, dt);
      const rw = c.width;
      const rh = c.height;
      const size = renderer.getSize(new THREE.Vector2());
      if (size.x !== rw || size.y !== rh) renderer.setSize(rw, rh, false);
      const cam = s.camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera && Math.abs(cam.aspect - rw / rh) > 1e-3) {
        cam.aspect = rw / rh;
        cam.updateProjectionMatrix();
      }
      s.resize?.(rw, rh);
      renderer.toneMapping = s.tone ?? THREE.NeutralToneMapping;
      if (!l.warm) {
        // 처음 한 번 = 연습: 그리기 함수를 그대로 돌리되 화면에 그리는 render 는 그 순간 상태(환경 반사 · 그림자 · 톤 매핑 · 후처리 판)로
        // 셰이더만 병렬로 굽고(compileAsync) 건너뛴다. 렌더 타깃에 그리는 것(반사 지도 굽기 · 후처리 중간 단계)은 실제로 그린다 — 미리 굽는 그림이 깨지지 않게.
        // 그냥 첫 장면을 그리면 재질마다 그 자리에서 컴파일해 0.5 ~ 2.5초 멈췄다
        l.warm = 'busy';
        let castShadow = false;
        s.scene.traverse((o) => {
          if ((o as THREE.Light).isLight && o.castShadow) castShadow = true;
        });
        if (castShadow) renderer.shadowMap.enabled = true;
        const jobs: Promise<unknown>[] = [];
        const real = renderer.render;
        if (s.render) {
          renderer.render = (scene: THREE.Object3D, camera: THREE.Camera): void => {
            if (renderer.getRenderTarget()) real.call(renderer, scene, camera);
            else jobs.push(renderer.compileAsync(scene, camera).catch(() => undefined));
          };
          try {
            s.render(renderer, rw, rh);
          } finally {
            renderer.render = real;
          }
        } else jobs.push(renderer.compileAsync(s.scene, s.camera).catch(() => undefined));
        void Promise.all(jobs).then(() => {
          l.warm = 'done';
        });
        return;
      }
      if (s.render) s.render(renderer, rw, rh);
      else renderer.render(s.scene, s.camera);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, rw, rh);
      g.drawImage(renderer.domElement, 0, 0);
    }
  } catch (e) {
    console.error('[studio] 그리기 오류', e);
    stop(l);
    l.box.innerHTML = `<div class="hub-err">그리기 오류<small>${String(e).slice(0, 120)}</small></div>`;
  }
}

export function controlsUI(list: Control[], into: HTMLElement): void {
  into.innerHTML = '';
  if (!list.length) {
    into.appendChild(h('p', 'muted', '조절할 값이 없는 견본이에요.'));
    return;
  }
  for (const c of list) {
    if (c.type === 'button') {
      const b = h('button', 'btn', c.label);
      b.onclick = () => c.on();
      into.appendChild(b);
    } else if (c.type === 'toggle') {
      const l = h('label', 'switch');
      const i = h('input');
      i.type = 'checkbox';
      i.checked = c.value;
      i.onchange = () => c.on(i.checked);
      l.append(i, h('i'), document.createTextNode(c.label));
      into.appendChild(l);
    } else {
      const row = h('label', 'range');
      const top = h('span', '', `${c.label}<b>${c.value}</b>`);
      const i = h('input');
      Object.assign(i, { type: 'range', min: String(c.min), max: String(c.max), step: String(c.step), value: String(c.value) });
      i.oninput = () => {
        top.querySelector('b')!.textContent = i.value;
        c.on(Number(i.value));
      };
      row.append(top, i);
      into.appendChild(row);
    }
  }
}

/** 한 화면의 견본들 — add 로 상자를 맡기면 고리가 돌린다. dispose 로 모두 정리 */
export class Hub {
  private small = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private bigR: THREE.WebGLRenderer | null = null;
  private slots: { box: HTMLElement; demo: Demo; big: boolean; live?: Live; onReady?: (l: Live) => void }[] = [];
  private visible = new Set<HTMLElement>();
  private io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (e.isIntersecting) this.visible.add(e.target as HTMLElement);
        else this.visible.delete(e.target as HTMLElement);
      }
    },
    { rootMargin: '160px' },
  );
  private raf = 0;
  private last = performance.now();
  private rr = 0;

  constructor() {
    this.small.setPixelRatio(1);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 견본이 있으면 true. big = 기술 페이지의 큰 화면 (늘 돌림) */
  add(box: HTMLElement, id: string, big = false, onReady?: (controls: Control[]) => void): boolean {
    const demo = DEMOS[id];
    if (!demo) {
      box.innerHTML = '<div class="hub-wait">견본 준비 중</div>';
      return false;
    }
    if (big && !this.bigR) {
      this.bigR = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.bigR.setPixelRatio(1);
    }
    this.slots.push({ box, demo, big, onReady: onReady ? (l) => onReady(l.controls) : undefined });
    if (!big) this.io.observe(box);
    return true;
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    // rAF 의 now 가 만들 때 잰 시각보다 앞설 수 있다 — 음수 dt 막기
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    const smalls3: Live[] = [];
    for (const s of this.slots) {
      const on = s.big || this.visible.has(s.box);
      if (on && !s.live) {
        s.live = start(s.demo, s.box, s.big);
        s.onReady?.(s.live);
      } else if (!on && s.live) {
        stop(s.live);
        s.live = undefined;
      }
      if (!s.live) continue;
      if (s.big) step(s.live, this.bigR, dt);
      else if (s.live.s3) smalls3.push(s.live);
      else step(s.live, null, dt);
    }
    const per = Math.min(smalls3.length, 6);
    for (let k = 0; k < per; k++) step(smalls3[(this.rr + k) % smalls3.length]!, this.small, dt * (smalls3.length / per));
    this.rr = smalls3.length ? (this.rr + per) % smalls3.length : 0;
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    for (const s of this.slots) if (s.live) stop(s.live);
    this.slots = [];
    // dispose 만으로는 WebGL 문맥이 GC 때까지 남는다 — 쪽을 여러 번 넘기면 브라우저 한도(16)를 넘어 지금 화면이 꺼짐
    this.small.dispose();
    this.small.forceContextLoss();
    this.bigR?.dispose();
    this.bigR?.forceContextLoss();
  }
}

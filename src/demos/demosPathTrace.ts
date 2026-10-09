import * as THREE from 'three';
import type { DemoMap, Scene3D } from './types';
import { Overlay, clamp, smooth } from './lib/mech';
import type { Tag } from './lib/mech';
import { Denoiser, PathTracer, Show, ldrTarget } from './lib/pathtrace';

/**
 * 블렌더 없이 사진 같은 렌더 (2026-10-09) — 참고: 「도구와 기계의 원리」 유튜브 제작(three-gpu-pathtracer + oidn-web + puppeteer)
 *  - i545 GPU 경로 추적: 픽셀마다 빛줄 하나씩 쌓아 노이즈가 걷히는 모습 · 튐 횟수 · 얇은 렌즈 심도
 *  - i546 노이즈 제거: 적은 샘플 + 법선 · 깊이 · 바탕색 길잡이 à-trous — 왼쪽 원본 · 오른쪽 거른 것
 *  - i547 경로 추적 영상 굽기: 프레임마다 샘플을 다 모은 뒤 찍고 다음 프레임 — 셔터 시간 안의 아무 순간으로 모션 블러가 공짜
 * 경로 추적기는 lib/pathtrace.ts (셰이더 하나, 수식 도형 장면)
 */

const GLASS = new THREE.Vector3(0.05, 0.45, 1.2);
const SHOTS: { p: THREE.Vector3; l: THREE.Vector3 }[] = [
  { p: new THREE.Vector3(0.3, 1.55, 5.2), l: new THREE.Vector3(0, 0.45, 0) },
  { p: new THREE.Vector3(-2.7, 1.0, 3.4), l: new THREE.Vector3(-0.3, 0.45, 0.2) },
  { p: new THREE.Vector3(2.5, 2.3, 3.7), l: new THREE.Vector3(0.2, 0.35, 0) },
];

function aim(cam: THREE.PerspectiveCamera, p: THREE.Vector3, l: THREE.Vector3): void {
  cam.position.copy(p);
  cam.lookAt(l);
  cam.updateMatrixWorld();
}

/** 화면은 판 하나로 직접 그리므로 장면 · 카메라는 hub 규격을 채우는 빈 것 */
const blank = (): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } => ({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });

/* ───────── i545 GPU 경로 추적 ───────── */
function makeTrace(): Scene3D {
  const { scene, camera } = blank();
  const pt = new PathTracer();
  const show = new Show();
  const overlay = new Overlay();
  let shot = 0;
  let shotT = 0;
  let first = true;
  let hold = false;
  let spf = 2;
  let moving = false;
  let tags: Tag[] = [];
  const STAY = 7;
  const MOVE = 1.1;
  const p = new THREE.Vector3();
  const l = new THREE.Vector3();
  return {
    scene,
    camera,
    tone: THREE.NoToneMapping,
    update(_t, dt) {
      shotT += dt;
      if (!hold && shotT > STAY + MOVE) {
        shot = (shot + 1) % SHOTS.length;
        shotT = 0;
        first = false;
      }
      const a = SHOTS[(shot + SHOTS.length - 1) % SHOTS.length]!;
      const b = SHOTS[shot]!;
      const k = first ? 1 : smooth(0, 1, shotT / MOVE);
      moving = k < 1;
      p.lerpVectors(a.p, b.p, k);
      l.lerpVectors(a.l, b.l, k);
      aim(pt.camera, p, l);
      pt.focusAt(GLASS);
      // 카메라가 움직이는 동안은 지난 샘플이 다른 그림이라 매번 처음부터
      if (moving) pt.reset();
    },
    render(r, w, h) {
      pt.setSize(w, h);
      const big = w >= 700;
      pt.sample(r, spf);
      show.draw(r, pt.tex);
      tags = [{ text: `픽셀당 샘플 ${pt.n}${pt.done ? ' (다 쌓음)' : ''}`, x: 0.02, y: 0.04, ax: 0, ay: 0, big: true }];
      if (moving) tags.push({ text: '카메라가 움직이면 → 처음부터 다시 쌓기', x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      else if (pt.n < 24) tags.push({ text: '자글자글 = 빛줄이 아직 적다', x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      else if (big) tags.push({ text: `빛이 ${pt.bounces}번까지 튐 · ${pt.w}×${pt.h} · 한 장면에 ${spf}샘플`, x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '빛이 튀는 횟수 (1 = 직접광만)', min: 1, max: 8, step: 1, value: 5, on: (v) => ((pt.bounces = v), pt.reset()) },
      { type: 'range', label: '렌즈 조리개 (심도 흐림 — 초점은 유리 공)', min: 0, max: 0.2, step: 0.01, value: 0, on: (v) => ((pt.aperture = v), pt.reset()) },
      { type: 'range', label: '한 장면에 쌓는 샘플', min: 1, max: 8, step: 1, value: 2, on: (v) => (spf = v) },
      { type: 'toggle', label: '카메라 멈추기 (계속 쌓기)', value: false, on: (v) => (hold = v) },
      { type: 'button', label: '처음부터 다시 쌓기', on: () => pt.reset() },
    ],
    dispose() {
      pt.dispose();
      show.dispose();
      overlay.dispose();
    },
  };
}

/* ───────── i546 노이즈 제거 ───────── */
function makeDenoise(): Scene3D {
  const { scene, camera } = blank();
  const pt = new PathTracer();
  const dn = new Denoiser();
  const show = new Show();
  const overlay = new Overlay();
  let split = 0.5;
  let stop = false;
  let spf = 2;
  let view = 0;
  let ang = 0.15;
  let tags: Tag[] = [];
  const p = new THREE.Vector3();
  const look = new THREE.Vector3(0, 0.4, 0.15);
  return {
    scene,
    camera,
    tone: THREE.NoToneMapping,
    update(t, dt) {
      if (!stop) {
        // 천천히 도는 카메라 — 장면마다 처음부터라 늘 「적은 샘플」 그림을 거른다 (실시간 경로 추적의 형편)
        ang += dt * 0.22;
        p.set(Math.sin(ang) * 5, 1.5 + Math.sin(t * 0.4) * 0.3, Math.cos(ang) * 5);
        aim(pt.camera, p, look);
        pt.reset();
      }
    },
    render(r, w, h) {
      pt.setSize(w, h);
      pt.sample(r, spf);
      const big = w >= 700;
      if (view === 1) {
        pt.guides(r);
        show.draw(r, pt.nd.texture, { view: 1 });
        tags = [{ text: '길잡이 ① 법선 (첫 충돌 면의 방향)', x: 0.02, y: 0.04, ax: 0, ay: 0, big: true }];
      } else if (view === 2) {
        pt.guides(r);
        show.draw(r, pt.alb.texture, { view: 2 });
        tags = [{ text: '길잡이 ② 바탕색 (빛을 뺀 무늬)', x: 0.02, y: 0.04, ax: 0, ay: 0, big: true }];
      } else {
        const clean = dn.run(r, pt);
        show.draw(r, pt.tex, { b: clean, split });
        tags = [
          { text: `원본 · 픽셀당 ${pt.n}샘플`, x: Math.max(0.02, split - 0.02), y: 0.04, ax: 1, ay: 0, big },
          { text: dn.iters ? `노이즈 제거 (${dn.iters}단계)` : '노이즈 제거 끔', x: Math.min(0.98, split + 0.02), y: 0.04, ax: 0, ay: 0, big, bg: 'rgba(30,110,200,0.85)' },
        ];
        if (big) tags.push({ text: stop ? '멈춤 — 샘플이 쌓일수록 양쪽이 같아진다' : '카메라가 도는 동안은 장면마다 처음부터 (늘 적은 샘플)', x: 0.5, y: 0.96, ax: 0.5, ay: 1 });
      }
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '분할선 (왼쪽 원본 · 오른쪽 거른 것)', min: 0, max: 1, step: 0.01, value: 0.5, on: (v) => (split = v) },
      { type: 'range', label: '거르는 단계 (1 · 2 · 4 · 8 · 16칸 간격)', min: 0, max: 5, step: 1, value: 5, on: (v) => (dn.iters = v) },
      { type: 'range', label: '밝기 기준 (클수록 많이 뭉갬)', min: 0.1, max: 2, step: 0.05, value: 0.9, on: (v) => (dn.sigma = v) },
      { type: 'toggle', label: '법선 · 깊이 길잡이 (끄면 모서리까지 번짐)', value: true, on: (v) => (dn.guide = v) },
      { type: 'toggle', label: '바탕색으로 나눠 거르기 (끄면 바둑판 무늬가 뭉개짐)', value: true, on: (v) => (dn.demod = v) },
      { type: 'range', label: '한 장면에 쌓는 샘플', min: 1, max: 8, step: 1, value: 2, on: (v) => (spf = v) },
      { type: 'toggle', label: '카메라 멈추기 (계속 쌓기)', value: false, on: (v) => (stop = v) },
      { type: 'range', label: '보기 (0 그림 · 1 법선 · 2 바탕색)', min: 0, max: 2, step: 1, value: 0, on: (v) => (view = v) },
    ],
    dispose() {
      pt.dispose();
      dn.dispose();
      show.dispose();
      overlay.dispose();
    },
  };
}

/* ───────── i547 경로 추적 영상 굽기 ───────── */
function makeBake(): Scene3D {
  const { scene, camera } = blank();
  const pt = new PathTracer();
  const dn = new Denoiser();
  const show = new Show();
  const overlay = new Overlay();
  const NF = 24;
  let clean = true;
  const FPS = 12;
  const frames: THREE.WebGLRenderTarget[] = [];
  let fw = 0;
  let fh = 0;
  let f = 0;
  let baked = 0;
  let spp = 24;
  let blur = true;
  let playT = 0;
  let doneT = -1;
  let tags: Tag[] = [];
  const clear = new THREE.Color();
  aim(pt.camera, new THREE.Vector3(0.6, 1.45, 5.0), new THREE.Vector3(-0.4, 0.55, 0.2));
  const restart = (): void => {
    f = 0;
    baked = 0;
    doneT = -1;
    pt.reset();
  };
  return {
    scene,
    camera,
    tone: THREE.NoToneMapping,
    update(_t, dt) {
      playT += dt;
      if (doneT >= 0) {
        doneT += dt;
        if (doneT > 5) restart();
      }
    },
    render(r, w, h) {
      const big = w >= 700;
      const pad = Math.max(4, Math.round(Math.min(w, h) * 0.025));
      const stripH = Math.round(h * 0.2);
      let mh = h - stripH - pad * 3;
      let mw = Math.round(mh * (16 / 9));
      if (mw > w * 0.62) {
        mw = Math.round(w * 0.62);
        mh = Math.round(mw * (9 / 16));
      }
      pt.setSize(mw, mh);
      // 구운 프레임은 절반 크기 8비트 그림으로 (실제로는 PNG 한 장 = 파일로)
      const tw = Math.max(8, Math.round(mw / 2));
      const th = Math.max(8, Math.round(mh / 2));
      if (tw !== fw || th !== fh) {
        for (const t of frames) t.dispose();
        frames.length = 0;
        for (let i = 0; i < NF; i++) frames.push(ldrTarget(tw, th));
        fw = tw;
        fh = th;
        restart();
      }
      // 굽기: 이 프레임 시각에 맞춰 놓고 샘플을 다 모을 때까지 → 찍고 → 다음 프레임
      if (doneT < 0) {
        pt.time = f / FPS;
        pt.shutter = blur ? 0.5 / FPS : 0;
        pt.max = spp;
        pt.sample(r, big ? 4 : 2);
        if (pt.done) {
          // 찍기 직전에 노이즈 제거 (실제 제작은 OIDN) — 적은 샘플로도 깨끗한 프레임
          show.draw(r, clean ? dn.run(r, pt) : pt.tex, { target: frames[f]! });
          f++;
          baked = Math.max(baked, f);
          pt.reset();
          if (f >= NF) {
            doneT = 0;
            f = NF - 1;
          }
        }
      }
      // 화면: 왼쪽 위 = 지금 굽는 프레임 · 오른쪽 위 = 구운 것 재생 · 아래 = 찍은 프레임 줄
      r.getClearColor(clear);
      const ca = r.getClearAlpha();
      r.setRenderTarget(null);
      r.setClearColor(0x0c1017, 1);
      r.clear();
      r.setClearColor(clear, ca);
      const top = h - pad;
      show.draw(r, pt.tex, { rect: [pad, top - mh, mw, mh] });
      const pw = w - mw - pad * 3;
      const ph = Math.round(pw * (9 / 16));
      const px = mw + pad * 2;
      if (baked > 0) show.draw(r, frames[Math.floor(playT * FPS) % baked]!.texture, { view: 3, rect: [px, top - ph, pw, ph] });
      const N = 8;
      const sw = (w - pad * (N + 1)) / N;
      const sh = Math.min(stripH, sw * (9 / 16));
      // 프레임 줄은 큰 화면 바로 아래 (아래에서 잰 y)
      const stripY = Math.max(pad, top - mh - pad - sh);
      const first = Math.max(0, baked - N);
      for (let i = 0; i < N && first + i < baked; i++) show.draw(r, frames[first + i]!.texture, { view: 3, rect: [Math.round(pad + i * (sw + pad)), Math.round(stripY), Math.round(sw), Math.round(sh)] });
      const done = doneT >= 0;
      tags = [
        { text: done ? `굽기 끝 — ${NF}장` : `프레임 ${f + 1}/${NF} · 샘플 ${pt.n}/${spp}`, x: pad / w + 0.01, y: pad / h + 0.01, ax: 0, ay: 0, big: true, bg: done ? 'rgba(40,150,90,0.9)' : undefined },
        { text: baked ? `구운 영상 재생 (${FPS}fps)` : '재생할 프레임 기다리는 중', x: px / w + 0.01, y: pad / h + 0.01, ax: 0, ay: 0 },
        { text: big ? `찍은 프레임 ${baked}장 → ffmpeg 로 mp4` : `찍은 ${baked}장`, x: 0.02, y: 1 - stripY / h + 0.01, ax: 0, ay: 0 },
      ];
      if (big) tags.push({ text: blur ? '셔터 180° — 빛줄마다 다른 순간이라 공이 저절로 번진다' : '모션 블러 끔 — 프레임마다 한 순간', x: px / w + 0.01, y: (pad + ph) / h + 0.03, ax: 0, ay: 0 });
      overlay.draw(r, w, h, tags);
    },
    controls: [
      { type: 'range', label: '프레임마다 모을 샘플', min: 4, max: 128, step: 4, value: 24, on: (v) => ((spp = v), restart()) },
      { type: 'toggle', label: '모션 블러 (셔터 열린 동안의 아무 순간)', value: true, on: (v) => ((blur = v), restart()) },
      { type: 'range', label: '빛이 튀는 횟수', min: 1, max: 8, step: 1, value: 5, on: (v) => ((pt.bounces = clamp(v, 1, 8)), restart()) },
      { type: 'toggle', label: '찍기 전에 노이즈 제거', value: true, on: (v) => ((clean = v), restart()) },
      { type: 'button', label: '처음부터 다시 굽기', on: () => restart() },
    ],
    dispose() {
      pt.dispose();
      dn.dispose();
      show.dispose();
      overlay.dispose();
      for (const t of frames) t.dispose();
    },
  };
}

export const DEMOS: DemoMap = {
  i545: { kind: '3d', caption: '픽셀마다 빛줄 하나씩 쌓으면 노이즈가 걷히며 사진처럼', make: makeTrace },
  i546: { kind: '3d', caption: '왼쪽 적은 샘플 원본 · 오른쪽 법선 · 바탕색 길잡이로 거른 것', make: makeDenoise },
  i547: { kind: '3d', caption: '프레임마다 샘플을 다 모아 찍고 다음 프레임 — 구운 영상 재생', make: makeBake },
};

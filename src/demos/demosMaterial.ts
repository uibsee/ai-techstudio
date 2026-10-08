import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DemoMap, Scene3D } from './types';

/**
 * 「재질 · 그림체」 견본 — 같은 물체를 왼쪽(기술 없음) · 오른쪽(기술 있음)으로 한 장면에 나란히 두고,
 * 위에 작은 이름표(HUD)를 얹는다. 카메라는 화면 비율에 맞춰 자동으로 물러나 잘리지 않게 한다.
 */

const FONT = '"Pretendard Variable", system-ui, sans-serif';
type V3 = [number, number, number];

/* ───────────── 공통 도구 ───────────── */

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** 세로 그러데이션 배경 (+ 가운데 은은한 빛) */
function gradBg(top: string, bottom: string, glow?: string): THREE.CanvasTexture {
  const [c, g] = cv(256, 256);
  const lg = g.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, top);
  lg.addColorStop(1, bottom);
  g.fillStyle = lg;
  g.fillRect(0, 0, 256, 256);
  if (glow) {
    const rg = g.createRadialGradient(128, 150, 0, 128, 150, 150);
    rg.addColorStop(0, glow);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
  }
  return tex(c);
}
/** 반사용 사진관 환경 (equirect 캔버스) — 위는 밝고 소프트박스 몇 개 */
function studioEnv(warm = false, bars = false): THREE.CanvasTexture {
  const [c, g] = cv(512, 256);
  const lg = g.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, bars ? '#3a3440' : warm ? '#f4e6d0' : '#dfe9f6');
  lg.addColorStop(0.48, warm ? '#8a7864' : '#7d8aa0');
  lg.addColorStop(0.52, '#5a5c6a');
  lg.addColorStop(1, '#2c2e38');
  g.fillStyle = lg;
  g.fillRect(0, 0, 512, 256);
  g.filter = 'blur(5px)';
  g.fillStyle = '#ffffff';
  g.fillRect(70, 40, 90, 46);
  g.fillRect(300, 28, 140, 34);
  g.fillStyle = '#ffd9a0';
  g.fillRect(200, 92, 60, 30);
  g.fillStyle = '#a8d4ff';
  g.fillRect(450, 90, 40, 40);
  g.filter = 'none';
  if (bars) {
    // 창틀 무늬 — 매끈한 막이면 또렷한 창이 비친다
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 16; k++) g.fillRect(k * 32 + 4, 8, 20, 96);
    g.fillStyle = '#3a3440';
    for (let k = 0; k < 4; k++) g.fillRect(0, 8 + k * 24 + 10, 512, 4);
  }
  const t = tex(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
function labelTex(text: string): { t: THREE.CanvasTexture; a: number } {
  const [c0, g0] = cv(8, 8);
  g0.font = `700 34px ${FONT}`;
  const w = Math.ceil(g0.measureText(text).width) + 40;
  void c0;
  const [c, g] = cv(w, 56);
  g.fillStyle = 'rgba(12,18,44,0.62)';
  g.beginPath();
  g.roundRect(1.5, 1.5, w - 3, 53, 26.5);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 2;
  g.stroke();
  g.font = `700 34px ${FONT}`;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 30);
  return { t: tex(c), a: w / 56 };
}
function disposeAll(...roots: (THREE.Object3D | null | undefined)[]): void {
  const seen = new Set<unknown>();
  const dTex = (v: unknown): void => {
    const x = v as THREE.Texture;
    if (x && x.isTexture && !seen.has(x)) {
      seen.add(x);
      x.dispose();
    }
  };
  for (const root of roots) {
    if (!root) continue;
    const sc = root as THREE.Scene;
    if (sc.isScene) {
      dTex(sc.background);
      dTex(sc.environment);
    }
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(o as THREE.Sprite).isSprite && !seen.has(m.geometry)) {
        seen.add(m.geometry);
        m.geometry.dispose();
      }
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        for (const v of Object.values(mat)) dTex(v);
        const u = (mat as THREE.ShaderMaterial).uniforms;
        if (u) for (const x of Object.values(u)) dTex(x?.value);
        mat.dispose();
      }
    });
  }
}

interface Base {
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  setLabels(l: string[]): void;
  done(x: Partial<Scene3D>): Scene3D;
}
/** 장면 · 카메라 맞춤 · 이름표 — fit = 보여야 할 반폭 · 반높이 */
function base(o: { bg: THREE.Texture; labels?: string[]; fit: [number, number]; target?: V3; dir?: V3; fov?: number; env?: THREE.Texture; tone?: THREE.ToneMapping }): Base {
  const scene = new THREE.Scene();
  scene.background = o.bg;
  if (o.env) scene.environment = o.env;
  const cam = new THREE.PerspectiveCamera(o.fov ?? 30, 1.6, 0.1, 100);
  const target = new THREE.Vector3(...(o.target ?? [0, 0, 0]));
  const dir = new THREE.Vector3(...(o.dir ?? [0, 0.22, 1])).normalize();
  const hud = new THREE.Scene();
  const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  let tags: { m: THREE.Mesh; a: number }[] = [];
  const setLabels = (l: string[]): void => {
    disposeAll(hud);
    hud.clear();
    tags = l.map((s) => {
      const { t, a } = labelTex(s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, toneMapped: false }));
      hud.add(m);
      return { m, a };
    });
  };
  setLabels(o.labels ?? []);
  const fit = (): void => {
    const tn = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const d = Math.max(o.fit[1] / tn, o.fit[0] / (tn * cam.aspect)) * 1.06 + 0.3;
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
  };
  fit();
  return {
    scene,
    cam,
    setLabels,
    done(x) {
      return {
        scene,
        camera: cam,
        tone: o.tone ?? x.tone,
        update: x.update,
        controls: x.controls,
        resize() {
          fit();
        },
        render(r, w, h) {
          fit();
          if (x.render) x.render(r, w, h);
          else r.render(scene, cam);
          if (!tags.length) return;
          const ac = r.autoClear;
          r.autoClear = false;
          r.clearDepth();
          hudCam.right = w;
          hudCam.top = h;
          hudCam.updateProjectionMatrix();
          const lh = Math.max(16, Math.min(40, h * 0.075));
          tags.forEach((g, i) => {
            g.m.scale.set(lh * g.a, lh, 1);
            g.m.position.set(((i + 0.5) * w) / tags.length, h - lh * 0.5 - lh * 0.35, 0);
          });
          r.render(hud, hudCam);
          r.autoClear = ac;
        },
        dispose() {
          x.dispose?.();
          disposeAll(scene, hud);
        },
      };
    },
  };
}
function lights(scene: THREE.Scene, sky = 0xffffff, ground = 0x6a6080, hemi = 0.8, sun = 1.8): THREE.DirectionalLight {
  scene.add(new THREE.HemisphereLight(sky, ground, hemi));
  const d = new THREE.DirectionalLight(0xfff2dc, sun);
  d.position.set(-3, 5, 4);
  scene.add(d);
  return d;
}
function toonGrad(): THREE.DataTexture {
  const g = new THREE.DataTexture(new Uint8Array([90, 175, 255]), 3, 1, THREE.RedFormat);
  g.minFilter = g.magFilter = THREE.NearestFilter;
  g.needsUpdate = true;
  return g;
}
/** 나뭇결 */
function woodTex(base = '#b0612e'): THREE.CanvasTexture {
  const [c, g] = cv(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 256;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '60,25,8' : '255,220,170'},${0.08 + Math.random() * 0.14})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 4 + Math.sin(x * 0.11 + i * 2) * 1.5);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** 둥근 판 (말 · 체커) */
function discGeo(r = 0.55, h = 0.22): THREE.LatheGeometry {
  const p: THREE.Vector2[] = [new THREE.Vector2(0, -h / 2)];
  const b = 0.06;
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2);
    p.push(new THREE.Vector2(r - b + Math.cos(a) * b, -h / 2 + b + Math.sin(a) * b));
  }
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    p.push(new THREE.Vector2(r - b + Math.cos(a) * b, h / 2 - b + Math.sin(a) * b));
  }
  p.push(new THREE.Vector2(r * 0.7, h / 2 - 0.02), new THREE.Vector2(r * 0.66, h / 2 - 0.045), new THREE.Vector2(0, h / 2 - 0.045));
  return new THREE.LatheGeometry(p, 48);
}
/** 체스 폰 모양 (원점 = 바닥) */
function pawnGeo(): THREE.LatheGeometry {
  const p = [
    [0, 0],
    [0.5, 0],
    [0.52, 0.06],
    [0.5, 0.13],
    [0.4, 0.2],
    [0.3, 0.28],
    [0.24, 0.4],
    [0.2, 0.7],
    [0.34, 0.78],
    [0.36, 0.84],
    [0.2, 0.9],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  for (let k = 0; k <= 14; k++) {
    const a = -1.2 + (k / 14) * (Math.PI / 2 + 1.2);
    p.push(new THREE.Vector2(Math.max(0, 0.3 * Math.cos(a)), 1.15 + 0.3 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(p, 48);
}
const pushShader = (u: { value: number }) => (sh: THREE.WebGLProgramParametersWithUniforms): void => {
  sh.uniforms['uThick'] = u;
  sh.vertexShader = 'uniform float uThick;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uThick;');
};

/* ───────────── 견본 ───────────── */

export const DEMOS: DemoMap = {
  /* 뒤집은 껍데기 외곽선 */
  u02: {
    kind: '3d',
    caption: '왼쪽 그대로 · 오른쪽 조금 큰 껍데기의 뒷면만 검게 — 만화 선이 생겨요',
    make() {
      const B = base({ bg: gradBg('#9fd6f5', '#e8f6ff'), labels: ['외곽선 없음', '뒤집은 껍데기'], fit: [2.4, 1.15], target: [0, 0.05, 0] });
      lights(B.scene, 0xffffff, 0x9fb0c0, 1.0, 1.6);
      const grad = toonGrad();
      const ink = new THREE.MeshBasicMaterial({ color: 0x1c1a2e, side: THREE.BackSide });
      let thick = 0.045;
      const shells: THREE.Mesh[] = [];
      const bear = (withInk: boolean): THREE.Group => {
        const g = new THREE.Group();
        const fur = new THREE.MeshToonMaterial({ color: 0xc98a52, gradientMap: grad });
        const light = new THREE.MeshToonMaterial({ color: 0xf3dcc0, gradientMap: grad });
        const dark = new THREE.MeshToonMaterial({ color: 0x2a1c14, gradientMap: grad });
        const pink = new THREE.MeshToonMaterial({ color: 0xff9aa8, gradientMap: grad });
        const part = (r: number, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, outline = true): void => {
          const s = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 24), m);
          s.position.set(x, y, z);
          s.scale.set(sx, sy, sz);
          g.add(s);
          if (withInk && outline) {
            const sh = new THREE.Mesh(s.geometry, ink);
            sh.userData['r'] = r;
            sh.scale.setScalar(1 + thick / r);
            s.add(sh);
            shells.push(sh);
          }
        };
        part(0.36, fur, -0.55, 0.62, -0.05);
        part(0.36, fur, 0.55, 0.62, -0.05);
        part(0.2, pink, -0.55, 0.62, 0.22, 1, 1, 0.5, false);
        part(0.2, pink, 0.55, 0.62, 0.22, 1, 1, 0.5, false);
        part(0.82, fur, 0, 0, 0, 1, 0.92, 0.95);
        part(0.34, light, 0, -0.2, 0.66, 1.15, 0.85, 0.8);
        part(0.11, dark, 0, -0.08, 0.92, 1.3, 0.9, 1, false);
        part(0.09, dark, -0.3, 0.16, 0.74, 1, 1.25, 1, false);
        part(0.09, dark, 0.3, 0.16, 0.74, 1, 1.25, 1, false);
        return g;
      };
      const L = bear(false);
      const R = bear(true);
      L.position.x = -1.2;
      R.position.x = 1.2;
      B.scene.add(L, R);
      return B.done({
        tone: THREE.NoToneMapping,
        update(t) {
          for (const g of [L, R]) {
            g.rotation.y = Math.sin(t * 0.7) * 0.75;
            g.rotation.z = Math.sin(t * 1.3) * 0.06;
            g.position.y = Math.abs(Math.sin(t * 1.6)) * 0.08;
          }
        },
        controls: [
          { type: 'range', label: '선 굵기', min: 0, max: 0.12, step: 0.005, value: thick, on: (v) => { thick = v; for (const s of shells) s.scale.setScalar(1 + v / (s.userData['r'] as number)); } },
          {
            type: 'toggle',
            label: '껍데기 들춰 보기 (빨간 반투명)',
            value: false,
            on: (v) => {
              ink.side = v ? THREE.FrontSide : THREE.BackSide;
              ink.color.set(v ? 0xff3355 : 0x1c1a2e);
              ink.transparent = v;
              ink.opacity = v ? 0.45 : 1;
              ink.depthWrite = !v;
              ink.needsUpdate = true;
            },
          },
        ],
      });
    },
  },

  /* 셰이더로 미는 외곽선 */
  u03: {
    kind: '3d',
    caption: '왼쪽 껍데기를 크기로 키움 — 굵기가 들쭉날쭉 · 오른쪽 정점을 법선 쪽으로 밀어 고른 테두리',
    make() {
      const B = base({ bg: gradBg('#2a3a6a', '#7d8fc0', 'rgba(255,230,190,0.25)'), labels: ['크기 키운 껍데기', '법선으로 민 껍데기'], fit: [2.45, 0.85], target: [0, 0.72, 0], env: studioEnv(true) });
      lights(B.scene, 0xffffff, 0x404060, 0.6, 2.0);
      const push = { value: 0.035 };
      let scaleK = 0.035;
      const scaled: { m: THREE.Mesh; size: number }[] = [];
      const inkS = new THREE.MeshBasicMaterial({ color: 0x5a3a1c, side: THREE.BackSide });
      const inkP = new THREE.MeshBasicMaterial({ color: 0x5a3a1c, side: THREE.BackSide });
      inkP.onBeforeCompile = pushShader(push);
      const ivory = new THREE.MeshPhysicalMaterial({ color: 0xe9d6b0, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
      const red = new THREE.MeshPhysicalMaterial({ color: 0xe0503c, roughness: 0.35, clearcoat: 0.6 });
      const pg = pawnGeo();
      const tg = new THREE.TorusGeometry(0.4, 0.12, 24, 64);
      const set = (byPush: boolean): THREE.Group => {
        const g = new THREE.Group();
        const pawn = new THREE.Mesh(pg, ivory);
        pawn.position.x = -0.3;
        const ring = new THREE.Mesh(tg, red);
        ring.position.set(0.55, 0.62, 0.1);
        ring.rotation.set(0.25, -0.35, 0);
        g.add(pawn, ring);
        for (const [m, size] of [[pawn, 1.45], [ring, 0.52]] as [THREE.Mesh, number][]) {
          const sh = new THREE.Mesh(m.geometry, byPush ? inkP : inkS);
          if (!byPush) {
            sh.scale.setScalar(1 + scaleK / size * 1.6);
            scaled.push({ m: sh, size });
          }
          m.add(sh);
        }
        return g;
      };
      const L = set(false);
      const R = set(true);
      L.position.x = -1.3;
      R.position.x = 1.15;
      B.scene.add(L, R);
      return B.done({
        update(t) {
          for (const g of [L, R]) g.rotation.y = Math.sin(t * 0.6) * 0.5;
        },
        controls: [
          {
            type: 'range',
            label: '테두리 굵기',
            min: 0.01,
            max: 0.08,
            step: 0.005,
            value: 0.035,
            on: (v) => {
              push.value = v;
              scaleK = v;
              for (const s of scaled) s.m.scale.setScalar(1 + (v / s.size) * 1.6);
            },
          },
        ],
      });
    },
  },

  /* 클리어코트 */
  u04: {
    kind: '3d',
    caption: '왼쪽 일반 PBR · 오른쪽 클리어코트 — 나뭇결 위에 반짝이는 니스 막이 한 겹 더',
    make() {
      const B = base({ bg: gradBg('#1d2440', '#3b4a78', 'rgba(255,210,150,0.22)'), labels: ['일반 재질', '+ 클리어코트'], fit: [2.5, 0.95], target: [0, 0.15, 0], dir: [0, 0.55, 1], env: studioEnv(true, true) });
      const sun = lights(B.scene, 0xffffff, 0x302840, 0.3, 2.6);
      B.scene.environmentIntensity = 1.8;
      const wood = woodTex('#a85a2a');
      const woodB = woodTex('#3a2a20');
      const mats = {
        a: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }),
        b: new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.85, clearcoat: 1, clearcoatRoughness: 0.05 }),
        a2: new THREE.MeshStandardMaterial({ color: 0x2f8fe0, roughness: 0.8 }),
        b2: new THREE.MeshPhysicalMaterial({ color: 0x2f8fe0, roughness: 0.8, clearcoat: 1, clearcoatRoughness: 0.05 }),
        a3: new THREE.MeshStandardMaterial({ map: woodB, roughness: 0.85 }),
        b3: new THREE.MeshPhysicalMaterial({ map: woodB, roughness: 0.85, clearcoat: 1, clearcoatRoughness: 0.05 }),
      };
      const dg = discGeo(0.6, 0.24);
      const pg = pawnGeo();
      const set = (m1: THREE.Material, m2: THREE.Material, m3: THREE.Material): THREE.Group => {
        const g = new THREE.Group();
        const board = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.16, 1.5, 3, 0.05), m3);
        board.position.y = -0.55;
        const disc = new THREE.Mesh(dg, m1);
        disc.position.set(-0.4, -0.35, 0.15);
        const pawn = new THREE.Mesh(pg, m2);
        pawn.position.set(0.45, -0.47, -0.1);
        pawn.scale.setScalar(0.85);
        g.add(board, disc, pawn);
        return g;
      };
      const L = set(mats.a, mats.a2, mats.a3);
      const R = set(mats.b, mats.b2, mats.b3);
      L.position.x = -1.2;
      R.position.x = 1.2;
      B.scene.add(L, R);
      return B.done({
        update(t) {
          sun.position.set(Math.sin(t * 0.7) * 5, 4, Math.cos(t * 0.7) * 3 + 2);
          for (const g of [L, R]) g.rotation.y = Math.sin(t * 0.4) * 0.35;
        },
        controls: [
          { type: 'range', label: '클리어코트', min: 0, max: 1, step: 0.05, value: 1, on: (v) => { mats.b.clearcoat = mats.b2.clearcoat = mats.b3.clearcoat = v; } },
          { type: 'range', label: '막 거칠기', min: 0, max: 0.6, step: 0.01, value: 0.05, on: (v) => { mats.b.clearcoatRoughness = mats.b2.clearcoatRoughness = mats.b3.clearcoatRoughness = v; } },
        ],
      });
    },
  },

  /* 쉰 */
  u05: {
    kind: '3d',
    caption: '왼쪽 일반 · 오른쪽 쉰 — 벨벳 쿠션 · 복숭아 가장자리에 보송한 결 빛',
    make() {
      const B = base({ bg: gradBg('#1a1430', '#3a2850'), labels: ['일반 재질', '+ 쉰(sheen)'], fit: [2.5, 0.9], target: [0, 0.05, 0], dir: [0, 0.45, 1], env: studioEnv() });
      B.scene.add(new THREE.HemisphereLight(0xffffff, 0x302040, 0.4));
      const key = new THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(2, 3, 4);
      const back = new THREE.DirectionalLight(0xffe8f4, 6.0);
      back.position.set(-2, 2, -5);
      B.scene.add(key, back);
      const mk = (color: number, sheen: number, sc: number): THREE.MeshPhysicalMaterial => new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen, sheenColor: new THREE.Color(sc), sheenRoughness: 0.35 });
      const mats = [mk(0x4a0c2c, 0, 0xff9ad0), mk(0x4a0c2c, 1, 0xff9ad0), mk(0xd0603a, 0, 0xfff0e0), mk(0xd0603a, 1, 0xfff0e0), mk(0x2a6a2a, 0, 0xd8ffc0), mk(0x2a6a2a, 1, 0xd8ffc0)];
      const cg = new RoundedBoxGeometry(1.5, 0.5, 1.2, 6, 0.24);
      const sg = new THREE.SphereGeometry(0.42, 48, 32);
      const lg = new THREE.SphereGeometry(0.16, 24, 16);
      const set = (i: number): THREE.Group => {
        const g = new THREE.Group();
        const cushion = new THREE.Mesh(cg, mats[i]!);
        cushion.position.y = -0.45;
        const peach = new THREE.Mesh(sg, mats[2 + i]!);
        peach.position.set(0, 0.17, 0.05);
        peach.scale.set(1, 0.95, 1);
        const leaf = new THREE.Mesh(lg, mats[4 + i]!);
        leaf.scale.set(1.4, 0.35, 0.7);
        leaf.position.set(0.12, 0.6, 0);
        leaf.rotation.z = -0.4;
        g.add(cushion, peach, leaf);
        return g;
      };
      const L = set(0);
      const R = set(1);
      L.position.x = -1.2;
      R.position.x = 1.2;
      B.scene.add(L, R);
      return B.done({
        update(t) {
          for (const g of [L, R]) g.rotation.y = t * 0.5;
          back.position.set(Math.sin(t * 0.5) * 3, 2, -5);
        },
        controls: [
          { type: 'range', label: '쉰 세기', min: 0, max: 1, step: 0.05, value: 1, on: (v) => { for (let k = 1; k < 6; k += 2) mats[k]!.sheen = v; } },
          { type: 'range', label: '쉰 거칠기', min: 0, max: 1, step: 0.05, value: 0.35, on: (v) => { for (let k = 1; k < 6; k += 2) mats[k]!.sheenRoughness = v; } },
        ],
      });
    },
  },

  /* 진주빛 */
  u06: {
    kind: '3d',
    caption: '왼쪽 일반 · 오른쪽 진주빛 — 돌려 보면 각도마다 무지갯빛이 흘러요',
    make() {
      const B = base({ bg: gradBg('#141a34', '#2c3a66', 'rgba(150,180,255,0.25)'), labels: ['일반 재질', '+ 진주빛'], fit: [2.5, 0.85], target: [0, 0.05, 0], dir: [0, 0.4, 1], env: studioEnv() });
      lights(B.scene, 0xffffff, 0x303050, 0.5, 1.6);
      const pearlA = new THREE.MeshPhysicalMaterial({ color: 0xf2eee8, roughness: 0.22, metalness: 0.75 });
      const pearlB = new THREE.MeshPhysicalMaterial({ color: 0xf2eee8, roughness: 0.22, metalness: 0.75, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [100, 500] });
      const coinA = new THREE.MeshPhysicalMaterial({ color: 0xc8ccd8, roughness: 0.25, metalness: 1 });
      const coinB = new THREE.MeshPhysicalMaterial({ color: 0xc8ccd8, roughness: 0.25, metalness: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [150, 500] });
      const big = new THREE.SphereGeometry(0.5, 48, 32);
      const small = new THREE.SphereGeometry(0.2, 32, 20);
      const dg = discGeo(0.45, 0.12);
      const set = (pm: THREE.Material, cm: THREE.Material): { g: THREE.Group; spin: THREE.Object3D[] } => {
        const g = new THREE.Group();
        const p = new THREE.Mesh(big, pm);
        p.position.set(-0.25, 0.05, 0);
        g.add(p);
        const spin: THREE.Object3D[] = [p];
        for (let k = 0; k < 5; k++) {
          const s = new THREE.Mesh(small, pm);
          s.position.set(-0.6 + k * 0.3, -0.62, 0.35 + Math.sin(k) * 0.12);
          g.add(s);
        }
        const coin = new THREE.Mesh(dg, cm);
        coin.position.set(0.5, 0.0, -0.05);
        coin.rotation.x = Math.PI / 2;
        g.add(coin);
        spin.push(coin);
        return { g, spin };
      };
      const L = set(pearlA, coinA);
      const R = set(pearlB, coinB);
      L.g.position.x = -1.2;
      R.g.position.x = 1.2;
      B.scene.add(L.g, R.g);
      return B.done({
        update(t) {
          for (const S of [L, R]) {
            S.spin[0]!.rotation.y = t * 0.6;
            S.spin[1]!.rotation.z = t * 0.9;
            S.g.rotation.y = Math.sin(t * 0.5) * 0.3;
          }
        },
        controls: [
          { type: 'range', label: '진주빛 세기', min: 0, max: 1, step: 0.05, value: 1, on: (v) => { pearlB.iridescence = coinB.iridescence = v; } },
          { type: 'range', label: '막 두께 (nm)', min: 200, max: 1200, step: 10, value: 500, on: (v) => { pearlB.iridescenceThicknessRange = [100, v]; coinB.iridescenceThicknessRange = [150, v]; } },
        ],
      });
    },
  },

  /* 투과 · 굴절 */
  u07: {
    kind: '3d',
    caption: '왼쪽 그냥 반투명 · 오른쪽 투과+굴절+분산 — 뒤 줄무늬가 휘고 가장자리에 무지개',
    make() {
      const B = base({ bg: gradBg('#a8dcf8', '#eaf7ff'), labels: ['반투명 (opacity)', '투과 · 굴절'], fit: [2.5, 0.95], target: [0, 0.05, 0], env: studioEnv() });
      lights(B.scene, 0xffffff, 0x8090b0, 0.9, 1.8);
      // 뒤 줄무늬 판 — 굴절이 보이게
      const [c, g] = cv(256, 128);
      const cols = ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#c77dff'];
      for (let i = 0; i < 16; i++) {
        g.fillStyle = cols[i % 5]!;
        g.fillRect(i * 16, 0, 16, 128);
      }
      const back = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.2), new THREE.MeshBasicMaterial({ map: tex(c) }));
      back.position.set(0, 0.1, -1.4);
      B.scene.add(back);
      const glassA = new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.1, transparent: true, opacity: 0.45 });
      const glassB = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transmission: 1, ior: 1.5, thickness: 1.2, dispersion: 3, attenuationColor: new THREE.Color(0xc8f0ff), attenuationDistance: 3 });
      const crys = new THREE.OctahedronGeometry(0.62, 0);
      const cube = new RoundedBoxGeometry(0.7, 0.7, 0.7, 4, 0.1);
      const set = (m: THREE.Material): { g: THREE.Group; a: THREE.Mesh; b: THREE.Mesh } => {
        const gg = new THREE.Group();
        const a = new THREE.Mesh(crys, m);
        a.scale.set(0.8, 1.35, 0.8);
        a.position.set(-0.32, 0.12, 0);
        const b = new THREE.Mesh(cube, m);
        b.position.set(0.48, -0.42, 0.25);
        gg.add(a, b);
        return { g: gg, a, b };
      };
      const L = set(glassA);
      const R = set(glassB);
      L.g.position.x = -1.2;
      R.g.position.x = 1.2;
      B.scene.add(L.g, R.g);
      return B.done({
        update(t) {
          for (const S of [L, R]) {
            S.a.rotation.y = t * 0.5;
            S.b.rotation.set(t * 0.3, t * 0.4, 0);
          }
        },
        controls: [
          { type: 'range', label: '굴절률 (ior)', min: 1, max: 2.4, step: 0.05, value: 1.5, on: (v) => { glassB.ior = v; } },
          { type: 'range', label: '분산 (무지개)', min: 0, max: 8, step: 0.5, value: 3, on: (v) => { glassB.dispersion = v; } },
          { type: 'range', label: '두께', min: 0, max: 3, step: 0.1, value: 1.2, on: (v) => { glassB.thickness = v; } },
        ],
      });
    },
  },

  /* onBeforeCompile 끼워 넣기 */
  u08: {
    kind: '3d',
    caption: '같은 재질에 셰이더 몇 줄 — 오른쪽 풀은 바람에 흔들리고 버섯 갓은 속에서 빛나요',
    make() {
      const B = base({ bg: gradBg('#16204a', '#3a4c86', 'rgba(140,255,200,0.18)'), labels: ['그대로', '셰이더 끼움'], fit: [2.5, 0.85], target: [0, 0.25, 0], dir: [0, 0.5, 1] });
      lights(B.scene, 0xbfd8ff, 0x203040, 0.7, 1.3);
      const uTime = { value: 0 };
      const uWind = { value: 0.35 };
      const uGlow = { value: 1.2 };
      // 풀잎 모음 (한 덩어리)
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      let vi = 0;
      const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
      for (let n = 0; n < 140; n++) {
        const a = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * 0.95;
        const x0 = Math.cos(a) * rr;
        const z0 = Math.sin(a) * rr * 0.7;
        const h = rnd(0.35, 0.75);
        const w = rnd(0.035, 0.06);
        const ang = Math.random() * Math.PI;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);
        const lean = rnd(-0.08, 0.08);
        for (let s = 0; s <= 3; s++) {
          const f = s / 3;
          const ww = w * (1 - f * 0.9);
          const y = h * f;
          const lx = lean * f * f;
          pos.push(x0 - dx * ww + lx, y, z0 - dz * ww, x0 + dx * ww + lx, y, z0 + dz * ww);
          const c1 = new THREE.Color().setHSL(0.27 + Math.random() * 0.04, 0.6, 0.18 + f * 0.35);
          col.push(c1.r, c1.g, c1.b, c1.r, c1.g, c1.b);
          if (s < 3) idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
          vi += 2;
        }
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      gg.setIndex(idx);
      gg.computeVertexNormals();
      const grassA = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
      const grassB = grassA.clone();
      grassB.onBeforeCompile = (sh) => {
        sh.uniforms['uTime'] = uTime;
        sh.uniforms['uWind'] = uWind;
        sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wq = modelMatrix * vec4(position, 1.0);
          float hh = max(position.y, 0.0);
          transformed.x += sin(uTime * 2.2 + wq.x * 2.5 + wq.z * 1.3) * uWind * hh * hh * 1.6;
          transformed.z += cos(uTime * 1.7 + wq.x * 1.5) * uWind * hh * hh * 0.7;`,
        );
      };
      const capA = new THREE.MeshStandardMaterial({ color: 0xd04a6a, roughness: 0.6 });
      const capB = capA.clone();
      capB.onBeforeCompile = (sh) => {
        sh.uniforms['uGlow'] = uGlow;
        sh.uniforms['uTime'] = uTime;
        sh.fragmentShader = 'uniform float uGlow;\nuniform float uTime;\n' + sh.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
            float rimL = pow(1.0 - facing, 1.6);
            float pulse = 0.75 + 0.25 * sin(uTime * 2.0);
            totalEmissiveRadiance += vec3(1.0, 0.75, 0.45) * uGlow * pulse * (0.18 + rimL);
          }`,
        );
      };
      const stemM = new THREE.MeshStandardMaterial({ color: 0xf2e6cf, roughness: 0.7 });
      const groundM = new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: 1 });
      const capG = new THREE.SphereGeometry(0.42, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
      const stemG = new THREE.CylinderGeometry(0.13, 0.17, 0.5, 20);
      const groundG = new THREE.CylinderGeometry(1.05, 1.0, 0.12, 40);
      const set = (gm: THREE.Material, cm: THREE.Material): THREE.Group => {
        const g = new THREE.Group();
        const ground = new THREE.Mesh(groundG, groundM);
        ground.scale.z = 0.72;
        ground.position.y = -0.06;
        const grass = new THREE.Mesh(gg, gm);
        const stem = new THREE.Mesh(stemG, stemM);
        stem.position.set(0.15, 0.25, 0.15);
        const cap = new THREE.Mesh(capG, cm);
        cap.position.set(0.15, 0.46, 0.15);
        cap.scale.set(1, 0.8, 1);
        g.add(ground, grass, stem, cap);
        return g;
      };
      const L = set(grassA, capA);
      const R = set(grassB, capB);
      L.position.x = -1.2;
      R.position.x = 1.2;
      B.scene.add(L, R);
      return B.done({
        update(t) {
          uTime.value = t;
          for (const g of [L, R]) g.rotation.y = Math.sin(t * 0.3) * 0.4;
        },
        controls: [
          { type: 'range', label: '바람', min: 0, max: 1, step: 0.05, value: 0.35, on: (v) => { uWind.value = v; } },
          { type: 'range', label: '갓 속빛', min: 0, max: 3, step: 0.1, value: 1.2, on: (v) => { uGlow.value = v; } },
        ],
      });
    },
  },

  /* CanvasTexture */
  u09: {
    kind: '3d',
    caption: '왼쪽 2D 캔버스에 얼굴 · 숫자를 그리면 → 오른쪽 3D 상자에 그대로 붙어 함께 바뀌어요',
    make() {
      const B = base({ bg: gradBg('#ffe9c8', '#fff7ea'), labels: ['2D 캔버스에 그림', '3D 물체에 붙임'], fit: [2.5, 0.9], target: [0, 0, 0] });
      lights(B.scene, 0xffffff, 0xc0a080, 1.0, 1.6);
      const [c, g] = cv(256, 256);
      const t2 = tex(c);
      let hue = 200;
      let last = -1;
      const draw = (t: number): void => {
        g.fillStyle = `hsl(${hue},70%,62%)`;
        g.fillRect(0, 0, 256, 256);
        // 펠트 줄무늬 (흐름)
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 10;
        for (let k = -4; k < 12; k++) {
          const o = ((t * 30) % 40) + k * 40;
          g.beginPath();
          g.moveTo(o, 0);
          g.lineTo(o - 256, 256);
          g.stroke();
        }
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 6;
        g.setLineDash([12, 10]);
        g.strokeRect(14, 14, 228, 228);
        g.setLineDash([]);
        // 얼굴
        const blink = t % 2.6 < 0.16;
        g.fillStyle = '#1e1a2e';
        for (const ex of [92, 164]) {
          if (blink) g.fillRect(ex - 14, 118, 28, 6);
          else {
            g.beginPath();
            g.ellipse(ex, 120, 11, 15, 0, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(ex + 4, 114, 4, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#1e1a2e';
          }
        }
        g.fillStyle = 'rgba(255,120,150,0.7)';
        g.beginPath();
        g.ellipse(70, 152, 16, 9, 0, 0, Math.PI * 2);
        g.ellipse(186, 152, 16, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#1e1a2e';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(128, 146, 18, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
        // 숫자
        g.fillStyle = '#fff';
        g.font = `900 54px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(Math.floor(t) % 10), 128, 58);
        t2.needsUpdate = true;
      };
      draw(0);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: t2, toneMapped: false }));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.62), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      frame.position.z = -0.01;
      const left = new THREE.Group();
      left.add(frame, paper);
      left.position.x = -1.35;
      const box = new THREE.Mesh(new RoundedBoxGeometry(1.05, 1.05, 1.05, 4, 0.1), new THREE.MeshStandardMaterial({ map: t2, roughness: 0.55 }));
      box.position.x = 1.4;
      const am = new THREE.MeshStandardMaterial({ color: 0xff8a3c, roughness: 0.5 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 16), am);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.x = -0.06;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 20), am);
      head.rotation.z = -Math.PI / 2;
      head.position.x = 0.25;
      const arrow = new THREE.Group();
      arrow.add(shaft, head);
      B.scene.add(left, box, arrow);
      return B.done({
        update(t) {
          if (t - last > 0.08) {
            draw(t);
            last = t;
          }
          left.rotation.y = 0.25 + Math.sin(t * 0.8) * 0.12;
          box.rotation.set(Math.sin(t * 0.5) * 0.4, t * 0.6, 0);
          arrow.position.x = Math.sin(t * 3) * 0.06;
        },
        controls: [{ type: 'range', label: '바탕 색 (색상)', min: 0, max: 360, step: 1, value: 200, on: (v) => { hue = v; } }],
      });
    },
  },

  /* bump / normal */
  u10: {
    kind: '3d',
    caption: '왼쪽 무늬만 · 오른쪽 그린 요철 맵 — 빛이 돌면 점 · 결이 오돌토돌 솟아 보여요',
    make() {
      const B = base({ bg: gradBg('#22305c', '#5a70a8'), labels: ['무늬만', '+ 요철 맵'], fit: [2.5, 0.95], target: [0, 0.05, 0], dir: [0, 0.4, 1] });
      B.scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 0.35));
      const sun = new THREE.DirectionalLight(0xfff0dc, 2.8);
      B.scene.add(sun);
      // 같은 자리에 색 무늬 · 높이 무늬
      const [cc, gc] = cv(512, 256);
      const [hc, gh] = cv(512, 256);
      gc.fillStyle = '#d8384a';
      gc.fillRect(0, 0, 512, 256);
      gh.fillStyle = '#000';
      gh.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 2500; i++) {
        gh.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
        gh.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
      }
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * 512;
        const y = 40 + Math.random() * 120;
        const r = 10 + Math.random() * 16;
        gc.fillStyle = '#fff4e6';
        gc.beginPath();
        gc.ellipse(x, y, r, r * 0.9, 0, 0, Math.PI * 2);
        gc.fill();
        const rg = gh.createRadialGradient(x, y, 0, x, y, r * 1.1);
        rg.addColorStop(0, '#fff');
        rg.addColorStop(0.7, '#ddd');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        gh.fillStyle = rg;
        gh.beginPath();
        gh.ellipse(x, y, r * 1.1, r, 0, 0, Math.PI * 2);
        gh.fill();
      }
      const colT = tex(cc);
      const bumpT = tex(hc, false);
      // 펠트 · 뜨개 결
      const [fc, gf] = cv(256, 256);
      gf.fillStyle = '#808080';
      gf.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 16)
        for (let x = 0; x < 256; x += 16) {
          const rg = gf.createRadialGradient(x + 8, y + 8, 0, x + 8, y + 8, 9);
          rg.addColorStop(0, '#fff');
          rg.addColorStop(1, '#202020');
          gf.fillStyle = rg;
          gf.beginPath();
          gf.ellipse(x + 8, y + 8, 5, 8, (x + y) % 32 ? 0.5 : -0.5, 0, Math.PI * 2);
          gf.fill();
        }
      const feltT = tex(fc, false);
      feltT.wrapS = feltT.wrapT = THREE.RepeatWrapping;
      feltT.repeat.set(3, 3);
      const capA = new THREE.MeshStandardMaterial({ map: colT, roughness: 0.55 });
      const capB = new THREE.MeshStandardMaterial({ map: colT, roughness: 0.55, bumpMap: bumpT, bumpScale: 4 });
      const matA = new THREE.MeshStandardMaterial({ color: 0x5aa0e0, roughness: 0.8 });
      const matB = new THREE.MeshStandardMaterial({ color: 0x5aa0e0, roughness: 0.8, bumpMap: feltT, bumpScale: 3 });
      const sg = new THREE.SphereGeometry(0.55, 64, 40);
      const mg = new RoundedBoxGeometry(1.9, 0.18, 1.3, 3, 0.06);
      const set = (cm: THREE.Material, mm: THREE.Material): { g: THREE.Group; s: THREE.Mesh } => {
        const g = new THREE.Group();
        const s = new THREE.Mesh(sg, cm);
        s.position.y = 0.15;
        const mat = new THREE.Mesh(mg, mm);
        mat.position.y = -0.5;
        g.add(s, mat);
        return { g, s };
      };
      const L = set(capA, matA);
      const R = set(capB, matB);
      L.g.position.x = -1.2;
      R.g.position.x = 1.2;
      B.scene.add(L.g, R.g);
      return B.done({
        update(t) {
          sun.position.set(Math.cos(t * 0.9) * 4, 1.6, Math.sin(t * 0.9) * 2 + 1.5);
          for (const S of [L, R]) S.s.rotation.y = t * 0.3;
        },
        controls: [{ type: 'range', label: '요철 세기', min: 0, max: 10, step: 0.5, value: 4, on: (v) => { capB.bumpScale = v; matB.bumpScale = v * 0.75; } }],
      });
    },
  },

  /* additive */
  u11: {
    kind: '3d',
    caption: '왼쪽 보통 섞기 · 오른쪽 더하기 섞기 — 빛무리가 겹치는 곳이 하얗게 더 밝아져요',
    make() {
      const B = base({ bg: gradBg('#070a1e', '#18204a'), labels: ['보통 섞기', '더하기 섞기'], fit: [2.4, 1.0], target: [0, 0, 0] });
      const [c, g] = cv(128, 128);
      const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      rg.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      const glow = tex(c);
      const palette = [0xffc84a, 0x4ad8ff, 0xff6ab0, 0x8a7bff, 0x6affb0];
      const N = 60;
      const mkSet = (blend: THREE.Blending): { g: THREE.Group; sp: THREE.Sprite[]; mats: THREE.SpriteMaterial[] } => {
        const gr = new THREE.Group();
        const mats = palette.map((col) => new THREE.SpriteMaterial({ map: glow, color: col, blending: blend, transparent: true, depthWrite: false, opacity: blend === THREE.AdditiveBlending ? 0.7 : 0.9 }));
        const sp: THREE.Sprite[] = [];
        for (let i = 0; i < N; i++) {
          const s = new THREE.Sprite(mats[i % mats.length]!);
          s.userData = { a: Math.random() * 6.28, r: 0.15 + Math.random() * 0.75, sp: 0.4 + Math.random() * 0.8, y: Math.random() * 6.28, k: 0.35 + Math.random() * 0.45 };
          gr.add(s);
          sp.push(s);
        }
        return { g: gr, sp, mats };
      };
      const L = mkSet(THREE.NormalBlending);
      const R = mkSet(THREE.AdditiveBlending);
      L.g.position.x = -1.2;
      R.g.position.x = 1.2;
      B.scene.add(L.g, R.g);
      let count = 36;
      let size = 1;
      return B.done({
        tone: THREE.NoToneMapping,
        update(t) {
          for (const S of [L, R])
            S.sp.forEach((s, i) => {
              const u = s.userData as { a: number; r: number; sp: number; y: number; k: number };
              const a = u.a + t * u.sp;
              s.visible = i < count;
              s.position.set(Math.cos(a) * u.r, Math.sin(a * 1.3 + u.y) * 0.55, Math.sin(a) * u.r * 0.5);
              s.scale.setScalar(u.k * size * (0.85 + 0.15 * Math.sin(t * 3 + i)));
            });
        },
        controls: [
          { type: 'range', label: '빛 개수', min: 4, max: N, step: 1, value: 36, on: (v) => { count = v; } },
          { type: 'range', label: '크기', min: 0.4, max: 2, step: 0.05, value: 1, on: (v) => { size = v; } },
        ],
      });
    },
  },

  /* 매트캡 */
  i09: {
    kind: '3d',
    caption: '조명 없이 동그란 그림(위) 한 장씩만 — 도자기 · 젤리 · 금이 돼요',
    make() {
      const B = base({ bg: gradBg('#d8ecff', '#f6fbff'), labels: ['도자기', '젤리', '금'], fit: [3.1, 1.1], target: [0, 0.2, 0], dir: [0, 0.12, 1] });
      const matcap = (kind: number): THREE.CanvasTexture => {
        const [c, g] = cv(256, 256);
        const C = 128;
        if (kind === 0) {
          const rg = g.createRadialGradient(100, 90, 10, C, C, 128);
          rg.addColorStop(0, '#ffffff');
          rg.addColorStop(0.45, '#eef2f8');
          rg.addColorStop(0.8, '#9aa8c4');
          rg.addColorStop(1, '#3a4664');
          g.fillStyle = rg;
        } else if (kind === 1) {
          const rg = g.createRadialGradient(C, 140, 10, C, C, 128);
          rg.addColorStop(0, '#2fbf5a');
          rg.addColorStop(0.6, '#45d870');
          rg.addColorStop(0.88, '#a8ffb8');
          rg.addColorStop(1, '#e8fff0');
          g.fillStyle = rg;
        } else {
          const lg = g.createLinearGradient(0, 0, 0, 256);
          lg.addColorStop(0, '#fff6c8');
          lg.addColorStop(0.3, '#e8b84a');
          lg.addColorStop(0.5, '#7a4a12');
          lg.addColorStop(0.62, '#f2c860');
          lg.addColorStop(0.85, '#a06a1c');
          lg.addColorStop(1, '#3a2006');
          g.fillStyle = lg;
        }
        g.beginPath();
        g.arc(C, C, 128, 0, Math.PI * 2);
        g.fill();
        // 반짝임
        const hl = g.createRadialGradient(92, 78, 0, 92, 78, kind === 2 ? 34 : 26);
        hl.addColorStop(0, 'rgba(255,255,255,1)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hl;
        g.beginPath();
        g.arc(92, 78, 40, 0, Math.PI * 2);
        g.fill();
        if (kind === 1) {
          g.strokeStyle = 'rgba(255,255,255,0.6)';
          g.lineWidth = 6;
          g.beginPath();
          g.arc(C, C, 108, 0.6, 1.4);
          g.stroke();
        }
        return tex(c);
      };
      const caps = [matcap(0), matcap(1), matcap(2)];
      const mm = caps.map((m) => new THREE.MeshMatcapMaterial({ matcap: m }));
      const sm = [
        new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 0.3 }),
        new THREE.MeshStandardMaterial({ color: 0x3fd068, roughness: 0.2 }),
        new THREE.MeshStandardMaterial({ color: 0xe0b040, roughness: 0.3, metalness: 1 }),
      ];
      const geos = [new THREE.TorusKnotGeometry(0.42, 0.15, 120, 18), new THREE.SphereGeometry(0.62, 48, 32), new THREE.CapsuleGeometry(0.35, 0.5, 8, 24)];
      const objs: THREE.Mesh[] = [];
      const xs = [-2.15, 0, 2.15];
      xs.forEach((x, i) => {
        const o = new THREE.Mesh(geos[i]!, mm[i]!);
        o.position.set(x, -0.25, 0);
        if (i === 1) o.scale.set(1, 0.8, 1);
        B.scene.add(o);
        objs.push(o);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 40), new THREE.MeshBasicMaterial({ map: caps[i]!, toneMapped: false }));
        disc.position.set(x, 0.95, 0);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.32, 40), new THREE.MeshBasicMaterial({ color: 0x2a3a6a, toneMapped: false }));
        ring.position.copy(disc.position);
        B.scene.add(disc, ring);
      });
      // 조명은 「비교」 때만 의미 있음 — 매트캡은 무시한다
      lights(B.scene, 0xffffff, 0x8090a0, 0.9, 1.8);
      B.scene.environment = studioEnv();
      return B.done({
        update(t) {
          objs[0]!.rotation.set(t * 0.4, t * 0.7, 0);
          const sq = 1 + Math.sin(t * 4) * 0.08;
          objs[1]!.scale.set(sq, 0.8 / sq, sq);
          objs[1]!.rotation.y = t * 0.5;
          objs[2]!.rotation.set(Math.sin(t) * 0.5, 0, t * 0.6);
        },
        controls: [
          {
            type: 'toggle',
            label: '매트캡 켜기 (끄면 조명 계산 재질)',
            value: true,
            on: (v) => {
              objs.forEach((o, i) => (o.material = v ? mm[i]! : sm[i]!));
              B.setLabels(v ? ['도자기', '젤리', '금'] : ['조명 계산 1', '조명 계산 2', '조명 계산 3']);
            },
          },
        ],
        dispose() {
          for (const m of [...mm, ...sm]) m.dispose();
        },
      });
    },
  },

  /* rim light */
  i10: {
    kind: '3d',
    caption: '어두운 밤 배경 — 오른쪽만 가장자리가 빛나 배경에서 또렷하게 떠 보여요',
    make() {
      const B = base({ bg: gradBg('#0a0f2a', '#1a2450'), labels: ['테두리 빛 없음', '테두리 빛 (프레넬)'], fit: [2.5, 0.9], target: [0, 0.05, 0] });
      B.scene.add(new THREE.HemisphereLight(0x8090c0, 0x101020, 0.5));
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(-2, 3, 4);
      B.scene.add(key);
      const uRim = { value: 1.6 };
      const uPow = { value: 2.5 };
      const uCol = { value: new THREE.Color(0x7fd8ff) };
      const rimify = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
        const c = m.clone();
        c.onBeforeCompile = (sh) => {
          sh.uniforms['uRim'] = uRim;
          sh.uniforms['uPow'] = uPow;
          sh.uniforms['uRimCol'] = uCol;
          sh.fragmentShader = 'uniform float uRim;\nuniform float uPow;\nuniform vec3 uRimCol;\n' + sh.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uPow);
            totalEmissiveRadiance += uRimCol * fres * uRim;`,
          );
        };
        return c;
      };
      const body = new THREE.MeshStandardMaterial({ color: 0x3a3a8a, roughness: 0.6 });
      const ball = new THREE.MeshStandardMaterial({ color: 0x7a2a5a, roughness: 0.5 });
      const eye = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pupil = new THREE.MeshBasicMaterial({ color: 0x101020 });
      const bodyR = rimify(body);
      const ballR = rimify(ball);
      const bg = new THREE.SphereGeometry(0.6, 48, 32);
      const sg = new THREE.SphereGeometry(0.3, 40, 24);
      const eg = new THREE.SphereGeometry(0.1, 16, 12);
      const pg = new THREE.SphereGeometry(0.05, 12, 8);
      const set = (bm: THREE.Material, sm: THREE.Material): { g: THREE.Group; c: THREE.Group; b: THREE.Mesh } => {
        const g = new THREE.Group();
        const c = new THREE.Group();
        const bd = new THREE.Mesh(bg, bm);
        bd.scale.set(1, 0.9, 0.95);
        c.add(bd);
        for (const sx of [-1, 1]) {
          const e = new THREE.Mesh(eg, eye);
          e.position.set(sx * 0.2, 0.1, 0.52);
          const p = new THREE.Mesh(pg, pupil);
          p.position.set(sx * 0.2, 0.1, 0.61);
          c.add(e, p);
        }
        c.position.set(-0.25, 0, 0);
        const b = new THREE.Mesh(sg, sm);
        b.position.set(0.6, -0.45, 0.3);
        g.add(c, b);
        return { g, c, b };
      };
      const L = set(body, ball);
      const R = set(bodyR, ballR);
      L.g.position.x = -1.2;
      R.g.position.x = 1.2;
      B.scene.add(L.g, R.g);
      return B.done({
        update(t) {
          for (const S of [L, R]) {
            S.c.rotation.y = Math.sin(t * 0.8) * 0.6;
            S.c.position.y = Math.abs(Math.sin(t * 1.8)) * 0.12;
            S.b.position.y = -0.45 + Math.abs(Math.sin(t * 2.4 + 1)) * 0.3;
          }
        },
        controls: [
          { type: 'range', label: '빛 세기', min: 0, max: 4, step: 0.1, value: 1.6, on: (v) => { uRim.value = v; } },
          { type: 'range', label: '가장자리 좁게', min: 0.8, max: 6, step: 0.1, value: 2.5, on: (v) => { uPow.value = v; } },
          { type: 'range', label: '빛 색 (색상)', min: 0, max: 360, step: 1, value: 197, on: (v) => { uCol.value.setHSL(v / 360, 1, 0.75); } },
        ],
        dispose() {
          body.dispose();
          ball.dispose();
        },
      });
    },
  },

  /* 망점 · 해칭 */
  i11: {
    kind: '3d',
    caption: '같은 물체의 그늘을 — 가운데 만화책 망점 · 오른쪽 연필 빗금으로',
    make() {
      const B = base({ bg: gradBg('#fbf3e0', '#f2e6c8'), labels: ['보통 그늘', '망점', '빗금'], fit: [3.1, 0.9], target: [0, -0.05, 0], dir: [0, 0.15, 1] });
      const uLight = { value: new THREE.Vector3(0.5, 0.7, 0.6).normalize() };
      const uCell = { value: 6 };
      const mk = (mode: number, col: number): THREE.ShaderMaterial =>
        new THREE.ShaderMaterial({
          uniforms: { uLight, uCell, uMode: { value: mode }, uCol: { value: new THREE.Color(col) }, uInk: { value: new THREE.Color(0x1e1a3a) } },
          vertexShader: `varying vec3 vN;
            void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform vec3 uLight; uniform float uCell; uniform float uMode; uniform vec3 uCol; uniform vec3 uInk;
            varying vec3 vN;
            float ln(float x){ float f = abs(fract(x) - 0.5) * 2.0; return smoothstep(0.42, 0.18, f); }
            void main(){
              float d = max(dot(normalize(vN), uLight), 0.0);
              float lum = 0.12 + 0.88 * d;
              vec3 col;
              if (uMode < 0.5) {
                col = uCol * (0.35 + 0.65 * lum);
              } else if (uMode < 1.5) {
                vec2 p = gl_FragCoord.xy / uCell;
                p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
                vec2 c = fract(p) - 0.5;
                float r = sqrt(max(1.0 - lum, 0.0)) * 0.72;
                float aa = 1.5 / uCell;
                float dotv = 1.0 - smoothstep(r - aa, r + aa, length(c));
                col = mix(uCol, uInk, dotv * 0.92);
              } else {
                vec2 q = gl_FragCoord.xy / uCell;
                float ink = 0.0;
                if (lum < 0.85) ink = max(ink, ln((q.x + q.y) * 0.7));
                if (lum < 0.6) ink = max(ink, ln((q.x - q.y) * 0.7));
                if (lum < 0.35) ink = max(ink, ln(q.x * 0.7 + 0.25));
                vec3 paper = mix(vec3(1.0, 0.98, 0.93), uCol, 0.25);
                col = mix(paper, uInk, ink * 0.85);
              }
              gl_FragColor = vec4(col, 1.0);
            }`,
        });
      const push = { value: 0.025 };
      const ink = new THREE.MeshBasicMaterial({ color: 0x1e1a3a, side: THREE.BackSide });
      ink.onBeforeCompile = pushShader(push);
      const knot = new THREE.TorusKnotGeometry(0.42, 0.16, 140, 20);
      const sph = new THREE.SphereGeometry(0.3, 32, 20);
      const objs: THREE.Group[] = [];
      [0, 1, 2].forEach((mode, i) => {
        const g = new THREE.Group();
        const m = mk(mode, [0xff7a8a, 0x58b8ff, 0xffc04a][i]!);
        const k = new THREE.Mesh(knot, m);
        k.add(new THREE.Mesh(knot, ink));
        const s = new THREE.Mesh(sph, m);
        s.position.set(0.55, -0.55, 0.3);
        s.add(new THREE.Mesh(sph, ink));
        g.add(k, s);
        g.position.x = (i - 1) * 2.1;
        B.scene.add(g);
        objs.push(g);
      });
      let speed = 0.6;
      let cellK = 1;
      return B.done({
        tone: THREE.NoToneMapping,
        update(t) {
          for (const g of objs) g.rotation.y = t * 0.35;
          const a = t * speed;
          uLight.value.set(Math.cos(a) * 0.8, 0.55, Math.sin(a) * 0.5 + 0.55).normalize();
        },
        render(r, w, h) {
          uCell.value = Math.max(4, (h / 80) * cellK);
          void w;
          r.render(B.scene, B.cam);
        },
        controls: [
          { type: 'range', label: '점 · 빗금 크기', min: 0.5, max: 2.5, step: 0.1, value: 1, on: (v) => { cellK = v; } },
          { type: 'range', label: '빛 도는 빠르기', min: 0, max: 2, step: 0.1, value: 0.6, on: (v) => { speed = v; } },
        ],
      });
    },
  },

  /* 디졸브 */
  i12: {
    kind: '3d',
    caption: '정답 블록이 잡음 무늬를 따라 금빛 테두리로 타들어 가듯 사라졌다 다시 나타나요',
    make() {
      const B = base({ bg: gradBg('#120c2e', '#2e2060', 'rgba(255,170,90,0.2)'), labels: ['사라지는 중'], fit: [2.4, 0.75], target: [0, 0, 0], dir: [0, 0.35, 1] });
      lights(B.scene, 0xd8d8ff, 0x302040, 0.7, 1.8);
      const uEdge = { value: 0.07 };
      const uScale = { value: 2.6 };
      const uCol = { value: new THREE.Color(1.0, 0.62, 0.2) };
      const NOISE = `varying vec3 vObjPos;
        uniform float uProg; uniform float uEdge; uniform float uScale; uniform vec3 uEdgeCol;
        float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h3(i), h3(i + vec3(1.0,0.0,0.0)), f.x), mix(h3(i + vec3(0.0,1.0,0.0)), h3(i + vec3(1.0,1.0,0.0)), f.x), f.y),
                     mix(mix(h3(i + vec3(0.0,0.0,1.0)), h3(i + vec3(1.0,0.0,1.0)), f.x), mix(h3(i + vec3(0.0,1.0,1.0)), h3(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z); }
        float fbm(vec3 p){ return 0.55 * vn(p) + 0.3 * vn(p * 2.03) + 0.15 * vn(p * 4.1); }
      `;
      const blocks: { m: THREE.Mesh; prog: { value: number } }[] = [];
      const geo = new RoundedBoxGeometry(0.95, 0.95, 0.95, 4, 0.12);
      ['7', '3', '5'].forEach((n, i) => {
        const [c, g] = cv(128, 128);
        g.fillStyle = ['#ff6b8a', '#4dc3ff', '#7ad860'][i]!;
        g.fillRect(0, 0, 128, 128);
        g.fillStyle = '#fff';
        g.font = `900 84px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(n, 64, 70);
        const prog = { value: 0 };
        const mat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.45, side: THREE.DoubleSide });
        mat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, { uProg: prog, uEdge, uScale, uEdgeCol: uCol });
          sh.vertexShader = 'varying vec3 vObjPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjPos = position;');
          sh.fragmentShader = NOISE + sh.fragmentShader
            .replace('#include <clipping_planes_fragment>', 'float dn = fbm(vObjPos * uScale + 3.7);\n if (dn < uProg) discard;\n#include <clipping_planes_fragment>')
            .replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
              float de = 1.0 - smoothstep(0.0, uEdge, dn - uProg);
              diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeCol, de * 0.7);
              totalEmissiveRadiance += uEdgeCol * de * 2.4;`,
            );
        };
        const m = new THREE.Mesh(geo, mat);
        m.position.x = (i - 1) * 1.4;
        B.scene.add(m);
        blocks.push({ m, prog });
      });
      let speed = 1;
      let tt = 0;
      let lastLabel = '';
      const P = 6;
      return B.done({
        update(_t, dt) {
          tt += dt * speed;
          let state = '';
          blocks.forEach((b, i) => {
            const ph = (((tt - i * 2) % P) + P) % P / P;
            let p: number;
            if (ph < 0.38) p = -0.15 + (ph / 0.38) * 1.2;
            else if (ph < 0.5) p = 1.05;
            else if (ph < 0.88) p = 1.05 - ((ph - 0.5) / 0.38) * 1.2;
            else p = -0.15;
            b.prog.value = p;
            b.m.rotation.set(0.35, tt * 0.6 + i, 0);
            b.m.position.y = Math.sin(tt * 1.5 + i) * 0.08;
            if (i === 0) state = ph < 0.44 ? '사라지는 중' : ph < 0.94 ? '나타나는 중' : '그대로';
          });
          if (state !== lastLabel) {
            lastLabel = state;
            B.setLabels([state]);
          }
        },
        controls: [
          { type: 'range', label: '빛 테두리 폭', min: 0, max: 0.2, step: 0.01, value: 0.07, on: (v) => { uEdge.value = v; } },
          { type: 'range', label: '잡음 크기', min: 0.8, max: 6, step: 0.1, value: 2.6, on: (v) => { uScale.value = v; } },
          { type: 'range', label: '빠르기', min: 0.2, max: 2.5, step: 0.1, value: 1, on: (v) => { speed = v; } },
        ],
      });
    },
  },

  /* 정점 흔들기 */
  i13: {
    kind: '3d',
    caption: '왼쪽 멈춘 깃발 · 나무 — 오른쪽은 셰이더가 정점을 밀어 바람에 일렁여요',
    make() {
      const B = base({ bg: gradBg('#7ec8f5', '#dff3ff'), labels: ['그대로', '바람 셰이더'], fit: [2.5, 1.05], target: [0, 0.35, 0], dir: [0, 0.18, 1] });
      lights(B.scene, 0xffffff, 0x7a9a60, 1.0, 1.7);
      const uTime = { value: 0 };
      const uWind = { value: 1 };
      const uSpeed = { value: 1 };
      // 깃발 그림
      const [c, g] = cv(256, 160);
      g.fillStyle = '#ff5a6a';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 60, 256, 40);
      g.fillStyle = '#2a4aa8';
      g.beginPath();
      g.arc(110, 80, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `900 64px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('7', 110, 84);
      const flagT = tex(c);
      const flagG = new THREE.PlaneGeometry(1.3, 0.8, 30, 12);
      flagG.translate(0.65, 0, 0);
      const flagA = new THREE.MeshStandardMaterial({ map: flagT, side: THREE.DoubleSide, roughness: 0.8 });
      const flagB = flagA.clone();
      flagB.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uTime, uWind, uSpeed });
        sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uSpeed;\n' + sh.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
            float fx = position.x;
            float amp = 0.17 * uWind * (fx / 1.3);
            float ph = fx * 5.0 - uTime * 5.0 * uSpeed + position.y * 1.5;
            float dzdx = 0.17 * uWind / 1.3 * sin(ph) + amp * 5.0 * cos(ph);
            objectNormal = normalize(vec3(-dzdx, -amp * 1.5 * cos(ph), 1.0));`,
          )
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            transformed.z += amp * sin(ph);
            transformed.y += -0.04 * uWind * (fx / 1.3) * (fx / 1.3) + 0.02 * uWind * sin(ph * 0.5) * (fx / 1.3);`,
          );
      };
      const leafA = new THREE.MeshStandardMaterial({ color: 0x3aa860, roughness: 0.7, flatShading: true });
      const leafB = leafA.clone();
      leafB.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uTime, uWind, uSpeed });
        sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uSpeed;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wq = modelMatrix * vec4(position, 1.0);
          float hh = clamp((wq.y + 0.5) / 1.6, 0.0, 1.5);
          float sway = sin(uTime * 1.8 * uSpeed + wq.x * 0.8) * 0.5 + sin(uTime * 3.7 * uSpeed + wq.y * 3.0) * 0.18;
          transformed.x += sway * 0.22 * uWind * hh * hh;
          transformed.z += cos(uTime * 1.3 * uSpeed) * 0.06 * uWind * hh * hh;`,
        );
      };
      const poleM = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.3, metalness: 0.5 });
      const trunkM = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 });
      const groundM = new THREE.MeshStandardMaterial({ color: 0x6cc05a, roughness: 1 });
      const poleG = new THREE.CylinderGeometry(0.03, 0.035, 2.0, 12);
      const knobG = new THREE.SphereGeometry(0.06, 12, 8);
      const coneG = [new THREE.ConeGeometry(0.5, 0.6, 7), new THREE.ConeGeometry(0.4, 0.5, 7), new THREE.ConeGeometry(0.28, 0.42, 7)];
      const trunkG = new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8);
      const groundG = new THREE.CylinderGeometry(1.15, 1.15, 0.1, 40);
      const set = (fm: THREE.Material, lm: THREE.Material): THREE.Group => {
        const gr = new THREE.Group();
        const ground = new THREE.Mesh(groundG, groundM);
        ground.position.y = -0.55;
        ground.scale.z = 0.5;
        const pole = new THREE.Mesh(poleG, poleM);
        pole.position.set(-0.75, 0.45, 0);
        const knob = new THREE.Mesh(knobG, poleM);
        knob.position.set(-0.75, 1.47, 0);
        const flag = new THREE.Mesh(flagG, fm);
        flag.position.set(-0.73, 1.0, 0);
        const trunk = new THREE.Mesh(trunkG, trunkM);
        trunk.position.set(0.6, -0.3, 0.1);
        gr.add(ground, pole, knob, flag, trunk);
        coneG.forEach((cg, k) => {
          const cone = new THREE.Mesh(cg, lm);
          cone.position.set(0.6, 0.1 + k * 0.33, 0.1);
          gr.add(cone);
        });
        return gr;
      };
      const L = set(flagA, leafA);
      const R = set(flagB, leafB);
      L.position.x = -1.2;
      R.position.x = 1.25;
      B.scene.add(L, R);
      return B.done({
        update(t) {
          uTime.value = t;
        },
        controls: [
          { type: 'range', label: '바람 세기', min: 0, max: 2, step: 0.05, value: 1, on: (v) => { uWind.value = v; } },
          { type: 'range', label: '일렁임 빠르기', min: 0.2, max: 3, step: 0.1, value: 1, on: (v) => { uSpeed.value = v; } },
        ],
      });
    },
  },
};


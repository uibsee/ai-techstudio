import { makeToonKit } from '@/game/core/toon';
import type { DemoMap } from './types';

/**
 * 기준 견본 셋 — 다른 견본 파일이 따라 할 본보기 (3D · 2D · DOM 한 개씩).
 *  u01 툰 셰이딩: 같은 물체를 왼쪽 일반 재질 / 오른쪽 툰으로 나란히 (화면 반씩 scissor) — 「무엇이 달라지는지」 한눈에
 */
export const DEMOS: DemoMap = {
  u01: {
    kind: '3d',
    caption: '왼쪽 일반 재질 · 오른쪽 툰 — 명암이 3단 계단으로 끊겨요',
    make(T) {
      const mk = (): { scene: InstanceType<typeof T.Scene>; root: InstanceType<typeof T.Group> } => {
        const scene = new T.Scene();
        scene.background = new T.Color(0x9ad0f0);
        scene.add(new T.HemisphereLight(0xffffff, 0x8aa86a, 0.9));
        const sun = new T.DirectionalLight(0xfff0d6, 1.6);
        sun.position.set(-3, 5, 4);
        scene.add(sun);
        const root = new T.Group();
        const ball = new T.Mesh(new T.SphereGeometry(0.9, 48, 32), new T.MeshStandardMaterial({ color: 0xe8453c, roughness: 0.5 }));
        const knot = new T.Mesh(new T.TorusKnotGeometry(0.42, 0.15, 120, 16), new T.MeshStandardMaterial({ color: 0x2ac0c8, roughness: 0.5 }));
        knot.position.set(0, -1.55, 0);
        knot.scale.setScalar(0.8);
        root.add(ball, knot);
        scene.add(root);
        return { scene, root };
      };
      const A = mk();
      const B = mk();
      const kit = makeToonKit([75, 168, 255]);
      kit.toonify(B.root, { outline: 0.035, minSize: 0.1 });
      const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(0, -0.3, 7);
      cam.lookAt(0, -0.45, 0);
      return {
        scene: A.scene,
        camera: cam,
        update(t) {
          for (const S of [A, B]) S.root.rotation.y = t * 0.6;
        },
        render(r, w, hh) {
          // 반씩 나눠 같은 카메라로 두 장면
          cam.aspect = w / 2 / hh;
          cam.updateProjectionMatrix();
          r.setScissorTest(true);
          r.toneMapping = T.ACESFilmicToneMapping;
          r.setViewport(0, 0, w / 2, hh);
          r.setScissor(0, 0, w / 2, hh);
          r.render(A.scene, cam);
          r.toneMapping = T.NoToneMapping;
          r.setViewport(w / 2, 0, w / 2, hh);
          r.setScissor(w / 2, 0, w / 2, hh);
          r.render(B.scene, cam);
          r.setScissorTest(false);
          r.setViewport(0, 0, w, hh);
        },
        controls: [
          { type: 'range', label: '그늘 밝기', min: 0, max: 255, step: 1, value: 75, on: (v) => kit.setSteps([v, 168, 255]) },
          { type: 'range', label: '외곽선 굵기', min: 0, max: 0.1, step: 0.005, value: 0.035, on: (v) => kit.setOutline(B.root, v) },
          { type: 'toggle', label: '오른쪽 툰 켜기', value: true, on: (v) => kit.setEnabled(B.root, v) },
        ],
        dispose() {
          kit.dispose();
          for (const S of [A, B])
            S.scene.traverse((o) => {
              const m = o as InstanceType<typeof T.Mesh>;
              if (m.isMesh && !o.userData['__ink']) {
                m.geometry.dispose();
              }
            });
        },
      };
    },
  },
};

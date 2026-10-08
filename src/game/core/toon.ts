import * as THREE from 'three';

/**
 * 툰 셰이딩(만화 그림체) 도구 — 이미 만든 Three.js 무대를 그대로 둔 채 그림체만 바꾼다.
 *
 * - `toonify(root)` : root 아래 MeshStandard/Physical/Lambert/Phong 재질을 MeshToonMaterial(3단 명암)로 바꾼다.
 *   색 · 무늬(map) · 빛남(emissive) · 투명도 · 면 방향은 그대로 옮긴다. 같은 재질은 한 번만 바꾼다(캐시).
 * - 외곽선이 없는 입체에는 검은 외곽선(뒷면만 그린 조금 큰 껍데기)을 붙인다. 얇은 판 · 아주 작은 조각 · 투명한 것은 건너뛴다.
 * - 툰은 톤 매핑 없이(renderer.toneMapping = NoToneMapping) 써야 색이 계단처럼 또렷하다 — 빛 세기는 무대에서 맞춘다.
 *
 * 숫자 야구(stage.ts)에서 쓴 방식을 다른 게임에도 쓰려고 뺀 것. 처음 적용: 빵빵 주차장 탈출.
 */

export interface ToonKit {
  /** 3단 명암 단계 텍스처 */
  readonly grad: THREE.DataTexture;
  /** 외곽선 재질 */
  readonly ink: THREE.MeshBasicMaterial;
  /** root 아래를 툰으로 — 새로 만든 재질 · 껍데기는 kit 이 들고 있다가 dispose 때 버린다 */
  toonify(root: THREE.Object3D, opts?: { outline?: number; minSize?: number }): void;
  /** 판을 새로 지을 때 — 앞 판에서 바꾼 재질을 버린다 (외곽선 · 명암 단계는 둔다) */
  reset(): void;
  /** 켜기/끄기 — 원래 재질 ↔ 툰 재질, 덧붙인 외곽선 보이기 (기술 스튜디오에서 비교용) */
  setEnabled(root: THREE.Object3D, on: boolean): void;
  /** 명암 단계 바꾸기 (같은 개수, 0 ~ 255) */
  setSteps(steps: number[]): void;
  /** 덧붙인 외곽선 굵기 바꾸기 */
  setOutline(root: THREE.Object3D, thick: number): void;
  dispose(): void;
}

const CONVERT = ['MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshLambertMaterial', 'MeshPhongMaterial'];

export function makeToonKit(steps: number[] = [95, 180, 255], inkColor = 0x1c1a2e): ToonKit {
  const grad = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  const ink = new THREE.MeshBasicMaterial({ color: inkColor, side: THREE.BackSide });
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const made: THREE.Material[] = [];

  const convert = (m: THREE.Material): THREE.Material => {
    if (!CONVERT.includes(m.type)) return m;
    let t = cache.get(m.uuid);
    if (t) return t;
    const s = m as THREE.MeshStandardMaterial;
    t = new THREE.MeshToonMaterial({
      color: s.color,
      map: s.map,
      gradientMap: grad,
      emissive: s.emissive,
      emissiveMap: s.emissiveMap,
      emissiveIntensity: s.emissiveIntensity,
      transparent: s.transparent,
      opacity: s.opacity,
      side: s.side,
      alphaTest: s.alphaTest,
      depthWrite: s.depthWrite,
      depthTest: s.depthTest,
      vertexColors: s.vertexColors,
      visible: s.visible,
    });
    t.name = s.name;
    cache.set(m.uuid, t);
    made.push(t);
    return t;
  };

  const hasInk = (o: THREE.Object3D): boolean => o.children.some((c) => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).material as THREE.Material)?.side === THREE.BackSide);

  return {
    grad,
    ink,
    toonify(root, opts = {}) {
      const thick = opts.outline ?? 0.022;
      const minSize = opts.minSize ?? 0.1;
      const meshes: THREE.Mesh[] = [];
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) meshes.push(o as THREE.Mesh);
      });
      const ws = new THREE.Vector3();
      const sz = new THREE.Vector3();
      for (const mesh of meshes) {
        const src = mesh.material;
        if (Array.isArray(src)) {
          mesh.material = src.map(convert);
          continue;
        }
        if (!src || src.side === THREE.BackSide || !src.visible) continue;
        const wasConvertible = CONVERT.includes(src.type);
        mesh.material = convert(src);
        if (wasConvertible) {
          mesh.userData['__orig'] = src;
          mesh.userData['__toon'] = mesh.material;
        }
        // 외곽선 — 입체이고 · 불투명하고 · 너무 작지 않고 · 아직 없을 때만
        if (!wasConvertible || src.transparent || hasInk(mesh) || mesh.userData['noInk']) continue;
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        g.boundingBox!.getSize(sz);
        mesh.getWorldScale(ws);
        const wx = sz.x * Math.abs(ws.x);
        const wy = sz.y * Math.abs(ws.y);
        const wz = sz.z * Math.abs(ws.z);
        const small = Math.min(wx, wy, wz);
        if (Math.max(wx, wy, wz) < minSize || small < 0.015) continue;
        const hull = new THREE.Mesh(g, ink);
        hull.scale.set(1 + (2 * thick) / Math.max(wx, 1e-3), 1 + (2 * thick) / Math.max(wy, 1e-3), 1 + (2 * thick) / Math.max(wz, 1e-3));
        hull.castShadow = false;
        hull.receiveShadow = false;
        hull.raycast = () => {};
        hull.name = '';
        hull.userData['__ink'] = [wx, wy, wz];
        mesh.add(hull);
      }
    },
    setEnabled(root, on) {
      root.traverse((o) => {
        const u = o.userData;
        if (u['__orig']) (o as THREE.Mesh).material = on ? u['__toon'] : u['__orig'];
        if (u['__ink']) o.visible = on;
      });
    },
    setSteps(steps) {
      (grad.image.data as Uint8Array).set(steps.slice(0, grad.image.width));
      grad.needsUpdate = true;
    },
    setOutline(root, thick) {
      root.traverse((o) => {
        const s = o.userData['__ink'] as number[] | undefined;
        if (s) o.scale.set(1 + (2 * thick) / Math.max(s[0]!, 1e-3), 1 + (2 * thick) / Math.max(s[1]!, 1e-3), 1 + (2 * thick) / Math.max(s[2]!, 1e-3));
      });
    },
    reset() {
      for (const m of made) m.dispose();
      made.length = 0;
      cache.clear();
    },
    dispose() {
      for (const m of made) m.dispose();
      made.length = 0;
      cache.clear();
      grad.dispose();
      ink.dispose();
    },
  };
}

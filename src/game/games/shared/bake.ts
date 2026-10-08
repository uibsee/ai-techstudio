import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 고정된 물체 합치기 — 화질은 그대로, 그리기 호출만 줄인다.
 *
 * root 아래에서 움직이지 않는 메시들을 「같은 재질 · 같은 그림자 설정 · 같은 꼭짓점 속성」끼리 한 메시로 합친다.
 * 모양 · 재질 · 위치가 그대로라 그림은 똑같고, three.js 가 물체마다 하는 일(행렬 갱신 · 화면 안 검사 · 재질 바꾸기 ·
 * 그리기 호출)이 합친 수만큼 준다. (2026-10-05 측정: 새 퍼즐 게임 대부분이 CPU 에서 물체 1,000 개 넘게 그리느라 느렸다)
 *
 * 건드리지 않는 것: 이름이 있는 물체와 그 아래(코드가 찾아서 움직인다) · userData 에 무엇이든 있는 것과 그 아래(dynamic · cell 등) ·
 * opts.skip 이 참인 것과 그 아래 · 인스턴스 · 뼈대 · 모프 · onBeforeRender 가 붙은 메시 ·
 * 직접 짠 셰이더 재질(물체 자기 좌표를 쓸 수 있다 — 세계 좌표만 쓰면 material.userData.mergeSafe) ·
 * 투명 재질(opts.transparent 를 켜면 합친다 — 바닥에 붙은 그늘 판처럼 서로 겹치지 않는 것만).
 * 여러 재질 메시(상자 윗면 · 옆면 따로)는 면 묶음마다 나눠서 합친다.
 * 합친 메시는 root 에 붙고(root 좌표 기준), 원래 메시는 빠진다. 원래 메시에 남은 자식은 세계 위치 그대로 윗단으로 옮긴다.
 *
 * keep: 새로 만든 기하를 판이 바뀔 때 버리도록 넘기는 함수.
 */
export function mergeStatic(
  root: THREE.Object3D,
  keep: (d: { dispose(): void }) => void,
  opts: { minGroup?: number; skip?: (o: THREE.Object3D) => boolean; transparent?: boolean; dedupe?: boolean } = {},
): { before: number; after: number } {
  const minGroup = opts.minGroup ?? 2;
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  interface Piece {
    m: THREE.Mesh;
    mat: THREE.Material;
    /** 여러 재질 메시의 면 묶음 (없으면 통째) */
    grp: { start: number; count: number } | null;
  }
  const groups = new Map<string, Piece[]>();
  const used = new Set<THREE.Mesh>();
  let before = 0;
  const attrKey = (g: THREE.BufferGeometry): string =>
    Object.keys(g.attributes)
      .sort()
      .map((k) => `${k}${g.attributes[k]!.itemSize}${(g.attributes[k] as THREE.BufferAttribute).normalized ? 'n' : ''}`)
      .join(',');
  // dedupe: 값이 똑같은 재질(따로 만들었을 뿐 색 · 거칠기 · 그림이 같은 것)은 한 재질로 본다 — 나중에 코드가 재질을 따로 바꾸지 않는 소품에만
  const canon = new Map<string, THREE.Material>();
  const same = (mat: THREE.Material): THREE.Material => {
    if (!opts.dedupe) return mat;
    const k = matSig(mat);
    const c = canon.get(k);
    if (c) return c;
    canon.set(k, mat);
    return mat;
  };
  const push = (m: THREE.Mesh, mat0: THREE.Material, grp: Piece['grp']): void => {
    const mat = same(mat0);
    const g = m.geometry;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.layers.mask}|${g.index ? 'i' : 'n'}|${attrKey(g)}|${m.frustumCulled ? 1 : 0}`;
    let arr = groups.get(key);
    if (!arr) groups.set(key, (arr = []));
    arr.push({ m, mat, grp });
  };
  const visit = (o: THREE.Object3D): void => {
    for (const c of o.children) {
      if (!c.visible) continue;
      // userData 에 무엇이든 적힌 물체는 코드가 따로 다룬다 (고르기 · 툰 원래 재질 · 외곽선 크기 등) — 건드리지 않는다
      if (Object.keys(c.userData).length || (opts.skip && opts.skip(c))) continue;
      if (c.name) continue; // 코드가 이름으로 찾는 물체
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        before++;
        if (ok(m, !!opts.transparent)) {
          if (Array.isArray(m.material)) {
            const gs = m.geometry.groups;
            if (m.geometry.index && gs.length) for (const gr of gs) push(m, m.material[gr.materialIndex ?? 0]!, { start: gr.start, count: gr.count });
          } else push(m, m.material, null);
        }
      }
      if (c.children.length) visit(c);
    }
  };
  visit(root);
  // 한 메시의 면 묶음이 일부만 합쳐지면 안 된다 — 여러 재질 메시는 모든 묶음이 합쳐질 때만
  const okMulti = (m: THREE.Mesh): boolean => {
    if (!Array.isArray(m.material)) return true;
    for (const arr of groups.values()) if (arr.length < minGroup && arr.some((p) => p.m === m)) return false;
    return true;
  };
  let added = 0;
  for (const arr0 of groups.values()) {
    const arr = arr0.filter((p) => p.m.matrixWorld.determinant() > 0 && okMulti(p.m));
    if (arr.length < minGroup) continue;
    const geos: THREE.BufferGeometry[] = [];
    for (const p of arr) {
      let g: THREE.BufferGeometry;
      if (p.grp) {
        g = new THREE.BufferGeometry();
        for (const k of Object.keys(p.m.geometry.attributes)) g.setAttribute(k, p.m.geometry.attributes[k]!.clone());
        const idx = p.m.geometry.index!;
        g.setIndex(new THREE.BufferAttribute((idx.array as Uint32Array | Uint16Array).slice(p.grp.start, p.grp.start + p.grp.count), 1));
      } else {
        g = p.m.geometry.clone();
        g.clearGroups(); // 재질이 하나라 면 묶음 표시(상자 · 원기둥 기본값)는 필요 없다
      }
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, p.m.matrixWorld));
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    keep(merged);
    const src = arr[0]!.m;
    const mesh = new THREE.Mesh(merged, arr[0]!.mat);
    mesh.castShadow = src.castShadow;
    mesh.receiveShadow = src.receiveShadow;
    mesh.renderOrder = src.renderOrder;
    mesh.layers.mask = src.layers.mask;
    mesh.frustumCulled = src.frustumCulled;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    added++;
    for (const p of arr) used.add(p.m);
  }
  for (const m of used) {
    const parent = m.parent;
    // 남은 자식(움직이는 깃발 등)은 세계 위치를 지킨 채 윗단으로 옮긴다 — 안 그러면 같이 빠진다
    if (parent) for (const c of [...m.children]) parent.attach(c);
    parent?.remove(m);
  }
  // 메시가 다 빠진 빈 묶음은 정리 (이름 · 표시가 있는 것은 남긴다)
  const prune = (o: THREE.Object3D): void => {
    for (const c of [...o.children]) {
      prune(c);
      if ((c.type === 'Group' || c.type === 'Object3D') && !c.children.length && !c.name && !Object.keys(c.userData).length) o.remove(c);
    }
  };
  prune(root);
  return { before, after: before - used.size + added };
}

function ok(m: THREE.Mesh, transparent: boolean): boolean {
  if ((m as unknown as THREE.InstancedMesh).isInstancedMesh || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return false;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mat of mats) {
    if (mat.transparent && !transparent) return false;
    // 직접 짠 셰이더는 물체 자기 좌표(position · uv)를 쓸 수 있어 합치면 무늬가 바뀐다 — 세계 좌표만 쓰는 것은 userData.mergeSafe
    if (!mat.userData['mergeSafe'] && ((mat as THREE.ShaderMaterial).isShaderMaterial || mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile)) return false;
  }
  if (m.geometry.morphAttributes && Object.keys(m.geometry.morphAttributes).length) return false;
  if (m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  return true;
}

/** 재질 값 지문 — 보이는 결과를 정하는 값만 */
function matSig(m: THREE.Material): string {
  const a = m as THREE.MeshPhysicalMaterial;
  const col = (c?: THREE.Color): string => (c ? c.getHexString() : '-');
  const tex = (t?: THREE.Texture | null): string => (t ? t.uuid : '-');
  return [
    m.type,
    col(a.color),
    col(a.emissive),
    a.emissiveIntensity,
    a.roughness,
    a.metalness,
    tex(a.map),
    tex(a.bumpMap),
    a.bumpScale,
    tex(a.normalMap),
    tex(a.roughnessMap),
    tex(a.emissiveMap),
    tex(a.alphaMap),
    a.envMapIntensity,
    a.clearcoat,
    a.clearcoatRoughness,
    a.sheen,
    col(a.sheenColor),
    a.sheenRoughness,
    a.transmission,
    a.iridescence,
    a.flatShading,
    m.side,
    m.vertexColors,
    m.transparent,
    m.opacity,
    m.depthWrite,
    m.blending,
    m.alphaTest,
  ].join('|');
}

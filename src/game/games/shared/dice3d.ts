import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * 주사위 게임이 함께 쓰는 3D 주사위 — 둥근 모서리의 상아색 주사위, 1의 눈만 크고 빨갛다.
 *
 * 눈 배치: +x 2, −x 5, +y 1, −y 6, +z 3, −z 4 (마주 보는 면의 합이 7).
 * DiceSet: 주사위 여럿을 만들고, 던지기(포물선으로 날아와 튀며 멈춤)·옮기기·강조를 맡는다.
 *
 * 쓰는 법:
 *   const dice = new DiceSet(scene, env, 6, 0.6);
 *   dice.roll([0, 2], [3, 5], [posA, posB], () => …);   // 0·2번 주사위를 굴려 3·5가 나오게
 *   dice.moveTo(1, pos, 0.3);                               // 1번 주사위를 옮긴다 (윗면 유지)
 *   dice.update(dt);                                        // 매 프레임
 */

export type DieStyle = 'ivory' | 'bone' | 'red';

function paintFace(v: number, style: DieStyle): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const base = style === 'red' ? '#c8322b' : style === 'bone' ? '#efe4cc' : '#f8f3e6';
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // 면 가장자리가 살짝 어둡게 (둥근 모서리 느낌)
  const v0 = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.72);
  v0.addColorStop(0, 'rgba(0,0,0,0)');
  v0.addColorStop(1, 'rgba(90,70,40,0.18)');
  x.fillStyle = v0;
  x.fillRect(0, 0, S, S);
  const pip = (px: number, py: number, r: number, col: string) => {
    // 파인 눈 — 아래쪽이 밝은 테
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath();
    x.arc(px + 1.5, py + 2.5, r + 1.5, 0, Math.PI * 2);
    x.fill();
    const g = x.createRadialGradient(px - r * 0.3, py - r * 0.35, 1, px, py, r);
    g.addColorStop(0, col === 'red' ? '#ff7a6a' : style === 'red' ? '#ffffff' : '#50505a');
    g.addColorStop(1, col === 'red' ? '#b01820' : style === 'red' ? '#e8e0d8' : '#15151b');
    x.fillStyle = g;
    x.beginPath();
    x.arc(px, py, r, 0, Math.PI * 2);
    x.fill();
  };
  const L = 64;
  const M = 128;
  const R = 192;
  const layout: Record<number, [number, number][]> = {
    1: [[M, M]],
    2: [
      [L, L],
      [R, R],
    ],
    3: [
      [L, L],
      [M, M],
      [R, R],
    ],
    4: [
      [L, L],
      [R, L],
      [L, R],
      [R, R],
    ],
    5: [
      [L, L],
      [R, L],
      [M, M],
      [L, R],
      [R, R],
    ],
    6: [
      [L, L],
      [R, L],
      [L, M],
      [R, M],
      [L, R],
      [R, R],
    ],
  };
  if (v === 1 && style !== 'red') pip(M, M, 42, 'red');
  else for (const [px, py] of layout[v]!) pip(px, py, 23, 'black');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 윗면에 v 가 오게 하는 회전 (yaw 는 무작위로 조금) */
export function faceUpQuat(v: number, yaw = (Math.random() - 0.5) * 0.9): THREE.Quaternion {
  const e = new THREE.Euler();
  if (v === 1) e.set(0, 0, 0);
  else if (v === 6) e.set(Math.PI, 0, 0);
  else if (v === 2) e.set(0, 0, Math.PI / 2);
  else if (v === 5) e.set(0, 0, -Math.PI / 2);
  else if (v === 3) e.set(-Math.PI / 2, 0, 0);
  else e.set(Math.PI / 2, 0, 0);
  const q = new THREE.Quaternion().setFromEuler(e);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

interface RollAnim {
  i: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  target: THREE.Quaternion;
  axis: THREE.Vector3;
  spin: number;
  t: number;
  dur: number;
}

interface MoveAnim {
  i: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  q0: THREE.Quaternion;
  q1: THREE.Quaternion;
  t: number;
  dur: number;
  hop: number;
}

export class DiceSet {
  readonly meshes: THREE.Mesh[] = [];
  readonly size: number;
  values: number[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private rolls: RollAnim[] = [];
  private moves: MoveAnim[] = [];
  private onRolled: (() => void) | null = null;
  private readonly glow: THREE.Mesh[] = [];
  private readonly glowMat: THREE.MeshBasicMaterial;
  private clock = 0;

  constructor(
    private readonly scene: THREE.Scene,
    env: THREE.Texture | null,
    count: number,
    size = 0.6,
    style: DieStyle = 'ivory',
  ) {
    this.size = size;
    const mats = [2, 5, 1, 6, 3, 4].map((v) => {
      const tex = paintFace(v, style);
      this.disposables.push(tex);
      const m = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, envMap: env, envMapIntensity: 0.5 });
      this.disposables.push(m);
      return m;
    });
    const geo = new RoundedBoxGeometry(size, size, size, 5, size * 0.17);
    this.disposables.push(geo);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.disposables.push(this.glowMat);
    const ringGeo = new THREE.RingGeometry(size * 0.86, size * 1.08, 40);
    this.disposables.push(ringGeo);
    for (let k = 0; k < count; k += 1) {
      const d = new THREE.Mesh(geo, mats);
      d.castShadow = true;
      d.receiveShadow = true;
      d.userData['die'] = k;
      scene.add(d);
      this.meshes.push(d);
      this.values.push(1);
      const g = new THREE.Mesh(ringGeo, this.glowMat.clone());
      g.rotation.x = -Math.PI / 2;
      g.visible = false;
      scene.add(g);
      this.glow.push(g);
    }
  }

  get busy(): boolean {
    return this.rolls.length > 0 || this.moves.length > 0;
  }

  /** 주사위 윗면을 곧바로 v 로 (애니메이션 없이) */
  set(i: number, v: number, pos: THREE.Vector3): void {
    this.values[i] = v;
    this.meshes[i]!.quaternion.copy(faceUpQuat(v));
    this.meshes[i]!.position.copy(pos);
  }

  /**
   * 굴리기 — which 주사위들이 from 쪽에서 던져져 to 자리에 멈추고, 윗면이 values 가 된다.
   * from 을 안 주면 각 자리 앞쪽 위에서 던진다.
   */
  roll(which: number[], values: number[], to: THREE.Vector3[], onDone: () => void, from?: THREE.Vector3): void {
    this.rolls = [];
    which.forEach((i, k) => {
      const d = this.meshes[i]!;
      d.visible = true;
      this.values[i] = values[k]!;
      const start = from ? from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.4)) : to[k]!.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.6, 2.2));
      d.position.copy(start);
      this.rolls.push({
        i,
        from: start,
        to: to[k]!.clone(),
        target: faceUpQuat(values[k]!),
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spin: 10 + Math.random() * 6,
        t: 0,
        dur: 0.8 + k * 0.05 + Math.random() * 0.1,
      });
    });
    this.onRolled = onDone;
    if (!which.length) {
      this.onRolled = null;
      onDone();
    }
  }

  /** 옮기기 — 윗면은 그대로, 살짝 들렸다 놓인다 */
  moveTo(i: number, to: THREE.Vector3, dur = 0.35, hop = 0.5, yaw?: number): void {
    const d = this.meshes[i]!;
    this.moves = this.moves.filter((m) => m.i !== i);
    this.moves.push({
      i,
      from: d.position.clone(),
      to: to.clone(),
      q0: d.quaternion.clone(),
      q1: yaw === undefined ? d.quaternion.clone() : faceUpQuat(this.values[i]!, yaw),
      t: 0,
      dur,
      hop,
    });
  }

  /** 강조 고리 (고른 주사위·맞은 주사위) */
  highlight(i: number, on: boolean, color = 0xffd23f): void {
    const g = this.glow[i]!;
    g.visible = on;
    (g.material as THREE.MeshBasicMaterial).color.setHex(color);
  }

  hideAll(): void {
    for (const m of this.meshes) m.visible = false;
    for (const g of this.glow) g.visible = false;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.rolls.length) {
      let done = true;
      for (const a of this.rolls) {
        a.t = Math.min(1, a.t + dt / a.dur);
        const t = a.t;
        const d = this.meshes[a.i]!;
        d.position.lerpVectors(a.from, a.to, 1 - (1 - t) ** 2);
        const hop = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) * 0.8 : t < 0.82 ? Math.sin(((t - 0.55) / 0.27) * Math.PI) * 0.25 : Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.06;
        d.position.y = a.to.y + hop + (1 - t) * Math.max(0, a.from.y - a.to.y) * (t < 0.55 ? 0.5 : 0);
        const left = (1 - t) ** 2 * a.spin;
        d.quaternion.copy(a.target).multiply(new THREE.Quaternion().setFromAxisAngle(a.axis, left));
        if (t < 1) done = false;
      }
      if (done) {
        this.rolls = [];
        const cb = this.onRolled;
        this.onRolled = null;
        cb?.();
      }
    }
    for (const m of this.moves) {
      m.t = Math.min(1, m.t + dt / m.dur);
      const k = m.t < 0.5 ? 2 * m.t * m.t : 1 - (-2 * m.t + 2) ** 2 / 2;
      const d = this.meshes[m.i]!;
      d.position.lerpVectors(m.from, m.to, k);
      d.position.y += Math.sin(m.t * Math.PI) * m.hop;
      d.quaternion.copy(m.q0).slerp(m.q1, k);
    }
    this.moves = this.moves.filter((m) => m.t < 1);
    const pulse = 0.55 + 0.35 * Math.sin(this.clock * 6);
    this.glow.forEach((g, i) => {
      if (!g.visible) return;
      const d = this.meshes[i]!;
      g.position.set(d.position.x, d.position.y - this.size / 2 + 0.01, d.position.z);
      (g.material as THREE.MeshBasicMaterial).opacity = pulse;
    });
  }

  /** 화면 좌표 → 주사위 번호 (없으면 -1) */
  pick(ray: THREE.Raycaster): number {
    const hits = ray.intersectObjects(this.meshes.filter((m) => m.visible), false);
    return hits.length ? (hits[0]!.object.userData['die'] as number) : -1;
  }

  dispose(): void {
    for (const m of this.meshes) this.scene.remove(m);
    for (const g of this.glow) {
      this.scene.remove(g);
      (g.material as THREE.Material).dispose();
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

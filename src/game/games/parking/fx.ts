import * as THREE from 'three';

/**
 * 주차장 탈출 연출 (3D) — 뭉게 연기 · 흙먼지 · 반짝 별 · 팔랑이는 색종이 · 바닥 충격파 고리 · 속도선 · 미등 빛꼬리 리본.
 * 기술 갤러리 u37(빛꼬리) · i65(꼬리 리본) 을 이 게임에 맞게. 무대가 매 프레임 update(dt) 를 부른다.
 */

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, s = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  draw(c.getContext('2d')!, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  s: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  t: number;
  grow: number;
  spin: number;
  a0: number;
}

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  t: number;
  life: number;
  sc: number;
}

interface Streak {
  m: THREE.Mesh;
  v: number;
  t: number;
  life: number;
}

/** 지나간 자리를 잇는 빛 리본 */
class Ribbon {
  readonly mesh: THREE.Mesh;
  private readonly pts: { p: THREE.Vector3; t: number }[] = [];
  private readonly geo = new THREE.BufferGeometry();
  private readonly max = 40;
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  live = true;
  constructor(
    color: number,
    private readonly width: number,
    private readonly fade: number,
  ) {
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('a', new THREE.BufferAttribute(this.alpha, 1));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { col: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col * (1.0 + vA), vA); }',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  push(p: THREE.Vector3, now: number): void {
    this.pts.unshift({ p: p.clone(), t: now });
    if (this.pts.length > this.max) this.pts.pop();
  }
  update(now: number): void {
    while (this.pts.length && now - this.pts[this.pts.length - 1]!.t > this.fade) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const q = this.pts[Math.min(i, n - 1)];
      if (!q) {
        this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0;
        continue;
      }
      const age = (now - q.t) / this.fade;
      const a = i < n ? Math.max(0, 1 - age) * (1 - i / this.max) : 0;
      const w = this.width * (0.35 + 0.65 * (1 - i / this.max));
      // 리본은 바닥과 나란히 — 옆(z)으로 폭
      this.pos.set([q.p.x, q.p.y, q.p.z - w / 2, q.p.x, q.p.y, q.p.z + w / 2], i * 6);
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = a;
    }
    (this.geo.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes['a'] as THREE.BufferAttribute).needsUpdate = true;
    if (n === 0 && !this.live) this.mesh.visible = false;
  }
  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class ParkFx {
  private readonly smokeT = canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    // 뭉게뭉게 — 둥근 덩이 여럿
    for (const [x, y, r] of [
      [0.5, 0.5, 0.42],
      [0.33, 0.42, 0.26],
      [0.66, 0.4, 0.26],
      [0.45, 0.66, 0.24],
      [0.64, 0.64, 0.22],
    ] as const) {
      const gg = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      gg.addColorStop(0, 'rgba(255,255,255,0.9)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gg;
      g.beginPath();
      g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
  });
  private readonly starT = canvasTex((g, s) => {
    const c = s / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.2, 'rgba(255,240,180,0.8)');
    gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? c * 0.18 : c * 0.98;
      if (i) g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      else g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  private readonly puffs: Puff[] = [];
  private readonly streaks: Streak[] = [];
  private readonly rings: { m: THREE.Mesh; t: number; life: number; to: number }[] = [];
  private readonly ribbons: Ribbon[] = [];
  /** 색종이 — 인스턴스 하나 */
  private readonly bits: Bit[] = [];
  private readonly conf: THREE.InstancedMesh;
  private readonly CAP = 420;
  private readonly tmp = new THREE.Object3D();
  private now = 0;

  constructor(private readonly scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(0.11, 0.065);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.1, emissive: 0x222222 });
    this.conf = new THREE.InstancedMesh(g, m, this.CAP);
    this.conf.frustumCulled = false;
    this.conf.count = 0;
    const pal = [0xff4a6a, 0xffd23a, 0x3ad0ff, 0x6ae05a, 0xc07aff, 0xffffff, 0xff8a2a];
    for (let i = 0; i < this.CAP; i++) this.conf.setColorAt(i, new THREE.Color(pal[i % pal.length]!));
    scene.add(this.conf);
  }

  private sprite(map: THREE.Texture, color: number, additive: boolean): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.renderOrder = 5;
    this.scene.add(s);
    return s;
  }

  /** 뭉게 연기 (배기 · 타이어) */
  smoke(at: THREE.Vector3, vel: THREE.Vector3, size = 0.45, color = 0xeef0f4, life = 1.1, alpha = 0.75): void {
    const s = this.sprite(this.smokeT, color, false);
    s.position.copy(at);
    s.scale.setScalar(size * 0.4);
    this.puffs.push({ s, v: vel.clone(), life: life * (0.8 + Math.random() * 0.4), t: 0, grow: size, spin: (Math.random() - 0.5) * 2, a0: alpha });
  }

  /** 흙먼지 — 바퀴 뒤로 낮게 */
  dust(at: THREE.Vector3, dir: number): void {
    for (let k = 0; k < 2; k++)
      this.smoke(at.clone().add(new THREE.Vector3(0, 0.05, (Math.random() - 0.5) * 0.2)), new THREE.Vector3(-dir * (0.6 + Math.random()), 0.4 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8), 0.5, 0xd8c8a8, 0.8, 0.6);
  }

  /** 반짝 별 터짐 */
  stars(at: THREE.Vector3, n = 22, color = 0xfff0a0): void {
    for (let i = 0; i < n; i++) {
      const s = this.sprite(this.starT, color, true);
      s.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const u = Math.random();
      const sp = 2 + Math.random() * 3.5;
      this.puffs.push({ s, v: new THREE.Vector3(Math.cos(a) * sp * (1 - u * 0.5), 1.5 + u * 4, Math.sin(a) * sp * (1 - u * 0.5)), life: 0.7 + Math.random() * 0.5, t: 0, grow: -(0.35 + Math.random() * 0.3), spin: (Math.random() - 0.5) * 8, a0: 1 });
    }
  }

  /** 색종이 — 위로 터져 팔랑팔랑 떨어진다 */
  confetti(at: THREE.Vector3, n = 160, up = 5.5): void {
    for (let i = 0; i < n && this.bits.length < this.CAP; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.bits.push({
        p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
        v: new THREE.Vector3(Math.cos(a) * sp, up * (0.6 + Math.random() * 0.6), Math.sin(a) * sp),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14),
        t: 0,
        life: 2.2 + Math.random() * 1.2,
        sc: 0.8 + Math.random() * 0.7,
      });
    }
  }

  /** 바닥 충격파 고리 */
  ring(at: THREE.Vector3, to = 3.2, color = 0xfff2b0): void {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 64), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(at);
    m.renderOrder = 4;
    this.scene.add(m);
    this.rings.push({ m, t: 0, life: 0.6, to });
  }

  /** 속도선 — 차 옆을 뒤로 스치는 흰 줄 */
  streak(at: THREE.Vector3, speed: number): void {
    const len = 0.6 + Math.random() * 0.9;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.025), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.copy(at);
    m.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    m.renderOrder = 5;
    this.scene.add(m);
    this.streaks.push({ m, v: -speed * (0.3 + Math.random() * 0.3), t: 0, life: 0.35 });
  }

  /** 빛꼬리 리본 하나 만들기 — trail(r, 점) 으로 이어 붙인다 */
  ribbon(color: number, width = 0.12, fade = 0.45): Ribbon {
    const r = new Ribbon(color, width, fade);
    this.scene.add(r.mesh);
    this.ribbons.push(r);
    return r;
  }
  trail(r: Ribbon, p: THREE.Vector3): void {
    r.push(p, this.now);
  }

  update(dt: number): void {
    this.now += dt;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const f = this.puffs[i]!;
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) {
        this.scene.remove(f.s);
        f.s.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      f.v.multiplyScalar(Math.pow(0.15, dt));
      if (f.grow < 0) f.v.y -= 6 * dt;
      f.s.position.addScaledVector(f.v, dt);
      const g = Math.abs(f.grow);
      f.s.scale.setScalar(f.grow > 0 ? g * (0.4 + k * 1.2) : g * (1 - k * 0.6) * (0.8 + Math.sin(f.t * 30) * 0.2));
      f.s.material.rotation += f.spin * dt;
      f.s.material.opacity = f.a0 * (f.grow > 0 ? Math.min(1, k * 6) * (1 - k) : 1 - k * k);
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i]!;
      s.t += dt;
      s.m.position.x += s.v * dt;
      (s.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - s.t / s.life);
      if (s.t >= s.life) {
        this.scene.remove(s.m);
        s.m.geometry.dispose();
        (s.m.material as THREE.Material).dispose();
        this.streaks.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.t += dt;
      const k = r.t / r.life;
      r.m.scale.setScalar(0.2 + (r.to - 0.2) * (1 - Math.pow(1 - k, 3)));
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (k >= 1) {
        this.scene.remove(r.m);
        r.m.geometry.dispose();
        (r.m.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const r = this.ribbons[i]!;
      r.update(this.now);
      if (!r.mesh.visible) {
        this.scene.remove(r.mesh);
        r.dispose();
        this.ribbons.splice(i, 1);
      }
    }
    // 색종이 — 공기 저항이 큰 종이: 빨리 느려지고 팔랑이며 천천히 내려옴
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]!;
      b.t += dt;
      if (b.t >= b.life || b.p.y < -0.2) {
        this.bits.splice(i, 1);
        continue;
      }
      b.v.multiplyScalar(Math.pow(0.25, dt));
      b.v.y -= 5 * dt;
      b.v.y = Math.max(b.v.y, -1.1);
      b.p.addScaledVector(b.v, dt);
      b.p.x += Math.sin(b.t * 6 + i) * 0.6 * dt;
      b.r.x += b.w.x * dt;
      b.r.y += b.w.y * dt;
      b.r.z += b.w.z * dt;
    }
    this.bits.forEach((b, i) => {
      this.tmp.position.copy(b.p);
      this.tmp.rotation.copy(b.r);
      this.tmp.scale.setScalar(b.sc * Math.min(1, (b.life - b.t) * 3));
      this.tmp.updateMatrix();
      this.conf.setMatrixAt(i, this.tmp.matrix);
    });
    this.conf.count = this.bits.length;
    this.conf.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const f of this.puffs) {
      this.scene.remove(f.s);
      f.s.material.dispose();
    }
    for (const s of this.streaks) {
      this.scene.remove(s.m);
      s.m.geometry.dispose();
      (s.m.material as THREE.Material).dispose();
    }
    for (const r of this.rings) {
      this.scene.remove(r.m);
      r.m.geometry.dispose();
      (r.m.material as THREE.Material).dispose();
    }
    for (const r of this.ribbons) {
      this.scene.remove(r.mesh);
      r.dispose();
    }
    this.scene.remove(this.conf);
    this.conf.geometry.dispose();
    (this.conf.material as THREE.Material).dispose();
    this.smokeT.dispose();
    this.starT.dispose();
  }
}

/** 만화 별 터짐 판 꼭짓점 (SVG polygon) */
export function burstPoints(n: number, outer: number, inner: number): string {
  const p: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? inner * (0.9 + ((i * 37) % 10) / 50) : outer * (0.92 + ((i * 53) % 10) / 60);
    p.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`);
  }
  return p.join(' ');
}

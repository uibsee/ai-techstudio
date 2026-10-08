import * as THREE from 'three';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * 공용 후처리 묶음 (가짜 동전 찾기에서 시작) — 기술 스튜디오 목록에서 고른 것. 게임마다 PostOpts 로 세기를 맞춘다.
 *  · i04 계단 줄이기: 후처리 화면에 다중 샘플(MSAA 4) — 금 테 · 사슬 · 동전 테가 매끈
 *  · i02 구석 그늘(GTAO): 동전 더미 틈 · 저울 받침 · 탁자 테에 접촉 그늘 → 입체감
 *  · u20 빛 번짐: 금 반짝만 살짝
 *  · i01 피사계 심도: 초점은 저울 · 동전, 먼 용 · 보물은 부드럽게 흐림
 *  · i07 색 보정: 따뜻한 금빛 · 대비 · 가장자리 어둡게(비네트)
 * 폰처럼 작은 화면에서는 구석 그늘 · 심도를 끈다(무게).
 */
export interface Post {
  composer: EffectComposer;
  setSize(w: number, h: number, pr: number): void;
  setFocus(dist: number): void;
  dispose(): void;
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.55 }, uWarm: { value: 0.06 }, uCon: { value: 1.08 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `uniform sampler2D tDiffuse; uniform float uVig; uniform float uWarm; uniform float uCon; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // 대비 · 따뜻한 금빛 (밝은 곳은 노랗게, 어두운 곳은 붉은 밤색)
      col = (col - 0.5) * uCon + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col += vec3(uWarm, uWarm * 0.45, -uWarm * 0.6) * smoothstep(0.35, 0.9, l);
      col += vec3(uWarm * 0.4, 0.0, -uWarm * 0.2) * (1.0 - smoothstep(0.0, 0.35, l));
      // 비네트
      vec2 d = vUv - 0.5;
      d.x *= 1.25;
      float v = 1.0 - smoothstep(0.35, 0.85, length(d)) * uVig;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0) * v, c.a);
    }`,
};

export interface PostOpts {
  /** 빛 번짐 [세기, 반경, 문턱] */
  bloom?: [number, number, number];
  /** 구석 그늘 — null 이면 끔 */
  ao?: { radius: number; scale: number; blend: number } | null;
  /** 피사계 심도 — null 이면 끔 */
  dof?: { aperture: number; maxblur: number } | null;
  /** 색 보정 */
  grade?: { vig: number; warm: number; con: number };
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, o: PostOpts = {}): Post {
  const aoO = o.ao === undefined ? { radius: 0.35, scale: 1.2, blend: 0.85 } : o.ao;
  const dofO = o.dof === undefined ? { aperture: 0.0007, maxblur: 0.005 } : o.dof;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.updateGtaoMaterial({ radius: aoO?.radius ?? 0.35, distanceExponent: 1.5, thickness: 1, scale: aoO?.scale ?? 1, samples: 32 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 10, rings: 2, samples: 24 });
  gtao.blendIntensity = aoO?.blend ?? 0.85;
  composer.addPass(gtao);
  const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: dofO?.aperture ?? 0.0007, maxblur: dofO?.maxblur ?? 0.005 });
  composer.addPass(bokeh);
  const bl = o.bloom ?? [0.4, 0.35, 0.97];
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), bl[0], bl[1], bl[2]));
  composer.addPass(new OutputPass());
  // 깊이 · 법선을 다시 그리는 패스에서는 반투명 · 빛 효과(투명 표시, 불꽃 판, 빛무리)를 숨긴다 — 안 그러면 검은 네모가 생긴다
  const solidOnly = (pass: { render: (...a: never[]) => void }): void => {
    const orig = pass.render.bind(pass);
    pass.render = ((...args: never[]) => {
      const hidden: THREE.Object3D[] = [];
      scene.traverseVisible((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        const tr = o instanceof THREE.Sprite || o instanceof THREE.Points || (m && !Array.isArray(m) && (m.transparent || m.blending === THREE.AdditiveBlending));
        if (tr) hidden.push(o);
      });
      for (const o of hidden) o.visible = false;
      // 그림자 지도는 앞 RenderPass 가 이번 프레임에 이미 만들었다 — 깊이 · 법선을 다시 그릴 때 또 만들지 않는다 (화면 같음)
      const sm = renderer.shadowMap;
      const auto = sm.autoUpdate;
      sm.autoUpdate = false;
      orig(...args);
      sm.autoUpdate = auto;
      for (const o of hidden) o.visible = true;
    }) as typeof pass.render;
  };
  solidOnly(gtao as unknown as { render: (...a: never[]) => void });
  solidOnly(bokeh as unknown as { render: (...a: never[]) => void });
  const grade = new ShaderPass(GRADE);
  if (o.grade) {
    grade.uniforms['uVig']!.value = o.grade.vig;
    grade.uniforms['uWarm']!.value = o.grade.warm;
    grade.uniforms['uCon']!.value = o.grade.con;
  }
  composer.addPass(grade);
  return {
    composer,
    setSize(w: number, h: number, pr: number): void {
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      const small = Math.min(w, h) < 500;
      gtao.enabled = !small && !!aoO;
      bokeh.enabled = !small && !!dofO;
    },
    setFocus(dist: number): void {
      (bokeh.uniforms as Record<string, { value: number }>)['focus']!.value = dist;
    },
    dispose(): void {
      composer.dispose();
      rt.dispose();
      gtao.dispose();
      bokeh.dispose();
    },
  };
}

/**
 * 저울에 내리꽂는 빛기둥 — 원뿔 껍데기에 위에서 아래로 옅어지는 빛, 가장자리일수록 옅게(프레넬 반대),
 * 그 안에 천천히 떠도는 먼지.
 */
export function lightShaft(from: THREE.Vector3, to: THREE.Vector3, radius: number, keep: (d: { dispose(): void }) => void, dustTex: THREE.Texture): { group: THREE.Group; update(t: number): void } {
  const g = new THREE.Group();
  const len = from.distanceTo(to);
  const geo = new THREE.CylinderGeometry(0.08, radius, len, 48, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = abs(dot(vN, vV));
        float core = pow(facing, 2.5);
        float fall = smoothstep(0.0, 0.85, vY) * (0.35 + 0.65 * vY);
        float flick = 0.92 + 0.08 * sin(uTime * 1.7);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * core * fall * 0.11 * flick, 1.0);
      }`,
  });
  keep(geo);
  keep(mat);
  const cone = new THREE.Mesh(geo, mat);
  cone.position.copy(from);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  cone.renderOrder = 6;
  g.add(cone);
  const N = 70;
  const base = new Float32Array(N * 3);
  const pos = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const u = Math.random();
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius * (0.15 + u * 0.75);
    const p = from.clone().lerp(to, u);
    base.set([p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r], k * 3);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ map: dustTex, color: 0xffe0b0, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  keep(pg);
  keep(pm);
  g.add(new THREE.Points(pg, pm));
  return {
    group: g,
    update(t: number): void {
      mat.uniforms['uTime']!.value = t;
      for (let k = 0; k < N; k++) {
        pos[k * 3] = base[k * 3]! + Math.sin(t * 0.3 + k) * 0.12;
        pos[k * 3 + 1] = base[k * 3 + 1]! + Math.sin(t * 0.22 + k * 1.7) * 0.25;
        pos[k * 3 + 2] = base[k * 3 + 2]! + Math.cos(t * 0.27 + k) * 0.12;
      }
      (pg.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}

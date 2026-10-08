/* 스냅샷 — 원본은 src/game/games/rivercross/water.ts (강 건너기, 아직 저장소에 커밋되지 않아 스튜디오가 타입 검사에서 깨지지 않게 복사해 둠). 원본이 바뀌어도 여기는 그대로. */
import * as THREE from 'three';

/**
 * 흐르는 강물 — 셰이더로 그리는 진짜 물.
 *  · 물결: 겹친 잡음 높이를 흐름 방향(+z)으로 흘려 보내고, 높이의 기울기로 면 방향(법선)을 만든다
 *  · 빛: 프레넬(비스듬할수록 하늘이 비침) · 하늘 반사 · 햇빛 반짝임 · 기슭은 얕아서 투명하고 밝게, 가운데는 깊고 짙게
 *  · 거품: 양쪽 기슭과 배 둘레에 흐르는 흰 거품
 * 강바닥은 자갈 위로 일렁이는 빛무늬(코스틱)가 지나간다.
 */

const NOISE = /* glsl */ `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int k = 0; k < 4; k++){ v += noise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
`;

export interface Water {
  surface: THREE.Mesh;
  bed: THREE.Mesh;
  update(t: number, boatX: number): void;
  dispose(): void;
}

export function createWater(halfW: number, halfL: number, surfaceY: number, bedY: number, bedTex: THREE.Texture): Water {
  const surfGeo = new THREE.PlaneGeometry(halfW * 2, halfL * 2, 48, 96);
  surfGeo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uHalfW: { value: halfW },
    uBoat: { value: new THREE.Vector2(0, 0) },
    uBoatLen: { value: 1.6 },
  };
  const surfMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec2 vXZ;
      void main(){
        vec3 p = position;
        p.y += sin(p.z * 2.6 - uTime * 2.2) * 0.006 + sin(p.x * 4.0 + p.z * 1.3 + uTime * 1.4) * 0.004;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        vXZ = position.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHalfW;
      uniform vec2 uBoat;
      uniform float uBoatLen;
      varying vec3 vWorld;
      varying vec2 vXZ;
      ${NOISE}
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      float height(vec2 p){
        float a = fbm(p * 1.5 + vec2(0.0, -uTime * 0.55));
        float b = fbm(p * 3.4 + vec2(2.0, -uTime * 1.05));
        float c = noise(p * 9.0 + vec2(0.0, -uTime * 2.0));
        return a * 0.6 + b * 0.32 + c * 0.08;
      }
      void main(){
        vec2 p = vXZ;
        float e = 0.02;
        float h = height(p);
        float hx = height(p + vec2(e, 0.0)) - h;
        float hz = height(p + vec2(0.0, e)) - h;
        vec3 N = normalize(vec3(-hx / e * 0.09, 1.0, -hz / e * 0.09));
        vec3 V = normalize(cameraPosition - vWorld);
        float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // 깊이 — 기슭(양 끝)은 얕고 가운데는 깊다
        float edge = 1.0 - abs(p.x) / uHalfW;
        float deep = smoothstep(0.0, 0.7, edge) * 0.9;
        vec3 shallow = lin(vec3(0.52, 0.86, 0.84));
        vec3 deepC = lin(vec3(0.16, 0.55, 0.74));
        vec3 base = mix(shallow, deepC, deep);
        // 하늘 반사
        vec3 R = reflect(-V, N);
        vec3 sky = mix(lin(vec3(0.86, 0.93, 0.98)), lin(vec3(0.45, 0.68, 0.95)), clamp(R.y * 1.2, 0.0, 1.0));
        vec3 col = mix(base, sky, clamp(F * 1.1, 0.0, 0.85));
        // 햇빛 반짝임
        vec3 L = normalize(vec3(-0.45, 0.8, 0.4));
        float spec = pow(max(dot(R, L), 0.0), 140.0) * 2.2 + pow(max(dot(R, L), 0.0), 18.0) * 0.12;
        col += vec3(1.0, 0.97, 0.9) * spec;
        // 거품 — 기슭 · 흐르는 줄 · 배 둘레
        float shore = 1.0 - smoothstep(0.0, 0.1, edge);
        float fn = fbm(p * 7.0 + vec2(0.0, -uTime * 1.6));
        float foam = shore * smoothstep(0.38, 0.62, fn + shore * 0.25);
        float streak = smoothstep(0.7, 0.78, fbm(vec2(p.x * 4.0, p.y * 0.7 - uTime * 0.9))) * smoothstep(0.66, 0.74, fbm(vec2(p.x * 9.0 + 3.0, p.y * 2.0 - uTime * 1.3))) * 0.45;
        vec2 bq = (p - uBoat) / vec2(0.55, uBoatLen * 0.55);
        float bd = length(bq);
        float ring = (1.0 - smoothstep(0.98, 1.12, bd)) * smoothstep(0.86, 0.98, bd) * smoothstep(0.45, 0.7, fbm(p * 14.0 + uTime * 2.0));
        foam = max(foam, max(streak, ring * 0.75));
        col = mix(col, lin(vec3(0.97, 0.99, 1.0)), foam);
        float alpha = mix(0.45, 0.86, deep) + F * 0.3 + foam * 0.4;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.position.y = surfaceY;
  surface.renderOrder = 2;

  const bedGeo = new THREE.PlaneGeometry(halfW * 2, halfL * 2, 1, 1);
  bedGeo.rotateX(-Math.PI / 2);
  const bedUniforms = { uTime: uniforms.uTime, uMap: { value: bedTex }, uHalfW: { value: halfW } };
  const bedMat = new THREE.ShaderMaterial({
    uniforms: bedUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec2 vXZ;
      void main(){ vUv = uv; vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform sampler2D uMap; uniform float uHalfW;
      varying vec2 vUv; varying vec2 vXZ;
      ${NOISE}
      void main(){
        vec3 c = texture2D(uMap, vUv * vec2(1.0, 3.0)).rgb;
        // 코스틱 — 일렁이는 빛 그물
        vec2 p = vXZ * 2.2;
        float a = abs(sin((fbm(p + vec2(uTime * 0.25, -uTime * 0.5)) - 0.5) * 18.0));
        float b = abs(sin((fbm(p * 1.3 + vec2(-uTime * 0.2, -uTime * 0.6) + 3.1) - 0.5) * 18.0));
        float caustic = pow(1.0 - min(a, b), 6.0);
        float edge = 1.0 - abs(vXZ.x) / uHalfW;
        float depthDark = mix(1.0, 0.55, smoothstep(0.0, 0.6, edge));
        vec3 col = c * depthDark * vec3(0.78, 0.92, 0.95) + vec3(0.9, 0.97, 1.0) * caustic * 0.35 * (1.0 - edge * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.position.y = bedY;
  bed.receiveShadow = true;

  return {
    surface,
    bed,
    update(t: number, boatX: number): void {
      uniforms.uTime.value = t;
      uniforms.uBoat.value.set(boatX, 0);
    },
    dispose(): void {
      surfGeo.dispose();
      surfMat.dispose();
      bedGeo.dispose();
      bedMat.dispose();
    },
  };
}

/** 강바닥 자갈 무늬 (sRGB 캔버스 — 셰이더가 그대로 읽는다) */
export function pebbleCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8a888';
  g.fillRect(0, 0, 512, 512);
  let s = 77;
  const r = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 700; k++) {
    const x = r() * 512;
    const y = r() * 512;
    const rr = 4 + r() * 14;
    const col = ['#9a8a6a', '#c8b898', '#8a7a5e', '#d8c8a8', '#7a8a7a', '#a89878'][Math.floor(r() * 6)]!;
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rr, rr * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.ellipse(x - rr * 0.3, y - rr * 0.3, rr * 0.4, rr * 0.25, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

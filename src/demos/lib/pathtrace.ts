import * as THREE from 'three';

/**
 * 경로 추적 견본 공용 (i545 ~ i547, 2026-10-09) — 라이브러리 없이 셰이더 하나로 짠 작은 경로 추적기
 *  - 장면은 수식 도형(공 · 원기둥 · 돌린 상자 · 바닥)과 스튜디오 띠 조명(환경)뿐 — 메시 · BVH 없이 빛이 튀는 길만 보여 준다
 *  - 한 장면 = 픽셀마다 빛줄 하나(1 샘플). 반쪽 실수(HalfFloat) 렌더 타깃 둘을 핑퐁하며 평균을 쌓는다: mix(전, 새, 1/(n+1))
 *  - 재질 넷: 거친 면(코사인 반구) · 금속(반사 + 거칠기 흔들기) · 유리(슐릭 반사/굴절) · 니스(프레넬로 반사 아니면 거친 면)
 *  - 노이즈 제거: 법선 · 깊이 · 바탕색(첫 충돌) 길잡이 + 가장자리를 피하는 à-trous 필터 (Dammertz 2010)
 * 실제 작업은 three-gpu-pathtracer(메시 · BVH · 물리 재질) + oidn-web(AI 노이즈 제거)를 쓴다 — 견본은 원리를 눈으로.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const TRACE = /* glsl */ `
uniform sampler2D uPrev;
uniform float uN;
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTanHalf;
uniform float uAperture;
uniform float uFocus;
uniform int uBounces;
uniform float uSeed;
uniform float uTime;
uniform float uShutter;
uniform int uMode;
varying vec2 vUv;

const float EPS = 1e-3;
uint st;
uint pcg() {
  st = st * 747796405u + 2891336453u;
  uint w = ((st >> ((st >> 28u) + 4u)) ^ st) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd() { return float(pcg()) / 4294967296.0; }
vec3 cosDir(vec3 n) {
  float a = 6.2831853 * rnd(), u = rnd();
  vec3 t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0, 1, 0)) : cross(n, vec3(1, 0, 0)));
  vec3 b = cross(n, t);
  float r = sqrt(u);
  return normalize(t * cos(a) * r + b * sin(a) * r + n * sqrt(1.0 - u));
}
vec3 inSphere() {
  float z = rnd() * 2.0 - 1.0, a = 6.2831853 * rnd();
  float r = sqrt(1.0 - z * z);
  return vec3(r * cos(a), r * sin(a), z) * pow(rnd(), 1.0 / 3.0);
}

// ---------- 도형 ----------
bool sphere(vec3 ro, vec3 rd, vec3 c, float r, inout float t, out vec3 n) {
  vec3 o = ro - c;
  float b = dot(o, rd), q = dot(o, o) - r * r, d = b * b - q;
  if (d < 0.0) return false;
  d = sqrt(d);
  float tt = -b - d;
  if (tt < EPS) tt = -b + d;
  if (tt < EPS || tt >= t) return false;
  t = tt; n = (o + rd * tt) / r;
  return true;
}
bool cyl(vec3 ro, vec3 rd, vec3 c, float r, float h, inout float t, out vec3 n) {
  vec3 o = ro - c;
  bool hit = false;
  float a = dot(rd.xz, rd.xz), b = dot(o.xz, rd.xz), q = dot(o.xz, o.xz) - r * r;
  if (a > 1e-8) {
    float d = b * b - a * q;
    if (d >= 0.0) {
      float s = sqrt(d);
      for (int i = 0; i < 2; i++) {
        float tt = (-b + (i == 0 ? -s : s)) / a;
        float y = o.y + rd.y * tt;
        if (tt > EPS && tt < t && y > 0.0 && y < h) { t = tt; n = vec3(o.x + rd.x * tt, 0.0, o.z + rd.z * tt) / r; hit = true; break; }
      }
    }
  }
  if (abs(rd.y) > 1e-8) for (int i = 0; i < 2; i++) {
    float yy = i == 0 ? 0.0 : h;
    float tt = (yy - o.y) / rd.y;
    vec2 p = o.xz + rd.xz * tt;
    if (tt > EPS && tt < t && dot(p, p) < r * r) { t = tt; n = vec3(0.0, i == 0 ? -1.0 : 1.0, 0.0); hit = true; }
  }
  return hit;
}
bool box(vec3 ro, vec3 rd, vec3 c, vec3 hs, float ang, inout float t, out vec3 n) {
  float cs = cos(ang), sn = sin(ang);
  mat3 R = mat3(cs, 0.0, sn, 0.0, 1.0, 0.0, -sn, 0.0, cs);   // 세계 → 상자 (y축 돌림)
  vec3 o = R * (ro - c), d = R * rd;
  vec3 inv = 1.0 / d;
  vec3 t0 = (-hs - o) * inv, t1 = (hs - o) * inv;
  vec3 mn = min(t0, t1), mx = max(t0, t1);
  float tn = max(max(mn.x, mn.y), mn.z), tf = min(min(mx.x, mx.y), mx.z);
  if (tn > tf || tf < EPS) return false;
  float tt = tn > EPS ? tn : tf;
  if (tt >= t) return false;
  vec3 ln = tn > EPS ? -sign(d) * step(mn.yzx, mn) * step(mn.zxy, mn) : sign(d) * step(mx, mx.yzx) * step(mx, mx.zxy);
  t = tt; n = transpose(R) * ln;
  return true;
}

// 재질: 0 거친 면 · 1 금속 · 2 유리 · 3 니스(클리어코트)
struct Hit { float t; vec3 n; int mat; vec3 alb; float rough; };
float gTime;
vec3 ballPos() {
  // 영상 굽기 견본만 움직인다 (uTime 0 이면 제자리)
  float T = gTime;
  return vec3(-1.4 + 0.55 * sin(T * 2.2), 0.55 + 0.75 * abs(sin(T * 3.1416)), 0.3);
}
bool scene(vec3 ro, vec3 rd, out Hit h) {
  h.t = 1e9;
  vec3 n;
  bool any = false;
  // 바닥 y = 0 — 니스 칠한 바둑판
  if (rd.y < -1e-6) {
    float tt = -ro.y / rd.y;
    if (tt > EPS && tt < h.t) {
      vec3 p = ro + rd * tt;
      float ch = mod(floor(p.x * 2.0) + floor(p.z * 2.0), 2.0);
      // 멀수록 어둡게 — 스튜디오 바닥이 배경으로 녹아듦
      h.t = tt; h.n = vec3(0, 1, 0); h.mat = 3; h.rough = 0.0; any = true;
      h.alb = mix(vec3(0.24), vec3(0.13), ch) * (1.0 - 0.85 * smoothstep(3.0, 12.0, length(p.xz)));
    }
  }
  if (sphere(ro, rd, ballPos(), 0.55, h.t, n)) { h.n = n; h.mat = 1; h.alb = vec3(0.93); h.rough = 0.03; any = true; }
  if (sphere(ro, rd, vec3(0.05, 0.45, 1.2), 0.45, h.t, n)) { h.n = n; h.mat = 2; h.alb = vec3(0.96, 0.99, 1.0); h.rough = 0.0; any = true; }
  if (sphere(ro, rd, vec3(0.95, 0.22, 1.3), 0.22, h.t, n)) { h.n = n; h.mat = 0; h.alb = vec3(0.75, 0.1, 0.06); h.rough = 1.0; any = true; }
  if (cyl(ro, rd, vec3(1.3, 0.0, -0.1), 0.48, 1.0, h.t, n)) {
    float y = (ro + rd * h.t).y;
    // 깎은 홈 — 높이마다 거칠기를 번갈아 (선반으로 깎은 황동 느낌)
    h.n = n; h.mat = 1; h.alb = vec3(1.0, 0.76, 0.33); h.rough = abs(n.y) > 0.5 ? 0.12 : 0.06 + 0.22 * step(0.5, fract(y * 14.0)); any = true;
  }
  if (box(ro, rd, vec3(-0.15, 0.4, -0.95), vec3(0.6, 0.4, 0.4), 0.45, h.t, n)) { h.n = n; h.mat = 3; h.alb = vec3(0.05, 0.13, 0.33); h.rough = 0.0; any = true; }
  return any;
}

// 스튜디오: 어두운 남색 배경 + 네모난 띠 조명 둘 (금속에 비친 하이라이트가 네모)
float softbox(vec3 d, vec3 c, vec3 up, float a, float b) {
  c = normalize(c);
  vec3 u = normalize(cross(c, up)), v = cross(u, c);
  float k = dot(d, c);
  if (k <= 0.0) return 0.0;
  vec2 q = vec2(dot(d, u), dot(d, v)) / k;
  return step(abs(q.x), a) * step(abs(q.y), b);
}
vec3 dome(vec3 d) { return mix(vec3(0.006, 0.008, 0.012), vec3(0.05, 0.065, 0.095), smoothstep(-0.2, 1.0, d.y)); }
vec3 env(vec3 d) {
  vec3 c = dome(d);
  c += softbox(d, vec3(-0.5, 0.85, 0.45), vec3(0, 0, 1), 0.85, 0.42) * vec3(2.6, 2.5, 2.3);
  c += softbox(d, vec3(0.85, 0.6, -0.6), vec3(0, 1, 0), 0.14, 0.35) * vec3(1.3, 1.65, 2.1);
  return c;
}

vec3 trace(vec3 ro, vec3 rd) {
  vec3 thr = vec3(1.0), acc = vec3(0.0);
  for (int b = 0; b < 12; b++) {
    if (b > uBounces) break;
    Hit h;
    // 띠 조명은 카메라에 바로는 안 보이게 (사진 스튜디오처럼) — 반사 · 빛으로만
    if (!scene(ro, rd, h)) { acc += thr * (b == 0 ? dome(rd) : env(rd)); break; }
    vec3 p = ro + rd * h.t;
    bool inside = dot(rd, h.n) > 0.0;
    vec3 nf = inside ? -h.n : h.n;
    if (h.mat == 0) {
      rd = cosDir(nf); thr *= h.alb; ro = p + nf * EPS;
    } else if (h.mat == 1) {
      rd = normalize(reflect(rd, nf) + h.rough * inSphere());
      if (dot(rd, nf) <= 0.0) break;
      thr *= h.alb; ro = p + nf * EPS;
    } else if (h.mat == 2) {
      float eta = inside ? 1.5 : 1.0 / 1.5;
      float c = min(dot(-rd, nf), 1.0), s = sqrt(1.0 - c * c);
      float F = 0.04 + 0.96 * pow(1.0 - c, 5.0);
      if (eta * s > 1.0 || rnd() < F) { rd = reflect(rd, nf); ro = p + nf * EPS; }
      else { rd = refract(rd, nf, eta); ro = p - nf * EPS; thr *= h.alb; }
    } else {
      float c = max(dot(-rd, nf), 0.0);
      float F = 0.04 + 0.96 * pow(1.0 - c, 5.0);
      if (rnd() < F) rd = reflect(rd, nf);
      else { rd = cosDir(nf); thr *= h.alb; }
      ro = p + nf * EPS;
    }
    // 러시안 룰렛 — 어두워진 빛줄은 확률로 끝내고, 살아남으면 그만큼 키운다 (평균은 그대로)
    if (b >= 3) {
      float pr = clamp(max(thr.r, max(thr.g, thr.b)), 0.05, 1.0);
      if (rnd() > pr) break;
      thr /= pr;
    }
  }
  return acc;
}

void main() {
  st = uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(uSeed) * 26699u;
  st = st | 1u;
  pcg(); pcg();
  float aspect = uRes.x / uRes.y;
  vec2 jit = uMode == 0 ? vec2(rnd(), rnd()) : vec2(0.5);
  vec2 sc = (gl_FragCoord.xy + jit) / uRes * 2.0 - 1.0;
  vec3 dc = normalize(vec3(sc.x * aspect * uTanHalf, sc.y * uTanHalf, -1.0));
  // 셔터가 열린 동안의 아무 순간 — 빛줄마다 시간이 달라 움직이는 공이 저절로 번진다 (모션 블러)
  gTime = uTime + (uMode == 0 ? (rnd() - 0.5) * uShutter : 0.0);
  vec3 oc = vec3(0.0);
  if (uMode == 0 && uAperture > 0.0) {
    // 얇은 렌즈: 렌즈 원판의 아무 점에서 초점면의 같은 점으로 — 초점 밖은 흐려진다
    vec3 fp = dc * (uFocus / -dc.z);
    float a = 6.2831853 * rnd(), r = sqrt(rnd()) * uAperture;
    oc = vec3(cos(a) * r, sin(a) * r, 0.0);
    dc = normalize(fp - oc);
  }
  vec3 ro = uCamPos + uCamRot * oc, rd = uCamRot * dc;
  if (uMode == 1 || uMode == 2) {
    Hit h;
    bool ok = scene(ro, rd, h);
    if (uMode == 1) gl_FragColor = ok ? vec4(h.n, h.t) : vec4(0.0, 0.0, 0.0, 1000.0);
    else gl_FragColor = vec4(ok && h.mat != 2 ? h.alb : vec3(1.0), 1.0);
    return;
  }
  vec3 col = trace(ro, rd);
  // 반딧불 막기 — 아주 드문 밝은 빛줄 하나가 몇 백 장 동안 점으로 남지 않게
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  if (L > 12.0) col *= 12.0 / L;
  vec3 prev = texture2D(uPrev, vUv).rgb;
  gl_FragColor = vec4(uN < 0.5 ? col : mix(prev, col, 1.0 / (uN + 1.0)), 1.0);
}`;

const ATROUS = /* glsl */ `
uniform sampler2D uCol;
uniform sampler2D uNd;
uniform sampler2D uAlb;
uniform vec2 uTexel;
uniform float uStep;
uniform float uSigC;
uniform bool uGuide;
uniform int uDemod;
varying vec2 vUv;
vec3 fetch(vec2 uv) {
  vec3 c = texture2D(uCol, uv).rgb;
  if ((uDemod & 1) == 1) c /= max(texture2D(uAlb, uv).rgb, vec3(0.02));
  return c;
}
void main() {
  const float K[3] = float[3](0.375, 0.25, 0.0625);
  vec3 c0 = fetch(vUv);
  vec4 nd0 = texture2D(uNd, vUv);
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 uv = vUv + vec2(float(x), float(y)) * uStep * uTexel;
    vec3 c = fetch(uv);
    float w = K[abs(x)] * K[abs(y)];
    // 밝기 차이 — 톤을 눌러(L / (1 + L)) 비교해야 밝은 점 하나가 무게를 다 가져가지 않는다
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722)), l0 = dot(c0, vec3(0.2126, 0.7152, 0.0722));
    float dl = l / (1.0 + l) - l0 / (1.0 + l0);
    w *= exp(-dl * dl / (uSigC * uSigC));
    if (uGuide) {
      vec4 nd = texture2D(uNd, uv);
      // 아무것도 안 맞은 곳(법선 0)은 같은 「배경」끼리만
      bool m0 = dot(nd0.xyz, nd0.xyz) < 0.25, m = dot(nd.xyz, nd.xyz) < 0.25;
      w *= m0 || m ? float(m0 == m) : pow(max(dot(nd.xyz, nd0.xyz), 0.0), 32.0) * exp(-abs(nd.w - nd0.w) / (0.06 * uStep + 0.02));
    }
    sum += c * w; wsum += w;
  }
  vec3 o = sum / max(wsum, 1e-6);
  if ((uDemod & 2) == 2) o *= max(texture2D(uAlb, vUv).rgb, vec3(0.02));
  gl_FragColor = vec4(o, 1.0);
}`;

const SHOW = /* glsl */ `
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uSplit;
uniform int uView;
uniform vec2 uRes;
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  bool right = uSplit >= 0.0 && vUv.x > uSplit;
  vec4 s = right ? texture2D(uB, vUv) : texture2D(uA, vUv);
  vec3 c;
  if (uView == 1) c = s.xyz * 0.5 + 0.5;
  else if (uView == 2) c = pow(s.rgb, vec3(1.0 / 2.2));
  else if (uView == 3) c = s.rgb;
  else c = pow(aces(s.rgb * 1.1), vec3(1.0 / 2.2));
  if (uSplit >= 0.0 && abs(vUv.x - uSplit) * uRes.x < 1.5) c = vec3(1.0);
  gl_FragColor = vec4(c, 1.0);
}`;

const rt = (w: number, h: number, half = true): THREE.WebGLRenderTarget =>
  new THREE.WebGLRenderTarget(w, h, {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  });

/** 화면 가득 판 하나로 셰이더 돌리기 */
export class Quad {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  constructor() {
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  draw(r: THREE.WebGLRenderer, mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.mesh.material = mat;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
  }
  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

const shader = (frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });

/** 경로 추적기 — 핑퐁으로 샘플을 쌓는다. 카메라 · 값이 바뀌면 reset() */
export class PathTracer {
  /** 쌓은 샘플 수 (픽셀당) */
  n = 0;
  max = 1024;
  bounces = 5;
  aperture = 0;
  focus = 4.6;
  time = 0;
  shutter = 0;
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
  private a = rt(4, 4);
  private b = rt(4, 4);
  /** 법선(xyz) + 깊이(w) · 바탕색 — 노이즈 제거 길잡이 */
  readonly nd = rt(4, 4);
  readonly alb = rt(4, 4);
  private guidesOk = false;
  private seed = 1;
  private q = new Quad();
  private mat = shader(TRACE, {
    uPrev: { value: null },
    uN: { value: 0 },
    uRes: { value: new THREE.Vector2(4, 4) },
    uCamPos: { value: new THREE.Vector3() },
    uCamRot: { value: new THREE.Matrix3() },
    uTanHalf: { value: 0.3 },
    uAperture: { value: 0 },
    uFocus: { value: 4.6 },
    uBounces: { value: 5 },
    uSeed: { value: 1 },
    uTime: { value: 0 },
    uShutter: { value: 0 },
    uMode: { value: 0 },
  });
  w = 4;
  h = 4;

  setSize(w: number, h: number): void {
    w = Math.max(4, Math.round(w));
    h = Math.max(4, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (const t of [this.a, this.b, this.nd, this.alb]) t.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.reset();
  }
  reset(): void {
    this.n = 0;
    this.guidesOk = false;
  }
  get tex(): THREE.Texture {
    return this.a.texture;
  }
  get done(): boolean {
    return this.n >= this.max;
  }
  private uniforms(mode: number): void {
    const u = this.mat.uniforms;
    const c = this.camera;
    c.updateMatrixWorld();
    u.uRes!.value.set(this.w, this.h);
    u.uCamPos!.value.setFromMatrixPosition(c.matrixWorld);
    u.uCamRot!.value.setFromMatrix4(c.matrixWorld);
    u.uTanHalf!.value = Math.tan(THREE.MathUtils.degToRad(c.fov) / 2);
    u.uAperture!.value = this.aperture;
    u.uFocus!.value = this.focus;
    u.uBounces!.value = this.bounces;
    u.uTime!.value = this.time;
    u.uShutter!.value = this.shutter;
    u.uMode!.value = mode;
  }
  /** k 샘플 더 쌓기 (max 에서 멈춤) */
  sample(r: THREE.WebGLRenderer, k = 1): void {
    this.uniforms(0);
    const u = this.mat.uniforms;
    for (let i = 0; i < k && this.n < this.max; i++) {
      u.uPrev!.value = this.a.texture;
      u.uN!.value = this.n;
      u.uSeed!.value = this.seed = (this.seed * 1103515245 + 12345) % 2147483647;
      this.q.draw(r, this.mat, this.b);
      [this.a, this.b] = [this.b, this.a];
      this.n++;
    }
  }
  /** 길잡이(법선 · 깊이 · 바탕색) — 카메라가 그대로면 한 번만 */
  guides(r: THREE.WebGLRenderer): void {
    if (this.guidesOk) return;
    this.uniforms(1);
    this.q.draw(r, this.mat, this.nd);
    this.uniforms(2);
    this.q.draw(r, this.mat, this.alb);
    this.guidesOk = true;
  }
  /** 다른 견본이 가리킨 곳에서 초점 거리 (카메라 → 점) */
  focusAt(p: THREE.Vector3): void {
    this.camera.updateMatrixWorld();
    const v = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
    this.focus = Math.max(0.5, -v.z);
  }
  dispose(): void {
    for (const t of [this.a, this.b, this.nd, this.alb]) t.dispose();
    this.mat.dispose();
    this.q.dispose();
  }
}

/** à-trous 노이즈 제거 — 5×5 B3 스플라인 체를 1 · 2 · 4 · 8 · 16 칸 간격으로 거듭 */
export class Denoiser {
  iters = 5;
  sigma = 0.9;
  guide = true;
  demod = true;
  private a = rt(4, 4);
  private b = rt(4, 4);
  private q = new Quad();
  private mat = shader(ATROUS, {
    uCol: { value: null },
    uNd: { value: null },
    uAlb: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uStep: { value: 1 },
    uSigC: { value: 0.5 },
    uGuide: { value: true },
    uDemod: { value: 0 },
  });
  run(r: THREE.WebGLRenderer, pt: PathTracer): THREE.Texture {
    if (this.iters <= 0) return pt.tex;
    pt.guides(r);
    if (this.a.width !== pt.w || this.a.height !== pt.h) {
      this.a.setSize(pt.w, pt.h);
      this.b.setSize(pt.w, pt.h);
    }
    const u = this.mat.uniforms;
    u.uNd!.value = pt.nd.texture;
    u.uAlb!.value = pt.alb.texture;
    u.uTexel!.value.set(1 / pt.w, 1 / pt.h);
    u.uGuide!.value = this.guide;
    let src: THREE.Texture = pt.tex;
    for (let i = 0; i < this.iters; i++) {
      u.uCol!.value = src;
      u.uStep!.value = 1 << i;
      // 단계가 갈수록 색 기준을 좁힌다 — 처음엔 노이즈를 넓게 뭉개고 나중엔 진짜 경계를 지킨다
      u.uSigC!.value = this.sigma * Math.pow(0.5, i * 0.5);
      // 바탕색으로 나누기(1) — 첫 단계에서 무늬를 빼고 빛만 거른 뒤, 마지막 단계(2)에서 다시 곱한다
      u.uDemod!.value = this.demod ? (i === 0 ? 1 : 0) | (i === this.iters - 1 ? 2 : 0) : 0;
      const dst = i % 2 === 0 ? this.a : this.b;
      this.q.draw(r, this.mat, dst);
      src = dst.texture;
    }
    return src;
  }
  dispose(): void {
    this.a.dispose();
    this.b.dispose();
    this.mat.dispose();
    this.q.dispose();
  }
}

/** 화면에 내기 — ACES 톤 + 감마. split ≥ 0 이면 왼쪽 A · 오른쪽 B (가운데 흰 선) */
export class Show {
  private q = new Quad();
  private mat = shader(SHOW, {
    uA: { value: null },
    uB: { value: null },
    uSplit: { value: -1 },
    uView: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  });
  /** view: 0 톤 매핑 · 1 법선 · 2 선형 색 그대로(바탕색) · 3 이미 구운 그림 그대로 */
  draw(r: THREE.WebGLRenderer, a: THREE.Texture, opt: { b?: THREE.Texture; split?: number; view?: number; target?: THREE.WebGLRenderTarget | null; rect?: [number, number, number, number] } = {}): void {
    const u = this.mat.uniforms;
    u.uA!.value = a;
    u.uB!.value = opt.b ?? a;
    u.uSplit!.value = opt.split ?? -1;
    u.uView!.value = opt.view ?? 0;
    const target = opt.target ?? null;
    const rect = opt.rect;
    if (rect && !target) {
      u.uRes!.value.set(rect[2], rect[3]);
      r.setViewport(rect[0], rect[1], rect[2], rect[3]);
      r.setScissor(rect[0], rect[1], rect[2], rect[3]);
      r.setScissorTest(true);
    } else if (target) u.uRes!.value.set(target.width, target.height);
    else {
      const s = r.getSize(new THREE.Vector2());
      u.uRes!.value.set(s.x, s.y);
    }
    this.q.draw(r, this.mat, target);
    if (rect && !target) {
      const s = r.getSize(new THREE.Vector2());
      r.setScissorTest(false);
      r.setViewport(0, 0, s.x, s.y);
    }
  }
  dispose(): void {
    this.mat.dispose();
    this.q.dispose();
  }
}

/** 구운 그림 한 장 담을 작은 렌더 타깃 (8비트) */
export const ldrTarget = (w: number, h: number): THREE.WebGLRenderTarget => rt(w, h, false);

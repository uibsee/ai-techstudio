import type * as THREE from 'three';
import type { Demo2D, Demo3D, DemoDom, DemoMap } from './types';
import { F, clamp01, lerp, seg, inOut, outBack, hsh, speedCtl, stage } from './lib/stage';

/**
 * 모션 그래픽 견본 E (2026-10-10) — prompt-motion.com 분류에서 찾은 빈칸 둘째 묶음.
 *  i556 2D 입자 글자 (캔버스 2D) · i557 음악 반응 시각화 (캔버스 2D + 오프라인 분석)
 *  i558 사진 2.5D 시차 (three 셰이더 한 장) · i559 폰 틀 목업 (DOM, 공용 무대 lib/stage.ts)
 */

type G = CanvasRenderingContext2D;

// ═════════════════════ i556 2D 입자 글자 ═════════════════════

const WORDS556 = ['TECH', '스튜디오', 'GO!', '★'];

/** 글자를 숨은 캔버스에 그려 칠해진 픽셀 자리를 뽑는다 — 글자마다 간격을 맞춰 점 수가 늘 n 개 가까이 */
function sampleWord(word: string, w: number, h: number, n: number): number[] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  let size = h * 0.6;
  g.font = `900 ${size}px ${F}`;
  const tw = g.measureText(word).width;
  if (tw > w * 0.86) size *= (w * 0.86) / tw;
  g.font = `900 ${size}px ${F}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(word, w / 2, h * 0.47);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const on = (x: number, y: number): boolean => d[(Math.floor(y) * c.width + Math.floor(x)) * 4 + 3]! > 128;
  let area = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (on(x, y)) area++;
  const step = Math.max(1, Math.sqrt(area / n));
  const pts: number[] = [];
  for (let y = step / 2; y < c.height; y += step) for (let x = step / 2; x < c.width; x += step) if (on(x, y)) pts.push(x, y);
  return pts;
}

function particleText(): ReturnType<Demo2D['make']> {
  const o = { s: 1, k: 70, burst: true, n: 900, skip: 0 };
  let N = 0;
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let tx = new Float32Array(0);
  let ty = new Float32Array(0);
  let key = '';
  let words: number[][] = [];
  let cur = -1;
  let clock = 0;
  const HOLD = 2.6;

  const retarget = (wi: number, w: number, h: number, kick: boolean): void => {
    const pts = words[wi]!;
    const cnt = pts.length / 2;
    // 섞은 순서로 짝짓기 — 입자가 글자 사이를 소용돌이치며 건너간다
    const order = Array.from({ length: cnt }, (_, i) => i).sort((a, b) => hsh(a * 3.17 + wi * 11.3) - hsh(b * 3.17 + wi * 11.3));
    for (let i = 0; i < N; i++) {
      const j = order[i % cnt]!;
      tx[i] = pts[j * 2]!;
      ty[i] = pts[j * 2 + 1]!;
      if (kick) {
        const a = hsh(i * 1.7 + wi) * Math.PI * 2;
        const sp = (0.4 + hsh(i * 2.3 + wi * 5) * 0.8) * Math.min(w, h) * 3.2;
        vx[i]! += Math.cos(a) * sp;
        vy[i]! += Math.sin(a) * sp;
      }
    }
  };
  const init = (w: number, h: number): void => {
    N = o.n;
    words = WORDS556.map((s) => sampleWord(s, w, h, N));
    px = new Float32Array(N);
    py = new Float32Array(N);
    vx = new Float32Array(N);
    vy = new Float32Array(N);
    tx = new Float32Array(N);
    ty = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      px[i] = hsh(i * 9.1) * w;
      py[i] = hsh(i * 4.7) * h;
    }
    key = `${w}x${h}x${N}`;
    cur = -1;
  };

  return {
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      if (`${w}x${h}x${o.n}` !== key) init(w, h);
      const d = Math.min(dt, 1 / 30) * o.s;
      clock += d;
      const wi = (Math.floor(clock / HOLD) + o.skip) % WORDS556.length;
      if (wi !== cur) {
        retarget(wi, w, h, o.burst && cur >= 0);
        cur = wi;
      }
      // 스프링: a = k(목표 − 자리) − c·속도, c = 2√k · 0.55 (살짝 출렁)
      const k = o.k;
      const c = 2 * Math.sqrt(k) * 0.55;
      for (let i = 0; i < N; i++) {
        const wob = Math.sin(clock * 2 + i) * 0.5;
        vx[i]! += (k * (tx[i]! + wob - px[i]!) - c * vx[i]!) * d;
        vy[i]! += (k * (ty[i]! + wob - py[i]!) - c * vy[i]!) * d;
        px[i]! += vx[i]! * d;
        py[i]! += vy[i]! * d;
      }
      g.fillStyle = '#0b0f1a';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      const r = Math.max(1, Math.min(w, h) / 120);
      const hue0 = (clock * 25) % 360;
      for (let grp = 0; grp < 6; grp++) {
        g.fillStyle = `hsl(${(hue0 + grp * 22).toFixed(0)},90%,62%)`;
        for (let i = grp; i < N; i += 6) {
          const sp = Math.min(1, Math.hypot(vx[i]!, vy[i]!) / (w * 0.6));
          const rr = r * (1 + sp * 0.8);
          g.fillRect(px[i]! - rr, py[i]! - rr, rr * 2, rr * 2);
        }
      }
      g.globalCompositeOperation = 'source-over';
    },
    controls: [
      speedCtl(o),
      { type: 'range', label: '스프링 세기', min: 15, max: 220, step: 5, value: o.k, on: (v) => (o.k = v) },
      { type: 'range', label: '입자 수', min: 300, max: 2000, step: 100, value: o.n, on: (v) => (o.n = v) },
      { type: 'toggle', label: '흩어졌다 모이기', value: o.burst, on: (v) => (o.burst = v) },
      { type: 'button', label: '다음 글자', on: () => (o.skip += 1) },
    ],
  };
}

// ═════════════════════ i557 음악 반응 시각화 ═════════════════════

interface Spec557 {
  /** 프레임 × 띠 (0~1) */
  bands: Float32Array;
  frames: number;
  fps: number;
  dur: number;
  buf: AudioBuffer;
}
const NB = 32;
let SPEC557: Promise<Spec557> | null = null;

/** 4초 반복 음악을 오프라인으로 합성하고, 1/60초마다 32개 띠(40Hz~8kHz, 로그 간격) 세기를 미리 잰다 */
function spec557(): Promise<Spec557> {
  if (SPEC557) return SPEC557;
  SPEC557 = (async (): Promise<Spec557> => {
    const sr = 22050;
    const dur = 4;
    const oc = new OfflineAudioContext(1, sr * dur, sr);
    const out = oc.createGain();
    out.gain.value = 0.8;
    out.connect(oc.destination);
    const noise = oc.createBuffer(1, sr, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = hsh(i * 0.731) * 2 - 1;
    const st = 0.125; // 16분음표 (120 BPM)
    const env = (gn: GainNode, t: number, a: number, peak: number, rel: number): void => {
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(peak, t + a);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
    };
    const kick = (t: number): void => {
      const o = oc.createOscillator();
      const gn = oc.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      env(gn, t, 0.003, 1, 0.32);
      o.connect(gn).connect(out);
      o.start(t);
      o.stop(t + 0.4);
    };
    const hit = (t: number, type: BiquadFilterType, f: number, peak: number, rel: number): void => {
      const s = oc.createBufferSource();
      s.buffer = noise;
      const bq = oc.createBiquadFilter();
      bq.type = type;
      bq.frequency.value = f;
      const gn = oc.createGain();
      env(gn, t, 0.002, peak, rel);
      s.connect(bq).connect(gn).connect(out);
      s.start(t, hsh(t) * 0.5);
      s.stop(t + rel + 0.05);
    };
    const tone = (t: number, f: number, type: OscillatorType, peak: number, rel: number, lp = 0): void => {
      const o = oc.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gn = oc.createGain();
      env(gn, t, 0.01, peak, rel);
      if (lp) {
        const bq = oc.createBiquadFilter();
        bq.type = 'lowpass';
        bq.frequency.value = lp;
        o.connect(bq).connect(gn).connect(out);
      } else o.connect(gn).connect(out);
      o.start(t);
      o.stop(t + rel + 0.05);
    };
    const BASS = [55, 55, 43.65, 49]; // A · A · F · G
    const ARP = [440, 523.25, 659.25, 880, 659.25, 523.25];
    for (let s = 0; s < 32; s++) {
      const t = s * st;
      if ([0, 10, 16, 26].includes(s)) kick(t);
      if (s === 8 || s === 24) hit(t, 'bandpass', 1800, 0.7, 0.18);
      if (s % 2 === 1) hit(t, 'highpass', 7000, s % 4 === 3 ? 0.35 : 0.18, s % 8 === 7 ? 0.2 : 0.05);
      if (s % 4 === 0) tone(t, BASS[Math.floor(s / 8)]!, 'sawtooth', 0.35, 0.42, 320);
      if (s % 2 === 0 && s >= 4) tone(t, ARP[(s / 2) % ARP.length]! * (s >= 16 ? 1.5 : 1), 'triangle', 0.12, 0.2);
    }
    const buf = await oc.startRendering();
    const x = buf.getChannelData(0);
    // 프레임마다 창(1024, Hann) 을 씌워 띠마다 가까운 주파수 3개의 세기 평균 (괴르첼)
    const fps = 60;
    const frames = dur * fps;
    const W = 1024;
    const win = new Float32Array(W);
    for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
    const bands = new Float32Array(frames * NB);
    const fr = new Float32Array(W);
    for (let f = 0; f < frames; f++) {
      const c0 = Math.floor((f / fps) * sr) - W / 2;
      for (let i = 0; i < W; i++) fr[i] = x[(((c0 + i) % x.length) + x.length) % x.length]! * win[i]!;
      for (let b = 0; b < NB; b++) {
        const fc = 40 * Math.pow(8000 / 40, (b + 0.5) / NB);
        let sum = 0;
        for (const m of [0.92, 1, 1.08]) {
          const cf = 2 * Math.cos((2 * Math.PI * fc * m) / sr);
          let s1 = 0;
          let s2 = 0;
          for (let i = 0; i < W; i++) {
            const s0 = fr[i]! + cf * s1 - s2;
            s2 = s1;
            s1 = s0;
          }
          sum += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - cf * s1 * s2));
        }
        // 데시벨로 바꿔 −54dB ~ 0dB 를 0 ~ 1 로 (높은 띠는 조금 올려 줌 — 음악은 위로 갈수록 약하다)
        const db = 20 * Math.log10(sum / 3 / (W / 4) + 1e-9) + b * 0.45;
        bands[f * NB + b] = clamp01((db + 54) / 54);
      }
    }
    return { bands, frames, fps, dur, buf };
  })();
  return SPEC557;
}

function musicViz(): ReturnType<Demo2D['make']> {
  const o = { rel: 0.22, gain: 1, smooth: true };
  let sp: Spec557 | null = null;
  void spec557().then((s) => (sp = s));
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let t0 = 0;
  const sm = new Float32Array(NB);
  const env3 = [0, 0, 0];
  let prevBass = 0;
  let ring = 9;
  let clock = 0;
  const RANGES: [number, number][] = [
    [0, 6],
    [6, 20],
    [20, 32],
  ];
  const stop = (): void => {
    src?.stop();
    src = null;
  };
  const play = (): void => {
    if (!sp) return;
    if (src) return stop();
    ac ??= new AudioContext();
    void ac.resume();
    src = ac.createBufferSource();
    src.buffer = sp.buf;
    src.loop = true;
    src.connect(ac.destination);
    t0 = ac.currentTime + 0.05;
    src.start(t0);
  };

  return {
    draw(g: G, w: number, h: number, _t: number, dt: number) {
      g.fillStyle = '#07080f';
      g.fillRect(0, 0, w, h);
      if (!sp) {
        g.fillStyle = '#8890b0';
        g.font = `600 ${Math.max(9, h / 16)}px ${F}`;
        g.textAlign = 'center';
        g.fillText('소리 분석 중…', w / 2, h / 2);
        g.textAlign = 'left';
        return;
      }
      clock += Math.min(dt, 0.1);
      // 소리를 켜면 재생 시계, 아니면 화면 시계 — 둘 다 같은 미리 잰 표를 읽어 그림과 소리가 맞는다
      const tt = src && ac ? Math.max(0, ac.currentTime - t0) : clock;
      const ff = ((tt % sp.dur) / sp.dur) * sp.frames;
      const f0 = Math.floor(ff) % sp.frames;
      const f1 = (f0 + 1) % sp.frames;
      const fk = ff - Math.floor(ff);
      const raw = new Float32Array(NB);
      for (let b = 0; b < NB; b++) raw[b] = clamp01(lerp(sp.bands[f0 * NB + b]!, sp.bands[f1 * NB + b]!, fk) * o.gain);
      // 엔벨로프 따라가기: 오를 땐 빠르게(10ms), 내릴 땐 천천히(rel)
      const d = Math.min(dt, 0.1);
      const up = 1 - Math.exp(-d / 0.01);
      const dn = 1 - Math.exp(-d / o.rel);
      for (let b = 0; b < NB; b++) {
        const v = raw[b]!;
        sm[b] = o.smooth ? sm[b]! + (v - sm[b]!) * (v > sm[b]! ? up : dn) : v;
      }
      const rawG = RANGES.map(([a, b]) => {
        let s = 0;
        for (let i = a; i < b; i++) s += raw[i]!;
        return s / (b - a);
      });
      for (let i = 0; i < 3; i++) {
        const v = rawG[i]!;
        env3[i] = o.smooth ? env3[i]! + (v - env3[i]!) * (v > env3[i]! ? up : dn) : v;
      }
      // 박 = 저음이 한 프레임 사이에 훅 오름 (변화량 flux)
      const flux = rawG[0]! - prevBass;
      prevBass = rawG[0]!;
      if (flux > 0.08) ring = 0;
      ring += d;
      const [bass, mid, high] = env3 as [number, number, number];

      const cx = w * 0.42;
      const cy = h * 0.5;
      const R = Math.min(w, h) * 0.2;
      // 박마다 퍼지는 고리 + 바탕 번쩍
      if (ring < 0.6) {
        const k = ring / 0.6;
        g.fillStyle = `rgba(255,90,140,${(0.12 * (1 - k)).toFixed(3)})`;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = `rgba(255,140,190,${(0.8 * (1 - k)).toFixed(3)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, R * (1.1 + k * 1.6), 0, Math.PI * 2);
        g.stroke();
      }
      // 고음 = 반짝이 별
      for (let i = 0; i < 40; i++) {
        const a = clamp01(high * 1.6 - hsh(i * 7.7 + Math.floor(clock * 8)) * 0.9);
        if (a <= 0) continue;
        g.fillStyle = `rgba(200,230,255,${a.toFixed(2)})`;
        const s = 1 + hsh(i * 3.3) * 1.5;
        g.fillRect(hsh(i * 1.9) * w * 0.84, hsh(i * 5.1) * h, s, s);
      }
      // 띠 막대를 원 둘레로 (좌우 거울) — 중음이 클수록 천천히 돈다
      const rot = clock * 0.15 + mid * 0.6;
      g.lineCap = 'round';
      g.lineWidth = Math.max(1.5, R * 0.09);
      for (let b = 0; b < NB; b++) {
        const v = sm[b]!;
        const len = R * 0.12 + v * R * 1.25;
        g.strokeStyle = `hsl(${(200 + b * 4.5).toFixed(0)},90%,${(45 + v * 25).toFixed(0)}%)`;
        for (const sgn of [1, -1]) {
          const a = rot + sgn * ((b + 0.5) / NB) * Math.PI - Math.PI / 2;
          const r0 = R * (1 + bass * 0.3) + 3;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          g.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
          g.stroke();
        }
      }
      g.lineCap = 'butt';
      // 저음 = 가운데 원이 숨쉬듯 커짐
      const rr = R * (0.85 + bass * 0.3);
      const gr = g.createRadialGradient(cx, cy, rr * 0.1, cx, cy, rr);
      gr.addColorStop(0, '#ffd1e6');
      gr.addColorStop(1, `hsl(330,85%,${(35 + bass * 25).toFixed(0)}%)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.fill();
      // 오른쪽: 날것(가는 선) 과 엔벨로프(굵은 막대)
      const mx = w * 0.84;
      const mw = w * 0.035;
      const mh = h * 0.62;
      const my = h * 0.16;
      const fs = Math.max(8, h / 20);
      g.font = `600 ${fs}px ${F}`;
      g.textAlign = 'center';
      ['저', '중', '고'].forEach((lab, i) => {
        const x = mx + (i - 1) * mw * 1.9;
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x - mw / 2, my, mw, mh);
        g.fillStyle = ['#ff5a8c', '#59c3ff', '#d6ecff'][i]!;
        const e = env3[i]!;
        g.fillRect(x - mw / 2, my + mh * (1 - e), mw, mh * e);
        g.fillStyle = '#fff';
        g.fillRect(x - mw / 2 - 2, my + mh * (1 - rawG[i]!) - 1, mw + 4, 2);
        g.fillStyle = '#aab';
        g.fillText(lab, x, my + mh + fs * 1.2);
      });
      g.textAlign = 'left';
      if (src) {
        g.fillStyle = '#ffd34d';
        g.fillText('♪ 재생 중', 6, fs * 1.3);
      }
    },
    controls: [
      { type: 'button', label: '▶ 소리 듣기 / 멈춤', on: play },
      { type: 'toggle', label: '엔벨로프 따라가기 (끄면 날것)', value: o.smooth, on: (v) => (o.smooth = v) },
      { type: 'range', label: '내려오는 시간(초)', min: 0.03, max: 0.8, step: 0.01, value: o.rel, on: (v) => (o.rel = v) },
      { type: 'range', label: '반응 세기', min: 0.5, max: 1.6, step: 0.05, value: o.gain, on: (v) => (o.gain = v) },
    ],
    dispose() {
      stop();
      void ac?.close();
    },
  };
}

// ═════════════════════ i558 사진 2.5D 시차 (깊이 지도) ═════════════════════

const IW = 640;
const IH = 400;

/** 그림과 깊이 지도를 같은 모양으로 한꺼번에 그린다 — 깊이: 흰색 = 가까움 */
function paint558(): { col: HTMLCanvasElement; dep: HTMLCanvasElement; depWide: HTMLCanvasElement } {
  const mk = (): [HTMLCanvasElement, G] => {
    const c = document.createElement('canvas');
    c.width = IW;
    c.height = IH;
    return [c, c.getContext('2d')!];
  };
  const [col, cg] = mk();
  const [dep, dg] = mk();
  const gray = (v: number): string => {
    const n = Math.round(clamp01(v) * 255);
    return `rgb(${n},${n},${n})`;
  };
  const vgrad = (g: G, y0: number, y1: number, a: string, b: string): CanvasGradient => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    return gr;
  };
  /** 같은 모양을 두 캔버스에 — 색과 깊이(고정값 또는 세로 그라디언트) */
  const both = (path: (g: G) => void, color: string | CanvasGradient | ((g: G) => string | CanvasGradient), d: number | [number, number, number, number]): void => {
    cg.fillStyle = typeof color === 'function' ? color(cg) : color;
    cg.beginPath();
    path(cg);
    cg.fill();
    dg.fillStyle = typeof d === 'number' ? gray(d) : vgrad(dg, d[0], d[1], gray(d[2]), gray(d[3]));
    dg.beginPath();
    path(dg);
    dg.fill();
  };
  // 하늘
  both((g) => g.rect(0, 0, IW, IH), (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 260);
    gr.addColorStop(0, '#26335f');
    gr.addColorStop(0.55, '#d9776c');
    gr.addColorStop(1, '#f6c873');
    return gr;
  }, 0);
  both((g) => g.arc(452, 196, 34, 0, Math.PI * 2), '#fff3c4', 0.02);
  for (let i = 0; i < 4; i++) {
    const x = 60 + i * 150;
    const y = 60 + (i % 2) * 34;
    both((g) => {
      g.ellipse(x, y, 46, 9, 0, 0, Math.PI * 2);
      g.ellipse(x + 26, y - 6, 26, 9, 0, 0, Math.PI * 2);
    }, 'rgba(255,214,200,0.55)', 0.04);
  }
  // 먼 산
  both((g) => {
    g.moveTo(0, 250);
    for (let x = 0; x <= IW; x += 40) g.lineTo(x, 214 - Math.abs(Math.sin(x * 0.013) * 46) - hsh(x) * 18);
    g.lineTo(IW, IH);
    g.lineTo(0, IH);
  }, '#5a5b8c', 0.14);
  // 가운데 언덕
  both((g) => {
    g.moveTo(0, 270);
    for (let x = 0; x <= IW; x += 10) g.lineTo(x, 262 - Math.sin(x * 0.011 + 1) * 22);
    g.lineTo(IW, IH);
    g.lineTo(0, IH);
  }, '#3d6a5c', [240, 300, 0.3, 0.42]);
  // 들판 (바닥면: 아래로 갈수록 가까움)
  both((g) => {
    g.moveTo(0, 300);
    for (let x = 0; x <= IW; x += 10) g.lineTo(x, 296 - Math.sin(x * 0.008) * 6);
    g.lineTo(IW, IH);
    g.lineTo(0, IH);
  }, (g) => vgrad(g, 290, IH, '#5d9a52', '#2f6a36'), [290, IH, 0.42, 1]);
  // 집
  both((g) => g.rect(470, 252, 54, 40), '#e9d6b4', 0.5);
  both((g) => {
    g.moveTo(462, 254);
    g.lineTo(497, 226);
    g.lineTo(532, 254);
  }, '#a5473f', 0.5);
  both((g) => g.rect(490, 268, 12, 24), '#6a4a3a', 0.5);
  // 나무
  both((g) => g.rect(142, 228, 14, 80), '#5b3a2a', 0.6);
  both((g) => {
    g.arc(149, 214, 36, 0, Math.PI * 2);
    g.moveTo(190, 236);
    g.arc(170, 236, 24, 0, Math.PI * 2);
    g.moveTo(148, 236);
    g.arc(128, 236, 24, 0, Math.PI * 2);
  }, '#2d5e38', 0.6);
  // 사람 (가운데 앞)
  both((g) => g.ellipse(330, 318, 20, 34, 0, 0, Math.PI * 2), '#e3574a', 0.78);
  both((g) => g.arc(330, 272, 15, 0, Math.PI * 2), '#f2c9a0', 0.78);
  both((g) => g.ellipse(330, 262, 17, 8, 0, Math.PI, 0), '#3a2a24', 0.78);
  // 앞 바위 · 꽃 (가장 가까움)
  both((g) => g.ellipse(74, 384, 92, 44, 0, 0, Math.PI * 2), '#6d6a72', 0.96);
  for (let i = 0; i < 9; i++) {
    const x = 520 + hsh(i * 3.1) * 110;
    const y = 352 + hsh(i * 7.3) * 40;
    both((g) => g.rect(x - 1, y, 2, IH - y), '#2c5a2c', 0.92);
    both((g) => g.arc(x, y, 6, 0, Math.PI * 2), ['#ffd34d', '#ff8fb0', '#ffffff'][i % 3]!, 0.92);
  }
  // 깊이 넓히기: 가까운 쪽(밝은 값)을 둘레 4px 로 번지게 — 가장자리에서 배경이 늘어나게, 앞 물체가 찢기지 않게
  const depWide = document.createElement('canvas');
  depWide.width = IW;
  depWide.height = IH;
  const wg = depWide.getContext('2d')!;
  wg.drawImage(dep, 0, 0);
  wg.globalCompositeOperation = 'lighten';
  for (let a = 0; a < 8; a++) wg.drawImage(dep, Math.round(Math.cos((a * Math.PI) / 4) * 4), Math.round(Math.sin((a * Math.PI) / 4) * 4));
  wg.globalCompositeOperation = 'source-over';
  return { col, dep, depWide };
}

const FRAG558 = /* glsl */ `
uniform sampler2D uCol, uDep;
uniform vec2 uOff;
uniform float uFocus, uDolly, uAsp, uShow, uCrop;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  if (uAsp > 1.0) c.y /= uAsp; else c.x *= uAsp;   // 화면을 꽉 채우게 (cover)
  vec2 uv = c * uCrop + 0.5;                        // 가장자리 여유 — 밀려도 그림 밖이 안 보이게
  // 가까운 층부터 먼 층으로 훑어, 「그 깊이의 점이 이 화면 자리로 밀려왔는가」를 찾는다
  vec2 hit = uv;
  vec2 prevP = uv;
  float prevD = -1.0;
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float layer = 1.0 - float(i) / float(N - 1);
    float k = layer - uFocus;
    vec2 p = 0.5 + (uv - 0.5) / (1.0 + uDolly * k) - uOff * k;
    float diff = texture2D(uDep, p).r - layer;
    hit = p;
    if (diff >= 0.0) {
      // 앞 층과 이 층 사이에서 깊이가 만나는 곳을 선형 보간 — 층 계단이 안 보이게
      if (i > 0) hit = mix(p, prevP, diff / (diff - prevD));
      break;
    }
    prevP = p;
    prevD = diff;
  }
  vec3 col = texture2D(uCol, hit).rgb;
  if (uShow > 0.5) col = vec3(texture2D(uDep, hit).r);
  gl_FragColor = vec4(col, 1.0);
}`;

function parallax558(T: typeof THREE): ReturnType<Demo3D['make']> {
  const o = { s: 1, amt: 1, focus: 0.45, dolly: false, show: false, wide: true };
  const { col, dep, depWide } = paint558();
  const mkTex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new T.CanvasTexture(c);
    t.minFilter = T.LinearFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  };
  const tCol = mkTex(col);
  const tDep = mkTex(dep);
  const tWide = mkTex(depWide);
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new T.PlaneGeometry(2, 2);
  const mat = new T.ShaderMaterial({
    uniforms: {
      uCol: { value: tCol },
      uDep: { value: tWide },
      uOff: { value: new T.Vector2() },
      uFocus: { value: o.focus },
      uDolly: { value: 0 },
      uAsp: { value: 1 },
      uShow: { value: 0 },
      uCrop: { value: 0.84 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG558,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const u = mat.uniforms as Record<string, THREE.IUniform>;
  let clock = 0;
  return {
    scene,
    camera,
    tone: T.NoToneMapping,
    update(_t, dt) {
      clock += dt * o.s;
      // 카메라 길: 옆으로 크게 · 위아래로 조금 (8자) — 돌리는 앞으로 다가갔다 물러남
      const a = clock * 0.9;
      (u.uOff!.value as THREE.Vector2).set(Math.sin(a) * 0.085 * o.amt, Math.sin(a * 2) * 0.02 * o.amt);
      u.uDolly!.value = o.dolly ? (0.5 - 0.5 * Math.cos(a)) * 0.35 * o.amt : 0;
      u.uFocus!.value = o.focus;
      u.uShow!.value = o.show ? 1 : 0;
      u.uDep!.value = o.wide ? tWide : tDep;
    },
    resize(w, h) {
      u.uAsp!.value = w / h / (IW / IH);
    },
    controls: [
      speedCtl(o),
      { type: 'range', label: '시차 세기', min: 0, max: 2, step: 0.05, value: o.amt, on: (v) => (o.amt = v) },
      { type: 'range', label: '초점 깊이 (안 움직이는 층)', min: 0, max: 1, step: 0.05, value: o.focus, on: (v) => (o.focus = v) },
      { type: 'toggle', label: '앞으로 다가가기 (돌리)', value: o.dolly, on: (v) => (o.dolly = v) },
      { type: 'toggle', label: '깊이 지도 보기', value: o.show, on: (v) => (o.show = v) },
      { type: 'toggle', label: '깊이 가장자리 넓히기', value: o.wide, on: (v) => (o.wide = v) },
    ],
    dispose() {
      geo.dispose();
      mat.dispose();
      tCol.dispose();
      tDep.dispose();
      tWide.dispose();
    },
  };
}

// ═════════════════════ i559 폰 틀 목업 ═════════════════════

const CSS559 = `
.pm-wrap{position:absolute;left:18px;top:11px;width:110px;height:160px;perspective:520px}
.pm-shadow{position:absolute;left:14px;top:146px;width:82px;height:14px;border-radius:50%;background:radial-gradient(rgba(0,0,0,.45),transparent 70%);filter:blur(3px)}
.pm-phone{position:absolute;left:14px;top:0;width:78px;height:152px;border-radius:17px;background:linear-gradient(145deg,#3a3d46,#15161b);box-shadow:inset 0 0 0 1.5px #5b5f6b;transform-style:preserve-3d}
.pm-screen{position:absolute;left:4px;top:4px;right:4px;bottom:4px;border-radius:13px;overflow:hidden;background:#f3f4f8}
.pm-island{position:absolute;left:50%;top:4px;width:22px;height:6px;margin-left:-11px;border-radius:4px;background:#000;z-index:5}
.pm-status{position:absolute;left:0;right:0;top:0;height:13px;font:700 5.5px ${F};color:#111;padding:4px 7px 0;display:flex;justify-content:space-between;z-index:4;background:linear-gradient(#f3f4f8 70%,transparent)}
.pm-feed{position:absolute;left:0;right:0;top:14px;will-change:transform}
.pm-card{margin:0 5px 5px;border-radius:6px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.08);overflow:hidden}
.pm-thumb{height:30px}
.pm-line{height:3px;border-radius:2px;background:#d9dbe3;margin:3px 4px}
.pm-line.s{width:55%}
.pm-hl{position:absolute;inset:0;background:rgba(80,120,255,.18);opacity:0}
.pm-spin{position:absolute;left:50%;top:16px;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;border:1.5px solid #c9ccd6;border-top-color:#4b6bff;opacity:0}
.pm-glare{position:absolute;inset:0;border-radius:13px;pointer-events:none;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.35) 45%,transparent 60%);background-size:300% 100%;mix-blend-mode:screen}
.pm-finger{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(40,40,60,.28);border:1.5px solid rgba(255,255,255,.85);box-shadow:0 1px 4px rgba(0,0,0,.25);opacity:0;z-index:6}
.pm-ripple{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:1.5px solid #4b6bff;opacity:0;z-index:6}
.pm-side{position:absolute;left:146px;top:30px;width:126px;font:700 9px ${F};color:#e8ebf5}
.pm-side h4{margin:0 0 8px;font:800 12px ${F};color:#fff}
.pm-step{display:flex;align-items:center;gap:6px;margin:0 0 7px;opacity:.35;transition:opacity .2s}
.pm-step i{width:6px;height:6px;border-radius:50%;background:#7c8bff;display:block}
.pm-step.on{opacity:1}
`;

/** 콘텐츠 넘침 (고무줄) — 당긴 거리 x 에 대해 점점 덜 따라오게, 한계 dim */
const rubber = (x: number, dim: number): number => (1 - 1 / ((x * 0.55) / dim + 1)) * dim;

function phone559(box: HTMLElement): ReturnType<DemoDom['make']> {
  const o = { s: 1, tilt: 1, finger: true, glare: true, rubber: true };
  const COLORS = ['#ff9f6b', '#6bc6ff', '#a98bff', '#5fd39a', '#ffd166', '#ff7aa8', '#7fd1d1'];
  const cards = COLORS.map((c, i) => `<div class="pm-card" style="position:relative"><div class="pm-thumb" style="background:linear-gradient(135deg,${c},${COLORS[(i + 2) % COLORS.length]})"></div><div class="pm-line"></div><div class="pm-line s"></div>${i === 3 ? '<div class="pm-hl"></div>' : ''}</div>`).join('');
  const html = `
<div class="pm-wrap"><div class="pm-shadow"></div><div class="pm-phone">
  <div class="pm-screen"><div class="pm-spin"></div><div class="pm-feed">${cards}</div><div class="pm-status"><span>9:41</span><span>▮▮ ■</span></div><div class="pm-island"></div><div class="pm-glare"></div>
  <div class="pm-finger"></div><div class="pm-ripple"></div></div>
</div></div>
<div class="pm-side"><h4>폰 화면 시연</h4>
  <div class="pm-step"><i></i>밀어 올리기 → 관성</div>
  <div class="pm-step"><i></i>눌러 고르기</div>
  <div class="pm-step"><i></i>맨 위로 돌아가기</div>
  <div class="pm-step"><i></i>당겨서 새로고침</div>
</div>`;
  const S = stage(box, CSS559, html, 'linear-gradient(135deg,#1d2140,#3b2a55)');
  const q = (s: string): HTMLElement => S.st.querySelector(s) as HTMLElement;
  const phone = q('.pm-phone');
  const shadow = q('.pm-shadow');
  const feed = q('.pm-feed');
  const finger = q('.pm-finger');
  const ripple = q('.pm-ripple');
  const spin = q('.pm-spin');
  const glare = q('.pm-glare');
  const hl = q('.pm-hl');
  const steps = Array.from(S.st.querySelectorAll('.pm-step')) as HTMLElement[];
  const SCR_H = 144; // 화면 높이 (무대 단위)
  const MAXS = 7 * 49 + 14 - SCR_H; // 내용 높이 − 화면 높이
  const CYCLE = 7.4;
  let clock = 0;

  /** 지금 시각의 스크롤 · 손가락 · 단계를 대본에서 바로 계산 */
  const at = (p: number) => {
    let scroll = 0;
    let fx = 37;
    let fy = 110;
    let fa = 0;
    let press = 0;
    let rip = -1;
    let pull = 0;
    let spinA = 0;
    let step = -1;
    let sel = 0;
    // ① 밀어 올리기 0.5~1.0 → 놓으면 관성 (속도 × τ × (1 − e^(−t/τ)))
    const D1 = 60;
    const V = D1 / 0.35;
    const TAU = 0.45;
    const sFling = Math.min(MAXS, D1 + V * TAU * (1 - Math.exp(-Math.max(0, p - 1.0) / TAU)));
    if (p < 0.5) scroll = 0;
    else if (p < 1.0) scroll = D1 * seg(p, 0.65, 1.0);
    else scroll = sFling;
    if (p >= 0.4 && p < 1.15) {
      step = 0;
      fa = p < 0.5 ? seg(p, 0.4, 0.5) : p < 1.0 ? 1 : 1 - seg(p, 1.0, 1.15);
      fy = 110 - D1 * seg(p, 0.65, 1.0);
      press = p > 0.55 && p < 1.0 ? 1 : 0;
    }
    if (p >= 1.15 && p < 2.3) step = 0;
    // ② 눌러 고르기 2.4~3.2 (관성이 멈춘 뒤 화면에 보이는 넷째 카드)
    const sAfter = sFling;
    if (p >= 2.3 && p < 3.3) {
      step = 1;
      fx = 40;
      fy = 14 + 50 * 3 + 18 - sAfter;
      fa = seg(p, 2.3, 2.45) * (1 - seg(p, 3.0, 3.2));
      press = p > 2.6 && p < 2.75 ? 1 : 0;
      rip = p > 2.6 ? seg(p, 2.6, 3.0) : -1;
      sel = p > 2.62 ? 1 - seg(p, 3.0, 3.3) : 0;
    }
    // ③ 맨 위로 3.4~4.4 (상태줄 누르기처럼)
    if (p >= 3.3) scroll = sAfter * (1 - inOut(seg(p, 3.4, 4.4)));
    if (p >= 3.3 && p < 4.5) step = 2;
    // ④ 당겨서 새로고침: 4.6~5.3 손가락이 끌어내림 → 고무줄 → 5.3 놓음 → 돌다가 6.4~6.9 제자리
    if (p >= 4.5) {
      step = 3;
      const drag = 70 * seg(p, 4.75, 5.3);
      const pulled = o.rubber ? rubber(drag, SCR_H) : 0;
      if (p < 5.3) pull = pulled;
      else {
        const hold = o.rubber ? Math.min(pulled, 24) : 0;
        const back = 1 - outBack(seg(p, 6.4, 6.9), 1.2);
        pull = p < 5.5 ? lerp(pulled, hold, seg(p, 5.3, 5.5)) : hold * (p < 6.4 ? 1 : back);
      }
      scroll = -pull;
      fx = 44;
      fy = 50 + drag;
      fa = seg(p, 4.5, 4.65) * (1 - seg(p, 5.3, 5.45));
      press = p > 4.7 && p < 5.3 ? 1 : 0;
      spinA = clamp01(pull / 22);
      if (p > 7.0) step = -1;
    }
    return { scroll, fx, fy, fa, press, rip, pull, spinA, step, sel, spin: p >= 5.3 && p < 6.5 };
  };

  return {
    update(_t, dt) {
      clock += Math.min(dt, 0.1) * o.s;
      const p = clock % CYCLE;
      const s = at(p);
      feed.style.transform = `translateY(${(-s.scroll).toFixed(2)}px)`;
      // 폰은 천천히 기울어 흔들림 — 반사 띠는 기울기 따라 미끄러짐
      const ry = (-16 + Math.sin(clock * 0.55) * 10) * o.tilt;
      const rx = (6 + Math.sin(clock * 0.37) * 3) * o.tilt;
      phone.style.transform = `rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
      shadow.style.transform = `translateX(${(-ry * 0.35).toFixed(2)}px) scaleX(${(1 - Math.abs(ry) / 120).toFixed(3)})`;
      glare.style.opacity = o.glare ? '1' : '0';
      glare.style.backgroundPosition = `${(50 + ry * 3.2).toFixed(1)}% 0`;
      finger.style.opacity = o.finger ? s.fa.toFixed(3) : '0';
      finger.style.left = `${s.fx}px`;
      finger.style.top = `${s.fy}px`;
      finger.style.transform = `scale(${s.press ? 0.82 : 1})`;
      ripple.style.left = `${s.fx}px`;
      ripple.style.top = `${s.fy}px`;
      ripple.style.opacity = s.rip >= 0 ? (1 - s.rip).toFixed(3) : '0';
      ripple.style.transform = `scale(${s.rip >= 0 ? (0.3 + s.rip).toFixed(3) : 0.3})`;
      hl.style.opacity = s.sel.toFixed(3);
      spin.style.opacity = s.spinA.toFixed(3);
      spin.style.transform = `rotate(${(s.spin ? clock * 720 : s.pull * 12).toFixed(1)}deg)`;
      steps.forEach((el, i) => el.classList.toggle('on', i === s.step));
    },
    controls: [
      speedCtl(o),
      { type: 'range', label: '폰 기울기', min: 0, max: 1.6, step: 0.05, value: o.tilt, on: (v) => (o.tilt = v) },
      { type: 'toggle', label: '손가락 표시', value: o.finger, on: (v) => (o.finger = v) },
      { type: 'toggle', label: '유리 반사', value: o.glare, on: (v) => (o.glare = v) },
      { type: 'toggle', label: '고무줄 넘침 (끄면 딱 멈춤)', value: o.rubber, on: (v) => (o.rubber = v) },
    ],
    dispose: S.dispose,
  };
}

export const DEMOS: DemoMap = {
  i556: { kind: '2d', caption: '글자를 숨은 캔버스에 그려 픽셀 자리를 뽑고, 입자가 스프링으로 그 자리에 모였다 다음 글자로 흩어져 건너감', make: particleText },
  i557: { kind: '2d', caption: '미리 잰 32개 주파수 띠 → 저 · 중 · 고 엔벨로프: 저음은 원이 숨쉬고, 박마다 고리, 고음은 반짝이', make: musicViz },
  i558: { kind: '3d', caption: '그림 한 장 + 깊이 지도 — 셰이더가 깊이만큼 다르게 밀어 사진 속으로 카메라가 들어간 듯', make: parallax558 },
  i559: { kind: 'dom', caption: '기울어진 폰 틀 속 화면 — 밀면 관성, 누르면 물결, 위에서 당기면 고무줄 · 새로고침', make: phone559 },
};

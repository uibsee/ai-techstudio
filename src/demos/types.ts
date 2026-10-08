import type * as THREE from 'three';

/**
 * 기술 견본 규격 — 갤러리 카드(작게, 여러 개)와 자세히 보기(크게) 둘 다 같은 견본을 쓴다.
 * 견본 모듈은 `export const DEMOS: DemoMap = { u01: {...}, i05: {...} }` 처럼 기술 id(catalog.ts)를 열쇠로 둔다.
 *
 * 세 가지 꼴:
 *  - '3d'  : make() 가 장면 · 카메라를 돌려준다. 갤러리는 3D 화면 하나를 돌려 쓰며 보이는 카드만 그린다.
 *            후처리(composer)가 필요하면 render(renderer, w, h) 를 직접 쓴다 (renderer 크기는 이미 w × h).
 *  - '2d'  : make() 가 draw(g, w, h, t, dt) 를 돌려준다 — 캔버스 2D 로 매 프레임 그린다 (CSS 픽셀 기준, dpr 은 갤러리가 처리).
 *  - 'dom' : make(box) 가 box 안에 HTML/CSS/SVG 를 만든다 (CSS 기술 · 화면 층 연출). box 크기는 카드/큰 화면에 맞춰 바뀐다.
 *
 * 규칙: 외부 라이브러리 새로 깔지 말 것 (three · three/examples/jsm 만). 무겁지 않게 (카드 하나 1~2ms).
 * 시간 t(초) 로 계속 움직이게 — 보는 순간 「무슨 기술인지」 알 수 있게. dispose 에서 만든 것 정리.
 * 조절(controls)은 자세히 보기에서만 보인다.
 */

export type Control =
  | { type: 'range'; label: string; min: number; max: number; step: number; value: number; on: (v: number) => void }
  | { type: 'toggle'; label: string; value: boolean; on: (v: boolean) => void }
  | { type: 'button'; label: string; on: () => void };

export interface Scene3D {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** 매 프레임 (t 초, dt 초) */
  update?(t: number, dt: number): void;
  /** 직접 그리기 (후처리 등). 없으면 renderer.render(scene, camera) */
  render?(renderer: THREE.WebGLRenderer, w: number, h: number): void;
  /** 톤 매핑 (기본 NeutralToneMapping) */
  tone?: THREE.ToneMapping;
  /** 화면 비율이 바뀔 때 (PerspectiveCamera 는 갤러리가 aspect 를 맞춘다) */
  resize?(w: number, h: number): void;
  controls?: Control[];
  dispose?(): void;
}
export interface Demo3D {
  kind: '3d';
  /** 한 줄 캡션 — 카드 아래 「무엇을 보고 있나」 */
  caption?: string;
  make(T: typeof THREE): Scene3D;
}
export interface Demo2D {
  kind: '2d';
  caption?: string;
  make(): { draw(g: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number): void; controls?: Control[]; dispose?(): void };
}
export interface DemoDom {
  kind: 'dom';
  caption?: string;
  make(box: HTMLElement): { update?(t: number, dt: number): void; controls?: Control[]; dispose?(): void };
}
export type Demo = Demo3D | Demo2D | DemoDom;
export type DemoMap = Record<string, Demo>;

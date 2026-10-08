import type * as THREE from 'three';

/**
 * 화면을 꽉 채우는 게임(manifest look.fill) — 캔버스가 16:9가 아니어도 원래 구도가 보이게 한다.
 *
 * 구도는 16:9 화면에 맞춰 잡혀 있다. 더 넓은 화면(폰)은 세로 시야가 같아 양옆이 더 보일 뿐이고,
 * 더 긴 화면(태블릿 4:3)은 그대로 두면 양옆이 잘린다. 그때는 가로 시야를 16:9 때와 같게 두고
 * 위아래를 더 보여 준다. fov 가 아니라 zoom 으로 하므로 게임이 fov 를 바꿔도(확대 연출) 함께 맞는다.
 * resize 에서 camera.aspect 를 정한 뒤, updateProjectionMatrix 전에 부른다.
 */
export function keepWideFraming(camera: THREE.PerspectiveCamera, w: number, h: number): void {
  camera.zoom = Math.min(1, w / h / (16 / 9));
}

/** 폰 가로 화면 — 공통 틀의 폰 규칙(CSS max-height: 500px)과 같은 기준 */
export function isPhoneLandscape(): boolean {
  return window.matchMedia('(max-height: 500px)').matches;
}

/**
 * 폰 가로 화면에서만 판을 키운다 — 폰은 위 HUD · 아래 단추 · 오른쪽 칸이 화면에서 차지하는 몫이 커서 판이 작아 보인다.
 * zoom = 몇 배로, shift = 화면 높이의 몇 할만큼 아래로 내릴지 (+ 아래, − 위).
 * keepWideFraming 뒤, updateProjectionMatrix 전에 부른다. PC · 태블릿은 아무것도 바꾸지 않는다.
 * 아래 단추 줄을 왼쪽 세로로 비켜 둘 게임은 styles/gamemenu.css 「폰 — 아래 단추를 왼쪽 세로 줄로」 목록에도 넣는다.
 */
export function phoneBoardFraming(camera: THREE.PerspectiveCamera, w: number, h: number, zoom: number, shift = 0): void {
  if (!isPhoneLandscape()) {
    camera.clearViewOffset();
    return;
  }
  camera.zoom *= zoom;
  if (shift) camera.setViewOffset(w, h, 0, -shift * h, w, h);
  else camera.clearViewOffset();
}

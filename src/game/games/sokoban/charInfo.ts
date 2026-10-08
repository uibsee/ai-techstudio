/**
 * 캐릭터 이름 · 작은 그림 — 3D 없이 (메뉴가 three.js 를 끌어오지 않게 chars.ts 에서 떼어 냄).
 * 고른 캐릭터는 Storage 의 CHAR_KEY 에 둔다 (메뉴 첫 화면 고르기 · 게임 안 「캐릭터」 단추가 함께 씀).
 */

export type CharId = 'kid' | 'bunny' | 'bear' | 'cat' | 'ghost' | 'slime' | 'robot' | 'chick' | 'monster';
export const PUSHERS: CharId[] = ['kid', 'bunny', 'bear', 'cat', 'ghost', 'slime', 'robot'];
export const CHAR_NAME: Record<CharId, string> = {
  kid: '꼬마 창고지기',
  bunny: '깡충 토끼',
  bear: '곰돌이',
  cat: '줄무늬 고양이',
  ghost: '꼬마 유령',
  slime: '말랑 슬라임',
  robot: '네모 로봇',
  chick: '병아리',
  monster: '외눈 몬스터',
};

export const CHAR_KEY = 'warehouse:char';

/** 고르기 창에 쓰는 작은 그림 — tight 면 캐릭터 둘레만 (메뉴 첫 화면의 작은 칩) */
export function charSvg(id: CharId, tight = false): string {
  const c: Record<CharId, [string, string, string]> = {
    kid: ['#ffd9b8', '#ff5252', '#3a7bff'],
    bunny: ['#ffffff', '#ffb3c6', '#ffffff'],
    bear: ['#b07a48', '#8a5a30', '#b07a48'],
    cat: ['#ffa040', '#d87020', '#ffa040'],
    ghost: ['#f6f8ff', '#c8d4f0', '#f6f8ff'],
    slime: ['#7ff090', '#2fae4a', '#5fe07a'],
    robot: ['#bfc6d6', '#ff4a4a', '#9aa4ba'],
    chick: ['#ffe04a', '#ff9a1a', '#ffe04a'],
    monster: ['#a070ff', '#ffe8a0', '#8050e0'],
  };
  const [face, acc, body] = c[id];
  const ears =
    id === 'bunny'
      ? `<rect x="44" y="2" width="10" height="26" rx="3" fill="${face}" stroke="#3a2418" stroke-width="3"/><rect x="66" y="2" width="10" height="26" rx="3" fill="${face}" stroke="#3a2418" stroke-width="3"/>`
      : id === 'bear' || id === 'cat'
        ? `<rect x="38" y="16" width="12" height="12" fill="${face}" stroke="#3a2418" stroke-width="3"/><rect x="70" y="16" width="12" height="12" fill="${face}" stroke="#3a2418" stroke-width="3"/>`
        : id === 'kid'
          ? `<rect x="36" y="14" width="48" height="12" fill="${acc}" stroke="#3a2418" stroke-width="3"/>`
          : id === 'robot'
            ? `<rect x="58" y="10" width="4" height="14" fill="#8a92a6"/><rect x="54" y="4" width="12" height="10" fill="${acc}" stroke="#3a2418" stroke-width="2"/>`
            : '';
  const eyes =
    id === 'monster'
      ? `<rect x="52" y="38" width="16" height="14" fill="#fff"/><rect x="57" y="42" width="7" height="7" fill="#2a2030"/>`
      : id === 'robot'
        ? `<rect x="44" y="34" width="32" height="22" fill="#1c2a3a"/><rect x="50" y="40" width="5" height="5" fill="#5ff0ff"/><rect x="65" y="40" width="5" height="5" fill="#5ff0ff"/>`
        : `<rect x="48" y="40" width="6" height="7" fill="#2a2030"/><rect x="66" y="40" width="6" height="7" fill="#2a2030"/>`;
  return `<svg viewBox="${tight ? '30 0 60 96' : '0 0 120 100'}">${ears}<rect x="38" y="24" width="44" height="40" rx="4" fill="${face}" stroke="#3a2418" stroke-width="3"/>${eyes}<rect x="40" y="62" width="40" height="30" rx="3" fill="${body}" stroke="#3a2418" stroke-width="3"/></svg>`;
}

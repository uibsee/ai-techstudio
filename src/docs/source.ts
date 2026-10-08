import type { DemoMap } from '../demos/types';

/**
 * 「견본 전체 코드 보기」 — 견본 파일 원문을 눌렀을 때만 받아(?raw, 지연 로드) 그 기술 부분을 찾아 준다.
 *  1) 문서에 source(file · symbol) 가 있으면 그 함수 · 상수
 *  2) 없으면 기술 id 항목 — `i446: { … }` 이면 그 항목 + 부르는 make 함수, `i90,` · `i199: D199,` 이면 그 이름의 정의
 *  3) 찾기 어려우면 파일 전체 + 위치 안내
 */
const RAW = import.meta.glob('../demos/demos*.ts', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;
const MODS = import.meta.glob('../demos/demos*.ts', { eager: true }) as Record<string, { DEMOS?: DemoMap }>;

/** 그 기술 견본이 든 파일 (../demos/demosX.ts) */
export function fileOfDemo(id: string): string | undefined {
  for (const [p, m] of Object.entries(MODS)) if (m.DEMOS && Object.prototype.hasOwnProperty.call(m.DEMOS, id)) return p;
  return undefined;
}
const short = (p: string): string => `src/studio/demos/${p.split('/').pop()}`;

export interface Piece {
  label: string;
  file: string;
  line: number;
  code: string;
}

const NL = '\n';
const BS = '\\';
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\r' || c === NL;
const isWord = (c: string): boolean => /[A-Za-z0-9_$)\]]/.test(c);
/** 이 글자 뒤의 / 는 나눗셈이 아니라 정규식의 시작 */
const REGEX_BEFORE = '(,=:[!&|?{};+-*%<>~^';

/**
 * 짧은 훑개 — 문자열 · 템플릿(안의 ${} 포함) · 주석 · 정규식을 건너뛰며 괄호 짝을 센다.
 * i 부터 읽다가 깊이 0 에서 close 를 만나면 그 위치를 돌려준다 (없으면 -1).
 */
function scan(src: string, i: number, close: string): number {
  let depth = 0;
  let prev = '';
  for (; i < src.length; i++) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      i = src.indexOf(NL, i);
      if (i < 0) return -1;
      continue;
    }
    if (c === '/' && n === '*') {
      i = src.indexOf('*/', i + 2) + 1;
      if (i <= 0) return -1;
      continue;
    }
    if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c && src[i] !== NL; i++) if (src[i] === BS) i++;
      prev = 'x';
      continue;
    }
    if (c === '`') {
      for (i++; i < src.length && src[i] !== '`'; i++) {
        if (src[i] === BS) i++;
        else if (src[i] === '$' && src[i + 1] === '{') {
          i = scan(src, i + 2, '}');
          if (i < 0) return -1;
        }
      }
      prev = 'x';
      continue;
    }
    if (c === '/' && (prev === '' || REGEX_BEFORE.includes(prev))) {
      let cls = false;
      for (i++; i < src.length && src[i] !== NL; i++) {
        const d = src[i]!;
        if (d === BS) i++;
        else if (d === '[') cls = true;
        else if (d === ']') cls = false;
        else if (d === '/' && !cls) break;
      }
      prev = 'x';
      continue;
    }
    if (c === ';' && depth === 0 && close === ';') return i;
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') {
      if (depth === 0 && c === close) return i;
      depth--;
    }
    // TS 의 「값!」(null 아님 표시) 뒤 / 는 나눗셈 — 이름 · 괄호 뒤의 ! 는 이름처럼 본다
    if (!isSpace(c)) prev = isWord(c) || (c === '!' && prev === 'x') ? 'x' : c;
  }
  return -1;
}
const lineAt = (src: string, pos: number): number => src.slice(0, pos).split(NL).length;
/** 줄 처음 */
const bol = (src: string, pos: number): number => src.lastIndexOf(NL, pos - 1) + 1;

/** function · const · let · class 이름의 정의 전체 */
function findSymbol(src: string, name: string): { at: number; end: number } | null {
  const re = new RegExp(`^(?:export\\s+)?(?:async\\s+)?(?:function\\*?\\s+${name}\\b|(?:const|let|class)\\s+${name}\\b)`, 'm');
  const m = re.exec(src);
  if (!m) return null;
  const at = m.index;
  // const · let 은 문장 끝 「;」 까지 (객체 · 화살표 함수 · 함수 호출 모두)
  if (/(?:const|let)\s/.test(m[0])) {
    const e = scan(src, src.indexOf('=', at) + 1, ';');
    return e < 0 ? null : { at, end: e + 1 };
  }
  // 선언 줄부터 「{」 로 끝나는 첫 줄의 마지막 { (반환 타입의 { } 를 피한다) · 배열은 「[」 · 한 줄 정의는 「;」
  let ls = at;
  for (let k = 0; k < 40 && ls < src.length; k++) {
    const le = src.indexOf(NL, ls);
    const line = src.slice(ls, le < 0 ? undefined : le).replace(/\s+$/, '');
    if (line.endsWith('{') || line.endsWith('[')) {
      const open = ls + line.length - 1;
      const e = scan(src, open + 1, line.endsWith('{') ? '}' : ']');
      if (e < 0) return null;
      const semi = src[e + 1] === ';' ? 2 : 1;
      return { at, end: e + semi };
    }
    if (k === 0 && line.endsWith(';')) return { at, end: ls + line.length };
    if (le < 0) break;
    ls = le + 1;
  }
  return null;
}

export async function findSource(id: string, hint?: { file: string; symbol: string }[]): Promise<{ pieces: Piece[]; whole?: { file: string; code: string } }> {
  const pieces: Piece[] = [];
  const getRaw = async (p: string): Promise<string | null> => (RAW[p] ? RAW[p]!() : null);
  if (hint?.length) {
    for (const s of hint) {
      const p = `../demos/${s.file}`;
      const src = await getRaw(p);
      if (!src) continue;
      const f = findSymbol(src, s.symbol);
      if (f) pieces.push({ label: s.symbol, file: short(p), line: lineAt(src, f.at), code: src.slice(f.at, f.end) });
    }
  }
  const p = fileOfDemo(id);
  if (!p) return { pieces };
  const src = await getRaw(p);
  if (!src) return { pieces };
  if (!pieces.length) {
    // 「i90,」 또는 「i199: D199,」 처럼 이름만 걸어 둔 항목
    const ref = new RegExp(`^\\s*${id}\\s*(?::\\s*(\\w+))?\\s*,?\\s*$`, 'm').exec(src);
    if (ref) {
      const name = ref[1] ?? id;
      const f = findSymbol(src, name);
      if (f) pieces.push({ label: name, file: short(p), line: lineAt(src, f.at), code: src.slice(f.at, f.end) });
    }
  }
  if (!pieces.length) {
    // 「export const DEMOS = { i282, i283 }」 처럼 한 줄에 모은 경우 — 같은 이름의 정의
    const f = findSymbol(src, id);
    if (f) pieces.push({ label: id, file: short(p), line: lineAt(src, f.at), code: src.slice(f.at, f.end) });
  }
  if (!pieces.length) {
    // 「i446: { … }」 객체 항목 또는 「i312: dom('…', () => fn())」 처럼 함수로 만든 항목
    const m = new RegExp(`^\\s*${id}\\s*:\\s*(\\{|\\w+\\()`, 'm').exec(src);
    if (m) {
      const at = bol(src, m.index + m[0].indexOf(id));
      const open = m.index + m[0].length - 1;
      const e = scan(src, open + 1, m[1] === '{' ? '}' : ')');
      if (e > 0) {
        const entry = src.slice(at, e + 1);
        pieces.push({ label: `${id} 견본 항목`, file: short(p), line: lineAt(src, at), code: entry });
        // make: demoX · make: () => demoX(…) · make: () => new DemoX() · (…) => demoX()
        const mk = /make:\s*(?:\([^)]*\)\s*=>\s*)?(?:new\s+)?(\w+)/.exec(entry) ?? /=>\s*(?:new\s+)?(\w+)\(/.exec(entry);
        const fn = mk?.[1];
        if (fn && fn !== 'function') {
          const f = findSymbol(src, fn);
          if (f) pieces.unshift({ label: fn, file: short(p), line: lineAt(src, f.at), code: src.slice(f.at, f.end) });
        }
      }
    }
  }
  return pieces.length ? { pieces } : { pieces, whole: { file: short(p), code: src } };
}

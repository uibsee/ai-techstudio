import { h } from '../hub';
import { LANGS, LEVELS, PLATFORMS, type PromptOpts } from './prompt';
import type { PlatformId } from './types';

/**
 * 공용 화면 조각 — 복사(실패하면 글 선택으로 대체) · .md 내려받기 · 칩 고르기 · 알림 · 내 조합(localStorage).
 */

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/* ───── 알림 (복사 성공 등) ───── */
let toastEl: HTMLElement | null = null;
let toastT = 0;
export function toast(msg: string, kind: 'ok' | 'warn' = 'ok'): void {
  if (!toastEl) {
    toastEl = h('div', 'ai-toast');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.className = `ai-toast show ${kind}`;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => toastEl && (toastEl.className = 'ai-toast'), 2200);
}

/** 글 선택 (복사가 막혔을 때 사용자가 Ctrl+C 로) */
function selectText(el: HTMLElement): void {
  try {
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    el.focus?.();
  } catch {
    /* 무시 */
  }
}

/** 클립보드에 복사 — 권한이 없으면 숨은 textarea 로, 그것도 안 되면 글을 선택해 둔다 */
export async function copyText(text: string, selectEl?: HTMLElement, what = '복사했어요'): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1200))]);
      toast(`✓ ${what}`);
      return true;
    }
  } catch {
    /* 아래로 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) {
      toast(`✓ ${what}`);
      return true;
    }
  } catch {
    /* 아래로 */
  }
  if (selectEl) selectText(selectEl);
  toast('복사가 막혀 있어요 — 글을 선택해 두었으니 Ctrl+C (⌘C) 로 복사하세요', 'warn');
  return false;
}

/** .md 파일로 내려받기 */
export function downloadText(name: string, text: string): void {
  try {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast(`✓ ${name} 내려받기`);
  } catch {
    toast('내려받기가 막혀 있어요 — 복사를 써 주세요', 'warn');
  }
}
export const fileName = (s: string): string => `${s.replace(/[\\/:*?"<>|()·]+/g, ' ').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'studio'}.md`;

/* ───── 저장 (있으면) ───── */
export function load<T>(key: string, fb: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fb;
  } catch {
    return fb;
  }
}
export function save(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장이 막혀도 그대로 동작 */
  }
}

/* ───── 내 조합 (예전 이름 장바구니 — 저장 키는 그대로) ───── */
const CART = 'studio-cart-v1';
let cart: string[] = load<string[]>(CART, []).filter((x) => typeof x === 'string');
export const cartList = (): string[] => [...cart];
export const inCart = (id: string): boolean => cart.includes(id);
function setCart(next: string[]): void {
  cart = next;
  save(CART, cart);
  window.dispatchEvent(new CustomEvent('studio-cart', { detail: cart.length }));
}
export const cartAdd = (ids: string[]): void => setCart([...cart, ...ids.filter((x) => !cart.includes(x))]);
export const cartRemove = (id: string): void => setCart(cart.filter((x) => x !== id));
export const cartClear = (): void => setCart([]);
export function cartMove(id: string, dir: -1 | 1): void {
  const i = cart.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cart.length) return;
  const next = [...cart];
  [next[i], next[j]] = [next[j]!, next[i]!];
  setCart(next);
}

/* ───── 칩 고르기 (프롬프트 빈칸) ───── */
const PREF = 'studio-prompt-pref-v1';
interface Pref {
  platform?: PlatformId;
  level?: 1 | 2 | 3;
  lang?: 'ko' | 'en';
}
export function initialOpts(targets: string[], styles: string[], platforms: PlatformId[]): PromptOpts {
  const p = load<Pref>(PREF, {});
  return {
    target: targets[0] ?? '내 게임',
    style: styles[0] ?? '깔끔한 기본',
    platform: p.platform && platforms.includes(p.platform) ? p.platform : (platforms[0] ?? 'web'),
    level: p.level ?? 2,
    lang: p.lang ?? 'ko',
  };
}
function remember(o: PromptOpts): void {
  save(PREF, { platform: o.platform, level: o.level, lang: o.lang } satisfies Pref);
}

/** 한 줄 칩 묶음 — 키보드: 단추라 Tab · Enter/Space 로 고른다 */
function chipRow(label: string, opts: [string, string][], cur: string, on: (v: string) => void, free?: { placeholder: string }): HTMLElement {
  const row = h('div', 'ai-row');
  row.appendChild(h('span', 'ai-row-label', esc(label)));
  const g = h('div', 'ai-chips');
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', label);
  const mark = (v: string): void =>
    g.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const onIt = b.dataset['v'] === v;
      b.classList.toggle('on', onIt);
      b.setAttribute('aria-checked', String(onIt));
    });
  for (const [v, l] of opts) {
    const b = h('button', 'ai-chip', esc(l));
    b.type = 'button';
    b.dataset['v'] = v;
    b.setAttribute('role', 'radio');
    b.onclick = () => {
      mark(v);
      if (inp) inp.value = '';
      on(v);
    };
    g.appendChild(b);
  }
  let inp: HTMLInputElement | null = null;
  if (free) {
    inp = h('input', 'ai-free');
    inp.placeholder = free.placeholder;
    inp.setAttribute('aria-label', `${label} 직접 쓰기`);
    inp.oninput = () => {
      const v = inp!.value.trim();
      mark(v ? '' : (opts[0]?.[0] ?? ''));
      on(v || (opts[0]?.[0] ?? ''));
    };
    g.appendChild(inp);
  }
  mark(cur);
  row.appendChild(g);
  return row;
}

/** 빈칸 칩 전체 (대상 · 분위기 · 플랫폼 · 난이도 · 언어) — 바뀌면 onChange */
export function optionChips(o: PromptOpts, targets: string[], styles: string[], platforms: PlatformId[], onChange: () => void): HTMLElement {
  const box = h('div', 'ai-opts');
  const ch = (): void => {
    remember(o);
    onChange();
  };
  box.appendChild(chipRow('대상', targets.map((x) => [x, x]), o.target, (v) => ((o.target = v), ch()), { placeholder: '직접 쓰기…' }));
  box.appendChild(chipRow('분위기', styles.map((x) => [x, x]), o.style, (v) => ((o.style = v), ch()), { placeholder: '직접 쓰기…' }));
  box.appendChild(chipRow('플랫폼', platforms.map((p) => [p, PLATFORMS[p].label]), o.platform, (v) => ((o.platform = v as PlatformId), ch())));
  box.appendChild(chipRow('내 수준', LEVELS.map((x) => [String(x.id), x.label]), String(o.level), (v) => ((o.level = Number(v) as 1 | 2 | 3), ch())));
  box.appendChild(chipRow('답변 언어', LANGS.map((x) => [x.id, x.label]), o.lang, (v) => ((o.lang = v as 'ko' | 'en'), ch())));
  return box;
}

/** 단추 하나 */
export function btn(label: string, cls: string, on: () => void, title = ''): HTMLButtonElement {
  const b = h('button', `btn ${cls}`, label);
  b.type = 'button';
  if (title) b.title = title;
  b.onclick = on;
  return b;
}

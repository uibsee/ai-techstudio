import { copyText } from './docs/ui';
import { h } from './hub';

/**
 * AI 코딩 도구에 연결하기 — 홈 안내 칸 + 안내 쪽(#connect).
 * 사람이 기술을 찾아 복사하는 대신, AI 도구가 MCP 서버(functions/) · AI 용 글(llms.txt, src/ai)로 직접 찾아 쓰게.
 * 명령 · 주소는 여기 한 곳에서 (README.md 와 llms.txt 도 같은 명령을 쓴다 — 바꾸면 함께).
 */
export const MCP_URL = 'https://ai-techstudio.web.app/mcp';
export const LLMS_URL = 'https://ai-techstudio.web.app/llms.txt';
/** --scope user: 모든 프로젝트에서 (빼면 명령을 실행한 폴더에서만 연결된다) */
export const MCP_CMD = `claude mcp add --transport http --scope user ai-techstudio ${MCP_URL}`;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 복사 단추 달린 코드 한 줄(또는 여러 줄) */
function cmdBox(code: string, what: string): HTMLElement {
  const box = h('div', 'ai-connect-cmd', `<code>${esc(code)}</code><button type="button">복사</button>`);
  box.querySelector('button')!.onclick = () => void copyText(code, box.querySelector('code')!, what);
  return box;
}

/** 홈 위쪽 안내 칸 */
export function connectBox(): HTMLElement {
  const sec = h(
    'section',
    'ai-connect',
    `<div><h3>AI 코딩 도구에 연결하기</h3><p>Claude Code 터미널에 아래 명령을 <b>한 번만</b> 붙여 넣으세요. 그다음엔 평소처럼 「캐릭터를 만화처럼 보이게 해 줘」라고 말하면, AI 가 여기서 맞는 기술을 찾아 읽고 만들어요.</p></div>`,
  );
  sec.appendChild(cmdBox(MCP_CMD, '명령을 복사했어요 — 터미널에 붙여 넣으세요'));
  sec.appendChild(h('p', 'ai-connect-more', `Cursor · VS Code · Gemini 같은 다른 도구 설정법과 쓰는 요령은 <a href="#connect">연결 안내</a>에서.`));
  return sec;
}

/** 안내 쪽 #connect */
export function viewConnect(main: HTMLElement): () => void {
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>AI 연결 안내</div>
     <header class="page-head"><div><h1>AI 코딩 도구에 연결하기</h1>
     <p>이 사이트의 기술 ${'<b>문서 · 주문서 · 견본 실제 코드</b>'}를 AI 코딩 도구가 직접 검색해 읽게 하는 방법이에요. 한 번 연결해 두면 사람이 기술을 찾아 복사할 필요가 없어요.</p></div></header>`,
  );
  const wrap = h('div', 'connect-page');
  main.appendChild(wrap);

  const step = (n: string, title: string, body: string): HTMLElement => {
    const s = h('section', 'connect-step', `<h2><b>${n}</b>${title}</h2>${body}`);
    wrap.appendChild(s);
    return s;
  };

  const s1 = step('1', 'Claude Code — 한 번만 연결', `<p>터미널에 붙여 넣으세요. <code>--scope user</code> 덕분에 모든 프로젝트에서 쓸 수 있어요 (빼면 그 폴더에서만).</p>`);
  s1.appendChild(cmdBox(MCP_CMD, '명령을 복사했어요'));
  s1.insertAdjacentHTML('beforeend', `<p class="dim">잘 연결됐는지: <code>claude mcp list</code> → <code>ai-techstudio … ✔ Connected</code></p>`);

  step(
    '2',
    '그다음엔 평소처럼 말하기',
    `<p>기술 이름을 몰라도 돼요. 만들고 싶은 모습을 말하면 AI 가 검색 → 문서 읽기 → 내 프로젝트에 맞게 구현까지 해요.</p>
     <ul class="connect-ex"><li>「three.js 로 캐릭터를 만화처럼 보이게 해 줘」</li><li>「물에 돌을 던지면 물이 튀게 해 줘」</li><li>「적이 장애물을 피해서 쫓아오게 해 줘」</li><li>「엔진이 돌아가는 단면 모형을 만들어 줘」</li></ul>
     <p>AI 가 이 사이트를 안 찾아보고 그냥 만들면, 말 끝에 <b>「ai-techstudio 참고해서」</b>를 붙이세요. 여기서 찾은 기술 번호(예: <code>u01</code>)를 직접 말해도 돼요.</p>`,
  );

  const s3 = step('3', '다른 AI 도구', `<p>MCP 를 지원하는 도구는 설정에 서버 주소 <code>${MCP_URL}</code> 를 넣으면 돼요.</p>`);
  const tools: [string, string, string][] = [
    ['Cursor', '.cursor/mcp.json (프로젝트) 또는 ~/.cursor/mcp.json (전체)', `{\n  "mcpServers": {\n    "ai-techstudio": { "url": "${MCP_URL}" }\n  }\n}`],
    ['VS Code (Copilot)', '.vscode/mcp.json', `{\n  "servers": {\n    "ai-techstudio": { "type": "http", "url": "${MCP_URL}" }\n  }\n}`],
    ['Gemini CLI', '~/.gemini/settings.json', `{\n  "mcpServers": {\n    "ai-techstudio": { "httpUrl": "${MCP_URL}" }\n  }\n}`],
  ];
  for (const [name, where, code] of tools) {
    s3.insertAdjacentHTML('beforeend', `<h3>${name} <small>${esc(where)}</small></h3>`);
    s3.appendChild(cmdBox(code, `${name} 설정을 복사했어요`));
  }
  s3.insertAdjacentHTML(
    'beforeend',
    `<h3>MCP 가 없는 도구 (ChatGPT 등)</h3><p>요청할 때 주소를 같이 주세요 — 「<code>${LLMS_URL}</code> 를 참고해서 툰 셰이딩을 만들어 줘」. 기술 하나는 <code>https://ai-techstudio.web.app/ai/t/&lt;번호&gt;.md</code> 예요.</p>`,
  );

  step(
    '4',
    'AI 가 받는 것',
    `<table class="connect-tools"><tr><th>도구</th><th>하는 일</th></tr>
     <tr><td><code>search_techniques</code></td><td>만들고 싶은 것(영어 · 한국어)으로 기술 찾기</td></tr>
     <tr><td><code>get_technique</code></td><td>기술 하나 — 주문서 · 원리 · 흔한 실수 · 완성 기준 · 견본 실제 코드 · 관련 기술</td></tr>
     <tr><td><code>list_categories</code></td><td>분류별 전체 목록</td></tr>
     <tr><td><code>list_recipes</code> · <code>get_recipe</code></td><td>여러 기술을 한 장면으로 엮은 조합 레시피</td></tr></table>
     <p class="dim">대부분 three.js + TypeScript 견본이고, 2D 캔버스 · Web Audio 도 있어요. 문서는 한국어 + 영어 기술 용어예요.</p>`,
  );

  step(
    '5',
    '사이트는 언제 쓰나',
    `<p>이름을 모르는 효과를 <b>눈으로 보고 고를 때</b>요. 견본을 움직여 보고 마음에 들면 그 기술 번호를 AI 에게 말하거나, 기술 화면의 「AI 프롬프트 복사」 · 「내 조합에 넣기」를 써요.</p>`,
  );
  return () => {};
}

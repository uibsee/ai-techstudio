import { copyText } from './docs/ui';
import { h } from './hub';

/**
 * AI 연결 안내 (#connect, 위 오른쪽 「AI 연결」 단추).
 * 사람이 기술을 찾아 복사하는 대신, AI 코딩 도구가 MCP 서버(functions/) · AI 용 글(llms.txt, src/ai)로 직접 찾아 쓰게.
 * 원칙: 어느 AI 도구든 같은 무게로 — 도구마다 같은 꼴의 카드(설정 · 확인 · 처음 쓸 때), 알파벳순. 특정 도구를 앞세우지 않는다.
 * 명령 · 주소는 여기 한 곳에서 (README.md 와 llms.txt 도 같은 명령을 쓴다 — 바꾸면 함께).
 */
export const MCP_URL = 'https://ai-techstudio.web.app/mcp';
export const LLMS_URL = 'https://ai-techstudio.web.app/llms.txt';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Tool {
  name: string;
  /** 어디에 넣나 */
  where: string;
  /** 붙여 넣을 명령 · 설정 */
  code: string;
  /** 잘 됐는지 보는 법 */
  check: string;
  /** 처음 쓸 때 알아 둘 것 */
  note?: string;
}

/** 알파벳순 — 순서에 뜻을 두지 않는다 */
const TOOLS: Tool[] = [
  {
    name: 'Claude Code',
    where: '터미널 명령 한 줄',
    code: `claude mcp add --transport http --scope user ai-techstudio ${MCP_URL}`,
    check: '<code>claude mcp list</code> 에 <code>ai-techstudio … Connected</code>',
    note: '<code>--scope user</code> 를 빼면 명령을 실행한 폴더에서만 연결돼요.',
  },
  {
    name: 'Codex (OpenAI)',
    where: '터미널 명령 한 줄 (~/.codex/config.toml 에 들어가요)',
    code: `codex mcp add ai-techstudio --url ${MCP_URL}`,
    check: '<code>codex mcp list</code> 에 <code>ai-techstudio</code>',
    note: '처음 도구를 쓸 때 「허용」을 눌러 주세요.',
  },
  {
    name: 'Cursor',
    where: '~/.cursor/mcp.json (모든 프로젝트) 또는 .cursor/mcp.json (이 프로젝트)',
    code: `{\n  "mcpServers": {\n    "ai-techstudio": { "url": "${MCP_URL}" }\n  }\n}`,
    check: '설정 → MCP 에서 <code>ai-techstudio</code> 가 켜져 있는지',
  },
  {
    name: 'Gemini CLI',
    where: '~/.gemini/settings.json',
    code: `{\n  "mcpServers": {\n    "ai-techstudio": { "httpUrl": "${MCP_URL}" }\n  }\n}`,
    check: '대화창에서 <code>/mcp</code>',
  },
  {
    name: 'VS Code (Copilot)',
    where: '.vscode/mcp.json',
    code: `{\n  "servers": {\n    "ai-techstudio": { "type": "http", "url": "${MCP_URL}" }\n  }\n}`,
    check: '채팅 창 도구 목록에 <code>ai-techstudio</code>',
  },
  {
    name: '그 밖의 MCP 도구',
    where: '그 도구의 MCP 서버 설정 (방식: HTTP · Streamable HTTP)',
    code: MCP_URL,
    check: '도구 목록에 <code>search_techniques</code> 가 보이는지',
  },
  {
    name: 'MCP 가 없는 도구 (ChatGPT 등)',
    where: '요청할 때 주소를 같이 주기',
    code: `${LLMS_URL} 를 참고해서 툰 셰이딩을 만들어 줘`,
    check: '기술 하나의 글은 <code>https://ai-techstudio.web.app/ai/t/&lt;번호&gt;.md</code>',
  },
];

/** 복사 단추 달린 코드 한 줄(또는 여러 줄) */
function cmdBox(code: string, what: string): HTMLElement {
  const box = h('div', 'ai-connect-cmd', `<code>${esc(code)}</code><button type="button">복사</button>`);
  box.querySelector('button')!.onclick = () => void copyText(code, box.querySelector('code')!, what);
  return box;
}

/** 안내 쪽 #connect */
export function viewConnect(main: HTMLElement): () => void {
  main.insertAdjacentHTML(
    'beforeend',
    `<div class="crumbs"><a href="#home">홈</a><span>›</span>AI 연결</div>
     <header class="page-head"><div><h1>AI 코딩 도구에 연결하기</h1>
     <p>쓰고 있는 AI 코딩 도구에 이 사이트를 한 번 연결해 두면, AI 가 게임을 만들다 필요한 기술의 <b>문서 · 주문서 · 견본 실제 코드</b>를 여기서 직접 찾아 읽어요. 사람이 기술을 찾아 복사할 필요가 없어요.</p></div></header>`,
  );
  const wrap = h('div', 'connect-page');
  main.appendChild(wrap);

  const step = (n: string, title: string, body: string): HTMLElement => {
    const s = h('section', 'connect-step', `<h2><b>${n}</b>${title}</h2>${body}`);
    wrap.appendChild(s);
    return s;
  };

  const s1 = step('1', '쓰는 도구에 한 번만 연결', `<p>모든 도구가 같은 서버를 써요 — MCP 서버 주소 <code>${MCP_URL}</code></p>`);
  const grid = h('div', 'tool-grid');
  for (const t of TOOLS) {
    const card = h('div', 'tool-card', `<h3>${esc(t.name)}</h3><p class="dim">${esc(t.where)}</p>`);
    card.appendChild(cmdBox(t.code, `${t.name} 설정을 복사했어요`));
    card.insertAdjacentHTML('beforeend', `<p class="tool-check">확인 — ${t.check}</p>${t.note ? `<p class="tool-note">${t.note}</p>` : ''}`);
    grid.appendChild(card);
  }
  s1.appendChild(grid);

  step(
    '2',
    '그다음엔 평소처럼 말하기',
    `<p>기술 이름을 몰라도 돼요. 만들고 싶은 모습을 말하면 AI 가 검색 → 문서 읽기 → 내 프로젝트에 맞게 구현까지 해요.</p>
     <ul class="connect-ex"><li>「three.js 로 캐릭터를 만화처럼 보이게 해 줘」</li><li>「물에 돌을 던지면 물이 튀게 해 줘」</li><li>「적이 장애물을 피해서 쫓아오게 해 줘」</li><li>「엔진이 돌아가는 단면 모형을 만들어 줘」</li></ul>
     <p>AI 가 이 사이트를 안 찾아보고 그냥 만들면, 말 끝에 <b>「ai-techstudio 참고해서」</b>를 붙이세요. 여기서 찾은 기술 번호(예: <code>u01</code>)를 직접 말해도 돼요.</p>`,
  );

  step(
    '3',
    'AI 가 받는 것',
    `<table class="connect-tools"><tr><th>도구</th><th>하는 일</th></tr>
     <tr><td><code>search_techniques</code></td><td>만들고 싶은 것(영어 · 한국어)으로 기술 찾기</td></tr>
     <tr><td><code>get_technique</code></td><td>기술 하나 — 주문서 · 원리 · 흔한 실수 · 완성 기준 · 견본 실제 코드 · 관련 기술</td></tr>
     <tr><td><code>list_categories</code></td><td>분류별 전체 목록</td></tr>
     <tr><td><code>list_recipes</code> · <code>get_recipe</code></td><td>여러 기술을 한 장면으로 엮은 조합 레시피</td></tr></table>
     <p class="dim">대부분 three.js + TypeScript 견본이고, 2D 캔버스 · Web Audio 도 있어요. 문서는 한국어 + 영어 기술 용어예요.</p>`,
  );

  step(
    '4',
    '사이트는 언제 쓰나',
    `<p>이름을 모르는 효과를 <b>눈으로 보고 고를 때</b>요. 견본을 움직여 보고 마음에 들면 그 기술 번호를 AI 에게 말하거나, 기술 화면의 「AI 프롬프트 복사」 · 「내 조합에 넣기」를 써요.</p>`,
  );
  return () => {};
}

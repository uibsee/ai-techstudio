// AI 기술 스튜디오 MCP 서버 — https://ai-techstudio.web.app/mcp (Hosting 이 이 함수로 넘긴다)
// MCP Streamable HTTP, 상태 없음: POST 한 번 = JSON-RPC 한 번, 응답은 application/json.
// 데이터는 배포 때 함께 싣는 data/ (= 빌드가 만든 public/ai 복사본, firebase.json predeploy).
import { onRequest } from 'firebase-functions/v2/https';
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://ai-techstudio.web.app';
const DATA = path.join(import.meta.dirname, 'data');
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

let INDEX = null;
const index = () => (INDEX ??= JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8')));
const readMd = (rel) => {
  const p = path.join(DATA, rel);
  return p.startsWith(DATA) && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

const INSTRUCTIONS = `AI Tech Studio — a library of game graphics / VFX / physics / AI / system techniques for web games (mostly three.js + TypeScript, also Canvas 2D and Web Audio).
Every technique has a build spec (「주문서」), principles, pitfalls, an acceptance checklist and the real source code of its live demo. Content is Korean with English technical terms.
Use it when the user wants a visual effect, shader, material, lighting, camera, animation, character rig, physics, procedural model, map generation, pathfinding, game AI, sound effect, etc.:
1) search_techniques with the feature in English or Korean (several short keywords work best), 2) get_technique for the best 1-3 ids, 3) implement in the user's project following 「주문서」 and check 「완성 기준」. Adapt the demo code; do not copy demo-only scaffolding (sliders, demo frame).
For a whole scene that stacks several techniques, see list_recipes / get_recipe. Live demos: ${SITE}/#t/<id>`;

const TOOLS = [
  {
    name: 'search_techniques',
    description: 'Search game techniques (shaders, VFX, materials, lighting, physics, procedural modeling, rigging, camera, maps, pathfinding, game AI, sound...) by keywords in English or Korean. Returns ids with one-line summaries. Then call get_technique.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to build, e.g. "toon outline", "water surface", "3D jump platformer camera", "물 튀김"' },
        limit: { type: 'number', description: 'Max results (default 8, max 25)' },
        dim: { type: 'string', enum: ['2D', '3D'], description: 'Optional: only 2D or 3D techniques' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_technique',
    description: 'Full document for one technique: build spec, principles, key code, pitfalls, acceptance checklist, real demo source code, related techniques.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Technique id from search_techniques, e.g. "u01" or "i37"' } }, required: ['id'] },
  },
  {
    name: 'list_categories',
    description: 'Browse all techniques grouped by domain and category (names and ids only).',
    inputSchema: { type: 'object', properties: { domain: { type: 'string', description: 'Optional domain name to expand only that one' } } },
  },
  {
    name: 'list_recipes',
    description: 'Scene recipes that combine several techniques into one scene (e.g. a walking clay character).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recipe',
    description: 'Combined build spec for a scene recipe, with the techniques to stack in order.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

/* ───── 검색 ───── */
const norm = (s) => String(s ?? '').toLowerCase();
const tokens = (q) => norm(q).split(/[\s,/·|()+\-_.:;"'!?]+/).filter((w) => w.length >= 2 || /[가-힣]/.test(w));

function search(query, limit = 8, dim) {
  const q = norm(query).trim();
  const ws = tokens(query);
  const scored = [];
  for (const t of index().techniques) {
    if (dim && t.dim !== dim) continue;
    const name = norm(t.name);
    const en = norm(t.en.join(' | '));
    const sum = norm(t.summary);
    const cat = norm(`${t.domain} ${t.category}`);
    let s = 0;
    if (q && (name.includes(q) || en.includes(q))) s += 12;
    for (const w of ws) {
      if (name.includes(w)) s += 5;
      if (en.includes(w)) s += 5;
      if (cat.includes(w)) s += 2;
      if (sum.includes(w)) s += 2;
    }
    if (!s) continue;
    if (!t.of) s += 1; // 같은 점수면 기술(효과 예시보다)
    scored.push([s, t]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, Math.min(Math.max(1, limit | 0 || 8), 25)).map(([, t]) => t);
}
const line = (t) =>
  `- ${t.id} · ${t.name}${t.en[0] ? ` (${t.en[0]})` : ''} — ${t.summary} [${t.domain} › ${t.category} · ${t.dim} · ${t.level} · ${t.cost}]${t.of ? ` (effect example of ${t.of})` : ''}`;

/* ───── 도구 ───── */
function callTool(name, a = {}) {
  if (name === 'search_techniques') {
    const r = search(a.query, a.limit, a.dim);
    return r.length
      ? `${r.length} result(s) for "${a.query}". Call get_technique with an id for the full document.\n\n${r.map(line).join('\n')}`
      : `No match for "${a.query}". Try shorter or different keywords (English terms like "bloom", "ik", "pathfinding", or Korean), or list_categories.`;
  }
  if (name === 'get_technique') {
    const id = String(a.id ?? '').trim();
    if (!/^[a-z]\d+$/.test(id)) return { error: `Bad id "${id}". Use an id from search_techniques, e.g. "u01".` };
    return readMd(`t/${id}.md`) ?? { error: `No technique "${id}".` };
  }
  if (name === 'list_categories') {
    const by = new Map();
    for (const t of index().techniques) {
      if (t.of) continue;
      if (a.domain && !norm(t.domain).includes(norm(a.domain))) continue;
      const k = `${t.domain} › ${t.category}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(`${t.id} ${t.name}`);
    }
    return [...by].map(([k, v]) => `## ${k}\n${v.join('\n')}`).join('\n\n') || 'No such domain.';
  }
  if (name === 'list_recipes') return index().recipes.map((r) => `- ${r.id} · ${r.title} — ${r.sub} (techniques: ${r.techs.join(', ')})`).join('\n');
  if (name === 'get_recipe') {
    const id = String(a.id ?? '').trim();
    if (!/^[\w-]+$/.test(id)) return { error: `Bad id "${id}".` };
    return readMd(`recipes/${id}.md`) ?? { error: `No recipe "${id}". Call list_recipes.` };
  }
  return { error: `Unknown tool ${name}` };
}

function handle(msg) {
  const { id, method, params } = msg ?? {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!method) return fail(-32600, 'Invalid request');
  if (id === undefined) return null; // 알림 — 답 없음
  switch (method) {
    case 'initialize': {
      const want = params?.protocolVersion;
      return ok({
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-techstudio', title: 'AI Tech Studio', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      try {
        const r = callTool(params?.name, params?.arguments);
        return typeof r === 'string' ? ok({ content: [{ type: 'text', text: r }] }) : ok({ content: [{ type: 'text', text: r.error }], isError: true });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `Error: ${e?.message ?? e}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

/** 요청 처리 (Express 꼴 req · res) — 로컬 시험에서도 바로 부른다 */
export function serve(req, res) {
  if (req.method === 'GET') {
    // 사람이 주소를 열었을 때 · SSE 를 열려는 클라이언트 — 이 서버는 SSE 를 쓰지 않는다
    if (String(req.headers.accept ?? '').includes('text/event-stream')) return void res.status(405).set('Allow', 'POST').send('');
    return void res.type('text/plain; charset=utf-8').send(`AI Tech Studio MCP server.\nConnect: claude mcp add --transport http --scope user ai-techstudio ${SITE}/mcp\nDocs: ${SITE}/llms.txt\n`);
  }
  if (req.method === 'DELETE') return void res.status(405).send('');
  if (req.method !== 'POST') return void res.status(405).set('Allow', 'GET, POST').send('');
  const body = req.body;
  if (Array.isArray(body)) {
    const out = body.map(handle).filter(Boolean);
    return void (out.length ? res.json(out) : res.status(202).send(''));
  }
  const out = handle(body);
  if (!out) return void res.status(202).send('');
  res.json(out);
}

export const mcp = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 10, cors: true }, serve);

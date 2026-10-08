# AI 기술 스튜디오 (AI Tech Studio)

**https://ai-techstudio.web.app**

웹 게임에 쓰는 그래픽 · 연출 · 물리 · 시스템 기술 380여 가지(+ 효과 예시 80여 개)를 **움직이는 견본**으로 보고, **AI 코딩 도구가 직접 찾아 쓰게** 하는 기술 도감입니다.
대부분 three.js + TypeScript 이고, 2D 캔버스 · Web Audio 도 있습니다. 기술마다 주문서(AI 에게 줄 요구 사항) · 원리 · 흔한 실수 · 완성 기준 · 견본 실제 코드가 들어 있습니다.

A library of 380+ web-game techniques (plus 80+ effect examples) (shaders, VFX, materials, lighting, physics, procedural modeling, rigging, maps, pathfinding, game AI, sound) with live demos, build specs and real demo source — searchable by AI coding agents over MCP.

---

## 쓰는 법

### 1. Claude Code — 한 번만 연결

```bash
claude mcp add --transport http --scope user ai-techstudio https://ai-techstudio.web.app/mcp
```

`--scope user` 를 넣어야 모든 프로젝트에서 쓸 수 있습니다 (빼면 명령을 실행한 폴더에서만).
확인: `claude mcp list` → `ai-techstudio … ✔ Connected`

### 2. 그다음엔 평소처럼 말하기

기술 이름을 몰라도 됩니다. 만들고 싶은 모습을 말하면 AI 가 검색 → 문서 읽기 → 내 프로젝트에 맞게 구현합니다.

- 「three.js 로 캐릭터를 만화처럼 보이게 해 줘」
- 「물에 돌을 던지면 물이 튀게 해 줘」
- 「적이 장애물을 피해서 쫓아오게 해 줘」

AI 가 이 사이트를 찾아보지 않고 그냥 만들면, 말 끝에 **「ai-techstudio 참고해서」** 를 붙이세요. 사이트에서 본 기술 번호(예: `u01`)를 직접 말해도 됩니다.

### 3. 다른 AI 도구

MCP 서버 주소: `https://ai-techstudio.web.app/mcp`

| 도구 | 설정 파일 | 내용 |
|---|---|---|
| Codex (OpenAI) | 터미널 명령 (`~/.codex/config.toml` 에 들어감) | `codex mcp add ai-techstudio --url https://ai-techstudio.web.app/mcp` — 처음 쓸 때 도구 사용 「허용」 |
| Cursor | `.cursor/mcp.json` · `~/.cursor/mcp.json` | `{ "mcpServers": { "ai-techstudio": { "url": "https://ai-techstudio.web.app/mcp" } } }` |
| VS Code (Copilot) | `.vscode/mcp.json` | `{ "servers": { "ai-techstudio": { "type": "http", "url": "https://ai-techstudio.web.app/mcp" } } }` |
| Gemini CLI | `~/.gemini/settings.json` | `{ "mcpServers": { "ai-techstudio": { "httpUrl": "https://ai-techstudio.web.app/mcp" } } }` |

MCP 가 없는 도구(ChatGPT 등)는 요청할 때 주소를 같이 주세요:
「https://ai-techstudio.web.app/llms.txt 를 참고해서 툰 셰이딩을 만들어 줘」

### AI 가 받는 것

| MCP 도구 | 하는 일 |
|---|---|
| `search_techniques` | 만들고 싶은 것(영어 · 한국어)으로 기술 찾기 |
| `get_technique` | 기술 하나 — 주문서 · 원리 · 흔한 실수 · 완성 기준 · 견본 실제 코드 · 관련 기술 |
| `list_categories` | 분류별 전체 목록 |
| `list_recipes` · `get_recipe` | 여러 기술을 한 장면으로 엮은 조합 레시피 |

같은 내용을 글 파일로도 엽니다: [`/llms.txt`](https://ai-techstudio.web.app/llms.txt) (사용법 + 목록) · `/ai/index.json` (검색용 목록) · `/ai/t/<id>.md` (기술 하나) · `/ai/recipes/<id>.md` (레시피)

### 사이트는 언제 쓰나

이름을 모르는 효과를 **눈으로 보고 고를 때** 씁니다. 견본을 움직여 보고 마음에 들면 그 기술 번호를 AI 에게 말하거나, 기술 화면의 「AI 프롬프트 복사」 · 「내 조합에 넣기」를 씁니다. 연결 안내: https://ai-techstudio.web.app/#connect

---

## 만드는 사람용

```bash
npm install
npm run dev          # http://localhost:5180
npm run build        # AI 용 글 만들기(export-ai) → 타입 검사 → vite 빌드
firebase deploy      # 사이트 + MCP 서버 (사이트만: --only hosting)
```

| 위치 | 내용 |
|---|---|
| `src/catalog.ts` · `curation.ts` | 기술 목록 · 공개용 고르기 (빼기 · 효과 모음 · 분류 옮기기 · 이름 고치기) |
| `src/domains.ts` | 큰 분류 |
| `src/demos/demos*.ts` | 움직이는 견본 — **새 기술 = catalog 한 줄 + 견본 하나** |
| `src/docs/docs*.ts` | 기술 문서 (주문서 · 원리 · 실수 · 완성 기준 · 코드), 쓰는 법 `docs/doc-writing-guide.md` |
| `src/ai/exportData.ts` · `scripts/export-ai.mjs` | AI 용 글 생성 (`public/llms.txt` · `public/ai/` — 생성물이라 git 제외) |
| `functions/index.js` | MCP 서버 (Firebase Functions, Hosting `/mcp`) |
| `src/connect.ts` | 사이트의 「AI 연결 안내」 — 명령을 바꾸면 이 README 와 `src/ai/exportData.ts` 도 함께 |
| `src/game/` | 수학 놀이터 게임에서 가져온 코드 복사본 (툰 · 동화책 물 · 주사위 — 견본이 씀) |
| `src/refs.ts` · `src/refPreviews.ts` | 참고 작품 쪽 — 미리보기 그림 주소는 `node scripts/fetch-ref-previews.mjs` 로 (각 사이트가 공개한 og:image) |

## 라이선스

이 저장소의 코드와 문서는 **[MIT](LICENSE)** 입니다 — 견본 코드 · 주문서를 자기 게임에 자유롭게 가져다 쓰세요.

다른 곳에서 온 자료는 각자의 조건을 따릅니다 (`public/licenses/`):

| 자료 | 위치 | 조건 |
|---|---|---|
| airsup-lab 코드 | `src/vendor/airsup/` | MIT (원 저작자 표시 유지) |
| Poly Haven 텍스처 · HDRI | `src/assets/polyhaven/` | CC0 |
| 용 모델 (Quaternius) | `src/assets/games/fakecoin/dragon.glb` | CC0 |
| 원혼 픽셀 그림 | `src/assets/pixelghost/` | 견본 시연용으로 허락받아 쓴 그림 — MIT 에 포함되지 않음 |

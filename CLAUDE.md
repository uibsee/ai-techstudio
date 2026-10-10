# 기술 스튜디오 (techstudio)

게임에 쓴 그래픽 · 연출 · 시스템 기술을 움직이는 견본으로 보고, 조절하고, AI 에게 줄 주문서로 가져가는 사이트. 사용자와는 늘 **한국어**로.
수학 놀이터(`../19_Mathgame_web`, 예전 `src/studio/` · `studio.html`)에서 2026-10-08 따로 떼어 냄.

- **배포 = Firebase Hosting `ai-techstudio` → https://ai-techstudio.web.app** (`npm run build && firebase deploy --only hosting`). 사용자가 「배포해」 할 때만. 라이선스 문구는 `public/licenses/`(airsup MIT · polyhaven CC0 · 용 CC0)
- 실행 `npm run dev` → http://localhost:5180/ (`#home` · `#all` · `#d/<분류>` · `#t/<기술 id>` · `#fx` · `#recipes` · `#mix` · `#refs` 참고 작품 · `#connect` AI 연결 · `#research`)
- 이어서 할 일 · 진행 기록: `docs/progress.md`, 문서 쓰는 법 `docs/doc-writing-guide.md`
- 구조: `src/main.ts` 겉틀 · `catalog.ts` 기술 목록 · `curation.ts` 고르기 · `views.ts` 화면 · `hub.ts` 견본 엔진 · `refs.ts` 참고 작품 · `connect.ts` AI 연결 안내 · `demos/demos*.ts` 견본 · `docs/docs*.ts` 문서. **새 기술 = catalog 한 줄 + 견본 하나.**
- 견본 꼴은 `demos/types.ts` (3d · 2d · dom). **DOM 견본은 공용 280×175 무대 `demos/lib/stage.ts`** (상자에 맞춰 통째 scale, 이징 · seg · hsh 도구 함께) — 모션 그래픽 C · D · E 가 씀. 움직임은 늘 「대본 시각 p」에서 바로 계산(되감기 · 영상 굽기와 맞게)
- 문서 플랫폼(`docs/types.ts` PlatformId · `docs/prompt.ts`): three · canvas · **dom**(HTML/CSS 화면 움직임, 2026-10-10 추가) · webaudio · web(화면과 떨어진 순수 함수) · unity · godot
- 모션 그래픽 보강(2026-10-10, prompt-motion.com 분류를 빈칸 지도로만 씀 — 내용은 옮기지 않음): i548~555 제품 UI · 흐름도 · 코드(`demosMotionC/D` · `docsMotionUI`), i556~559 입자 글자 · 음악 반응 · 사진 2.5D 시차 · 폰 목업(`demosMotionE` · `docsMotionE`), 레시피 `game-promo-30s`. 효과 모음(#fx)의 「모션 그래픽」 탭은 주소로 바로 못 연다
- 화면 확인: 스크래치에 playwright-core + `%LOCALAPPDATA%/ms-playwright/chromium-*` 로 견본 칸을 시간별로 찍어 한 장에 모아 봄 (개발 서버 켠 채)
- git: 이 컴퓨터엔 전역 작성자 설정이 없다 → `git -c user.name=uibsee -c user.email=uibsee@hanmail.net commit …` (원격 `github.com/uibsee/ai-techstudio`, main)
- `src/game/` · `src/assets/games/` = 수학 놀이터 게임 코드 **복사본**(2026-10-08) — 견본이 쓰는 것만 남김(툰 toon.ts · 동화책 물 storybook.ts · 주사위 dice3d.ts · 숫자 야구 ballfx.css · 용 모델). 게임 쪽이 바뀌어도 저절로 따라오지 않는다.
- 특별 무대(#labs — 주차장 · 숫자 야구 실제 무대)는 2026-10-09 사용자 결정으로 뺐다. 위 오른쪽 = 참고 작품 · 조합 레시피 · 내 조합 · **AI 연결**(단추)
- 게임 이름표 `src/gameTitles.ts`(manifest 에서 뽑아 굳힘) · 게임 사진 `src/shots/<게임 id>.jpg`. 「이 기술을 쓴 게임」 단추는 mathmiri.com 을 연다.
- 예전 「실전 무대」(게임을 같은 출처 iframe 으로 띄워 조절판 걸기)는 분리하면서 뺐다. 게임 쪽 `src/game/core/devThree.ts` 는 수학 놀이터에 남아 있다.
- **AI 가 직접 쓰는 길 (2026-10-08)**: 사람용 화면은 자바스크립트로 그려 AI 도구가 못 읽는다 → 같은 데이터를 글로.
  - `npm run export-ai` (build 가 먼저 부름) = `scripts/export-ai.mjs` 가 `src/ai/exportData.ts` 를 vite 로 node 에서 불러 `public/llms.txt` · `public/ai/index.json` · `public/ai/t/<id>.md`(AI 꾸러미 + 견본 실제 코드) · `public/ai/recipes/<id>.md` 생성 (생성물이라 git 제외). 견본은 실행하지 않고 원문만 읽는다(`docs/sourceCore.ts`). 영어 용어 없는 기술은 `EXTRA_EN` 에 적거나 효과 예시면 만든 기술 것을 물려받음
  - MCP 서버 = `functions/index.js` (Firebase Functions 2세대, us-central1, Hosting `/mcp` 로 넘김). 도구 search_techniques · get_technique · list_categories · list_recipes · get_recipe. 데이터는 predeploy 가 `public/ai` → `functions/data` 복사. 연결: `claude mcp add --transport http ai-techstudio https://ai-techstudio.web.app/mcp`
  - 전체 배포 `firebase deploy` (함수 + 사이트). 사이트만 `firebase deploy --only hosting`. 함수 이미지 정리 규칙 1일 설정함. **기술 · 레시피를 더했으면 전체 배포** — 사이트만 올리면 MCP 는 옛 데이터
  - 로컬 시험: functions/index.js 의 `serve` 를 node http 로 감싸 POST (스크래치 mcpserve.mjs 꼴)
- 사용법 설명은 세 곳: `README.md` · 사이트 `#connect`(`src/connect.ts`) · llms.txt(`src/ai/exportData.ts`) — 연결 명령을 바꾸면 셋 다

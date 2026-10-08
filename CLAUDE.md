# 기술 스튜디오 (techstudio)

게임에 쓴 그래픽 · 연출 · 시스템 기술을 움직이는 견본으로 보고, 조절하고, AI 에게 줄 주문서로 가져가는 사이트. 사용자와는 늘 **한국어**로.
수학 놀이터(`../19_Mathgame_web`, 예전 `src/studio/` · `studio.html`)에서 2026-10-08 따로 떼어 냄.

- **배포 = Firebase Hosting `ai-techstudio` → https://ai-techstudio.web.app** (`npm run build && firebase deploy --only hosting`). 사용자가 「배포해」 할 때만. 라이선스 문구는 `public/licenses/`(airsup MIT · polyhaven CC0 · 용 CC0)
- 실행 `npm run dev` → http://localhost:5180/ (`#home` · `#all` · `#d/<분류>` · `#t/<기술 id>` · `#fx` · `#recipes` · `#mix` · `#labs` · `#lab/<id>` · `#research`)
- 이어서 할 일 · 진행 기록: `docs/progress.md`, 문서 쓰는 법 `docs/doc-writing-guide.md`
- 구조: `src/main.ts` 겉틀 · `catalog.ts` 기술 목록 · `curation.ts` 고르기 · `views.ts` 화면 · `hub.ts` 견본 엔진 · `labs.ts` 특별 무대 · `demos/demos*.ts` 견본 · `docs/docs*.ts` 문서. **새 기술 = catalog 한 줄 + 견본 하나.**
- `src/game/` · `src/services/artSlots.ts` · `src/assets/games/` = 수학 놀이터 게임 코드 **복사본**(2026-10-08). 견본 · 특별 무대가 쓴다(툰 · 동화책 물 · 주사위 · 숫자 야구 무대 · 주차장 무대 · 용 모델). 게임 쪽이 바뀌어도 저절로 따라오지 않는다 — 필요하면 다시 복사. `src/i18n/index.ts` 는 한국어 그대로 돌려주는 대역.
- 게임 이름표 `src/gameTitles.ts`(manifest 에서 뽑아 굳힘) · 게임 사진 `src/shots/<게임 id>.jpg`. 「이 기술을 쓴 게임」 단추는 mathmiri.com 을 연다.
- 예전 「실전 무대」(게임을 같은 출처 iframe 으로 띄워 조절판 걸기)는 분리하면서 뺐다. 게임 쪽 `src/game/core/devThree.ts` 는 수학 놀이터에 남아 있다.

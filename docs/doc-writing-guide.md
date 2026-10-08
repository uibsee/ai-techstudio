# 기술 문서 작성 지침 (에이전트용 초안)

기술 스튜디오의 기술 페이지를 「AI 로 만드는 사람이 가장 편한」 형식으로 채우는 지침이다.
시범 10개(u01 · i385 · i446 · i459 · i484 · i341 · i360 · i499 · i323 · i477)가 본보기 —
`src/studio/docs/docsPilotA.ts` · `docsPilotB.ts` 를 먼저 읽고 같은 결로 쓴다.

## 1. 구조 한눈에

| 파일 | 내용 |
|---|---|
| `src/studio/docs/types.ts` | `TechDoc` · `Recipe` 규격 (필드 설명이 주석에 있다) |
| `src/studio/docs/docs*.ts` | `export const DOCS: Record<string, TechDoc>` — glob 으로 저절로 모인다. **새 파일만 만들면 끝** (index · views 고칠 필요 없음) |
| `src/studio/docs/prompt.ts` | 주문서(프롬프트) · AI 꾸러미 · 합친 주문서 만들기, 문서 없는 기술의 기본 문서(`defaultDoc`) |
| `src/studio/docs/recipes.ts` | 조합 레시피 |
| `src/studio/docs/techPage.ts` · `pages.ts` · `ui.ts` · `source.ts` | 화면 (고칠 일 없음) |

문서가 없는 기술도 기본 주문서가 나오므로, 문서는 **있으면 더 좋아지는** 구조다. 순서는 자주 볼 기술부터.

## 2. 나눠 맡기

- 에이전트 한 갈래 = **분류 하나 = 파일 하나** `src/studio/docs/docs<분류>.ts` (예: `docsLight.ts` · `docsRig.ts`). 한 파일 10~20개.
- 파일은 **Write 400줄 이하로 처음 몇 개 → Edit 로 덧붙이기**. 한 번에 크게 쓰면 응답이 멈춘다.
- 이미 문서가 있는 id 는 건너뛴다 (같은 id 가 두 파일에 있으면 뒤에 모인 것이 이긴다 — 겹치지 않게).
- 역슬래시가 든 코드(정규식 · `\n`)는 bash 히어독으로 쓰지 말 것 (역슬래시가 줄어든다). Write/Edit 로.

## 3. 쓰기 전에 읽을 것

1. `src/studio/catalog.ts` 의 그 기술 줄 (이름 · 분류 · 설명 · 쓰는 곳 · 파일 · 난이도)
2. 견본 코드 — `grep -n "^\s*<id>\b" src/studio/demos/*.ts` 로 찾고, 항목이 부르는 make 함수까지 읽는다
3. 쓰는 중(u) 기술은 `files` 의 실제 게임 코드도
4. CLAUDE.md · 메모리의 「겪은 일」 (아래 6절)

## 4. 필드별 규칙

| 필드 | 규칙 |
|---|---|
| `summary` | 한 문장. 「무엇을 → 어떻게 → 무엇이 달라지나」. 60~90자 |
| `terms` | 2~4개. 첫 번째 = **AI 가 가장 잘 알아듣는 영어 표준 용어** (예: `Toon shading (cel shading)`). three.js 클래스 이름 · 방법 이름도 여기에. `ko` 는 한 줄 풀이 |
| `goal` | 주문서 첫 문장. `{target}` · `{style}` 자리표시를 넣는다. 조사는 `{target}을(를)` · `이(가)` · `은(는)` · `과(와)` 로 쓰면 받침에 맞게 바뀐다 |
| `targets` · `styles` | 칩 후보 3개씩. 첫 번째가 기본값 — 견본과 같은 것을 첫 번째로 |
| `platforms` | 맞는 것만, 첫 번째가 원래 기준. 3D → `three` · 2D → `canvas` · 소리 → `webaudio` · 순수 계산 → `web`, 그다음 `unity` · `godot` |
| `platformHints` | 다른 엔진에서의 **실제** 대응 기능 이름 한 줄 (모르면 비운다. 지어내지 않는다) |
| `principle` | 3~5줄. 초등 고학년도 따라올 말로, 식이 핵심이면 식 한 줄 |
| `when` · `avoid` | 2~3개씩. avoid 는 「대신 무엇을 쓰나」까지 |
| `cost` · `costNote` | `light` 폰 OK · `medium` 주의 · `heavy` 무거움. 무엇이 비싼지 숫자로 (그림자 지도 6장, 64³ = 26만 점 등) |
| `level` | 1 쉬움 · 2 보통 · 3 어려움 (catalog 의 하 · 중 · 상과 대체로 맞게) |
| `must` | 주문서 「조건」 3~5개. 성능 예산 · 금지 · 꼭 지킬 것. **AI 가 흔히 틀리는 것을 미리 막는 줄**이 가장 값지다 |
| `done` | 주문서 「완성 기준」 3~4개. **눈으로 확인 가능한 문장** + 켬/끔(전/후) 비교 + 조절 값 + 성능(폰) |
| `code` | 아래 5절 |
| `pitfalls` | 3~5개. `title` 은 「~하면 ~된다」, `fix` 는 1~2문장. 이 사이트에서 실제로 겪은 것은 `seen: true` |
| `prev` · `next` | catalog 에 **있는** id 만 (스크립트로 확인 — 7절) |
| `refs` | 실제로 있는 주소만: three.js 공식 예제(`https://threejs.org/examples/#<이름>`) · three.js GitHub 소스 · MDN · Khronos · Wikipedia · Inigo Quilez 등. 확실하지 않으면 넣지 않는다 |
| `source` | 견본 코드 위치를 직접 지정할 때 `{ file: 'demosX.ts', symbol: '함수이름' }`. 없어도 id 로 자동으로 찾는다 (548개 모두 찾힘). 핵심 함수가 따로 있으면 지정하는 편이 보기 좋다 |

## 5. 핵심 코드 (`code`)

- 10~30줄. **붙여 넣으면 돌아가거나, 바로 이어 붙일 수 있는** 코드. 견본의 실제 코드에서 발췌해 카드용 장치(조절판 · 캡션 · HUD · dispose)를 걷어 낸다.
- 견본 식 · 상수를 바꾸지 않는다 (예: 횃불 일렁임 `0.84 + 0.08·sin(t·11+ph) …` 그대로). 새로 쓴 것이면 `from` 에 「새로 씀 (… 와 같은 방식)」.
- three.js API 는 r186 기준으로 실제 있는 것만. 확실하지 않으면 `node_modules/three` 에서 grep 해서 확인.
- 문자열은 template literal(백틱) 안에 넣으므로 코드 안에 백틱 · `${` 를 쓰지 않는다 (문자열 더하기로).
- 주석은 한국어로 「왜」를 — 「무엇」은 코드가 말한다.

## 6. 「흔한 실수」 재료 — 이 사이트에서 실제로 겪은 것

해당하는 기술에만 넣는다 (`seen: true`).

- 반복문으로 잡음을 여러 번 부르는 셰이더 → 윈도 D3D 컴파일 17~20초 멈춤 (보물 동굴). 잡음은 미리 구운 텍스처로, 값은 uniform 으로 셰이더 한 종류
- 첫 등장 효과의 셰이더 컴파일 멈칫 → `renderer.compileAsync` 로 로딩 중 미리 굽기. 데울 때 그림자 · 조명 · 안개 설정이 놀 때와 같아야 함
- 그림자 켠 점광원 여러 개 → 점광원 하나 = 그림자 지도 6장. 그림자는 하나만
- 무거운 생성(SDF 굽기 · 장면 짓기 · 텍스처 업로드)은 **프레임당 3ms 예산**으로 나눠서 + 「만드는 중」 표시
- 가장자리 흐림 · 비네트 · 심도로 얼버무리기 금지 (사용자 결정) — 빛 배치로 해결
- 툰은 NoToneMapping 이어야 계단이 또렷, 외곽선 껍데기는 얇은 판 · 투명 · 작은 조각에 붙이지 않기
- 깊이를 다시 그리는 후처리 패스에서 반투명 · 스프라이트를 숨기지 않으면 검은 네모
- 구석 그늘(GTAO) 잡음이 지지직 → 반경 · 샘플 · 잡음 지우기 조절
- 같은 모양 수백 개를 하나씩 그리면 CPU 가 막힘 → 고정 메시 합치기(mergeStatic) · 인스턴싱
- 합성 이벤트로만 시험하면 실제 입력 버그를 놓친다 → 실제 클릭 · 끌기로 확인
- 효과음을 이름 · 파형만 보고 고르면 어색 → 들어 보고, 최고점을 타격 순간에
- 폰(가로 844×390 · 세로 390×844)에서 글씨 · 단추 크기 확인

## 7. 확인

```bash
npx tsc --noEmit -p . 2>&1 | grep src/studio          # 비어야 함
```

- 관련 id 가 있는지: 브라우저 콘솔(개발 서버 `studio.html`)에서
  `const c = await import('/src/studio/catalog.ts'); const d = await import('/src/studio/docs/index.ts');`
  `Object.values(d.DOCS).flatMap(x => [...(x.prev??[]), ...(x.next??[])]).filter(id => !c.TECH.some(t => t.id === id))` → 빈 배열
- 화면: `studio.html#t/<id>` 를 PC(1600×900)와 폰(390×844)으로 찍어 — 머리 배지 · 「AI 에게 시키기」 · 원리 · 핵심 코드 · 「견본 전체 코드 보기」(눌러서 열리는지) · 흔한 실수 · 관련 기술. 콘솔 오류 0
- 주문서를 실제로 한 번 복사해 AI 에 붙여 넣어 보고, 엉뚱하게 만들면 `must` · `done` 을 고친다 (가장 좋은 시험)

## 8. 한 개 본보기 (뼈대)

```ts
  i000: {
    id: 'i000',
    summary: '…을 …해서, …가 …처럼 보이게 한다.',
    terms: [
      { en: 'English standard term', ko: '한 줄 풀이' },
      { en: 'three.js ClassName', ko: '…' },
    ],
    goal: '{target}에 … 를 넣어 줘 — …. 분위기는 {style}.',
    targets: ['견본과 같은 대상', '다른 쓰임 1', '다른 쓰임 2'],
    styles: ['견본 분위기', '귀엽고 아기자기', '어둡고 진지한'],
    platforms: ['three', 'unity', 'godot'],
    platformHints: { unity: 'Unity 는 … (실제 기능 이름).' },
    principle: ['…', '…', '…'],
    when: ['…', '…'],
    avoid: ['… — 대신 …'],
    cost: 'light',
    costNote: '…',
    level: 2,
    must: ['…', '…', '…'],
    done: ['… 이 보인다', '켬/끔 비교로 …', '… 슬라이더로 …', '폰에서도 60fps'],
    code: { lang: 'ts', title: '…', from: 'demos/demosX.ts fn() 을 정리', body: `…` },
    pitfalls: [{ title: '…하면 …된다', fix: '…', seen: true }],
    prev: ['…'],
    next: ['…'],
    refs: [{ name: 'three.js 예제 — …', url: 'https://threejs.org/examples/#…' }],
  },
```

## 9. 레시피 더하기

`src/studio/docs/recipes.ts` 에 한 칸: 대표 견본(hero — 완성 장면이 보이는 기존 견본 id) · 쌓는 순서의 기술 id · 장면 문장(`scene`, 자리표시 가능) · 조건 · 완성 기준 · 기술별 역할(`roles`). 들어간 기술에 문서가 있으면 합친 주문서가 훨씬 좋아진다.

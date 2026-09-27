# NOVA SURGE — 현행판 (3D · Three.js)

**이 레포가 NOVA SURGE 의 유일한 현행 소스다.** 가로 화면 3D 오토파이어 서바이버(graze → SURGE).

> ⚠️ 2D Phaser 세로 슈팅판은 **폐기**됐다(2026-07 3D 재구축으로 대체). 그 코드는 `~/dev/_archive/nova-surge-2d`
> (원격 sh-binx/nova-surge 의 `archive/*` 브랜치·태그)에 보관만 한다. **거기서 작업·자산·로고를 가져오지 말 것** —
> 2026-09-27 앱인토스 이식이 2D판으로 잘못 진행돼 되돌렸다.

## 구조

- `slice/index.html` — **게임 전체(편집 대상)**. 단일 HTML: CrazyGames SDK 스크립트 → Three.js r128 인라인(한 줄) →
  GLTFLoader 인라인 → 게임 코드(약 3926행부터). 빌드 단계 없음 — 이 파일을 직접 고친다.
- `slice/ship*.glb` — 기체 3종 메시 · `slice/og.png` — 링크 미리보기
- `index.html` — 루트 → `./slice/` 리다이렉트
- 배포 = **`git push`** (GitHub Pages: https://sh-binx.github.io/nova-surge-demo/slice/)

## 앱인토스(Apps in Toss) 빌드 — `toss/`

같은 `slice/index.html` 을 입력으로 `nova-surge.ait` 를 만든다(게임 소스는 하나).
- `cd toss && npm ci && npm run build:toss` → `scripts/prepare.mjs`(포털 영역 제거·한글 폰트·GLB 압축) → vite → 번들 스캔 → `ait build`
- 소스의 이음새: `<!--@portal{-->…<!--@portal}-->`·`//@portal{ … //@portal}` 영역(CrazyGames SDK·Supabase·OG)은 토스 번들에서 빠진다.
  게임 코드의 `PF`(= `window.__NS_PF`)가 있으면 광고·저장·리더보드·번역을 토스 플랫폼으로 보낸다 — 포털에선 `PF=null` 이라 기존 동작 그대로.
  **이 마커를 지우거나 옮기면 `prepare.mjs` 가 실패한다**(의도된 안전장치).
- 한국어는 표시 계층 번역(`toss/src/i18n/ko.json`) — 새 영문 문구를 추가하면 사전에도 넣고 `npm run e2e` 의 한국어 스캔으로 확인.
- 검증: `npm run e2e`(toss: 폰 가로 844×390 + this-엄격 SDK mock / portal: 포털판 회귀, Supabase 스텁)
- 콘솔·심의 제출 자료는 `store/`(gitignore — 사업자 정보 포함, 커밋 금지).

## 로컬 실행

포트 대역 **3030–3034** (`PORTS.md`). `sh scripts/serve.sh` — 대역에서 빈 첫 포트로 정적 서버.

## 브랜드 자산

로고·커버는 **게임 타이틀 화면(3D 기체 + 네온 워드마크)** 기준. 2D 픽셀 키아트(`promo/keyart-a.png` 등 2D 레포 자산)는 구버전이다.

## 규약

- 작업 전 `git status`, `git add` 는 스코프 지정만.
- 이 레포는 **공개**다 — 내부 사정·고객 정보를 커밋하지 않는다.

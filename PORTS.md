# Ports — nova-surge

대역: **3030–3034** (정적 서버 — `sh scripts/serve.sh`)

`scripts/serve.sh` 가 이 대역에서 **비어있는 첫 포트를 자동 선택**한다 — 점유된 포트는 건드리지 않는다.

앱인토스 빌드(`toss/`)도 같은 대역을 쓴다 — `npm run dev`(vite, 빈 첫 포트) · `npm run e2e`(빈 포트 2개를 골라 dist 미리보기·포털 정적 서버).

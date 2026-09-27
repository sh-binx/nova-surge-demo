#!/bin/sh
# 3030–3034 중 비어 있는 첫 포트로 레포 루트를 정적 서빙한다(점유 포트는 건드리지 않는다).
cd "$(dirname "$0")/.." || exit 1
for p in 3030 3031 3032 3033 3034; do
  if ! lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "NOVA SURGE → http://localhost:$p/slice/"
    exec python3 -m http.server "$p" --bind 127.0.0.1
  fi
done
echo "3030–3034 가 모두 사용 중" >&2; exit 1

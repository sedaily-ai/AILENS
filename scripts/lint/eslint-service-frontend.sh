#!/usr/bin/env bash
# pre-commit이 레포 루트 기준 경로로 넘겨주는 변경 파일들을, service/frontend
# 를 cwd로 하는 eslint 호출에 맞게 상대경로로 바꿔서 실행한다. cwd가
# service/frontend여야 eslint.config.mjs의 boundaries 플러그인이 그 안의
# tsconfig.json을 정상적으로 resolve한다(레포 루트에서 그냥 npx eslint를
# 돌리면 이 프로젝트의 eslint 설정 자체를 못 찾는다).
set -euo pipefail
cd "$(dirname "$0")/../../service/frontend"

files=()
for f in "$@"; do
  files+=("${f#service/frontend/}")
done
[ ${#files[@]} -eq 0 ] && exit 0

npx eslint "${files[@]}"

#!/usr/bin/env bash
# admin/frontend/deploy-admin.sh 를 admin/ 루트에서 바로 부르는 래퍼
# (2026-09-15, 사용자 요청 — "스크립트를 백엔드랑 프론트 따로 만들어주세요").
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/frontend" && ./deploy-admin.sh

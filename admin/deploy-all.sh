#!/usr/bin/env bash
# admin 프론트엔드 + 백엔드를 한 번에 배포한다 — 각자의 deploy 스크립트를
# 그대로 순서대로 호출할 뿐(로직 중복 없음): frontend/deploy-admin.sh
# (npm build + S3 sync + CloudFront invalidation) 다음 backend/
# deploy-admin-api.sh(zip + Lambda 코드 업데이트). 둘 중 하나만 바뀌었어도
# 그냥 이거 하나만 돌리면 된다(2026-09-15, 사용자 요청 — "프론트 스크립트,
# 백엔드 스크립트를 .sh로 만들고 그거 실행하면 배포되도록").
#
# 사용:
#   ./admin/deploy-all.sh              # 프론트 + 백엔드 둘 다
#   ./admin/deploy-all.sh frontend     # 프론트만
#   ./admin/deploy-all.sh backend      # 백엔드만
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

deploy_frontend() {
  echo "=== admin/frontend 배포 ==="
  (cd "$SCRIPT_DIR/frontend" && ./deploy-admin.sh)
}

deploy_backend() {
  echo "=== admin/backend 배포 ==="
  (cd "$SCRIPT_DIR/backend" && ./deploy-admin-api.sh)
}

case "$TARGET" in
  frontend) deploy_frontend ;;
  backend) deploy_backend ;;
  all)
    deploy_frontend
    deploy_backend
    ;;
  *)
    echo "사용법: $0 [frontend|backend|all]" >&2
    exit 1
    ;;
esac

echo "=== admin 배포 완료 (target=$TARGET) ==="

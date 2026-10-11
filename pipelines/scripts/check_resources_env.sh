#!/usr/bin/env bash
# 배포 스크립트에 리소스 값을 복사하지 않았는지 검사한다(정본: config/resources.env). 어긋나면 비정상 종료.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/config/resources.env"
bad=0
for v in "$SERVICE_CF_DIST_ID" "$ADMIN_CF_DIST_ID" "$CMS_API_INSTANCE_ID" "$ADMIN_S3_BUCKET"; do
  hits=$(grep -rln --include='deploy*.sh' -- "\"$v\"" "$ROOT/service" "$ROOT/admin" "$ROOT/pipelines" 2>/dev/null | grep -v 'pip-cache' || true)
  if [ -n "$hits" ]; then echo "복사된 값 $v:"; echo "$hits"; bad=1; fi
done
exit $bad

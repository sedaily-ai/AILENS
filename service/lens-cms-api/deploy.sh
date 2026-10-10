#!/usr/bin/env bash
# lens-cms-api EC2(PM2 상시 서버, i-0e3d04bdb01584833)에 최신 코드를 배포한다.
#
# 2026-09-18 신설 — 이전까지 이 서비스는 배포 스크립트가 없어서 파일을 손으로
# 고치는 방식이었다(인스턴스에서 실측: admin_posts_repo.py.bak.1789088295 같은
# 에디터 백업 파일이 여러 개 쌓여있고 git도 안 깔려있었다). admin 쪽 Lambda
# 배포(admin/backend/deploy-admin-api.sh)와 같은 원칙 — 패키징 → S3 업로드 →
# 원격 적용 → 헬스체크 — 을 EC2/PM2 상시 서버에 맞게 적용한다.
#
# S3_BUCKET(ailens-ssr-releases)는 새로 만들지 않고 재사용한다 — 이 인스턴스의
# IAM role(ailens-ssr-ec2-role)에 이미 그 버킷 전체 읽기 권한이 있어서(원래
# SSR 릴리스용) 새 권한 부여 없이 바로 쓸 수 있다. 새 prefix(lens-cms-api/)만
# 쓴다.
#
# requirements.txt 해시가 안 바뀌었으면 pip install을 건너뛴다(2026-09-18,
# 사용자 요청 — "속도가 생명" — 매 배포마다 의존성 3개를 재설치할 필요 없음).
#
# 사용:
#   cd service/lens-cms-api
#   ./deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

INSTANCE_ID="i-0e3d04bdb01584833"
REGION="us-east-1"
S3_BUCKET="ailens-ssr-releases"
S3_PREFIX="lens-cms-api"
TARBALL="lens-cms-api-deploy.tar.gz"
REMOTE_DIR="/opt/lens-cms-api"
PUBLIC_HEALTH_URL="http://13.223.179.151/health"

echo "[1/5] Packaging..."
rm -f "/tmp/$TARBALL"
# .bak.* 에디터 잔재는 애초에 담지 않는다 — __pycache__도 제외(pip install 뒤
# 원격에서 다시 생김).
# 이슈 레터 샘플 입력용 파일(스크립트·시드 JSON·DDL)도 같은 묶음에 넣는다 — 서버로 따로 옮기는 단계를 없애려는 것(2026-10-09).
# 서버에서는 /opt/lens-cms-api/{scripts,seed}/ 에 놓인다. 콘텐츠는 여기 남지 않고 스크립트가 관리 API로 RDB에 저장한다.
STAGE="$(mktemp -d)"
chmod 755 "$STAGE"  # mktemp 는 700 으로 만든다 — 묶음의 "." 항목이 서버의 /opt/lens-cms-api 권한을 덮어써 ssm-user 가 못 들어가게 되는 사고(2026-10-09)를 막는다
cp ./*.py requirements.txt ecosystem.config.js "$STAGE/"
mkdir -p "$STAGE/scripts" "$STAGE/seed"
cp scripts/*.py "$STAGE/scripts/"
cp ../../docs/product/모아쓰기레터/seed/issue_letters_seed.json "$STAGE/seed/"
cp ../../docs/architecture/lens-erd-src/lens_schema_v1.38_2026-10-09.sql "$STAGE/seed/"
cp ../../docs/product/모아쓰기레터/seed/topics_seed.json "$STAGE/seed/"
cp ../../docs/architecture/lens-erd-src/lens_schema_v1.42_2026-10-09.sql "$STAGE/seed/"
cp ../../docs/product/모아쓰기레터/seed/interest_bundles_seed.json "$STAGE/seed/"
cp ../../docs/architecture/lens-erd-src/lens_schema_v1.43_2026-10-09.sql "$STAGE/seed/"
cp ../../docs/architecture/lens-erd-src/lens_schema_v1.44_2026-10-09.sql "$STAGE/seed/"
tar czf "/tmp/$TARBALL" \
  --exclude="__pycache__" \
  --exclude="*.bak.*" \
  -C "$STAGE" .
rm -rf "$STAGE"
echo "  [OK] $(du -h "/tmp/$TARBALL" | cut -f1)"

echo "[2/5] Uploading to S3..."
aws s3 cp "/tmp/$TARBALL" "s3://$S3_BUCKET/$S3_PREFIX/$TARBALL" --region "$REGION" --quiet
echo "  [OK] s3://$S3_BUCKET/$S3_PREFIX/$TARBALL"

echo "[3/5] Deploying via SSM..."
# 원격 스크립트는 한 줄짜리 JSON 파라미터 안에 넣기보다 여기서 heredoc으로
# 조립해 --parameters 파일 입력으로 넘긴다 — 따옴표 이스케이프 지옥을 피한다
# (gpu_ipadapter.py가 brief 텍스트를 S3 경유로 넘기는 것과 같은 이유의 축소판).
REMOTE_SCRIPT=$(cat <<EOF
set -e
cd $REMOTE_DIR
aws s3 cp s3://$S3_BUCKET/$S3_PREFIX/$TARBALL /tmp/$TARBALL
find $REMOTE_DIR -maxdepth 1 -name '*.bak.*' -delete
tar xzf /tmp/$TARBALL -C $REMOTE_DIR
rm -f /tmp/$TARBALL

NEW_HASH=\$(sha256sum requirements.txt | awk '{print \$1}')
OLD_HASH=\$(cat .requirements.sha256 2>/dev/null || echo "")
if [ "\$NEW_HASH" != "\$OLD_HASH" ]; then
  echo "requirements.txt 변경됨 — pip install 실행"
  ./venv/bin/pip install --quiet -r requirements.txt
  echo "\$NEW_HASH" > .requirements.sha256
else
  echo "requirements.txt 안 바뀜 — pip install 생략"
fi

pm2 restart lens-cms-api
sleep 2
pm2 list
curl -s -o /dev/null -w "local health: %{http_code}\n" http://127.0.0.1:8000/health
EOF
)

PARAMS_FILE="/tmp/lens-cms-api-ssm-params.json"
printf '%s' "$REMOTE_SCRIPT" > /tmp/lens-cms-api-remote.sh
python3 -c "
import json
with open('/tmp/lens-cms-api-remote.sh') as f:
    lines = f.read().splitlines()
print(json.dumps({'commands': lines}))
" > "$PARAMS_FILE"

CMD_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "file://$PARAMS_FILE" \
  --region "$REGION" \
  --query "Command.CommandId" --output text)
echo "  Command ID: $CMD_ID"

echo "[4/5] Waiting for completion..."
for _ in $(seq 1 30); do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION" \
    --query "Status" --output text 2>/dev/null || echo "Pending")
  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut) break ;;
    *) sleep 2 ;;
  esac
done

RESULT_JSON=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" --region "$REGION")
echo "$RESULT_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d['StandardOutputContent'])
if d['StandardErrorContent']:
    print('--- stderr ---', file=sys.stderr)
    print(d['StandardErrorContent'], file=sys.stderr)
"
FINAL_STATUS=$(echo "$RESULT_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin)['Status'])")
if [ "$FINAL_STATUS" != "Success" ]; then
  echo "[FAIL] 배포 실패 — Status=$FINAL_STATUS" >&2
  exit 1
fi

echo "[5/5] 헬스체크(외부, CloudFront/공인 IP 우회)..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PUBLIC_HEALTH_URL")
echo "  $PUBLIC_HEALTH_URL → $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "WARNING: 헬스체크가 200이 아님 — 수동 확인 필요." >&2
fi

rm -f "/tmp/$TARBALL" /tmp/lens-cms-api-remote.sh "$PARAMS_FILE"
echo ""
echo "=== 배포 완료 ==="

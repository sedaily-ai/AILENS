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
umask 077
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/config/resources.env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

INSTANCE_ID="$CMS_API_INSTANCE_ID"
REGION="us-east-1"
S3_BUCKET="$CMS_RELEASE_BUCKET"
S3_PREFIX="lens-cms-api"
TARBALL="lens-cms-api-deploy.tar.gz"
REMOTE_DIR="/opt/lens-cms-api"
PUBLIC_HEALTH_URL="http://13.223.179.151/health"

# 로컬 계정/SSM 대상 확인은 업로드 이전 읽기 전용 검사다.
test "$(aws sts get-caller-identity --query Account --output text)" = "$AWS_ACCOUNT_ID"
test "$(aws ssm describe-instance-information --filters Key=InstanceIds,Values="$INSTANCE_ID" --region "$REGION" --query 'InstanceInformationList[0].PingStatus' --output text)" = Online

echo "[1/5] Packaging..."
rm -f "/tmp/$TARBALL"
# .bak.* 에디터 잔재는 애초에 담지 않는다 — __pycache__도 제외(pip install 뒤
# 원격에서 다시 생김).
# 이슈 레터 샘플 입력용 파일(스크립트·시드 JSON·DDL)도 같은 묶음에 넣는다 — 서버로 따로 옮기는 단계를 없애려는 것(2026-10-09).
# 서버에서는 /opt/lens-cms-api/{scripts,seed}/ 에 놓인다. 콘텐츠는 여기 남지 않고 스크립트가 관리 API로 RDB에 저장한다.
python3 scripts/package_release.py --output "/tmp/$TARBALL"
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
umask 077
cd $REMOTE_DIR
pm2 describe lens-cms-api >/dev/null
# 필수 운영 환경은 서버 전용 파일로 공급. PM2 템플릿 덮어쓰기 금지.
test -r /etc/lens-cms-api.env
# 2026-10-20 기능 다이어트로 알림 워커를 지웠다. 새 CMS에는 워커 경로가 없어 옛 워커가 1분마다 404로 실패한다.
# 옛 타이머·서비스가 켜져 있거나 유닛 파일이 남아 있으면 배포를 멈추고 정리 명령을 안내한다.
if systemctl is-active --quiet lens-notification-worker.timer || systemctl is-enabled --quiet lens-notification-worker.timer 2>/dev/null || [ -e /etc/systemd/system/lens-notification-worker.timer ] || [ -e /etc/systemd/system/lens-notification-worker.service ]; then
  echo "옛 알림 워커가 남아 있습니다. 먼저 아래 명령으로 정리한 뒤 다시 배포하세요." >&2
  echo "  sudo systemctl disable --now lens-notification-worker.timer lens-notification-worker.service" >&2
  echo "  sudo rm -f /etc/systemd/system/lens-notification-worker.timer /etc/systemd/system/lens-notification-worker.service" >&2
  echo "  sudo systemctl daemon-reload; sudo systemctl reset-failed lens-notification-worker.service lens-notification-worker.timer" >&2
  exit 1
fi
set -a
. /etc/lens-cms-api.env
set +a
: "\${ADMIN_INTERNAL_TOKEN:?내부 인증 토큰 필요}"
# 푸시 암호화 키·발송 모드 검사는 알림 워커와 함께 지웠다(2026-10-20 기능 다이어트). 서버 env의 키 값은 지우지 않는다.
# 새 코드를 풀기 전에 DB 선행 검사 도구만 임시 추출해 실행한다.
aws s3 cp s3://$S3_BUCKET/$S3_PREFIX/$TARBALL /tmp/$TARBALL
PREFLIGHT_DIR=\$(mktemp -d)
tar xzf /tmp/$TARBALL -C "\$PREFLIGHT_DIR" scripts/account_schema.py
./venv/bin/python "\$PREFLIGHT_DIR/scripts/account_schema.py"
rm -rf "\$PREFLIGHT_DIR"
# 코드 복구용 백업: 비밀 파일은 권한을 유지하고 서버 /tmp에만 보관한다.
BACKUP=/tmp/lens-cms-before-\$(date +%Y%m%dT%H%M%S).tar.gz
tar czf "\$BACKUP" --exclude=venv --exclude=__pycache__ -C $REMOTE_DIR .
chmod 600 "\$BACKUP"
echo "rollback archive: \$BACKUP"
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

pm2 restart lens-cms-api --update-env
sleep 2
pm2 list
curl --fail --silent --show-error http://127.0.0.1:8000/health
pm2 save
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
  echo "[FAIL] 헬스체크 실패 — 다음 단계 중단, 서버 /tmp 코드 백업으로 복구 필요." >&2
  exit 1
fi

rm -f "/tmp/$TARBALL" /tmp/lens-cms-api-remote.sh "$PARAMS_FILE"
echo ""
echo "=== 배포 완료 ==="

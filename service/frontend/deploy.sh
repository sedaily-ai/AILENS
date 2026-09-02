#!/usr/bin/env bash
# frontend (AI LENS, ailens.sedaily.ai) SSR 배포 — EC2 + PM2.
#
# 2026-08-08 SSR 전환(EC2+PM2+nginx) 이후 정적 export(S3+CloudFront) 배포는
# 더 이상 안 쓴다. 옛 버전(S3 sync + CloudFront invalidation)은 git 히스토리
# 참조. 이 스크립트는 2026-08-09에 새로 작성 — 그 전까지는 매번 수동으로
# build→tar.gz→S3→SSM extract→symlink→pm2 restart 과정을 재현했다
# (docs/worklog/2026-08/2026-08-09-cache-ttl-tighten-sse-removal.md 참조).
#
# 사용:
#   cd service/frontend
#   ./deploy.sh
#
# 전제:
#   - output: "standalone" (next.config.ts) → .next/standalone/ 생성
#   - AWS CLI credential 유효, EC2에 SSM 세션 매니저로 명령 실행 가능
#     (SSH 인바운드 없음 — ailens-ssr-ec2-role 이 AmazonSSMManagedInstanceCore)
#   - EC2의 .env.production.local(REVALIDATE_SECRET 등)은 새 릴리스로 그대로
#     복사한다 — 이 스크립트가 시크릿 자체를 새로 쓰지는 않는다. 시크릿 값
#     자체를 바꿔야 하면 SSM Parameter Store 갱신 + EC2에서 수동으로
#     .env.production.local 갱신이 별도 필요(이 스크립트 범위 밖).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

S3_RELEASES_BUCKET="ailens-ssr-releases"
AWS_REGION="us-east-1"
EC2_INSTANCE_ID="i-077eb96afcc2597d4"
PM2_PROCESS="ailens-frontend"

echo "=== 1/5 빌드 (standalone) ==="
npm run build

# 2026-08-14에 outputFileTracingRoot를 레포 루트로 넓혔다가(saju/frontend
# 모노레포 트레이싱용) standalone 산출물이 .next/standalone/service/frontend/
# 로 한 단계 깊어져서 이 스크립트가 그 경로를 하드코딩했었는데, 2026-08-15에
# saju/frontend를 완전 독립 앱으로 분리하며 outputFileTracingRoot 자체를
# 제거했다 — 이제 standalone 산출물은 다시 기본 위치인 .next/standalone/
# (server.js가 바로 그 안)로 돌아온다.
STANDALONE_APP_DIR=".next/standalone"

if [ ! -f "$STANDALONE_APP_DIR/server.js" ]; then
  echo "ERROR: $STANDALONE_APP_DIR/server.js 없음 — standalone 빌드 실패. 배포 중단." >&2
  exit 1
fi

echo ""
echo "=== 2/5 릴리스 패키징 ==="
TS="$(date -u +%Y%m%d-%H%M%S)"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

# standalone 산출물은 client 정적 에셋(.next/static)과 public/을 자체적으로
# 포함하지 않는다 — Next 문서대로 별도 복사해야 server.js가 정상 서빙한다.
cp -r "$STANDALONE_APP_DIR/." "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/.next"
cp -r .next/static "$BUILD_DIR/.next/static"
cp -r public "$BUILD_DIR/public"

TARBALL="/tmp/ailens-release-${TS}.tar.gz"
(cd "$BUILD_DIR" && tar -czf "$TARBALL" .)
echo "  [OK] $(du -h "$TARBALL" | cut -f1) — ${TS}"

echo ""
echo "=== 3/5 S3 업로드 ==="
aws s3 cp "$TARBALL" "s3://${S3_RELEASES_BUCKET}/releases/${TS}.tar.gz" \
  --region "$AWS_REGION" \
  --no-progress
rm -f "$TARBALL"

echo ""
echo "=== 4/5 EC2 릴리스 전환 (SSM Run Command) ==="
# .env.production.local은 새로 안 만든다 — 현재 release(current 심볼릭 링크가
# 가리키는 디렉터리)에서 그대로 복사해온다. REVALIDATE_SECRET 등은 배포마다
# 안 바뀌는 값이라 이렇게 이어받는 게 맞다(값 자체를 바꾸는 건 이 스크립트
# 범위 밖 — 위 주석 참조).
SSM_COMMANDS=$(python3 -c "
import json
ts = '${TS}'
bucket = '${S3_RELEASES_BUCKET}'
process = '${PM2_PROCESS}'
cmds = [
    'set -e',
    # 옛 릴리스 정리(2026-08-17) — 이 스텝이 없어서 배포할 때마다 쌓이기만
    # 하다가 72개·4GB까지 차서 루트 디스크(8GB)가 100% 꽉 찼다. 디스크가
    # 꽉 차니 SSM 에이전트도 PM2도 자기 상태 파일을 못 써서 둘 다 멎었고,
    # reboot/stop-start로도 안 풀렸다(디스크는 그대로 꽉 차 있으니까) —
    # 결국 SSH로 직접 들어가 릴리스를 지워서야 풀렸다.
    #
    # 2026-09-02 — 이 정리를 배포 "끝"(pm2 restart 이후)에 두다 보니,
    # `set -e` 때문에 중간(S3 다운로드·tar 압축 해제 등)에서 배포가
    # 실패하면 정리 라인까지 도달을 못 해서 실패한 배포의 잔해가 그대로
    # 남았다 — 그 잔해(비정상적으로 큰 미완성 디렉터리)가 8GB 디스크를
    # 다시 채워 같은 장애가 재발했다(사이트 502, 볼륨 20GB로 증설해
    # 복구). 그래서 정리를 배포 "시작"으로 옮긴다 — 새 릴리스를 받기
    # 전에 먼저 청소해서, 이번 배포가 도중에 실패하더라도 다음 배포
    # 시작 시점에 그 잔해가 반드시 청소되게 한다(최신 4개만 남기고
    # 정리 후 이번 배포로 1개 추가돼 총 5개 유지).
    'ls -1 /opt/ailens/releases 2>/dev/null | sort -r | tail -n +5 | xargs -r -I{} rm -rf /opt/ailens/releases/{}',
    f'REL=/opt/ailens/releases/{ts}',
    'mkdir -p \$REL',
    f'aws s3 cp s3://{bucket}/releases/{ts}.tar.gz /tmp/{ts}.tar.gz --region ${AWS_REGION}',
    f'tar -xzf /tmp/{ts}.tar.gz -C \$REL',
    'cp /opt/ailens/current/.env.production.local \$REL/.env.production.local',
    'ln -sfn \$REL /opt/ailens/current',
    f'cd /opt/ailens/current && pm2 restart {process} --update-env',
    'sleep 2',
    'pm2 list',
    \"curl -s -o /dev/null -w 'local_status=%{http_code}\n' http://localhost:3000/\",
    f'rm -f /tmp/{ts}.tar.gz',
    'df -h / | tail -1',
]
print(json.dumps({'commands': cmds}))
")

COMMAND_ID=$(aws ssm send-command \
  --region "$AWS_REGION" \
  --instance-ids "$EC2_INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "$SSM_COMMANDS" \
  --query "Command.CommandId" \
  --output text)
echo "  Command ID: $COMMAND_ID — 실행 대기..."

aws ssm wait command-executed \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$EC2_INSTANCE_ID" 2>/dev/null || true

STATUS=$(aws ssm get-command-invocation \
  --region "$AWS_REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$EC2_INSTANCE_ID" \
  --query "Status" \
  --output text)

if [ "$STATUS" != "Success" ]; then
  echo "ERROR: EC2 배포 명령 실패 (Status=$STATUS)" >&2
  aws ssm get-command-invocation \
    --region "$AWS_REGION" \
    --command-id "$COMMAND_ID" \
    --instance-id "$EC2_INSTANCE_ID" \
    --query "StandardErrorContent" \
    --output text >&2
  exit 1
fi
echo "  [OK] release ${TS} 적용, PM2 재시작 완료 (fork/1-instance라 수백ms~1초 blip 있음)"

echo ""
echo "=== 5/5 헬스체크 (실도메인) ==="
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://ailens.sedaily.ai/)
echo "  https://ailens.sedaily.ai/ → $HTTP_CODE"
if [ "$HTTP_CODE" != "200" ]; then
  echo "WARNING: 헬스체크가 200이 아님 — 수동 확인 필요." >&2
fi

echo ""
echo "=== 배포 완료 ==="
echo "Release: ${TS}"
echo "URL: https://ailens.sedaily.ai"

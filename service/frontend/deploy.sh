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

# macOS는 다운로드된 파일에 com.apple.quarantine 등 xattr을 붙이는데, cp -r은
# COPYFILE_DISABLE=1을 줘도(이 env var는 옛 macOS의 AppleDouble(._*) 사이드카
# 생성만 막을 뿐, 최신 macOS(Darwin 25+)의 cp -r은 그거와 무관하게 xattr
# 자체를 계속 그대로 복사한다 — 2026-09-03 실제 배포에서 COPYFILE_DISABLE=1을
# 먼저 시도했다가 cp 이후에도 xattr이 그대로 붙어있는 걸 직접 확인하고 폐기)
# 그대로 $BUILD_DIR로 넘어온다. tar -czf가 이 xattr을 AppleDouble/PAX 확장
# 헤더로 아카이브에 담으면, EC2(GNU tar, Linux)는 이 키워드를 몰라
# "Ignoring unknown extended header keyword" 경고를 내는데, 이게 tar를
# 비정상 종료시켜 `set -e`로 배포 4/5 단계가 중단된 적이 있다(2026-09-03,
# public/의 다운로드된 jpg 2개가 원인 — ln -sfn/pm2 restart 전에 죽어서
# 프로덕션 자체는 안 건드리고 끝났다). 그래서 소스 쪽을 막는 대신 tar가
# 아카이브를 "만드는" 시점에 xattr/mac 메타데이터 자체를 안 담게 만드는
# bsdtar 플래그로 확실히 막는다 — public/에 어떤 파일이 어떻게 들어오든,
# 그 파일이 xattr을 갖고 있든 말든 재발을 막는다(로컬 재현으로 검증됨).
NO_MAC_XATTR_TAR_FLAGS=(--no-xattrs --no-mac-metadata --no-acls --no-fflags)

# standalone 산출물은 client 정적 에셋(.next/static)과 public/을 자체적으로
# 포함하지 않는다 — Next 문서대로 별도 복사해야 server.js가 정상 서빙한다.
cp -r "$STANDALONE_APP_DIR/." "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/.next"
cp -r .next/static "$BUILD_DIR/.next/static"
cp -r public "$BUILD_DIR/public"

TARBALL="/tmp/ailens-release-${TS}.tar.gz"
(cd "$BUILD_DIR" && tar "${NO_MAC_XATTR_TAR_FLAGS[@]}" -czf "$TARBALL" .)
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
    # 2026-09-02 — 이 정리를 배포 '끝'(pm2 restart 이후)에 두다 보니,
    # `set -e` 때문에 중간(S3 다운로드·tar 압축 해제 등)에서 배포가
    # 실패하면 정리 라인까지 도달을 못 해서 실패한 배포의 잔해가 그대로
    # 남았다 — 그 잔해(비정상적으로 큰 미완성 디렉터리)가 8GB 디스크를
    # 다시 채워 같은 장애가 재발했다(사이트 502, 볼륨 20GB로 증설해
    # 복구). 그래서 정리를 배포 '시작'으로 옮긴다 — 새 릴리스를 받기
    # 전에 먼저 청소해서, 이번 배포가 도중에 실패하더라도 다음 배포
    # 시작 시점에 그 잔해가 반드시 청소되게 한다.
    #
    # 2026-09-03 — 유지 개수 4→2로 낮췄다(최신 2개만 남기고 정리 후
    # 이번 배포로 1개 추가돼 총 3개 유지). 원인: standalone 산출물은
    # 압축 전 3~4GB대라(release/[slug] 정적 페이지 수에 비례) 4개+1개를
    # 들고 있으면 그 자체로 15~20GB를 먹어, '몇 개까지 유지'만으로는
    # release 크기가 조금만 커져도 다시 디스크풀이 재현되는 걸 실제
    # 장애로 확인했다(lens generateStaticParams가 100→741건으로 늘며
    # release가 897MB로 커져서 5개 누적 시 20GB 루트 볼륨이 100%까지
    # 참 — SSM까지 마비돼 SSH로 직접 복구). 근본 수정은 release 크기
    # 자체를 줄인 것(lens/webtoon/video/listen [slug]/page.tsx의
    # STATIC_PARAMS_LIMIT)이고, 이건 그 위에 얹는 보수적 안전마진.
    'ls -1 /opt/ailens/releases 2>/dev/null | sort -r | tail -n +3 | xargs -r -I{} rm -rf /opt/ailens/releases/{}',
    # /tmp의 옛 릴리스 tarball 정리(2026-09-03, 실제 장애로 발견) — 위
    # releases 정리와 같은 이유·같은 위치(배포 '시작'에 청소)로 하나 더
    # 필요했다. /tmp는 루트 볼륨이 아니라 별도 tmpfs(RAM 기반, 957MB
    # 고정 크기)라 위 AVAIL_KB 사전확인('/'만 본다)이 이 문제를 전혀
    # 못 잡는다 — 이날 실패한 배포 3번이 전부 'rm -f /tmp/{ts}.tar.gz'
    # (배포 끝부분)까지 못 가고 죽어서 잔해가 쌓였고, 결국 tmpfs가
    # 100% 차서(949M/957M) 그다음 배포의 S3 다운로드 자체가 ENOSPC로
    # 실패했다. 새 tarball을 받기 전에 옛것부터 지운다.
    'rm -f /tmp/*.tar.gz',
    # 여유 공간 사전 확인(2026-09-03, 같은 장애 재발 방지) — 정리 후에도
    # 6GB 미만이면 이번 배포를 아예 시작하지 않는다. 예전엔 이 확인이
    # 없어서 tar 압축 해제 도중 ENOSPC로 조용히 부분 실패한 릴리스가
    # 디스크를 마저 채우는 게 실제 장애 원인 중 하나였다 — 여기서 미리
    # 막으면 최소한 '배포 실패'로 명확히 끝나지, 서버 자체가 마비되는
    # 데까지는 안 간다.
    # ⚠️ 이 줄들은 바깥쪽 bash python3 -c 이중따옴표 문자열(위 78번째 줄
    # ~ 아래 137번째 줄 닫는 괄호까지) 안에 있다 — 이 구간 어떤 줄(코드든
    # 주석이든)에도 이스케이프 안 된 쌍따옴표를 쓰면 안 된다. 2026-09-03
    # 실제 배포에서 이 근처 주석에 쌍따옴표 쌍을 썼다가 bash 파싱이 깨져
    # 배포 자체가 실패한 적 있다(SSM_COMMANDS가 깨진 채 python3에 그대로
    # 들어가 SyntaxError로 죽음) — 이 구간엔 항상 홑따옴표만 쓸 것.
    'AVAIL_KB=\$(df --output=avail -k / | tail -1); if [ \$AVAIL_KB -lt 6291456 ]; then echo DEPLOY_ABORT_LOW_DISK avail_kb=\$AVAIL_KB threshold_kb=6291456; df -h /; exit 1; fi',
    f'REL=/opt/ailens/releases/{ts}',
    'mkdir -p \$REL',
    f'aws s3 cp s3://{bucket}/releases/{ts}.tar.gz /tmp/{ts}.tar.gz --region ${AWS_REGION}',
    f'tar -xzf /tmp/{ts}.tar.gz -C \$REL',
    'cp /opt/ailens/current/.env.production.local \$REL/.env.production.local',
    'ln -sfn \$REL /opt/ailens/current',
    # pm2 restart는 '이미 등록된 프로세스 정의'를 그대로 재실행할 뿐,
    # 스크립트 경로를 절대 갱신하지 않는다 — 2026-09-03 실제 장애로 확인:
    # 이 EC2를 최초 세팅한 오늘 새벽(05:29 릴리스) 이후의 모든 배포가
    # 'restart'만 반복해왔는데, pm2가 최초 등록 시점에 잡은 절대경로
    # (/opt/ailens/releases/20260903-052934/server.js)를 그대로 계속
    # 써서 — current 심볼릭 링크는 매번 최신 릴리스를 가리켜도 실제
    # 실행 중이던 코드는 계속 그 옛 릴리스였다(이 세션의 과거 '성공한'
    # 배포들이 실제로는 프로덕션에 반영 안 됐을 가능성이 있다는 뜻).
    # 그러다 그 옛 릴리스 폴더가 보존정리(최신 2개만 유지)로 삭제되자
    # pm2가 재시작할 파일을 못 찾아 502가 났다. delete+start로 매
    # 배포마다 프로세스 정의 자체를 새로 등록해서, current 심볼릭
    # 링크를 항상 새로 따라가게 고친다.
    f'pm2 delete {process} 2>/dev/null || true',
    f'cd /opt/ailens/current && pm2 start server.js --name {process} --cwd /opt/ailens/current --update-env',
    'pm2 save',
    # 재시작 직후 고정 2초만 기다리고 curl 1번으로 헬스체크하면, 서버가
    # 아직 포트 바인딩 전이라 'Connection refused'(curl 자체 종료코드 7)로
    # 오탐 실패가 나고 set -e가 배포 전체를 죽인다(2026-09-03 실제 발생 —
    # 이때는 delete+start 자체는 이미 성공한 뒤였는데도 배포는 Failed로
    # 잘못 보고됐다). 최대 10초까지 1초 간격으로 재시도.
    'for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -f -o /dev/null http://localhost:3000/ && echo LOCAL_HEALTH_OK && break; sleep 1; done',
    'pm2 list',
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

#!/bin/bash
# Deploy script for the AI LENS admin API Lambda (sedaily-mbti-admin-api-dev).
#
# admin 은 flat import 규약을 쓴다 (Handler=handler.lambda_handler). 따라서 zip 루트가
# 이 디렉터리(admin/backend/) 내용 그 자체여야 한다 — v1/v2 소스를 섞지 않는다.
#
# 2026-08-08: service/backend/admin/ → admin/backend/ 로 이동(admin/frontend/ 와
# 짝을 맞추려는 저장소 재구조화). common/(v1/v2/admin 공유 유틸)은 여전히
# service/backend/common/ 에 있다 — admin이 v1/v2와 함께 쓰는 진짜 공유
# 코드라 옮기지 않았고, 아래 COMMON_DIR로 상대경로 참조한다.
#
# ⚠️ admin/frontend/deploy-admin.sh 는 프런트엔드 배포용이다. 이 파일은 백엔드
# Lambda 전용.
#
# .clauderules 준수: 이 스크립트는 함수/역할/라우트/env 를 만들지 않는다.
# update-function-code 만 수행한다.
#
# 실행 (어느 위치에서든 가능 — 스크립트 자신의 위치를 기준으로 경로를 계산한다):
#   ./admin/backend/deploy-admin-api.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
COMMON_DIR="$SCRIPT_DIR/../../service/backend/common"

FUNCTION_NAME="sedaily-mbti-admin-api-dev"
PYTHON_VERSION="3.11"          # Lambda 런타임과 반드시 일치시킬 것
BUILD_DIR="lambda-build-admin"
PACKAGE_FILE="lambda_package_admin.zip"
S3_BUCKET="sedaily-mbti-lambda-packages-dev"
S3_KEY="lambda_package_admin.zip"
AWS_REGION="us-east-1"

echo "[1/4] Building package..."
rm -rf "$BUILD_DIR" "$PACKAGE_FILE"
mkdir -p "$BUILD_DIR"

# 런타임 소스만 (tests 제외).
cp handler.py auth.py __init__.py "$BUILD_DIR/"
cp -r routes shared "$BUILD_DIR/"
cp -r "$COMMON_DIR" "$BUILD_DIR/"   # common/http.py · common/errors.py (CORS 중립 코어)
[ -d repo ] && cp -r repo "$BUILD_DIR/"

# --python-version 은 필수다. 워크스테이션 Python 이 Lambda 런타임(3.11)과 다르면
# argon2-cffi 의 네이티브 의존성(cffi)이 잘못된 ABI 로 설치돼
# "No module named '_cffi_backend'" 로 함수 전체가 죽는다 (2026-07-27 실제 사고).
python3 -m pip install -q -r requirements.txt -t "$BUILD_DIR" \
  --platform manylinux2014_x86_64 \
  --python-version "$PYTHON_VERSION" \
  --implementation cp \
  --only-binary=:all: --upgrade

find "$BUILD_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
rm -rf "$BUILD_DIR/common/tests"
find "$BUILD_DIR" -name "*.pyc" -delete 2>/dev/null || true

# 네이티브 확장이 올바른 ABI 로 들어갔는지 확인 — 없으면 배포해도 함수가 죽는다.
echo "[1b] Verifying native extensions..."
MISSING=""
for mod in _cffi_backend; do
  find "$BUILD_DIR" -name "${mod}*.so" | grep -q . || MISSING="$MISSING $mod"
done
if [ -n "$MISSING" ]; then
  echo "  [FAIL] 네이티브 모듈 누락:$MISSING"
  echo "         pip 이 Lambda(py$PYTHON_VERSION) 용 wheel 을 받지 못했다."
  echo "         --python-version / --platform 옵션을 확인할 것."
  exit 1
fi
echo "  [OK] $(find "$BUILD_DIR" -name '*.so' | wc -l | tr -d ' ') native module(s), ABI 확인됨"

echo "[2/4] Zipping..."
(cd "$BUILD_DIR" && zip -r "../$PACKAGE_FILE" . -q)
echo "  [OK] $(du -h "$PACKAGE_FILE" | cut -f1)"

echo "[3/4] Uploading to S3..."
aws s3 cp "$PACKAGE_FILE" "s3://$S3_BUCKET/$S3_KEY" --region "$AWS_REGION" --quiet
echo "  [OK] s3://$S3_BUCKET/$S3_KEY"

echo "[4/4] Updating function code..."
if aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --s3-bucket "$S3_BUCKET" \
  --s3-key "$S3_KEY" \
  --region "$AWS_REGION" \
  --query 'LastUpdateStatus' --output text >/dev/null 2>&1; then
  echo "  [OK] $FUNCTION_NAME updated"
else
  echo "  [FAIL] update-function-code failed — check AWS credentials and function name"
  exit 1
fi

rm -rf "$BUILD_DIR" "$PACKAGE_FILE"
echo "Done."

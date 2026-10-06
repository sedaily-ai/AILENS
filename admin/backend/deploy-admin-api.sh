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

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
COMMON_DIR="$SCRIPT_DIR/../../service/backend/common"
# 웹툰 이미지 실험(routes/webtoon_lab.py, 2026-09-05)이 flat import로 쓰는
# pipelines/common/webtoon_image.py — admin은 flat import 규약(zip 루트 =
# 이 디렉터리)이라 이 파일 하나만 zip 루트에 그대로 복사한다. 안 하면
# handler.py가 routes.webtoon_lab을 import하는 순간(모듈 로드 시점) 콜드
# 스타트에서 ModuleNotFoundError로 admin API 전체가 죽는다 — 이 route
# 하나만 깨지는 게 아니다.
WEBTOON_IMAGE_MODULE="$SCRIPT_DIR/../../pipelines/common/webtoon_image.py"
# 웹툰 스토리보드 테스트(routes/prompts.py::handle_storyboard_test, 2026-09-11)가
# 쓰는 pipelines/common/json_extract.py — 위와 같은 이유로 zip 루트에 복사
# 필수(안 하면 routes.prompts import 시점에 전체 admin API가 죽는다).
JSON_EXTRACT_MODULE="$SCRIPT_DIR/../../pipelines/common/json_extract.py"
# 2026-09-14 — "실제 발행본과 같은 품질" 요청으로 webtoon_lab.py가 프로덕션
# 웹툰 파이프라인(pipelines/webtoon/pipeline.py)과 같은 이미지 경로를
# 타게 되면서 새로 필요해진 모듈들 — 위 두 파일과 같은 이유로 전부 zip
# 루트에 flat 복사한다.
# 2026-09-25 — GPU_IPADAPTER_MODULE(gpu_ipadapter.py) 줄을 뺐다 — "pipeline"
# 모델 삭제로 그 파일 자체가 삭제됐다(webtoon_image.py 상단 주석 참고).
# 2026-09-28 — REKOGNITION_CLIENT_MODULE 줄을 뺐다. 말풍선 배치용
# Rekognition 얼굴 감지 자체를 제거했다(사용자 결정, webtoon_image.py
# 상단 주석 참고) — 그 파일(pipelines/common/rekognition_client.py)도
# 같이 삭제돼 복사할 게 없다.
BEDROCK_CLIENT_MODULE="$SCRIPT_DIR/../../pipelines/common/bedrock_client.py"
COMPOSE_TEXT_MODULE="$SCRIPT_DIR/../../pipelines/webtoon/compose_text.py"
# 2026-10-02 — 말풍선 얼굴 회피(Rekognition) 토글용. generate.py가 flat import한다.
REKOGNITION_PEOPLE_MODULE="$SCRIPT_DIR/../../pipelines/common/rekognition_people.py"
# webtoon_image.py::_load_prompt_doc()이 flat import로 쓰는
# pipelines/common/ddb_prompt.py — 2026-09-16까지 이 줄이 빠져있어서
# get_style()/get_fixed_characters()가 매번 ModuleNotFoundError로 코드
# 안 안전망(fallback) 값으로 조용히 떨어지고 있었다(실측: CloudWatch
# 로그에 "[webtoon_image] webtoon-image/published 로드 실패
# (ModuleNotFoundError: No module named 'ddb_prompt')"). 안전망 값이
# 마지막 실제 발행값과 우연히 같아서 눈치채기 어려웠다 — 위 세 모듈과
# 같은 이유로 복사 필수.
DDB_PROMPT_MODULE="$SCRIPT_DIR/../../pipelines/common/ddb_prompt.py"
# routes/webtoon_lab.py의 QA 판정 프롬프트(VALIDATE_SYSTEM)가 예전엔 이 파일
# 안에 별도 사본으로 있었다(prompts.py 전체를 복사하기 부담스러워서) — 2026-09-16
# 리팩토링 감사로 정본(pipelines/webtoon/prompts.py) 하나만 남기기로 하고
# 대신 이 파일을 flat 복사한다. webtoon_image만 import하는 가벼운 모듈이라
# 위 다른 common 모듈들과 같은 방식으로 추가해도 부담 없음.
WEBTOON_PROMPTS_MODULE="$SCRIPT_DIR/../../pipelines/webtoon/prompts.py"
# compose_text.py(FONT_PATH)가 "자기 옆의 assets/"를 찾는다 — flat
# 구조에선 zip 루트에 나란히 있어야 해서 그 폴더의 파일을 복사한다.
# 2026-09-25 — STYLE_REF_ASSET(webtoon_style_reference.png) 줄을 뺐다 —
# style_guide 모델 삭제로 이 이미지를 읽던 코드(webtoon_image.py의
# STYLE_REFERENCE_IMAGE_PATH)가 없어졌다.
FONT_ASSET="$SCRIPT_DIR/../../pipelines/webtoon/assets/NotoSansKR-Bold.ttf"
# 2026-10-02 — 웹툰식 말풍선(보통 굵기 글꼴, Pretendard 가변·OFL). compose_text._REGULAR_FONT_PATH가 같은 assets/에서 찾는다.
FONT_ASSET_REGULAR="$SCRIPT_DIR/../../pipelines/webtoon/assets/PretendardVariable.ttf"
# 2026-09-22 — 팟캐스트 음성 설정(routes/prompts.py::handle_update가
# category="podcast-voice"로 그대로 재사용)과 chat_ws.py의 "음성으로
# 듣기"(synthesize_audio WS kind, 사용자 요청: "대본만 텍스트로 출력이
# 되는건가요? 음성도 출력이 되면 좋겠는데")가 flat import로 쓰는
# pipelines/common/podcast_voice.py — 위 웹툰 모듈들과 같은 이유로 zip
# 루트에 복사 필수(안 하면 chat_ws.py import 시점에 admin API 전체가 죽는다).
PODCAST_VOICE_MODULE="$SCRIPT_DIR/../../pipelines/common/podcast_voice.py"
# 2026-09-24 — routes/elevenlabs.py·chat_ws.py(synthesize_audio,
# provider="elevenlabs")가 flat import하는 pipelines/common/
# elevenlabs_tts.py — 위와 같은 이유로 zip 루트 복사 필수.
ELEVENLABS_TTS_MODULE="$SCRIPT_DIR/../../pipelines/common/elevenlabs_tts.py"
# 2026-09-24 — 영상 탭 "성우 미리듣기"(synthesize_audio, format="video")가
# flat import하는 pipelines/common/video_settings.py — 위와 같은 이유.
VIDEO_SETTINGS_MODULE="$SCRIPT_DIR/../../pipelines/common/video_settings.py"

FUNCTION_NAME="sedaily-mbti-admin-api-dev"
PYTHON_VERSION="3.11"          # Lambda 런타임과 반드시 일치시킬 것
BUILD_DIR="lambda-build-admin"
PACKAGE_FILE="lambda_package_admin.zip"
S3_BUCKET="sedaily-mbti-lambda-packages-dev"
S3_KEY="lambda_package_admin.zip"
AWS_REGION="us-east-1"
# 2026-09-29 — requirements.txt 해시가 안 바뀌면 pip install을 건너뛴다
# (lens-cms-api/deploy.sh와 동일 원칙, 사용자 요청 — "배포 잦아질 텐데
# 효과적으로"). BUILD_DIR은 매번 rm -rf로 새로 만들어서 여기엔 캐시를
# 못 둔다 — 대신 별도 영속 디렉터리(.pip-cache-admin/deps)에 설치해두고
# 매번 BUILD_DIR로 복사만 한다.
DEP_CACHE_DIR=".pip-cache-admin"
DEP_HASH_FILE="$DEP_CACHE_DIR/.requirements.sha256"

echo "[1/4] Building package..."
rm -rf "$BUILD_DIR" "$PACKAGE_FILE"
mkdir -p "$BUILD_DIR"

# 런타임 소스만 (tests 제외).
cp handler.py auth.py __init__.py openai_image.py "$BUILD_DIR/"
cp -r routes shared "$BUILD_DIR/"
cp -r "$COMMON_DIR" "$BUILD_DIR/"   # common/http.py · common/errors.py (CORS 중립 코어)
cp "$WEBTOON_IMAGE_MODULE" "$BUILD_DIR/"   # pipelines/common/webtoon_image.py (위 주석 참고)
cp "$JSON_EXTRACT_MODULE" "$BUILD_DIR/"    # pipelines/common/json_extract.py (위 주석 참고)
cp "$BEDROCK_CLIENT_MODULE" "$COMPOSE_TEXT_MODULE" "$REKOGNITION_PEOPLE_MODULE" "$DDB_PROMPT_MODULE" "$WEBTOON_PROMPTS_MODULE" "$PODCAST_VOICE_MODULE" "$ELEVENLABS_TTS_MODULE" "$VIDEO_SETTINGS_MODULE" "$BUILD_DIR/"
mkdir -p "$BUILD_DIR/assets"
cp "$FONT_ASSET" "$FONT_ASSET_REGULAR" "$BUILD_DIR/assets/"
[ -d repo ] && cp -r repo "$BUILD_DIR/"

# --python-version 은 필수다. 워크스테이션 Python 이 Lambda 런타임(3.11)과 다르면
# argon2-cffi 의 네이티브 의존성(cffi)이 잘못된 ABI 로 설치돼
# "No module named '_cffi_backend'" 로 함수 전체가 죽는다 (2026-07-27 실제 사고).
NEW_HASH="$(sha256sum requirements.txt | awk '{print $1}')"
OLD_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo "")"
if [ "$NEW_HASH" != "$OLD_HASH" ] || [ ! -d "$DEP_CACHE_DIR/deps" ]; then
  echo "  requirements.txt 변경됨(또는 최초 실행) — pip install 실행"
  rm -rf "$DEP_CACHE_DIR/deps"
  mkdir -p "$DEP_CACHE_DIR/deps"
  python3 -m pip install -q -r requirements.txt -t "$DEP_CACHE_DIR/deps" \
    --platform manylinux2014_x86_64 \
    --python-version "$PYTHON_VERSION" \
    --implementation cp \
    --only-binary=:all: --upgrade
  echo "$NEW_HASH" > "$DEP_HASH_FILE"
else
  echo "  requirements.txt 안 바뀜 — pip install 생략(캐시 재사용)"
fi
cp -r "$DEP_CACHE_DIR/deps/." "$BUILD_DIR/"

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

echo "[5/5] Health check..."
# 인증 없이 부르니 401이 정상(핸들러가 실제로 실행돼 요청을 처리했다는 뜻) —
# 여기서 확인하려는 건 그게 아니라 5xx(콜드스타트 크래시, import 실패 등
# 배포 자체가 깨진 경우)가 안 뜨는지다.
sleep 2
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/admin/posts")
echo "  GET /dev/admin/posts (무인증) → $HTTP_CODE"
if [ "$HTTP_CODE" -ge 500 ]; then
  echo "  [FAIL] 5xx — 배포가 깨졌을 수 있다. CloudWatch 로그 확인 필요." >&2
  exit 1
fi
echo "  [OK] 함수가 정상 응답 중"

echo "Done."

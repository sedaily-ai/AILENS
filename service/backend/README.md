# service/backend — AI LENS 공개 API

Lambda(Python) 함수 20여 개, API Gateway(`chzwwtjtgk`) 뒤. 레이어 구조는
`CLAUDE.md`(이 폴더) 참조. 이 파일은 실행·배포만.

## 배포 — `./deploy.sh`

```bash
cd service/backend
./deploy.sh          # 전체 함수 배포(기본값 = api, 사실상 동의어)
```

zip **하나**를 만들어서 `deploy.sh`에 하드코딩된 함수 이름 목록(20여 개,
`sedaily-mbti-v2-*-dev` 레거시 이름 포함) 전부에 `update-function-code`를
돌린다. 빌드 순서:

1. Linux(manylinux2014, Python 3.11)용 의존성을 `lambda-build/`에 설치
2. `clients handlers config core models repositories services utils common newsletter` +
   `prompts/` 복사
3. `__pycache__`/`*.pyc` 정리 후 `lambda_package.zip`으로 압축
4. 목록의 각 함수에 순차적으로 `update-function-code`

## 나의 LENS 계정 API 배포

```bash
cd service/backend
export ACCOUNT_RELEASE_BACKUP_DIR="$(mktemp -d /tmp/lens-account-release.XXXXXX)"
./deploy.sh account
```

`account`는 dashboard·archive만 갱신하고 dashboard 신규 함수와 Gateway 경로를 준비한다.
DB v1.48~55와 CMS 적용이 선행돼야 한다. 환경·인증·복구를 포함한 전체 절차는
[나의 LENS 배포 실행 명령](../../docs/product/나의LENS/배포실행_명령.md)을 따른다.
운영 적용 전용 명령이며 로컬 검증 목적으로 실행하지 않는다.

## ⚠️ 함수 하나만 고쳤을 땐 이 스크립트를 그대로 돌리지 않는다

`deploy.sh`를 실행하면 이번에 안 건드린 19개 함수까지 **같은 zip**으로
전부 재배포된다 — 코드 변경이 없어도 `LastModified`가 갱신되고, 콜드
스타트가 한 번씩 발생하며, 무엇보다 "이번 배포가 정확히 뭘 바꿨는지"가
불명확해진다.

핸들러 하나만 고쳤으면(예: `cms_posts_public.py`), `deploy.sh`의 1~3단계
(빌드) 그대로 재현하되 마지막 단계만 범위를 좁힌다:

```bash
rm -rf lambda-build lambda_package.zip
mkdir lambda-build
pip3 install \
  httpx==0.27.0 python-dotenv==1.0.1 requests==2.32.3 beautifulsoup4==4.12.3 \
  boto3 botocore pg8000==1.31.2 "PyJWT[crypto]==2.10.1" \
  -t lambda-build --platform manylinux2014_x86_64 --python-version 3.11 \
  --only-binary=:all: --upgrade --no-cache-dir --quiet
for dir in clients handlers config core models repositories services utils common newsletter; do
  [ -d "$dir" ] && cp -r "$dir" lambda-build/
done
[ -d prompts ] && cp -r prompts lambda-build/
find lambda-build -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find lambda-build -type f -name "*.pyc" -delete 2>/dev/null
cd lambda-build && zip -r ../lambda_package.zip . -q && cd ..

aws lambda update-function-code \
  --function-name <바뀐 함수 하나만, 예: sedaily-mbti-v2-posts-dev> \
  --zip-file fileb://lambda_package.zip --region us-east-1

rm -rf lambda-build lambda_package.zip
```

블라스트 반경을 그 함수 하나로 제한하려는 의도적 선택 — 2026-08-23
`cms_posts_public.py` 변경 때 이 패턴을 썼다(`docs/worklog/2026-08/`
해당 날짜 항목 참조). 여러 함수를 동시에 고쳤으면 그때는 `deploy.sh`를
그대로 쓰는 게 맞다.

## 관련 배포 스크립트(같은 저장소, 다른 서비스)

- `admin/backend/deploy-admin-api.sh` — admin API Lambda 전용(별도 함수,
  별도 zip 규약 — flat import).
- `admin/frontend/deploy-admin.sh` — admin 콘솔 프런트엔드(S3+CloudFront).
- `service/frontend/deploy.sh` — 공개 사이트 Next.js SSR(ECS Fargate).
- `pipelines/frontpage_auto/deploy.sh` — mustknow_auto/frontpage_auto가
  공유하는 Docker 이미지(ECS Fargate) 배포.

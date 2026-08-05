# COMMANDS.md — v2 작업 자주 쓰는 명령어

**목적**: Claude Code가 명령어를 **추측하지 않도록** 검증된 명령어를 모아둠. 여기 없는 명령어는 공식 AWS 문서 확인하거나 사용자에게 확인.

모든 명령어는 `backend/` 디렉터리 기준. 다른 위치에서 실행해야 하면 명시.

---

## 🏗️ 환경 세팅

```bash
# Python 의존성 설치 (v2 전용)
cd backend
pip install -r v2/requirements.txt

# 로컬 환경변수 로드 (.env.v2 존재 시)
export $(cat v2/.env.v2 | grep -v '^#' | xargs)

# AWS 자격증명 확인
aws sts get-caller-identity
# 기대: Account = 887078546492
```

---

## 🧪 코드 검증

### 문법 확인 (매 파일 저장 후)
```bash
python3 -c "import ast; ast.parse(open('v2/clients/pgvector_v2_client.py').read())"
```

### Import 확인
```bash
cd backend
python3 -c "from v2.clients.pgvector_v2_client import PgVectorV2Client; print('OK')"
```

### 타입 체크 (선택)
```bash
cd backend
python3 -m mypy v2/ --ignore-missing-imports
```

### 테스트 실행
```bash
# 단위 테스트만 (integration 제외, AWS 리소스 불필요)
cd backend
python3 -m pytest v2/tests/ -v -m 'not integration'

# 통합 테스트 포함 (PG_V2_HOST 환경변수 필요)
python3 -m pytest v2/tests/ -v

# 특정 파일만
python3 -m pytest v2/tests/test_pgvector_v2_client.py -v

# 특정 테스트만
python3 -m pytest v2/tests/test_pgvector_v2_client.py::test_insert_article -v
```

### Performance test thresholds
- **Local** (default): ceiling-only (3000ms), catches catastrophic regression.
- **VPC** (`BENCHMARK_ENV=aws_vpc`): tight 200ms production target.
- Network latency varies wildly between these — do **NOT** treat local p95
  as a meaningful performance metric. Use it as a regression detector only.
  Measured Korea ↔ us-east-1 baseline was ~800ms, which makes anything
  under 1s indistinguishable from network jitter.

```bash
# Local (opt-in): regression detector only, loose ceiling
python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m slow

# In-VPC (Lambda/EC2 inside the RDS VPC): enforces production p95
BENCHMARK_ENV=aws_vpc python3 -m pytest v2/tests/ -v -m slow

# See live p95 log (local mode logs it even on PASS)
python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m slow --log-cli-level=INFO
```

---

## 🚀 배포

### v2 Lambda 전체 배포
```bash
cd backend
./v2/deploy-v2.sh
```

### v2 일부만
```bash
./v2/deploy-v2.sh collector        # Core 1만
./v2/deploy-v2.sh transform        # Core 2만
./v2/deploy-v2.sh personalization  # Core 3만 (Chat Agent 제외)
./v2/deploy-v2.sh chat-agent       # Chat Agent (Docker + ECR + AgentCore)
```

### 단일 Lambda 코드만 업데이트 (Claude Code OK)
```bash
# 이미 존재하는 함수의 코드만 교체 — 사람 개입 불필요
aws lambda update-function-code \
  --function-name sedaily-mbti-v2-collector-dev \
  --s3-bucket sedaily-mbti-lambda-packages-dev \
  --s3-key lambda_package_v2.zip \
  --region us-east-1
```

---

## 📊 pgvector v2 작업

### 연결 테스트
```bash
# 환경변수 확인
echo $PG_V2_HOST
echo $PG_V2_PASSWORD  # 실제 비밀번호 출력 주의

# psql 접속 (psql 설치되어 있어야 함)
PGPASSWORD="$PG_V2_PASSWORD" psql \
  -h "$PG_V2_HOST" \
  -U ailens \
  -d ailens_v2 \
  -p 5432
```

### 스키마 초기화 (TASK-1.2)
```bash
# dry-run
cd backend
python3 v2/infrastructure/init_pgvector_v2.py --dry-run

# 실제 실행
python3 v2/infrastructure/init_pgvector_v2.py
```

### 테이블 확인
```sql
\dt                                    -- 모든 테이블
\d articles                            -- articles 테이블 구조
\di                                    -- 모든 인덱스

SELECT status, COUNT(*) FROM articles GROUP BY status;
-- 기대: raw / transformed / failed 별 건수

SELECT COUNT(*) FROM article_versions;
-- 기대: articles.transformed 건수 × 4
```

### 상태 리셋 (개발 중에만)
```sql
-- 실패 재처리
UPDATE articles SET status = 'raw' WHERE status = 'failed';

-- 특정 기사만 재변환
UPDATE articles SET status = 'raw' WHERE news_id = 'NEWS_ID_HERE';
DELETE FROM article_versions WHERE news_id = 'NEWS_ID_HERE';
```

**주의**: 프로덕션에서 `UPDATE/DELETE` 전에 반드시 `SELECT`로 대상 확인. WHERE 절 빠지면 재앙.

---

## 🪣 S3 v2 작업

### 버킷 내용 확인
```bash
# 전체 목록
aws s3 ls s3://sedaily-mbti-article-body-v2-dev/ --recursive | head -20

# 특정 기사의 파일들
aws s3 ls s3://sedaily-mbti-article-body-v2-dev/articles/NEWS_ID/

# 내용 확인
aws s3 cp s3://sedaily-mbti-article-body-v2-dev/articles/NEWS_ID/original.json -
aws s3 cp s3://sedaily-mbti-article-body-v2-dev/articles/NEWS_ID/version_NT.json -
```

### 버킷 크기
```bash
aws s3api list-objects-v2 \
  --bucket sedaily-mbti-article-body-v2-dev \
  --query 'sum(Contents[].Size)' \
  --output text | awk '{printf "%.2f MB\n", $1/1024/1024}'
```

---

## 🤖 Bedrock 호출 (로컬 테스트)

### Opus 4.6 호출 테스트 (비용 주의!)
```bash
cd backend
python3 -c "
import boto3, json
client = boto3.client('bedrock-runtime', region_name='us-east-1')
response = client.invoke_model(
    modelId='us.anthropic.claude-opus-4-6-v1:0',
    body=json.dumps({
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 100,
        'messages': [{'role': 'user', 'content': 'Hello in Korean'}]
    })
)
print(json.loads(response['body'].read()))
"
```

### Titan V2 임베딩 테스트
```bash
python3 -c "
import boto3, json
client = boto3.client('bedrock-runtime', region_name='us-east-1')
response = client.invoke_model(
    modelId='amazon.titan-embed-text-v2:0',
    body=json.dumps({
        'inputText': '서울경제 테스트 문장',
        'dimensions': 1024,
        'normalize': True
    })
)
body = json.loads(response['body'].read())
print(f'embedding dim: {len(body[\"embedding\"])}')
print(f'first 5: {body[\"embedding\"][:5]}')
"
```

---

## 📋 CloudWatch 로그

### Collector Lambda 로그 실시간
```bash
aws logs tail /aws/lambda/sedaily-mbti-v2-collector-dev --follow --region us-east-1
```

### 최근 에러만 필터링
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/sedaily-mbti-v2-transform-dev \
  --filter-pattern "ERROR" \
  --start-time $(date -v-1H +%s)000 \
  --region us-east-1
```

### Transform Lambda 토큰 사용량 (비용 모니터링)
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/sedaily-mbti-v2-transform-dev \
  --filter-pattern "tokens=" \
  --start-time $(date -v-1d +%s)000 \
  --region us-east-1 \
  --query 'events[].message'
```

---

## 🐳 Chat Agent (Phase 4)

### 로컬 빌드 + 실행
```bash
cd backend/v2/agents/chat_agent

# ARM64 빌드 (Mac M1/M2는 native, Intel은 buildx 필요)
docker buildx build --platform linux/arm64 -t sedaily-mbti-chat-agent:local .

# 로컬 실행 (포트 8000)
docker run --rm -p 8000:8000 \
  -e PG_V2_HOST="$PG_V2_HOST" \
  -e PG_V2_PASSWORD="$PG_V2_PASSWORD" \
  sedaily-mbti-chat-agent:local

# 다른 터미널에서 MCP initialize 테스트
curl -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### ECR push
```bash
# 로그인
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  887078546492.dkr.ecr.us-east-1.amazonaws.com

# 태그 & push
GIT_SHA=$(git rev-parse --short HEAD)
docker tag sedaily-mbti-chat-agent:local \
  887078546492.dkr.ecr.us-east-1.amazonaws.com/sedaily-mbti-chat-agent:$GIT_SHA
docker tag sedaily-mbti-chat-agent:local \
  887078546492.dkr.ecr.us-east-1.amazonaws.com/sedaily-mbti-chat-agent:latest
docker push 887078546492.dkr.ecr.us-east-1.amazonaws.com/sedaily-mbti-chat-agent:$GIT_SHA
docker push 887078546492.dkr.ecr.us-east-1.amazonaws.com/sedaily-mbti-chat-agent:latest
```

### AgentCore CLI (사람이 실행)
```bash
# 최초 배포 — 사람이 실행
agentcore configure
agentcore deploy \
  --name sedaily-mbti-chat-agent-v2-dev \
  --image 887078546492.dkr.ecr.us-east-1.amazonaws.com/sedaily-mbti-chat-agent:latest \
  --protocol mcp

# Runtime 호출 테스트
aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn arn:aws:bedrock-agentcore:us-east-1:887078546492:runtime/sedaily-mbti-chat-agent-v2-dev \
  --payload '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

---

## 🔍 디버깅

### Lambda 500 에러 — Durable Functions 함정

**증상**: CloudWatch 로그는 `"Handler ... completed with status 200"` + `platform.report status: success`로 성공, 하지만 `curl`은 HTTP 500 + body `{"errorMessage":"Invalid Status in invocation output.","errorType":"InvalidParameterValueException"}`.

**근본 원인**: Lambda 생성 시 Python 3.14 선택 + durable execution 옵션이 enabled 상태로 만들어짐 (AWS re:Invent 2025 신기능, Python 3.14-only). Durable Function은 `DurableContext` 기반 checkpoint/step 실행 모델이라, 일반 API Gateway HTTP proxy integration이 기대하는 `{statusCode, headers, body}` 반환 포맷과 **호환되지 않음**. 구체적으로:

- Lambda runtime은 핸들러 실행 자체는 정상으로 처리하고 CloudWatch에 `status 200 completed` + `platform.report status: success`를 남김
- 그 다음 Lambda 서비스가 invocation output을 durable execution state로 해석하려다 "Invalid Status"로 거부 — 이 에러는 **CloudWatch에 찍히지 않고** Invoke API response payload로만 반환됨
- CloudWatch의 `platform.initStart` 이벤트 `runtimeVersion` 필드에 `DurableFunction` 빌드 태그 포함 (예: `python:3.14.DurableFunction.v12`)

AWS 콘솔에서 Python 3.14 선택 시 "Enable durable execution" 옵션이 눈에 잘 안 띄는 위치(Function URL/Advanced settings 근처)에 있고, 기본 활성화 또는 실수로 체크될 수 있음.

**확인 명령**:
```bash
# 1) Runtime + Durable 관련 필드 전체 확인
aws lambda get-function-configuration \
  --function-name FN_NAME --region us-east-1 --output json \
  | python3 -c "
import json, sys
cfg = json.load(sys.stdin)
print(f'Runtime: {cfg.get(\"Runtime\")}')
for k, v in cfg.items():
    if k.startswith('Durable'):
        print(f'{k}: {v}')
"
# 기대값 (일반 Lambda):  Runtime: python3.11 또는 python3.12, Durable* 필드 없음
# Durable Function 징후: Runtime: python3.14, Durable* 필드 존재

# 2) runtimeVersion 빌드 태그 확인 (CloudWatch 로그)
aws logs tail /aws/lambda/FN_NAME --since 10m --region us-east-1 --format short \
  | grep runtimeVersion
# DurableFunction 포함 여부 확인 (예: "python:3.14.DurableFunction.v12")

# 3) Direct invoke로 진단 (API Gateway 경로 우회)
aws lambda invoke --function-name FN_NAME --qualifier '$LATEST' --region us-east-1 \
  --payload '{"httpMethod":"GET"}' --cli-binary-format raw-in-base64-out /tmp/out.json
cat /tmp/out.json
# "Invalid Status in invocation output" 나오면 Durable Functions 확정
```

**해결**: Durable 설정은 함수 생성 이후 비활성화 가능한지 불확실함 — 시도 시 `"You cannot use a managed runtime that does not support a durable configuration"` 에러가 발생하여 Runtime 변경도 막힘. **가장 확실한 방법은 함수 삭제 후 재생성**:

1. AWS 콘솔에서 해당 Lambda 삭제
2. 같은 이름으로 재생성하되 **Runtime은 `Python 3.11`로, "Enable durable execution" 옵션은 체크하지 말 것**
3. S3 zip location: `sedaily-mbti-lambda-packages-dev/lambda_package_v2.zip`
4. Handler: `v2.handlers.<name>.lambda_handler`
5. API Gateway 라우트는 Lambda 이름이 같으면 integration 재연결만 필요 (라우트 자체는 유지)
6. `curl`로 재검증 — 정상이면 `{"status":"ok","version":"v2"}` 반환

프로덕션 트래픽 없는 Lambda라면 삭제/재생성 비용은 0에 가까움(~5분). 트래픽 있는 함수라면 blue/green 재생성(새 이름 → API Gateway 라우트 스왑) 고려.

**예방**: v2는 당분간 `python3.11` 고정. `deploy-v2.sh`가 `--python-version 3.11 --platform manylinux2014_x86_64`로 wheel 빌드하므로 런타임 일치시키는 게 ABI 측면에서도 안전. `deploy-v2.sh`에 사전 체크(Runtime + Durable* 필드) 포함되어 있어, 잘못 만들어진 Lambda는 `update-function-code` 전에 `[WARN]` + `[SKIP]`으로 차단됨. 새 v2 Lambda 만들 때 콘솔 폼을 꼼꼼히 확인 — 특히 Python 3.14를 선택하지 않는 것이 1차 방어선.

---

### Lambda 함수 설정 확인
```bash
aws lambda get-function-configuration \
  --function-name sedaily-mbti-v2-collector-dev \
  --region us-east-1 \
  --query '{Env:Environment,Timeout:Timeout,Memory:MemorySize,Runtime:Runtime,Role:Role}'
```

### Lambda 환경변수 업데이트 (사람이 실행)
```bash
aws lambda update-function-configuration \
  --function-name sedaily-mbti-v2-collector-dev \
  --region us-east-1 \
  --environment "Variables={PG_V2_HOST=xxx,PG_V2_PASSWORD=xxx,...}"
```

### EventBridge 규칙 확인
```bash
aws events list-rules --name-prefix sedaily-mbti-v2 --region us-east-1
aws events describe-rule --name sedaily-mbti-v2-collector-schedule --region us-east-1
```

### API Gateway 라우트 확인
```bash
# API ID는 chzwwtjtgk
aws apigatewayv2 get-routes --api-id chzwwtjtgk --region us-east-1 \
  --query 'Items[?contains(RouteKey, `/v2/`)]'
```

---

## 💰 비용 모니터링

### 오늘 Bedrock 사용량
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-1d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}'
```

### 주간 Lambda 비용
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["AWS Lambda"]}}'
```

---

## 🆘 긴급 상황

### v2 Lambda 전체 비활성화 (concurrency 0)
```bash
for fn in sedaily-mbti-v2-collector-dev sedaily-mbti-v2-transform-dev sedaily-mbti-v2-feed-dev; do
  aws lambda put-function-concurrency \
    --function-name "$fn" \
    --reserved-concurrent-executions 0 \
    --region us-east-1
done
```

### EventBridge 스케줄 정지
```bash
aws events disable-rule --name sedaily-mbti-v2-collector-schedule --region us-east-1
aws events disable-rule --name sedaily-mbti-v2-transform-trigger --region us-east-1
```

### pgvector v2 긴급 백업
```bash
# Point-in-time recovery는 RDS 기본. 스냅샷만 찍어두기:
aws rds create-db-snapshot \
  --db-instance-identifier sedaily-mbti-pgvector-v2-dev \
  --db-snapshot-identifier sedaily-mbti-pgvector-v2-emergency-$(date +%Y%m%d%H%M) \
  --region us-east-1
```

---

## 📝 참고 링크

- AgentCore 공식 문서: https://docs.aws.amazon.com/bedrock-agentcore/
- MCP 프로토콜: https://modelcontextprotocol.io/
- pgvector 문서: https://github.com/pgvector/pgvector
- Bedrock 모델 가격: https://aws.amazon.com/bedrock/pricing/
- Titan V2 임베딩: https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html

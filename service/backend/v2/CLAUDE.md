# CLAUDE.md — AI LENS v2

**이 문서는 `service/backend/v2/` 안에서 작업할 때 Claude Code가 가장 먼저 읽어야 할 맥락 문서다.**

루트 `/CLAUDE.md`는 v1(현재 운영 중) 기준이고 이 문서는 v2(신규 구축 중) 기준이다. 루트 문서와 이 문서가 충돌하면 **이 문서가 우선**한다 — 단, 그 경우에도 루트 문서가 설명하는 v1 동작은 건드리지 않는다.

---

## 0. 현재 상황을 한 문장으로

> v1은 프로덕션에서 계속 돌고 있다. v2는 `service/backend/v2/` 안에서 **병행 구축 중**이며, v1 파일을 수정하지 않는다.

## 1. 왜 v2를 만드나

v1의 구조적 한계:
- 하루 ~30개만 선별 변환(Nova) → 나머지는 버려짐
- DynamoDB + OpenSearch + pgvector 3곳에 데이터 흩어짐
- 모든 유저가 같은 피드(MBTI 필터만)
- 읽은 기록 외에 메모리 없음
- Step Functions 체인으로 에이전트 간 통신

v2가 목표로 하는 것:
- **전체 수집·전체 변환**, 선별은 개인화 단계에서
- **pgvector 중심 허브** + S3 body storage
- **유저별 개인화 랭킹** (MBTI + 행동 학습)
- **4-type memory**: Short-term / Semantic / Episodic / Procedural
- **Context Broker**로 레이어드 context 조립
- **Chat Agent만 AgentCore Runtime**, 나머지는 Lambda (하이브리드)

자세한 아키텍처: 루트의 `AI_LENS_V2_ARCHITECTURE.md`
단계별 계획: 루트의 `AI_LENS_V2_MIGRATION_ROADMAP.md`
작업 체크리스트: 이 디렉터리의 `TASKS.md`
절대 규칙: 이 디렉터리의 `.clauderules`
명령어: 이 디렉터리의 `COMMANDS.md`

## 2. 3-Core 아키텍처 요약

```
Core 1: Collection         Core 2: Transform           Core 3: Personalization
서울경제 XML  ──raw──▶  Opus 4.6 x4 병렬  ──vers──▶  Memory + Ranking
전체 수집               NT/NF/ST/SF                    개인화 피드
pgvector articles       pgvector article_versions      Context Broker
(status='raw')          (status='transformed')         (Memory Manager)
```

- **Core 1** = Collector Lambda (EventBridge 3h). 선별 없음. 전체 수집 → 임베딩 → pgvector + S3.
- **Core 2** = Transform Lambda + Validator Lambda. Opus 4.6으로 4 버전 생성, Nova Lite 검증.
- **Core 3** = Context Broker + Recommend Agent (Lambda) + Chat Agent (AgentCore Runtime).

## 3. 디렉터리 구조 (구축 중)

```
service/backend/v2/
├── CLAUDE.md              ← 이 문서
├── TASKS.md               ← PR 단위 체크리스트
├── .clauderules           ← 해도 되는 것 / 안 되는 것
├── COMMANDS.md            ← 자주 쓰는 명령어
├── deploy-v2.sh           ← v2 전용 배포 스크립트 (TASK-0.2에서 생성)
├── requirements.txt       ← v2 전용 의존성 (pg8000, boto3, mcp 등)
├── clients/               ← pgvector_v2_client, 필요시 추가
├── handlers/              ← Lambda 엔트리 포인트
│   ├── core1_collector.py
│   ├── core2_transform.py
│   ├── core2_validator.py
│   ├── core3_feed.py
│   ├── core3_article.py
│   └── core3_record_interaction.py
├── core3/                 ← 개인화 엔진 라이브러리
│   ├── context_broker.py
│   ├── memory_manager.py
│   └── recommend_agent.py
├── agents/
│   └── chat_agent/        ← ARM64 컨테이너, AgentCore 배포용
│       ├── Dockerfile
│       ├── server.py      ← FastMCP
│       └── tools/
├── infrastructure/
│   ├── provision_pgvector_v2.sh
│   └── schema_v2.sql
└── tests/
    ├── test_pgvector_v2.py
    ├── test_core1_collector.py
    └── ...
```

**아직 존재하지 않는 디렉터리는 TASK 진행 중 생성한다.** 지금 한꺼번에 만들지 않는다.

## 4. 재사용 자산 (v1에서 import)

아래는 **v1 코드를 건드리지 않고 import만** 한다:

```python
# 재사용 OK — import만, 수정 금지
from clients.embedding_client import EmbeddingClient          # Titan V2
from clients.mbti_transform_service import MbtiTransformService  # Opus 4.6 4병렬
from clients.s3_article_client import S3ArticleClient
from clients.s3_xml_client import S3XMLClient                 # XML 파싱
from core.decorators import lambda_handler                    # 핸들러 데코레이터
from core.response import success_response, error_response
from core.exceptions import BackendError, NotFoundError, ValidationError
from config.constants import (
    BEDROCK_MODEL_ID_OPUS, BEDROCK_MODEL_ID_HAIKU,
    BEDROCK_MODEL_ID_NOVA_LITE, BEDROCK_EMBEDDING_MODEL_ID,
    BEDROCK_EMBEDDING_DIMENSION, MBTI_GROUPS,
    CATEGORIES_KOREAN, CATEGORY_NORMALIZATION_MAP,
)
# 프롬프트 자산도 그대로
from services.prompt_loader import load_prompt  # prompts/transform/{nt,nf,st,sf}.md
```

**주의**: v1 import는 `deploy-v2.sh`가 v1 디렉터리를 Lambda 패키지에 함께 포함시키는 방식으로 해결한다. import 경로는 `service/backend/` 루트 기준으로 한다 (`from clients.xxx`가 v1 `service/backend/clients/xxx`를 의미하도록).

## 5. v1 ↔ v2 리소스 네이밍

| 리소스 | v1 | v2 |
|---|---|---|
| Lambda | `sedaily-mbti-{name}-dev` | `sedaily-mbti-{name}-v2-dev` |
| RDS pgvector | `sedaily-mbti-pgvector-dev` (db.t3.micro) | `sedaily-mbti-pgvector-v2-dev` (db.t3.small) |
| S3 article body | `sedaily-mbti-article-body-dev` | `sedaily-mbti-article-body-v2-dev` |
| DynamoDB articles | `sedaily-mbti-articles-dev` | **없음** (pgvector로 대체) |
| DynamoDB personal | `sedaily-mbti-personal-dev` | 동일 (short-term memory만 사용) |
| DynamoDB engagement | `sedaily-mbti-engagement-dev` | 동일 (그대로 사용) |
| API Gateway | 동일 API Gateway 사용 | `/v2/*` 경로 추가 |
| AgentCore | 없음 | `sedaily-mbti-chat-agent-v2-dev` |
| ECR | 없음 | `887...dkr.ecr.us-east-1.amazonaws.com/sedaily-mbti-chat-agent` |
| EventBridge | `sedaily-mbti-pipeline-schedule-dev` | `sedaily-mbti-v2-collector-schedule` |

환경변수:
- v1: `PG_HOST`, `PG_PASSWORD`, `DYNAMODB_TABLE_ARTICLES` 등
- v2: `PG_V2_HOST`, `PG_V2_PASSWORD`, `S3_ARTICLE_BODY_V2_BUCKET`, `AGENTCORE_CHAT_AGENT_ARN` 등

→ v2 Lambda는 **v1 환경변수를 읽지 않는다**. 실수로 v1 DB에 쓰는 것을 막기 위함이다.

## 6. pgvector v2 스키마 (4 테이블)

TASK-1.2에서 `schema_v2.sql`로 생성. 요약:

- `articles` — 원본 메타 + 임베딩, `status IN ('raw', 'transformed', 'failed')`
- `article_versions` — 4 MBTI 버전 (news_id FK), UNIQUE(news_id, mbti_type)
- `user_profiles` — `mbti_type`, `category_weights JSONB`, `preference_embedding vector(1024)`
- `user_interactions` — click/dwell/scroll/skip/react/rate 이벤트 로그

모든 vector 컬럼은 1024-dim (Titan V2 기준), `ivfflat` 인덱스 `lists=100`으로 시작.

## 7. AI 모델 (v1과 동일, 재사용)

| 모델 | Model ID | 용도 |
|---|---|---|
| Opus 4.6 | `us.anthropic.claude-opus-4-6-v1:0` | Core 2 Transform (4 병렬) |
| Haiku 3.5 | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | Chat Agent |
| Nova Lite | `amazon.nova-lite-v1:0` | Core 2 Validator |
| Titan V2 | `amazon.titan-embed-text-v2:0` | 1024-dim 임베딩 |

**프롬프트 캐싱**: Core 2에서 시스템 프롬프트는 4개 MBTI 호출에 공유되므로 `cache_control: {"type": "ephemeral"}` **반드시 적용**. 비용 30~50% 절감.

## 8. 핸들러 패턴 (v1과 동일)

```python
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response, error_response
from config.constants import CORS_HEADERS

@handler_decorator
async def lambda_handler(event: dict, context) -> dict:
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}
    # v2 비즈니스 로직
    return success_response(data)
```

에러는 `BackendError` 하위 클래스를 raise하면 데코레이터가 적절한 HTTP 상태로 매핑한다.

## 9. 배포 방법

v2 Lambda는 **v2 전용 스크립트**로만 배포한다:

```bash
cd service/backend
./v2/deploy-v2.sh                # 전체 v2 배포
./v2/deploy-v2.sh api            # API handlers (health, etc.)
./v2/deploy-v2.sh collector      # Core 1만
./v2/deploy-v2.sh transform      # Core 2만
./v2/deploy-v2.sh personalization # Core 3만 (Chat Agent 제외)
./v2/deploy-v2.sh chat-agent     # Chat Agent (Docker build + ECR push + AgentCore)
```

루트의 `./deploy.sh`는 **v1 전용**이다. 절대 v2 파일을 포함시키지 않는다.

## 10. 테스트 원칙

- 모든 v2 신규 파일은 **최소 한 개의 pytest 테스트** 동반한다 (`service/backend/v2/tests/`).
- 통합 테스트는 실제 AWS 리소스가 필요 — `PG_V2_HOST` 환경변수 있을 때만 실행(`pytest.mark.skipif`).
- syntax-only 빠른 확인: `python3 -c "import ast; ast.parse(open('file.py').read())"`.
- import 확인: `cd service/backend && python3 -c "from v2.clients.pgvector_v2_client import PgVectorV2Client"`.

## 11. 작업 시작 체크리스트

새 세션에서 v2 TASK를 시작하기 전에:

1. `TASKS.md`에서 할 TASK 번호 확인
2. `.clauderules` 훑어보기 (금지 사항 재확인)
3. 해당 TASK의 "Files to create / modify" 확인 — 그 파일들만 건드린다
4. TASK 완료 시 `TASKS.md` 체크박스 업데이트

## 12. 자주 하는 실수 & 방지

- ❌ v1 파일 수정 (예: `handlers/article_collector.py` 편집) → ✅ v2에서 재작성
- ❌ 루트 `CLAUDE.md` 수정 → ✅ 이 파일(`service/backend/v2/CLAUDE.md`)에만 반영
- ❌ `deploy.sh`에 v2 함수 추가 → ✅ `deploy-v2.sh`에만 추가
- ❌ v1 `PG_HOST` 환경변수를 v2 Lambda가 사용 → ✅ `PG_V2_HOST` 사용
- ❌ v1 `DynamoDBClient`로 기사 저장 → ✅ `PgVectorV2Client.insert_article()`
- ❌ Step Functions 상태머신 수정 → ✅ EventBridge + Lambda status 컬럼으로 상태 관리
- ❌ AgentCore에 모든 에이전트 배포 → ✅ Chat Agent만, 나머지는 Lambda

## 13. 막혔을 때

- **아키텍처 의사결정이 필요**: `AI_LENS_V2_ARCHITECTURE.md` 먼저 확인. 거기 없으면 사용자에게 질문.
- **v1 동작이 궁금**: 루트 `CLAUDE.md` 참조. 수정은 하지 말 것.
- **AWS CLI 명령어 확신 없음**: `COMMANDS.md`에 있는지 확인. 없으면 `--dry-run` 먼저.
- **테스트 실패 원인 불명**: 실패 로그 전체를 사용자에게 보여주고 판단 요청. 우회하려 하지 말 것.

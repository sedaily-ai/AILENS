# AI LENS v2 — `backend/v2/`

v1은 프로덕션에서 계속 운영 중이다. v2는 **이 디렉터리 안에서만 병행 구축** 중이며, v1 파일을 수정하지 않는다.

## 새 세션에서 먼저 읽을 문서 (순서대로)

| 문서 | 용도 |
|---|---|
| `CLAUDE.md` | v2 작업 전체 맥락 — 3-Core 아키텍처, 재사용 자산, 네이밍 규칙 |
| `.clauderules` | 절대 규칙 — v1 수정 금지, AWS 리소스 직접 생성 금지 |
| `TASKS.md` | PR 단위 체크리스트 — Phase 0~5 |
| `COMMANDS.md` | 검증된 명령어 모음 (추측 금지) |

루트 `/CLAUDE.md`는 v1 기준이다. 이 디렉터리 문서와 충돌하면 **v2 문서가 우선**한다.

## 디렉터리 구조 (현재)

```
backend/v2/
├── __init__.py
├── README.md            ← 이 파일
├── CLAUDE.md
├── .clauderules
├── TASKS.md
├── COMMANDS.md
├── requirements.txt     ← v2 전용 의존성 (pg8000, boto3, httpx, pytest)
├── .gitignore
├── clients/             ← PgVectorV2Client 등 (TASK-1.3~)
├── handlers/            ← Lambda 엔트리 (core1_collector, core2_transform, ...)
├── core3/               ← 개인화 엔진 (Memory/Context/Recommend)
└── tests/               ← pytest 스위트
```

**미생성 (TASK 진행 중 추가):**
- `deploy-v2.sh` — TASK-0.2
- `infrastructure/` — provision/init/setup 스크립트 (Phase 1~)
- `agents/chat_agent/` — Phase 4 MCP 서버 (ARM64 컨테이너)

## 퀵 체크

```bash
# v2 패키지 import 확인 (TASK-0.1 DoD)
cd backend && python3 -c "import v2; print('OK')"

# 의존성 설치
cd backend && pip install -r v2/requirements.txt

# 테스트 실행 (통합 테스트는 PG_V2_HOST 필요)
cd backend && python3 -m pytest v2/tests/ -v -m 'not integration'
```

## 배포

`deploy-v2.sh`는 TASK-0.2에서 추가 예정이다. 그때까지 v2에는 배포할 Lambda가 없다.

루트 `./deploy.sh`는 **v1 전용**이다. v2 파일을 절대 포함시키지 않는다.

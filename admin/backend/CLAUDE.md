# admin/backend/

`admin/backend/` 안에서 작업 시 자동 load. 배포는 `README.md` 참조 — 여기는
**코드 구조**만 다룬다.

2026-09-04까지 이 파일이 없었다 — 아래 설명하는 convention은 실제로 12개
route 파일·4개 repo 파일 전체가 예외 없이 지키고 있었지만 문서화가 안 돼
있어서, 새로 오는 사람은 파일 4~5개를 직접 비교해 패턴을 역추적해야 했다
(리팩토링 감사에서 발견). `service/backend/CLAUDE.md`(handlers/services/
repositories 3단 분리)와는 다른, 더 얕은 2단 분리를 쓴다 — 거기 패턴을
그대로 옮겨오지 말 것.

## 레이어 — `routes/` + `repo/` (services/ 레이어 없음)

```
handler.py     → Lambda entry. HTTP API v2 event 파싱, routeKey → HANDLERS
                 dict 라우팅, jwt_required 라우트는 verify_jwt 통과 후에만
                 dispatch, audit 컨텍스트 bind/reset, top-level try/except로
                 unhandled exception 전부 500 + log.exception.
auth.py        → JWT(HS256) 발급/검증, argon2id 비밀번호 검증, rate-limit
                 lockout(5회 실패 → 5분).
routes/        → 라우트 하나당 함수 하나(`handle_xxx(body, path_params,
                 query_params) -> dict`). HTTP 검증·비즈니스 로직·응답
                 조립까지 이 파일 안에서 다 한다 — service/backend처럼
                 별도 services/ 레이어로 안 뺀다. DB 접근은 절대 여기서
                 직접 안 하고 반드시 `repo/`를 거친다(routes/drivers.py의
                 `_load_feature_flags`/`_load_thresholds`처럼 route 전용
                 헬퍼는 route 파일 안에 private 함수로 남겨도 됨 — 다른
                 route가 재사용할 정도로 커지면 그때 repo/shared로 승격).
repo/          → 테이블 하나당 파일 하나("OO_repo.py") — CRUD + pagination
                 안전 scan/query만, 비즈니스 로직 없음. 함수는 항상
                 `shared.ddb_client`의 accessor(`xxx_table()`)를 거쳐
                 테이블을 얻는다 — repo 파일이 직접 `boto3.resource()`를
                 만들지 않는다(테이블당 accessor는 `shared/ddb_client.py`
                 한 곳에만 있다). posts_repo.py/letters_repo.py/
                 quiz_repo.py/subscribers_repo.py 전부 같은 모양:
                 `_UPDATABLE` 튜플로 수정 가능 필드를 좁히고, list류는
                 `LastEvaluatedKey`를 끝까지 따라가는 while 루프로
                 페이지네이션 누락을 막는다(2026-08-08 실제 사고 —
                 발행된 글이 admin 목록에서 안 보이던 버그, posts_repo.py
                 주석 참조).
shared/        → 여러 route/repo가 같이 쓰는 것. ddb_client.py(boto3
                 dynamodb resource 싱글턴 + 테이블별 accessor),
                 cw_client.py(CloudWatch get_metric_statistics 래퍼),
                 eb_client.py(EventBridge rule 제어, drivers.py 전용),
                 ssm_client.py/secrets_client.py(SSM SecureString),
                 response.py(ok/err — CORS 헤더 없음, API Gateway가
                 API 레벨에서 처리), audit.py(감사 로그, fail-open),
                 notify.py(프론트 캐시 무효화 webhook, fail-open),
                 slug.py.
```

⚠️ **`routes/media.py`는 이 규칙에서 유일하게 벗어난 곳** — S3 presigned
URL 발급용 `boto3.client("s3")`를 자체 lazy 싱글턴으로 갖고 있다(다른
route처럼 `shared/`의 공용 accessor를 쓰지 않음). 잘못된 패턴이라기보다
아직 `shared/`에 S3 클라이언트 모듈 자체가 없어서다 — S3 쓰는 route가
2개 이상 생기면 `shared/s3_client.py`로 승격할 것, 그전엔 지금 형태 유지.

## 요청 흐름

1. `handler.py::lambda_handler`가 `event`를 파싱해 `routeKey`(예:
   `"GET /admin/newsletter/stats"`)를 뽑는다.
2. `HANDLERS` dict에서 `(handler_fn, jwt_required)`를 찾는다. 없으면 404.
3. `jwt_required=True`면 `auth.verify_jwt(Authorization 헤더)` 통과 후에만
   진행 — 실패 시 401.
4. `audit.bind_context(session, source_ip)` 후 `handler_fn(body, path_params,
   query_params)` 호출, `finally`에서 `audit.reset_context()`.
5. 라우트 함수 자체가 `response.ok(...)`/`response.err(...)`를 리턴한다.
6. 라우트 함수가 raise하면 `lambda_handler`의 최상위 except가 잡아
   `log.exception` + `response.err("internal server error", 500)` — 민감
   정보 노출 방지를 위해 예외 메시지를 그대로 응답에 싣지 않는다.

## 테스트

`tests/`에 route별 파일(`test_xxx_routes.py`) — `monkeypatch.setattr(routes_module.xxx_repo,
"메서드", fake)`로 repo 함수를 교체해 DynamoDB 없이 라우트 로직만 검증한다
(`posts.posts_repo`처럼 route 파일이 `from repo import xxx_repo`로 모듈째
import해야 이 패턴이 성립 — `from repo.xxx_repo import 함수`로 개별
import하면 monkeypatch 대상이 없어진다). `tests/test_readonly_routes.py`는
cost/audit/newsletter처럼 조회 전용 라우트 여러 개를 한 파일에 모아둔
characterization test.

## Python lint

이 저장소 전체에 `pyproject.toml`/`ruff.toml`/`.flake8`도 pre-commit hook도
없다(2026-09-04 확인) — `python3 -m pyflakes <file>`을 커밋 전에 손으로
돌리는 게 지금은 유일한 미사용 import/변수 방지책이다. 자동화 도입 여부는
`docs/worklog/2026-09/2026-09-04-리팩토링-감사-P2.md` 참조.

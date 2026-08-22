# AI LENS CMS 4단계 — admin 백엔드 정비 설계

작성 2026-07-29. 상위 스펙 [2026-07-27-ailens-cms-design.md](2026-07-27-ailens-cms-design.md) §5.4 의
백엔드 항목을 구체화한다. 같은 4단계의 UI 재설계와 도메인 전환은 이미 완료됐다(아래 §2.1).

## 1. 배경 & 목표

상위 스펙 §5.4 는 백엔드 정비를 한 줄로 적었다.

> 기존 6개 라우트를 `@lambda_handler` + `core/response` 로 이관 (에러·응답 포맷을 v1/v2 와 일치),
> `shared/response.py` 중복 제거, 감사 로그(`audit`) 일원화

실측해 보니 이 한 줄은 **성격이 다른 세 가지 일**을 묶고 있고, 난이도와 실익이 서로 다르다.

| # | 목표 | 성격 | 실익 |
|---|---|---|---|
| 1 | 감사 로그 일원화 | 결함 수정 | **높음** — CMS 쓰기 액션이 감사 없이 일어나고 있다 |
| 2 | 에러·응답 포맷 일치 | 일관성 | 중간 — 지금 당장 깨지는 건 없다 |
| 3 | `shared/response.py` 중복 제거 | 구조 개선 | 중간 — 두 벌 구현의 표류를 막는다 |

세 가지를 모두 하되 **단계를 나눠 독립 커밋**으로 진행한다. 1번이 가장 급하고 3번이 가장 비싸다.

## 2. 검증된 현재 상태 (2026-07-29 실측)

### 2.1 4단계 중 이미 끝난 것

- **5개 화면 UI 전면 재설계** — 커밋 `2ba9c5d`(서울경제 영문 CMS 스타일) → `e9f9051`(타이포·잉크
  팔레트) → `7d5cf4c`(모션·스켈레톤·토스트) → `7631504`(차트 재설계)
- **도메인 전환** — `ailens-admin.sedaily.ai` 가 라이브. CloudFront `E1MITYI58DB9UW` alias +
  Route53 + API GW CORS allowlist 반영 완료(커밋 `882244a`)

**⚠️ 상위 스펙과 도메인 이름이 다르다.** 스펙 §5.4/§6 은 `ailens-cms.sedaily.ai` 로 적었으나 실제로는
`ailens-admin.sedaily.ai` 로 갔다(`admin/CLAUDE.md:33`, 루트 `CLAUDE.md:365`). **실물이 정본이고
스펙 표기가 낡았다.** 상위 스펙만 보고 작업하면 안 된다.

### 2.2 라우트는 6개가 아니라 24개다

`admin/handler.py:30-58` 의 `HANDLERS` dict 기준.

| 구분 | 수 | 내역 |
|---|---|---|
| 기존 (이관 대상) | 12 | `login` · `password-change` · `drivers`(4) · `prompts`(3) · `cost` · `audit` · `newsletter/stats` |
| CMS 신규 | 12 | `posts`(7) · `letters`(4) · `media`(1) |

상위 스펙이 "6개 라우트"라 쓴 것은 라우트 **모듈** 수를 센 것으로 보인다. 실제 이관 대상은 12개다.

### 2.3 패키징이 `core/` 직수입을 막는다

`admin/deploy-admin-api.sh:31-33` 이 zip 에 넣는 것은 `handler.py` · `auth.py` · `__init__.py` ·
`routes/` · `shared/` · `repo/` 뿐이다. 스크립트 헤더(4-5행)에 의도가 명시돼 있다.

> admin 은 flat import 규약을 쓴다 (Handler=handler.lambda_handler). 따라서 zip 루트가
> admin/ 디렉터리 내용 그 자체여야 한다 — v1/v2 소스를 섞지 않는다.

지금 상태로 `from core.response import ...` 를 쓰면 콜드스타트에서 `ImportError` 다. 게다가
`core/response.py:11` 이 `config.constants` 를 import 하므로 `config/` 까지 딸려온다.

### 2.4 CORS 헤더가 정면 충돌한다

`admin/shared/response.py:3-6` 의 ⚠️ 주석:

> CORS 헤더는 API Gateway HTTP API 가 API-level 에서 자동 처리 … Lambda response 에
> `Access-Control-*` 헤더를 추가하면 conflict 가능성 → body + status 만 반환.

반면 `core/response.py:53,90` 은 모든 응답에 `CORS_HEADERS` 를 무조건 주입한다. `core/` 를 그대로
가져오면 admin 이 의도적으로 피해 온 것을 도로 불러들인다.

### 2.5 데코레이터 시그니처가 안 맞는다

`core.decorators.lambda_handler` 는 `(event, context)` 를 감싼다(`core/decorators.py:43`). admin
라우트는 `(body, path_params, query_params)` 로 중앙 `HANDLERS` dict 에서 dispatch 된다
(`handler.py:109`). 데코레이터를 라우트 함수에 그대로 붙일 수 없다.

### 2.6 프런트엔드는 응답 포맷 변경에 이미 내성이 있다

- `admin/src/lib/adminClient.ts:75` — `message = body.message || body.error || message`.
  **두 키를 모두 읽는다.**
- `AdminApiError` 는 `status` 와 `message` 만 담는다. 그 외 body 필드는 버려진다.
- `err()` 에 추가 필드를 넘기는 곳은 `admin/auth.py:101` (`retry_after_seconds`) **한 곳뿐**이고,
  프런트는 `login/page.tsx:25` 에서 `err.status === 423` 만 본다. 해당 필드는 **지금도 죽은 값**이다.

→ `{"message": ...}` → `{"error": ...}` 이관은 관리자 콘솔을 깨지 않는다.

### 2.7 audit 은 CMS 라우트에서 통째로 빠져 있다

`audit_log` 호출은 9곳이다.

| 파일 | 호출 | action |
|---|---|---|
| `admin/auth.py` | 3 | `login-fail`(2) · `login-success` |
| `routes/admin_password.py` | 2 | `admin-password-change` |
| `routes/drivers.py` | 3 | `driver-update` · `feature-flag-update` · `threshold-update` |
| `routes/prompts.py` | 1 | `prompt-update` |
| **`routes/posts.py`** | **0** | — |
| **`routes/letters.py`** | **0** | — |
| **`routes/media.py`** | **0** | — |

**CMS 글 발행·삭제, AI 레터 수정·소프트삭제, 이미지 업로드 URL 발급이 감사 로그 없이 일어나고 있다.**
이것은 리팩터링 대상이 아니라 결함이다.

### 2.8 audit 스키마 자체의 문제

`admin/auth.py:86-96`.

- **`actor` 가 항상 `"admin"`** — 기본값이고 9곳 어디서도 덮어쓰지 않는다. JWT payload 도
  `{"sub": "admin", ...}` 로 하드코딩(`auth.py:120`)이고 비밀번호는 단일 공유다.
- **같은 밀리초 충돌** — `pk="AUDIT"` 고정 + `sk=_now_iso_ms()`. 같은 ms 에 두 건이 쓰이면
  `put_item` 이 덮어써 한 건이 조용히 사라진다.
- **페이지네이션 없음** — `routes/audit.py` 가 `Limit` 만 쓰고 `LastEvaluatedKey` 를 안 쓴다.
  최대 200건 이전 기록은 조회 불가.
- **`verify_jwt()` 반환값을 버린다** — `handler.py:105` 가 결과를 받지 않는다. 요청 처리 중에
  토큰 내용(발급 시각 등)을 볼 수 없다.

### 2.9 이관 대상에 회귀 안전망이 없다

`admin/tests/` 5개 파일 42개 테스트는 전부 CMS 관련(`posts_repo` · `posts_routes` · `letters_repo` ·
`media` · `slug`)이다. 정작 이관 대상인 기존 12개 라우트는 테스트가 **0개**다.

기존 42개는 `service/backend/` 에서 `python3 -m pytest admin/tests -q` 로 0.25초에 통과한다.

### 2.10 `core/` 소비자 규모

| 모듈 | v1 | v2 | 합계 |
|---|---|---|---|
| `core.response` | 16 파일 | 14 파일 | **30** |
| `core.exceptions` | — | — | 8 |
| `core.decorators` | — | — | 27 |

**`core/response.py` 는 v1 전용이 아니다.** v2 도 14개 파일에서 쓴다(`deploy-v2.sh` 가 v1 소스를
번들하기 때문). 4단계 변경은 두 스택 모두에 파급된다.

### 2.11 `admin` 은 `common/` 을 쓰지 않는다

루트 `CLAUDE.md` 는 `common/` 을 *"Cross-track shared utilities (v1 / v2 / admin all import from
here)"* 라고 적었으나, **admin 은 `common/` 을 단 한 곳도 import 하지 않는다.** admin 은
`common/secrets.py` 대신 자체 `shared/ssm_client.py` 를 쓴다. 문서가 사실과 다르다.

`deploy.sh`(v1)와 `deploy-v2.sh`(v2)의 복사 목록에는 `common` 이 이미 들어 있다. 빠진 것은
`deploy-admin-api.sh` 뿐이다.

## 3. 확정된 결정 사항

| # | 결정 | 근거 |
|---|---|---|
| 1 | 세 목표를 **모두** 수행하되 4단계로 분할, 각각 독립 커밋 | 난이도·실익이 달라 한 커밋에 묶으면 되돌리기 어렵다 |
| 2 | 이관 **전에** characterization test 를 먼저 깐다 | "동작을 바꾸지 않았다"를 증명할 유일한 수단 |
| 3 | audit 은 **스키마까지** 정비 | 호출 지점만 채우면 §2.8 문제가 그대로 남는다 |
| 4 | `actor` 는 **세션 + 출처 IP** 수준까지만 | 단일 공유 비밀번호 구조에서 "누가"는 원리적으로 알 수 없다 |
| 5 | 이관 방식은 **`common/` 승격** (아래 §4 대안 비교) | 중복 제거를 실제로 달성하는 유일한 안 |
| 6 | v1 을 건드리는 단계를 **맨 마지막**에 둔다 | 3단계까지만 하고 멈춰도 성과가 남는다 |

### 3.1 이관 방식 대안 비교

| 안 | 내용 | 채택 |
|---|---|---|
| A. `core/` 직수입 | 배포 스크립트에 `core/`+`config/` 추가, CORS 주입 무력화 | ✗ — §2.3 의 격리 원칙을 뒤집고, `config/settings.py` 가 admin 에 없는 v1 env var 를 기대해 초기화가 깨질 수 있으며, 이후 v1 변경이 admin 을 조용히 망가뜨린다 |
| B. admin 내부 미러링 | `admin/shared/` 에 `core/` 와 같은 모양을 복제 | ✗ — 가장 안전하지만 **중복이 늘어난다**. 목표 3과 정면으로 어긋난다 |
| **C. `common/` 승격** | CORS 중립 코어를 `common/` 에 두고 CORS 는 소비자가 주입 | **○** |

C 의 유일한 대가는 v1(그리고 v2) 코드를 건드린다는 것이고, 이는 결정 6(순서)과 §7.3(v1 전용
characterization test)으로 통제한다.

## 4. 아키텍처

핵심 원리: **CORS 를 타입이 아니라 주입 지점의 문제로 바꾼다.**

```
                     common/http.py          ← CORS 중립. config/ 의존 없음
                     common/errors.py        ← BackendError 계층
                          │
          ┌───────────────┼───────────────┐
          │               │               │
   core/response.py   (v2 는 core 경유)  admin/shared/response.py
   + CORS_HEADERS 주입                   + 헤더 주입 안 함
          │                                     │
   v1 16 파일 · v2 14 파일               admin 24 라우트
```

`common/` 이 `config/` 를 import 하지 않으므로 **CORS 헤더가 admin 으로 들어올 경로 자체가 없다.**
`admin/shared/response.py:3-6` 의 경고가 주석이 아니라 구조로 강제된다.

`deploy-admin-api.sh` 는 `common` 한 항목만 추가하면 된다. `core/` 도 `config/` 도 zip 에 안
들어가므로 *"v1/v2 소스를 섞지 않는다"* 는 원칙이 유지된다 — `common/` 은 정의상 v1 소스가 아니라
공유 계층이다.

## 5. 상세 설계

### 5.1 `common/http.py` (신설)

헤더를 **인자로만** 받는다. 기본값은 `Content-Type` 하나.

```
DEFAULT_HEADERS = {"Content-Type": "application/json; charset=utf-8"}

json_dumps(data) -> str
    datetime · date · Decimal · set · to_dict() 직렬화.
    core/response.py:14 의 _json_serializer 를 그대로 옮긴다.

success(data, status=200, headers=None) -> dict
error(message, status=500, code=None, details=None, retry_possible=False, headers=None) -> dict
    body 구조는 core/response.py:95-107 과 동일: {error, code?, details?, retry_possible?}
```

### 5.2 `common/errors.py` (이동)

`core/exceptions.py` 의 `BackendError` 계층 전체와 `EXCEPTION_STATUS_CODES`,
`get_status_code_for_exception()` 을 옮긴다.

### 5.3 소비자 3곳 — 공개 API 무변경

| 파일 | 변경 | 호출부 영향 |
|---|---|---|
| `core/response.py` | 내부만 `common.http` 위임 + `CORS_HEADERS` 주입. 9개 빌더의 시그니처 유지 | v1 16 · v2 14 파일 **무변경** |
| `core/exceptions.py` | `common.errors` 의 이름을 **명시적으로** 재수출 (`from common.errors import BackendError, ValidationError, …` + `__all__`). `import *` 는 쓰지 않는다 — 무엇이 공개되는지 파일만 봐서 알 수 없게 된다 | 8개 파일 **무변경** |
| `admin/shared/response.py` | `ok`/`err` 의 **이름과 시그니처**를 유지하고 내부만 `common.http` 위임 | admin 24 라우트 소스 **무변경** (단 응답 body 는 §5.4 대로 1회 바뀐다 — 소스 호환이지 와이어 호환이 아니다) |

`core.decorators`(27 소비자)는 **이번 범위가 아니다.** admin 은 §5.5 의 dispatch 수준 에러 처리를
쓰고, v1 데코레이터는 그대로 둔다.

### 5.4 에러 body 변경 (admin 한정, 1회)

`{"message": ...}` → `{"error": ...}`. §2.6 근거로 프런트는 안 깨진다.
`auth.py:101` 의 `retry_after_seconds` 는 `details` 안으로 들어간다(현재도 프런트가 안 읽음).

**직렬화기 변경도 같은 커밋에 딸려온다 (2026-07-29 최종 리뷰에서 추가 실측):**
`json.dumps(..., default=str)` → `common.http.json_dumps`(`_serializer`)로 바뀌며 키 이름
변경 외에 네 가지가 더 달라진다 — Decimal 이 문자열이 아니라 숫자로 직렬화되고
(`"30"` → `30`), datetime 구분자가 공백에서 ISO `T` 로 바뀌고(`"...05:00:00+00:00"` →
`"...T05:00:00+00:00"`), set 이 `str(set)` 대신 `list(set)` 로 나가고, 무엇보다
**`to_dict`/`__dict__` 가 없는 객체를 넘기면 `default=str` 처럼 조용히 문자열로 격하되는
대신 `TypeError` 를 던진다.** `ok()`/`err()` 가 이제 예외를 낼 수 있다는 뜻이고, admin
`handler.py` 최상위 except 를 거쳐 500 이 된다 — 조용한 격하가 시끄러운 실패로 바뀌는
트레이드오프이며 의도된 것이다. 2026-07-29 기준 전 소비자 전수 조사 결과 이를 유발하는
호출부는 없다.

### 5.5 `admin/shared/audit.py` (신설 — `auth.py` 에서 분리)

감사가 인증 모듈 안에 있는 현 구조를 분리한다. 지금은 `routes/*` 가 감사를 쓰려고 `auth` 를
import 해야 한다.

```
_ctx: ContextVar[dict]          # 요청 스코프

bind_context(session: str | None, source_ip: str | None) -> None
log(action: str, detail: dict | None = None) -> None
    _ctx 를 자동 병합해 DDB 에 1건 기록. 실패 시 silent + logger.warning (fail-open 유지).
```

- 호출부는 `audit.log("post-publish", {"id": ...})` 만 쓴다 — 컨텍스트를 몰라도 된다.
- `handler.py` 가 dispatch 전에 `bind_context()` 를 호출한다.
- `contextvars` 를 쓴다. Lambda 컨테이너는 한 번에 한 요청만 처리하므로 모듈 전역도 안전하지만,
  `contextvars` 가 정석이고 나중에 async 를 도입해도 안 깨진다.

### 5.6 audit 스키마

| 항목 | 변경 |
|---|---|
| `sk` | `2026-07-29T05:12:33.123456Z#a3f9` — `secrets.token_hex(2)` 4자 접미. **기존 행 마이그레이션 불필요** (ISO 접두가 정렬을 지배하므로 접미 유무가 섞여도 시간순 보존) |
| `session` | JWT `iat` 를 ISO 로. 로그인 시각이 그대로 세션 식별자가 된다 — *"04:00 에 로그인한 세션이 한 일"* 이 즉시 읽힌다. `iat` 는 민감 정보가 아니므로 가리지 않는다 |
| `source_ip` | `event.requestContext.http.sourceIp` |
| `actor` | `"admin"` 유지. 계정 분리 시 채울 자리로 남긴다 |

`handler.py:105` 가 버리던 `verify_jwt()` 반환값을 캡처해 `session` 을 얻는다.

### 5.7 audit 페이지네이션

```
요청:  GET /admin/audit?limit=50&cursor=<base64>
응답:  {audits: [...], count: N, next_cursor: "<base64>" | null}
```

`cursor` 는 선택 인자, `next_cursor` 는 추가 필드. 현재 프런트는 `limit` 만 보내므로
(`adminClient.ts:138`) 영향받지 않는다. 커서는 `LastEvaluatedKey` 를 JSON → base64 한 값이다.

### 5.8 audit 누락 채우기

| 라우트 | 추가할 action |
|---|---|
| `posts.py` | `post-create` · `post-update` · `post-publish` · `post-unpublish` · `post-delete` |
| `letters.py` | `letter-update` · `letter-delete` |
| `media.py` | `media-presign` |

`detail` 에는 **식별자만** 넣는다(post id/slug, letter id, 파일명). 본문은 넣지 않는다 — DDB 항목
크기와 민감도 양쪽 이유다.

## 6. 단계 구성

| 단계 | 내용 | v1/v2 동작 변경 | 배포 |
|---|---|---|---|
| 1 | 기존 12개 라우트 characterization test | ✗ | 없음 |
| 2 | audit 전면 정비 (§5.5–5.8) | ✗ | admin Lambda |
| 3 | `common/` 코어 신설 + admin 이관 (§5.1·5.2·5.4, `admin/shared/response.py`) | ✗ (주) | admin Lambda |
| 4 | `core/response.py`·`core/exceptions.py` 를 `common/` 위로 재배치 (§5.3) | ○ | v1 + v2 |

**(주) 3단계의 정확한 파급:** `deploy.sh`·`deploy-v2.sh` 의 복사 목록에 `common` 이 이미 있으므로,
3단계에서 `common/http.py`·`common/errors.py` 를 추가하면 **v1·v2 zip 에도 파일이 들어간다.** 다만
그 시점에 두 스택 어디도 이 모듈을 import 하지 않으므로 **동작은 바뀌지 않고** zip 크기만 미미하게
는다. 실제로 v1/v2 가 새 코어를 쓰기 시작하는 것은 4단계다. 3단계 배포 대상이 admin Lambda 뿐인
이유도 이것이다 — v1/v2 를 재배포할 이유가 없다.

각 단계는 앞 단계에 기능적으로 의존하지 않는다. **3단계까지만 하고 멈춰도 성과가 남는다** — 그
시점에 audit 누락은 메워졌고 admin 은 `common/` 을 쓰며, v1/v2 만 옛 구조로 남는다.

## 7. 테스트 계획

### 7.1 1단계 — characterization test (12개 라우트)

박제 항목 세 가지.

- **`statusCode`** — 성공 경로 + 주요 실패 경로(400/401/404/423)
- **body 키 구조** — 최상위 키 이름과 중첩. 값이 아니라 **형태**를 고정
- **헤더** — `Content-Type` 만 있고 `Access-Control-*` 가 **없음**을 단언

세 번째가 핵심 방어선이다. `common/` 이관 중 CORS 헤더가 admin 으로 새어 들어오면 즉시 잡힌다.

기존 관례를 따른다(`admin/tests/test_posts_routes.py` 참조) — `sys.path.insert` 로 admin 을 루트로
잡아 flat import 규약 재현, fake 로 `ddb_client`·`ssm_client` 대체, 실 AWS 불필요, 파일 상단
docstring 에 실행법 명시.

### 7.2 단계별 통과 기준

| 단계 | 기준 |
|---|---|
| 1 | 신규 characterization 통과 + 기존 42개 그대로 통과 |
| 2 | audit 테스트 추가 + **1단계 테스트 무변경 통과** |
| 3 | 1단계 테스트를 `{message}`→`{error}` 로 **명시적 수정**. CORS 부재 단언은 유지 |
| 4 | §7.3 의 v1 characterization 신규 + 통과 |

2단계에서 1단계 테스트가 **한 줄도 바뀌면 안 된다.** audit 은 부수효과이므로 응답이 변하면 버그다.

3단계에서 기존 테스트도 깨진다 — `test_posts_routes.py:44` 가 `["message"]` 를 단언한다. 이는
사고가 아니라 안전망이 작동하는 신호이고, 명시적으로 고치면서 "여기가 바뀐 지점"이 커밋에 남는다.

### 7.3 4단계 — v1/v2 안전망

`service/backend/tests/` 는 실 AWS 를 때리는 통합 테스트라 CI 안전망이 못 된다. 4단계 착수 **전에**
`core/response.py` 전용 characterization test 를 새로 쓴다 — 9개 함수(`success_response` ·
`error_response` · `paginated_response` · `created_response` · `no_content_response` ·
`validation_error_response` · `not_found_response` · `internal_error_response` ·
`exception_to_response`)가 리팩터링 전후로 `statusCode` · `headers`(CORS 포함) · `body` 를 동일하게
내는지 단언한다. 순수 함수 테스트이므로 AWS 가 필요 없다.

`exception_to_response`(`core/response.py:279`)를 빠뜨리면 안 된다 — `BackendError` 계층을
`common/errors.py` 로 옮기는 것이 §5.2 의 핵심이고, 이 함수가 그 계층을 status code 로 매핑하는
유일한 지점이다. 예외 클래스가 이동하면 `isinstance` 판정이 깨질 수 있는 곳도 여기다.

이게 있으면 4단계는 "테스트가 통과하면 30개 소비자가 안전하다"가 성립한다.

## 8. AWS 변경 목록

**신규 리소스가 없다.** 이번 4단계 백엔드 정비는 코드 변경과 `update-function-code` 뿐이다.

| # | 변경 | 자동/수동 | 비용 | 단계 |
|---|---|---|---|---|
| 1 | admin Lambda `update-function-code` (`admin/deploy-admin-api.sh`) | 자동 허용 | — | 2, 3 |
| 2 | v1 Lambda `update-function-code` (`deploy.sh`) | 자동 허용 | — | 4 |
| 3 | v2 Lambda `update-function-code` (`v2/deploy-v2.sh`) | 자동 허용 | — | 4 |

`.clauderules` 상 `update-function-code` 는 완전 자동 경로다. 승인이 필요한 리소스 생성·삭제·시크릿
env 쓰기는 이번 범위에 없다.

## 9. 엣지케이스 & 알려진 한계

- **`actor` 는 여전히 사람을 식별하지 못한다.** 단일 공유 비밀번호가 유지되는 한 세션·IP 까지가
  한계다. 두 사람이 같은 비밀번호를 쓰면 `session` 이 달라 세션은 구분되지만 사람은 구분되지 않는다.
  계정 분리는 별도 단계다(§10).
- **`sk` 접미는 충돌을 확률적으로만 줄인다.** 같은 ms 에 같은 4자 hex 가 뽑힐 확률은 1/65536 이다.
  완전 제거를 원하면 `ConditionExpression` + 재시도가 필요하나, 감사 로그의 성격상 과하다고 판단했다.
- **audit fail-open 은 유지된다.** DDB 장애 시 감사 기록이 조용히 누락된다. 이는 의도된 트레이드오프
  이며(`auth.py:87` 주석), 감사 실패가 글 발행을 막는 쪽이 더 나쁘다는 기존 판단을 유지한다.
- **`common/` 이 세 스택의 공유점이 되면 결합이 생긴다.** `common/http.py` 변경은 v1·v2·admin 을
  동시에 건드린다. 그래서 이 모듈은 **의도적으로 얇게** 유지한다 — 직렬화와 응답 조립만 담고
  도메인 로직을 넣지 않는다.
- **`media-presign` 을 감사에 넣는 것은 판단이다.** 업로드 URL 발급은 쓰기 권한 행사이므로 포함했다.
  기록량이 문제가 되면 가장 먼저 뺄 후보다.

## 10. 비범위 (Out of scope)

- **다중 관리자 계정** — `actor` 를 진짜 의미있게 만들려면 필요하나 로그인·비밀번호·SSM·프런트
  로그인 화면까지 범위가 커진다. 별도 단계로 남긴다.
- **`core.decorators` 통합** — 27개 소비자가 있고 admin 은 dispatch 수준 에러 처리로 충분하다.
- **`admin/shared/ssm_client.py` → `common/secrets.py` 통합** — 같은 종류의 중복이지만 이번
  목표(응답·에러·감사)와 직교한다. §2.11 에 사실만 기록해 둔다.
- **`<title>` 등 메타데이터 정리** — 상위 스펙 §5.4 의 항목이나 프런트 작업이라 본 문서 범위 밖이다.
- **상위 스펙의 `ailens-cms` → `ailens-admin` 표기 정정** — 문서 작업으로 분리한다(§2.1).

"""HTTP API v2 응답 builder — common/http.py 위임.

⚠️ CORS 헤더는 API Gateway HTTP API 가 API-level 에서 자동 처리한다. Lambda
response 에 Access-Control-* 를 추가하면 conflict 가능 → body + status 만 반환.
common/http 는 config/ 를 import 하지 않으므로 CORS 가 들어올 경로가 없다.

ok/err 는 이름과 시그니처를 유지한다(호출부 24개 라우트 무변경). 다만 err 의
응답 body 는 {"message": ...} 에서 {"error": ...} 로 바뀐다 — 소스 호환이지
와이어 호환이 아니다. 관리자 콘솔은 adminClient.ts:75 에서
`body.message || body.error` 로 둘 다 읽으므로 깨지지 않는다.

⚠️ 직렬화기도 `json.dumps(..., default=str)` 에서 `common.http.json_dumps`
(`_serializer`)로 바뀌면서 {message}→{error} 외에 네 가지가 더 달라졌다 (실측):

    OLD default=str : {"n": "30", "f": "1.5", "dt": "2026-07-29 05:00:00+00:00", "s": "{'x'}"}
    NEW common.http : {"n": 30,   "f": 1.5,   "dt": "2026-07-29T05:00:00+00:00", "s": ["x"]}

- Decimal 이 문자열이 아니라 숫자(int/float)로 실린다.
- datetime 구분자가 공백에서 ISO `T` 로 바뀐다 (`.isoformat()`).
- set 이 `str(set)` 대신 `list(set)` 로 나간다.
- **실패 모드가 바뀐다.** `default=str` 은 어떤 객체든 `str()` 로 받아 절대 실패하지
  않았다. `_serializer` 는 `to_dict`/`__dict__` 가 없는 객체에 `TypeError` 를 던진다 —
  즉 `ok()`/`err()` 호출이 이제 예외를 낼 수 있고, admin `handler.py` 최상위 except 를
  거쳐 500 이 된다. 트레이드오프: 예전엔 이상한 값이 조용히 문자열로 격하됐고,
  이제는 시끄럽게 실패한다. 실패가 나으므로 의도된 변경이다 — 단 잊고 있다가 나중에
  "일관성 정리"로 되돌리지 말 것. (2026-07-29 기준: 전 소비자 전수 조사 결과 이를
  유발하는 호출부는 없음.)
"""

from typing import Any

from common import http

# 기자 본인이 방금 수정한 내용을 새로고침 시 즉시 봐야 하는 admin 콘솔용
# 응답이라 브라우저/중간 캐시가 절대 붙잡지 않게 no-store를 못박는다
# (2026-08-09). common.http는 v1/v2 공개 콘텐츠 API도 같이 쓰는 CORS 중립
# 모듈이라 거기 DEFAULT_HEADERS에 얹으면 안 된다 — 공개 콘텐츠 API는 반대로
# 캐시가 돼야 하므로(cmsPostsApi.ts의 revalidate:5), admin 전용인 이 파일에서만
# headers로 얹어 admin 응답에만 스코프한다.
_ADMIN_HEADERS = {"Cache-Control": "no-store"}


def ok(body: Any, status: int = 200) -> dict:
    return http.success(body, status, headers=_ADMIN_HEADERS)


def err(message: str, status: int = 400, **extra: Any) -> dict:
    """extra 는 details 안으로 들어간다.

    이전에는 body 최상위에 펼쳤다. 넘기는 곳은 auth.py 의 retry_after_seconds
    한 곳뿐이고, 프런트는 status 423 만 보고 그 필드를 읽지 않는다.
    """
    return http.error(message, status, details=extra or None, headers=_ADMIN_HEADERS)

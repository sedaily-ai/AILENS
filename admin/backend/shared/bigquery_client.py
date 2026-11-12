"""BigQuery REST 클라이언트 — CMS 홈 "독자 반응" 카드용 (2026-11-12).

google-cloud-bigquery 패키지는 grpc·protobuf까지 끌고 와 Lambda zip이 커지므로 쓰지 않는다.
SSM SecureString에 넣어 둔 서비스 계정 JSON으로 OAuth 토큰을 직접 받고(JWT bearer 흐름),
REST `jobs.query`만 호출한다.

- 서비스 계정: lens-analytics-reader@mbti-497410 — IAM 역할은 "BigQuery 데이터 뷰어" +
  "BigQuery 작업 사용자"뿐이라 읽기·쿼리 실행만 된다(테이블 수정·삭제 불가).
- 열쇠 위치: SSM `/sedaily-mbti/admin/gcp-analytics-sa-key` (LENS 계정 us-east-1).
  이 Lambda 역할은 `/sedaily-mbti/admin/*` GetParameter 권한이 이미 있다.
- RS256 서명에 PyJWT + cryptography가 필요하다(requirements.txt).

⚠️ 열쇠 내용(private_key 등)은 로그·예외 메시지에 절대 싣지 않는다.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import jwt

from shared.ssm_client import get_secure

KEY_PARAM = os.environ.get("GCP_ANALYTICS_SA_KEY_PARAM", "/sedaily-mbti/admin/gcp-analytics-sa-key")

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_API = "https://bigquery.googleapis.com/bigquery/v2"
# 쿼리 실행(jobs.query)에는 bigquery 범위가 필요하다. 실제로 할 수 있는 일은 위 IAM 역할이 제한한다.
_SCOPE = "https://www.googleapis.com/auth/bigquery"
_HTTP_TIMEOUT_S = 25

# (access_token, 만료 epoch초) — warm Lambda 안에서 재사용한다.
_token_cache: tuple[str, float] | None = None


class BigQueryError(RuntimeError):
    """BigQuery 호출 실패. 메시지에는 구글이 돌려준 오류 설명만 싣는다(열쇠 정보 없음)."""


def _key_info() -> dict:
    return json.loads(get_secure(KEY_PARAM))


def project_id() -> str:
    return _key_info()["project_id"]


def _http_json(url: str, *, data: bytes | None = None, headers: dict | None = None, method: str = "GET") -> dict:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode("utf-8"))
            msg = (detail.get("error") or {}).get("message") if isinstance(detail.get("error"), dict) else detail.get("error_description") or detail.get("error")
        except Exception:  # noqa: BLE001 — 오류 본문 파싱 실패는 상태 코드만 남긴다
            msg = None
        raise BigQueryError(f"HTTP {e.code}: {msg or e.reason}") from None


def _access_token() -> str:
    global _token_cache
    now = time.time()
    if _token_cache and _token_cache[1] - 300 > now:
        return _token_cache[0]

    info = _key_info()
    assertion = jwt.encode(
        {
            "iss": info["client_email"],
            "scope": _SCOPE,
            "aud": _TOKEN_URL,
            "iat": int(now),
            "exp": int(now) + 3600,
        },
        info["private_key"],
        algorithm="RS256",
        headers={"kid": info.get("private_key_id", "")},
    )
    body = urllib.parse.urlencode(
        {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion}
    ).encode("utf-8")
    resp = _http_json(
        _TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    _token_cache = (resp["access_token"], now + float(resp.get("expires_in", 3600)))
    return _token_cache[0]


def _convert(value: Any, field_type: str) -> Any:
    if value is None:
        return None
    t = field_type.upper()
    if t in ("INTEGER", "INT64"):
        return int(value)
    if t in ("FLOAT", "FLOAT64", "NUMERIC", "BIGNUMERIC"):
        return float(value)
    if t in ("BOOLEAN", "BOOL"):
        return value in (True, "true", "TRUE")
    return value  # STRING, DATE 등은 문자열 그대로


def rows_from_response(resp: dict) -> list[dict]:
    """jobs.query / getQueryResults 응답을 [{컬럼: 값}] 으로 바꾼다. 평평한(중첩 없는) 결과만 지원."""
    fields = (resp.get("schema") or {}).get("fields") or []
    out: list[dict] = []
    for row in resp.get("rows") or []:
        cells = row.get("f") or []
        out.append({f["name"]: _convert(c.get("v"), f.get("type", "STRING")) for f, c in zip(fields, cells)})
    return out


def _param(name: str, value: Any) -> dict:
    if isinstance(value, bool):
        t, v = "BOOL", "true" if value else "false"
    elif isinstance(value, int):
        t, v = "INT64", str(value)
    elif isinstance(value, float):
        t, v = "FLOAT64", str(value)
    else:
        t, v = "STRING", str(value)
    return {"name": name, "parameterType": {"type": t}, "parameterValue": {"value": v}}


def query(sql: str, params: dict[str, Any] | None = None, *, timeout_s: int = 20) -> list[dict]:
    """표준 SQL 한 개를 실행해 행 목록을 돌려준다. params는 @이름 으로 SQL에서 참조한다."""
    token = _access_token()
    project = project_id()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    body: dict[str, Any] = {
        "query": sql,
        "useLegacySql": False,
        "timeoutMs": timeout_s * 1000,
        "maxResults": 1000,
    }
    if params:
        body["parameterMode"] = "NAMED"
        body["queryParameters"] = [_param(k, v) for k, v in params.items()]

    resp = _http_json(
        f"{_API}/projects/{project}/queries",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    deadline = time.time() + timeout_s
    while not resp.get("jobComplete"):
        if time.time() > deadline:
            raise BigQueryError("query timed out")
        ref = resp.get("jobReference") or {}
        qs = urllib.parse.urlencode({"timeoutMs": 5000, "location": ref.get("location", "")})
        resp = _http_json(f"{_API}/projects/{project}/queries/{ref.get('jobId')}?{qs}", headers=headers)

    return rows_from_response(resp)

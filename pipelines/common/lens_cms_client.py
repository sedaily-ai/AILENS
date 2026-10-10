"""frontpage_auto/mustknow_auto가 lens-cms-api(Postgres, EC2 상시서버)에
글을 쓰기 위한 얇은 HTTP 클라이언트.

admin 콘솔과 같은 내부 API(`POST /admin/posts` 등)를 호출한다. Postgres 접근을
lens-cms-api 한 곳으로 집중해야 하고(다른 프로세스가 RDS에 직접 붙으면 VPC·인터넷
접근 충돌이 재발한다), admin_posts_repo.py의 트랜잭션(publications INSERT와 파생
프로젝션)을 그대로 쓰기 위해서다.
토큰(`/sedaily-mbti/admin/lens-cms-api-token`)은 최초 호출 시 SSM에서 한 번 읽어
프로세스 안에 캐시하며 로그에 찍지 않는다.
"""
from __future__ import annotations

import os
from typing import Any, Optional

LENS_CMS_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = "/sedaily-mbti/admin/lens-cms-api-token"

_token: Optional[str] = None


def _get_token() -> str:
    global _token
    if _token is None:
        import boto3  # noqa: lazy

        _token = boto3.client("ssm", region_name="us-east-1").get_parameter(
            Name=_TOKEN_PARAM, WithDecryption=True
        )["Parameter"]["Value"]
    return _token


def _headers() -> dict[str, str]:
    return {"X-Internal-Token": _get_token(), "Content-Type": "application/json"}


def find_by_source_url(source_url: str) -> Optional[dict[str, Any]]:
    """source_url이 이미 발행돼 있으면 그 글을, 없으면 None을 돌려준다.
    admin_post_id 없는(v1.4 이관) 글도 잡힌다 — main.py 참조."""
    import requests  # noqa: lazy

    res = requests.get(
        f"{LENS_CMS_API_URL}/admin/posts/by-source-url",
        params={"source_url": source_url},
        headers=_headers(),
        timeout=(5, 15),
    )
    res.raise_for_status()
    return res.json().get("post")


def create_post(data: dict[str, Any], created_by: str) -> dict[str, Any]:
    """새 글 생성 — 항상 status='draft'로 생성된다(admin_posts_repo.create()
    고정값). 발행하려면 뒤이어 set_status(post_id, "published")를 부른다."""
    import requests  # noqa: lazy

    res = requests.post(
        f"{LENS_CMS_API_URL}/admin/posts",
        json={"data": data, "created_by": created_by},
        headers=_headers(),
        timeout=(5, 30),
    )
    res.raise_for_status()
    return res.json()["post"]


def list_published_today(date: str, channel: str = "lens", limit: int = 200) -> list[dict[str, Any]]:
    """오늘(또는 지정일) 이미 발행된 글 목록 — mustknow_auto의 하루 누적 캡 계산에 쓴다.
    `GET /admin/posts`의 status/channel/date 필터를 재사용하며 `date`는
    `YYYY-MM-DD`(admin_publish_date 컬럼과 동일 형식)다. limit=200은 하루 발행량
    (실측 최대 50건대)에 여유 있는 값이다.
    실패 시 빈 리스트를 반환한다(fail-open: 캡 계산 실패가 발행을 막지 않는다)."""
    import requests  # noqa: lazy

    try:
        res = requests.get(
            f"{LENS_CMS_API_URL}/admin/posts",
            params={"status": "published", "channel": channel, "date": date, "limit": limit},
            headers=_headers(),
            timeout=(5, 15),
        )
        res.raise_for_status()
        return res.json().get("posts", [])
    except Exception as e:
        print(f"[lens_cms_client] list_published_today 실패(fail-open, 0건으로 간주) — {e}")
        return []


def log_selection_run(
    run_date: str,
    today_context: Optional[str],
    candidates_total: int,
    excluded_count: int,
    excluded_reasons: list[str],
    selected: list[dict[str, Any]],
    category: str = "general",
) -> None:
    """"선정 실험실"(admin `/selection-lab`) 기록용 — run.py가 매 회차
    select_general_articles 호출 직후 부른다. 부가 기록이라 fail-open이며
    실패해도 파이프라인은 계속 진행한다."""
    import requests  # noqa: lazy

    try:
        res = requests.post(
            f"{LENS_CMS_API_URL}/internal/selection-runs",
            json={
                "run_date": run_date,
                "category": category,
                "today_context": today_context,
                "candidates_total": candidates_total,
                "excluded_count": excluded_count,
                "excluded_reasons": excluded_reasons,
                "selected": selected,
            },
            headers=_headers(),
            timeout=(5, 15),
        )
        res.raise_for_status()
    except Exception as e:
        print(f"[lens_cms_client] log_selection_run 실패(fail-open, 기록만 유실) — {e}")


def set_status(post_id: str, status: str) -> dict[str, Any]:
    import requests  # noqa: lazy

    res = requests.post(
        f"{LENS_CMS_API_URL}/admin/posts/{post_id}/status",
        json={"status": status},
        headers=_headers(),
        timeout=(5, 15),
    )
    res.raise_for_status()
    return res.json()["post"]


# ── 본 후보 이력(candidate_seen, v1.36) ───────────────────────────────
# 옛 DynamoDB mustknow-seen 을 대체한다. exists 는 후보 여러 건을 한 번에 확인하고, mark 는 판단이 끝난 후보를 기록한다.
def seen_exists(pipeline: str, keys: list[str]) -> set[str]:
    """이미 기록된 키만 돌려준다. 한 번에 500개까지(서버 상한) — 넘으면 나눠 보낸다.
    판단 근거가 되는 조회라 실패하면 예외를 그대로 올린다(조용히 '본 적 없음'으로 처리하면 이미 채점한 기사를 다시 처리한다)."""
    import requests  # noqa: lazy

    found: set[str] = set()
    uniq = list(dict.fromkeys(k for k in keys if k))
    for i in range(0, len(uniq), 500):
        res = requests.post(
            f"{LENS_CMS_API_URL}/internal/candidate-seen/exists",
            json={"pipeline": pipeline, "keys": uniq[i : i + 500]},
            headers=_headers(),
            timeout=(5, 30),
        )
        res.raise_for_status()
        found.update(res.json().get("seen", []))
    return found


def seen_mark(pipeline: str, article_key: str, **meta: Any) -> None:
    """판단이 끝난 후보를 기록한다. 알려진 필드(tab·score·reasoning·manual·excluded_from_general·reason) 외는 detail 로 보낸다."""
    import requests  # noqa: lazy

    from decimal import Decimal

    known = {"tab", "score", "reasoning", "excluded_from_general", "reason"}
    body: dict[str, Any] = {"pipeline": pipeline, "article_key": article_key}
    detail: dict[str, Any] = {}
    for k, v in meta.items():
        if isinstance(v, Decimal):  # DynamoDB 용 마킹 코드가 float 를 Decimal 로 바꿔 넘긴다 — JSON 으로 보내려면 되돌린다
            v = float(v)
        if k == "manual":
            body["is_manual"] = bool(v)
        elif k in known:
            body[k] = float(v) if k == "score" and v is not None else v
        else:
            detail[k] = v
    if detail:
        body["detail"] = detail
    res = requests.post(
        f"{LENS_CMS_API_URL}/internal/candidate-seen",
        json=body,
        headers=_headers(),
        timeout=(5, 15),
    )
    res.raise_for_status()

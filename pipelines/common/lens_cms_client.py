"""frontpage_auto/mustknow_auto가 lens-cms-api(Postgres, EC2 상시서버)에
직접 글을 쓰기 위한 얇은 HTTP 클라이언트 — v1.32.

기존엔 이 두 파이프라인이 DynamoDB(sedaily-mbti-cms-posts-dev)에
`table.put_item()`으로 직접 썼다. 그런데 사이트 읽기(v1.20)·admin 콘솔
쓰기(v1.21)가 이미 전부 Postgres로 전환됐고, admin_posts_repo.py의
설계 원칙("Postgres 접근을 이 서버 하나로 집중" — 다른 프로세스가 RDS에
직접 붙으면 admin Lambda가 그랬던 것과 같은 VPC/인터넷 접근 충돌이
재발한다)이 이미 명시돼 있어서, 이 파이프라인도 직접 psycopg2로 붙는
대신 admin 콘솔과 완전히 같은 내부 API(`POST /admin/posts` 등)를 탄다.
그 결과 이 파이프라인이 쓰는 글도 admin_posts_repo.py의 검증된
트랜잭션(publications INSERT + renditions/webtoon_panels/media_assets/
rendition_blocks 파생 프로젝션까지 한 번에)을 그대로 물려받는다.

토큰(`/sedaily-mbti/admin/lens-cms-api-token`)은 최초 호출 시 SSM에서
한 번만 읽어 프로세스 안에 캐시한다 — 절대 로그에 찍지 않는다.
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
    """오늘(또는 지정일) 이미 발행된 글 목록 — 하루 누적 캡(2026-09-28,
    mustknow_auto 지면특별코너 4탭+일반 카테고리)에 쓴다. `GET /admin/posts`
    가 이미 status/channel/date 필터를 지원해서(`admin_posts_repo.list_posts`)
    새 엔드포인트 없이 재사용 — `date`는 `YYYY-MM-DD`(admin_publish_date
    컬럼과 동일 형식, `_publish()`의 `publish_date_iso`와 같은 포맷).
    limit=200은 하루 실제 발행량(현재 실측 최대 ~50건대)에 여유 있는 값.
    실패 시 빈 리스트 반환(호출부가 "오늘 0건 발행"으로 간주 — fail-open,
    캡 계산이 실패해도 발행 자체를 막지 않는다는 기존 원칙과 동일)."""
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
    """"선정 실험실"(admin `/selection-lab`, v1.35) 기록용 — run.py가 매
    회차(select_general_articles 호출 직후) 부른다. 발행 자체를 막아선
    안 되는 부가 기록이라 list_published_today()와 같은 fail-open —
    실패해도 조용히 넘어가고 파이프라인은 계속 진행한다."""
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

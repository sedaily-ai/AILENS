# 오늘의 1면 실데이터 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서울경제 지면 1면 기사(매일 5~6건)를 실데이터로 수집·저장·API 제공·`/paper` 페이지 표시한다.

**Architecture:** 기존 v2 paper-mode 수집기(매일 KST 00:00 cron)의 필터를 1곳 확대해 1면 전체가 pgvector+S3에 들어가게 하고, 신규 read-only Lambda(`sedaily-mbti-v2-front-page-dev`)가 `GET /api/v2/front-page`로 합성 응답을 제공하며, 프론트 FSD 신규 feature(`features/front-page`)가 `/paper` 라우트에서 렌더한다. 스펙: `docs/superpowers/specs/2026-07-23-front-page-live-data-design.md`.

**Tech Stack:** Python 3.11 Lambda (pg8000 + boto3), pgvector(RDS), Next.js 16 static export + React 19 + Tailwind v4.

## Global Constraints

- 커밋 트레일러는 **정확히** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` — 모델 접미사 금지.
- **v1 파일 수정 금지.** 백엔드 변경은 전부 `service/backend/v2/` 안 (`.clauderules`).
- AWS: Lambda **생성**과 시크릿 env 쓰기는 **수동(사용자 확인 게이트)**. 기존 함수 `update-function-code`(=deploy-v2.sh)만 자동 허용. 리소스 생성 시 이상 발생 즉시 중단 + 생성 ID 기록.
- `PG_V2_PASSWORD` 등 시크릿 **값**을 로그/문서/채팅에 출력 금지 (env 복제는 JSON 변수로 전달만).
- v2 신규 파이썬 파일은 pytest 테스트 동반. 실행: `cd service/backend && python3 -m pytest v2/tests/<file> -v -m 'not integration'`.
- 프론트: FSD — 신규 코드는 `features/front-page/`에만, 타 feature 수정은 진입 링크 1곳(NewsFeedTab)만. barrel(index.ts) 경유 import. `any` 금지. 게이트: `npx tsc --noEmit` + `npm run build`.
- 1면 판별값은 plain `"1"` (paperNumber, 7일 2,165건 실측 2026-07-23). `strip() == "1"` 비교.
- 프론트 API 응답은 **envelope 없음** (payload 직접 반환 — today-letters와 동일, curl 실측 확인).

---

### Task 1: 수집 필터 확대 — 1면 전체 통과

**Files:**
- Modify: `service/backend/v2/handlers/core1_collector.py` (`_passes_paper_filter` L125-149, run 루프/로그 L316-337)
- Test: `service/backend/v2/tests/test_core1_collector.py` (섹션 추가)

**Interfaces:**
- Consumes: `S3Article.paper: Optional[PaperInfo]` (v1 `clients/s3_xml_client.py` — 필드: `publish_date, number, print_number, paper_number, paragraph, position, detail_position`)
- Produces: `_is_front_page(article: S3Article) -> bool`, `_passes_paper_filter(article) -> Tuple[bool, str]` (pass reason에 `"front-page"` 추가), run 로그 `collector_paper_mode_run`에 `front_page_pass: int` 필드

- [ ] **Step 1: 실패하는 테스트 작성** — `test_core1_collector.py`의 `# Unit — garbage filter` 섹션 앞에 추가. import 블록에 두 줄 추가(이미 있으면 생략): `from clients.s3_xml_client import PaperInfo` (기존 `S3Article` import 라인 옆), `from v2.handlers import core1_collector` (monkeypatch 대상용). 그리고 기존 `from v2.handlers.core1_collector import (...)` 블록에 `_is_front_page,`와 `_passes_paper_filter,` 추가.

```python
# =============================================================================
# Unit — paper filter (collector-paper-mode 확대: TOP OR 1면)
# =============================================================================


def _paper(paper_number: str, paragraph: str) -> PaperInfo:
    return PaperInfo(
        publish_date="20260723",
        number="",
        print_number="35",
        paper_number=paper_number,
        paragraph=paragraph,
        position="",
        detail_position="",
    )


def _enable_paper_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        core1_collector.feature_flag,
        "is_enabled",
        lambda name: name == "collector-paper-mode",
    )


def test_paper_mode_accepts_top_article_on_any_page(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=_paper("3", "TOP")))
    assert ok and reason == "paragraph-TOP"


def test_paper_mode_accepts_front_page_non_top(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=_paper("1", "9")))
    assert ok and reason == "front-page"


def test_paper_mode_strips_whitespace_in_paper_number(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, _ = _passes_paper_filter(_make_article(paper=_paper(" 1 ", "9")))
    assert ok


def test_paper_mode_rejects_non_front_page_sub_article(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=_paper("2", "9")))
    assert not ok and reason == "paragraph-not-TOP"


def test_paper_mode_rejects_online_only(monkeypatch) -> None:
    _enable_paper_mode(monkeypatch)
    ok, reason = _passes_paper_filter(_make_article(paper=None))
    assert not ok and reason == "no-paper-element"


def test_is_front_page_true_only_for_page_1() -> None:
    assert _is_front_page(_make_article(paper=_paper("1", "9")))
    assert _is_front_page(_make_article(paper=_paper("1", "TOP")))
    assert not _is_front_page(_make_article(paper=_paper("2", "TOP")))
    assert not _is_front_page(_make_article(paper=None))
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_core1_collector.py -v -m 'not integration' -k "paper_mode or front_page"`
Expected: **FAIL** — `ImportError: cannot import name '_is_front_page'`

- [ ] **Step 3: 구현** — `core1_collector.py`의 `_passes_paper_filter`를 아래로 교체하고, 직전에 `_is_front_page` 추가:

```python
def _is_front_page(article: S3Article) -> bool:
    """지면 1면(paperNumber == '1') 기사 여부.

    포맷은 plain '1' — 7일치 2,165건 실측에서 0-패딩("01")·알파벳("A1")
    0건 (2026-07-23, spec §2.2). 변하면 run 로그 front_page_pass=0 으로 감지.
    """
    return (
        article.paper is not None
        and (article.paper.paper_number or "").strip() == "1"
    )


def _passes_paper_filter(article: S3Article) -> Tuple[bool, str]:
    """paper-mode 일 때 ``paragraph == 'TOP'`` **또는 1면 기사** 통과.

    paragraph 의 의미 (정찰 5d aggregate, 377 paper articles):
      ``'TOP'`` = 각 지면 (paperNumber=1..31) 의 메인 기사 — 113건 (30%)
      ``'9'``   = 각 지면의 sub article (페이지 단 위치) — 264건 (70%)
      그 외 값 부재 (정확히 2종류만)

    2026-07-23 확대 (front-page-live-data spec §5.1): '오늘의 1면' 표시용으로
    1면(paperNumber=='1')은 paragraph 무관 전부 수집 — 순증 +4~5건/일.
    reason 'paragraph-not-TOP' 은 이제 "TOP 도 1면도 아님"을 뜻한다.

    Returns ``(ok, reason)``: legacy mode 면 ``(True, 'legacy-mode')``,
    paper mode 면 ``article.paper`` 유무 + paragraph/1면 값으로 결정.
    """
    if not feature_flag.is_enabled("collector-paper-mode"):
        return True, "legacy-mode"
    if article.paper is None:
        return False, "no-paper-element"
    paragraph = (article.paper.paragraph or "").strip()
    if paragraph == "TOP":
        return True, "paragraph-TOP"
    if _is_front_page(article):
        return True, "front-page"
    return False, "paragraph-not-TOP"
```

주의: `_is_collectible`은 수정하지 않는다 — pass reason을 "pass"로 뭉개는 기존 동작·`CollectorPaperPass` 메트릭이 그대로 유지된다.

- [ ] **Step 4: run 로그에 `front_page_pass` 추가** — `collector_paper_mode_run` logger.info 직전(`garbage_count = ...` 다음 줄)에 계산을 넣고 dict에 필드 추가:

```python
    # 통과분 중 1면 기사 수 — '오늘 1면 0건' 감지용 (spec §5.1)
    front_page_pass = sum(1 for a in after_garbage if _is_front_page(a))
    logger.info(json.dumps({
        "event": "collector_paper_mode_run",
        "target_date": date_str,
        "paper_mode": paper_mode_enabled,
        "total_inserts": len(inserts),
        "paper_pass": filter_reasons["pass"],
        "front_page_pass": front_page_pass,
        "paper_fail_no_element": filter_reasons["no-paper-element"],
        "paper_fail_paragraph_not_TOP": filter_reasons["paragraph-not-TOP"],
        "other_filtered": filter_reasons["body-too-short"] + filter_reasons["title-garbage"],
    }, ensure_ascii=False))
```

- [ ] **Step 5: 전체 유닛 통과 확인 (회귀 포함)**

Run: `cd service/backend && python3 -m pytest v2/tests/test_core1_collector.py -v -m 'not integration'`
Expected: **PASS** 전부 (기존 테스트 포함 — 기존 garbage 테스트들은 flag OFF 경로라 영향 없음)

- [ ] **Step 6: Commit**

```bash
git add service/backend/v2/handlers/core1_collector.py service/backend/v2/tests/test_core1_collector.py
git commit -m "feat(v2): collector paper filter를 1면 전체로 확대 (TOP OR paperNumber==1)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: PgVectorV2Client — 1면 read 메서드 2개

**Files:**
- Modify: `service/backend/v2/clients/pgvector_v2_client.py` (`get_daily_letters` L1801 근처, read 메서드 영역 끝에 추가)
- Test: `service/backend/v2/tests/test_pgvector_v2_client.py` (섹션 추가)

**Interfaces:**
- Consumes: `self.conn.run(sql, **named_params)` (pg8000.native), `self._enabled: bool`
- Produces (Task 3가 사용):
  - `get_front_page_articles(paper_date: str) -> List[Dict[str, Any]]` — `paper_date`는 `'YYYYMMDD'`. row dict: `{news_id: str, title: str, category: str|None, published_at: str|None(ISO), metadata: dict}`
  - `get_latest_front_page_date(upper_bound: str) -> Optional[str]` — `'YYYYMMDD'` 반환

- [ ] **Step 1: 실패하는 테스트 작성** — `test_pgvector_v2_client.py` 말미에 추가 (파일 상단 import에 `import datetime as _dt`가 없으면 추가; 클라이언트 import는 기존 것 재사용):

```python
# =============================================================================
# Unit — front page read path (fake conn, DB 불필요)
# =============================================================================


class _FakeConn:
    """pg8000 conn.run 흉내 — 호출 기록 + canned rows 반환."""

    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def run(self, sql, **params):
        self.calls.append((sql, params))
        return self.rows


def _client_with_fake_conn(rows):
    c = PgVectorV2Client.__new__(PgVectorV2Client)  # __init__(env) 우회
    c._enabled = True
    c._conn = _FakeConn(rows)
    return c


def test_get_front_page_articles_shapes_rows() -> None:
    published = _dt.datetime(2026, 7, 22, 17, 29, tzinfo=_dt.timezone.utc)
    rows = [
        ["2KF26GAWZP", "폴더블 공개", "경제", published,
         {"paper_paragraph": "TOP", "url": "https://sedaily.com/a"}],
    ]
    c = _client_with_fake_conn(rows)
    out = c.get_front_page_articles("20260723")
    assert out[0]["news_id"] == "2KF26GAWZP"
    assert out[0]["published_at"] == published.isoformat()
    assert out[0]["metadata"]["paper_paragraph"] == "TOP"
    sql, params = c._conn.calls[0]
    assert "paper_number" in sql and params == {"pdate": "20260723"}


def test_get_front_page_articles_parses_string_metadata() -> None:
    rows = [["N1", "t", None, None, '{"url": "u"}']]
    c = _client_with_fake_conn(rows)
    assert c.get_front_page_articles("20260723")[0]["metadata"] == {"url": "u"}


def test_get_front_page_articles_disabled_returns_empty() -> None:
    c = PgVectorV2Client.__new__(PgVectorV2Client)
    c._enabled = False
    c._conn = None
    assert c.get_front_page_articles("20260723") == []


def test_get_latest_front_page_date_returns_scalar() -> None:
    c = _client_with_fake_conn([["20260722"]])
    assert c.get_latest_front_page_date("20260723") == "20260722"
    _, params = c._conn.calls[0]
    assert params == {"ub": "20260723"}


def test_get_latest_front_page_date_none_when_no_rows() -> None:
    c = _client_with_fake_conn([[None]])
    assert c.get_latest_front_page_date("20260723") is None
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m 'not integration' -k front_page`
Expected: **FAIL** — `AttributeError: ... has no attribute 'get_front_page_articles'`

- [ ] **Step 3: 구현** — `pgvector_v2_client.py`의 `get_daily_letters` 메서드 **앞**에 추가 (모듈 상단에 `json`은 이미 import되어 있음 — 없으면 추가):

```python
    # ------------------------------------------------------------------
    # Front Page (지면 1면) read path — front-page-live-data spec §5.2
    # ------------------------------------------------------------------

    def get_front_page_articles(self, paper_date: str) -> List[Dict[str, Any]]:
        """지면 1면(paperNumber=='1') 기사 rows. ``paper_date``는 'YYYYMMDD'.

        정렬은 핸들러가 수행(is_top 우선) — 여기선 조회만.
        """
        if not self._enabled:
            return []
        rows = self.conn.run(
            """
            SELECT news_id, title, category, published_at, metadata
            FROM articles
            WHERE metadata->>'paper_number' = '1'
              AND metadata->>'paper_date' = :pdate
            """,
            pdate=paper_date,
        )
        out: List[Dict[str, Any]] = []
        for r in rows:
            md = r[4]
            if isinstance(md, str):
                try:
                    md = json.loads(md)
                except Exception:
                    md = {}
            out.append({
                "news_id": r[0],
                "title": r[1],
                "category": r[2],
                "published_at": r[3].isoformat() if hasattr(r[3], "isoformat") else r[3],
                "metadata": md or {},
            })
        return out

    def get_latest_front_page_date(self, upper_bound: str) -> Optional[str]:
        """저장된 가장 최근 지면일('YYYYMMDD', ``<= upper_bound``). 없으면 None.

        주말·휴간일 fallback 용 — 요청일에 지면이 없으면 직전 발행일을 찾는다.
        """
        if not self._enabled:
            return None
        rows = self.conn.run(
            """
            SELECT MAX(metadata->>'paper_date')
            FROM articles
            WHERE metadata->>'paper_number' = '1'
              AND COALESCE(metadata->>'paper_date', '') <> ''
              AND metadata->>'paper_date' <= :ub
            """,
            ub=upper_bound,
        )
        if rows and rows[0] and rows[0][0]:
            return rows[0][0]
        return None
```

- [ ] **Step 4: 통과 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_pgvector_v2_client.py -v -m 'not integration'`
Expected: **PASS** (front_page 5건 + 기존 유닛 전부)

- [ ] **Step 5: Commit**

```bash
git add service/backend/v2/clients/pgvector_v2_client.py service/backend/v2/tests/test_pgvector_v2_client.py
git commit -m "feat(v2): pgvector 1면 기사 read 메서드 추가 (get_front_page_articles/latest_date)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: front_page 핸들러 — `GET /api/v2/front-page`

**Files:**
- Create: `service/backend/v2/handlers/front_page.py`
- Test: `service/backend/v2/tests/test_front_page.py` (신규)

**Interfaces:**
- Consumes: Task 2의 `get_front_page_articles(paper_date)` / `get_latest_front_page_date(upper_bound)`, `S3ArticleV2Client().get_article_file(news_id, "original.json") -> Optional[dict]` (env `S3_ARTICLE_BODY_V2_BUCKET` 기반 no-op 가능), `@handler_decorator`, `success_response`/`error_response`, `CORS_HEADERS`
- Produces: Lambda 핸들러 `v2.handlers.front_page.lambda_handler`. 응답 payload(envelope 없음):
  `{requested_date: 'YYYY-MM-DD', paper_date: 'YYYY-MM-DD', is_fallback: bool, articles: [{news_id, title, sub_title, category, author_name, published_at, url, image_url, is_top, content, content_blocks}]}`

- [ ] **Step 1: 실패하는 테스트 작성** — `service/backend/v2/tests/test_front_page.py` 신규:

```python
"""Unit tests for the Front Page API handler (front-page-live-data spec §5.2).

전부 유닛 — PgVectorV2Client / S3ArticleV2Client 는 fake 로 대체.
Run from ``backend/``::

    python3 -m pytest v2/tests/test_front_page.py -v
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import pytest

from v2.handlers import front_page
from v2.handlers.front_page import lambda_handler


# =============================================================================
# Fakes
# =============================================================================


class _FakePg:
    def __init__(
        self,
        rows_by_date: Dict[str, List[Dict[str, Any]]],
        latest: Optional[str] = None,
    ) -> None:
        self.rows_by_date = rows_by_date
        self.latest = latest
        self.closed = False

    def get_front_page_articles(self, paper_date: str) -> List[Dict[str, Any]]:
        return self.rows_by_date.get(paper_date, [])

    def get_latest_front_page_date(self, upper_bound: str) -> Optional[str]:
        return self.latest

    def close(self) -> None:
        self.closed = True


class _FakeS3:
    def __init__(self, bodies: Dict[str, Any]) -> None:
        self.bodies = bodies

    def get_article_file(self, news_id: str, filename: str) -> Optional[Dict[str, Any]]:
        v = self.bodies.get(news_id)
        if isinstance(v, Exception):
            raise v
        return v


def _row(news_id: str, paragraph: str = "9", published_at: str = "2026-07-22T10:00:00+09:00") -> Dict[str, Any]:
    return {
        "news_id": news_id,
        "title": f"제목-{news_id}",
        "category": "경제",
        "published_at": published_at,
        "metadata": {
            "paper_paragraph": paragraph,
            "sub_title": "부제",
            "author_name": "홍길동 기자",
            "url": f"https://www.sedaily.com/NewsView/{news_id}",
        },
    }


def _body(image_url: str = "https://img/x.jpg") -> Dict[str, Any]:
    return {
        "content_ko": "본문 문단1\n\n본문 문단2",
        "content_blocks": [{"type": "text", "text_ko": "본문 문단1"}],
        "images": [{"url": image_url}],
    }


def _install(monkeypatch: pytest.MonkeyPatch, pg: _FakePg, s3: Optional[_FakeS3] = None) -> None:
    monkeypatch.setattr(front_page, "PgVectorV2Client", lambda: pg)
    monkeypatch.setattr(front_page, "S3ArticleV2Client", lambda: s3 or _FakeS3({}))


def _get(date: Optional[str] = None) -> Dict[str, Any]:
    event: Dict[str, Any] = {"httpMethod": "GET"}
    if date:
        event["queryStringParameters"] = {"date": date}
    return event


# =============================================================================
# Tests
# =============================================================================


def test_invalid_date_returns_400(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler(_get("2026/07/23"), None)
    assert resp["statusCode"] == 400


def test_direct_hit_no_fallback_sorted_top_first(monkeypatch) -> None:
    pg = _FakePg({"20260723": [
        _row("B-SUB", paragraph="9", published_at="2026-07-22T09:00:00+09:00"),
        _row("A-TOP", paragraph="TOP", published_at="2026-07-22T18:00:00+09:00"),
    ]})
    s3 = _FakeS3({"A-TOP": _body(), "B-SUB": _body()})
    _install(monkeypatch, pg, s3)
    resp = lambda_handler(_get("2026-07-23"), None)
    assert resp["statusCode"] == 200
    payload = json.loads(resp["body"])
    assert payload["paper_date"] == "2026-07-23"
    assert payload["is_fallback"] is False
    assert [a["news_id"] for a in payload["articles"]] == ["A-TOP", "B-SUB"]
    assert payload["articles"][0]["is_top"] is True
    assert payload["articles"][0]["image_url"] == "https://img/x.jpg"
    assert pg.closed is True


def test_weekend_falls_back_to_latest_paper_date(monkeypatch) -> None:
    pg = _FakePg(
        {"20260722": [_row("FRI", paragraph="TOP")]},
        latest="20260722",
    )
    _install(monkeypatch, pg, _FakeS3({"FRI": _body()}))
    resp = lambda_handler(_get("2026-07-23"), None)
    payload = json.loads(resp["body"])
    assert payload["requested_date"] == "2026-07-23"
    assert payload["paper_date"] == "2026-07-22"
    assert payload["is_fallback"] is True


def test_empty_store_returns_empty_articles(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}, latest=None))
    resp = lambda_handler(_get("2026-07-23"), None)
    payload = json.loads(resp["body"])
    assert payload["articles"] == [] and payload["is_fallback"] is False


def test_s3_miss_keeps_article_in_list_without_body(monkeypatch) -> None:
    pg = _FakePg({"20260723": [_row("NOBODY", paragraph="TOP")]})
    _install(monkeypatch, pg, _FakeS3({"NOBODY": RuntimeError("s3 down")}))
    resp = lambda_handler(_get("2026-07-23"), None)
    a = json.loads(resp["body"])["articles"][0]
    assert a["news_id"] == "NOBODY"
    assert a["content"] == "" and a["content_blocks"] == []
    assert a["url"].endswith("NOBODY")  # 원문 링크는 유지


def test_cache_control_header_on_success(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler(_get("2026-07-23"), None)
    assert resp["headers"]["Cache-Control"] == "public, max-age=300"


def test_options_returns_200_with_cors(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert resp["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in resp["headers"]
```

- [ ] **Step 2: 실패 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_front_page.py -v`
Expected: **FAIL** — `ModuleNotFoundError: No module named 'v2.handlers.front_page'`

- [ ] **Step 3: 핸들러 구현** — `service/backend/v2/handlers/front_page.py` 신규:

```python
"""GET /api/v2/front-page — 서울경제 지면 1면 기사 API.

Collector paper-mode 가 수집한 pgvector rows(metadata.paper_*)와 S3
``articles/{nsid}/original.json`` 본문을 합성해 1면 기사 목록을 반환한다.
(front-page-live-data spec §5.2)

Query: ``?date=YYYY-MM-DD`` (기본 = KST 오늘). 해당일 지면이 없으면(주말
휴간 등) 가장 가까운 이전 지면일로 fallback 하고 ``is_fallback=true``.

Response (200, envelope 없음):
```json
{
  "requested_date": "2026-07-23",
  "paper_date": "2026-07-23",
  "is_fallback": false,
  "articles": [
    {"news_id": "...", "title": "...", "sub_title": "...", "category": "...",
     "author_name": "...", "published_at": "...", "url": "...",
     "image_url": "...", "is_top": true,
     "content": "...", "content_blocks": [...]}
  ]
}
```
저장소가 완전히 비면 200 + ``articles=[]`` — 프론트는 정직한 빈 상태를
표시한다 (mock fallback 금지, spec §5.3).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.clients.s3_article_v2_client import S3ArticleV2Client


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_KST = timezone(timedelta(hours=9))

# 지면은 하루 1회 발행 — 브라우저/중간 캐시 5분이면 충분히 신선 (spec §5.2).
_CACHE_CONTROL = "public, max-age=300"


def _parse_query_date(event: Dict[str, Any]) -> str:
    """``today_letters._parse_query_date`` 와 동일 규약 (YYYY-MM-DD)."""
    qs = event.get("queryStringParameters") or {}
    raw = qs.get("date")
    if raw:
        try:
            datetime.strptime(raw, "%Y-%m-%d")
            return raw
        except ValueError:
            raise ValueError(f"invalid date: {raw!r}; expected YYYY-MM-DD")
    return datetime.now(tz=_KST).date().isoformat()


def _to_yyyymmdd(iso_date: str) -> str:
    return iso_date.replace("-", "")


def _to_iso(yyyymmdd: str) -> str:
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"


def _shape_article(row: Dict[str, Any], body: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """pgvector row + S3 original.json → 응답 기사 1건.

    body 가 None(S3 누락/오류)이어도 목록에서 빠지지 않는다 — 제목/원문
    링크는 metadata 만으로 채워지고 본문 필드만 빈 값 (spec §8).
    """
    md = row.get("metadata") or {}
    b = body or {}
    images = b.get("images") or []
    image_url = ""
    if images and isinstance(images[0], dict):
        image_url = images[0].get("url") or ""
    return {
        "news_id": row["news_id"],
        "title": row.get("title") or "",
        "sub_title": md.get("sub_title") or "",
        "category": row.get("category") or "",
        "author_name": md.get("author_name") or "",
        "published_at": row.get("published_at"),
        "url": md.get("url") or "",
        "image_url": image_url,
        "is_top": (md.get("paper_paragraph") or "").strip() == "TOP",
        "content": b.get("content_ko") or "",
        "content_blocks": b.get("content_blocks") or [],
    }


async def _load_bodies(
    s3: S3ArticleV2Client, news_ids: List[str]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """``original.json`` 병렬 로드. 개별 실패는 None — 목록 전체를 막지 않는다."""

    def _one(nid: str) -> Optional[Dict[str, Any]]:
        try:
            return s3.get_article_file(nid, "original.json")
        except Exception:
            logger.exception(f"front-page body load failed: {nid}")
            return None

    results = await asyncio.gather(*(asyncio.to_thread(_one, nid) for nid in news_ids))
    return dict(zip(news_ids, results))


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        requested_iso = _parse_query_date(event)
    except ValueError as exc:
        return error_response(str(exc), status_code=400, code="VALIDATION")

    requested_ymd = _to_yyyymmdd(requested_iso)

    pg = PgVectorV2Client()
    try:
        rows = pg.get_front_page_articles(requested_ymd)
        paper_ymd = requested_ymd
        is_fallback = False
        if not rows:
            latest = pg.get_latest_front_page_date(requested_ymd)
            if latest and latest != requested_ymd:
                rows = pg.get_front_page_articles(latest)
                paper_ymd = latest
                is_fallback = bool(rows)
    finally:
        pg.close()

    if not rows:
        logger.info(json.dumps({
            "event": "front_page_empty",
            "requested_date": requested_iso,
        }))
        payload: Dict[str, Any] = {
            "requested_date": requested_iso,
            "paper_date": requested_iso,
            "is_fallback": False,
            "articles": [],
        }
    else:
        s3 = S3ArticleV2Client()
        bodies = await _load_bodies(s3, [r["news_id"] for r in rows])
        articles = [_shape_article(r, bodies.get(r["news_id"])) for r in rows]
        # 톱기사 우선, 이후 발행시각·news_id — 결정적 정렬 (spec §5.2)
        articles.sort(
            key=lambda a: (not a["is_top"], a["published_at"] or "", a["news_id"])
        )
        payload = {
            "requested_date": requested_iso,
            "paper_date": _to_iso(paper_ymd),
            "is_fallback": is_fallback,
            "articles": articles,
        }

    resp = success_response(payload)
    resp["headers"] = {**resp["headers"], "Cache-Control": _CACHE_CONTROL}
    return resp
```

- [ ] **Step 4: 통과 확인**

Run: `cd service/backend && python3 -m pytest v2/tests/test_front_page.py -v`
Expected: **PASS** 8건 전부

주의: `test_invalid_date_returns_400`이 500으로 나오면 `@handler_decorator`가 핸들러 안 ValueError를 먼저 잡는 경우다 — 그때는 today_letters와 동일하게 이미 try/except로 400을 반환하고 있으므로 실제로는 발생하지 않아야 정상. 발생 시 원인 로그 전체를 확인하고 우회하지 말 것.

- [ ] **Step 5: Commit**

```bash
git add service/backend/v2/handlers/front_page.py service/backend/v2/tests/test_front_page.py
git commit -m "feat(v2): GET /api/v2/front-page 핸들러 — 1면 기사 목록+본문 합성 API

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: deploy-v2.sh 등록

**Files:**
- Modify: `service/backend/v2/deploy-v2.sh` (L41-46 `API_V2_FUNCTIONS`, L96-98 case 블록, L135 usage 문자열)

**Interfaces:**
- Produces: `./v2/deploy-v2.sh front-page` 타깃, `api`/`all` 타깃에 신규 함수 포함

- [ ] **Step 1: `API_V2_FUNCTIONS`에 추가** (subscribe 라인 다음):

```bash
  "sedaily-mbti-v2-front-page-dev"     # 지면 1면 기사 GET API (handlers/front_page.py)
                                       # 함수 최초 생성 수동(.clauderules), 이후 update만 자동
```

- [ ] **Step 2: case 블록 추가** (`today-letters)` 케이스 다음):

```bash
  front-page)
    FUNCTIONS=("sedaily-mbti-v2-front-page-dev")
    ;;
```

- [ ] **Step 3: usage 문자열 갱신** — `today-letters` 뒤에 `front-page` 삽입:

```bash
    echo "Use: all | api | subscribe | collector | selector | transform | editor-pick | today-letters | front-page | personalization | feed | article | interaction | consolidate | newsletter | chat-agent"
```

- [ ] **Step 4: 문법 검증**

Run: `bash -n service/backend/v2/deploy-v2.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 5: Commit**

```bash
git add service/backend/v2/deploy-v2.sh
git commit -m "chore(v2): deploy-v2.sh에 front-page Lambda 등록

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 프론트 — frontPageApi (타입 + fetch + 캐시)

**Files:**
- Create: `service/frontend/src/features/front-page/api/frontPageApi.ts`
- Create: `service/frontend/src/features/front-page/index.ts` (일단 api만 export, Task 6에서 확장)

**Interfaces:**
- Consumes: `API_URL` (`@/shared/config/api`), Task 3 응답 스키마
- Produces (Task 6이 사용): `fetchFrontPage(date?: string): Promise<FrontPageResponse>`, 타입 `FrontPageResponse`, `FrontPageArticle`, `FrontPageBlock`

- [ ] **Step 1: `frontPageApi.ts` 작성**

```typescript
/**
 * Front Page(지면 1면) API client.
 *
 * GET /api/v2/front-page?date=YYYY-MM-DD
 * (backend/v2/handlers/front_page.py 와 1:1 — envelope 없음)
 *
 * mock fallback 없음 — 저장소가 진실의 원천 (spec §5.3).
 */
import { API_URL } from '@/shared/config/api';

// 본문 블록 — S3 original.json 의 content_blocks 실물 shape (2026-07-23 실측)
export interface FrontPageBlockImage {
  type: 'image';
  url: string;
  alt?: string;
  caption?: string;
  width?: string;
}

export interface FrontPageBlockText {
  type: 'text';
  text_ko: string;
}

export type FrontPageBlock = FrontPageBlockImage | FrontPageBlockText;

export interface FrontPageArticle {
  news_id: string;
  title: string;
  sub_title: string;
  category: string;
  author_name: string;
  published_at: string | null;
  url: string;
  image_url: string;
  is_top: boolean;
  content: string;
  content_blocks: FrontPageBlock[];
}

export interface FrontPageResponse {
  requested_date: string;
  paper_date: string;
  is_fallback: boolean;
  articles: FrontPageArticle[];
}

// 날짜별 응답 캐시 — Promise 자체를 캐시해 동시 호출이 같은 fetch 공유
// (todayLettersApi 와 동일 패턴).
const cache = new Map<string, Promise<FrontPageResponse>>();

export async function fetchFrontPage(date?: string): Promise<FrontPageResponse> {
  const key = date ?? '__today__';
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = (async () => {
    const qs = date ? `?date=${date}` : '';
    const res = await fetch(`${API_URL}/api/v2/front-page${qs}`);
    if (!res.ok) {
      throw new Error(`front-page API ${res.status}`);
    }
    return (await res.json()) as FrontPageResponse;
  })();

  // 실패 시 다음 호출에서 재시도되도록 cache 에서 제거.
  promise.catch(() => cache.delete(key));
  cache.set(key, promise);
  return promise;
}
```

- [ ] **Step 2: `index.ts` 작성**

```typescript
export {
  fetchFrontPage,
  type FrontPageArticle,
  type FrontPageBlock,
  type FrontPageResponse,
} from './api/frontPageApi';
```

- [ ] **Step 3: 타입 게이트**

Run: `cd service/frontend && npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 4: Commit**

```bash
git add service/frontend/src/features/front-page/
git commit -m "feat(frontend): front-page API 클라이언트 + 타입 (FSD feature 신설)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 프론트 — ArticleBlocks + FrontPageView + `/paper` 라우트

**Files:**
- Create: `service/frontend/src/features/front-page/components/ArticleBlocks.tsx`
- Create: `service/frontend/src/features/front-page/components/FrontPageView.tsx`
- Modify: `service/frontend/src/features/front-page/index.ts` (FrontPageView export 추가)
- Create: `service/frontend/src/app/paper/page.tsx`

**Interfaces:**
- Consumes: Task 5의 `fetchFrontPage`/타입 (feature 내부 상대경로 import — barrel은 외부용)
- Produces: `/paper` 라우트 (정적 export 호환 — 동적 세그먼트 없음, `?date=`는 클라이언트 처리)

- [ ] **Step 1: `ArticleBlocks.tsx` 작성** — content_blocks 렌더러 (이미지 위치 보존):

```tsx
import type { FrontPageBlock } from '../api/frontPageApi';

interface Props {
  blocks: FrontPageBlock[];
  /** blocks 가 비었을 때 대신 렌더할 순수 텍스트 (content_ko) */
  fallbackText: string;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((p, i) => (
          <p key={i} className="text-[15px] leading-7 text-neutral-800">
            {p}
          </p>
        ))}
    </>
  );
}

export function ArticleBlocks({ blocks, fallbackText }: Props) {
  if (!blocks.length) {
    return (
      <div className="space-y-4">
        <Paragraphs text={fallbackText} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        if (block.type === 'image' && block.url) {
          return (
            <figure key={i}>
              {/* 정적 export + 외부 이미지(wimg.sedaily.com) → next/image 대신 원본 사용 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || block.caption || ''}
                className="w-full rounded-lg"
                loading="lazy"
              />
              {block.caption && (
                <figcaption className="mt-2 text-xs text-neutral-500">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );
        }
        if (block.type === 'text' && block.text_ko) {
          return (
            <div key={i} className="space-y-4">
              <Paragraphs text={block.text_ko} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 2: `FrontPageView.tsx` 작성**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchFrontPage,
  type FrontPageArticle,
  type FrontPageResponse,
} from '../api/frontPageApi';
import { ArticleBlocks } from './ArticleBlocks';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

function formatPaperDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return iso;
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 ${dow}요일`;
}

function prevDay(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - 1);
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${t.getFullYear()}-${mm}-${dd}`;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; data: FrontPageResponse };

function ArticleCard({
  article,
  expanded,
  onToggle,
}: {
  article: FrontPageArticle;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="border-b border-neutral-200 py-6">
      <button type="button" onClick={onToggle} className="block w-full text-left">
        {article.is_top && (
          <span className="mb-2 inline-block rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            1면 톱
          </span>
        )}
        <h2 className="editorial-title text-xl font-bold leading-snug text-neutral-900">
          {article.title}
        </h2>
        {article.sub_title && (
          <p className="mt-1.5 text-sm leading-6 text-neutral-500">{article.sub_title}</p>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          {article.category}
          {article.author_name ? ` · ${article.author_name}` : ''}
        </p>
        {!expanded && article.image_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.image_url}
              alt={article.title}
              className="mt-3 w-full rounded-lg"
              loading="lazy"
            />
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-4">
          <ArticleBlocks blocks={article.content_blocks} fallbackText={article.content} />
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
            >
              서울경제 원문 보기 ↗
            </a>
          )}
        </div>
      )}
    </article>
  );
}

export function FrontPageView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date') ?? undefined;

  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback((date?: string) => {
    setState({ phase: 'loading' });
    setExpandedId(null);
    fetchFrontPage(date)
      .then((data) => setState({ phase: 'ready', data }))
      .catch(() => setState({ phase: 'error' }));
  }, []);

  useEffect(() => {
    load(dateParam);
  }, [dateParam, load]);

  const goDate = (date?: string) => {
    router.replace(date ? `/paper?date=${date}` : '/paper');
  };

  return (
    <div className="min-h-screen bg-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700;900&display=swap');
        .editorial-title { font-family: 'Noto Serif KR', serif; }
      `}</style>

      <div className="mx-auto max-w-[680px] px-5 pb-24 pt-10">
        <header className="border-b-2 border-neutral-900 pb-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
              ← AI LENS
            </Link>
            {dateParam && (
              <button
                type="button"
                onClick={() => goDate(undefined)}
                className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                오늘 1면으로
              </button>
            )}
          </div>
          <h1 className="editorial-title mt-3 text-2xl font-black text-neutral-900">
            서울경제 오늘의 1면
          </h1>
          {state.phase === 'ready' && (
            <p className="mt-1 text-sm text-neutral-500">
              {formatPaperDate(state.data.paper_date)}자 지면
            </p>
          )}
        </header>

        {state.phase === 'loading' && (
          <div className="space-y-6 py-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse space-y-3">
                <div className="h-6 w-4/5 rounded bg-neutral-200" />
                <div className="h-4 w-3/5 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        )}

        {state.phase === 'error' && (
          <div className="py-16 text-center">
            <p className="text-neutral-500">1면 기사를 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => load(dateParam)}
              className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              다시 시도
            </button>
          </div>
        )}

        {state.phase === 'ready' && (
          <>
            {state.data.is_fallback && (
              <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                {state.data.requested_date}에는 지면이 발행되지 않아{' '}
                {formatPaperDate(state.data.paper_date)}자 1면을 표시합니다.
              </p>
            )}

            {state.data.articles.length === 0 ? (
              <div className="py-16 text-center text-neutral-500">
                표시할 1면 기사가 아직 없습니다.
              </div>
            ) : (
              <div>
                {state.data.articles.map((a) => (
                  <ArticleCard
                    key={a.news_id}
                    article={a}
                    expanded={expandedId === a.news_id}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === a.news_id ? null : a.news_id))
                    }
                  />
                ))}
              </div>
            )}

            <div className="pt-8">
              <button
                type="button"
                onClick={() => goDate(prevDay(state.data.paper_date))}
                className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                ← 이전 지면 보기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `index.ts`에 View export 추가**

```typescript
export { FrontPageView } from './components/FrontPageView';
```

- [ ] **Step 4: `app/paper/page.tsx` 작성** (서버 컴포넌트 래퍼 — `useSearchParams`는 Suspense 필수):

```tsx
import { Suspense } from 'react';
import { FrontPageView } from '@/features/front-page';

export const metadata = {
  title: '오늘의 1면 | AI LENS',
  description: '서울경제 종이신문 1면 기사를 매일 그대로 전합니다.',
};

export default function PaperPage() {
  return (
    <Suspense fallback={null}>
      <FrontPageView />
    </Suspense>
  );
}
```

- [ ] **Step 5: 게이트 — 타입 + 빌드**

Run: `cd service/frontend && npx tsc --noEmit && npm run build`
Expected: 타입 에러 0, 빌드 성공 + export 목록에 `/paper` 포함

- [ ] **Step 6: Commit**

```bash
git add service/frontend/src/features/front-page/ service/frontend/src/app/paper/
git commit -m "feat(frontend): /paper 오늘의 1면 페이지 — 실기사 목록+본문 확장 렌더

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 메인 진입 링크 (NewsFeedTab)

**Files:**
- Modify: `service/frontend/src/features/news-feed/components/NewsFeedTab.tsx` (L111 `<BrandIntro />` 직후)

**Interfaces:**
- Consumes: `/paper` 라우트 (URL만 — front-page feature import **금지**, FSD 같은 레이어 간 import 위반이 됨)

- [ ] **Step 1: import 추가** — 파일 상단 import 블록에:

```tsx
import Link from "next/link";
```

- [ ] **Step 2: 진입 링크 삽입** — `<BrandIntro />` 바로 다음 줄에:

```tsx
      {/* 오늘의 1면 진입 — 실지면 1면 기사 (/paper). URL 링크만 — feature 간 import 없음 (FSD) */}
      <div
        className="mx-auto flex justify-center"
        style={{ maxWidth: 1200, padding: '16px clamp(20px, 5vw, 32px) 0' }}
      >
        <Link
          href="/paper"
          className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
        >
          📰 오늘의 서울경제 1면 기사 보기 →
        </Link>
      </div>
```

- [ ] **Step 3: 게이트**

Run: `cd service/frontend && npx tsc --noEmit && npm run build`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add service/frontend/src/features/news-feed/components/NewsFeedTab.tsx
git commit -m "feat(frontend): 메인 피드에 오늘의 1면(/paper) 진입 링크 추가

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 배포·프로비저닝·백필·스모크 (운영 — AWS 변경마다 사용자 확인 게이트)

**Files:** 없음 (운영 절차). **모든 [게이트] 스텝은 실행 직전 사용자에게 커맨드를 보여주고 확인받은 뒤 실행한다. 이상 발생 시 즉시 중단하고 보고. 생성된 리소스 ID는 PR 본문에 기록.**

**Interfaces:**
- Consumes: Task 1-7의 커밋 전부, AWS 계정 `887078546492` (us-east-1), HTTP API `chzwwtjtgk`

- [ ] **Step 1: collector 코드 배포** (자동 허용 범위)

Run: `cd service/backend && ./v2/deploy-v2.sh collector`
Expected: `sedaily-mbti-v2-collector-dev` 업데이트 성공 로그

- [ ] **Step 2: [게이트] Lambda 생성** — stub zip으로 생성 후 곧바로 실코드 배포. env는 today-letters 구성을 **값 비노출**로 복제:

```bash
cd "$(mktemp -d)" && printf 'def lambda_handler(e, c):\n    return {}\n' > lambda_function.py && zip -q stub.zip lambda_function.py
aws lambda create-function \
  --function-name sedaily-mbti-v2-front-page-dev \
  --runtime python3.11 \
  --handler v2.handlers.front_page.lambda_handler \
  --role arn:aws:iam::887078546492:role/service-role/sedaily-mbti-v2-collector-dev-role-nbf99tic \
  --timeout 30 --memory-size 256 \
  --vpc-config SubnetIds=subnet-0430a7468d7d796e9,subnet-0b9783a637589c096,SecurityGroupIds=sg-0cddc39619b1d69d9 \
  --zip-file fileb://stub.zip --region us-east-1 \
  --query 'FunctionArn'
ENV_JSON=$(aws lambda get-function-configuration \
  --function-name sedaily-mbti-v2-today-letters-dev --region us-east-1 \
  --query 'Environment' --output json)
aws lambda wait function-active --function-name sedaily-mbti-v2-front-page-dev --region us-east-1
aws lambda update-function-configuration \
  --function-name sedaily-mbti-v2-front-page-dev \
  --environment "$ENV_JSON" --region us-east-1 \
  --query 'LastUpdateStatus'
```

Expected: FunctionArn 출력, LastUpdateStatus `InProgress`→(wait)`Successful`. **ARN을 기록.**

- [ ] **Step 3: front-page 실코드 배포** (자동 허용 범위)

Run: `cd service/backend && aws lambda wait function-updated --function-name sedaily-mbti-v2-front-page-dev --region us-east-1 && ./v2/deploy-v2.sh front-page`
Expected: 업데이트 성공

- [ ] **Step 4: [게이트] API GW 라우트 + 권한**

```bash
INTEG_ID=$(aws apigatewayv2 create-integration --api-id chzwwtjtgk \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:us-east-1:887078546492:function:sedaily-mbti-v2-front-page-dev \
  --payload-format-version 2.0 --region us-east-1 \
  --query IntegrationId --output text)
echo "IntegrationId=$INTEG_ID"   # 기록
aws apigatewayv2 create-route --api-id chzwwtjtgk \
  --route-key 'GET /api/v2/front-page' \
  --target "integrations/$INTEG_ID" --region us-east-1 --query 'RouteId'
aws lambda add-permission --function-name sedaily-mbti-v2-front-page-dev \
  --statement-id apigw-front-page --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn 'arn:aws:execute-api:us-east-1:887078546492:chzwwtjtgk/*/*/api/v2/front-page' \
  --region us-east-1
```

Expected: IntegrationId·RouteId 출력 (기록). 스테이지는 기존 auto-deploy 사용 — 별도 배포 명령 없음.

- [ ] **Step 5: 스모크 1차 (백필 전 — 오늘 톱기사만 존재)**

```bash
curl -s 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/v2/front-page' | python3 -m json.tool | head -30
curl -s 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/v2/front-page?date=2026/07/23' -o /dev/null -w '%{http_code}\n'
```

Expected: ① 200 + `paper_date` 최신 지면일 + articles ≥1건(1면 톱기사, `is_top: true`) — 필터 확대 전 수집분이라 1건일 수 있음(정상). ② `400`

- [ ] **Step 6: [게이트] 백필 — 최근 8개 파일일 재수집** (spec §5.4, 멱등)

```bash
for D in 0 1 2 3 4 5 6 7; do
  aws lambda invoke --function-name sedaily-mbti-v2-collector-dev --region us-east-1 \
    --cli-binary-format raw-in-base64-out \
    --payload "{\"date\": \"$(date -v-${D}d +%Y%m%d)\"}" /dev/stdout
  echo " <- file-date $(date -v-${D}d +%Y%m%d)"
done
```

Expected: 각 invoke StatusCode 200. CloudWatch `collector_paper_mode_run` 로그에서 `front_page_pass` ≥ 4 (발행일 파일 기준) 확인.

- [ ] **Step 7: 스모크 2차 (백필 후)**

```bash
curl -s 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/v2/front-page' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['paper_date'], d['is_fallback'], len(d['articles']), [a['is_top'] for a in d['articles']])"
curl -s 'https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/v2/front-page?date=2026-07-19' | python3 -c "import json,sys; d=json.load(sys.stdin); print('fallback:', d['is_fallback'], '->', d['paper_date'])"
```

Expected: ① 오늘(또는 최신) 지면일, 5±2건, `is_top` True 1건 포함 ② 일요일 요청 → `fallback: True -> 2026-07-17` (근처 발행일)

- [ ] **Step 8: [게이트] 프론트 프로덕션 배포**

Run: `cd service/frontend && ./deploy.sh`
Expected: S3 sync + CloudFront invalidation 성공. 이후 https://ailens.sedaily.ai/paper 에서 실기사 확인 (브라우저)

- [ ] **Step 9: 마무리 커밋/기록** — 생성 리소스(Lambda ARN, IntegrationId, RouteId)를 PR 본문에 기록. 다음날 아침 cron 후 `front_page_pass` 로그 재확인 항목을 인수인계 노트에 남김.

---

## 실행 순서 요약

Task 1→2→3(백엔드 TDD) → 4(deploy 등록) → 5→6→7(프론트) → 8(운영). Task 5-7은 Task 1-4와 독립적으로 진행 가능하나, Task 8은 전부 완료 후.

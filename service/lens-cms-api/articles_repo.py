"""뉴스 기사(articles) — 공개 조회 + 수집기 쓰기 (v1.25).

DynamoDB(sedaily-mbti-articles-dev)는 본문을 S3에 포인터로 분리 저장했지만
(비용·크기 이유), Postgres articles.body는 v1.6/v1.19에서 이미 100%
백필돼 있어 그 인다이렉션이 필요 없다 — get_article()이 항상 본문
포함 완전한 행을 바로 돌려준다.

raw_category(v1.25 신규)가 지금 검색/목록이 실제로 쓰는 분류 키다
(DynamoDB GSI category-published_at-index와 동일 의미) —
article_categories(AI LENS 자체 7분류, 52%만 커버)나
section_id(뉴스레터 지면 분류, 비어있음)와는 다른 세 번째 체계다.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from db import get_cursor

_ARTICLE_SELECT = """
    SELECT article_no, title, subtitle, body, reporter_name, published_at,
           source_url, keywords, hashtags, body_hash, raw_category,
           collected_at, updated_at
    FROM articles
"""


def _article_to_dict(row: Dict[str, Any], images: List[Dict[str, Any]], related: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "news_id": row["article_no"],
        "title_ko": row["title"] or "",
        "sub_title_ko": row.get("subtitle") or "",
        "content_ko": row.get("body") or "",
        "author_name": row.get("reporter_name") or "",
        "byline": row.get("reporter_name") or "",
        "published_at": row["published_at"].isoformat() if row.get("published_at") else None,
        "url": row.get("source_url") or "",
        "original_link": row.get("source_url") or "",
        "category": row.get("raw_category") or "",
        "keywords": list(row.get("keywords") or []),
        "hashtags": list(row.get("hashtags") or []),
        "content_hash": row.get("body_hash") or "",
        "images": images,
        "related_news": related,
        "collected_at": row["collected_at"].isoformat() if row.get("collected_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }


def _fetch_images(cur, article_no: str) -> List[Dict[str, Any]]:
    cur.execute(
        "SELECT url, caption FROM article_images WHERE article_no = %s ORDER BY position",
        (article_no,),
    )
    return [{"url": r["url"], "caption": r.get("caption") or ""} for r in cur.fetchall()]


def _fetch_related(cur, article_no: str) -> List[Dict[str, Any]]:
    cur.execute(
        "SELECT title, url FROM article_related_news WHERE article_no = %s ORDER BY position",
        (article_no,),
    )
    return [{"title": r.get("title") or "", "url": r["url"]} for r in cur.fetchall()]


def get_article(article_no: str) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(_ARTICLE_SELECT + " WHERE article_no = %s", (article_no,))
        row = cur.fetchone()
        if not row:
            return None
        images = _fetch_images(cur, article_no)
        related = _fetch_related(cur, article_no)
        return _article_to_dict(row, images, related)


def list_articles_by_date(date_str: str, limit: int = 30) -> List[Dict[str, Any]]:
    """DynamoDB get_transformed_articles_by_date()와 동일 계약 — 특정 날짜
    (YYYYMMDD)에 발행된 기사 전체(카테고리 무관, 최신순)."""
    start = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
    with get_cursor() as cur:
        cur.execute(
            _ARTICLE_SELECT + " WHERE published_at::date = %s ORDER BY published_at DESC LIMIT %s",
            (start, limit),
        )
        rows = cur.fetchall()
        out = []
        for row in rows:
            images = _fetch_images(cur, row["article_no"])
            related = _fetch_related(cur, row["article_no"])
            out.append(_article_to_dict(row, images, related))
        return out


def get_recent_articles(category: str, limit: int = 3) -> List[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            _ARTICLE_SELECT + " WHERE raw_category = %s ORDER BY published_at DESC LIMIT %s",
            (category, limit),
        )
        rows = cur.fetchall()
        return [_article_to_dict(r, _fetch_images(cur, r["article_no"]), _fetch_related(cur, r["article_no"])) for r in rows]


def search_articles(categories: Optional[List[str]], keyword: Optional[str],
                     days: Optional[int] = None, limit: int = 30) -> List[Dict[str, Any]]:
    """search_service.py/chatbot_context_service.py의 GSI+contains() 필터를
    ILIKE로 대체 — 의미상 동일(부분 문자열 매칭), pg_trgm 인덱스로 나중에
    더 개선 가능(이번엔 기존 동작 재현이 목표)."""
    with get_cursor() as cur:
        sql = _ARTICLE_SELECT + " WHERE 1=1"
        params: List[Any] = []
        if categories:
            sql += " AND raw_category = ANY(%s)"
            params.append(categories)
        if keyword:
            sql += " AND (title ILIKE %s OR body ILIKE %s)"
            params.extend([f"%{keyword}%", f"%{keyword}%"])
        if days:
            sql += " AND published_at >= now() - (%s || ' days')::interval"
            params.append(days)
        sql += " ORDER BY published_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [_article_to_dict(r, _fetch_images(cur, r["article_no"]), _fetch_related(cur, r["article_no"])) for r in rows]


def query_category_keywords(category: str, keywords_any: Optional[List[str]],
                             since: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    """chatbot_context_service.py의 per-category GSI 쿼리(카테고리=X AND
    published_at>=since, keyword 여러 개 중 하나라도 title에 포함되면 매치)
    재현. 카테고리 alias 확장·불용어 처리·fallback 로직은 Lambda 쪽
    (services/chatbot_context_service.py) 그대로 유지, 여기는 단일 카테고리
    쿼리 프리미티브만 제공."""
    with get_cursor() as cur:
        sql = _ARTICLE_SELECT + " WHERE raw_category = %s"
        params: List[Any] = [category]
        if since:
            sql += " AND published_at >= %s"
            params.append(since)
        if keywords_any:
            ors = " OR ".join(["title ILIKE %s"] * len(keywords_any))
            sql += f" AND ({ors})"
            params.extend(f"%{kw}%" for kw in keywords_any)
        sql += " ORDER BY published_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [_article_to_dict(r, _fetch_images(cur, r["article_no"]), _fetch_related(cur, r["article_no"])) for r in rows]


def search_paged(categories: Optional[List[str]], keyword: Optional[str],
                  published_from: Optional[str], published_until: Optional[str],
                  page: int = 1, page_size: int = 10) -> Dict[str, Any]:
    """search_service.py::search_dynamodb_optimized()의 페이지네이션 검색
    재현. DynamoDB 쪽은 GSI 쿼리+dedup(카테고리 alias 중복, version_ 접두사
    레코드)을 애플리케이션에서 했지만, Postgres는 article_no당 행 하나뿐이라
    (raw_category가 alias 확장 후에도 실제로는 단일 값) dedup이 필요 없다.
    카테고리 alias 확장은 호출부(search_service.py)가 기존 로직 그대로
    수행해서 이미 확장된 categories 리스트를 넘겨준다."""
    with get_cursor() as cur:
        where = ["1=1"]
        params: List[Any] = []
        if categories:
            where.append("raw_category = ANY(%s)")
            params.append(categories)
        if published_from:
            where.append("published_at::date >= %s::date")
            params.append(published_from)
        if published_until:
            where.append("published_at::date <= %s::date")
            params.append(published_until)
        if keyword:
            where.append(
                "(title ILIKE %s OR body ILIKE %s OR %s = ANY(keywords) OR %s = ANY(hashtags))"
            )
            params.extend([f"%{keyword}%", f"%{keyword}%", keyword, keyword])
        where_sql = " AND ".join(where)

        cur.execute(f"SELECT count(*) AS n FROM articles WHERE {where_sql}", params)
        total_hits = cur.fetchone()["n"]

        offset = max(page - 1, 0) * page_size
        cur.execute(
            f"{_ARTICLE_SELECT} WHERE {where_sql} ORDER BY published_at DESC LIMIT %s OFFSET %s",
            params + [page_size, offset],
        )
        rows = cur.fetchall()

        articles = []
        for r in rows:
            images = _fetch_images(cur, r["article_no"])
            body = r.get("body") or ""
            image_url = images[0]["url"] if images else None
            articles.append({
                "news_id": r["article_no"],
                "title": r["title"] or "",
                "sub_title": r.get("subtitle") or "",
                "published_at": r["published_at"].isoformat() if r.get("published_at") else None,
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
                "provider": "서울경제",
                "category": r.get("raw_category") or "news",
                "original_link": r.get("source_url") or "",
                "content": body[:200],
                "byline": r.get("reporter_name") or "서울경제",
                "image_url": image_url,
            })

        total_pages = math.ceil(total_hits / page_size) if total_hits > 0 else 0
        return {
            "total_hits": total_hits,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "articles": articles,
        }


def batch_check_exists(article_nos: List[str]) -> List[str]:
    if not article_nos:
        return []
    with get_cursor() as cur:
        cur.execute("SELECT article_no FROM articles WHERE article_no = ANY(%s)", (article_nos,))
        return [r["article_no"] for r in cur.fetchall()]


def batch_get_hash(article_nos: List[str]) -> Dict[str, Dict[str, Any]]:
    """content_ko/content_hash만 반환 — DynamoDB batch_get_articles_with_hash()의
    ProjectionExpression='news_id, content_hash, content_ko'와 동일 계약.
    published_at은 의도적으로 포함 안 함: DynamoDB 쪽도 이 딕셔너리에
    published_at을 넣은 적이 없어 article_collection_service.py의
    original_published_at 보존 로직이 사실상 항상 죽은 코드였다(발견한
    버그, 이번 마이그레이션에서 고치지 않고 동작 그대로 재현)."""
    if not article_nos:
        return {}
    with get_cursor() as cur:
        cur.execute(
            "SELECT article_no, body_hash, body FROM articles WHERE article_no = ANY(%s)",
            (article_nos,),
        )
        return {
            r["article_no"]: {
                "content_hash": r.get("body_hash") or "",
                "content_ko": r.get("body") or "",
            }
            for r in cur.fetchall()
        }


def save_article(article: Dict[str, Any]) -> bool:
    """DynamoDB save_article()과 같은 계약 — article dict(news_id/title_ko/
    sub_title_ko/content_ko/author_name.../published_at/url/category/
    images/related_news/content_hash)를 받아 upsert. images/related_news는
    완전 교체(DynamoDB put_item의 전체 교체 의미와 동일)."""
    article_no = article["news_id"]
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO articles
                (article_no, title, subtitle, body, reporter_name, published_at,
                 source_url, body_hash, raw_category)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (article_no) DO UPDATE SET
                title = EXCLUDED.title,
                subtitle = EXCLUDED.subtitle,
                body = EXCLUDED.body,
                reporter_name = EXCLUDED.reporter_name,
                published_at = EXCLUDED.published_at,
                source_url = EXCLUDED.source_url,
                body_hash = EXCLUDED.body_hash,
                raw_category = EXCLUDED.raw_category,
                updated_at = now()
            """,
            (
                article_no,
                article.get("title_ko") or "",
                article.get("sub_title_ko") or None,
                article.get("content_ko") or None,
                article.get("author_name") or article.get("byline") or None,
                article.get("published_at") or None,
                article.get("original_link") or article.get("url") or None,
                article.get("content_hash") or None,
                article.get("category") or None,
            ),
        )

        cur.execute("DELETE FROM article_images WHERE article_no = %s", (article_no,))
        for pos, img in enumerate(article.get("images") or []):
            url = (img or {}).get("url")
            if not url:
                continue
            caption = " ".join(
                x for x in [(img or {}).get("caption_title"), (img or {}).get("caption_content")] if x
            ) or None
            cur.execute(
                "INSERT INTO article_images (article_no, position, url, caption) VALUES (%s,%s,%s,%s)",
                (article_no, pos, url, caption),
            )

        cur.execute("DELETE FROM article_related_news WHERE article_no = %s", (article_no,))
        for pos, rel in enumerate(article.get("related_news") or []):
            url = (rel or {}).get("url")
            if not url:
                continue
            cur.execute(
                "INSERT INTO article_related_news (article_no, position, title, url) VALUES (%s,%s,%s,%s)",
                (article_no, pos, (rel or {}).get("title") or None, url),
            )
    return True

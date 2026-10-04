"""
FastAPI application for Sedaily-MBTI backend
K-Stock Insight MBTI News Style Transformation API

⚠️ 이 파일은 **로컬 개발 전용**이다. 운영은 API Gateway + Lambda 로 돌아가고
이 shim 은 배포되지 않는다 (requirements.txt 의 fastapi/uvicorn 주석 참조).
따라서 여기에만 있는 편의 기능(.env 자동 로드, SSE 스트리밍)은 운영에 없다.
"""
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import uvicorn
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

# ── .env 로드 (로컬 전용) ────────────────────────────────────────────────────
# config.settings 는 모듈 로드 시점에 os.getenv 로 값을 읽어 `settings` 싱글턴을
# 만든다(@lru_cache). 그래서 .env 는 **config import 보다 먼저** 올려야 한다.
# 운영 Lambda 는 환경변수를 직접 주입받으므로 이 블록과 무관하다.
try:
    from dotenv import load_dotenv

    _ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(_ENV_PATH):
        load_dotenv(_ENV_PATH)
        print(f"[local] .env 로드: {_ENV_PATH}")
except ImportError:
    # python-dotenv 미설치 — 셸에서 export 한 환경변수만 쓴다.
    print("[local] python-dotenv 없음 — 셸 환경변수만 사용")

from config import settings  # noqa: E402  (.env 로드 이후여야 함)
from clients.s3_xml_client import S3XMLClient  # noqa: E402
from handlers.time_machine_handler import lambda_handler as time_machine_lambda_handler  # noqa: E402
from handlers.timeline_handler import lambda_handler as timeline_lambda_handler  # noqa: E402
from services.chatbot_engine import (  # noqa: E402
    generate_chat_response, generate_chat_response_stream,
)
from services.chatbot_context_service import (  # noqa: E402
    get_cached_briefing, get_recent_articles, search_related_articles,
)

app = FastAPI(
    title="Sedaily-MBTI API",
    description="K-Stock Insight MBTI News Style Transformation API",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "Sedaily-MBTI API is running", "status": "healthy"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "sedaily-mbti-backend"}

@app.post("/api/chat")
async def chat(request: Request):
    """MBTI 챗봇 엔드포인트"""
    body = await request.json()
    user_message = body.get("message", "").strip()
    mbti_group = body.get("mbti_group", "SF").upper()
    conversation_history = body.get("conversation_history", [])

    if not user_message:
        return JSONResponse(status_code=400, content={"error": "메시지를 입력해주세요."})

    cached_briefing = get_cached_briefing(mbti_group)
    recent_articles = None if cached_briefing else get_recent_articles(5)

    import logging
    logger = logging.getLogger(__name__)
    if cached_briefing:
        logger.info(f"[chat] Using cached briefing for {mbti_group} ({len(cached_briefing)} chars)")
    elif recent_articles:
        logger.info(f"[chat] Using {len(recent_articles)} recent articles as context")
    else:
        logger.warning("[chat] No news context available — briefing and articles both empty")

    response_text = await generate_chat_response(
        user_message=user_message,
        mbti_group=mbti_group,
        conversation_history=conversation_history,
        recent_articles=recent_articles,
        cached_briefing=cached_briefing,
    )

    related = search_related_articles(user_message, limit=3)

    return {
        "response": response_text,
        "mbti_group": mbti_group,
        "recommended_articles": related,
    }


@app.post("/api/chat/stream")
async def chat_stream(request: Request):
    """MBTI 챗봇 스트리밍 엔드포인트 (SSE)"""
    body = await request.json()
    user_message = body.get("message", "").strip()
    mbti_group = body.get("mbti_group", "SF").upper()
    conversation_history = body.get("conversation_history", [])

    if not user_message:
        return JSONResponse(status_code=400, content={"error": "메시지를 입력해주세요."})

    cached_briefing = get_cached_briefing(mbti_group)
    recent_articles = None if cached_briefing else get_recent_articles(5)

    def event_generator():
        for chunk in generate_chat_response_stream(
            user_message=user_message,
            mbti_group=mbti_group,
            conversation_history=conversation_history,
            recent_articles=recent_articles,
            cached_briefing=cached_briefing,
        ):
            yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"

        # Search related articles after response completes
        try:
            related = search_related_articles(user_message, limit=3)
            if related:
                yield f"data: {json.dumps({'type': 'articles', 'articles': related}, ensure_ascii=False)}\n\n"
        except Exception:
            pass

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# 두 라우트 모두 운영과 **완전히 같은 코드**를 타도록 Lambda 핸들러를 그대로 호출한다.
# (로컬에서만 통하는 별도 구현을 두면 로컬 검증이 운영을 보증하지 못한다.)
# 핸들러는 동기 + 내부에서 asyncio.run / requests 로 블로킹하므로, async 라우트에서
# 직접 부르면 이벤트 루프 안에서 asyncio.run 이 RuntimeError 를 내고 서버가 막힌다 —
# def 라우트(스레드풀 실행)이거나 run_in_threadpool 로 부른다.

def _to_json_response(result: dict) -> JSONResponse:
    """Lambda 핸들러 응답(statusCode/body)을 FastAPI 응답으로 되돌린다."""
    status = result.get("statusCode", 200)
    raw_body = result.get("body") or "{}"
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        payload = {"raw": raw_body}
    return JSONResponse(status_code=status, content=payload)


@app.get("/time-machine")
def time_machine(
    date: Optional[str] = None,
    q: Optional[str] = None,
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
    size: Optional[str] = None,
    sort: Optional[str] = None,
):
    """빅카인즈 기반 엔드포인트. q 없으면 하루 조회(date), 있으면 키워드+기간 검색(q/from/to/size/sort).

    파라미터 검증·오류 규약은 핸들러 docstring 참조 — 여기선 받은 값을 그대로 넘긴다.
    """
    raw = {"date": date, "q": q, "from": from_, "to": to, "size": size, "sort": sort}
    query_params = {k: v for k, v in raw.items() if v is not None}
    result = time_machine_lambda_handler(
        {"requestContext": {"http": {"method": "GET"}}, "queryStringParameters": query_params},
        None,
    )
    return _to_json_response(result)


# ── /api/timeline — S3 XML(서울경제 원본 피드) 기반 타임라인 ─────────────────

@app.post("/api/timeline")
async def timeline_post(request: Request):
    """
    그 날짜의 지면을 반환한다.

    Body: {"date": "YYYY-MM-DD", "mode"?: "flat", "query"?, "categories"?, "page"?, "page_size"?}
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    event = {
        "requestContext": {"http": {"method": "POST"}},
        "body": json.dumps(body, ensure_ascii=False),
    }
    return _to_json_response(await run_in_threadpool(timeline_lambda_handler, event, None))


@app.get("/api/timeline")
def timeline_get(
    date: str = Query(..., description="YYYY-MM-DD (KST)"),
    query: Optional[str] = Query(None, description="검색어 (제목/본문 부분 일치)"),
    categories: Optional[str] = Query(None, description="표준 카테고리, 콤마 구분"),
    mode: Optional[str] = Query(None, description="flat (기본, 그 외 400)"),
    page: int = Query(1),
    page_size: int = Query(30),
):
    """curl 로 바로 찔러볼 수 있는 GET 버전. POST 와 같은 핸들러를 탄다."""
    params = {
        "date": date,
        "query": query,
        "categories": categories,
        "mode": mode,
        "page": str(page),
        "page_size": str(page_size),
    }
    result = timeline_lambda_handler({
        "requestContext": {"http": {"method": "GET"}},
        "queryStringParameters": {k: v for k, v in params.items() if v is not None},
    }, None)
    return _to_json_response(result)


# S3 XML Client 인스턴스 (S3는 ap-northeast-2 리전에 있음)
s3_client = S3XMLClient(region=settings.s3_region)


@app.get("/articles")
async def get_articles(
    date: Optional[str] = Query(None, description="Date in YYYYMMDD format"),
    limit: int = Query(30, description="Maximum number of articles to return"),
    category: Optional[str] = Query(None, description="Filter by category")
):
    """
    S3에서 뉴스 기사 목록 가져오기

    Args:
        date: 날짜 (YYYYMMDD 형식). 없으면 오늘 날짜
        limit: 반환할 최대 기사 수
        category: 카테고리 필터 (경제, 정치, 사회, IT_과학, 문화 등)
    """
    try:
        # 날짜 파싱
        if date:
            date_str = date
        else:
            kst = timezone(timedelta(hours=9))
            date_str = datetime.now(kst).strftime("%Y%m%d")

        # S3에서 기사 가져오기
        articles = await s3_client.get_articles_by_date(date_str)

        if not articles:
            return {
                "date": date_str,
                "total": 0,
                "articles": [],
                "message": f"No articles found for {date_str}"
            }

        # 삭제된 기사 제외 (action != 'D')
        articles = [a for a in articles if a.action != 'D']

        # 카테고리 필터
        if category:
            articles = [a for a in articles if a.main_category == category]

        # 최신순 정렬 (published_at 기준)
        articles.sort(key=lambda x: x.published_at, reverse=True)

        # limit 적용
        articles = articles[:limit]

        # 응답 형식으로 변환
        result_articles = []
        for article in articles:
            # 첫 번째 이미지 URL 추출
            image_url = None
            if article.images:
                image_url = article.images[0].url
            elif article.content_images:
                image_url = article.content_images[0].url

            result_articles.append({
                "news_id": article.nsid,
                "title": article.title,
                "sub_title": article.sub_title or "",
                "published_at": article.published_at,
                "category": article.main_category,
                "provider": article.press,
                "byline": article.author_name,
                "image_url": image_url,
                "content": article.content_clean[:500] if article.content_clean else "",
                "original_link": article.url,
            })

        return {
            "date": date_str,
            "total": len(result_articles),
            "articles": result_articles
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "message": "Failed to fetch articles from S3"}
        )


@app.get("/article/{article_id}")
async def get_article_detail(article_id: str, date: Optional[str] = Query(None)):
    """
    특정 기사의 상세 정보 가져오기

    Args:
        article_id: 기사 ID (nsid)
        date: 날짜 (YYYYMMDD 형식). 없으면 오늘 날짜
    """
    try:
        # 날짜 파싱
        if date:
            date_str = date
        else:
            kst = timezone(timedelta(hours=9))
            date_str = datetime.now(kst).strftime("%Y%m%d")

        # S3에서 기사 가져오기
        articles = await s3_client.get_articles_by_date(date_str)

        # article_id로 찾기
        article = next((a for a in articles if a.nsid == article_id), None)

        if not article:
            # 최근 7일 내 기사에서 찾기
            for days_ago in range(1, 8):
                kst = timezone(timedelta(hours=9))
                past_date = (datetime.now(kst) - timedelta(days=days_ago)).strftime("%Y%m%d")
                past_articles = await s3_client.get_articles_by_date(past_date)
                article = next((a for a in past_articles if a.nsid == article_id), None)
                if article:
                    break

        if not article:
            return JSONResponse(
                status_code=404,
                content={"error": "Article not found", "article_id": article_id}
            )

        # 첫 번째 이미지 URL 추출
        image_url = None
        if article.images:
            image_url = article.images[0].url
        elif article.content_images:
            image_url = article.content_images[0].url

        return {
            "news_id": article.nsid,
            "title_ko": article.title,
            "sub_title": article.sub_title or "",
            "content_ko": article.content_clean,
            "published_at": article.published_at,
            "category": article.main_category,
            "provider": article.press,
            "byline": article.author_name,
            "author_email": article.author_email,
            "image_url": image_url,
            "images": [{"url": img.url, "caption": img.caption_content} for img in article.images],
            "original_link": article.url,
            "content_blocks": [
                {
                    "type": block.block_type,
                    "text": block.text_ko if block.block_type == "text" else "",
                    "style": block.style if block.block_type == "text" else "",
                    "image_url": block.image_url if block.block_type == "image" else "",
                    "caption": block.image_caption if block.block_type == "image" else "",
                }
                for block in article.content_blocks
            ],
            "related_news": [{"title": rel.title, "url": rel.url} for rel in article.related_news],
            "is_breaking_news": article.is_breaking_news,
        }

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "message": "Failed to fetch article detail"}
        )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
        log_level=settings.log_level.lower()
    )
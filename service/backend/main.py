"""
FastAPI application for Sedaily-MBTI backend
K-Stock Insight MBTI News Style Transformation API
"""
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import json
import uvicorn
from datetime import datetime, timedelta, timezone
from typing import Optional
from config import settings
from handlers.time_machine_handler import get_time_machine_data
from clients.s3_xml_client import S3XMLClient
from fastapi.responses import StreamingResponse
from handlers.chatbot_handler import (
    generate_chat_response, generate_chat_response_stream,
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


@app.get("/time-machine")
async def time_machine(date: str):
    """타임머신 날짜별 뉴스 크롤링 엔드포인트"""
    result = get_time_machine_data(date, region=settings.region)
    if "error" in result:
        return JSONResponse(status_code=400, content=result)
    return result


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
"""
Time Machine Handler
Wikipedia "On This Day" API + 서울경제 아카이브 뉴스

GET /time-machine?date=YYYY-MM-DD
Response: { "events": [...], "news": [...] }
"""
import logging
import json
from datetime import datetime, timezone, timedelta
from typing import Optional
import random

import boto3
import requests

logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "SedailyMBTI/1.0 (https://ailens.sedaily.ai)"}

# ─── 카테고리 키워드 ────────────────────────────────────────────────────────

CATEGORY_KEYWORDS = {
    "경제": [
        "GDP", "성장률", "경기침체", "물가", "인플레이션", "소비자물가", "기준금리", "금통위",
        "코스피", "코스닥", "급등", "급락", "폭락", "랠리", "외국인", "기관", "매수", "매도", "공매도",
        "아파트", "집값", "전세", "청약", "재건축", "분양", "매매가", "거래절벽", "LTV", "DSR",
        "영업이익", "매출", "적자", "흑자", "어닝쇼크", "사상최대", "수주", "M&A", "구조조정",
        "수출", "수입", "무역수지", "경상수지", "원달러", "강달러", "관세", "무역적자",
        "예산", "세수", "법인세", "국가채무", "재정적자", "긴축", "보조금",
        "취업자", "실업률", "최저임금", "일자리", "구직", "인력난", "파업",
        "국제유가", "WTI", "원유", "천연가스", "OPEC", "감산", "시장", "카드", "결제", "소비", "저축", "가계부채", "금융", "은행", "대출", "이자", "부동산", "주식", "채권",
        "사업", "기업", "스타트업", "벤처", "IPO", "코인", "암호화폐", "NFT", "파산", "원금", "펀드",
        "수익률", "배당", "투자", "리스크", "포트폴리오", "자산", "부채", "재테크", "금융상품", "기술주", '가치주', "성장주", "배당주", "테마주", "섹터", "펀더멘털", "밸류에이션",
        "인플레이션", "디플레이션", "스태그플레이션", "하이퍼인플레이션", "디커플링", "탈중국",
        "은행", "금융", "대출", "이자", "부동산", "주식", "채권", "상장사", 
        "저축은행"
    ],

    "정치": [
        # 권력기관·직위
        "대통령", "대통령실", "국무총리", "장관", "차관", "수석", "비서관",
        "국회의원", "원내대표", "당대표", "최고위원", "비상대책위",
        "여당", "야당", "국민의힘", "민주당", "조국혁신당", "개혁신당",

        # 입법·행정·사법
        "국회", "본회의", "상임위", "법안", "통과", "부결", "필리버스터", "탄핵",
        "헌법재판소", "헌재", "대법원", "검찰", "공수처", "특검", "감사원",
        "행정명령", "시행령", "거부권", "재의요구",

        # 선거·정당정치
        "총선", "대선", "지방선거", "보궐선거", "공천", "경선", "후보",
        "지지율", "여론조사", "민심", "당적", "입당", "탈당", "창당",
        "민주당", "국민의힘", "조국혁신당", "개혁신당", "정의당", "열린민주당", "기본소득당", "새누리당", "한나라당", "민주당", "통합진보당", "자유한국당", "바른미래당",

        # 정책·이슈
        "정책", "공약", "예산안", "세제개편", "규제완화", "개혁",
        "청문회", "국정감사", "국감", "대정부질문",
        "인사청문", "임명", "해임", "사퇴", "사임",

        # 정치적 사건·갈등
        "여야", "갈등", "충돌", "합의", "협상", "연정", "연립",
        "계엄", "내란", "수사", "구속", "기소", "판결", "항소",
        "특별검사", "특위", "진상조사",

        # 대외 정치
        "남북관계", "북한", "통일부", "안보", "국방부", "합참",
        "한미동맹", "주한미군", "한일관계", "외교부", "北", "미사일", "핵실험", "대북제재", "DMZ", "판문점", "남북회담",
        "美", "英", "中", "러시아", "일본", "EU", "G7", "G20", "UN", "WHO", "NATO",
        "日", "트럼프", "바이든", "시진핑", "푸틴", "아베", "메르켈", "마크롱",
        "국제정치", "외교", "대외정책", "무역", "제재", "협상", "합의", "분쟁", "국제사회", "세계정치",
    ],

    "IT": [
        "삼성", "SK하이닉스", "LG", "애플", "구글", "엔비디아", "메타", "마이크로소프트", "테슬라", "TSMC",
        "반도체", "메모리", "HBM", "파운드리", "시스템반도체", "D램", "낸드",
        "인공지능", "AI", "챗GPT", "생성형AI", "LLM", "거대언어모델", "AI에이전트",
        "플랫폼", "앱", "카카오", "네이버", "쿠팡", "배달의민족", "토스",
        "5G", "6G", "통신사", "KT", "SKT", "LGU+",
        "클라우드", "데이터센터", "자율주행", "전기차", "배터리", "로봇", "메타버스", "XR",
        "해킹", "개인정보", "규제", "독점", "보안", "사이버",
    ],
    "문화": [
        "K팝", "K드라마", "아이돌", "데뷔", "컴백", "OTT", "넷플릭스", "흥행", "시청률",
        "개봉", "박스오피스", "관객수", "천만", "콘서트", "뮤지컬", "전시",
        "베스트셀러", "출간", "작가", "소설", "에세이",
        "우승", "결승", "MVP", "이적", "계약", "올림픽", "월드컵",
        "여행", "관광", "방한", "한류", "유네스코",
        "출시", "신작", "게임사", " SNS", "인플루언서", "유튜버", "크리에이터", "인기상",
        "첫방", "선수권"
    ],
    "사회": [
        "대통령", "정부", "국회", "여당", "야당", "법안", "예산안", "정책", "장관", "청문회",
        "사망", "부상", "화재", "사고", "검거", "수사", "구속", "기소", "판결",
        "건강보험", "의료비", "복지", "연금", "출산율", "고령화", "저출생",
        "입시", "수능", "대학", "학교", "사교육", "교육부",
        "기후변화", "탄소", "미세먼지", "재생에너지", "탄소중립", "ESG",
        "인구감소", "이민", "다문화", "청년", "빈곤",
        "폭염", "태풍", "홍수", "지진", "산불", "대피", "회장", "올림픽", "월드컵", "국가대표",
        "채용", "난민", "노동", "파업", "임금", "최저임금", "근로시간", "비정규직", "정규직", "고용보험", "실업급여",
    ],
    "국제": [
        "트럼프", "바이든", "연준", "Fed", "미국경제", "월가",
        "시진핑", "중국경제", "위안화", "디커플링", "탈중국", "중국증시",
        "엔화", "엔저", "일본은행", "BOJ", "아베노믹스",
        "ECB", "유로존", "독일", "영국", "브렉시트",
        "전쟁", "분쟁", "제재", "갈등", "긴장", "휴전", "협상",
        "G7", "G20", "IMF", "세계은행", "WTO", "달러패권",
        "정상회담", "협약", "협정", "FTA", "외교",
    ],
}

def infer_category(title: str) -> str:
    """제목 키워드로 카테고리 추론 (IT > 국제 > 사회 > 문화 > 경제 순)."""
    for category in ["IT", "국제", "사회", "문화", "경제"]:
        if any(kw in title for kw in CATEGORY_KEYWORDS[category]):
            return category
    return "사회"


# ─── Wikipedia API ──────────────────────────────────────────────────────────

def fetch_wikipedia_events(month: str, day: str, limit: int = 5) -> list[dict]:
    """Wikipedia API에서 역사적 사건 가져오기 (한국어 우선, 영어 fallback)."""
    events = []
    
    # 한국어 위키백과 시도
    try:
        url = f"https://ko.wikipedia.org/api/rest_v1/feed/onthisday/all/{month}/{day}"
        res = requests.get(url, headers=HEADERS, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        for event in data.get("events", [])[:limit]:
            pages = event.get("pages", [])
            images = []
            for page in pages[:3]:  # 최대 3개 페이지에서 이미지 수집
                thumbnail = page.get("thumbnail", {}).get("source")
                if thumbnail:
                    images.append(thumbnail)
            
            events.append({
                "year": event.get("year"),
                "title": event.get("text", ""),
                "description": pages[0].get("extract", "") if pages else "",
                "url": pages[0].get("content_urls", {}).get("desktop", {}).get("page", "") if pages else "",
                "images": images
            })
    except Exception as e:
        logger.warning(f"한국어 위키백과 실패: {e}")
    
    # 영어 위키백과 fallback
    if not events:
        try:
            url = f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/{month}/{day}"
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            for event in data.get("events", [])[:limit]:
                pages = event.get("pages", [])
                images = []
                for page in pages[:3]:  # 최대 3개 페이지에서 이미지 수집
                    thumbnail = page.get("thumbnail", {}).get("source")
                    if thumbnail:
                        images.append(thumbnail)
                
                events.append({
                    "year": event.get("year"),
                    "title": event.get("text", ""),
                    "description": pages[0].get("extract", "") if pages else "",
                    "url": pages[0].get("content_urls", {}).get("desktop", {}).get("page", "") if pages else "",
                    "images": images
                })
        except Exception as e:
            logger.error(f"영어 위키백과 실패: {e}")
    
    return random.sample(events, min(limit, len(events))) if events else []


# ─── 서울경제 뉴스 크롤링 ────────────────────────────────────────────────────

def fetch_sedaily_news(date: str, limit: int = 5) -> list[dict]:
    """서울경제 아카이브에서 그날의 뉴스 가져오기."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []
    
    # 제외할 태그와 키워드
    EXCLUDE_TAGS = ["마켓아이", "인사", "부고", "사설", "비즈니스 유머", "시론", "발언대", "사진" ]
    EXCLUDE_KEYWORDS = ["칼럼"]
    
    try:
        year, month, day = date.split("-")
        url = f"https://www.sedaily.com/newsArchive/{year}/{month}/{day}"
        res = requests.get(url, headers=HEADERS, timeout=10)
        res.encoding = "utf-8"
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, "html.parser")
        items = soup.select("ul.article-list li h2.headline a")[:limit * 3]  # 필터링 고려해서 더 많이 가져오기
        
        news = []
        for item in items:
            title = item.get_text(strip=True)
            href = item.get("href", "")
            if not title or not href:
                continue
            
            # 제외 조건 체크
            if any(tag in title for tag in EXCLUDE_TAGS):
                continue
            if any(keyword in title for keyword in EXCLUDE_KEYWORDS):
                continue
            # [마켓아이] 같이 태그만 있는 경우 제외
            if title.startswith("[") and title.endswith("]"):
                continue
            
            article_url = f"https://www.sedaily.com{href}" if href.startswith("/") else href
            news.append({
                "title": title,
                "category": infer_category(title),
                "url": article_url
            })
            
            if len(news) >= limit:
                break
        
        return news
    except Exception as e:
        logger.warning(f"서울경제 뉴스 수집 실패: {e}")
        return []


# ─── DynamoDB 캐시 ──────────────────────────────────────────────────────────

CACHE_TABLE = "sedaily-mbti-articles-dev"
CACHE_TTL_DAYS = 30

def _get_cache_key(date: str) -> str:
    return f"timemachine_{date}"

def get_cached_data(date: str, region: str = "us-east-1") -> Optional[dict]:
    try:
        dynamodb = boto3.resource("dynamodb", region_name=region)
        table = dynamodb.Table(CACHE_TABLE)
        res = table.get_item(Key={"news_id": _get_cache_key(date)})
        item = res.get("Item")
        if item:
            logger.info(f"캐시 히트: {date}")
            return item.get("data", {})
    except Exception as e:
        logger.warning(f"캐시 조회 실패: {e}")
    return None

def save_cache(date: str, data: dict, region: str = "us-east-1") -> None:
    try:
        kst = timezone(timedelta(hours=9))
        expires_at = (datetime.now(kst) + timedelta(days=CACHE_TTL_DAYS)).isoformat()
        
        dynamodb = boto3.resource("dynamodb", region_name=region)
        table = dynamodb.Table(CACHE_TABLE)
        table.put_item(Item={
            "news_id": _get_cache_key(date),
            "item_type": "timemachine_cache",
            "date": date,
            "data": data,
            "cached_at": datetime.now(kst).isoformat(),
            "expires_at": expires_at,
        })
        logger.info(f"캐시 저장: {date}")
    except Exception as e:
        logger.warning(f"캐시 저장 실패: {e}")


# ─── 메인 핸들러 ────────────────────────────────────────────────────────────

def get_time_machine_data(date: str, region: str = "us-east-1") -> dict:
    """
    날짜별 역사 이벤트 + 서울경제 뉴스 반환.
    
    Returns:
        { "events": [...], "news": [...], "cached": bool, "date": str }
    """
    # 날짜 유효성 검사
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        month = str(dt.month).zfill(2)
        day = str(dt.day).zfill(2)
    except ValueError:
        return {"error": "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요."}
    
    # 캐시 확인
    cached = get_cached_data(date, region)
    if cached:
        return {**cached, "cached": True, "date": date}
    
    # Wikipedia + 서울경제 수집
    events = fetch_wikipedia_events(month, day, limit=5)
    news = fetch_sedaily_news(date, limit=10)
    
    result = {"events": events, "news": news}
    
    # 캐싱
    if events or news:
        save_cache(date, result, region)
    
    return {**result, "cached": False, "date": date}


def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda / API Gateway 핸들러."""
    logger.info(f"time-machine event: {event}")
    
    try:
        params = event.get("queryStringParameters") or {}
        date = params.get("date", "").strip()
        
        if not date:
            return _response(400, {"error": "date 파라미터가 필요합니다. (YYYY-MM-DD)"})
        
        from config import settings
        result = get_time_machine_data(date, region=settings.region)
        
        if "error" in result:
            return _response(400, result)
        
        return _response(200, result)
    
    except Exception as e:
        logger.error(f"Lambda 오류: {e}", exc_info=True)
        return _response(500, {"error": "서버 오류가 발생했습니다."})


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }

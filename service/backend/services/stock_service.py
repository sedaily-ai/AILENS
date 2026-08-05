"""
Stock Data Service
Fetches real-time Korean stock data from Naver Finance API.
Used by the chatbot via Claude Tool Use for stock-related queries.
"""
import logging
import json
from typing import Optional, Dict, Any, List
from urllib.request import urlopen, Request
from urllib.parse import quote
from urllib.error import URLError

logger = logging.getLogger(__name__)

NAVER_STOCK_API = "https://m.stock.naver.com/api/stock/{code}/basic"
NAVER_INDEX_API = "https://m.stock.naver.com/api/index/{code}/basic"
NAVER_SEARCH_API = "https://ac.stock.naver.com/ac?q={query}&target=stock"
USER_AGENT = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36"
TIMEOUT = 5


def _fetch_json(url: str) -> Optional[Dict]:
    """Fetch JSON from URL with timeout."""
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, json.JSONDecodeError, Exception) as e:
        logger.warning(f"Failed to fetch {url}: {e}")
        return None


# 주식 투자자들이 흔히 쓰는 축약어·별칭 → 정식 종목명
STOCK_ALIASES: Dict[str, str] = {
    # 반도체·IT 대형주
    "하닉": "SK하이닉스",
    "sk하닉": "SK하이닉스",
    "삼전": "삼성전자",
    "삼바": "삼성바이오로직스",
    "삼전우": "삼성전자우",
    # 자동차
    "현차": "현대차",
    "기차": "기아",
    "현모비스": "현대모비스",
    # 금융
    "카뱅": "카카오뱅크",
    "케뱅": "케이뱅크",
    "신한지주": "신한지주",
    "kb": "KB금융",
    # 인터넷·플랫폼
    "네이버": "NAVER",
    "엔카": "엔씨소프트",
    "엔씨": "엔씨소프트",
    # 2차전지·배터리
    "lg엔솔": "LG에너지솔루션",
    "엔솔": "LG에너지솔루션",
    "포스코퓨": "포스코퓨처엠",
    "포퓨": "포스코퓨처엠",
    "에코프로비엠": "에코프로비엠",
    "에코프로": "에코프로",
    # 바이오·제약
    "셀트": "셀트리온",
    "한미": "한미약품",
    "유한": "유한양행",
    "sk바팜": "SK바이오팜",
    "sk바사": "SK바이오사이언스",
    # 에너지·화학
    "sk이노": "SK이노베이션",
    "sk": "SK",
    "lg화학": "LG화학",
    "두전": "두산에너빌리티",
    "두산로보": "두산로보틱스",
    # 엔터테인먼트
    "하이브": "하이브",
    "sm": "에스엠",
    "jyp": "JYP Ent.",
    "와이지": "와이지엔터테인먼트",
    # 철강·조선
    "포홀": "POSCO홀딩스",
    "포스코홀딩스": "POSCO홀딩스",
    "한조해": "한화오션",
    "현중": "HD현대중공업",
    # 기타 대형주
    "카오": "카카오",
    "네카오": "네이버",  # 기본은 네이버로 매핑
}


def _resolve_alias(query: str) -> str:
    """축약어를 정식 종목명으로 변환 (매칭 없으면 원본 반환)"""
    normalized = query.strip().lower().replace(" ", "")
    return STOCK_ALIASES.get(normalized, query.strip())


def search_stock(query: str) -> Optional[Dict[str, str]]:
    """
    Search for a stock by name or code.
    Returns the best match: {'code': '005930', 'name': '삼성전자', 'market': '코스피'}
    축약어('하닉', '삼전' 등)는 사전에 정식 명칭으로 변환 후 검색.
    """
    resolved = _resolve_alias(query)
    url = NAVER_SEARCH_API.format(query=quote(resolved))
    data = _fetch_json(url)

    if not data or not data.get("items"):
        # 변환된 이름으로도 실패하면 원본으로 재시도
        if resolved != query.strip():
            url = NAVER_SEARCH_API.format(query=quote(query.strip()))
            data = _fetch_json(url)
            if not data or not data.get("items"):
                return None
        else:
            return None

    item = data["items"][0]
    return {
        "code": item["code"],
        "name": item["name"],
        "market": item.get("typeName", ""),
    }


def get_stock_price(code: str) -> Optional[Dict[str, Any]]:
    """
    Get real-time stock price by code.
    장중에는 현재가, 장 마감 후에는 종가를 반환합니다.
    """
    url = NAVER_STOCK_API.format(code=code)
    data = _fetch_json(url)

    if not data or not data.get("closePrice"):
        return None

    compare_info = data.get("compareToPreviousPrice", {})
    direction = compare_info.get("text", "")  # 상승/하락/보합

    current_price_str = data.get("closePrice", "0")
    change_str = data.get("compareToPreviousClosePrice", "0")

    # 전일 종가 역산
    try:
        current_price = int(current_price_str.replace(",", ""))
        change_val = int(change_str.replace(",", ""))
        if direction == "하락":
            prev_close = current_price + change_val
        else:
            prev_close = current_price - change_val
        prev_close_str = f"{prev_close:,}"
    except (ValueError, TypeError):
        prev_close_str = "N/A"

    # 장 상태 판단
    market_status = data.get("marketStatus", "")
    is_open = market_status == "TRADING"

    return {
        "name": data.get("stockName", ""),
        "code": data.get("itemCode", ""),
        "market": data.get("stockExchangeName", ""),
        "current_price": current_price_str,
        "prev_close": prev_close_str,
        "change": change_str,
        "change_percent": data.get("fluctuationsRatio", ""),
        "direction": direction,
        "market_status": "장중" if is_open else "장마감",
        "high": data.get("highPrice", ""),
        "low": data.get("lowPrice", ""),
        "volume": data.get("accumulatedTradingVolume", ""),
    }


def lookup_stock(query: str) -> Optional[Dict[str, Any]]:
    """
    Search + get price in one call.
    Accepts stock name ('삼성전자') or code ('005930').
    """
    # If query looks like a stock code (digits only), use directly
    if query.strip().isdigit():
        code = query.strip()
    else:
        match = search_stock(query)
        if not match:
            return None
        code = match["code"]

    return get_stock_price(code)


# 시장 지수 코드 매핑
INDEX_CODES = {
    "코스피": "KOSPI",
    "KOSPI": "KOSPI",
    "kospi": "KOSPI",
    "코스닥": "KOSDAQ",
    "KOSDAQ": "KOSDAQ",
    "kosdaq": "KOSDAQ",
}


def get_market_index(query: str) -> Optional[Dict[str, Any]]:
    """
    코스피/코스닥 시장 지수를 조회합니다.
    """
    code = INDEX_CODES.get(query.strip())
    if not code:
        return None

    url = NAVER_INDEX_API.format(code=code)
    data = _fetch_json(url)

    if not data or not data.get("closePrice"):
        return None

    compare_info = data.get("compareToPreviousPrice", {})
    direction = compare_info.get("text", "")

    market_status = data.get("marketStatus", "")
    is_open = market_status == "TRADING"

    return {
        "name": data.get("indexName", code),
        "code": code,
        "current_price": data.get("closePrice", ""),
        "change": data.get("compareToPreviousClosePrice", ""),
        "change_percent": data.get("fluctuationsRatio", ""),
        "direction": direction,
        "market_status": "장중" if is_open else "장마감",
    }

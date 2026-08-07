"""
Centralized constants for the MBTI news style transformation backend.
All hardcoded values should be defined here.
"""

# =============================================================================
# AWS Configuration
# =============================================================================

# DynamoDB Tables
DYNAMODB_TABLE_ARTICLES_DEV = 'sedaily-mbti-articles-dev'
DYNAMODB_TABLE_ARTICLES_PROD = 'sedaily-mbti-articles'
DYNAMODB_TABLE_PERSONAL_DEV = 'sedaily-mbti-personal-dev'
DYNAMODB_TABLE_PODCAST_DEV = 'sedaily-mbti-podcast-dev'
DYNAMODB_TABLE_WS_CONNECTIONS_DEV = 'sedaily-mbti-ws-connections-dev'

# S3 Article Body Storage (separated from DynamoDB for large text)
S3_ARTICLE_BODY_BUCKET_DEV = 'sedaily-mbti-article-body-dev'
S3_ARTICLE_BODY_PREFIX = 'articles'

# S3 Audio Storage (podcast/TTS audio files)
S3_AUDIO_BUCKET_DEV = 'sedaily-mbti-audio-dev'

# AWS Regions
AWS_REGION_DEFAULT = 'us-east-1'
AWS_REGION_S3 = 'ap-northeast-2'

# GSI Names
GSI_CATEGORY_DATE = 'category-published_at-index'
GSI_SLUG = 'slug-index'

# Fields stored in S3 body JSON (moved out of DynamoDB to reduce item size)
S3_BODY_FIELDS = [
    'content_ko',
    'content_raw',
    'content_blocks',
    'version_NT',
    'version_NF',
    'version_ST',
    'version_SF',
]

# =============================================================================
# HTTP Timeouts (seconds)
# =============================================================================

HTTP_TIMEOUT_SHORT = 10      # For quick operations (revalidation, health checks)
HTTP_TIMEOUT_MEDIUM = 30     # For API calls (BigKinds, search)
HTTP_TIMEOUT_LONG = 60       # For heavy operations (translation)
HTTP_TIMEOUT_SCRAPER = 10    # For web scraping (byline, time)

# =============================================================================
# Redis Cache
# =============================================================================

CACHE_TTL_DEFAULT = 604800          # 7 days in seconds
CACHE_TTL_VIDEO_SCHEDULES = 300     # 5 minutes
REDIS_SOCKET_TIMEOUT = 2            # seconds

# =============================================================================
# URLs
# =============================================================================

# Frontend
FRONTEND_URL_DEFAULT = 'https://mbti.sedaily.com'

# External APIs
BIGKINDS_API_URL_DEFAULT = 'https://tools.kinds.or.kr'
ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

# Default Video URL
NAVER_TV_DEFAULT_URL = 'https://tv.naver.com/v/90963232?playlistNo=998605'
NAVER_TV_URL_DEFAULT = NAVER_TV_DEFAULT_URL  # Alias for consistency

# =============================================================================
# AI Model Configuration
# =============================================================================

# AWS Bedrock Claude Models
# Haiku 4.5 — 저비용 경로 (daily question, podcast script, article filter).
#
# 2026-07-30: `us.anthropic.claude-3-5-haiku-20241022-v1:0` 이 Bedrock 에서
# 수명 종료(end-of-life)돼 InvokeModel 이 ResourceNotFoundException 을 던졌다.
# `/api/questions` 가 2026-07-28 01:29 UTC 부터 500 이었고 (30일 476회 호출되는
# 경로), 일 1회 도는 article-collector 도 같은 에러를 내고 있었다.
# `aws bedrock list-inference-profiles` 에 해당 ID 가 더 이상 없다.
#
# 아래 값은 이미 BEDROCK_MODEL_ID_CHATBOT 이 2026-05-24 부터 쓰던 것과 동일하다
# — chatbot Lambda 만 먼저 옮겨져 있어서 EOL 을 피했고, 나머지가 남아 깨졌다.
BEDROCK_MODEL_ID_DEFAULT = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
BEDROCK_MODEL_ID_HAIKU = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
# Sonnet 4 — Higher quality for complex rewriting (optional upgrade)
BEDROCK_MODEL_ID_SONNET = 'us.anthropic.claude-sonnet-4-20250514-v1:0'
# Opus 4.6 — Highest quality for MBTI article transformation (parallel per-group calls).
# Application inference profile ARN (name: mbti-opus-46, Service=mbti tagged) —
# replaces the AWS system inference profile `us.anthropic.claude-opus-4-6-v1`
# so that all Bedrock invocations from MBTI Lambdas (step3, article-collector,
# v2-transform) carry the application-profile-level tags. Switched 2026-05-13
# to fix the W22 미지정 비용 ~$1,156/주 issue; runtime/cost/perf identical.
BEDROCK_MODEL_ID_OPUS = 'arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/t6eh3tnfgr6b'

# Haiku 4.5 — Chatbot / AI 검색 (4 MBTI 페르소나 톤앤매너 응답).
# 2026-05-24: 음성 통화 latency 최적화 + 비용 절감 위해 Sonnet 4.6 inference
# profile (mbti-sonnet-46, iqlj0wamhnt3) → Haiku 4.5 cross-region 으로 교체.
# Sonnet 대비 ~5x 빠르고 ~1/5 비용. 페르소나 톤 유지에는 4.5 면 충분.
# 비용 태깅 inference profile 은 별도 라운드에서 mbti-haiku-45 신설 예정.
BEDROCK_MODEL_ID_CHATBOT = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

# AWS Bedrock Nova Models
# Nova Lite — Low-cost for simple classification/filtering (Steps 1, 2, 4, Supervisor)
BEDROCK_MODEL_ID_NOVA_LITE = 'amazon.nova-lite-v1:0'
# Nova Pro — Higher quality for complex classification
BEDROCK_MODEL_ID_NOVA_PRO = 'amazon.nova-pro-v1:0'
# Default Nova model (used by pipeline steps)
BEDROCK_MODEL_ID_NOVA = BEDROCK_MODEL_ID_NOVA_LITE

# AWS Bedrock Embedding Models
# Titan Text Embeddings V2 — 1024-dim, up to 8192 tokens input
# Cost: $0.00002 per 1K input tokens
BEDROCK_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0'
BEDROCK_EMBEDDING_DIMENSION = 1024
BEDROCK_EMBEDDING_MAX_TOKENS = 8192
# Approximate char-to-token ratio for Korean text (conservative)
EMBEDDING_CHARS_PER_CHUNK = 6000

BEDROCK_REGION = 'us-east-1'

# =============================================================================
# OpenSearch
# =============================================================================

OPENSEARCH_INDEX_DEFAULT = 'sedaily-articles'

# =============================================================================
# Categories
# =============================================================================

# Korean category names - Standard categories for the English site
# PHASE 72: Updated 2026-01-15 to include all categories from S3 XML
CATEGORIES_KOREAN = [
    '경제',
    'IT_과학',
    '정치',
    '사회',
    '문화',
    '스포츠',
    '국제'
]
ALL_CATEGORIES = CATEGORIES_KOREAN  # Alias for convenience

# Additional raw categories from S3 XML that need to be queried
# These are mapped to standard categories via normalize_category()
CATEGORIES_RAW_FROM_XML = [
    # Finance/Economy related
    '금융',
    '증권',
    '부동산',
    '산업',
    # Culture related (new naming)
    '문화·라이프',
    # Region
    '지역',
]

# English to Korean category mapping
CATEGORY_ENGLISH_TO_KOREAN = {
    'finance': '경제',
    'technology': 'IT_과학',
    'politics': '정치',
    'society': '사회',
    'culture': '문화',
    'sports': '스포츠',
    'international': '국제',
    'news': 'news'
}

# Korean to English category mapping
CATEGORY_KOREAN_TO_ENGLISH = {v: k for k, v in CATEGORY_ENGLISH_TO_KOREAN.items()}

# Valid English categories for API
VALID_CATEGORIES_ENGLISH = list(CATEGORY_ENGLISH_TO_KOREAN.keys())

# =============================================================================
# Category Normalization (for search queries)
# =============================================================================
# When searching, we need to query both old and new category names
# to get all articles regardless of when they were collected.

CATEGORY_SEARCH_ALIASES = {
    '경제': ['경제', '금융', '증권', '부동산'],
    'IT_과학': ['IT_과학', '산업', 'IT·과학'],  # 산업 (legacy) + IT·과학 (new since 2026-01-23)
    '정치': ['정치'],
    '사회': ['사회', '지역'],
    '문화': ['문화', '문화·라이프'],
    '스포츠': ['스포츠'],
    '국제': ['국제'],
}

# =============================================================================
# BigKinds OpenAPI (한국언론진흥재단 뉴스 빅데이터 분석 시스템)
# =============================================================================
# 출처: `빅카인즈api지침서.pdf` — "OpenAPI 사용자 지침서 V1.49" (최종개정 2024-12-10)
#
# 연계 방식 (지침서 §1.1):
#   - HTTPS POST 만 지원. GET 은 없다.
#   - 요청/응답 모두 UTF-8 JSON. 인증키는 헤더가 아니라 **본문 최상위 `access_key`** 필드다.
#   - 본문 형태: {"access_key": "<UUID>", "argument": {...}}
#
# 응답 규약: 성공은 `result == 0`, 실패는 `result == -1` + `reason` 문자열.
#   HTTP status 는 실패해도 200 이므로 status 만 보고 성공 판정하면 안 된다.
#   (실측 2026-08-04: 미등록 키 → 200 + {"result": -1, "reason": "Invalid Access Key!:..."},
#    빈 키 → 200 + {"result": -1, "reason": "Blank Access Key!:"})

# 엔드포인트 경로 — base 는 settings.bigkinds_api_url (BIGKINDS_API_URL_DEFAULT)
BIGKINDS_ENDPOINT_SEARCH = '/search/news'        # §2 뉴스 검색 / §3 뉴스 상세 조회
BIGKINDS_ENDPOINT_ISSUE_RANKING = '/issue_ranking'  # §4 오늘의 이슈 (구 이슈랭킹)
BIGKINDS_ENDPOINT_WORD_CLOUD = '/word_cloud'     # §5 연관어 분석 (구 워드클라우드)
BIGKINDS_ENDPOINT_TIME_LINE = '/time_line'       # §6 키워드 트렌드 (구 뉴스 타임라인)
BIGKINDS_ENDPOINT_QUERY_RANK = '/query_rank'     # §7 인기검색어

# 언론사 (지침서 §13.1 코드 테이블)
BIGKINDS_PROVIDER_SEDAILY = '서울경제'
BIGKINDS_PROVIDER_CODE_SEDAILY = '02100311'

# return_from / return_size 상한 (지침서 §2.2)
BIGKINDS_MAX_RETURN_FROM = 20000
BIGKINDS_MAX_RETURN_SIZE = 10000
# hilight 최대 글자수 (지침서 §2.2)
BIGKINDS_MAX_HILIGHT = 200

# 뉴스 검색에서 기본으로 요청할 필드.
# ※ `fields` 는 비어있어도 배열을 넣어야 하고, 지정하지 않은 필드는 반환되지 않는다 (§2.2).
BIGKINDS_DEFAULT_FIELDS = [
    'news_id',
    'title',
    'published_at',
    'dateline',
    'provider',
    'category',
    'category_incident',
    'byline',
    'hilight',
    'images',
    'provider_link_page',
    'printing_page',
]

# =============================================================================
# 그 무렵의 지표 (타임라인 '그날의 이슈' 보조 카드)
# =============================================================================
# "그때 물가·금리는 어땠나" 를 보여주는 데 쓰는 경제지표 목록.
#
# ⚠️ 설계 원칙: **숫자를 우리가 만들지 않는다.**
#   물가·최저임금·주가를 임의 날짜에 대해 채우려면 별도 시계열 데이터가 필요한데,
#   그게 없는 상태에서 값을 적어 넣으면 1960년 창간 경제지 지면에 출처 없는
#   숫자를 싣는 셈이 된다. 그래서 **그 무렵 실제로 보도된 기사 제목**을 그대로
#   보여주고 원문으로 링크한다. 제목에 이미 숫자가 들어 있다
#   (예: "7월 소비자물가 2.8% 상승", "코스피 지수 1500선 붕괴").
#
# `terms` 는 빅카인즈 검색 질의어이자 제목 매칭 키워드로 함께 쓰인다.
TIMELINE_INDICATORS = [
    {'key': 'rate', 'label': '기준금리', 'terms': ['기준금리', '금통위']},
    {'key': 'cpi', 'label': '소비자물가', 'terms': ['소비자물가', '물가상승률']},
    {'key': 'wage', 'label': '최저임금', 'terms': ['최저임금']},
    {'key': 'fx', 'label': '환율', 'terms': ['원·달러', '원달러', '환율']},
    {'key': 'kospi', 'label': '코스피', 'terms': ['코스피']},
    {'key': 'oil', 'label': '국제유가', 'terms': ['국제유가', 'WTI']},
]

# 지표를 찾는 검색 창(대상일에서 며칠 전까지).
# 최저임금처럼 연 1회 결정되는 지표는 좁은 창에서 안 잡히는 게 정상이다 —
# 없으면 그냥 빼고 보여준다(추정치로 메우지 않는다).
TIMELINE_INDICATOR_WINDOW_DAYS = 7

# =============================================================================
# 뉴스 통합 분류체계 1레벨 (지침서 §13.2) → 이 프로젝트의 표준 7개 카테고리.
# BigKinds 분류는 `"경제>부동산"` 처럼 `>` 로 구분된 계층 문자열이라 1레벨만 잘라 쓴다.
# 8개 중 7개가 CATEGORIES_KOREAN 과 이름까지 그대로 일치하고, '지역' 만
# CATEGORY_SEARCH_ALIASES 의 '사회': ['사회', '지역'] 규칙에 맞춰 '사회'로 접는다.
BIGKINDS_CATEGORY_TO_STANDARD = {
    '정치': '정치',      # 001000000
    '경제': '경제',      # 002000000
    '사회': '사회',      # 003000000
    '문화': '문화',      # 004000000
    '국제': '국제',      # 005000000
    '지역': '사회',      # 006000000 — 표준 카테고리에 '지역'이 없어 '사회'로 통합
    '스포츠': '스포츠',  # 007000000
    'IT_과학': 'IT_과학',  # 008000000
}

# =============================================================================
# Pagination
# =============================================================================

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
BATCH_SIZE_DYNAMODB = 100  # DynamoDB batch operations limit

# =============================================================================
# Slug Configuration
# =============================================================================

SLUG_MAX_LENGTH = 60
SLUG_MIN_LENGTH = 3
SLUG_VALIDATION_MAX_LENGTH = 100
SLUG_COLLISION_MAX_ATTEMPTS = 10

# =============================================================================
# Podcast Configuration
# =============================================================================

# Polly Neural engine limit per call (characters)
POLLY_MAX_CHARS = 2800

# Maximum podcast script length (characters)
PODCAST_MAX_SCRIPT_LENGTH = 3000

# Podcast/TTS voice style (Polly SSML prosody) — single default, replaces the
# former per-MBTI-persona style table.
DEFAULT_VOICE_STYLE = {
    'rate': '100%',
    'pitch': 'medium',
    'desc': '전문적이고 차분한',
    'voice_id': 'Seoyeon',
}

# =============================================================================
# Default Values
# =============================================================================

DEFAULT_PRESS_NAME = '서울경제'
DEFAULT_BYLINE_KOREAN = '서울경제신문'
EDITORIAL_BYLINE = '서울경제 편집부'

# =============================================================================
# Item Types (DynamoDB)
# =============================================================================

ITEM_TYPE_ARTICLE = 'article'
ITEM_TYPE_SETTINGS = 'settings_config'
ITEM_TYPE_COLLECTION_LOG = 'collection_log'
ITEM_TYPE_ARTICLE_VERSION = 'article_version'
ITEM_TYPE_USER_PROFILE = 'user_profile'
ITEM_TYPE_ARCHIVED_SENTENCE = 'archived_sentence'
ITEM_TYPE_READING_RECORD = 'reading_record'
ITEM_TYPE_PODCAST = 'podcast'
ITEM_TYPE_NEWS_BRIEFING = 'news_briefing'

# =============================================================================
# News Briefing (Chatbot Context Cache)
# =============================================================================

NEWS_BRIEFING_ID = 'news_briefing_latest'
NEWS_BRIEFING_MAX_AGE_HOURS = 36  # 하루 1회 갱신 기준, 여유 12시간 포함

# =============================================================================
# Settings Keys
# =============================================================================

SETTINGS_KEY_VIDEO_SCHEDULES = 'video_schedules'
SETTINGS_KEY_TRANSLATION_PROMPT = 'translation_prompt'
SETTINGS_KEY_PROMPT_HISTORY = 'prompt_history'

# =============================================================================
# CORS Headers
# =============================================================================

CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
}

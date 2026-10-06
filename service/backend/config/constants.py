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
# 커뮤니티 게시글 투표·댓글 집계와 퀴즈 응답 집계가 공용으로 사용하는 테이블
DYNAMODB_TABLE_ENGAGEMENT_DEV = 'sedaily-mbti-engagement-dev'

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
HTTP_TIMEOUT_MEDIUM = 30     # For API calls (search, etc.)
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
ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

# Default Video URL
NAVER_TV_DEFAULT_URL = 'https://tv.naver.com/v/90963232?playlistNo=998605'
NAVER_TV_URL_DEFAULT = NAVER_TV_DEFAULT_URL  # Alias for consistency

# =============================================================================
# AI Model Configuration
# =============================================================================

# AWS Bedrock Claude Models
# Haiku 4.5 — 저비용 경로(일일 질문, 팟캐스트 스크립트, 기사 필터).
# Claude 3.5 Haiku 프로파일은 Bedrock 에서 수명 종료되어 사용할 수 없다.
BEDROCK_MODEL_ID_DEFAULT = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
BEDROCK_MODEL_ID_HAIKU = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
# Sonnet 4 — 복잡한 재작성용 고품질 모델(선택적 상위 옵션)
BEDROCK_MODEL_ID_SONNET = 'us.anthropic.claude-sonnet-4-20250514-v1:0'
# Opus 4.6 — MBTI 기사 변환용 최고 품질 모델(그룹별 병렬 호출).
# 비용 태그(Service=mbti)가 붙는 application inference profile ARN(mbti-opus-46)을 사용한다.
# 시스템 프로파일을 쓰면 Lambda 호출 비용이 미지정으로 집계된다.
BEDROCK_MODEL_ID_OPUS = 'arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/t6eh3tnfgr6b'

# Haiku 4.5 — 챗봇·AI 검색(MBTI 페르소나 톤앤매너 응답).
# 음성 통화 지연 시간과 비용을 줄이기 위해 Sonnet 대비 빠르고 저렴한 모델을 사용한다.
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

# 영문 사이트 표준 카테고리(한글명)
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
    'IT_과학': ['IT_과학', '산업', 'IT·과학'],  # 구 카테고리명(산업)과 신 카테고리명(IT·과학)을 함께 조회
    '정치': ['정치'],
    '사회': ['사회', '지역'],
    '문화': ['문화', '문화·라이프'],
    '스포츠': ['스포츠'],
    '국제': ['국제'],
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

# lens-cms-api 기본 주소(환경변수 LENS_CMS_API_URL이 없을 때). 평문 HTTP라 전환 시 이 한 곳만 바꾼다.
LENS_CMS_API_DEFAULT_URL = 'http://13.223.179.151'

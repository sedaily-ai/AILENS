# Article Pipeline — How AI LENS Collects, Transforms, and Serves Articles

> **Status**: v1 reference. Last meaningful update 2026-04-10. TASK-7 v2 cutover (2026-04-27) 이후 미반영. v1 (production) Step Functions pipeline 의 정확한 설명으로 가치 있음. v2 동작은 [backend/CLAUDE.md](../backend/CLAUDE.md) 또는 [v2-phase-history.md](v2-phase-history.md) 참조.

> **Service**: AI LENS — 서울경제신문 MBTI 맞춤형 경제 뉴스
> **Production**: https://mbti.sedaily.ai
> **API Gateway**: https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev
> **Last updated**: 2026-04-10

This document is the single source of truth for *how an article moves through AI LENS*: from the moment 서울경제신문 publishes it, through filtering, AI rewriting into 4 MBTI styles, validation, storage, and finally rendering on the frontend. Every claim below is grounded in code paths you can inspect.

---

## Table of Contents

1. [Overview & Data Flow](#1-overview--data-flow)
2. [Source: 서울경제 XML on S3](#2-source-서울경제-xml-on-s3)
3. [XML Schema & Parsing](#3-xml-schema--parsing)
4. [Category Normalization](#4-category-normalization)
5. [Article Filtering](#5-article-filtering)
6. [The Step Functions Pipeline (5 stages)](#6-the-step-functions-pipeline-5-stages)
7. [MBTI Transformation (Claude prompts)](#7-mbti-transformation-claude-prompts)
8. [Split Storage Pattern (DynamoDB + S3)](#8-split-storage-pattern-dynamodb--s3)
9. [Vector Indexing (OpenSearch + pgvector)](#9-vector-indexing-opensearch--pgvector)
10. [API Endpoints — Reading Articles](#10-api-endpoints--reading-articles)
11. [Frontend Consumption](#11-frontend-consumption)
12. [Failure Modes & Graceful Degradation](#12-failure-modes--graceful-degradation)
13. [Cost & Performance](#13-cost--performance)
14. [Two Collection Paths (Legacy vs Pipeline)](#14-two-collection-paths-legacy-vs-pipeline)

---

## 1. Overview & Data Flow

```
서울경제신문 newsroom (CMS)
  │
  ▼ (writers publish to internal CMS, exported to S3 every few minutes)
  │
S3: sedaily-news-xml-storage / daily-xml / YYYYMMDD.xml      [region: ap-northeast-2, Seoul]
  │
  │  Two consumers read the same XML:
  │
  ├──────────────────── Path A: legacy "article_collector" Lambda ──────────────────┐
  │                                                                                   │
  ▼                                                                                   │
Step Functions pipeline (us-east-1)                                                  │
  Step 1  Select       (Nova Lite)    rules + AI filter                             │
  Step 2  Classify     (Nova Lite)    pick MBTI groups, allocate per category       │
  Step 3  Transform    (Claude Haiku) ONE call → 4 MBTI versions per article        │
  Step 4  Validate     (Nova Lite)    field checks + spelling/style                 │
  Supervisor           (Nova Lite)    cross-version review + storage + vectors      │
  │                                                                                   │
  ▼                                                                                   │
Article DB (split storage)                                                           │
  ├─ DynamoDB  sedaily-mbti-articles-dev  (metadata + s3_body_uri pointer)          │
  └─ S3        sedaily-mbti-article-body-dev  /articles/{news_id}/body.json         │
                                                                                       │
  ├─ OpenSearch (optional) — RAG hybrid search                                       │
  └─ pgvector  (optional) — similarity search                                        │
                                                                                       │
  ▼                                                                                   │
API Gateway (HTTP API v2: chzwwtjtgk)                                                │
  GET /s3-articles               (reads raw XML, no MBTI)        ◄────────────────  │
  GET /api/article/{id}          (reads Article DB, with MBTI)                       │
  POST /api/search               (DynamoDB GSI search)                                │
  POST /api/chat                 (RAG over OpenSearch)                                │
                                                                                       │
  ▼                                                                                   │
Frontend (Next.js 16, https://mbti.sedaily.ai)                                        │
  FeedPage → NewsFeedTab → ArticleView                                                │
```

There are **two parallel collection paths**, both currently deployed:

| Path | What runs it | When | Status |
|---|---|---|---|
| **A. Legacy `article_collector`** | Single Lambda invoked by EventBridge | On schedule | Live, in use today |
| **B. Step Functions pipeline** | 6 Lambdas orchestrated by Step Functions | Not yet wired (Step Functions state machine deferred) | Lambdas deployed, dormant |

Both paths read the **same** S3 XML and write to the **same** Article DB. Section 14 describes how they coexist.

---

## 2. Source: 서울경제 XML on S3

### 2.1 Where the articles come from

서울경제신문 (Seoul Economic Daily) is a 70-year-old Korean financial newspaper. Their internal CMS exports newly-published articles as XML files to an S3 bucket that AI LENS has read access to:

```
Bucket:   sedaily-news-xml-storage
Region:   ap-northeast-2 (Seoul)
Prefix:   daily-xml/
Files:    daily-xml/YYYYMMDD.xml      (one file per day, refreshed throughout the day)
```

A real example file (today, 2026-04-10) is **1.4 MB** containing ~150 articles.

```bash
$ aws s3api head-object --bucket sedaily-news-xml-storage \
    --key daily-xml/20260410.xml --region ap-northeast-2

{
  "LastModified": "2026-04-10T06:40:04+00:00",
  "ContentLength": 1475277,
  "ETag": "\"62866402430e1b44b87d5db12576173d\""
}
```

The XML file is **rewritten in place** several times per day as new articles are published. Each rewrite contains all articles for that calendar day, each tagged with one of three actions: `I` (insert), `U` (update), or `D` (delete).

### 2.2 Why XML and not a webhook / API

서울경제 has no public REST API for full article bodies. Their existing data infrastructure (Prism, the legacy AI service) consumes the same XML drop. AI LENS reuses that integration without asking the newsroom to build anything new.

### 2.3 Cross-region read

The XML lives in `ap-northeast-2` (Seoul, close to the newsroom). All AI LENS compute lives in `us-east-1` (Virginia, where Bedrock Claude is GA and cheapest). The `S3XMLClient` is constructed with an explicit region so cross-region reads work transparently:

```python
# backend/handlers/article_collector.py:66
s3_xml_client = S3XMLClient(
    bucket_name="sedaily-news-xml-storage",
    prefix="daily-xml",
    region="ap-northeast-2"        # Seoul, where the XML lives
)
```

---

## 3. XML Schema & Parsing

### 3.1 Top-level structure

```xml
<root date="20260410" count="156">
  <item type="text">
    <nsid>2KB2TF5N4Z</nsid>              <!-- Article ID -->
    <action>I</action>                    <!-- I=Insert / U=Update / D=Delete -->
    <press>서울경제</press>
    <title>김영성 KB자산운용 대표 '청소년 불법도박 근절 캠페인' 동참</title>
    <subTitle>불법도박 위험성 알리고 피해 예방 촉구</subTitle>
    <content>KB자산운용은 김영성 대표이사가 ...</content>
    <author>윤민혁 기자(yoonmh@sedaily.com)</author>
    <date>2026-04-10</date>
    <time>15:14:12</time>
    <category code="1101" name="경제,금융"/>
    <url href="https://www.sedaily.com/NewsView/2KB2TF5N4Z"/>
    <image href="https://wimg.sedaily.com/.../news-p.v1...png" width="540" height="304">
      <captionTitle>로고</captionTitle>
      <captionContent>KB자산운용 본사</captionContent>
    </image>
    <relNews href="https://www.sedaily.com/NewsView/2KB1...">관련기사 제목</relNews>
    <leverage type="stock">005930</leverage>      <!-- Mentioned stock codes -->
    <push id="..." grade="..."/>                  <!-- Only on breaking news -->
    <paper number="..." position="..."/>          <!-- Print edition info -->
  </item>
  ...
</root>
```

### 3.2 The parser

`backend/clients/s3_xml_client.py:329` (`S3XMLClient`) is the canonical parser. It produces a strongly-typed `S3Article` dataclass that mirrors every field above:

```python
@dataclass
class S3Article:
    nsid: str           # 2KB2TF5N4Z
    action: str         # I / U / D
    press: str          # 서울경제
    title: str
    sub_title: Optional[str]
    content_raw: str            # Original HTML
    content_clean: str          # HTML stripped — used for embedding & search
    content_blocks: List[ContentBlock]  # Structured blocks preserving image positions
    author: str
    author_name: str            # 윤민혁 기자
    author_email: str           # yoonmh@sedaily.com
    date: str                   # 2026-04-10
    time: str                   # 15:14:12
    published_at: str           # 2026-04-10T15:14:12+09:00 (KST)
    categories: List[CategoryInfo]
    main_category: str          # Normalised: 경제 / IT_과학 / 정치 / ...
    url: str
    images: List[ImageData]
    related_news: List[RelatedNews]
    leverage: List[LeverageInfo]
    is_breaking_news: bool
    paper: Optional[PaperInfo]
```

### 3.3 Content blocks — preserving image positions

The newsroom embeds images inline with text (e.g. paragraph → image → paragraph → image → paragraph). The frontend must render in the same order. Naively stripping HTML loses positions, so the parser walks the original `<content>` element and emits **content blocks** in document order:

```python
@dataclass
class ContentBlock:
    block_type: str             # "text" or "image"
    # Text block fields
    text_ko: str = ""           # Korean paragraph text
    style: str = "normal"       # "normal" | "bold" | "heading"
    # Image block fields
    image_url: str = ""
    image_alt: str = ""
    image_width: str = ""
    image_caption: str = ""
```

Headings are detected by leading sigils (◆ ▶ ■). The frontend's `ArticleView.tsx` iterates `content_blocks` in order, choosing a `<p>` or `<figure>` renderer based on `type`.

### 3.4 Action breakdown

`get_articles_to_process()` groups articles by action:

```python
# backend/clients/s3_xml_client.py:776
async def get_articles_to_process(self, date_str: str = None) -> Dict[str, List[S3Article]]:
    articles = await self.get_articles_by_date(date_str)
    return {
        'new':     [a for a in articles if a.action == 'I'],
        'updated': [a for a in articles if a.action == 'U'],
        'deleted': [a for a in articles if a.action == 'D']
    }
```

The collector uses these buckets to decide what work to do:
- **`I`** → save fresh, transform if eligible
- **`U`** → check `content_hash`, skip if unchanged, otherwise re-save
- **`D`** → mark for removal (currently a soft action — we don't physically delete, we just stop returning the article)

### 3.5 Content change detection

To avoid re-running expensive Claude transformations on cosmetic CMS edits, every article's `content_clean` is hashed:

```python
# backend/utils/hash_utils.py
def hash_content(content: str) -> str:
    return hashlib.sha256(content.strip().encode('utf-8')).hexdigest()

def content_changed(old_hash: str, new_content: str) -> bool:
    if not old_hash:
        return True
    return old_hash != hash_content(new_content)
```

The collector batch-fetches existing hashes from DynamoDB:

```python
# backend/handlers/article_collector.py:113
existing_articles = await dynamodb_client.batch_get_articles_with_hash(updated_ids)
for article in updated_articles_xml:
    existing = existing_articles.get(article.nsid)
    if existing:
        old_hash = existing.get('content_hash')
        if content_changed(old_hash, article.content_clean or ''):
            articles_to_save.append(article)
            actually_changed_count += 1
        else:
            skipped_unchanged_count += 1
```

This is a real-money optimisation. Each Claude transform costs ~$0.0025; skipping unchanged articles can save hundreds of calls per day during a busy news cycle when the same article is republished multiple times for typo fixes.

---

## 4. Category Normalization

### 4.1 The problem

서울경제's CMS uses a **hierarchical, comma-separated** category string with 60+ variants:

| Raw category in XML | What it means |
|---|---|
| `경제,경제동향` | Economy / Economic trends |
| `경제,물가` | Economy / Prices |
| `금융,은행` | Finance / Banking |
| `증권,종목·투자전략` | Stock market / Securities strategy |
| `부동산,분양` | Real estate / New offerings |
| `산업,IT일반` | Industry / IT (legacy naming) |
| `IT·과학,반도체` | IT & Science / Semiconductors (new naming, since 2026-01-23) |
| `문화·라이프,건강·의료,제약·바이오` | Culture & Life / Health / Pharma |

The frontend wants only **7 standard categories**: `경제 / IT_과학 / 정치 / 사회 / 문화 / 스포츠 / 국제`.

### 4.2 The mapping table

`backend/clients/s3_xml_client.py:31` (`CATEGORY_NORMALIZATION_MAP`) is a dict with 60+ entries:

```python
CATEGORY_NORMALIZATION_MAP = {
    # IT_과학 — both legacy (산업,IT일반) and new (IT·과학,반도체) variants
    '산업,IT일반': 'IT_과학',
    '산업,반도체': 'IT_과학',
    'IT·과학': 'IT_과학',
    'IT·과학,반도체': 'IT_과학',
    'IT·과학,IT기기': 'IT_과학',

    # 문화 — old (문화) and new (문화·라이프) namings collapse to one
    '문화·라이프': '문화',
    '문화·라이프,건강·의료': '문화',

    # 경제 — finance, securities, real estate all map here
    '금융,은행': '경제',
    '증권,국내증시': '경제',
    '부동산,분양': '경제',
    ...
}

def normalize_category(raw_category: str) -> str:
    if raw_category in CATEGORY_NORMALIZATION_MAP:
        return CATEGORY_NORMALIZATION_MAP[raw_category]
    # Try prefix match
    for prefix, normalized in CATEGORY_NORMALIZATION_MAP.items():
        if raw_category.startswith(prefix):
            return normalized
    # Fall back to top-level
    first_part = raw_category.split(',')[0]
    if first_part in TOP_LEVEL_MAP:
        return TOP_LEVEL_MAP[first_part]
    return raw_category   # Unknown — pass through with a warning
```

### 4.3 Search aliases — the inverse problem

When a user searches "경제", we need to find articles tagged not only with "경제" but also legacy variants like "금융" and "증권". `CATEGORY_SEARCH_ALIASES` maps each standard category back to all known variants:

```python
# backend/config/constants.py:166
CATEGORY_SEARCH_ALIASES = {
    '경제':   ['경제', '금융', '증권', '부동산'],
    'IT_과학': ['IT_과학', '산업', 'IT·과학'],     # legacy 산업 + new IT·과학
    '정치':   ['정치'],
    '사회':   ['사회', '지역'],
    '문화':   ['문화', '문화·라이프'],
    '스포츠': ['스포츠'],
    '국제':   ['국제'],
}
```

`search_handler.py` expands these before issuing GSI queries against DynamoDB:

```python
# backend/handlers/search_handler.py:101
for cat in categories:
    if cat in CATEGORY_SEARCH_ALIASES:
        categories_to_query.extend(CATEGORY_SEARCH_ALIASES[cat])
```

---

## 5. Article Filtering

Not every published article should be MBTI-rewritten. Wire-service market closings, obituaries, and breaking-news flashes are unsuitable for stylised rewriting (and waste Claude tokens). The filter has two layers.

### 5.1 Rule-based fast filter

`backend/services/article_filter_service.py:84` and `backend/handlers/pipeline/step1_select.py:97` both implement the same logic:

```python
MIN_CONTENT_LENGTH = 300

EXCLUSION_TITLE_PATTERNS = [
    r'^\[인사\]',     # Personnel announcements
    r'^\[부고\]',     # Obituaries
    r'^\[속보\]',     # Breaking news flashes
    r'^\[\d보\]',     # [1보], [2보] — numbered breaking-news updates
    r'증시.*마감',    # Daily stock market close ("KOSPI 마감…")
    r'환율.*마감',    # Daily FX close
    r'유가.*마감',    # Daily oil close
]

EXCLUSION_TITLE_KEYWORDS = ['인사', '부고', '속보', '발령']

def _quick_filter(title: str, content: str) -> Tuple[bool, str]:
    if len(content) < MIN_CONTENT_LENGTH:
        return True, 'too_short'
    for pattern in EXCLUSION_TITLE_PATTERNS:
        if re.search(pattern, title):
            return True, f'title_pattern:{pattern}'
    for kw in EXCLUSION_TITLE_KEYWORDS:
        if kw in title.lower():
            return True, f'title_keyword:{kw}'
    return False, ''
```

This is intentionally aggressive on personnel/obituary content (cost: zero) and intentionally conservative on length (300 chars filters out only true wire flashes).

### 5.2 AI-based filter (Nova)

After rule-based filtering, if we still have more than 5 candidates, we ask **Amazon Nova Lite** to flag PR-style or repetitive articles:

```python
# backend/handlers/pipeline/step1_select.py:116
async def _ai_filter_nova(articles, nova_client) -> Dict[str, str]:
    summaries = []
    for i, a in enumerate(articles):
        preview = a.get('content_clean', '')[:200]
        summaries.append(f"{i+1}. [{a['news_id']}] {a['title']}\n   {preview}...")

    prompt = (
        "다음 경제 뉴스 기사 목록을 검토하고, MBTI 스타일 리라이팅에 적합하지 않은 기사를 식별하세요.\n\n"
        "제외 기준:\n"
        "- 속보/단신: 단순 사실 전달만 있는 기사\n"
        "- 사건/사고: 교통사고, 화재, 범죄 등\n"
        "- 인사/발령: 임명, 승진, 사퇴 등\n"
        "- 부고/동정: 사망, 조문 등\n"
        "- 반복성: 매일 반복되는 시황 기사\n"
        "- 홍보성: 광고성 기사, 기업 보도자료\n\n"
        f"기사 목록:\n{chr(10).join(summaries)}\n\n"
        'JSON 형식으로 제외할 기사만 출력하세요:\n'
        '{"excluded": [{"id": "뉴스ID", "reason": "사유"}]}'
    )

    response = nova_client.invoke_model(
        modelId='amazon.nova-lite-v1:0',
        body=json.dumps({
            "inputText": prompt,
            "textGenerationConfig": {"maxTokenCount": 1024, "temperature": 0.1}
        })
    )
    # → returns {news_id: exclusion_reason}
```

Nova Lite costs roughly **$0.06 per 1M input tokens**, so filtering ~150 articles per day costs ~$0.0001/day. The filter is opt-out: if the Nova call fails for any reason, the pipeline logs a warning and keeps all candidates (`logger.warning("Nova AI filter failed (non-fatal)")`).

### 5.3 Per-category allocation

After both filters, we keep only the **top N most recent articles per category**:

```python
# backend/handlers/article_collector.py:36 (legacy)
# backend/handlers/pipeline/step2_classify.py:63 (pipeline)
ALLOCATION_PER_CATEGORY = {
    '경제':    3,
    'IT_과학': 2,
    '정치':    1,
    '사회':    2,
    '문화':    1,
    '스포츠':  1,
    '국제':    1,
}
# Total: 11 articles per day get the full Claude treatment
```

The newsroom publishes ~150 articles per day. After filtering and per-category allocation we transform **only ~11 articles**, which costs ~$0.03/day in Claude tokens. The remaining ~140 articles are still saved (without MBTI versions) and served via `/s3-articles`.

---

## 6. The Step Functions Pipeline (5 stages)

> **Note**: The pipeline code is fully written and the 6 Lambdas are deployed to AWS, but the Step Functions state machine that orchestrates them is **not yet provisioned** (deferred). Today, the legacy `article_collector` Lambda still does end-to-end collection. The pipeline will replace it once the state machine is created.

### 6.1 Stage I/O contract

Each stage takes the previous stage's output as input and produces a JSON object that's passed verbatim to the next stage. Every stage emits a `metrics` block for observability.

```
Step 1 input:  { "date": "20260410", "source": "schedule" | "manual" }
Step 1 → 2:    { step:1, date, selected_articles[], metrics }
Step 2 → 3:    { step:2, date, classified_articles[], classification_map, metrics }
Step 3 → 4:    { step:3, date, transformed_articles[], failed_articles[], metrics }
Step 4 → Sup:  { step:4, date, validated_articles[], flagged_articles[], failed_articles[], metrics }
Supervisor →:  { step:"supervisor", date, stored_articles[], rejected_articles[], vector_failures[], collection_log_id, metrics }
```

### 6.2 Step 1 — Select

**Lambda**: `sedaily-mbti-pipeline-step1-dev`
**File**: `backend/handlers/pipeline/step1_select.py`
**Model**: Amazon Nova Lite (`amazon.nova-lite-v1:0`)

```python
async def _select_articles(date_str: str) -> Dict[str, Any]:
    # 1. Pull XML from Seoul S3
    s3_client = S3XMLClient(
        bucket_name='sedaily-news-xml-storage',
        prefix='daily-xml',
        region='ap-northeast-2',
    )
    all_articles = await s3_client.get_articles_by_date(date_str)

    # 2. Drop deleted (action = 'D')
    active = [a for a in all_articles if a.action != 'D']

    # 3. Rule-based filter
    candidates = []
    for article in active:
        should_exclude, reason = _quick_filter(article.title, article.content_clean or '')
        if not should_exclude:
            candidates.append(article)

    # 4. AI filter (only if enough candidates)
    if len(candidates) > 5:
        nova = _get_nova_client()
        ai_excluded = await _ai_filter_nova(candidate_dicts, nova)
        candidates = [a for a in candidates if a.nsid not in ai_excluded]

    # 5. Serialise to JSON-friendly format for downstream stages
    selected = [...]
    return { 'step': 1, 'date': date_str, 'selected_articles': selected, 'metrics': {...} }
```

### 6.3 Step 2 — Classify

**Lambda**: `sedaily-mbti-pipeline-step2-dev`
**File**: `backend/handlers/pipeline/step2_classify.py`
**Model**: Nova Lite

Step 2 does **two** things:
1. Apply per-category allocation (top N per category by recency).
2. For each surviving article, ask Nova which MBTI groups it suits.

```python
async def _classify_batch_nova(articles, nova_client) -> Dict[str, List[str]]:
    prompt = (
        "다음 경제 뉴스 기사들을 4개 MBTI 그룹별 적합도로 분류하세요.\n\n"
        "MBTI 그룹:\n"
        "- NT (전략형): 구조적 분석, 데이터 기반, 시나리오 분석에 적합한 기사\n"
        "- NF (가치형): 사회적 의미, 가치 충돌, 심층 해석에 적합한 기사\n"
        "- ST (실용형): 팩트 정리, 표/수치 중심, 체크리스트에 적합한 기사\n"
        "- SF (공감형): 실생활 연결, 쉬운 설명, 독자 공감에 적합한 기사\n\n"
        "대부분의 기사는 4개 그룹 모두에 적합합니다.\n"
        "특정 그룹에 부적합한 경우에만 해당 그룹을 제외하세요.\n\n"
        f"기사 목록:\n{chr(10).join(summaries)}\n\n"
        '{"classifications": [{"id": "뉴스ID", "groups": ["NT","NF","ST","SF"]}]}'
    )
    # ... Nova call → returns {news_id: ["NT","NF","ST","SF"]}
```

In practice, Nova returns all 4 groups for ~95% of articles (a generic economic story is "interesting to everyone"). The classification mostly catches edge cases like a sports article that doesn't fit NT (analytical).

### 6.4 Step 3 — Transform (the expensive one)

**Lambda**: `sedaily-mbti-pipeline-step3-dev`
**File**: `backend/handlers/pipeline/step3_transform.py`
**Model**: Claude 3.5 Haiku (`us.anthropic.claude-3-5-haiku-20241022-v1:0`)

This is where the magic and the money happen. For each article we make **one** Claude call that produces all 4 MBTI versions in a single JSON response. This is dramatically cheaper than 4 separate calls because the article body is in the prompt only once.

```python
# backend/handlers/pipeline/step3_transform.py:108
result = await transform_service.transform_article(
    title=title,
    subtitle=article.get('sub_title', ''),
    content=content,
    category=article.get('category', '경제'),
)
versions = result['versions']
usage = result['usage']
```

The actual Bedrock call lives in `MbtiTransformService.transform_article()` (`backend/clients/mbti_transform_service.py`). The system prompt is built by **concatenating** the four `prompts/{nt,nf,st,sf}.md` files with delimiters and appending strict JSON output instructions:

```python
def _build_combined_prompt(self, group_prompts: Dict[str, str]) -> str:
    combined = """당신은 서울경제신문의 MBTI 맞춤형 뉴스 변환 전문가입니다.
하나의 경제 기사를 4가지 MBTI 그룹 스타일(NT, NF, ST, SF)로 변환합니다.

===========================================
[중요] 출력 형식 - 반드시 JSON으로 출력하세요
===========================================

```json
{
  "NT": { "title": "...", "body": "..." },
  "NF": { "title": "...", "body": "..." },
  "ST": { "title": "...", "body": "..." },
  "SF": { "title": "...", "body": "..." }
}
```

===========================================
[NT 전략형 분석가] 가이드라인
===========================================
"""
    combined += group_prompts['NT']
    combined += "\n[NF 가치형 해석자] 가이드라인\n"
    combined += group_prompts['NF']
    # ...and so on for ST, SF
    return combined
```

Each individual prompt file is a sophisticated XML-tagged persona definition (~250 lines each). For example, `prompts/nt.md`:

```xml
<nt_strategic_news_prompt>
<system_role>
당신은 서울경제신문의 시니어 애널리스트입니다.
15년간 거시경제와 정책 분석을 담당해왔으며,
복잡한 이슈를 구조적으로 분해하고 핵심 변수를 도출하는 것이 특기입니다.
</system_role>

<persona>
- 이름: 전략분석팀 김시현 수석연구원
- 성향: 냉철하고 논리적, 감정보다 데이터와 구조를 신뢰
- 말투: 군더더기 없이 핵심만, 단정적이지만 근거 있는 발언
- 신념: "현상 뒤에는 반드시 구조가 있다"
- 분석 철학: 인과관계 → 패턴 → 시나리오 → 체크포인트
</persona>

<target_audience>
NT 그룹: INTJ, INTP, ENTJ, ENTP
[인지 특성]
- 추상적 사고 + 분석적 판단
- 패턴과 시스템을 파악하려는 욕구
- "왜?"라는 질문이 먼저 떠오름
[이 독자가 원하는 것]
- "그래서 왜 이번엔 다르다는 거야?"
- "핵심 변수가 뭐야?"
- "내가 뭘 지켜봐야 해?"
</target_audience>

<content_structure>
[기(起) - 핵심 논점 제시]
[승(承) - 데이터/근거 제시]
[전(轉) - 시나리오 분석]
[결(結) - 체크포인트]
</content_structure>
</nt_strategic_news_prompt>
```

The prompt loading chain has a fallback hierarchy (`MbtiTransformService._load_transform_prompt()`):

1. Individual `prompts/{nt,nf,st,sf}.md` files (current path)
2. DynamoDB `settings_config.transform_prompt` (legacy fallback for runtime overrides)
3. `MBTI_TRANSFORM_PROMPT.md` legacy single-file prompt (last resort)
4. Hardcoded "you are a Korean economic news transformer" string (panic fallback)

#### Token usage and timing

Real measurements from `tests/test_model_comparison.py`:

| Metric | Claude Haiku 3.5 | Nova Pro |
|---|---|---|
| Cost per article (4 versions) | $0.0025 | $0.0279 |
| Latency per article | ~28s | ~33s |
| 4-version completion rate | 100% | 100% |

Claude wins on both cost and speed for this workload. Nova was tested and rejected.

#### Retry logic

`MbtiTransformService` has built-in retry with exponential backoff:

```python
MAX_RETRIES = 5
INITIAL_RETRY_DELAY = 30
MAX_RETRY_DELAY = 300
```

This is critical because Bedrock Haiku occasionally throttles during peak hours. The Lambda timeout is 300s (matching the max retry window).

### 6.5 Step 4 — Validate

**Lambda**: `sedaily-mbti-pipeline-step4-dev`
**File**: `backend/handlers/pipeline/step4_validate.py`
**Model**: Nova Lite (with Claude as a fallback for complex cases)

Validation has two layers:

**Rule-based checks** (`_basic_checks`):
```python
def _basic_checks(article: Dict[str, Any]) -> List[Dict[str, str]]:
    issues = []
    versions = article.get('versions', {})
    original_title = article.get('title', '')

    for group in MBTI_GROUPS:                 # NT, NF, ST, SF
        v = versions.get(group)
        if not v:
            issues.append({'group': group, 'type': 'missing'})
            continue

        title = v.get('title', '')
        body = v.get('body', '')
        body_text = body if isinstance(body, str) else '\n'.join(body)

        if not title:
            issues.append({'group': group, 'type': 'missing_title'})
        if len(body_text.strip()) < 100:
            issues.append({'group': group, 'type': 'body_too_short'})
        if title == original_title:           # Claude lazily echoed the original
            issues.append({'group': group, 'type': 'title_unchanged'})
    return issues
```

**AI-based check** (`_ai_validate_batch`) — sends Nova a summary of each article + its 4 transformed titles, asks for fact-preservation and tone-distinction issues. Returns a structured list of issues per article.

Articles get tagged `validation.status = "passed"` or `"flagged"` and forwarded to the supervisor.

### 6.6 Supervisor — final gate, store, index

**Lambda**: `sedaily-mbti-pipeline-supervisor-dev`
**File**: `backend/handlers/pipeline/supervisor.py`
**Model**: Nova Lite (cross-version review only)

The supervisor runs **5 phases in strict order**. The order is enforced; reversing it would violate our durability guarantee.

```python
# backend/handlers/pipeline/supervisor.py:472
async def _supervise_and_store(event_body: Dict[str, Any]) -> Dict[str, Any]:
    # ── Phase 1: Nova cross-version review ──────────────────────
    # Asks Nova: do the 4 versions actually have different tones?
    # Are core facts preserved? Are versions distinct?
    nova_rejections = await _supervisor_review(passed_articles, nova)

    # ── Phase 2: Decide which articles to store ─────────────────
    to_store = []
    for article in articles:
        if validation.status == 'flagged':       # Step 4 caught issues
            rejected.append(...)
            continue
        if nova_rejections.get(news_id, {}).get('approved') is False:
            rejected.append(...)
            continue
        to_store.append(article)

    # ── Phase 3: Store approved articles in Article DB ──────────
    # (split storage: DynamoDB metadata + S3 body)
    db = _init_storage()
    for article in to_store:
        storage_dict = _to_storage_format(article)
        success = await db.save_article(storage_dict)   # MUST succeed first
        if success:
            stored.append(...)
            stored_articles_for_indexing.append(article)

    # ── Phase 4: Vector indexing (NON-FATAL) ────────────────────
    # Only happens if Phase 3 succeeded for at least one article.
    # Failures are collected but never block the pipeline.
    if stored_articles_for_indexing:
        vector_results = await _index_vectors(stored_articles_for_indexing)

    # ── Phase 5: Collection log ─────────────────────────────────
    log_id = await _save_collection_log(db, date_str, metrics, ...)
```

**Why the order matters**: If we indexed vectors before storing the article, an OpenSearch failure would leave us with phantom search hits pointing to articles that don't exist. By storing first, we guarantee that anything the user can find via search actually exists in the Article DB.

The storage transformation maps pipeline field names → DynamoDB field names:

```python
# backend/handlers/pipeline/supervisor.py:195
def _to_storage_format(article: Dict[str, Any]) -> Dict[str, Any]:
    versions = article.get('versions', {})
    return {
        # Core
        'news_id': article['news_id'],
        'item_type': 'article',
        'press': '서울경제',

        # Body fields — these go to S3 (split storage)
        'title_ko': article.get('title', ''),
        'sub_title_ko': article.get('sub_title', ''),
        'content_ko': article.get('content_clean', ''),
        'content_raw': article.get('content_raw', ''),
        'content_blocks': article.get('content_blocks', []),
        'version_NT': versions.get('NT', {}),
        'version_NF': versions.get('NF', {}),
        'version_ST': versions.get('ST', {}),
        'version_SF': versions.get('SF', {}),

        # Metadata fields — these stay in DynamoDB
        'author_name': article.get('author_name', ''),
        'byline': article.get('author_name', '') or '서울경제',
        'published_at': article.get('published_at', ''),
        'category': article.get('category', ''),
        'url': article.get('url', ''),
        'images': article.get('images', []),
        'related_news': article.get('related_news', []),
        'is_breaking_news': article.get('is_breaking_news', False),
        'content_hash': hash_content(article.get('content_clean', '')),
        'transform_usage': article.get('transform_usage', {}),
        'transformed_at': now,
    }
```

---

## 7. MBTI Transformation (Claude prompts)

### 7.1 The 4 personas

| Group | Editor persona | Style | Prompt file | Lines |
|---|---|---|---|---|
| **NT** | 김시현, 전략분석팀 수석연구원 | 애널리스트 리포트 (analyst report) | `prompts/nt.md` | 255 |
| **NF** | 박지원, 오피니언팀 논설위원 | 칼럼/에세이 (column/essay) | `prompts/nf.md` | 249 |
| **ST** | 이정훈, 팩트체크 에디터 | 팩트시트 (fact sheet) | `prompts/st.md` | 286 |
| **SF** | 김하은, MZ 독자 담당 에디터 | 친구 톡 (friend chat) | `prompts/sf.md` | 281 |

Each prompt file is structured with explicit XML tags for system role, persona, target audience cognitive characteristics, content structure (기-승-전-결), language rules, and forbidden patterns. They are designed to be loaded individually so we can A/B test prompt revisions per group.

### 7.2 The output JSON contract

Every Claude call must return this shape:

```json
{
  "NT": {
    "title": "삼성전자 1분기 실적, 메모리 반등이 만든 구조적 변곡점",
    "body": "## 핵심 논점\n\n삼성전자가 1분기 영업이익 6.6조원을 기록했다...\n\n## 데이터로 본 패턴\n\n- DRAM ASP +18% QoQ\n- HBM 매출 비중 14%\n..."
  },
  "NF": {
    "title": "삼성의 분기 실적이 우리에게 던지는 질문",
    "body": "삼성전자의 실적 발표는 단순한 숫자가 아니다.\n\n반도체 산업의 부침은..."
  },
  "ST": {
    "title": "삼성전자 1Q26 실적 요약 — 영업익 6.6조원",
    "body": "**핵심 수치**\n- 매출: 76.5조원 (+12% YoY)\n- 영업익: 6.6조원 (+45% YoY)\n..."
  },
  "SF": {
    "title": "삼성이 또 분기 영업익 6조 넘었대 — 우리한테 무슨 의미?",
    "body": "오늘 아침에 삼성전자 실적 발표가 있었는데, 한 마디로 '잘 나왔다'야..."
  }
}
```

The pipeline does **not** post-process the JSON beyond sanity checks (missing fields, length). The body strings are markdown — the frontend renders them with `react-markdown`.

### 7.3 Why one Claude call instead of four

A naive implementation calls Claude four times (one per group). Each call must include the full article body (~2000 tokens). At 4 calls × 2000 tokens, we pay 8000 input tokens per article.

Our combined prompt sends the article body once and asks for 4 versions:
- Input tokens: ~2500 (prompt + body)
- Output tokens: ~3000 (4 versions)
- Cost: ~$0.0025 per article

Versus 4 separate calls: ~$0.008 per article. **3x savings**, with no measurable quality difference (we tested this extensively with `tests/test_model_comparison.py`).

---

## 8. Split Storage Pattern (DynamoDB + S3)

### 8.1 The motivation

A typical article with 4 MBTI versions has:
- Title (~80 chars)
- Body original (~2000 chars)
- 4 MBTI bodies (~2000 chars each = 8000 chars)
- Content blocks (structured representation, ~3000 chars)

Total: ~13 KB per item. Multiplied across thousands of articles, this hits DynamoDB's 400 KB item limit per single article (some economic explainers run 4000+ chars per version) and inflates RCU costs (every read pays for the whole item).

DynamoDB is great at small items + GSI queries; S3 is great at large blobs. Split storage gets the best of both.

### 8.2 What lives where

**DynamoDB** `sedaily-mbti-articles-dev` (PK: `news_id`):

```
news_id, item_type, title_ko, sub_title_ko, category, categories,
published_at, author_name, byline, url, original_link, images,
content_hash, transformed_at, transform_usage,
s3_body_uri               ← pointer
```

GSIs:
- `category-published_at-index` — list articles by category by date
- `slug-index` — look up by SEO slug

**S3** `sedaily-mbti-article-body-dev` (region: us-east-1):

```
articles/{news_id}/body.json
```

The JSON contains the heavy fields:

```json
{
  "content_ko": "삼성전자가 1분기...",
  "content_raw": "<p>삼성전자가 1분기...</p>",
  "content_blocks": [
    {"type": "text", "text_ko": "...", "style": "normal"},
    {"type": "image", "url": "https://wimg.sedaily.com/...", "caption": "..."}
  ],
  "version_NT": { "title": "...", "body": "..." },
  "version_NF": { "title": "...", "body": "..." },
  "version_ST": { "title": "...", "body": "..." },
  "version_SF": { "title": "...", "body": "..." }
}
```

### 8.3 The unified read

`DynamoDBClient.get_article()` transparently merges the two:

```python
# backend/clients/dynamodb_client.py:56
async def get_article(self, news_id: str) -> Optional[Dict[str, Any]]:
    metadata = await self.get_article_metadata(news_id)
    if not metadata:
        return None

    s3_body_uri = metadata.get('s3_body_uri')

    # New-style article: body lives in S3
    if s3_body_uri and self._s3_article_client:
        body = self._s3_article_client.get_body(news_id)
        if body:
            metadata.update(body)
        else:
            logger.warning(
                f"Article {news_id} has s3_body_uri but S3 body fetch failed; "
                f"returning metadata only"
            )

    # Legacy article (no s3_body_uri): body fields already in metadata dict
    return metadata
```

This is **backward-compatible**. Articles created before split storage still have `content_ko`, `version_NT`, etc. directly in the DynamoDB item. The `s3_body_uri` check is what distinguishes the two — if the field is absent, the metadata dict already contains everything.

### 8.4 The unified write

`DynamoDBClient.save_article()` splits the article on the way in:

```python
# backend/clients/dynamodb_client.py:213
if self._s3_article_client:
    body_data = S3ArticleClient.extract_body_fields(article)
    if body_data:
        s3_uri = self._s3_article_client.put_body(news_id, body_data)
        item['s3_body_uri'] = s3_uri
        logger.info(f"Article {news_id} body stored in S3: {s3_uri}")
else:
    # Legacy mode: store body fields directly in DynamoDB
    item['content_ko'] = content_ko
    item['version_NT'] = article.get('version_NT', {})
    # ...
```

`S3ArticleClient.extract_body_fields()` is just a filter against `S3_BODY_FIELDS`:

```python
# backend/config/constants.py:32
S3_BODY_FIELDS = [
    'content_ko',
    'content_raw',
    'content_blocks',
    'version_NT',
    'version_NF',
    'version_ST',
    'version_SF',
]
```

Caller wires the two clients together:

```python
# backend/handlers/article_handler.py:290
from clients.s3_article_client import S3ArticleClient
s3_article_client = S3ArticleClient(
    bucket_name=settings.s3_article_body_bucket,
    region=settings.s3_article_body_region,
)
dynamodb_client = DynamoDBClient(
    table_name=settings.dynamodb_table_articles,
    region=settings.region,
    s3_article_client=s3_article_client,
)
```

When `s3_article_client=None`, the client falls back to legacy single-table behaviour. This is what makes the migration safe.

---

## 9. Vector Indexing (OpenSearch + pgvector)

### 9.1 What gets embedded

Per article, we embed **5 texts**:

1. The original article (`title + content_clean`)
2. The NT version (`title + body`)
3. The NF version (`title + body`)
4. The ST version (`title + body`)
5. The SF version (`title + body`)

### 9.2 The embedding model

`amazon.titan-embed-text-v2:0`:
- 1024 dimensions
- Up to 8192 input tokens (~6000 Korean chars)
- Cost: $0.00002 per 1K input tokens
- Lives in `us-east-1` Bedrock alongside Claude/Nova

Long texts get split into paragraph-aligned chunks and averaged into a single 1024-dim vector (with L2 normalization for cosine similarity correctness):

```python
# backend/clients/embedding_client.py
def embed_text(self, text: str) -> List[float]:
    if len(text) <= EMBEDDING_CHARS_PER_CHUNK:    # 6000
        return self._call_bedrock(text)
    chunks = _split_into_chunks(text, EMBEDDING_CHARS_PER_CHUNK)
    vectors = [self._call_bedrock(chunk) for chunk in chunks]
    return _average_vectors(vectors)        # element-wise mean + L2 normalize
```

### 9.3 Two vector backends, one purpose

| Backend | Used for | Why both? |
|---|---|---|
| **OpenSearch** | RAG hybrid search (chatbot, full-text + kNN) | Has Korean (nori) text analyzer + native kNN |
| **pgvector** | Similarity search ("내 서랍" archived sentences, similar articles) | SQL joins with relational data |

The supervisor's vector indexing stage writes to **both** in parallel. Either can fail without affecting the other or the article store:

```python
# backend/handlers/pipeline/supervisor.py:325
async def _index_vectors(articles) -> Dict[str, Any]:
    failures = []
    embed_client = EmbeddingClient()
    os_client = _init_opensearch()      # None if OPENSEARCH_ENDPOINT empty
    pg_client = _init_pgvector()        # None if PG_PASSWORD empty

    if not os_client and not pg_client:
        return {'opensearch_indexed': 0, 'pgvector_indexed': 0, 'failures': []}

    for article in articles:
        # Build 5 embed items: original + 4 MBTI versions
        embed_items = [...]
        try:
            embeddings = embed_client.embed_batch(texts_to_embed)
        except Exception as e:
            failures.append({'news_id': news_id, 'service': 'bedrock_embedding', 'error': ...})
            continue

        # Batch index in OpenSearch
        if os_client:
            try:
                count = os_client.bulk_index_articles(batch_articles, batch_embeddings, batch_groups)
                opensearch_count += count
            except Exception as e:
                failures.append({'news_id': news_id, 'service': 'opensearch_bulk', 'error': ...})

        # Sequential index in pgvector
        if pg_client:
            for (group, text, _title), embedding in zip(embed_items, embeddings):
                try:
                    pg_client.insert_article_vector(...)
                    pgvector_count += 1
                except Exception as e:
                    failures.append({'news_id': news_id, 'service': f'pgvector_{group}', 'error': ...})
```

### 9.4 The graceful-degradation invariant

**Vector indexing failures NEVER block article storage.** If OpenSearch is down, the article still ends up in DynamoDB+S3 and can be served via `/api/article/{id}` and `/s3-articles`. The user just won't get semantic search hits for that article until a backfill job runs.

This is enforced by Phase ordering in the supervisor:
```
Phase 3: storage  ← MUST succeed for an article to count as "stored"
Phase 4: vectors  ← runs only on already-stored articles, failures collected but ignored
```

Both `OpenSearchClient` and `PgVectorClient` also implement **no-op mode**: if their respective env vars are empty, every public method returns empty results without raising. This is what lets us ship the codebase before provisioning OpenSearch/RDS.

---

## 10. API Endpoints — Reading Articles

| Method | Path | Backed by | Returns |
|---|---|---|---|
| `GET` | `/s3-articles?date=YYYYMMDD&limit=30&category=경제` | `s3_articles_handler.py` → `S3XMLClient` | Original articles from S3 XML (no MBTI) |
| `GET` | `/s3-article/{news_id}?date=YYYYMMDD` | `s3_articles_handler.py` → `S3XMLClient` | Single original article from XML |
| `GET` | `/api/article/{news_id}` | `article_handler.py` → `DynamoDBClient.get_article()` | Article DB entry, includes MBTI versions if available |
| `POST` | `/api/search` | `search_handler.py` → DynamoDB GSI | Articles matching query/category/date |
| `POST` | `/api/chat` | `chatbot_handler.py` → OpenSearch hybrid → Claude | RAG chatbot response |
| `GET` | `/time-machine?date=YYYY-MM-DD` | `time_machine_handler.py` | Past-date articles via S3 XML |

### 10.1 The `/s3-articles` endpoint — why it exists

The frontend's main feed shows the **most recent** articles, but most of them haven't been MBTI-transformed (we transform only ~11 per day). To give the user a populated feed, we serve the raw S3 XML directly.

```python
# backend/handlers/s3_articles_handler.py:45
async def get_articles_list(date_str=None, limit=30, category=None) -> dict:
    if not date_str:
        date_str = _get_kst_today()

    client = get_s3_client()
    articles = await client.get_articles_by_date(date_str)

    # Filter: exclude deleted
    articles = [a for a in articles if a.action != 'D']
    if category:
        articles = [a for a in articles if a.main_category == category]
    articles.sort(key=lambda x: x.published_at, reverse=True)
    articles = articles[:limit]

    return {
        "date": date_str,
        "total": len(articles),
        "articles": [
            {
                "news_id": a.nsid,
                "title": a.title,
                "sub_title": a.sub_title or "",
                "published_at": a.published_at,
                "category": a.main_category,
                "provider": a.press,
                "byline": a.author_name,
                "image_url": a.images[0].url if a.images else None,
                "content": a.content_clean[:2000],
                "original_link": a.url,
            }
            for a in articles
        ]
    }
```

Key properties:
- **No DynamoDB read.** The S3 XML is the source of truth.
- **No MBTI versions.** This endpoint is for the list view only.
- **Cross-region.** The Lambda is in us-east-1 but reads from ap-northeast-2 S3.

### 10.2 The `/api/article/{id}` endpoint

When the user taps an article in the feed, the frontend calls this to get the full body and MBTI versions. The handler uses the wired-up `DynamoDBClient`:

```python
# backend/handlers/article_handler.py:290
s3_article_client = S3ArticleClient(
    bucket_name=settings.s3_article_body_bucket,
    region=settings.s3_article_body_region,
)
dynamodb_client = DynamoDBClient(
    table_name=settings.dynamodb_table_articles,
    region=settings.region,
    s3_article_client=s3_article_client,
)
handler = ArticleHandler(dynamodb_client=dynamodb_client)
response = await handler.handle_article_detail(article_id)
```

The response shape (`ArticleDetailResponse`):

```typescript
{
  news_id: string,
  title_ko: string,
  content_ko: string,
  published_at: string,
  provider: string,        // 서울경제
  category: string,
  version_NT: { title, body },     // {} if not transformed
  version_NF: { title, body },
  version_ST: { title, body },
  version_SF: { title, body },
  byline: string,
  original_link: string,
  images: ImageData[],
  content_blocks: ContentBlock[],
  ...
}
```

If the article hasn't been MBTI-transformed (the common case), the `version_*` fields are empty objects and the frontend falls back to showing `content_ko` plus the user's chosen MBTI editor persona.

---

## 11. Frontend Consumption

### 11.1 List page — `NewsFeedTab`

```typescript
// frontend-next/src/features/news-feed/...
const res = await fetch(`${API_URL}/s3-articles?date=${dateStr}&limit=30`);
const { articles } = await res.json();
// Render cards with title, byline, image_url, published_at
```

If `/s3-articles` returns empty (e.g. before the day's first XML drop), the frontend falls back to `POST /api/search` with a recent date range — that hits DynamoDB GSI for any previously-stored articles.

### 11.2 Article detail — `ArticleView`

```typescript
const res = await fetch(`${API_URL}/api/article/${newsId}`);
const article = await res.json();

// Render based on selected MBTI group
const version = article[`version_${userMbtiGroup}`];
if (version?.body) {
  return <ReactMarkdown>{version.body}</ReactMarkdown>;
} else {
  // Fallback: original content with editor persona note
  return <OriginalContent content={article.content_ko} blocks={article.content_blocks} />;
}
```

When the user has the NT editor selected (김시현), they see the NT-transformed version if it exists, otherwise they see the original article body with a "이 기사는 김시현 에디터의 분석 버전이 아직 준비되지 않았습니다" notice.

### 11.3 Image rendering with content blocks

`content_blocks` is the structured representation that preserves image positions in the article body:

```typescript
function renderBlocks(blocks: ContentBlock[]) {
  return blocks.map((block, i) => {
    if (block.type === 'text') {
      const Tag = block.style === 'heading' ? 'h3' : 'p';
      return <Tag key={i} className={block.style === 'bold' ? 'font-bold' : ''}>
        {block.text_ko}
      </Tag>;
    }
    if (block.type === 'image') {
      return <figure key={i}>
        <img src={block.url} alt={block.alt} width={block.width} />
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>;
    }
  });
}
```

This ensures the rendered article matches the layout of the original 서울경제 page, including embedded image placement.

---

## 12. Failure Modes & Graceful Degradation

| Failure | What happens | User impact |
|---|---|---|
| S3 XML missing for a date | `S3XMLClient.get_articles_by_date()` returns `[]`, logs `NoSuchKey` warning | `/s3-articles` returns `total: 0` |
| Cross-region S3 read fails | Same as above; Lambda has IAM permissions for both regions | Same as above |
| Bedrock Claude throttled | `MbtiTransformService` retries 5x with backoff (30s → 300s) | Article without MBTI versions; user sees original |
| Bedrock Claude permanent fail | Article is marked `failed` in step 3, forwarded to supervisor, never stored as transformed | Same as above |
| Step 4 flags article | Supervisor rejects, article not stored as MBTI version | Same as above |
| DynamoDB write fails | `save_article()` returns `False`, supervisor counts as `store_failed` | Article missing from feed for that cycle |
| S3 body write fails | Supervisor marks article as failed; nothing in DynamoDB either | Same as above (atomicity preserved by failing fast) |
| OpenSearch unreachable | `OpenSearchClient` no-op mode returns empty; failures collected | RAG chatbot falls back to DynamoDB GSI search |
| pgvector unreachable | `PgVectorClient` no-op mode returns empty | "내 서랍" similarity search returns 503 with clear message |
| Embedding fails | Vector indexing skipped for that article; logged as failure | Same as above |
| Personal DB table missing | `PersonalDBClient` catches `ResourceNotFoundException` | `/api/archive` returns empty list with warning logged |
| Podcast DB table missing | `PodcastDBClient` catches `ResourceNotFoundException` | `/api/podcast/*` returns empty list |

The dominant pattern: **never let an optional service block the critical path**. The critical path is "user can read articles". Everything else (search, recommendations, similarity, podcasts) is optional.

---

## 13. Cost & Performance

### 13.1 Per-day cost (current scale)

| Service | Cost | Notes |
|---|---|---|
| Bedrock Claude (transforms) | ~$0.03 | 11 articles × $0.0025 |
| Bedrock Nova (filter, classify, validate, supervise) | ~$0.001 | Tiny prompts, very cheap |
| Bedrock Titan (embeddings) | ~$0.0005 | 11 × 5 = 55 embeddings |
| Lambda invocations | ~$0.02 | All API + pipeline functions |
| DynamoDB | ~$0 | On-demand, low traffic |
| S3 (article body + XML) | ~$0 | Few GB |
| OpenSearch (when provisioned) | $0.86 | Fixed cost — t3.small.search cluster |
| RDS pgvector (when provisioned) | $0.43 | Fixed cost — db.t3.micro |
| **Total active** | **~$0.05** | Optional services off |
| **Total with optional services** | **~$1.34** | OpenSearch + pgvector on |

Against the AWS Jump Start budget of $26,000, we have **~589 months** of runway at the lower bound.

### 13.2 Per-stage timing (Step Functions pipeline)

| Stage | Typical duration | Bottleneck |
|---|---|---|
| Step 1 (select) | 4-5s | Cross-region S3 read (~2s), Nova call (~2s) |
| Step 2 (classify) | 2-3s | Single Nova call |
| Step 3 (transform) | 11 articles × 28s = ~5 min | Claude latency (sequential, not parallelized yet) |
| Step 4 (validate) | 8-10s | Nova batch call + rule checks |
| Supervisor | 6-7s | Nova review + 11 article saves + vector indexing |
| **Total end-to-end** | **~6 minutes** | Dominated by Step 3 |

The pipeline is intended to run once per day at 07:00 KST (22:00 UTC previous day) via EventBridge → Step Functions. A single 6-minute run produces all of the day's MBTI content.

### 13.3 Why this is fine

The frontend is a "read mostly" app — users read articles all day, but new articles only get processed once per day. The 6-minute pipeline runs while everyone is asleep.

If we ever need faster turnaround, Step 3 can be parallelized via a Step Functions Map state with `MaxConcurrency=3`, which would cut Step 3 from 5 minutes to ~2 minutes.

---

## 14. Two Collection Paths (Legacy vs Pipeline)

### 14.1 The current state

| Aspect | Legacy `article_collector` | New Step Functions pipeline |
|---|---|---|
| **Status today (2026-04-10)** | Live, in production | Lambdas deployed, state machine not yet provisioned |
| **Trigger** | EventBridge → single Lambda | EventBridge → Step Functions → 6 Lambdas |
| **Filtering** | `ArticleFilterService` (rule + Claude Haiku) | `step1_select` (rule + Nova Lite) |
| **Classification** | Hard-coded `TRANSFORM_PER_CATEGORY` allocation | `step2_classify` allocation + Nova MBTI tagging |
| **Transformation** | `MbtiTransformService` (Claude Haiku) | Same `MbtiTransformService`, called from `step3_transform` |
| **Validation** | None | `step4_validate` (rule + Nova) |
| **Cross-version review** | None | `supervisor` (Nova) |
| **Storage** | Direct DynamoDB write (no S3 split) | Split storage via `_to_storage_format` |
| **Vector indexing** | None | OpenSearch + pgvector (non-fatal) |
| **Observability** | Single Lambda log stream | 6 Lambda log streams + Step Functions execution history |

### 14.2 Why both exist

The migration is **gradual and non-destructive**. The new pipeline is fully written and tested at the Lambda level, but flipping the switch requires:

1. Provisioning the Step Functions state machine (deferred — needs IAM role + state machine JSON)
2. Updating the EventBridge schedule to target Step Functions instead of `article_collector`
3. Optionally provisioning OpenSearch + RDS pgvector for vector indexing
4. Backfilling historical articles into split storage (existing articles still have body in DynamoDB)

Until that's done, `article_collector` keeps the lights on. After the cutover, `article_collector` becomes a fallback for manual one-off runs.

### 14.3 The shared substrate

Both paths share:
- The same `S3XMLClient` (so they read the same XML files)
- The same `DynamoDBClient` (which now supports both legacy and split storage)
- The same `MbtiTransformService` (and the same prompt files)
- The same `ArticleFilterService` rule logic (the pipeline reimplements `_quick_filter` inline but the rules are identical)
- The same Article DB schema (the pipeline writes the new `s3_body_uri` field; the legacy collector doesn't, but reads handle both)

This means a user reading an article today doesn't know or care which path produced it. The frontend `/api/article/{id}` call works identically against both shapes.

---

## Appendix A — File Reference Map

If you need to understand or change a specific behaviour, the canonical file is:

| Behaviour | File | Key symbol |
|---|---|---|
| Read XML from Seoul S3 | `backend/clients/s3_xml_client.py` | `S3XMLClient.get_articles_by_date()` |
| Parse XML into `S3Article` | `backend/clients/s3_xml_client.py:599` | `_parse_article()` |
| Normalize categories | `backend/clients/s3_xml_client.py:31` | `CATEGORY_NORMALIZATION_MAP`, `normalize_category()` |
| Hash content for change detection | `backend/utils/hash_utils.py` | `hash_content()`, `content_changed()` |
| Rule-based filter | `backend/services/article_filter_service.py:84` | `_quick_filter()` |
| AI-based filter (Nova) | `backend/handlers/pipeline/step1_select.py:116` | `_ai_filter_nova()` |
| Per-category allocation | `backend/handlers/article_collector.py:36` | `TRANSFORM_PER_CATEGORY` |
| MBTI classification (Nova) | `backend/handlers/pipeline/step2_classify.py:93` | `_classify_batch_nova()` |
| MBTI transformation (Claude) | `backend/clients/mbti_transform_service.py` | `MbtiTransformService.transform_article()` |
| Combined Claude prompt builder | `backend/clients/mbti_transform_service.py:169` | `_build_combined_prompt()` |
| Per-group prompt files | `backend/prompts/{nt,nf,st,sf}.md` | — |
| Validation checks | `backend/handlers/pipeline/step4_validate.py:88` | `_basic_checks()`, `_ai_validate_batch()` |
| Cross-version supervisor review | `backend/handlers/pipeline/supervisor.py:107` | `_supervisor_review()` |
| Storage format mapping | `backend/handlers/pipeline/supervisor.py:195` | `_to_storage_format()` |
| Split storage (DynamoDB + S3) | `backend/clients/dynamodb_client.py:56` | `DynamoDBClient.get_article()`, `save_article()` |
| S3 body write | `backend/clients/s3_article_client.py` | `S3ArticleClient.put_body()`, `get_body()` |
| Vector indexing | `backend/handlers/pipeline/supervisor.py:325` | `_index_vectors()` |
| Embedding generation | `backend/clients/embedding_client.py` | `EmbeddingClient.embed_text()`, `embed_batch()` |
| OpenSearch indexing | `backend/clients/opensearch_client.py` | `OpenSearchClient.bulk_index_articles()` |
| pgvector indexing | `backend/clients/pgvector_client.py` | `PgVectorClient.insert_article_vector()` |
| `/s3-articles` endpoint | `backend/handlers/s3_articles_handler.py` | `get_articles_list()` |
| `/api/article/{id}` endpoint | `backend/handlers/article_handler.py` | `ArticleHandler.handle_article_detail()` |
| `/api/search` endpoint | `backend/handlers/search_handler.py` | `search_dynamodb_optimized()` |

---

## Appendix B — Real Example: Article ID `2KB2TF5N4Z`

To make this concrete, here's how article `2KB2TF5N4Z` (KB자산운용 청소년 불법도박 캠페인, published 2026-04-10 15:14 KST) would flow through the system:

### B.1 Birth in the newsroom

A 서울경제 reporter publishes the article via the internal CMS at ~15:14 KST.

### B.2 XML drop

Within ~5 minutes, the CMS regenerates `s3://sedaily-news-xml-storage/daily-xml/20260410.xml` with this article appended. The file size grows from 1.4 MB to 1.45 MB.

### B.3 Pipeline trigger (when state machine is live)

EventBridge fires at 22:00 UTC (07:00 KST next morning) → Step Functions starts:

```json
{ "date": "20260410", "source": "schedule" }
```

### B.4 Step 1 — Select

`step1_select.lambda_handler` reads the XML, finds 156 articles, drops 12 deleted ones, runs `_quick_filter`, drops ~35 (short/personnel/breaking), runs Nova on the remaining 109, drops ~8 PR-style ones. **101 articles selected.** Article `2KB2TF5N4Z` (length 484 chars, title doesn't match exclusion patterns) survives.

### B.5 Step 2 — Classify

`step2_classify.lambda_handler` sees 101 articles, applies `ALLOCATION_PER_CATEGORY`:
- 경제: 3 (top 3 by `published_at`)
- IT_과학: 2
- 정치: 1
- 사회: 2
- 문화: 1
- 스포츠: 1
- 국제: 1
- **Total: 11 to classify**

Article `2KB2TF5N4Z` is in 경제 with `published_at = 2026-04-10T15:14:12+09:00`. If it's one of the 3 most recent 경제 articles, it makes the cut. Nova tags it with `["NT", "NF", "ST", "SF"]` (a generic CSR story is interesting to all groups).

### B.6 Step 3 — Transform

`step3_transform.lambda_handler` calls `MbtiTransformService.transform_article()`:

```python
result = await transform_service.transform_article(
    title="김영성 KB자산운용 대표 '청소년 불법도박 근절 캠페인' 동참",
    subtitle="불법도박 위험성 알리고 피해 예방 촉구",
    content="KB자산운용은 김영성 대표이사가 청소년 불법도박 위험성을 알리고...",
    category="경제",
)
```

After ~28 seconds, Claude returns:
```json
{
  "NT": {
    "title": "KB운용 CEO의 캠페인 참여, 자산운용업계의 ESG 메시지인가",
    "body": "## 핵심 논점\n금융사 CEO 개인의 캠페인 참여가 의미하는 구조적 신호..."
  },
  "NF": {
    "title": "한 사람의 손짓이 시작한 작은 변화",
    "body": "캠페인은 종종 거창하게 시작되지만, 진짜 변화는 한 사람의 선택에서 비롯된다..."
  },
  "ST": {
    "title": "KB자산운용 CEO 캠페인 참여 — 핵심 사실 정리",
    "body": "**참여자**: 김영성 KB자산운용 대표\n**캠페인**: 청소년 불법도박 근절 릴레이..."
  },
  "SF": {
    "title": "KB운용 대표가 청소년 도박 캠페인에 참여했대",
    "body": "오늘 KB자산운용 대표님이 좀 의미있는 일을 하셨더라고. 청소년들이..."
  }
}
```

Cost for this article: ~$0.0025. Token usage tracked in `transform_usage`.

### B.7 Step 4 — Validate

Rule checks: 4 versions present, all bodies > 100 chars, all titles different from original. **passed.**
Nova batch validation: no critical issues flagged.
`validation.status = "passed"`.

### B.8 Supervisor

Phase 1 — Nova cross-version review: confirms 4 versions have distinct tones, core fact (KB CEO joined campaign) preserved everywhere. **approved.**

Phase 2 — to_store list includes `2KB2TF5N4Z`.

Phase 3 — `db.save_article(storage_dict)`:
1. `S3ArticleClient.put_body('2KB2TF5N4Z', body_data)` writes:
   ```
   s3://sedaily-mbti-article-body-dev/articles/2KB2TF5N4Z/body.json
   ```
2. `dynamodb.Table.put_item({...metadata, s3_body_uri: 's3://.../articles/2KB2TF5N4Z/body.json'})`.

Phase 4 — Embed 5 texts (original + 4 versions), index in OpenSearch + pgvector.

Phase 5 — Append to `collection_log_20260411_070612`.

### B.9 Frontend serves it

When a user opens https://mbti.sedaily.ai on 2026-04-11 morning:

1. Frontend fetches `GET /s3-articles?date=20260410&limit=30`. Article `2KB2TF5N4Z` shows in the list with the standard byline ("윤민혁 기자") and image.
2. User taps the article. Frontend fetches `GET /api/article/2KB2TF5N4Z`.
3. `article_handler.py` calls `db.get_article('2KB2TF5N4Z')`:
   - DynamoDB returns metadata + `s3_body_uri`.
   - `S3ArticleClient.get_body()` fetches the body JSON.
   - The two are merged into a single dict.
4. Frontend reads `article.version_NT` (because the user picked NT editor 김시현) and renders the markdown body.

The user sees the analyst-style version of the article, complete with the KB CSR story reframed as "the structural ESG signal of a financial CEO joining a personal campaign". The original 서울경제 reporter has no idea their wire-style CSR brief just got rewritten as an analyst report — and that's the point.

---

## Appendix C — Glossary

| Term | Meaning |
|---|---|
| **NSID / news_id** | 서울경제's unique article ID, e.g. `2KB2TF5N4Z`. Format: 10 alphanumeric chars. |
| **Action** | XML field marking each article as `I`(nsert), `U`(pdate), or `D`(elete). |
| **MBTI group** | One of NT (analyst), NF (essayist), ST (fact-sheet), SF (friend chat). |
| **Content blocks** | Structured representation of article body that preserves image positions. |
| **Split storage** | Pattern of storing article metadata in DynamoDB and body fields in S3. |
| **`s3_body_uri`** | DynamoDB field pointing at the S3 object holding an article's body fields. Articles without this field are "legacy" and have body fields directly in DynamoDB. |
| **Supervisor** | Final pipeline stage that performs cross-version review, storage, and vector indexing. |
| **Vector failure** | A non-fatal error during OpenSearch or pgvector indexing — collected for observability but never blocks article storage. |
| **Collection log** | DynamoDB record summarising one pipeline run (counts, errors, article-level details). |
| **No-op mode** | A client's behaviour when its backing service is disabled (empty env var). All public methods return empty results without raising. |

---

*This document is intended to be the long-form companion to `CLAUDE.md` (which gives a quick architectural overview) and `FULL_PROJECT_SPEC.md` (which catalogs every file). When in doubt about article handling, this is the document to read first.*

# AI LENS 뉴스피드 아키텍처 명세

> 작성일: 2026-05-13  
> 짝꿍 문서: `content-system.md` (콘텐츠 파이프라인)  
> 본 문서는 **사용자가 사이트에서 보는 뉴스피드 화면의 골격**을 정의

---

## 0. 본질 선언 (오버 엔지니어링 가드)

**V1에서 하는 것은 단 3가지**: 기사 선별 → 변환 → 뉴스레터 형식 노출.

V1에서 **하지 않는 것**:
- 사용자별 개인 랭킹 (Core 3 RecommendAgent)
- 메모리·EWMA·preference embedding (Core 3 Memory Manager)
- 챗봇·대화 (Chat Agent)
- 12명 차별화 (백엔드 프롬프트 분리)
- 텔레그램·오디오·결제

위 기능들은 이미 백엔드에 일부 코드가 존재하지만 **V1 Feed Lambda는 그것들을 호출하지 않는다.** 가설(같은 MBTI 그룹 안 모든 사용자에게 동일 콘텐츠로 충분한가)이 검증되기 전까지 단순 SQL만 사용한다.

---

## 1. 핵심 결정

**안 A 채택 — "오늘의 한 뉴스" 중심 (브리핑형)**

한 화면 = 오늘의 톱 헤드라인 1개. 본인 시각 풀 글 + 다른 3시각 한 줄 미리보기. 그 아래 어제·지난 주 기사 카드 누적.

이유:
- 차별점("같은 뉴스 4시각")이 즉시 노출됨
- 출근길 10분 = 한 화면 한 호흡
- Progressive Disclosure 첫 단계 (호기심 갭으로 다른 시각 클릭 유도)

---

## 2. View vs Data 레이어 분리 원칙

**비전**: V2에서 같은 NT 그룹 안 민철·지훈·서연 3명이 진짜 다른 글을 쓰는 "에디터 N명" 플랫폼으로 확장.

**원칙**:
- **View 레이어** = MBTI 그룹 단위 UI ("NT 시각", "NF 시각" 등) — 사용자 인지에 자연스러움
- **Data 레이어** = `editor_id` 단위 — 같은 MBTI 안 다수 에디터 확장 시 코드 변경 X

```
[Data 모델]
editor_id  →  mbti_group  →  변환된 글
"nt-min"      "NT"           {title, body, ...}
"nt-ji"       "NT"           {title, body, ...}   ← V2에서 추가될 때
"nt-seo"      "NT"           {title, body, ...}   ← V2에서 추가될 때
"nf-ha"       "NF"           {title, body, ...}
...

[V1 상태]
editors 테이블에 active=TRUE인 editor가 MBTI당 1명씩만 (4명 총)
→ View는 "NT 시각" 1개만 노출

[V2 진화]
같은 NT에 editor 3명 active=TRUE
→ View가 "NT 시각" 안에서 에디터 선택 sub-UI 추가
→ 또는 사용자가 명시적으로 1명만 follow
```

---

## 3. 화면 구조 — `/today` 페이지

```
┌─────────────────────────────────────────────────┐
│ [헤더]                                          │
│  AI LENS    [오늘] [지난 호] [내 설정]   [로그인]│
├─────────────────────────────────────────────────┤
│                                                 │
│  KST 2026.05.14 (수)                            │
│                                                 │
│  ─────────  오늘의 한 뉴스  ─────────            │
│                                                 │
│  [원본 헤드라인]                                 │
│  "한국 반도체 수출, 7개월 만에 회복세."          │
│  📰 서울경제 · 정치 · 07:00                      │
│                                                 │
│  [당신의 시각]                                   │
│  ┌─────────────────────────────────────────┐   │
│  │ ●  NT · 김시현 (전략 분석)               │   │
│  │                                          │   │
│  │ "왜 이번엔 다른가" — 부산시장 선거       │   │
│  │ 구조 분석…'해양수도' 전략은 과거와…      │   │
│  │                                          │   │
│  │ ■ 과거 실패의 구조와 이번의 차이점       │   │
│  │ 전 후보의 진단은 명확하다. 역대…         │   │
│  │ (NT 톤 풀 글, scroll)                    │   │
│  │                                          │   │
│  │ ✓ 체크포인트 3개                         │   │
│  │ ✓ ……                                     │   │
│  │ ✓ ……                                     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ─── 다른 시각으로도 읽어볼래요? ───              │
│                                                 │
│  ┌──────────────────┐  ┌──────────────────┐    │
│  │ ●  NF · 하은     │  │ ●  ST · 준서     │    │
│  │ "30년 침체의…    │  │ "결론부터…       │    │
│  │  본질"           │  │  +12% 회복…"     │    │
│  │ [펼치기 →]       │  │ [펼치기 →]       │    │
│  └──────────────────┘  └──────────────────┘    │
│  ┌──────────────────┐                          │
│  │ ●  SF · 소율     │                          │
│  │ "친구야 진짜     │                          │
│  │  신기한 거…"     │                          │
│  │ [펼치기 →]       │                          │
│  └──────────────────┘                          │
│                                                 │
│  ─────────  어제 본 기사  ─────────              │
│                                                 │
│  [어제 기사 카드 5-10개, 본인 시각만 노출]       │
│  [지지난 일자 카드…]                            │
│  ↓ 무한 스크롤 (페이지네이션 또는 lazy)          │
│                                                 │
├─────────────────────────────────────────────────┤
│ [푸터] AI LENS · 서울경제신문 공식              │
└─────────────────────────────────────────────────┘
```

### 인터랙션 명세

1. **로드 시 본인 MBTI 시각이 메인** (로그인 안 했으면 그룹 선택 모달)
2. **"다른 시각으로 읽어볼래요?" 카드 3개** — 클릭 시 인라인 펼침 (현재 본인 시각 위에 덮어쓰기 X. 그 자리에서 펼침)
3. **무한 스크롤** 또는 페이지네이션 — 어제·그제·지난 주 기사 누적
4. **상단 헤더**:
   - [오늘] = `/today` (현재)
   - [지난 호] = `/archive` (날짜별 아카이브)
   - [내 설정] = `/settings` (MBTI 변경, 이메일 변경 등)

### 모바일

```
[헤더 sticky]
─────────
오늘 날짜
─────────
원본 헤드라인 1줄
당신의 시각 카드 (full width)
풀 글 (스크롤)
─────────
다른 시각 (세로 3 stack)
─────────
어제 본 기사 (세로 카드)
```

---

## 4. 컴포넌트 트리

```
src/app/today/page.tsx
└── <TodayPage>
    ├── <DateHeader />                    — 오늘 날짜
    ├── <OriginalHeadline />              — 원본 헤드라인 + 메타
    ├── <PrimaryPerspective />            — 본인 시각 풀 글
    │   ├── <EditorBadge editor={...} /> — 아바타 + 이름 + 그룹
    │   ├── <ArticleTitle />
    │   ├── <ArticleSubtitle />
    │   ├── <ArticleBody />              — Markdown 렌더
    │   ├── <KeyPoints points={[...]} />
    │   └── <ClosingLine />
    ├── <OtherPerspectives>               — 다른 3시각 카드
    │   └── <PerspectiveCard editor={...} /> × 3
    │       ├── <EditorBadge />
    │       ├── <PreviewSnippet />        — title + 한 줄
    │       └── <ExpandButton />          — 클릭 시 인라인 펼침
    ├── <PastArticles>                    — 어제 이전 카드 피드
    │   └── <ArticleCard editor={...} /> × N
    │       └── 본인 시각 카드만, 무한 스크롤
    └── <Footer />
```

**재사용 컴포넌트**:
- `<EditorBadge>` — 어디서나 에디터 아바타+이름 표시 (mini/card/hero size variant)
- `<PerspectiveCard>` — 인라인 펼침 토글 포함
- `<ArticleCard>` — 과거 기사 카드 (요약 + 메타)

---

## 5. 데이터 모델 (editor_id 기반)

### 신규 테이블 — `editors`

```sql
CREATE TABLE editors (
  editor_id      TEXT PRIMARY KEY,        -- 'nt-min', 'nf-ha' 등
  mbti_group     TEXT NOT NULL,           -- 'NT' | 'NF' | 'ST' | 'SF'
  display_name   TEXT NOT NULL,           -- '김시현'
  role           TEXT NOT NULL,           -- '전략 분석 에디터'
  bio_short      TEXT NOT NULL,           -- 한 줄 소개
  avatar_url     TEXT NOT NULL,           -- '/editors/intj.png' 등
  prompt_path    TEXT NOT NULL,           -- 'prompts/transform/nt.md' (V1 동일, V2 분리)
  status         TEXT NOT NULL,           -- 'active' | 'coming_soon' | 'archived'
  priority       INT NOT NULL DEFAULT 0,  -- 같은 그룹 안 우선순위 (V2용)
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- V1 초기 데이터
INSERT INTO editors VALUES
  ('nt-min', 'NT', '김시현', '전략 분석 에디터', '데이터로 본질만 짚어드릴게요',  '/editors/intj.png', 'prompts/transform/nt.md', 'active', 1, NOW()),
  ('nf-ha',  'NF', '박지원', '오피니언 에디터',  '숫자 뒤 사람의 이야기를…',     '/editors/infp.png', 'prompts/transform/nf.md', 'active', 1, NOW()),
  ('st-jun', 'ST', '이정훈', '팩트 큐레이터',   '결론부터, 사실만 정리',         '/editors/istj.png', 'prompts/transform/st.md', 'active', 1, NOW()),
  ('sf-soy', 'SF', '김하은', '트렌드 캐스터',   '친구한테 카톡 보내듯',          '/editors/esfp.png', 'prompts/transform/sf.md', 'active', 1, NOW());
```

### 기존 `article_versions` 테이블 확장 (V2에서)

현재 pgvector `article_versions` 스키마:
```sql
CREATE TABLE article_versions (
  news_id    TEXT,
  mbti_type  TEXT,                  -- 'NT' | 'NF' | 'ST' | 'SF'
  metadata   JSONB,
  embedding  vector(1024),
  UNIQUE(news_id, mbti_type)
);
```

V2 진화 시 `editor_id` 컬럼 추가:
```sql
ALTER TABLE article_versions
  ADD COLUMN editor_id TEXT REFERENCES editors(editor_id);

-- V1에서는 editor_id = MBTI 그룹의 active 1명으로 기본값
UPDATE article_versions SET editor_id =
  CASE mbti_type
    WHEN 'NT' THEN 'nt-min'
    WHEN 'NF' THEN 'nf-ha'
    WHEN 'ST' THEN 'st-jun'
    WHEN 'SF' THEN 'sf-soy'
  END;
```

V2부터 UNIQUE(news_id, editor_id)로 변경 → 같은 NT에 3명 다른 글 가능.

**V1에서는 editor_id 컬럼이 없어도 동작**. 백엔드 Transform이 mbti_type 단위로 저장하고, View가 editor_id 추상화는 정적 매핑(`editors` 테이블)으로 처리. 마이그레이션은 V2 시점에.

---

## 6. API 명세

기존 `/api/v2/feed`를 그대로 활용, 응답에 `editor` 필드만 추가.

### `GET /api/v2/feed`

Request:
```
GET /api/v2/feed
  ?mbti_group=NT              ← 사용자 MBTI (필수)
  &date=2026-05-14            ← 기본: today (선택)
  &include=primary,others     ← primary=본인 시각 풀 / others=다른 3시각 미리보기
  &limit=1                    ← 톱 N개 (기본 1)
```

Response (200):
```json
{
  "date": "2026-05-14",
  "primary": {
    "news_id": "2KCD71F3FN",
    "original": {
      "title": "전재수 \"박형준 부산은 길잃고 방황한 5년…\"",
      "press": "서울경제",
      "category": "정치",
      "published_at": "2026-05-14T07:00:00+09:00",
      "url": "https://sedaily.com/..."
    },
    "editor": {
      "editor_id": "nt-min",
      "mbti_group": "NT",
      "display_name": "김시현",
      "role": "전략 분석 에디터",
      "avatar_url": "/editors/intj.png"
    },
    "version": {
      "title": "부산시장 선거 구조 분석…'해양수도' 전략은…",
      "subtitle": "전재수 후보의 핵심 변수는…",
      "body": "**[기 - 핵심 논점]**\n\n…",
      "key_points": ["…", "…", "…"],
      "closing_line": "관건은 '방향 설정'이 아니라…"
    }
  },
  "others": [
    {
      "editor": { "editor_id": "nf-ha", "mbti_group": "NF", "display_name": "박지원", ... },
      "preview": {
        "title": "'청년들이 부산을 떠나지 않는 도시'…",
        "snippet": "숫자 너머에 있는 질문, 도시는 누구의 삶을…"
      }
    },
    { "editor": { ..."ST"... }, "preview": { ... } },
    { "editor": { ..."SF"... }, "preview": { ... } }
  ]
}
```

### `GET /api/v2/feed/expand`

다른 시각 풀 글 펼칠 때:
```
GET /api/v2/feed/expand
  ?news_id=2KCD71F3FN
  &editor_id=nf-ha
```

Response: `primary.version` 와 동일 구조.

### `GET /api/v2/feed/past`

과거 기사 무한 스크롤:
```
GET /api/v2/feed/past
  ?mbti_group=NT
  &before=2026-05-14
  &cursor=...                 ← 다음 페이지 토큰
  &limit=10
```

Response: `{ items: [...PrimaryShape...], next_cursor: "..." }`

---

## 7. Feed Lambda 단순화 (Core 3 우회)

**현재 Feed Lambda 동작**:
```python
# 추정 — Core 3 호출하는 경로
articles = await pg.list_articles_for_mbti(mbti_group, today)
memory = await memory_manager.load(user_id)        # Core 3
context = await context_broker.build(memory, ...)  # Core 3
ranked = await recommend_agent.rank(articles, context)  # Core 3
return ranked[:limit]
```

**V1 단순화 — Core 3 통째로 우회**:
```python
# 본질만 — 같은 MBTI 그룹의 오늘 톱 1
rows = await pg.execute("""
    SELECT av.news_id, av.metadata, a.metadata AS original_meta
    FROM article_versions av
    JOIN articles a ON av.news_id = a.news_id
    JOIN article_selections sel ON sel.news_id = av.news_id AND sel.mbti_type = av.mbti_type
    WHERE av.mbti_type = $1
      AND DATE(av.created_at AT TIME ZONE 'Asia/Seoul') = $2
    ORDER BY sel.composite_score DESC
    LIMIT 1
""", mbti_group, today)

# others 3개 — 같은 news_id의 다른 MBTI 버전
others = await pg.execute("""
    SELECT mbti_type, metadata
    FROM article_versions
    WHERE news_id = $1 AND mbti_type != $2
""", rows[0]['news_id'], mbti_group)
```

Memory·RecommendAgent 호출 없음. **응답 100ms 이하** 가능 (현재는 Memory 로딩 + 임베딩 유사도 계산으로 더 느림).

V1에서는 이 단순 경로로 시작 → 사용자 100명 모이고 retention 데이터 모이면 V2에서 Core 3 다시 켜기.

---

## 8. V1 → V2 진화 경로

| 차원 | V1 (지금) | V2 (검증 후) |
|------|---------|------------|
| 에디터 수 | MBTI당 1명 (4명) | MBTI당 N명 (확장 가능) |
| 데이터 모델 | `mbti_type` 키 | `editor_id` 키 |
| Feed Lambda | 단순 SQL | Core 3 켜기 (RecommendAgent) |
| 사용자 경험 | 같은 그룹 = 같은 콘텐츠 | 같은 그룹 안 사용자 취향 분기 |
| 화면 | "NT 시각" 1장 | "NT 시각 — 민철" / "지훈" 등 선택 sub-UI |

**중요 — V1 화면이 V2에서 깨지지 않게**:
- 컴포넌트는 `editor` prop을 받음 (V1: 정적 매핑, V2: API에서)
- 백엔드 API 응답에 `editor` 객체가 이미 포함됨 (V1에서도)
- View 측은 데이터가 어디서 오는지 모름 — 잠재적으로 같은 NT 안 3명 에디터가 와도 같은 컴포넌트로 렌더 가능

---

## 9. Out of Scope (V1에서 안 하는 것)

- Core 3 Personalization 호출 (Memory·EWMA·RecommendAgent)
- 챗봇·대화 인터페이스
- 메일 안에서 미리보기 → 사이트 챗봇 연결
- 텔레그램 봇 (V2)
- 오디오 (TTS) (V3)
- 결제·구독 결제 (V3)
- 12명 차별화 백엔드 (V2)
- 정식 도메인 (mbti.sedaily.ai V1은 기존 운영, /today 라우트만 추가)

---

## 10. 구현 단계

| Phase | 작업 | 시간 |
|-------|------|------|
| **Phase 1** | `editors` 테이블 + 4명 시드 데이터 | 30분 |
| **Phase 2** | Feed Lambda `/api/v2/feed` 응답에 `editor` 객체 추가 (단순 매핑) | 1시간 |
| **Phase 3** | `/today` 페이지 + 컴포넌트 (Primary + Others + Past) | 1일 |
| **Phase 4** | `/api/v2/feed/expand` Lambda | 2시간 |
| **Phase 5** | `/api/v2/feed/past` Lambda (무한 스크롤) | 3시간 |
| **Phase 6** | 모바일 반응형 | 반나절 |
| **Phase 7** | OG 카드 (외부 공유) | 30분 |

총 **2-3일 작업**. Core 3 안 부르니까 빠름.

---

## 11. 검증 시나리오

`/today` 페이지 V0 출시 후 보고 싶은 것:

1. **Bounce rate** — 첫 화면에서 30초 안에 이탈하는 비율 (목표 40% 이하)
2. **"다른 시각" 클릭율** — 차별점이 호기심을 자극하는가 (목표 20% 이상)
3. **Past 스크롤 깊이** — 사용자가 과거 기사도 보는가
4. **재방문율** — 1일 후·7일 후 재방문 (목표 25%·10%)

위 데이터가 좋으면 V1 종료 → V2 (Core 3 켜기, 텔레그램 등) 진입.

---

## 12. 참조 파일

- `content-system.md` — 콘텐츠 파이프라인 (Collector·Selector·Transform)
- `backend/v2/handlers/core3_feed.py` — Feed Lambda (단순화 대상)
- `backend/v2/clients/pgvector_v2_client.py` — DB 클라이언트
- `frontend-next/src/app/today/` — `/today` 페이지 구현 위치
- `frontend-next/src/features/news-feed/` — 재사용 컴포넌트 위치

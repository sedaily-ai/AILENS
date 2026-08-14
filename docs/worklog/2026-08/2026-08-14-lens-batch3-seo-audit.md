# 2026-08-14 — 오늘의 시선 3차 배치 업로드 + SEO/GEO/AEO 감사

## 배경

이전 세션에서 만든 `source_url`(원문 인용) 필드와 lens 채널 파이프라인을 이어서, 사용자가 세 번째 카드뉴스 배치("오늘의 시선", 8/14자)를 제공. 동시에 사이트 전체 기술 SEO(canonical/JSON-LD/llms.txt/메타/robots.txt) 상태를 점검해달라는 요청.

## 한 것

### SEO/GEO/AEO 전수 감사
- Explore 에이전트로 `src/app/` 29개 라우트 전수 조사. 대부분(archive, column, trend, issue-talk, lens*, letters*, video*, webtoon*, timeline*, timemachine*, words)은 이전 세션에 이미 canonical+description+JSON-LD 완비 확인.
- 발견된 갭 4곳 수정:
  - `/auth/callback` — 메타데이터 전무('use client'라 직접 export 불가) → 형제 `layout.tsx` 신규, `robots:{index:false,follow:false}`
  - `/letters/view` — 레거시 `?id=` alias, `/letters/[id]`와 중복 콘텐츠 위험 → 기존 static metadata에 `robots:{index:false,follow:true}` 추가
  - `/about` — JSON-LD 없음 → `AboutPage` 타입 + 루트 레이아웃 Organization을 `mainEntity`로 참조하는 JSON-LD 추가
  - `/games`, `/games/play/[slug]` — JSON-LD 없음 → `CollectionPage`+`ItemList`, `VideoGame`+`BreadcrumbList` 추가 (기존 `sitemap.ts`와 동일하게 `GAMES` export를 크로스 페이지 import)
- `robots.txt`(sitemap 2줄, disallow 3개), `public/llms.txt`(기존에 상세히 작성됨) — 이미 정상, 변경 불필요.

### 오늘의 시선 3차 배치 (17장 카드뉴스 → 16건 발행)
- `/Users/yeong-gwang/Downloads/0812의 사본...(23~39).zip` 17개 압축 해제, 표지 슬라이드 해시로 중복 확인(이번 배치는 중복 0건).
- 병렬 Agent 5개로 슬라이드 2~6 전사(슬라이드 1=표지, 7=고정 클로징 무시), JSON 스키마로 반환.
- **데이터 품질 이슈 발견**: story_9와 story_10의 본문(슬라이드 2~6)이 완전히 동일한데, story_9의 표지 헤드라인만 story_8("현대차-삼성 생존동맹")과 중복된 잘못된 값 — 원본 익스포트 자체의 오류로 판단. story_9는 발행 제외, story_10만 채택(헤드라인·본문 정합성 확인됨) → 17건 중 16건만 발행.
- S3 XML(`daily-xml/20260814.xml` 72건 + `20260813.xml` 456건, 총 528건 풀)에 대해 기존 세션에서 검증한 퍼지 타이틀 매칭(토큰 오버랩 0.7 + SequenceMatcher 0.3, 임계값 0.6)으로 `source_url` 자동 매칭 실행.
- 결과: **16건 전원 매칭 성공**(스코어 0.78~1.00, 미매칭 0건) — 이전 배치들보다 매칭률이 훨씬 좋았음(과거 배치는 32건 중 1건 미매칭).
- 표지 슬라이드(`1.png`)를 각각 S3 `sedaily-mbti-cms-media-dev`에 업로드 후 `cover_image_url`로 사용(원문 실사진이 아닌 카드뉴스 표지 유지 — 기존 2개 배치와 시각적 일관성 위해 동일 컨벤션 유지).
- DynamoDB `sedaily-mbti-cms-posts-dev`에 `channels:["lens"]`, `status:"published"`, `publish_date:"2026-08-14"`, `editor_id:"AI LENS"`로 16건 `put_item`.
- 공개 API(`/api/v2/posts?channel=lens`)로 검증: 전체 lens 48건(8/12: 18건, 8/13: 14건, 8/14: 16건), 8/14 배치 16건 전원 `source_url`/`cover_image_url` 정상 반영 확인.

## 결정

- story_9는 원본 데이터 자체 오류(헤드라인-본문 불일치)로 판단해 발행 제외. 추측으로 헤드라인을 고쳐 쓰지 않고 명시적으로 배제하는 쪽을 택함.
- lens 게시물 커버 이미지는 계속 카드뉴스 표지 슬라이드를 사용(원문 기사의 실사진으로 대체하지 않음) — 이전 두 배치와의 시각적 일관성이 사용자가 만든 카드뉴스 브랜딩을 유지하는 데 더 중요하다고 판단.
- 사용자가 개별 첨부한 뉴스 실사진 파일들(`news-p.v1.*`, `rcv.YNA.*`)은 별도로 매칭/사용하지 않음 — S3 XML 매칭으로 이미 원문 URL을 자동 확보했고, 실사진을 커버로 쓰지 않는 기존 컨벤션과도 맞지 않아 불필요하다고 판단.

## 다음

- 코드 변경 없는 순수 데이터 작업(lens 배치)이라 배포 불필요. SEO 갭 수정 4개 파일은 커밋/배포 전 상태 — 사용자가 명시적으로 커밋 지시하면 진행.
- 다음 배치부터도 동일 파이프라인(전사→해시dedup→퍼지매칭→S3업로드→DynamoDB write→API 검증) 재사용 가능.

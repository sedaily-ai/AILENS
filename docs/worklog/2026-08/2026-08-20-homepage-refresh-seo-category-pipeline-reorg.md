# 2026-08-20 홈페이지 "오늘의 이슈" 최신화 + SEO 점검 + 카테고리 신설 + 파이프라인 폴더 재구조화

작성: 영광 + Claude Code
관련: `docs/product/4format-samples/2026-08-11-빵지순례/라운드기록.md`(라운드3
상세), `pipelines/video/`, `pipelines/webtoon/`, `service/frontend/src/app/
(economy)/`, `service/frontend/src/shared/lib/archiveItems.ts`,
`service/backend/handlers/cms_posts_public.py`

같은 날 `2026-08-20-4format-prompt-pipeline-and-lens-editor.md`(admin 프롬프트
CRUD·lens 에디터 개편, 그 뒤 4포맷 프롬프트 개선 라운드 2~3)에서 이어지는
작업이지만, 주제가 "프롬프트 개선"에서 "실제 콘텐츠 발행 + 인프라 정리"로
바뀌어서 새 파일로 남긴다.

## 배경

라운드3(레터·팟캐스트·웹툰·영상 프롬프트 개선)을 마친 뒤, 사용자가 "지금까지
디벨롭된 거 전부"를 실제 서비스 홈페이지에 반영해달라고 요청. 그 과정에서
홈페이지 "오늘의 이슈, 4가지 시선" 카드가 4포맷 전환(2026-08-18) 이전
글(2026-08-14, "쏘카·테슬라")에 멈춰있는 걸 발견 — 이후 SEO 점검, 카테고리
신설까지 이어졌다.

## 한 것

### 1. 라운드3 최종 산출물 — 4포맷 전부 재생성

`docs/product/4format-samples/2026-08-11-빵지순례/라운드기록.md`에 상세
기록. 요약:
- 웹툰 프롬프트 v3→v5: 말풍선 톤(보통/격앙) 분기, narration이 이미지에
  아예 안 보이던 버그 수정(다큐 타이틀 카드로 명시 렌더), **소품(포스터·
  문서) 안 텍스트를 지어내는 문제**(가짜 빵집 이름 3개+가짜 매장 사진을
  통째로 만들어낸 사례) 근본 수정 — STYLE 프롬프트에 "소품 텍스트는
  프롬프트에 명시된 것만" 규칙 추가
- `webtoon-pipeline`(당시 이름)이 DDB의 admin 프롬프트를 실제로 안 읽고
  하드코딩된 옛 버전을 쓰고 있던 근본 문제 발견 → `ddb_prompt.py` 신설로
  해결(아래 §4·§7과 연결)
- 영상 프롬프트 v2→v4: 14F 채널 분석 기반 chart 컷 원문 수치 강제, 전환
  브릿지, 문장 어미 다양성("-습니다" 일변도 금지)

### 2. 홈페이지 "오늘의 이슈" 최신화

`LensPreviewSection.tsx`가 `publish_date`(→`published_at`) 내림차순 최신
5개를 보여주는 순수 정렬 구조라는 걸 확인(고정/피처드 플래그 없음).
실제 서울경제 오늘 기사 2건을 가져와 4포맷 전부 새로 발행:
- "은행권, 예보료 9000억 더낸다...손보업계 3.3배 인상"
- "[단독] 호남 반도체 팹, 2기 더 짓는다"

둘 다 admin API를 안 거치고 DynamoDB에 직접 write(스크립트 방식, 지금까지
이 세션 전체가 그래왔음) — 이 때문에 아래 §3 캐시 문제와 §5 SEO 문제가
연달아 드러났다.

### 3. 캐시 무효화 웹훅 발견

admin이 글을 발행/수정하면 `admin/backend/shared/notify.py`의
`notify_content_changed()`가 `POST https://ailens.sedaily.ai/api/revalidate`
(SSM 파라미터 `/sedaily-mbti/ssr-revalidate-secret`, 헤더 `X-Revalidate-Secret`)
를 호출해 Next.js 캐시 태그(`posts:lens` 등 7개)를 즉시 무효화한다. DynamoDB
직접 write는 이 흐름을 안 타서, 5분 fallback TTL이 찰 때까지 라이브 페이지가
옛 응답을 계속 보여줬다(사용자가 "웹툰 안 올라옴"으로 처음 발견). 이후
모든 직접 write 뒤에는 이 웹훅을 수동으로 호출하는 걸 표준 절차로 삼음:

```bash
SECRET=$(aws ssm get-parameter --name /sedaily-mbti/ssr-revalidate-secret \
  --with-decryption --region us-east-1 --profile yeonggwang \
  --query Parameter.Value --output text)
curl -s -X POST https://ailens.sedaily.ai/api/revalidate \
  -H "Content-Type: application/json" -H "X-Revalidate-Secret: $SECRET" -d '{}'
```

### 4. 웹툰 이미지 크롭 버그

사용자가 "말풍선이 잘려보여요" 리포트. 원인: `LensViewClient.tsx`가 옛
인스타 카드뉴스 규격(4:5 세로, `object-fit: cover`)을 가정하고 있었는데
실제 `pipelines/webtoon`이 만드는 컷은 1536×1024(3:2 가로) — 좌우가 크게
잘려 말풍선(상단·측면에 배치되는 규칙)이 통째로 날아갔다. `aspect-ratio:
4/5` → `3/2`, `object-fit: cover` → `contain`으로 수정, 배포 후 확인.

### 5. git 브랜치 동기화

로컬 main이 origin보다 1개 앞(웹툰 크롭 수정 커밋을 push 안 함) + 2개
뒤(같은 날 머지된 `feat/google-login-button` PR을 로컬이 못 받음) 상태였던
걸 발견. `git pull --rebase origin main` 후 push로 정리. 이후 최신 main
(로그인 버튼 + 크롭 수정 전부 포함)으로 재배포.

### 6. SEO 감사 — cover_image_url 누락

사용자가 "메타태그·디스크립션 다 넣었냐"고 질문 → 실제 코드(`generateMetadata`,
JSON-LD `buildJsonLd`, `sitemap.ts`/`news-sitemap.xml`) 전부 확인. 결론:
**스키마 자체는 admin 정상 발행 흐름과 완전히 동일**(필드 드리프트 없음),
메타 디스크립션(`subtitle`)·JSON-LD·사이트맵 전부 정상 동작. 유일한 실제
누락은 `cover_image_url`이 비어있던 것 — OG/Twitter/JSON-LD 이미지가 사이트
기본 이미지(`default-cover.webp`)로 폴백되고 있었다. 라운드3에서 만든 3개
lens 글(빵지순례·예보료·반도체팹) 전부 웹툰 첫 컷을 커버 이미지로 지정해
해결.

### 7. lens 카테고리 시스템 신설 + "문화" 카테고리 추가

`lens`("4가지 시선") 채널 글에는 애초에 카테고리 필드가 없어서, letters만
보여주는 6개 경제 카테고리 페이지(`/markets` 등)에 lens 글이 전혀 안 떴다.
사용자 선택: "카테고리 페이지에도 lens 글이 뜨게" (letters와 나란히).

- `service/backend/handlers/cms_posts_public.py`의 `_shape_lens`에
  `category` passthrough 추가(letters와 같은 저장 위치
  `body_inline.category`)
- `service/frontend`: `CmsLens`에 `category` 필드, `buildArchiveItems`가
  4번째 인자로 `CmsLens[]`를 받아 `ArchiveItem`으로 매핑(`Kind`에 `'lens'`
  추가), 6개 카테고리 페이지 + `CategoryArchiveClient`(클라이언트 리프레시
  경로)가 `fetchLensPosts()`도 같이 호출
- `admin/frontend`: `LensMode.tsx`에 "카테고리" 선택 필드 신설(PostMode.tsx
  와 동일 패턴) — 지금까지 lens 글은 카테고리를 고를 UI 자체가 없었음
- 기존 3개 글 중 경제 카테고리에 맞는 2개에 값 설정: 반도체팹→산업,
  예보료→금융·정책
- 빵지순례(빵 여행 트렌드)는 6개 경제 카테고리 어디에도 안 맞아서, 사용자
  요청으로 **"문화"를 7번째 카테고리로 신설**(본지 서울경제에도 문화
  섹션이 있음). `economy` 그룹 폴더 안에 있지만 경제 카테고리는 아니라서
  `EconCategoryConfig.metaSuffix`를 추가해 title/JSON-LD 표기만 "경제 뉴스"
  대신 "문화 뉴스"로 분기. 빵지순례를 문화로 분류.

### 8. 리팩토링 — 카테고리 페이지 7개 중복 제거

문화 추가로 거의 동일한 `page.tsx`를 8번째로 복붙할 뻔한 시점에, 7개
페이지가 반복하던 fetch→filter→JSON-LD→렌더 로직을
`shared/lib/economyCategoryPage.tsx` 하나로 추출. 각 `page.tsx`는 이제
slug 하나만 넘기는 5줄짜리 wrapper(`buildEconomyCategoryMetadata(slug)` +
`<EconomyCategoryPage slug={slug} />`).

### 9. 파이프라인 폴더 재구조화

`video-pipeline/`(Node/Remotion), `webtoon-pipeline/`(Python/GPT)가 dev2
루트에 나란히 있던 걸 `pipelines/video/`, `pipelines/webtoon/`으로 상위
폴더에 묶었다 — "같은 4포맷 파이프라인 계열"이라는 게 이름에서 드러나게.
언어·런타임이 완전히 달라 코드는 안 합쳤다(합치면 오히려 지저분해짐,
폴더 네임스페이스만 정리). `pipelines/webtoon/ddb_prompt.py`의 상대경로
(파일시스템 폴백)가 한 단계 깊어진 걸 반영해 `parent.parent` →
`parent.parent.parent`로 수정, 새 위치에서 DDB fetch·폴백 경로 둘 다
재확인 완료.

## 결정

- **3단계(웹툰 이미지 생성) 스타일은 여전히 코드로 유지** — DB에 저장된
  임의 텍스트를 코드처럼 실행하는 건 위험한 패턴이라 판단. 대신 DDB
  프롬프트 문서의 "3단계" 섹션과 코드를 사람이 수동 동기화하기로 하고,
  양쪽에 "고치면 반대쪽도 고칠 것" 경고를 남겨둠(라운드3에서 이미 결정,
  이번에도 유지).
- **"문화" 카테고리는 경제 카테고리와 성격이 다르다는 걸 명시적으로
  구분** — 강제로 6개 안에 욱여넣지 않고 `metaSuffix`로 표기만 분기.
  나중에 정치/사회/스포츠 등 추가 카테고리가 생기면 같은 패턴 재사용
  가능.
- **letters/podcast는 아직 `pipelines/`에 해당하는 영속 코드가 없음** —
  지금까지 이 세션에서 레터·팟캐스트는 매번 스크래치패드 1회성 스크립트로
  생성했다(video/webtoon만 재사용 가능한 코드가 됨). 구조적 비대칭 —
  다음 세션에서 다룰지 결정 필요.

## 다음

- 레터 분량 미달(2000~2800자 목표, 실제 1000자 안팎) — 여전히 미해결,
  문구 강화 2회 시도로도 안 풀림
- 팟캐스트 "여러분 금지" 자가점검이 불안정(라운드마다 통과/위반이 갈림)
  — 사후 자동 검증(정규식 스캔) 파이프라인 검토
- 영상 전환 브릿지가 본론 구간에서 약함, 영상 길이가 목표(60~120초)에
  못 미침(현재 40초대)
- letters/podcast도 video/webtoon처럼 `pipelines/`에 영속 코드로 만들지
  결정
- 4포맷 전환 이전 방식("원인/당사자/실무/숫자")으로 만들어진 다른 lens
  글들이 여전히 남아있음 — 개별 재작업 여부 결정 대기
- 4개 포맷 "독립 완결" vs "브릿지 문구로 연결" 방향 아직 미정

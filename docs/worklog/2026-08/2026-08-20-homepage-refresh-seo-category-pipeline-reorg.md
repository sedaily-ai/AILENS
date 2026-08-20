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

### 10. letters·podcast 영속 파이프라인 신설

사용자가 "레터·팟캐스트도 정리해달라"고 명시 요청 — §9에서 언급한
"letters/podcast는 매번 스크래치패드 1회성 스크립트" 비대칭을 해소.

- `pipelines/letters/pipeline.py` — 기사 → GPT-4o 1회 호출 → 레터 텍스트.
  4포맷 중 가장 단순(webtoon 같은 다단계 없음)
- `pipelines/podcast/pipeline.py` — 기사 → GPT-4o 대본 → AWS Polly
  음성(Seoyeon/generative), webtoon과 같은 resume 관례
- `pipelines/common/` 신설 — `ddb_prompt.py`를 webtoon 전용에서 공용으로
  승격(내용은 원래도 100% 범용이었음, webtoon 이름만 붙어있었을 뿐).
  `openai_client.py`·`text_utils.py` 신설 — 이 세션 내내 스크래치패드
  스크립트마다 매번 새로 썼던 "Secrets Manager에서 키 fetch + GPT
  chat.completions 호출", "GPT가 감싸주는 ``` 코드블록 벗기기"
  보일러플레이트를 뽑아냄
- `pipelines/webtoon/pipeline.py`는 이제 `pipelines/common`의
  `ddb_prompt`를 import(로컬 사본 삭제, `sys.path.insert`로 상대 경로
  연결)
- `pipelines/README.md` 신설 — 4개 폴더 전체를 한눈에 보는 지도, video만
  Node인 이유, video의 "각본 생성" 단계가 아직 영속 코드 없다는 남은
  비대칭을 명시적으로 기록(다음에 볼 것으로 남김)

**검증**: 빵지순례 원문으로 두 파이프라인 다 실제 end-to-end 스모크
테스트 — 레터 텍스트 생성 확인(`pipeline.py smoketest test_article.txt`),
팟캐스트 대본+mp3 생성 확인. webtoon도 새 import 경로에서 DDB fetch
재확인(v#5 정상 로드).

### 11. 형식 선택 UI 문구 정정 — "누구의 눈으로" → "어떤 형식으로"

2026-08-18에 lens 콘텐츠가 "역할 축"(사회초년생·직장인·자영업자·투자자)에서
"형식 축"(레터·웹툰·팟캐스트·영상)으로 확정된 뒤에도, `lensPerspectives.ts`의
`LENS_PERSPECTIVES`(선택 카드가 읽는 UI 메타데이터, `LENS_FORMATS`와 완전히
분리된 별도 배열)는 옛 역할 축 라벨·태그라인·아이콘 그대로였다. 사용자가
실제 발행 글 스크린샷에서 직접 발견(2026-08-20) — "이 뉴스, 누구의 눈으로
볼까요?" 헤더 아래 4개 카드가 실제로는 레터/웹툰/팟캐스트/영상인데 라벨은
여전히 옛 역할명이었다.

수정한 파일:
- `lensPerspectives.ts` — `LENS_PERSPECTIVES` 4개 항목 전면 재작성
  (아이콘 GraduationCap/Briefcase/Store/TrendingUp → BookOpen/Image/
  Headphones/Video, 태그라인도 형식에 맞게)
- `LensViewClient.tsx` — "이 뉴스, 누구의 눈으로 볼까요?" → "이 뉴스, 어떤
  형식으로 볼까요?", `aria-label`도 동일 취지로 수정
- `LensListClient.tsx` — 5곳("네 사람의 눈으로", "사회초년생·직장인·
  자영업자·투자자에게...", "네 사람의 시선" 등) 전부 형식 축 문구로 교체
- `LensPreviewSection.tsx`(홈페이지 위젯), `lens/page.tsx`(메타 description)
  동일 패턴 적용

`npx tsc --noEmit` 통과 확인 후 커밋(`1720ef8`), 배포·라이브 확인.

### 12. 가계대출 웹툰 마무리 — 이미지 모양 오류로 lens 채널 전체 500 사고 → 즉시 수정

§10에서 신설한 파이프라인으로 처음 실제 발행까지 간 "은행 가계대출 기준,
올해만 73번 바꿨다" 기사의 웹툰 8컷 생성이 완료된 뒤, S3 업로드까지는
정상이었으나 DynamoDB에 이미지 URL을 **문자열 배열**로 그대로 넣은 게
문제였다. `service/backend/handlers/cms_posts_public.py`의 `_shape_lens`는
`item.get("images")`의 각 원소를 `img.get("url")`로 접근하는 dict 형태
(`{url, caption}`, webtoon 채널의 `body_inline.images`와 동일 규격)를
기대하므로, 문자열이 들어가자 `AttributeError: 'str' object has no
attribute 'get'`로 **lens 채널 목록/개별 조회 API 전체가 500**을 뱉기
시작했다(이 글 하나가 아니라 `/lens` 전체가 죽음).

CloudWatch Logs(`/aws/lambda/sedaily-mbti-v2-posts-dev`)로 즉시 원인
특정 → 해당 글의 `images`를 `{url, caption}` dict 배열로 재작성 →
`/api/v2/posts?channel=lens` 200 복구 확인 → revalidate 웹훅 호출 →
라이브 페이지("이슈를 찾을 수 없어요" 폴백에서 정상 렌더로) 확인.
같은 실수를 다른 곳에서도 했는지 lens 채널 52건 전체를 스캔해 추가
피해 없음 확인.

**교훈**: DynamoDB 직접 write로 `lenses[].images`를 채울 때는 반드시
`[{"url": ..., "caption": ...}, ...]` 형태를 지킬 것 — webtoon 채널의
`body_inline.images`와 규격이 같다는 걸 매번 확인해야 한다(스크래치패드
스크립트 재사용 시 특히 주의).

### 13. 서치콘솔 점검 + 홈 "최신 뉴스" 그리드에 lens 글 노출

사용자가 Search Console 스크린샷 2장을 공유하며 점검 요청.

- **실적**(3개월 클릭 56·노출 186)에서 상위 검색어가 거의 "ai lens" 브랜드
  검색뿐이고 실제 기사 주제 유입이 없어 처음엔 "색인이 안 됐나" 의심했으나,
  **색인생성 → 페이지** 탭 확인 결과 831건 색인됨(8/10~8/17 사이 거의
  0→800+ 급증, 이 세션의 발행 러시와 정확히 겹침) / 79건 제외 — **색인
  자체는 정상**이라고 진단 정정. 제외 사유 4종을 사용자가 직접 클릭해
  보여줌: `NOINDEX` 태그 제외 16건은 전부 2026-08-07 MBTI 4-페르소나 체계
  폐지 때 삭제된 옛 레터 슬러그(`nt-`/`nf-`/`sf-`/`st-` 접두사)로, `letters/
  [id]/page.tsx`가 `findLetter()`로 CMS에서 못 찾으면 자동으로
  `robots:{index:false}`를 반환하는 안전장치가 정상 작동한 것 — 손댈 필요
  없음. 진짜 남은 병목은 색인이 아니라 **신생 도메인 신뢰도**(순위) —
  기술 SEO는 이미 확인 끝난 상태라 백링크·시간이 실제 레버.

- **홈 "최신 뉴스" 그리드에 lens 노출**: 사용자가 "앞으로 발행되는 글은
  전부 4가지 시선 톤으로 나갈 계획"이라며, 홈 히어로 캐러셀 아래 8칸
  그리드(`LatestGridSection`)에도 lens 콘텐츠가 뜨게 해달라고 요청.
  `buildArchiveItems`는 이미 이 세션 초반(§7, 카테고리 페이지용)에 lens를
  4번째 인자로 받도록 확장돼 있었는데, 홈(`app/page.tsx`)은 여전히
  `buildArchiveItems(letters, [], [])`로 lens를 안 넘기고 있었다 — 한 줄만
  더하면 되는 상태였다.
  - `LENS_HOME_HERO_COUNT`(=5)를 `lensPerspectives.ts`에 신설, 히어로
    캐러셀(`LensPreviewSection`)의 로컬 `MAX_PREVIEW`를 이걸로 교체
  - `app/page.tsx`: `initialLensPosts.slice(LENS_HOME_HERO_COUNT)`만
    그리드에 넘겨 — 히어로가 이미 보여준 최신 5건이 바로 아래 그리드에
    또 뜨는 중복을 막음(NewsFeedTab.tsx의 기존 "같은 이슈 두 번 노출 방지"
    원칙과 동일)
  - 배포 후 라이브 확인: 히어로(8/20·8/14 상위 5건)와 그리드(8/14 나머지)
    겹침 없이 정상 노출

- 조사 도중 letters 채널에 **중복 발행 3건** 발견(이 세션과 무관한 기존
  데이터): "222"(8/8, 테스트성), "SK하이닉스, 19조 베팅..."(8/12),
  "📰 오늘의 1면, 네 개의 렌즈"(8/10·8/11) — 삭제 여부·어느 쪽을 남길지
  사용자 확인 대기 중, 아직 손 안 댐.

### 14. 홈 그리드 lens 제외 개수 버그 수정 (5→1)

§13에서 배포한 직후 사용자가 스크린샷으로 바로 지적: 오늘 새로 만든 lens
3건(가계대출·호남반도체팹·예보료)이 그리드에 하나도 안 보이고 8/14 글만
계속 떠 있었다. 원인은 `LENS_HOME_HERO_COUNT`(=5, 히어로 캐러셀 슬라이드
개수)만큼을 그리드에서 통째로 제외했기 때문 — 하루 신규 lens 발행이
보통 5건 미만이라 사실상 매일 그리드가 하나도 안 쌓이는 구조적 버그였다.

캐러셀은 화살표를 눌러야 2번째 슬라이드부터 보이므로 화면에 항상 동시에
보이는 건 1번째(가장 최신)뿐 — `/lens` 목록 페이지(`LensListClient.tsx`)도
같은 이유로 "가장 새로운 이슈" 히어로엔 딱 1건만 빼고 나머지는 바로
"다른 이슈"에 쌓는 기존 관례가 있었다. 그 관례에 맞춰 그리드 제외 개수를
1로 축소(`app/page.tsx`) — 배포 후 오늘 발행분이 정상적으로 그리드에
쌓이는 것까지 라이브 확인.

### 15. 홈 섹션 배치 개선 — 단어 퀴즈를 히어로 바로 아래로

사용자가 "지식 충족감 + 관심사 빠른 접근"이라는 목적을 명시하며 단어
퀴즈·영상 섹션 위치에 대해 상의. 기존엔 단어 퀴즈가 카테고리 레일 세 짝을
다 지나야 나와서 스크롤 이탈 전에 못 보고 지나치는 사람이 많았을 것 —
퀴즈는 클릭 한 번으로 즉시 지식 충족감을 주는 인터랙션이라 이탈 전에
걸리는 게 핵심이라는 데 합의. `WordsPreviewSection`을 "최신 뉴스"
히어로+그리드 바로 다음(카테고리 레일보다도 위)으로 이동. 영상 섹션은
이미 썸네일이 시각적으로 스캔되기 쉬운 포맷이라 원래 자리 유지.

상단 배너 캐러셀(사주·웹툰 파일럿 이벤트)을 퀵 액세스 타일 형태로
바꾸는 방향도 논의만 하고 보류 — 캐러셀은 슬라이드 2·3번이 화살표를
눌러야 보여 "빠른 접근"과 상극이라는 데는 합의했지만, 새 배너 형태
시안은 아직 안 만듦(다음 세션 후보).

### 16. 오늘 발행한 lens 3건 — 원문 링크·실사진 보강

사용자가 "썸네일이 웹툰으로 되어있는데 실제 기사 사진 없나요?" 질문 —
확인해보니 오늘 만든 3건(가계대출·호남반도체팹·예보료) 전부
`photo_image_url`(텍스트 없는 순수 기사 사진 전용 필드)이 비어 `cover_
image_url`(웹툰 1컷)로 폴백돼 썸네일이 전부 웹툰 그림이었다.

- 예보료: `source_url`이 이미 있어서 WebFetch로 본지 og:image를 찾아
  S3(`lens-yebo-photo.jpg`)에 옮겨 `photo_image_url`에 연결
- 가계대출·호남반도체팹: `source_url` 자체가 비어있어 사진을 못 찾다가,
  사용자가 원문 링크 2개(`sedaily.com/article/20081487`,
  `.../20081486`)와 실제 사진 파일 2장을 직접 제공 — WebFetch로 헤드라인
  대조해 어느 URL이 어느 글인지 확인 후 S3 업로드
  (`lens-loan-photo.jpg`/`lens-fab-photo.jpg`) + `source_url`·
  `photo_image_url` 둘 다 채움

### 17. source_url 전체 채널 감사 + letters 백필 시도(대부분 실패)

"원본 url은 잘 넣고 있나요?" 질문에 전체 채널 스캔: **lens 48/52(92%)**
는 잘 들어가 있는데 **letters 0/64, trend_card 0/4, webtoon 0/25,
video 0/11 전부 0%**. admin 편집 화면(`PostMode.tsx`)에 원문 URL
입력란 자체는 있는데 letters는 한 번도 채워진 적이 없다는 뜻 — JSON-LD의
`citation` 필드가 이 값이 있을 때만 붙어서 지금 letters 전부 근거 링크가
빠진 상태.

`sedaily-mbti-articles-dev`(DynamoDB, 23,550건 — title_ko/url/images
전부 있는 실제 뉴스 메타데이터 저장소, 사용자가 "s3에 뉴스 데이터
있으니"로 지칭)를 이용해 letters 64건을 날짜±1일 범위 + 제목/부제/
첫문단 키워드 겹침 점수로 자동 매칭 시도. **결과: 고신뢰 매칭 2건,
중간 3건, 실패 59건** — 그마저도 "고신뢰"는 대부분 "222"·"ㅁㅇㅁㅇ2"
같은 테스트성 제목이 우연히 겹친 노이즈였다(후보 기사 풀에
"[통합테스트] ... test_integ_..." 같은 테스트 픽스처 데이터가 섞여
있는 것도 발견 — 원본 테이블 자체의 데이터 정리 필요, 이번엔 손 안 댐).

**근본 원인**: letters 64건 대부분(예: "대통령이 연준 의장을 흔들자...",
"미국 M7이 주춤한 사이, 중국 T10이...")은 특정 기사 하나를 재구성한 게
아니라 여러 시장 흐름을 엮은 AI 합성 매크로 서사라, 애초에 "원문 기사
1개"라는 개념이 없다. 반면 오늘 lens 4형식 글들은 서울경제 기사 원문
1건을 그대로 쓰는 방식이라 source_url이 명확 — lens 92% vs letters 0%가
콘텐츠 성격 차이였다는 결론. 잘못된 링크를 억지로 붙이는 게 안 붙이는
것보다 나쁘다고 판단해 **letters 백필은 포기**, 기존 letters는 "원문
없는 합성 콘텐츠"로 그대로 둔다.

### 18. "문화" 카테고리를 홈 카테고리 레일에 추가

"문화 카테고리 메인 페이지에 걸어놨느냐" 질문 — 확인해보니 상단 nav·
푸터·자기 카테고리 페이지(`/culture`)엔 있는데 **홈 화면 중간 카테고리
레일(증시/부동산, 산업/금융정책, 국제/재테크 3줄 짝짓기)에서만 빠져
있었다**. §7에서 문화를 7번째로 신설할 때 경제 카테고리 6개(3짝)를 이미
다 채운 뒤라 `CATEGORY_PAIRS` 배열에 넣을 자리가 없었던 것.

파트너가 없으니 `CategoryPairRow`가 slug 1~2개를 모두 받도록 확장하고
(`configs[1]`이 없으면 2번째 칸을 안 그림), 문화만 단독 1개짜리 줄로
카테고리 레일 맨 끝에 추가. 콘텐츠가 없는 날은 기존처럼 자동으로 숨음.
라이브에서 빵지순례(유일한 문화 카테고리 lens 글)가 이 줄에 뜨는 것까지
확인.

### 19. 웹툰·영상 섹션에도 lens 서브포맷 소스 연결

"영상 섹션과 웹툰 섹션에도 저희가 올린 시선쪽 소스를 써서 쌓이게
해주세요" — §14의 그리드와 같은 문제가 이 두 섹션에도 있었다: webtoon/
video 채널은 원래 독립 발행 채널이라, 콘텐츠가 전부 lens 4포맷으로
넘어가면 이 두 섹션도 letters처럼 낡은 채 남을 상황이었다.

- `shared/lib/lensMediaFeed.ts` 신설 — `lens.lenses[]`의 웹툰(index 1,
  `LENS_FORMATS` 고정 순서 기준)·영상(index 3) 서브포맷을 각각
  `CmsWebtoon`/`CmsVideo` 모양으로 변환하는 순수 함수 + date desc 병합
  헬퍼
- `CmsWebtoon`/`CmsVideo`에 선택적 `href` 필드 추가 — lens 파생 카드는
  `/webtoon/{id}`·`/video/{id}`(해당 채널 전용 상세, lens id로는 404)
  대신 `/lens/{id}?v=2`·`?v=4`로 링크
- **`VideoPreviewSection`에서 재생 버그 하나 미리 잡음**: lens 영상은
  YouTube/네이버TV 임베드가 아니라 S3에 올린 mp4 원본 파일이라
  `resolveVideo()`(URL 패턴 기반 판별)가 못 읽는다 — 그대로 뒀으면
  재생 버튼을 눌러도 아무 반응이 없었을 것. `<iframe>` 대신 `<video>`
  태그로 재생하는 "직접 파일" 분기를 추가(lens 전용이 아니라 범용 —
  나중에 다른 직접 파일 URL이 들어와도 재생됨)
- 두 섹션 다 `initialLensPosts` prop 추가, `NewsFeedTab.tsx`가 이미 갖고
  있던 값을 그대로 전달. 배포 후 라이브에서 두 섹션 모두 오늘 발행분
  3건이 정상적으로 쌓이는 것 확인.

이후 8개 커밋 `git push origin main` 완료.

### 20. GEO/AEO/SEO 리서치 — FAQ 리치 스니펫 폐지 확인 + llms.txt 정정 + "30초 핵심" 실데이터화

"어떻게 하면 구글·AI 답변엔진에 더 잘 걸릴까" 질문에 리서치부터 진행.

- **중요 발견**: 구글이 2026년 5월부로 **FAQ 리치 스니펫 기능을 완전히
  폐지**(2023년엔 정부·의료 사이트로 좁혔다가 이번엔 전면 종료, 6월엔
  Search Console 리포트·Rich Results Test 지원까지 제거). 즉 "정식
  FAQPage 스키마를 갖추자"는 방향은 지금 시점엔 죽은 목표 — 이전에
  제안했던 우선순위를 이 리서치로 정정.
- 대신 구글 공식 입장: AI Overviews/AI Mode는 특정 스키마를 요구하지
  않는다. 실제로 유효한 건 엔티티 명확성 + **인용하기 쉬운 본문 구조**
  (요약·리스트·통계가 명확히 나뉜 페이지가 AI 답변 노출이 높다는
  리서치 결과).
- **llms.txt 정정**: AI 크롤러용 사이트 안내 파일이 아직 옛 lens
  설명("원인·사람·내 일·숫자" 4갈래 축)과 옛 웹툰 설명("흑백 펜화
  컷" — 실제론 컬러 일러스트)을 그대로 갖고 있었다. UI 문구는 §11에서
  고쳤는데 이 파일만 놓쳤던 것 — lens를 4형식으로, 웹툰을 컬러
  일러스트로 정정, 문화 카테고리도 목록에 추가.
- **"30초 핵심" 실데이터화**: `LensViewClient.tsx`에 `articleSummarySample`
  이라는 함수가 있었는데, 데모 기사 하나에만 하드코딩된 오버라이드라
  실제 발행 글에는 전혀 안 떴다. `coreSummaryBullets()`로 교체해
  `lens.lenses[]`의 불릿(팟캐스트 우선 → 영상 → 웹툰 → 레터 순 폴백)을
  모든 lens 글에서 보여주게 함 — 요약 문단 바로 아래, 형식 선택 탭보다
  위에 위치, `data-speakable="summary"`를 붙여 리드 문단과 함께 "인용
  하기 쉬운 요약 블록"으로 묶음.
- **부수 논의**: JSON-LD의 `mainEntity` Q&A가 진짜 다양한 질문이 아니라
  포맷별 "훅 문장" 4개(사실상 같은 질문의 다른 말투)라는 지적 — 렌더링
  단이 아니라 콘텐츠 생성 프롬프트 단에서 고쳐야 할 문제라 다음 프롬프트
  개선 라운드로 미룸(아래 "다음" 참고).

### 21. 영상 섹션 위치·재생 UX 전면 개편 (여러 라운드)

"영상이 재밌는 콘텐츠인데 맨 아래 있으니 애매하다"로 시작해 여러
라운드를 거쳐 재생 경험 자체를 다시 설계했다.

1. **위치 이동**: 카테고리 레일 3줄을 다 지나 맨 밑바닥(문화 다음)에
   있던 영상 섹션을 웹툰 섹션 바로 옆으로 이동 — 둘 다 "재밌게 훑는
   비주얼 콘텐츠"라는 같은 성격.
2. **재생 버튼 디자인 3연속 수정**: (a) 가운데 큰 흰 원 + accent 컬러
   글로우 링 → "촌스럽다" 피드백 → (b) 우상단 작은(30px) 플랫 아이콘으로
   축소 → 최종적으로 (c) 카드 전체가 클릭 영역이 되면서 평소엔 숨어있다
   호버 시에만 페이드인하는 가운데 글래스모피즘 아이콘으로.
3. **인라인 재생 → 모달**: "여기서 재생되면 작아 보인다, 모달로 커지면
   안 되냐" 요청으로 `VideoLightbox` 신설(`ArchiveCalendarModal.tsx`와
   같은 관례). **실사용 버그 발견·수정**: 처음 배포한 모달이 헤더·하단
   오디오 플레이어를 안 가리고 영상도 화면에 안 보이는 문제가 있었다 —
   원인은 `FeedPage.tsx`의 탭 전환 애니메이션(`.tab-fade-in`)이
   `animation-fill-mode: both`로 콘텐츠 래퍼에 `transform:
   translateY(0)`을 영구히 남겨두는데, transform이 있는 조상은(값이
   0이어도) `position:fixed` 자손의 containing block이 되어버려 모달이
   뷰포트가 아니라 그 래퍼(문서 전체 높이) 기준으로 계산되던 것.
   `createPortal`로 `document.body`에 직접 띄우고 z-index도 헤더
   (`z-[100]`)보다 확실히 위(200)로 올려 근본 수정.
4. **영상 프레임 썸네일 백필**: "썸네일이 웹툰/기사 사진 말고 영상
   내부 프레임이어야 한다, 원래 이랬다" — YouTube 채널 영상은
   `resolveVideo()`가 자동으로 프레임 썸네일을 뽑아주는데 lens 파생
   영상(S3 mp4 원본)은 그게 안 돼 기사 사진으로 폴백하고 있었다.
   ffmpeg로 실제 렌더된 mp4에서 프레임을 떠서(타이틀 카드 장면, 2초
   지점) S3에 업로드 + DynamoDB 백필, 백엔드 `_shape_lens`에
   `thumbnail_url` 필드 신설(화이트리스트 통과 안 되고 있었음).
5. **카드 전체 클릭=모달 + 시네마틱 톤 + 2×2 확대**: "재생버튼만 말고
   카드 전체 눌러도 모달 뜨게", "좀 더 시네마틱하게", "영상은 진지하게
   보는 콘텐츠니 2×2로 키워도 될 듯" — 제목 `<Link>`를 없애고 카드
   전체를 덮는 `<button>` 하나로 통일(리다이렉트 완전히 제거), 비네트
   추가, `sm:grid-cols-4` → `grid-cols-2` 고정으로 카드 면적 확대.
6. **`/video` 목록 페이지도 동일하게**: "카테고리 페이지 안에서도 동일한
   모달"이라는 요청으로 `VideoLightbox`를 `features/news-feed`에서
   `shared/ui/VideoLightbox.tsx`로 추출해 홈 섹션과 `/video` 목록
   (`VideoListClient.tsx`) 둘 다 재사용 — 목록 카드의
   `<Link href="/video/{id}">`도 재생 모달을 여는 `<button>`으로 교체.

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
- **홈 섹션들은 전부 "채널 원본 + lens 파생"을 병합해서 보여주는 쪽으로
  방향 확정** — "최신 뉴스" 그리드(§14)·웹툰/영상 섹션(§19)·카테고리
  레일(§18) 전부 같은 패턴. 앞으로 콘텐츠가 100% lens 4포맷으로만
  나가더라도 홈의 각 섹션이 계속 채워지는 구조가 됐다.
- **letters 64건의 source_url 백필은 포기, 대신 발행 시점에 챙기는
  쪽으로** — 잘못된 원문 링크를 붙이는 게 안 붙이는 것보다 나쁘다고
  판단(§17). 기존 letters는 "원문 없는 합성 콘텐츠"로 그대로 두고,
  향후 신규 콘텐츠(주로 lens 4포맷)는 발행 시점에 source_url을 챙기는
  걸 표준 절차로 유지.

## 다음

- 레터 분량 미달(2000~2800자 목표, 실제 1000자 안팎) — 여전히 미해결,
  문구 강화 2회 시도로도 안 풀림
- 팟캐스트 "여러분 금지" 자가점검이 불안정(라운드마다 통과/위반이 갈림)
  — 사후 자동 검증(정규식 스캔) 파이프라인 검토
- 영상 전환 브릿지가 본론 구간에서 약함, 영상 길이가 목표(60~120초)에
  못 미침(현재 40초대)
- ~~letters/podcast도 video/webtoon처럼 `pipelines/`에 영속 코드로 만들지
  결정~~ → 같은 날 처리 완료. `pipelines/letters/`, `pipelines/podcast/`
  신설(GPT-4o 1회 호출 / GPT-4o+Polly 2단계), `pipelines/common/`으로
  `ddb_prompt.py`(webtoon 전용→공용 승격)·`openai_client.py`·
  `text_utils.py` 뽑아냄. 둘 다 실제 기사로 end-to-end 스모크 테스트
  완료. 남은 비대칭: `pipelines/video/`는 여전히 렌더(2·3단계)만 있고
  "각본 생성"(1단계) 영속 코드가 없음(Node 프로젝트라 Python 스크립트
  넣기 애매해서 보류 — `pipelines/README.md` 참고)
- 4포맷 전환 이전 방식("원인/당사자/실무/숫자")으로 만들어진 다른 lens
  글들이 여전히 남아있음 — 개별 재작업 여부 결정 대기
- 4개 포맷 "독립 완결" vs "브릿지 문구로 연결" 방향 아직 미정
- `sedaily-mbti-articles-dev` 테이블에 "[통합테스트] ... test_integ_..."
  같은 테스트 픽스처 데이터가 실 데이터와 섞여있는 게 §17 조사 중 발견됨
  — 이번엔 손 안 댐, 다음에 정리 여부 결정
- 상단 배너 캐러셀(사주·웹툰 파일럿)을 퀵 액세스 타일 형태로 바꾸는 안
  — §15에서 방향엔 합의했지만 시안은 아직 없음
- letters 중 "삼성 HBM 계약의 비밀…가격 떨어져도 방어한다"(2026-08-04)
  가 "1등 삼성의 초격차 협상력…" 기사와 부분 매칭(점수 0.397, §17) —
  확신할 정도는 아니라 자동 반영 안 함, 수동 재확인하면 source_url
  채울 수 있는 후보
- **letters 채널 자체를 없앨지 여부 — 확인 대기**(§20 이후 사용자가
  "레터 채널 없애자고 한 거 아닌가?"로 질문). 명시적으로 결정된 적은
  없다고 답변만 하고 넘어감 — "신규 발행은 lens로만" 방향은 맞지만
  `/letters/{slug}`·카테고리 페이지·RSS에 물려있는 기존 인프라를
  실제로 걷어낼지는 별도 확인 필요
- 코어 웹 바이탈 미점검 — GSC가 "90일 사용 데이터 부족"(신생/저트래픽
  사이트라 정상, 버그 아님)이라 PageSpeed Insights로 봐야 하는데
  공개 API 쿼터 초과·페이지 자체는 JS 비동기라 이쪽에서 확인 불가.
  사용자가 직접 PSI 버튼 눌러서 점수 스크린샷 주면 해석 대기
- JSON-LD `mainEntity` Q&A가 포맷별 "훅 문장" 4개라 실질적으로 같은
  질문의 다른 말투임(§20) — 다음 4포맷 프롬프트 개선 라운드에서
  "진짜 다른 질문 2~4개"를 별도로 뽑는 단계 추가 검토
- 웹툰 이미지 원가 절감(컷 수↓, quality tier↓)은 사용자가 명시적으로
  거부 — "컷 수 줄이는 건 안 합니다" 확인 완료, 더 이상 제안하지 않음

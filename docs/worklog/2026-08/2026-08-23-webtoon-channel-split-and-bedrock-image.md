# 2026-08-23 웹툰 이미지 생성 Bedrock 전환 + 웹툰 독립 채널 분리 + 발행 시각 표기

작성: Claude Code
관련: pipelines/webtoon, pipelines/mustknow_auto, pipelines/frontpage_auto,
service/frontend/src/features/news-feed, service/backend/handlers/cms_posts_public.py

## 배경

같은 날 앞선 worklog(`2026-08-23-mustknow-auto-monitoring-bugfixes.md`)에서
고친 seen 마킹 버그를 검증하려고 파이프라인을 수동 재실행하던 중, 완전히
새로운 장애를 발견했다 — OpenAI 조직 크레딧이 소진(`insufficient_quota`)돼
웹툰 3단계(이미지 생성, GPT-5.5)가 전부 실패. 이후 사용자와 발행 시각 표기,
카테고리 레일 레이아웃, 웹툰 도달 경로까지 이어서 손봤다.

## 한 것

### 1. 웹툰 이미지 생성 — Bedrock으로 우회 전환
- Nova Canvas(us-east-1): 계정에서 "Legacy + 30일 미사용"으로 막혀 있고,
  Bedrock 콘솔 "Model access" 페이지 자체가 폐지돼(서버리스 모델 자동
  활성화 정책으로 전환) 셀프서비스 재요청 경로도 없음 — 포기.
- us-west-2에서 살아있는 진짜 text-to-image 모델 확인:
  `stability.sd3-5-large-v1:0`, `stability.stable-image-core-v1:1`,
  `stable-image-ultra-v1:1`. 실측: Nova Canvas·SD3.5 Large·Stable Image
  Core 셋 다 확산 모델 계열이라 "가계대출 규제 강화" 같은 한글을 요청해도
  의미 없는 한글 비슷한 글자만 그림 — Bedrock 이미지 모델로는 텍스트
  정확도를 못 잡는다는 걸 실제 생성 이미지로 확인.
- 그래서 배경/텍스트를 분리: `pipelines/webtoon/pipeline.py`에
  `IMAGE_PROVIDER`(기본 "bedrock") 플래그 추가, Bedrock 경로는
  `build_background_prompt()`(스타일+장면만, 텍스트 없는 그림 명시적으로
  요청)로 배경만 `stability.stable-image-core-v1:1`(us-west-2)에서 생성하고,
  `pipelines/webtoon/compose_text.py`(신규)가 PIL + 번들 폰트
  (`assets/NotoSansKR-Bold.ttf`, Google Fonts에서 받음)로 말풍선/캡션/
  내레이션을 코드로 직접 그려 합성 — 텍스트 정확도 100% 보장. 대신 화자
  위치 데이터가 없어(1·2단계 JSON에 x/y 없음) 말풍선 배치는 좌→우 순서
  단순 배치로 타협(GPT의 "입 정확히 가리키기"는 못 함).
- GPT 경로(`generate_image`/`build_image_prompt`)는 전혀 안 건드리고
  그대로 둠 — `IMAGE_PROVIDER="openai"`로 바꾸면 크레딧 충전 후 즉시 원복.
- IAM: mustknow_auto/frontpage_auto 태스크 롤에 us-west-2
  `stability.stable-image-core-v1:1` InvokeModel 권한 추가.
- 실제 Fargate 재실행으로 검증 — 오늘 막혔던 두 기사(20082215/20082229)
  모두 8컷 웹툰 정상 생성 + 발행 완료(published:2, failed:0).

### 2. 발행 시각(시:분) 표기
- 백엔드 `_shape_lens()`가 `published_at`(발행 완료 시각, mustknow_auto/
  frontpage_auto가 이미 기록 중이던 필드)을 응답에 추가.
- `shared/lib/date.ts`에 `kstDateTimeLabel()` 추가 — UTC→KST
  "YYYY.MM.DD HH:MM" 변환, 없으면 null(호출부가 날짜만 폴백).
- 반영: lens 상세("입력"), 다른 시선 목록, 홈 "네 형식" 미리보기, `/lens`
  목록 히어로, 최신 뉴스 그리드(lens 항목만), 카테고리 레일
  (`CategoryFeatureSection.tsx` — 자체 `dateLabel`을 따로 갖고 있어서
  `ArticleCard.tsx` 수정이 자동 반영이 안 됐던 것도 확인해서 같이 고침).
- `/lens` 목록의 날짜별 묶음 제목(`formatDateHeading`)은 "행마다 시간
  찍으면 노이즈"라는 기존 설계 코멘트가 있어 이번 범위에서 제외.

### 3. 카테고리 레일 narrow 쪽 빈 공간
- 증시/산업/국제(wide) + 부동산/금융·정책/재테크(narrow) 페어 레이아웃에서
  narrow 쪽이 히어로 카드 1개만 있고 그 아래가 통째로 비어 있었다
  (2026-08-17 최초 구현부터, `listItems = span==='wide' ? rest.slice(0,2)
  : []`). 사용자가 실제 en.sedaily.com 화면(양쪽 다 "히어로+이미지 카드
  1개" 구조)을 근거로 지적 — narrow 쪽에도 두 번째 기사를 `HeroArticle`
  (large=false, 이미지 있는 카드 톤)으로 추가.

### 4. 웹툰 콘텐츠를 독립 채널 글로도 저장
- 사용자 지적: 홈 "이슈를 웹툰으로" 카드를 누르면 렌즈(4유형) 페이지로
  가는데, 웹툰 전용 페이지(`/webtoon/[slug]`, 다크 세로스크롤 뷰어)로
  가면 좋겠다 + "만화방"(`/webtoon` 목록)에 렌즈로 발행된 웹툰이 안
  올라온다.
- 원인: 웹툰 컷이 lens 글의 `body_inline.lenses[1]` 안에만 있어서
  `channel=webtoon` 쿼리(`cms_posts_ddb_client.py`의
  `channel in (i.get("channels") or [])` 필터)에 안 잡혔다.
- `mustknow_auto/run.py`·`frontpage_auto/run.py`의 `_publish()`/
  `process_article()`가 lens 글은 그대로 쓰고, 웹툰 컷이 있으면 webtoon
  채널에도 독립 글을 하나 더 쓰도록 수정 — 슬러그는 `{lens슬러그}-webtoon`
  (slug가 GSI로 유일해야 해서 접미사로 충돌 방지, `_shape_webtoon()` 기존
  스키마 그대로 재사용, 백엔드 코드 변경 없음).
- 기존 lens 글(76건 중 웹툰 있는 28건)은 일회성 백필 스크립트
  (`/private/tmp/.../backfill_webtoon_posts.py`, 세션 스크래치패드 —
  저장소엔 안 남김)로 같은 스키마의 webtoon 글을 소급 생성.
- `WebtoonPreviewSection.tsx`가 2026-08-20부터 lens에서 웹툰을 파생해
  (`buildLensWebtoonItems`) `fetchWebtoons()` 결과와 섞어 보여줬는데, 이제
  real webtoon 채널 글이 전부 커버하므로 그 파생·병합 로직 제거(안
  지우면 오늘부터 같은 기사가 카드 2장으로 중복 표시됨). `NewsFeedTab.tsx`
  의 `initialLensPosts` prop 전달도 같이 정리.
- video 파생 쪽(`buildLensVideoItems`)은 이번 범위 밖 — 아직 독립 채널
  분리 요청이 없었음, 그대로 유지.

### 5. 영상·팟캐스트도 웹툰과 같은 방식으로 독립 채널 분리
- 사용자: "웹툰처럼 영상 부분에 대한 탭도 그렇게 해야 하고, 오디오 부분도
  마찬가지 — 오디오는 팟캐스트 부분 가져오라는 것" (4번 항목의 연장).
- `mustknow_auto`/`frontpage_auto`의 `_publish()`가 영상이 있으면 `video`
  채널에, 팟캐스트가 있으면 `home_player` 채널(`/listen`이 보는 채널)에도
  독립 글을 하나씩 더 씀 — 웹툰과 동일 패턴(슬러그 `-video`/`-podcast`).
- 기존 lens 글(76건) 백필: video 22건, home_player(팟캐스트) 28건.
- `VideoPreviewSection.tsx`도 `buildLensVideoItems` 파생 병합 제거(웹툰과
  같은 이유 — 실제 video 채널 글이 이제 다 커버해서 안 지우면 중복).
  `AudioPreviewSection.tsx`는 원래도 lens를 안 섞고 home_player 채널만
  봐서 코드 변경 없이 데이터만 채워지면 자동 반영.
- 참고: 홈 화면 영상 카드는 2026-08-20 결정으로 클릭 시 페이지 이동이
  아니라 모달 재생(`VideoLightbox`)이라 "누르면 렌즈로 간다"는 문제 자체가
  이미 없었음 — 이번 수정의 실익은 `/video` 목록 페이지 누락 보완과 홈
  카드 중복 제거.

## 결정

- Bedrock 이미지 모델은 텍스트 렌더링을 못 믿어서 "배경만 Bedrock, 텍스트는
  코드"로 역할을 나눴다 — 프롬프트를 아무리 다듬어도 확산 모델의 구조적
  한계라 해결이 안 됨을 실측으로 확인 후 내린 결정.
- 웹툰 독립 채널 분리는 "lens 글 자체를 웹툰 전용으로 바꾸는" 대신 "글을
  하나 더 쓴다"(중복 저장) 방식을 택함 — lens의 4유형 페이지 기능을 안
  건드리고, 기존 `_shape_webtoon`/`WebtoonListClient`/`WebtoonViewClient`
  코드를 전혀 안 고치는 가장 낮은 리스크의 경로였음.

## 다음

- OpenAI 크레딧이 충전되면 `IMAGE_PROVIDER`를 "openai"로 되돌릴지, 아니면
  비용·품질을 비교해보고 Bedrock을 계속 쓸지 결정 필요.
- 웹툰 채널 백필은 이번에 한 번만 돌렸다 — 혹시 빠진 과거 lens 글이
  있으면 스크립트를 다시 실행하면 됨(재실행 안전, 이미 있는 슬러그는
  건너뜀).

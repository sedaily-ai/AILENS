# 2026-08-21 GV90 4포맷 실발행 + 지면 순서 정정 + 홈 오디오 섹션 신설

작성: 영광 + Claude Code
관련: `pipelines/letters`, `pipelines/podcast`, `pipelines/webtoon`, `pipelines/video`,
`service/frontend/src/features/news-feed/components/AudioPreviewSection.tsx`,
`service/frontend/src/features/news-feed/components/LensPreviewSection.tsx`,
`service/frontend/src/shared/constants/lensPerspectives.ts`

## 배경

사용자가 정의선 회장 GV90(제네시스 전기 SUV) 서울경제 기사 원문을 붙여넣으며
"이걸로 콘텐츠 만들어주세요. 전체 지면 1면 3번째 기사입니다. 은행 가계대출
기준이 2번째, 호남 반도체가 1번째"라고 요청 — `2026-08-20-homepage-refresh-*`
워크로그에서 이미 발행된 호남반도체·가계대출 2건 뒤를 잇는 실발행. 그런데
실제 라이브 순서를 확인해보니 두 기존 글의 정렬(publish_date+published_at
내림차순, `cms_posts_ddb_client.py`)이 사용자가 말한 순서와 반대(가계대출이
1번째로 뜨고 있었음)라 이것도 같이 바로잡았다. 이어서 "오디오 섹션도 메인
페이지에 걸어주시죠"(위치: "문화 섹션 위에") 요청까지 같은 세션에서 처리.

## 한 것

### 1. GV90 기사 4포맷 실발행

`pipelines/` 3종 파이썬 파이프라인(`letters`, `podcast`, `webtoon`, 전부
`ddb_prompt.load_prompt()`로 admin이 저장한 최신 프롬프트를 그대로 읽음) +
video는 스크립트 생성(GPT, `pipelines/common` 재사용)과 Remotion 렌더를 직접
연결해 실행:
- 레터: 7문단 생성
- 팟캐스트: 대본 + AWS Polly(Seoyeon/generative) mp3
- 웹툰: 8컷 GPT-5.5 이미지 생성(컷당 ~$0.165, 총 ~$1.32) — 스크립트 1단계
  JSON(`1_script.json`)의 대사/나레이션을 그대로 웹툰 서브아이템의
  `bullets`/`images[].caption`으로 재사용(`update_fab_webtoon.py` 패턴 재사용)
- 영상: video 프롬프트(v4)로 9컷 각본 JSON 생성 → Remotion 렌더
  (`npm run render`, `ko-KR-Chirp3-HD-Kore` Google TTS, 1920×1080)

**막힌 점 2건, 즉시 수정**:
- `pipelines/webtoon/pipeline.py`에 `if __name__ == "__main__":` 블록 자체가
  없다 — CLI로 바로 못 돌리고 `run_fab.py`/`run_loan.py` 같은 별도 러너
  스크립트로 `run_article()`을 직접 import해서 호출해야 한다(README에 안
  적혀있던 함정, 다음에 웹툰 파이프라인 건드릴 때 참고).
- GPT가 만든 video 렌더 JSON이 `highlight`/`closing` 컷에 `data` 필드를
  아예 안 넣어서 zod 스키마 검증(`cuts.N.data: expected object, received
  undefined`)에 걸림 — 빈 객체 `{}`로 채워서 해결. 아이콘 키도 GPT가
  `lucide-car-door`/`lucide-airbag`/`lucide-pot`처럼 화이트리스트
  (`Icon.tsx`)에 없는 임의 이름을 지어내서 `car`/`shield-alert`/`landmark`로
  치환 — 여전히 사람이 한 번 검수해야 하는 지점.

영상 프레임 썸네일은 ffmpeg로 추출(`ffmpeg -ss 2 -frames:v 1`), 전부
`sedaily-mbti-cms-media-dev` S3에 업로드 후 DynamoDB에 `lenses[]` 4개
서브아이템(레터 paragraphs / 웹툰 bullets+images / 팟캐스트 bullets+media_url /
영상 bullets+video_url+thumbnail_url)으로 직접 write(`create_gv90_post.py`,
`create_loan_post.py` 템플릿 재사용). category="산업", cover_image_url=웹툰
1컷.

### 2. 지면 순서 정정

`cms_posts_ddb_client.py`의 `list_published_posts()`가 `(publish_date,
published_at)` 내림차순 정렬임을 확인 — 호남반도체(11:14)보다 가계대출
(12:23)이 늦게 발행돼 사용자가 원하는 순서(호남반도체 1번째)와 반대로
떠 있었다. 세 글의 `published_at`을 명시적으로 재기록해 순서를 강제:
호남반도체 `23:00` > 가계대출 `22:00` > GV90 `21:00`(같은 `publish_date`
`2026-08-20` 내 정렬 키로만 씀, 실제 발행 시각이 아님). `POST
/api/revalidate`로 `posts:lens` 등 8개 태그 무효화 후 실도메인에서
호남반도체→가계대출→GV90 순서 확정 확인.

### 3. 홈 오디오 섹션 신설 (`AudioPreviewSection.tsx`)

`TodayNewsPlayer.tsx`(하단 고정 미니 플레이어)에만 있던 `home_player`
재생목록이 스크롤되는 본문 콘텐츠 목록엔 전혀 안 걸려 있던 걸 보완 —
`/listen` 목록과 같은 `fetchHomePlayerPosts()` 데이터를 홈 피드 섹션으로도
노출. `NewsFeedTab.tsx`의 "문화" 카테고리 레일(`CATEGORY_PAIRS[3]`) 바로
위에 배치(사용자 확인: "문화 섹션 위에 걸면 되겠네요"). `app/page.tsx` →
`FeedPage.tsx` → `NewsFeedTab.tsx` 3단으로 `initialHomePlayerPosts` prop을
새로 하향 전달(다른 홈 섹션들과 동일한 서버 프리페치 패턴).

디자인은 사용자가 워싱턴포스트 오피니언 섹션 스크린샷을 레퍼런스로 제시 —
작은 캡션 줄(포맷·날짜) 위, 굵은 세리프 제목이 시각적 무게중심인 구성 +
얇은 구분선 + 행마다 원형 캐릭터. 다크 배경은 이 서비스의 밝은 톤
(feedback_frontend_design_tone)과 안 맞아 라이트 테마로 유지.

**캐릭터 선택 시행착오**: 처음엔 "캐릭터는 기존거 사용하고"를
TodayNewsPlayer의 헤드폰 쓴 손그림 캐릭터(`ListeningHeadphoneIllustration`,
`HandDrawnIcons.tsx`)로 오인해 그걸 넣었다. 사용자가 다시 스크린샷으로
"엥 이 캐릭터들 말한거요"(/lens 상세 페이지의 형식 선택 카드, 레터/웹툰/
팟캐스트/영상 4개 라인아트)를 짚어 정정 — 실제로는
`lensPerspectives.ts`의 `LENS_PERSPECTIVES[2].illustration`
(`/lens/role-3-owner.png`, "팟캐스트" 시선 라인아트)을 가리킨 것이었다.
새 그림을 만들지 않고 이 기존 PNG를 재사용(`mixBlendMode: multiply`로
흰 배경 위 렌더, `LensViewClient.tsx`와 동일 패턴)했다.

## 결정

- 파이프라인이 만드는 영상 스크립트 JSON은 사람 검수 없이 그대로 렌더에
  넣으면 스키마 위반(빈 `data`)·존재하지 않는 아이콘 키가 나올 수 있다 —
  이번엔 즉석에서 후처리 스크립트로 고쳤지만, video 프롬프트 자체에
  "data는 절대 생략 금지, 아이콘은 화이트리스트 목록에서만" 같은 제약을
  더 명시하는 게 다음 개선 대상(현재는 사람이 매번 확인).
- `published_at`을 "정렬 키"로 명시적으로 재기록하는 방식은 임시방편이다 —
  지면 위치를 매번 이렇게 타임스탬프로 흉내 내는 대신, `display_order`
  필드(현재 lens 채널엔 미사용, home_player만 사용 중)를 lens에도 확장해
  명시적 지면 순서를 저장하는 게 근본 해법일 수 있음. 이번엔 급한 대로
  기존 정렬 로직 안에서 해결.

## 다음

- video 파이프라인의 "기사 → 각본 JSON" 1단계가 여전히 스크래치패드
  1회성 스크립트다(`pipelines/README.md`에 이미 기록된 남은 비대칭) — 이번
  라운드에서도 다시 같은 패턴을 반복했다. 영속 스크립트로 승격하면서 위
  스키마 검증 실패 케이스를 프롬프트 단에서 막는 작업을 같이 하면 좋다.
- 오디오 섹션은 아직 홈 1곳에만 있다 — `/listen` 목록 페이지와 시각적
  일관성(캐릭터·타이포)을 맞출지는 아직 안 건드림.
- 시그널 지면 탭 콘텐츠 소스 미정(이전 워크로그부터 이어지는 미해결 항목).

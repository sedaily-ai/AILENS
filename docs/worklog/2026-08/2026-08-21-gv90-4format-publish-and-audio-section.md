# 2026-08-21 GV90 4포맷 실발행 + 지면 순서 정정 + 홈 오디오 섹션 신설

작성: 영광 + Claude Code
관련: `pipelines/letters`, `pipelines/podcast`, `pipelines/webtoon`, `pipelines/video`,
`service/frontend/src/features/news-feed/components/AudioPreviewSection.tsx`,
`service/frontend/src/features/news-feed/components/LensPreviewSection.tsx`,
`service/frontend/src/shared/constants/lensPerspectives.ts`,
`service/frontend/src/shared/lib/audioPlayerBus.ts`,
`service/frontend/src/widgets/TodayNewsPlayer/TodayNewsPlayer.tsx`,
`service/backend/handlers/cms_posts_public.py`,
`admin/frontend/src/app/(authenticated)/home-player/page.tsx`,
`service/frontend/src/shared/lib/api/homePlayerApi.ts`,
`service/frontend/src/features/news-feed/components/GamesPreviewSection.tsx`,
`service/frontend/src/shared/data/games.ts`

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

### 4. 트럼프 北핵 기사 4포맷 실발행 (전체 지면 4번째)

같은 흐름으로 두 번째 기사("트럼프 '北 핵무기 57개 보유'…비핵화 언급은
회피") 요청 — "지면 전체의 4번째 기사"로 명시. §1과 완전히 같은 절차
(letters/podcast/webtoon pipeline 3종 + video 스크립트 생성·렌더)를
반복, 이번엔 사용자가 실제 연합뉴스 사진(마스터DB 폴더 경로)을 같이
제공해 S3 업로드 후 `body_inline.photo_image_url`에 지정 — "사진 칸"에
실사진이 뜨는 첫 lens 글이 됐다(`pickLensPhoto()`의 photo_image_url
우선순위 경로 실사용). category="국제". `published_at`을
`2026-08-20T20:00:00+00:00`(GV90의 21:00보다 이름)으로 지정해 4번째
위치 확정. `revalidate` 후 라이브 API로 4개 글 순서(호남반도체→
가계대출→GV90→트럼프北핵)와 photo_image_url 전부 확인.

**막힌 점**: video 스크립트 JSON의 마지막 "엔드카드" 컷이 narration/
caption을 빈 문자열로 만들어 zod 스키마(`min(1)` 문자열)에 걸림 — 이미
`brand` 필드로 브랜드 문구가 별도로 있어 중복인 컷이라 통째로 제거.
§1의 "빈 `data` 객체", "화이트리스트에 없는 아이콘 키" 문제도 동일하게
재발 — 사람이 매번 후처리해야 하는 구간이라는 게 다시 확인됨(다음 항목
참고).

### 5. "지면 특별 코너" 탭 라벨 — "1면" 표기

사용자가 "지면 1면, 증권면 1면, 산업 1면, 시그널 1면 이라고 표기해주시죠"
요청. 처음엔 탭은 짧게(`지면`/`증권면`/`산업면`/`시그널면`) 두고 "1면"은
배지 쪽에만 붙이자고 역제안했으나(배지 텍스트가 `{label} 지면`이라
그대로 넣으면 "증권면 1면 지면"처럼 중복돼 보여서), 사용자가 스크린샷
으로 "지면 1면/증권 1면/산업 1면/시그널 1면"이라고 재확인 — 탭 라벨
자체에 `"OO 1면"`을 그대로 넣는 걸로 확정. 배지·빈 상태 문구는
`{activeSection.label}`을 그대로 쓰도록 바꿔 중복을 없앴다
(`LensPreviewSection.tsx`의 `SECTIONS` 배열 + 배지 2곳 수정).

### 6. 오디오 섹션 재설계 — 3라운드

§3에서 만든 가로 행 리스트형 오디오 섹션에 대해 연속 3회 디자인
피드백이 들어와 그때그때 반영:

1. **가로 리스트 → 세로 카드형**: "오디오 부분... 세로 카드형으로...
   깔끔한 모던 디자인으로 해주세요." 2×2(모바일)/4열(데스크톱) 카드
   그리드로 전환 — 캐릭터를 카드 위쪽 중앙에, 포맷·날짜 캡션과 제목을
   아래로 쌓는 구성. 장식(회전·과한 그림자) 없이 얇은 테두리+은은한
   그림자만 쓰는 톤 유지.
2. **세로 더 길게 + 재생 버튼**: "세로가 좀 더 길게해야하고요 오디오
   느낌나게.. 재생버튼 있으면 더 예쁘지않을까?" — `minHeight`로 카드를
   더 세로로 늘리고, 아바타 오른쪽 아래에 흰 테두리 재생 버튼 배지를
   겹쳐(Spotify/Apple Music류 관례) "재생 가능한 오디오"임을 아이콘만
   으로 알 수 있게 함.
3. **캐릭터 다양화 + 재검토**: "캐릭터들이 다 동일하네? 서로 다르게
   해야하지 않을까요?" — 4장 전부 같은 "팟캐스트" 캐릭터였던 걸
   `lensPerspectiveAt(i)`로 4개 라인아트(레터/웹툰/팟캐스트/영상)를
   카드 인덱스로 순환시켜 해결, 처음엔 캐릭터별 브랜드 색(tint/color)도
   같이 입혔으나 곧바로 "캐릭터는 흑백친구들로 하시죠" 피드백으로 색은
   다시 중립 톤(`#f3f4f6` 아바타 배경 / `#3b82f6` 단일 액센트)으로
   되돌리고 캐릭터 종류만 유지.

### 7. 오디오 카드 재생 버튼 → 하단 플레이어 연동

"재생버튼이나 그런거 클릭하면.. 바 흘러가게 해주시죠... 해당 페이지로
리다이렉트말구." — 카드 재생 버튼 클릭이 `/listen/{id}`로 이동하는
대신 하단 고정 플레이어(`TodayNewsPlayer.tsx`)에서 바로 그 트랙을
재생하도록 변경.

- `shared/lib/audioPlayerBus.ts` 신설 — `AudioPreviewSection`과
  `TodayNewsPlayer`는 트리상 형제(레이아웃 레벨 vs 피드 트리)라 props로
  못 잇는다. Context Provider를 새로 씌우는 대신 `window` `CustomEvent`
  기반 얇은 pub-sub 하나로 연결(`requestPlayHomePlayerItem(id)` /
  `onPlayHomePlayerItemRequest(handler)`).
- `TodayNewsPlayer.tsx`에 `playItemById(id)` 추가 — `setIndex()`가
  비동기 배치라 바로 이어서 `play()`를 부르면 아직 안 바뀐 `current`를
  읽는 경쟁 상태가 생겨서, `autoPlayOnIndexRef` 플래그로 "이 index로
  바뀌면 자동재생해라"만 표시하고 기존 트랙 전환 effect(`[index]`
  의존)가 실제 재생을 맡도록 분기 추가. 이미 선택된 트랙이면(`i ===
  index`) effect가 안 돌아서 바로 `play()` 호출.
- `AudioPreviewSection.tsx`의 재생 배지를 `<a>` 안에 `<button>`을 못
  넣는 문제(중첩 인터랙티브 엘리먼트) 때문에 `role="button"` span +
  `onClick`/`onKeyDown`(Enter/Space)으로 대체, `stopPropagation`으로
  부모 `Link`의 `/listen` 이동을 막는다. 카드의 나머지 영역(아바타·
  제목) 클릭은 기존대로 `/listen` 상세로 이동 — "재생만 바로, 더 읽고
  싶으면 상세로"라는 두 동선을 한 카드 안에 공존시켰다.

### 8. 오디오 카드 재생버튼 확대 + 카테고리 표기

"재생버튼 좀 더... 크게? 직관적으로 해야할 것 같네요"와 "카테고리를
입력하시죠.. 지금 팟캐스트, 영상 이렇게 카테고리가 되었는데"(포맷만
뜨고 실제 내용 분류가 없다는 지적) 두 피드백을 한 라운드로 처리:

- 재생 버튼 배지 26px→36px, 아이콘도 같이 키움.
- `service/backend/handlers/cms_posts_public.py`의
  `_shape_home_player_item`에 `category` 필드 추가 —
  `body_inline.category`(lens/letters와 같은 저장 위치, ECON_CATEGORIES
  값)를 그대로 재사용해 새 필드·새 테이블 없이 해결.
- `admin/frontend`의 "홈 플레이어" 화면(새 항목 추가/기존 항목 수정)에
  카테고리 `CustomSelect` 추가 — `LensMode.tsx`의 카테고리 선택 패턴과
  동일.
- `service/frontend`: `HomePlayerPost` 타입에 `category` 추가,
  `AudioPreviewSection`·`ListenListClient`가 카테고리가 있으면 포맷
  대신 카테고리를 1순위로 보여주도록 변경(`it.category ?? (isAudio ?
  '팟캐스트' : '영상')`).
- 기존 홈 플레이어 항목 5건(가계대출→금융·정책, 호남반도체→산업,
  예보료→금융·정책, Korea Post Halves Household Lending→금융·정책,
  Seoul Adds 100,000 Homes→부동산)에 카테고리 직접 백필.
- 3개 배포(`service/backend`, `admin/frontend`, `service/frontend`) +
  `revalidate` 웹훅 호출 후 라이브에서 36px 재생버튼과 카테고리 라벨
  전부 확인.

### 9. 홈 게임 미리보기 섹션 신설

"게임도 섹션을 추가할까요?"라는 사용자 질문에 — `/games` 페이지·헤더
탭은 이미 있지만 홈 피드 안 미리보기 섹션은 없다는 걸 확인하고, "게임
2종뿐이라 4열 그리드보다 작은 배너형 카드로 가볍게 시작하는 게
어떨까요"라고 역제안. 사용자가 "게임섹션은.. 트렌디한 깔끔 디자인으로
넣어주시져.메인에다가... 웹툰은 트렌디하게 잘 만들어진 것 같은데...
약간 재밌는 게임 느낌나도록"으로 확정 → 실제 게임이 2개뿐이지만 둘 다
플레이 가능한 완성 콘텐츠라 숨길 이유가 없어 배너 1개 대신 카드 2장을
나란히(auto-fit grid) 노출하는 쪽으로 최종 결정.

- `shared/data/games.ts` 신설 — `GamesClient.tsx`(`/games`)에 하드코딩돼
  있던 `Game` 인터페이스·`GAMES` 배열(고양이 이불 덮어주기/내일 신문을
  지켜라!)을 뽑아 `GamesPreviewSection.tsx`와 공유. 새 게임을 추가하면
  두 곳 다 자동 반영.
- `GamesPreviewSection.tsx` 신설 — 사이트 전역의 밝은 에디토리얼 톤과
  의도적으로 다른, `/games` 라우트가 이미 확립한 다크(`#0a0a18`)+네온
  아케이드 톤을 그대로 재사용(게임별 `neon` 색 유리 글로우 테두리,
  `Press_Start_2P` 아케이드 폰트로 "PLAY ▸" 배지, 호버 시 썸네일
  확대+네온 강조). "웹툰은 트렌디한데 게임은 재밌는 느낌으로"라는
  요구를 색·톤 차별화로 반영 — 웹툰(에디토리얼 화이트카드)과 대비되는
  아케이드 톤이 오히려 "여기 게임 있다"는 신호를 더 잘 전달한다고 판단.
- **위치 재조정**: 처음엔 "웹툰·영상 옆(같은 '재밌는 비주얼 콘텐츠'
  블록)"에 넣었으나, 사용자가 "게임 섹션은 맨하단에"로 재요청 —
  카테고리 레일(문화)까지 본문을 다 지난 뒤 만나는 마지막 "쉬어가기"
  자리로 이동(`NewsFeedTab.tsx` 최하단, `HomeSideBar` 앞).
- 배포 후 라이브에서 위치(오디오 섹션 다음, 최하단)와 `/games` 페이지
  정상 동작(공유 데이터 추출 후 리그레션 없음) 확인.

### 10. 지면 특별 코너 첫 방문자용 4형식 가이드 + 조작 흐름 애니메이션

"오늘의 이슈 4가지 시선... 튜토리얼 애니메이션 느낌?? 처음 온 사람들이
이 4가지 시선을 어떻게 봐야하고 왜 그렇게 봐야하고 각 유형은 어떤
내용을 담고있는지 알려주는 용도로요"로 시작 — SVG 단계별 애니메이션은
제작·유지보수 부담이 크고 재방문자에겐 매번 움직이는 게 산만할 수
있다고 역제안, 대신 헤더 ⓘ 버튼(첫 방문 시 localStorage 플래그로 한
번 자동 노출, 이후엔 버튼으로만) + 기존 캐릭터 일러스트·태그라인을
재사용한 정적 4장 가이드로 시작하는 데 사용자 동의.

**3라운드에 걸쳐 요구사항이 구체화됨**:
1. 정적 4장 카드(`LensFormatGuide.tsx`) — 기존
   `LENS_PERSPECTIVES[i].illustration`(형식 선택 카드와 동일 라인아트)
   재사용, `LensPerspective`에 `content` 필드 신설(각 형식에 실제로
   뭐가 담기는지 — tagline이 "언제 고르는가"라면 content는 "고르면 뭘
   보게 되는가").
2. "실제 흐름을 단계로... 동영상처럼 실제 사용자 행동하는게 흐름
   넘어가는게 보이도록 깔끔하고 모션그래픽처럼" — 정적 카드 위에 실제
   카드 UI를 축소 재현한 목업 무대(`LensGuideAnimation.tsx`)를 추가.
   실 마크업을 그대로 끌어오는 대신(반응형 그리드·실 데이터 의존이 커서
   무대 안에서 흔들림) 좌표를 픽셀로 고정한 목업을 새로 그렸다 — 커서가
   `transition: left/top`으로 이동하고, 클릭 지점에 CSS keyframe 링
   (`lz-guide-ripple`)이 터지고, 탭/행이 하이라이트되고, 내용 패널이
   `lz-guide-pop`으로 페이드인.
3. "조금 더 구체적으로 길게... 각 단계들 모두 만들어주시죠" — 1차 버전은
   웹툰 한 형식만 반복 데모했는데, 레터·웹툰·팟캐스트·영상 4형식 전부를
   순서대로 도는 것으로 확장(탭 선택 1단계 + 형식별 select/reveal
   2단계씩 = 총 9단계, `LENS_PERSPECTIVES.flatMap()`으로 생성). 세부
   9단계를 그대로 점으로 찍으면 산만해서, 진행 점은 "탭 + 형식 4개"
   5개로만 묶어 큰 흐름만 보여준다. 단계별 유지 시간도 다르게(탭
   1.5초, 행 선택 1초, 내용 펼침 1.9초) 줘서 클릭 순간은 빠르게, 결과를
   보는 순간은 여유 있게 — `setTimeout` 체인으로 가변 간격 구현(고정
   `setInterval` 대신).

VideoLightbox.tsx와 같은 관례(`createPortal` + `fixed inset-0`) 그대로
따랐다 — 이 세션 초반에 발견한 FeedPage.tsx의 tab-fade-in transform
containing-block 버그를 다시 겪지 않기 위함.

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
  세션에서 GV90·트럼프北핵 2건 다 같은 스키마 문제(빈 `data`, 화이트리스트
  밖 아이콘, 빈 문자열 컷)를 반복했다. 영속 스크립트로 승격하면서 프롬프트
  자체에 이 제약을 명시하거나, 렌더 전 자동 후처리(빈 `data` 채우기·아이콘
  화이트리스트 매핑·빈 컷 제거)를 코드로 넣는 게 다음 우선순위.
- 오디오 섹션은 아직 홈 1곳에만 있다 — `/listen` 목록 페이지와 시각적
  일관성(캐릭터·타이포·재생버튼)을 맞출지는 아직 안 건드림.
- `TodayNewsPlayer`의 `items`(자체 fetch)와 `AudioPreviewSection`의
  `items`(서버 프리페치)가 같은 API를 각자 따로 호출한다 — `playItemById`
  호출 시점에 `TodayNewsPlayer`쪽 fetch가 아직 안 끝났으면(드물지만 가능)
  재생 버튼이 조용히 아무 반응 없다. 로딩 상태 처리는 아직 없음.
- 시그널 지면 탭 콘텐츠 소스 미정(이전 워크로그부터 이어지는 미해결 항목).
- `published_at`을 정렬 키로 수동 재기록하는 방식이 이제 4건째 반복 중
  (호남반도체/가계대출/GV90/트럼프北핵) — 지면 개수가 늘어날수록 매번
  수동 계산이 번거로워진다. `display_order` 필드를 lens 채널에도
  확장하는 근본 해법을 다음에 검토.

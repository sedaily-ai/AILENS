# 2026-08-16 홈 하단 플레이어를 관리자 직접 큐레이션 유튜브 재생목록으로 교체

작성: Claude Code
관련: docs/worklog/2026-08/2026-08-15-saju-process-isolation.md,
service/frontend/src/widgets/TodayNewsPlayer/TodayNewsPlayer.tsx

## 배경

홈 화면 하단 고정 플레이어("오늘의 핵심 뉴스")는 원래 오늘 발행된 레터를 그
자리에서 TTS(Polly)로 읽어주는 기능이었다. 사용자가 "유튜브/네이버TV 링크를
걸어서 그 영상 소리가 재생되게 하고 싶다"고 요청 — 처음엔 "기존 기사에 링크를
붙이는" 방식으로 이해하고 만들었는데, 실제로는 **기사와 완전히 무관하게
관리자가 직접 "제목 + 링크"로 항목을 만들고, 여러 개를 순서대로 재생목록처럼
등록하는 것**이 요구사항이었다(대화 중 확인). 최종적으로 기존 TTS 방식을
완전히 대체하기로 함.

## 시행착오 — 데이터 소스를 두 번 잘못 짚음

1. **1차 시도**: `admin/backend/repo/letters_repo.py`(daily_letters 테이블)에
   `media_embed_url` 필드 추가 + "홈 플레이어" 탭 신설. 배포 후 확인차
   `aws dynamodb scan`을 실제로 돌려보니 **이 테이블이 완전히 빈 테이블**이었다
   — 2026-08-05 자동생성 파이프라인 폐기 이후 아무도 쓰지 않는 죽은
   테이블이었고, `today-letters` API 자체가 프론트 코드 주석
   (`todayLettersApi.ts::fetchTodayLettersLive`)에 "2026-08-04 RDS 삭제로
   영구히 빈 응답만 주는 죽은 경로"라고 이미 적혀 있었다. 실제 홈 화면 콘텐츠는
   `cms_posts` 테이블(관리자 "글 관리" 화면)에서 왔다 — 만들었던 걸 전부
   되돌리고(git diff로 baseline과 완전 일치 확인) 올바른 위치
   (`admin/backend/repo/posts_repo.py`, `service/backend/handlers/
   cms_posts_public.py`)에 다시 붙였다.
2. **2차 시도**: 그 위에 "기존 이슈 톡톡 기사에 링크 첨부" UI를 만들었는데,
   사용자가 "그게 아니라 기사와 무관한 새 항목을 여러 개 만드는 것"이라고
   정정 — 완전히 새로운 방향으로 재설계.

## 한 것 (최종)

- **데이터 모델**: 새 테이블·새 Lambda·새 API 라우트를 안 만들었다. 기존
  `cms_posts` 테이블에 `channels:["home_player"]`로 저장 — 이미 배포된
  admin CRUD(`/admin/posts`)와 공개 조회(`/api/v2/posts?channel=`) 인프라를
  그대로 재사용한다.
  - `admin/backend/repo/posts_repo.py`: `_UPDATABLE`/`_to_dict`/`create()`에
    `media_embed_url`(유튜브 링크), `display_order`(재생 순서, 오름차순)
    추가. `media_embed_url`이 애초에 `create()`엔 안 들어가 있던 것도 이번에
    같이 고쳤다(기존에도 잠재 버그였음).
  - `admin/backend/routes/posts.py`: **별도로 존재하는** 채널 검증 목록
    (`_VALID_CHANNELS`)에 `home_player` 추가 빠뜨렸다가 "unknown channel"
    에러로 사용자가 직접 잡아줌 — `cms_posts_public.py`만 고치고 이건
    놓쳤었다. 세 군데(admin routes, service handler, admin frontend 타입)
    전부 grep으로 재확인.
  - `service/backend/handlers/cms_posts_public.py`: `_shape_home_player_item`
    신설(id/title/media_embed_url/display_order만 반환하는 가벼운 shape),
    `_VALID_CHANNELS`/`_SHAPERS`에 등록.
- **admin/frontend**: `/home-player` 페이지 신설(사이드바 "홈 플레이어" 탭,
  ♪ 아이콘) — 제목+링크+순서 입력 후 "추가"하면 바로 발행 상태로 등록,
  기존 항목은 인라인으로 제목/링크/순서 수정 + 공개·비공개 토글 + 삭제.
  레터 상세 페이지의 "팟캐스트"(PodcastUploadField, mp3 업로드)와는 다른
  기능이라 이름을 분리했다.
- **service/frontend**: `shared/lib/homePlayerApi.ts` 신설
  (`fetchHomePlayerPlaylist`, display_order 오름차순 정렬). `TodayNewsPlayer.tsx`
  전면 재작성 — TTS 합성(`synthesizeSpeech`)·레터 fetch(`fetchFollowingLetters`)
  로직 전부 제거, 유튜브 IFrame Player API만 남김(재생목록에 항목이 없으면
  플레이어 자체가 안 뜬다).

## CloudFront CSP가 유튜브 스크립트를 막고 있던 문제

로컬에서 테스트하고 배포까지 끝냈는데 **프로덕션에서만** 재생 버튼이 안
눌렸다. 원인 추적:

- `ailens.sedaily.ai`가 **CloudFront를 거친다는 걸 이번에 처음 확인**했다
  (그동안 "SSR 전환 이후 EC2+PM2+nginx 직결"로 알고 있었는데, 실제로는
  CloudFront(`E1QS7PY350VHF6`, saju CDN 마운트에도 쓰는 그 배포판) →
  nginx(단순 프록시, 헤더 추가 없음) → PM2 Next.js 순서였다).
- CloudFront에 커스텀 Response Headers Policy(`ailens-security-headers`,
  ID `2ffbcf45-bf62-4b60-9c15-a79569557629`)가 붙어있고, 여기서 CSP를
  주입한다. `script-src`에 `https://www.youtube.com`이 없어서 유튜브 IFrame
  Player API 스크립트(`https://www.youtube.com/iframe_api`) 로딩 자체가
  브라우저에서 차단되고 있었다(`frame-src`엔 이미 youtube.com이 있어서
  헷갈리기 쉬움 — 스크립트 로딩과 iframe 임베드는 CSP상 별개 지시어).
- 이 정책 자체의 수정 이력(`Comment`)을 보니 **2026-08-12에도 같은 이유로
  한 번 고친 적이 있었다**(`frame-src`에 `youtube-nocookie.com` 추가) —
  이번 것도 같은 클래스의 필요라 판단, 사용자 확인 받고
  `aws cloudfront update-response-headers-policy`로 `script-src`에
  `https://www.youtube.com` 추가(나머지 지시어는 전부 그대로). 응답 헤더가
  없는(`no-store`) HTML이라 캐시 무효화 없이 바로 다음 요청부터 반영됨 —
  실제로 즉시 확인됨.

## 결정

- `.env`나 코드가 아니라 **AWS 인프라(CloudFront Response Headers Policy)를
  직접 수정**한 케이스 — 이 레포 어디에도 이 정책의 소스가 없다(콘솔/CLI로만
  관리됨). 다음에 비슷한 "로컬은 되는데 프로덕션만 안 됨" 증상을 보면 CSP부터
  의심할 것.
- `daily_letters`/`today-letters` API 경로는 확정적으로 죽은 시스템이다 —
  앞으로 "오늘 발행된 콘텐츠"류 기능을 만들 때는 처음부터 `cms_posts`
  (`posts_repo.py`/`cms_posts_public.py`) 쪽을 봐야 한다.

## 다음

- `admin/backend/routes/posts.py`의 `_VALID_CHANNELS`와
  `service/backend/handlers/cms_posts_public.py`의 `_VALID_CHANNELS`가
  같은 값을 손으로 두 군데 유지하는 구조라, 이번처럼 한쪽만 고치고 넘어가기
  쉽다 — 공유 상수로 합칠지는 별도 리팩터 논의 필요(지금은 grep으로 매번
  재확인하는 수밖에 없음).
- 홈 플레이어 재생목록이 지금 1개뿐이다 — 여러 개 등록해서 순서 넘김·다음곡
  자동재생(ended 이벤트)까지 실사용 테스트는 아직 안 됨.

# 2026-08-06 홈 피드 리디자인 — 커뮤니티/캘린더 제거, 웹툰·워즈·스타일 신설

작성: Claude Code
관련: 커밋 `9707fd4`(backend), `5a30d7a`(admin), `7abef35`(frontend)

## 배경

이전 세션(작성자 불명 — worklog 없이 진행됨)에서 시작된 대규모 WIP를 이어받아
검증하고 커밋까지 마무리했다. 원래 커밋되지 않은 채 40여 파일이 워킹트리에
쌓여 있었고, plan 문서도 없어 diff와 인라인 코멘트만으로 의도를 재구성해야
했다.

## 한 것

- 빌드(`npm run build`)·백엔드 테스트(`test_cms_posts_public.py`) 통과 확인,
  삭제된 community/calendar 기능에 대한 dangling import 없음을 grep으로 확인.
- 로컬 dev 서버로 신규 라우트(`/webtoon`, `/words`, `/style`, `/letters`) 200
  확인 — 최초엔 Turbopack 캐시 문제로 404였다가 서버 재시작 후 정상.
- 논리적으로 3개 커밋으로 분리 (배포 단위 3개 — backend/admin/frontend — 와
  일치):
  1. `feat(backend)`: `GET /api/archive/popular` 신설(커뮤니티 탭 대체 —
     Kindle Popular Highlights 패턴, 유저 식별 정보 없음), CMS
     webtoon/video 채널 추가.
  2. `feat(admin)`: PostForm에 webtoon(컷 이미지+캡션)·video(임베드 URL) 작성
     모드 추가, 글 목록 필터 정리.
  3. `feat(frontend)`: 커뮤니티·캘린더 탭 전면 제거, `/webtoon`·`/words`·
     `/style`·`/letters` 신설, 헤더 탭 재편(레터 탭이 `/`가 아닌 `/letters`로,
     8개 탭을 core/extra 2단 티어로), 홈 히어로 캐러셀, Pretendard 폰트
     자체 호스팅 전환.
- `git push origin main` → AILENS 반영 완료 (`7abef35`).

## 결정

- 저장소 루트의 `images/`(1~4.png)는 코드에서 참조되지 않아 디자인 참고용으로
  판단, 커밋하지 않고 워킹트리에 그대로 뒀다(untracked).

## 다음

- 헤더에서 뺀 '내 서랍'·'에디터' 탭은 페이지·기능 자체는 살아있음 — 다시
  노출하려면 `headerTabs.ts`에 한 줄만 추가.
- webtoon 콘텐츠는 아직 실제 발행 글이 없다 — admin에서 최소 1건 작성해
  `/webtoon` 목록·상세 흐름을 실데이터로 확인할 것.

## 배포 (같은 날, 이어서)

- `service/backend/deploy.sh api`(archive-dev + v2-posts-dev 포함),
  `service/backend/admin/deploy-admin-api.sh`(`admin/routes/posts.py` 반영),
  `admin/deploy-admin.sh`, `service/frontend/deploy.sh` 4개 전부 실행.
- 배포 후 스모크 체크에서 `GET /api/archive/popular`만 404 — API Gateway에
  이 경로 라우트가 아예 없었다(기존엔 `GET /api/archive`, `POST /api/archive`,
  `POST /api/archive/similar`, `DELETE /api/archive/{archive_id}`만 존재).
  Lambda 코드는 배포됐지만 API Gateway 단계에서 막힌 것 — 사용자 승인 받고
  `GET /api/archive/popular` 라우트를 `sedaily-mbti-archive-dev` 통합
  (`integrations/ppsg0c5`, 기존 `GET /api/archive`와 동일 통합)으로 신규
  생성(`RouteId: 4hd28vl`). OPTIONS 라우트는 안 만들었다 — 프론트 호출이
  커스텀 헤더 없는 단순 GET이라 preflight 자체가 안 뜬다.
- 최종 확인: `ailens.sedaily.ai`/`/webtoon`/`/words`/`/style`/`/letters`
  전부 200, `mbti-admin.sedaily.ai` 200, `/api/v2/today-letters` 200,
  `/api/archive/popular` 200(더미 데모 데이터 8건 — 실제 아카이브 사용자가
  없어 코드 배포 시점 시드 데이터로 추정, 확인 필요), `/api/v2/posts?channel=letters` 200.

## 영상 섹션 리디자인 (같은 날, 후속 요청)

사용자가 경쟁사(UPPITY) 홈 화면 스크린샷을 레퍼런스로 제시 — "채널로 이동"
헤더 링크가 있는 3열 유튜브 그리드 스타일을 원함. 기존
`VideoPreviewSection.tsx`(위 리디자인 커밋에서 이미 신설됨)를 재사용, 구조만
변경:
- 헤더에 `CHANNEL_URL` 우측 링크 추가 — 값이 비어 있으면 링크 자체가
  렌더 안 됨. AI LENS 공식 유튜브 채널이 아직 없어 빈 문자열로 둠(값만
  채우면 자동 노출).
- 그리드를 `minmax(220px,280px)` → `minmax(210px,1fr)`로 조정, 카드 캡션에서
  요약문·날짜 제거하고 제목(2줄, 중앙 정렬)만 남김.
- 영상 소스는 그대로 admin CMS 수동 등록 — YouTube Data API 연동은 범위
  밖으로 확인(사용자 선택).
- 커밋 `ca0a93a`, 배포(`service/frontend/deploy.sh`)까지 완료,
  `ailens.sedaily.ai` 200 확인.
- **주의**: 이 섹션은 발행된 영상이 0건이면 자동으로 숨는다(가짜 썸네일
  금지 원칙 유지) — 지금 프로덕션엔 아직 영상 글이 없어 실제로는 안 보인다.
  admin에서 채널 "영상"으로 글 하나 이상 발행해야 눈으로 확인 가능.

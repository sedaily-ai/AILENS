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
- 배포는 하지 않았다 — 사용자가 "푸시"만 요청, 별도 배포 요청 시 진행.

## 다음

- 프로덕션 배포 필요 시: `service/backend/deploy.sh api`,
  `admin/deploy-admin-api.sh`는 이번 변경과 무관(admin-api Lambda 쪽 변경 없음
  — admin 콘솔 프론트만 바뀜), `admin/deploy-admin.sh`,
  `service/frontend/deploy.sh` 3개.
- 헤더에서 뺀 '내 서랍'·'에디터' 탭은 페이지·기능 자체는 살아있음 — 다시
  노출하려면 `headerTabs.ts`에 한 줄만 추가.
- webtoon 콘텐츠는 아직 실제 발행 글이 없다 — admin에서 최소 1건 작성해
  `/webtoon` 목록·상세 흐름을 실데이터로 확인할 것.

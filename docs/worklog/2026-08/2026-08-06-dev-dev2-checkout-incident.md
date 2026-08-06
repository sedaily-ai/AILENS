# 2026-08-06 dev/dev2 이중 체크아웃 사고 — 원인·복구·재발 방지

작성: Claude Code (dev 체크아웃 세션에서 시작해 dev2로 이관)
관련: `sedaily-ai/AI-LENS`(dev), `sedaily-ai/AILENS`(dev2), 프로덕션 S3/CloudFront/Lambda 전체

## 배경

로컬에 `2_ailens/dev`와 `2_ailens/dev2` 두 개의 체크아웃이 있다. 이번 세션은 `dev`에서
시작됐고, `dev`의 `CLAUDE.md`만 자동으로 읽혔다 — 거기엔 dev2의 존재나 두 체크아웃의
관계가 전혀 안 적혀 있었다. `dev`에서 letters/CMS DynamoDB 마이그레이션 + 프론트
리팩터 작업을 정상적으로 마치고 `git push`까지 했는데, 사용자가 "그 레포 아닌데요"라고
지적하면서 문제가 드러났다.

## 한 것

1. **레포 실사 확인** — `dev`의 origin은 `https://github.com/sedaily-ai/AI-LENS.git`
   (하이픈 있음). 사용자가 지목한 레포는 `https://github.com/sedaily-ai/AILENS.git`
   (하이픈 없음). `git merge-base main ailens-check/main` 결과 **공통 조상이 아예 없다** —
   브랜치가 갈라진 게 아니라 처음부터 별개 저장소다.
2. **dev2 조사** — `dev2`의 origin이 정확히 `AILENS`. 커밋 로그 첫 줄이
   `1752cac chore: 초기 커밋 — AI LENS dev2 워크스페이스 스냅샷` — 즉 dev2는 기존
   저장소를 clone한 게 아니라 **어느 시점의 작업 디렉터리 스냅샷으로 새로 git init**
   해서 독립적으로 커밋을 쌓아온 것. dev2 쪽 히스토리에는 이미 dev에서 방금 만든 것과
   겹치는 기능(trend_card CMS 채널, letters mbti_group null 폴백, 타임라인 빅카인즈
   연결, 레터 퀴즈·투표 위젯)이 **더 앞서 구현**돼 있었다.
3. **배포 사고 확인** — 두 체크아웃의 배포 스크립트가 **완전히 동일한 AWS 리소스**를
   가리킨다: S3 `sedaily-mbti-frontend-dev`/`sedaily-mbti-admin-frontend-dev`,
   CloudFront `E1QS7PY350VHF6`/`E1MITYI58DB9UW`, Lambda `sedaily-mbti-admin-api-dev`·
   `sedaily-mbti-v2-today-letters-dev`·`sedaily-mbti-v2-posts-dev` 등. 즉 이 세션이
   `dev` 기준으로 이미 실행한 배포 4건(admin-api Lambda, v2 today-letters/posts Lambda,
   메인 프론트, admin 프론트)이 `dev2` 기반으로 이미 떠 있던 더 최신 코드를 덮어썼다.
   실제로 배포 직후 `/api/v2/today-letters`가 500을 뱉었다 (Lambda Handler 설정이
   `handlers.today_letters.lambda_handler`인데 dev 쪽 zip 구조는 `v2/handlers/`
   경로라 `ImportModuleError` — dev2 쪽은 v1/v2 폴더 구분을 아예 없앤 통합 구조라
   Handler 경로가 다르다).
4. **복구** — `dev2`의 커밋되지 않은 대규모 WIP(웹툰/스타일/워즈 페이지 등 40여 파일,
   `@dicebear/core` 의존성 추가 등 미완성 상태)를 `git stash -u`로 보존한 뒀,
   `dev2`의 마지막 커밋(`a18cd66`) 기준으로 4개 배포를 전부 재실행해 프로덕션을
   원상복구. `git stash pop`으로 WIP 복원. 배포 후 확인:
   `/api/v2/today-letters` 200 (빈 배열, 정상 — daily_letters 테이블이 비어있는
   기간이라 폴백), `ailens.sedaily.ai` 200, `mbti-admin.sedaily.ai` 200.
5. **origin 정리** — `dev`의 origin을 다시 `AI-LENS`로 되돌려뒀다 (세션 중 실수로
   `AILENS`로 바꿨다가 원복). `dev`에서 만든 3개 커밋(`651920b`/`b2a1cc9`/`4800080`)은
   `AI-LENS`에 그대로 남아있다 — `dev2`와 내용이 겹치는 부분이 많아 정리는 안 했다.

## 결정

- **`dev2`가 정본이다.** 사용자가 직접 확인: "dev2에서 작업한 게 그냥 최신이고,
  이거만 사용하면 된다." `dev`(`AI-LENS`)는 낡은/사용 안 하는 체크아웃으로 취급한다.
- `dev`의 오늘 커밋 3개는 되돌리거나 지우지 않고 그냥 둔다 (별도 요청 없는 한).
- 이 문서 + 아래 CLAUDE.md 경고 배너로 재발 방지 — 상세는 "다음" 참조.

## 다음

- **`dev2`에 root `CLAUDE.md`가 아예 없었다** — 이번 세션이 `dev`에서 시작된 것도
  결국 이 gap 때문이다(어느 디렉터리에서 세션을 열든 자동으로 읽히는 컨텍스트 파일이
  있어야 함). 이 커밋과 함께 `dev2/CLAUDE.md`를 최소 버전으로 새로 만들어 최상단에
  "여기가 정본, dev/AI-LENS 쓰지 말 것 + 두 체크아웃이 같은 AWS 리소스 공유"
  경고를 박아뒀다. `dev`의 기존 대형 CLAUDE.md 내용(아키텍처 상세 등)을 dev2 기준으로
  다시 옮겨 쓰는 건 이번 스코프 밖 — 필요하면 별도 세션에서 진행.
- `dev/CLAUDE.md` 최상단에도 "여기 쓰지 말고 dev2로 가라" 경고를 추가했다 — 누군가
  `dev`에서 세션을 열어도 최소한 첫 화면에서 알아차리게.
- `dev`의 3개 커밋과 `dev2`의 겹치는 기능(letters DynamoDB 마이그레이션 vs dev2의
  구현)이 실제로 동일한지, 아니면 dev 쪽에만 있는 유효한 차이(예: `podcast_audio_url`
  수동 업로드, media.py audio 프리사인)가 있는지는 비교 안 했다 — 필요하면 후속 세션에서.
- 근본적으로 **왜 두 체크아웃이 서로 다른 GitHub 레포에, 그것도 같은 AWS 리소스를
  공유하며 존재하게 됐는지**는 이번 조사 범위 밖. 장기적으로는 하나로 합치는 게
  맞다는 게 이전 `docs/superpowers/plans/2026-08-06-timeline-lambda-connect.md`
  (dev 쪽에 있던 문서, §6)에서도 이미 지적된 바 있다.

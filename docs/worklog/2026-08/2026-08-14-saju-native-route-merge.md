# 2026-08-14 사주매칭(AI-saju)을 AILENS Next 앱의 실제 라우트로 병합

작성: Claude Code
관련: sedaily-ai/AI-saju (main, `6f6b378`), docs/worklog/2026-08/2026-08-09-saju-cdn-mount.md

## 배경

2026-08-09에 사주매칭을 CloudFront 경로 마운트(`/saju*` → 별도 배포 S3+CDN origin)로
붙였는데, 이 방식은 로컬 `next dev`에서 `/saju`가 항상 404였다 — CDN 라우팅은
프로덕션 CloudFront 단에서만 일어나서 로컬엔 대응하는 게 없었기 때문. 사용자가
로컬에서 사주 화면이 계속 안 뜨는 걸 겪다가, CDN 마운트 방식 대신 AI-saju 깃허브
레포 소스를 이 웹사이트(AILENS Next 앱) 안에 실제 라우트로 가져오라고 요청.

## 한 것

- `sedaily-ai/AI-saju` main을 스크래치패드에 shallow clone해서 `frontend/src/`
  전체를 가져옴 (Next 16.2.2 / React 19.2.4 — AILENS와 버전 거의 동일, 의존성
  충돌 없음).
- `service/frontend/src/app/saju/_vendor/{features,shared,widgets}/` — AI-saju의
  features/shared/widgets를 Next App Router의 private-folder 컨벤션(`_` 접두사)
  으로 격리 배치. AILENS 자체에도 같은 이름의 최상위 `features/`, `shared/`,
  `widgets/`가 있어서(FSD 구조) 이름이 겹치므로, 절대 그쪽과 섞지 않고 별도
  네임스페이스로 뒀다. 74개 파일의 `@/features`, `@/shared`, `@/widgets` import를
  `@/app/saju/_vendor/...`로 일괄 재작성.
- `service/frontend/src/app/saju/*` — AI-saju의 라우트 폴더(saju, chaeun, career,
  compatibility, couple, chat, blog, news, jeomsin, zodiac, yearly, today,
  tojeong, character, concern, quiz, decide, avoidance, en, about, daily-quote)를
  그대로 이식. 원본 앱 자체에 내부 라우트 `/saju`(원국 페이지)가 있어서
  `/saju/saju`로 이중 중첩되는데, 이건 CDN 마운트 때도 있던 구조라 그대로 유지.
- **마운트 프리픽스 처리** — 원본은 `next.config.ts`의 `basePath="/saju"`로
  전체 앱의 링크·이미지·fetch에 자동으로 `/saju`를 붙이던 걸, 여기선 basePath를
  안 쓰고(AILENS 전체에 영향 주므로) 직접 코드로 흉내냈다:
  - `shared/lib/basePath.ts`의 `BASE_PATH`를 `"/saju"`로 하드코딩 (원래 env var
    기반이었으나 이 vendored 사본은 항상 `/saju` 아래에서만 렌더되므로 고정값이
    더 안전).
  - `shared/lib/LangContext.tsx`의 `localePath()`가 결과에 `/saju`를 자동으로
    붙이게 수정, `deriveLang`/`setLang`은 `usePathname()`이 돌려주는 실제 마운트된
    경로(`/saju/en/...`)에서 프리픽스를 벗기고 판단하도록 수정.
  - `TopNav.tsx`, `FeatureTabs.tsx`의 `isActive`/`resolveActive`도 동일하게
    `/saju` 프리픽스를 벗기고 비교하도록 수정 — 안 하면 탭 활성 표시가 항상 어긋남.
  - `<Image src="/saju/...">`, `/characters/...`, `/fortune-mascot.png`,
    `/hero-character.png` 등 raw 절대경로 12곳을 `/saju/...`로 직접 수정
    (basePath가 없으니 Next의 자동 프리픽싱이 안 먹어서 수동으로 함).
- **CSS 스코핑** — AI-saju `globals.css`가 AILENS와 똑같은 변수명(`--color-primary`
  등)과 클래스명(`.skip-link`, `.max-w-container`, `.scrollbar-hide` 등)을 다른
  값으로 정의하고 있어서 그냥 합치면 사이트 전체 톤이 깨진다. `saju-globals.css`로
  새로 작성해서 모든 선택자를 `.saju-scope` 아래로 스코핑, `@theme inline`(전역
  Tailwind 테마 토큰 재정의라 스코핑 불가능해서 통째로 제거 — 사용처 없음 확인),
  다크모드 블록(원본에서도 죽은 코드, "점신 톤은 라이트 단일" 주석으로 확인됨)도
  전부 제거. `@keyframes`는 이름 충돌 방지로 `saju-` 접두사 붙여 재명명.
- `layout.tsx`를 nested layout으로 새로 작성 (`<html>`/`<body>` 제거, AILENS 루트
  레이아웃이 이미 갖고 있음). `.saju-scope` div로 감싸고 TopNav/footer/Providers
  유지, 자체 JSON-LD(WebSite/Organization)는 AILENS 루트가 이미 있어 제거.
- `service/frontend/public/saju/`에 원본 `public/`의 실사용 에셋(blog-content,
  characters, saju, saju-cache, 마스코트 이미지 — 총 130MB) 복사. Next 기본
  보일러플레이트 svg·robots.txt·llms.txt는 제외.
- `trackEvent.ts`의 전역 `Window.gtag` 타입 선언이 AILENS 자체 선언과 시그니처가
  달라 `tsc` 에러 — AILENS 쪽 시그니처(`'event'|'config'|'js'|'set'` 유니온)로 맞춤.
- 검증: `npx tsc --noEmit` 클린. 브라우저로 `/`(기존 AILENS 홈, 블루 톤 안 깨짐),
  `/saju`, `/saju/character`, `/saju/blog`, `/saju/en/blog`, `/saju/saju`(원국
  페이지, 오늘자 오행 계산 정상) 확인 — 콘솔·네트워크에 새 에러 없음. 유일한
  404는 `/saju/hero-character.png`인데 원본 AI-saju 레포에도 없는 파일이라
  이식 전부터 있던 문제(내가 만든 회귀 아님).

## 결정

- CDN 마운트를 걷어내지 않고 남겨뒀다 — `next.config.ts`의 basePath 관련 코드,
  AI-saju 레포 자체, AWS CloudFront 라우팅(`E1QS7PY350VHF6`)은 이번 작업과 무관.
  지금은 로컬 dev에서만 새 네이티브 라우트가 쓰이고, 배포는 아직 CDN 마운트
  그대로다. 프로덕션도 이 방식으로 옮길지는 별도 논의 필요.
- SEO용 JSON-LD breadcrumb의 `path:` 필드(`/compatibility/` 등, `/saju` 프리픽스
  안 붙음)와 `sitemap.ts`는 손대지 않았다 — 눈에 보이는 기능에 영향 없고, 실제
  배포 아키텍처가 정해지기 전에 SEO 메타데이터를 다듬는 건 시기상조라 판단.
- `public/saju/`에 130MB를 그대로 커밋할지는 사용자 판단으로 남겨뒀다 — git에
  올리기엔 큰 편이라 이 세션에서 커밋하지 않았다.

## 다음

- 이번 로컬 변경은 아직 커밋 안 했다 — 사용자 확인 후 커밋 여부 결정.
- `public/saju/` 130MB를 리포에 그대로 넣을지, Git LFS나 별도 배포 파이프라인으로
  뺄지 결정 필요.
- 실제 배포(AILENS 빌드에 이 라우트를 포함해 배포)로 갈지, 아니면 계속 로컬
  전용이고 프로덕션은 기존 CDN 마운트를 쓸지 — 두 개의 사주 코드 경로(vendored
  네이티브 라우트 vs CDN 마운트)가 공존하는 상태라 언젠가 하나로 정리해야 함.

## 추가: 챗봇/결정카드 백엔드 로컬 연결 (같은 날 이어서)

- `saju/backend/{chat-bedrock,decision-card}/` — AI-saju의 두 Lambda 백엔드
  코드(`handler.py`, `local_server.py`, `README.md`)를 레포 루트에 새 최상위
  폴더로 이식. `admin/`, `service/`처럼 제품 단위 최상위 폴더 컨벤션을 따름.
  `blog-publish` Lambda는 원본 레포 README에 "2026-07-09 비밀번호 노출 문제로
  제거됨"이라 적혀 있어 가져오지 않았다.
- **AWS Lambda를 새로 배포하지 않고** 로컬 전용으로 연결했다 — 공개
  Function URL(`auth-type NONE`)을 새로 만드는 건 실비용·남용 리스크가 있는
  별도 결정이라(README 자체가 배포 전 rate limit/WAF 필요하다고 경고), 이번엔
  `local_server.py`(로컬 AWS 자격증명으로 Bedrock 직접 호출, Lambda 불필요)만
  띄웠다.
- `BEDROCK_MODEL_ID=anthropic.claude-haiku-4-5`(README 기본값)로 첫 시도 →
  `ValidationException: 모델 ID 무효`. 정확한 버전 `anthropic.claude-haiku-4-5-20251001-v1:0`로
  재시도 → `on-demand throughput isn't supported, use inference profile`.
  `aws bedrock list-inference-profiles`로 확인해서 실제 호출 가능한 ID는
  `us.anthropic.claude-haiku-4-5-20251001-v1:0`(크로스리전 inference profile)임을
  확인 — AI-saju README의 모델 ID 표는 이 계정 기준으로는 부정확하다(참고용
  후속 PR 필요할 수도).
- 8787(chat-bedrock), 8788(decision-card) 포트로 로컬 서버 기동, 둘 다 curl로
  실제 Bedrock 응답 확인(`{"text": "**career**"}`, 결정카드 문구 생성 등 정상).
- `service/frontend/.env.local` 신설 (`.gitignore`에 `.env*` 이미 있어 커밋 안 됨):
  `NEXT_PUBLIC_CHAT_API_URL=http://localhost:8787/`,
  `NEXT_PUBLIC_DECISION_API_URL=http://localhost:8788/`. Next dev 서버 재기동해서
  `.env.local` 반영 확인(`- Environments: .env.local` 로그), `/saju/chat` 정상 로드.
- AWS 계정: 현재 활성 자격증명(`yeonggwang` 프로필)이 이미 887078546492(AI-saju가
  쓰는 계정, `saju-oracle-frontend-887078546492` 버킷과 동일)라서 별도 프로필
  전환 없이 바로 Bedrock 호출 가능했다.

### 다음 (백엔드 관련)

- 로컬 서버 2개(8787/8788)는 터미널을 닫으면 꺼진다 — 상시 켜두려면 launchd
  등록이나, 결국은 실제 Lambda 배포가 필요.
- 실제 프로덕션 연결(Lambda 배포 + Function URL + IAM 역할 + rate limit/WAF)은
  이번에 하지 않았다 — 사용자가 원할 때 별도로 진행.
- `BEDROCK_MODEL_ID` 기본값을 README의 짧은 ID 대신 실제 통하는 inference
  profile ID로 AI-saju 레포 쪽에도 수정 제안할지 검토 필요.

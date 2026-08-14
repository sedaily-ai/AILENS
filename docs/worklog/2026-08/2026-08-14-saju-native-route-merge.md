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

## 추가: `/saju/saju` 로컬 dev 프로세스 폭주 재현 + 재부팅 필요 (같은 날 이어서)

### 배경

사용자가 다음 세션에서 "로컬 서버 열고 사주 탭을 탭하기만 하면 이슈가 터진다"고
보고. 이전 어느 세션에서 "노드모듈이 다른 서비스와 다르게 사주는 여러 군데
돌면서 무한 폭주하는 형태", "/saju가 다른 경로까지 돌아서 문제"라고 지적받은
기억이 있다는데 구체적 내용은 흐릿한 상태 — 원인부터 다시 확인 요청.

### 한 것

- `next dev`(Turbopack) 기동 후 `/`와 `/saju`(사주 탭 첫 화면)는 정상
  (각각 200, 4.3s / 113ms).
- `/saju/saju`(원국 계산 페이지, 오늘의 오행 계산이 실제로 도는 안쪽 라우트)를
  요청하자 컴파일 로그에 "Finished writing to filesystem cache" 직후부터
  `node(PID) MallocStackLogging...` 줄이 초당 수십 개씩 찍히며 **새 node 자식
  프로세스가 수백~수천 개 단위로 폭주 생성**되는 걸 실측으로 확인. curl 요청은
  40초 타임아웃까지 응답 없음(000)으로 끝남.
- 그 여파로 Bash 도구 자체가 fork 불가 상태에 빠짐 — `echo hello`조차 exit 1로
  실패. 프로세스 테이블 고갈로 판단되며, `feedback_local_dev_process_limit`
  메모리에 기록된 "맥 프로세스 한도 2666 도달 시 forkpty 크래시"와 동일 증상.
- 남은 프로세스가 너무 많아 하나씩 kill하는 대신 재부팅으로 정리하기로 사용자가
  결정.

### 원인 (가설 — 재부팅 후 수정·재현 테스트로 검증 예정)

같은 날 앞서 기록한 커밋 `bf40d18`에서 추가한
`service/frontend/next.config.ts`의
`outputFileTracingRoot: path.join(__dirname, "../../")`가 Turbopack의 파일
트레이싱 범위를 `service/frontend` 하나가 아니라 **dev2 레포 루트 전체**로
넓힌다. `/saju/saju`는 `@saju/*` 별칭으로 프로젝트 밖(`../../saju/frontend/`)
코드를 참조하는 사실상 유일한 라우트라, 이 라우트를 컴파일할 때만 트레이서가
`admin/frontend`의 별도 `node_modules`, 레포 루트의 `node_modules` 심볼릭
링크(→ `service/frontend/node_modules`, 8/14 16:47 생성 — 언제 왜 만들었는지
이번 세션에서는 확인 못함), `saju/backend/`, `docs/`, `images/`, `.git/`까지
훑는다. 이 넓은 트리 어딘가(유력하게는 루트 `node_modules` 심볼릭 링크가 만드는
순환/중복 경로)에서 프로세스 폭주가 시작되는 것으로 추정 — 다른 라우트는 전부
프로젝트 안에서만 import하니까 이 문제가 없다는 점과 맞아떨어진다.

### 결정

- 재부팅으로 정리, 재부팅 전에는 dev 서버 재기동 금지.
- 재부팅 후 dev 서버를 다시 켜기 전에 `outputFileTracingExcludes`로 트레이싱
  범위를 좁히는 수정을 먼저 넣기로 함(재부팅 직후 같은 폭주 재발 방지).

### 다음

- `next.config.ts`에 `outputFileTracingExcludes`를 추가해 `admin/**`,
  `docs/**`, `images/**`, `saju/backend/**`, 루트 `node_modules` 등을
  `/saju/**` 컴파일 트레이싱에서 제외.
- 수정 후 `/saju/saju` 재요청으로 프로세스 수를 모니터링하며 실제 해결 확인.
- 레포 루트 `node_modules` 심볼릭 링크가 지금도 필요한지 확인 — 불필요하면
  제거도 고려(saju/frontend엔 자체 package.json이 없어 원래 없어도 될 가능성).

## 추가: 재부팅 후 재현·근본 원인 확정 — Turbopack 캐시 오염, 코드 문제 아니었음 (같은 날 이어서)

### 배경

재부팅 완료 후 새 세션에서 재현 여부 확인. 이 시점에 `next.config.ts`를 열어보니
바로 위 "다음"에 적은 `outputFileTracingExcludes`는 아직 미적용 상태였고, 대신
그 사이(재부팅 전 16:50/17:20)에 커밋된 `d0718e2`(루트 `node_modules` 심볼릭 링크
추가로 `saju/frontend` 모듈 해석 실패 수정)와 `aa98b8d`(그 심볼릭 링크가 유발한
`outputFileTracingRoot` standalone 빌드 경로 문제 수정, 실배포까지 검증)가 이미
들어가 있었음을 확인 — 즉 빌드/배포 쪽 부작용은 그 사이 세션에서 이미 고쳐져
있었고, 로컬 dev 폭주만 미해결로 남은 상태였다.

### 한 것 — 안전 재현 하네스

이전 세션에서 재부팅까지 갔던 사고이므로, 이번엔 절대 시스템 전체를 다시
멈추지 않도록 이중 안전장치를 걸고 진행:
- dev 서버를 `ulimit -u 800`(사용자 기준 macOS 기본 한도 2666의 1/3 이하, 평소
  사용자 전체 프로세스 수 ~380보다는 충분히 여유)로 감싼 서브셸에서 기동.
- 별도 워치독을 백그라운드로 돌려 1초 간격으로 `ps -u $(whoami) | wc -l` 감시,
  임계값(650) 초과 시 `next-server`/`next dev`/프로젝트 경로 매칭 프로세스를
  즉시 `pkill -9`.
- 이 하네스로 `/saju/saju` 요청 → 프로세스 수가 요청 완료 "이후" 12~15초에 걸쳐
  390대→650대까지 선형 증가 → 워치독이 자동 kill → 즉시 380대로 복귀,
  하는 과정을 **3회 연속 재현**. 매번 Bash 도구도 죽지 않고 재부팅 없이 정리됨
  (지난번 사고와 달리 이번엔 시스템 전체가 멈추지 않았다).

### 한 것 — 원인 특정 (이분법 테스트)

`ps -eo pid,ppid,pgid,pcpu,command`로 폭주 중 스냅샷을 떠서 확인한 결과, 새로
생기는 프로세스는 전부 하나의 부모 밑에 매달린
`service/frontend/.next/dev/build/postcss.js`(Turbopack이 PostCSS/Tailwind JS
플러그인을 실행하기 위해 띄우는 `child_process/evaluate.ts` 워커) — 초당
수십 개씩, 재사용 없이 계속 새로 spawn됨. 애초 worklog에 적었던 "파일 트레이싱
범위가 넓어져서" 가설과는 다른 메커니즘임을 확인.

이후 원인을 좁히기 위해 `/saju` 아래 임시 디버그 라우트를 여러 개 만들어
순서대로 테스트(전부 동일한 ulimit+워치독 하네스로 보호):
1. `getGapja`/`CG_OH`/`OH_HJ`(오행 계산 엔진)만 단독 호출 → 정상, 폭주 없음.
2. `PageShell`/`BottomNav`/`sajuTokens`/`LangContext`만 단독 사용 → 정상.
3. `saju/saju/page.tsx` 전체를 다른 경로에 그대로 복사(엔진+UI 전부 포함) →
   **정상, 폭주 없음**. 즉 코드 내용은 원인이 아님.
4. `layout.tsx`까지 완전히 복사해 다른 경로에 배치 → 정상.
5. 반복되는 세그먼트 이름 패턴(`/saju/foo/foo`, 부모와 동일한 이름의 자식
   세그먼트) 단독 → 정상.
6. `public/saju/saju/`에 실제 5MB급 PNG가 여러 개 있고 그 경로가 `/saju/saju`
   페이지 경로와 겹친다는 걸 발견해 이것도 재현 시도(`/saju/foo/foo` +
   같은 경로에 5MB 이미지 배치) → 약간의 증가(392→406)는 있었지만 폭주(650대)로
   이어지진 않음.
7. **`.next` 캐시를 통째로 삭제(`rm -rf .next`)하고 완전히 새로 기동한 뒤
   원본 `/saju/saju`를 그대로 요청 → 폭주 없음, 정상 200 (3.4s, 캐시 없는
   첫 컴파일치고 정상 시간).** 이후 캐시가 데워진 상태로 같은 라우트 재요청,
   `/saju`, `/saju/saju/chart`, `/saju/career`, `/saju/blog`, `/saju/en/blog`
   연속 요청까지 전부 프로세스 수 변화 없이 정상 — 안정성 재확인.

### 결론

**코드·라우트 구조·CSS·이미지 경로 충돌 어느 것도 원인이 아니었다.** 오늘
하루 안에 사주 코드 구조를 세 번 바꿨다(`_vendor` 인라인 배치 →
최상위 `saju/frontend/` 분리 → 심볼릭 링크·트레이싱 루트 수정) — 그 과정에서
Turbopack의 영속 캐시(`.next/`)에 이제는 존재하지 않는 경로를 참조하는 오염된
엔트리가 남았고, `/saju/saju` 컴파일 시 그 캐시를 검증/사용하려는 과정이
`postcss.js` 워커를 무한 재시도로 spawn하는 것으로 보인다(정확한 Turbopack
내부 로직까지는 못 들어갔지만, "캐시 삭제 전 100% 재현 / 캐시 삭제 후 100%
정상"이라는 통제된 대조 실험으로 원인을 이 정도 확신도까지 좁혔다).

### 결정

- 별도 코드 수정 없이 `.next` 캐시 삭제만으로 해결 — `outputFileTracingExcludes`
  추가는 (이미 build/deploy 쪽은 다른 커밋으로 해결되어 있었으므로) 보류.
  다음에 이 폭주가 재현되면 우선 `rm -rf service/frontend/.next` 부터 시도할 것.
- 같은 날 구조를 여러 번 바꾸는 세션에서는 마지막에 `.next` 캐시를 지우고
  한 번 깨끗하게 재기동해 확인하는 걸 습관화하는 게 좋겠다 — 이번처럼 코드는
  멀쩡한데 캐시만 오염된 경우 원인 파악에 시간이 오래 걸린다.
- 디버그용으로 만든 임시 라우트(`saju/debug-engine-only`, `saju/debug-ui-only`,
  `saju/foo`)와 테스트 이미지는 전부 삭제, git에 흔적 없음.

### 다음

- 재현 안 되는 상태 확인까지만 했고, Turbopack 자체의 캐시 무효화 로직에 진짜
  버그가 있는지(예: 특정 구조 변경 패턴에서 캐시 키가 안 바뀌는 경우)는 더
  파고들지 않았다 — 필요하면 Next.js/Turbopack 이슈 트래커에 재현 스텝과 함께
  제보 고려.
- 이번에 만든 안전 재현 하네스(`ulimit -u` + 프로세스 수 워치독)는 다음에
  비슷한 dev 서버 폭주 의심 상황에서 재사용 가능 — 재부팅 없이 안전하게
  실험할 수 있었다.

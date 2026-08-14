# 2026-08-15 사주(saju)를 완전히 독립된 Next.js 앱/프로세스로 분리

작성: Claude Code
관련: docs/worklog/2026-08/2026-08-14-saju-native-route-merge.md,
docs/worklog/2026-08/2026-08-09-saju-cdn-mount.md

## 배경

전날(2026-08-14) 사주를 AILENS 네이티브 라우트로 vendoring했다가, `service/frontend`와
같은 tsconfig alias(`@saju/*`)·같은 루트 `node_modules` 심볼릭 링크·같은
`outputFileTracingRoot`(레포 루트로 확장)·같은 Turbopack dev 프로세스·같은 `.next`
캐시를 공유하게 됐고, 그 결과 `/saju/saju` 요청 시 `.next` 캐시 오염으로 postcss 워커가
무한 spawn되며 시스템 전체 프로세스 한도(2666)까지 폭주해 재부팅이 필요했던 사고가
있었다. 재부팅 후 안전 하네스(`ulimit -u` + 프로세스 수 워치독)로 재현·격리해 확인한
결과 코드 문제가 아니라 캐시 오염이 원인이었음을 확정했지만, 이 사고 자체가 "사주 쪽
문제가 AILENS 본체 dev 서버 전체·시스템 전체에 영향을 줄 수 있는 구조"라는 근본적인
설계 문제를 보여줬다. 사용자가 "완전한 프로세스 분리"를 요청.

## 조사 — 기존 전례 확인

`admin/frontend`가 이미 이 레포에서 검증된 "완전 분리 앱" 전례였다: `service/frontend`와
별도의 `package.json`, `output: "export"` 정적 배포, 별도 S3(`sedaily-mbti-admin-frontend-dev`)
+ CloudFront(`E1MITYI58DB9UW`), `service/frontend` 쪽엔 admin으로 가는 rewrite/middleware가
전혀 없음(CDN 레벨에서만 분리). 또한 프로덕션은 여전히 2026-08-09에 만든 CDN 마운트
(CloudFront `E1QS7PY350VHF6`의 `/saju*` 경로 규칙 → 별도 origin)를 그대로 쓰고 있고,
전날 만든 네이티브 라우트는 배포된 적이 없다는 것도 확인 — 즉 풀어야 할 진짜 문제는
로컬 dev 환경 하나뿐이었다.

## 한 것

### 1. `saju/frontend/`를 완전 독립 Next.js 앱으로

- `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `.gitignore`
  신설(`admin/frontend` 패턴 참고, 버전은 이미 검증된 `service/frontend`와 동일하게:
  Next 16.2.2 / React 19.2.4).
- `next.config.ts`: `basePath: "/saju"` 복원(vendoring 이전 원본 AI-saju 방식),
  `output: "export"`, `images.unoptimized`, `turbopack.root`(admin의 한글 경로 Turbopack
  패닉 방지 설정 재사용). `outputFileTracingRoot` 불필요(자체 완결 앱).
- `tsconfig.json`: `"@saju/*": ["./*"]`로 **자기 자신을 가리키는** alias 유지 — 이렇게
  해서 `saju/frontend` 내부 47개 파일 + 이동한 라우트 파일 29개, 총 76개 파일의
  `@saju/...` import 문을 한 줄도 안 고치고 그대로 재사용했다(alias 타깃만 "옆
  디렉터리"→"자기 자신"으로 바뀜). import 일괄 치환이라는 리스크 큰 작업 자체를
  설계로 제거한 셈.

### 2. 라우트·정적 자산 이동 (`git mv`로 히스토리 보존)

- `service/frontend/src/app/saju/` (레이아웃·`saju-providers.tsx`·20개 라우트 폴더·
  `en/` 로케일 미러 등 50개 파일) → `saju/frontend/src/app/`.
- `service/frontend/public/saju/`(characters·saju·saju-cache·마스코트 이미지 등 130MB)
  → `saju/frontend/public/`.
- `saju-globals.css`에 `@import "tailwindcss";` 복원(vendoring 때는 AILENS 루트
  globals.css가 이미 import하고 있어서 빼뒀던 것 — 독립 앱이 되며 다시 필요).
  `.saju-scope` 스코핑 자체는 그대로 유지(제거해도 이득 없고 회귀 위험만 커짐).
- 새 루트 레이아웃: 기존 nested layout.tsx에 `<html lang="ko"><body>`를 다시 추가
  (vendoring 때 AILENS 루트 레이아웃이 제공한다고 걷어냈던 부분을 원복).
  `metadataBase` 추가.
- `package.json`에 `@fullstackfamily/manseryeok`(만세력 계산 라이브러리) 추가 누락을
  `tsc --noEmit`으로 잡아냄 — 처음엔 next/react/lucide-react 등 알려진 목록만 조사해서
  빠뜨렸다가, 전체 import 문을 grep으로 훑어 재확인 후 추가.

### 3. basePath 이중 접두사 조사 — 실제로는 대부분 문제 없었음

- **`next/image` src 하드코딩 12곳**: Next 소스(`next/dist/client/image-component.js`
  등)에 basePath 참조가 전혀 없는 걸 직접 확인 — `next/image`의 `src`는 basePath를
  자동으로 안 붙인다(공식 문서와도 일치). 즉 vendoring 때 수동으로 박아둔
  `/saju/saju/my-saju.png` 같은 경로들이 이미 "basePath + public 상대경로"를 문자열로
  직접 쓴 형태라 지금도 정확히 맞다 — **손댈 필요 없었음**. 브라우저 curl로 실제
  자산 로딩까지 재확인.
- **`LangContext.tsx`의 `withLocale()`**: `router.push()`/`<Link href>`는 Next가
  basePath를 자동으로 붙이므로, 여기서 수동으로 `/saju`를 prepend하던 `MOUNT_PREFIX`
  로직은 **실제로 이중 접두사 버그**였다 — 제거하고 bare 경로만 반환하도록 수정.
- **`TopNav.tsx`/`FeatureTabs.tsx`의 active-tab 판별**: `usePathname()`이 이제
  basePath를 자동으로 뗀 값을 주는데, 예전 vendoring 시절 로직(`/saju/` 프리픽스를
  또 수동으로 벗기는 코드)이 남아있어서 원국 페이지(`/saju/saju`) 진입 시 "사주" 탭이
  활성 표시 안 되는 회귀가 생길 뻔했다 — 실제 값 흐름을 손으로 추적해서 발견,
  수동 스트립 로직 제거.
- **`shared/lib/basePath.ts`의 `withBasePath()`**: `fetch()`/`<a href>`처럼 Next가
  basePath를 자동 처리 안 하는 곳에서만 쓰여서 **변경 불필요** — 그대로 유지.

### 4. `service/frontend/` 쪽 정리

- `tsconfig.json`에서 `"@saju/*"` 제거, `next.config.ts`에서 `outputFileTracingRoot`
  제거, 레포 루트 `node_modules` 심볼릭 링크 삭제.
- `next.config.ts`에 **dev 전용** rewrite 추가 — `SAJU_ORIGIN` 환경변수가 있을 때만
  `/saju`, `/saju/:path*`를 그 origin으로 프록시. 없으면(=프로덕션) 빈 배열이라
  기존 동작 그대로(CloudFront가 엣지에서 먼저 가로채므로 이 rewrite 자체가 프로덕션
  경로에서 실행될 일이 없음).

### 5. 검증 — 특히 이중으로 걸린 문제 하나 발견·해결

- `saju/frontend` 단독 기동(포트 3010) → `/saju`, `/saju/saju`, `/saju/blog` 등 정상,
  이미지·JSON 자산 로딩까지 curl로 직접 확인. `npx tsc --noEmit` 클린.
- `service/frontend`에 `SAJU_ORIGIN=http://localhost:3010`으로 기동해 프록시 테스트하는
  중 **AILENS 홈(`/`)이 완전히 멈추는 새 문제 발견** — `Can't resolve 'tailwindcss'`
  에러 로그 확인, 원인은 `outputFileTracingRoot`/`@saju` alias/루트 심볼릭 링크를
  전부 걷어냈는데 `service/frontend/.next` 캐시가 그 이전 설정 기준으로 남아있던
  것(어제 사고와 정확히 같은 클래스의 문제 — "구조 바꾼 뒤엔 `.next` 지우고 재확인"
  교훈을 스스로 실천해서 바로 잡음). `rm -rf service/frontend/.next` 후 재기동으로
  해결, 이후 `/`도 정상.
- `npx tsc --noEmit`(service/frontend) 클린 — `@saju` 관련 에러 없음.
- **격리 증명**: 사주(3010) 프로세스를 강제 kill한 뒤 AILENS 본체(3000)의 `/`,
  `/timeline`은 계속 200으로 정상 응답, `/saju`(프록시 대상 없음)만 깔끔하게 500으로
  실패 — 본체가 전혀 안 죽는다는 걸 직접 증명.
- `SAJU_ORIGIN` 미설정(프로덕션 흉내) 상태로 재기동 → `/`은 정상, `/saju`는 그냥
  404(프록시 규칙이 없으므로 정상 동작 — 실제 프로덕션에선 이 경로 자체가 CloudFront가
  가로채서 AILENS 서버까지 안 옴).

## 결정

- 프로덕션 배포(S3/CloudFront/PM2/nginx)는 **이 시점까지는** 건드리지 않았다 —
  이후 같은 세션에서 사용자가 명시적으로 실배포를 요청해 진행함, 아래 "실제 배포
  완료" 섹션 참조.
- `saju/frontend`의 `node_modules`/`.next`는 각자 자체 `.gitignore`로 커밋 제외(레포
  루트 `.gitignore`엔 범용 패턴이 없어서 앱마다 따로 필요 — `admin/frontend`도 동일).

## 로컬 개발 워크플로 (새로 생김)

두 서버를 따로 띄운다:

```bash
# 터미널 1 — 사주 (포트 3010)
cd saju/frontend && npm install && npm run dev

# 터미널 2 — AILENS 본체 (포트 3000), 사주로 가는 rewrite 활성화
cd service/frontend && SAJU_ORIGIN=http://localhost:3010 npm run dev
```

이렇게 켜면 `localhost:3000/saju/*`가 투명하게 3010으로 프록시된다. `SAJU_ORIGIN`을
안 켜면(터미널 2만 그냥 `npm run dev`) `/saju`는 404 — 사주를 안 건드리는 세션에선
이렇게 본체만 켜면 된다.

## 추가: 실제 배포 완료 — saju/frontend + service/frontend (같은 세션 이어서)

### 배경

로컬 검증 후 사용자가 실제 프로덕션 배포까지 명시적으로 요청. `saju/frontend`를
"실제 배포"한다는 게 무슨 뜻인지 모호해서(새 인프라로 테스트 vs 지금 살아있는
`ailens.sedaily.ai/saju` 경로를 덮어쓰기) 먼저 확인 — 사용자가 **지금 살아있는
경로를 dev2 사본으로 그대로 덮어쓰는 것**을 명확히 원한다고 확인 후 진행.

### 한 것

- **사전 확인**: `aws sts get-caller-identity`로 계정(887078546492) 일치 확인,
  `dev`(하이픈 없는 옛 체크아웃) 최근 커밋이 2026-08-07로 오래돼 최근 배포 충돌
  위험 없음 확인(CLAUDE.md의 dev/dev2 이중 체크아웃 경고에 따른 사전 점검).
- **service/frontend/deploy.sh 수정 필요성 발견**: `outputFileTracingRoot`를 오늘
  앞서 제거했는데, 스크립트가 옛 산출물 경로(`.next/standalone/service/frontend/`)를
  하드코딩하고 있어서 그대로 배포했으면 빌드 검증 단계에서 실패했을 것 — 배포 전에
  실제로 `npm run build`해서 `.next/standalone/server.js`가 (중첩 없이) 바로 그
  자리에 생기는 걸 확인하고 스크립트를 고쳤다.
- **saju/frontend/deploy-saju.sh 신설**: `admin/frontend/deploy-admin.sh`의
  S3 sync + CloudFront invalidation 패턴을 그대로 가져와 대상만 바꿈 —
  `s3://saju-oracle-frontend-887078546492/ailens-mount/saju/` 프리픽스로만 쓰고,
  그 버킷 **루트(saju.sedaily.ai 자체 독립 배포)는 절대 안 건드리게** 프리픽스를
  스크립트에 하드코딩. 실행 전 `aws s3 ls`로 기존 프리픽스 내용(2026-08-11,
  원본 AI-saju 레포의 마지막 배포)과 버킷 루트를 먼저 확인, `aws s3 sync --dryrun`으로
  실제 업로드/삭제 대상을 미리 훑어본 뒤 실행.
- **1차 배포 후 발견한 문제**: `/saju/`(루트)는 200인데 `/saju/saju`, `/saju/blog`
  등 중첩 라우트가 전부 404. 원인 추적 — AILENS CloudFront가 재사용 중인
  CloudFront Function `sedaily-rewrite-subdir-index`의 코드를
  `aws cloudfront get-function`으로 직접 받아 읽어보니, 확장자 없는 경로를 무조건
  `<path>/index.html`로 재작성하는 로직이었다. 이건 Next `trailingSlash: true` 빌드
  (라우트마다 `route/index.html` 디렉터리 구조)를 전제로 만들어진 함수인데,
  `saju/frontend/next.config.ts`에 그 옵션이 없어서 기본값(`route.html` 플랫 파일)로
  export됐던 것 — 로컬 `next dev`/export 서버는 이 CDN 함수를 안 거치니 로컬
  테스트에서는 전혀 안 걸렸다. `trailingSlash: true` 추가 → 재빌드(`out/` 구조가
  `saju/index.html`, `saju/chart/index.html` 식으로 바뀐 것 확인) → 재배포 →
  트레일링 슬래시 있음/없음 양쪽 다 200 확인.
- **service/frontend 배포**: `./deploy.sh` 실행 — 빌드 → S3(`ailens-ssr-releases`)
  업로드 → SSM으로 EC2 릴리스 전환 → PM2 재시작 → 헬스체크(200) 전부 성공.

### 검증 (실도메인)

- `https://ailens.sedaily.ai/saju`, `/saju/saju`, `/saju/saju/chart`, `/saju/blog`,
  `/saju/en/blog`, `/saju/career`, `/saju/compatibility` — 트레일링 슬래시 있음/없음
  전부 200.
- `https://ailens.sedaily.ai/saju/saju/my-saju.png` 등 정적 자산도 200.
- AILENS 본체 핵심 라우트(`/`, `/letters`, `/timeline`, `/lens`) 전부 정상.
- 홈페이지 HTML을 직접 curl해서 "사주" 탭·홈 캐러셀 슬라이드가 실제로
  `<a href="/saju">`(하드 내비게이션)로 렌더되는 것까지 확인 — hardNav 수정이
  프로덕션에 제대로 반영됨.

### 결정

- 이 배포로 `ailens-mount/saju/` 프리픽스의 소스가 원본 `sedaily-ai/AI-saju` 레포
  자체 파이프라인에서 **dev2의 `saju/frontend` 사본으로 완전히 바뀌었다** — 앞으로
  이 경로를 업데이트하려면 dev2에서 `saju/frontend/deploy-saju.sh`를 써야 하고,
  원본 AI-saju 레포 쪽에서 배포해도 더 이상 이 경로에 반영 안 됨(원본 레포는
  `saju.sedaily.ai` 자체 배포만 계속 담당). 이 사실을 원본 레포 관리자/팀에도
  공유가 필요할 수 있음 — 이번 세션에서는 안 함.
- 버킷 루트(`saju.sedaily.ai` 자체)는 이번 배포에서 전혀 건드리지 않았다 —
  `deploy-saju.sh`가 프리픽스로만 쓰기 때문에 구조적으로 안전.

## 다음

- `ailens-mount/saju/` 소스가 이제 dev2로 넘어왔다는 걸 원본 AI-saju 레포
  관리자에게 알릴지, 그 레포의 배포 스크립트에서 이 프리픽스 업로드 부분을
  빼야 할지 검토 필요(안 빼면 다음에 그쪽에서 배포할 때 다시 덮어써서 오늘
  고친 게 되돌아갈 수 있음).
- `public/saju/hero-character.png` 404는 여전히 미해결(원본 AI-saju 레포에도 없던
  파일 — 오늘 만든 회귀 아님, 2026-08-14 worklog에서도 동일하게 기록됨).
- `.saju-scope` CSS 스코핑은 이제 AILENS와 변수/클래스명이 겹칠 일이 없어서 굳이
  필요 없지만, 건드릴 이유가 없어 그대로 뒀다 — 나중에 여유 있을 때 걷어내도 됨(선택).

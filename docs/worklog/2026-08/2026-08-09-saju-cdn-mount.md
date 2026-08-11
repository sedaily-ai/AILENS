# 2026-08-09 사주 서비스(AI-saju) CDN 경로 마운트로 통합

작성: Claude Code
관련: sedaily-ai/AI-saju PR #19 (merged), AILENS CloudFront `E1QS7PY350VHF6`

## 배경

AILENS는 지금까지 `features/fortune`/`couple-match`/`ideal-match` 같은 자체 미니 사주
위젯을 갖고 있었는데, 서울경제가 별도로 운영 중인 진짜 사주 서비스(`sedaily-ai/AI-saju`,
`saju.sedaily.ai`, 만세력 계산 + Bedrock 사전생성 해석 캐시)를 AILENS 안으로 끌어오기로
결정했다. en.sedaily.com이 `/atlas*`를 별도 레포(AI-atlas)에서 CloudFront 경로 라우팅으로
붙인 것과 동일한 패턴 — 코드는 완전히 분리 개발/배포하고, CDN 단에서만 하나의 도메인처럼
묶는다.

## 한 것

**AI-saju 레포 (`sedaily-ai/AI-saju`, PR #19, merged → main)**
- `frontend/next.config.ts`: `SAJU_BASE_PATH` env var로 basePath/assetPrefix 지정 가능하게.
  비어있으면 기존과 동일(saju.sedaily.ai), `/saju`면 마운트용 빌드.
- `frontend/src/shared/lib/basePath.ts` 신규: `withBasePath()` — `fetch('/saju-cache/...')`,
  raw `<a href="/saju/">` 처럼 basePath가 자동으로 안 붙는 절대경로 문자열용. 4곳 적용
  (`FortuneResult.tsx` 2, `ChatTab.tsx` 1, `blog/page.tsx` 2).
- `scripts/frontend/deploy.sh`: 루트 배포에 더해 `SAJU_BASE_PATH=/saju`로 재빌드한 산출물을
  같은 버킷(`saju-oracle-frontend-887078546492`)의 `ailens-mount/saju/` 프리픽스로 추가 업로드.
  ⚠️ 앱 자체에 내부 라우트 `/saju`(사주팔자 원국 페이지)가 이미 있어서 단순히 `saju/`
  프리픽스를 쓰면 루트 배포의 `saju/index.html`을 덮어쓴다 — `ailens-mount/` 래퍼로 분리했다.
- 실제 배포 실행 완료 (`ailens-mount/saju/` 프리픽스에 업로드 확인, `saju.sedaily.ai` 정상).

**AWS 인프라**
- S3 버킷 정책(`saju-oracle-frontend-887078546492`)에 AILENS CloudFront(`E1QS7PY350VHF6`)
  ARN 추가 (기존엔 AI-saju 자체 CloudFront `E2ZDGPQU5JXQKC`만 허용).
- AILENS CloudFront(`E1QS7PY350VHF6`)에 새 origin `Saju-Mount-Origin`(사주 버킷,
  OriginPath=`/ailens-mount`) + `PathPattern: /saju*` behavior 추가. CloudFront Function
  `sedaily-rewrite-subdir-index`(기존 AI-saju가 쓰던 것 재사용, 디렉터리 요청 →
  index.html 재작성)를 viewer-request로 붙임. `ailens.sedaily.ai/saju/` → 200 확인,
  실제 사주 콘텐츠(`<title>사주매칭 — ...`) 정상 서빙 확인.

**AILENS 레포 (여기, 로컬 변경 — 아직 커밋/배포 안 함)**
- `shared/lib/headerTabs.ts`, `widgets/FeedPage/FeedPage.tsx`,
  `features/question/components/QuestionTab.tsx`,
  `features/news-feed/components/HomeHeroCarousel.tsx`: 사주 탭/링크 href를
  `/fortune` → `/saju`로 변경.
- `app/sitemap.ts`: `/fortune`, `/saju-match` 엔트리 제거(더 이상 이 Next 앱의 라우트가
  아님).
- 삭제: `app/fortune/`, `app/saju-match/`, `features/fortune/`, `features/couple-match/`,
  `features/ideal-match/`, `public/saju-cache/`(10MB).
- `tsc --noEmit`, `npm run build`, `npm run lint` 확인 — 빌드 정상, lint는 기존
  baseline과 동일(새로 추가된 문제 없음).

## 결정

- 사이드바의 "나의 이상형, 사주로 풀어보면" 위젯(`features/news-feed/components/SideRail.tsx`)은
  이번 정리에서 **건드리지 않았다** — `entities/saju`(만세력 계산 엔진, 공용)를 자체적으로
  써서 별도 인라인 구현이고, 오늘 논의는 "사주 탭" 교체가 스코프였다. 나중에 이것도
  `/saju`로 보내는 링크로 바꿀지는 별도 논의 필요.
- S3 마운트 프리픽스를 `ailens-mount/saju/`로 이중 네임스페이스한 이유: 앱 자체 내부
  라우트 `/saju`와 마운트 전체가 basePath로 인해 같은 이름을 쓰게 되는 충돌을 피하기 위해.

## 다음

- AILENS 쪽 로컬 변경(헤더 탭 href, sitemap, 위젯 삭제)은 아직 커밋도 배포도 안 했다 —
  사용자가 명시적으로 지시하면 커밋 + `service/frontend/./deploy.sh` 실행.
- PR #19가 리뷰 없이 자동 머지된 경위는 불명확 — gh CLI 재시도 과정에서 발생한 것으로
  추정되나 재현 원인은 특정 못 함. 사용자가 직접 확인.

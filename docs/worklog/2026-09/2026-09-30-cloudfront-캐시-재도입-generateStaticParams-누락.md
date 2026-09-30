# 2026-09-30 CloudFront 캐시 재도입 + generateStaticParams 누락으로 전체 무캐시 발견

작성: 문영광 + Claude Code

## 배경

오늘 같은 세션에서 CloudFront `DefaultCacheBehavior`를 Managed-CachingOptimized로
바꿨다가 RSC 프리페치 헤더가 캐시 키에 안 잡혀 raw flight payload가 노출되는
사고가 나서 CachingDisabled로 롤백했다(별도 기록 없음, 같은 날 즉시 롤백). 사용자가
영문 사이트(globe)의 캐시 설정을 참고해서 가져올 부분을 가져오자고 요청 — 원인을
직접 고치는 쪽으로 방향을 잡고 진행하던 중, 오늘 먼저 했던 URL 개편(카테고리+날짜
중첩 라우트, 페이지네이션)에서 만든 새 라우트 전체가 애초에 전혀 캐시되지 않고
있었다는 걸 발견해서 그것까지 같이 고쳤다.

## 한 것

1. **RSC 캐시 키 분리** — CloudFront 커스텀 캐시 정책
   `AILens-CachingOptimized-RSC-Aware`(`623bc26a-522b-4d97-a20f-95be17be6869`) 생성,
   `RSC`/`Next-Router-Prefetch`/`Next-Router-State-Tree`/`Next-Router-Segment-Prefetch`
   헤더를 캐시 키에 포함해 `DefaultCacheBehavior`에 연결. RSC 요청/일반 요청이
   독립적으로 Hit/Miss 사이클을 타는 것, 일반 요청은 항상 `text/html`을 받는 것
   확인.
2. **`.dockerignore` 신설**(`service/frontend/.dockerignore`) — 없어서
   `Dockerfile`의 `COPY . .`가 로컬 `.next/cache/fetch-cache`(1.7GB, 로컬 dev 중
   실제 프로덕션 API를 호출해 쌓인 캐시)를 그대로 빌드 컨텍스트에 흡수하고
   있었다. `/lens` 카테고리 하나만 `s-maxage=31536000`(사실상 영구)로 나가던
   이상 징후의 원인.
3. **`export const revalidate = 300` 리터럴 명시** — 카테고리 아카이브 7개 +
   페이지네이션 10개 + `/lens` 등 목록 페이지 전부에 명시. import한 상수
   (`CACHE_TTL_FALLBACK_SECONDS`)를 그대로 쓰면 "Unknown identifier" 빌드
   에러 — route segment config는 정적 분석돼 리터럴만 허용한다(2026-09-03
   문서에 이미 있던 제약, 이번에 다시 부딪힘).
4. **페이지네이션 `redirect()` → `middleware.ts`로 이동** — `page/[n]`에서
   `n<=1`일 때 페이지 컴포넌트 안에서 `redirect()`를 부르면 Next가 그 라우트를
   Dynamic API 사용으로 판정해 캐시를 완전히 꺼버린다. 리다이렉트 로직을
   `middleware.ts`(페이지 컴포넌트 도달 전)로 옮기고 컴포넌트는 안전한 clamp만
   하게 바꿈.
5. **(가장 큰 발견) `generateStaticParams` 누락으로 전체 무캐시** — 4번까지
   고치고 배포해도 `/markets/page/2`가 여전히 `no-store`였다. 클린 로컬
   재빌드(`rm -rf .next && npm run build`)로 라우트 테이블을 직접 찍어보니
   `page/[n]` 10개 전부와 오늘 만든 카테고리+날짜 상세 라우트
   (`/{category}/{yyyy}/{mm}/{dd}/{slug}`) 7개 전부가 `ƒ`(fully dynamic)로
   분류돼 있었다 — `revalidate`/`dynamicParams`를 명시해도 무시됨. 원인은
   `generateStaticParams`가 아예 없다는 것 — Next의 `dynamic: 'auto'` 모드는
   정적/ISR로 렌더할 근거(build-time에 알려진 params)가 없으면 라우트
   전체를 SSR-only로 취급한다. 빈 배열을 반환하는
   `generateStaticParams() { return []; }`를 추가하면(`dynamicParams:true`와
   짝) "빌드 시점엔 아무것도 미리 안 만들지만 요청 시 렌더해서 ISR로
   캐시해도 된다"는 표준 패턴이 된다 — 실제로 로컬 빌드에서 대상 17개
   라우트 전부가 `ƒ` → `●`로 바뀌는 것으로 검증. 같은 문제가 있던
   `timeline/[date]`(오늘 작업 대상 아니었지만 동일 원인)도 같이 고침.
   - **즉 오늘 만든 카테고리+날짜 상세 URL(전체 트래픽의 대다수를 차지할
     기사 상세 페이지)이 배포된 순간부터 지금까지 CDN/ISR 캐시를 단 한
     번도 타지 않고 있었다** — 페이지네이션보다 훨씬 트래픽이 큰 페이지라
     실질적으로 이번 세션에서 가장 중요한 수정.
6. ECS Fargate 배포(`sedaily-lens-frontend`, 태스크 정의 리비전 22→23),
   CloudFront `/*` 2회 invalidation, 프로덕션 curl로 전수 검증 — 카테고리
   6개 base·10개 페이지네이션·기사 상세(finance) 전부 `s-maxage=300` 확인,
   기사 상세는 두 번째 요청에서 `x-cache: Hit from cloudfront`·`age` 증가까지
   확인.

## 결정

- globe(en.sedaily.com)의 미들웨어 기반 초단위 TTL 방식을 그대로 이식하지
  않았다 — AI LENS는 origin이 이미 `s-maxage=300`을 정상적으로 내는 구조라,
  TTL을 깎는 대신 캐시 키 자체를 RSC-aware하게 고치는 근본 수정을 택함.
- `page/[n]`은 여전히 빌드 시점에 전부 미리 굽지 않는다(2026-09-03 결정 유지)
  — `generateStaticParams`가 빈 배열을 반환해도 빌드 산출물이 늘지 않고,
  요청이 왔을 때만 렌더해서 캐시한다.

## 다음

- 낮은 우선순위로 보류: `/api/revalidate` 정밀화(revalidatePath+태그+쓰로틀),
  IndexNow 핑, 미들웨어 봇 차단 — 이번 세션 범위 밖.
- nginx.conf 선정 실험실 라우트 패치(`/internal/selection-runs` 등)는 이
  작업과 무관한 별도 건으로, 라이브 EC2 적용이 아직 사용자 확인 대기 중.

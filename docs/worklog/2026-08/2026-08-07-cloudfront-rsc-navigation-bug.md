# 2026-08-07 웹툰·레터 상세 카드 클릭이 안 먹히던 버그 — CloudFront Function의 RSC 폴백 오처리

작성: Claude Code
관련: 사용자 리포트("금통위, 문이 닫히다" 웹툰 카드 클릭 시 페이지 이동 안 됨, 이슈 톡톡도 동일),
CloudFront Function `sedaily-mbti-letter-html-rewrite`(E1QS7PY350VHF6, ailens.sedaily.ai),
`admin-html-extension-rewrite`(E1MITYI58DB9UW, mbti-admin.sedaily.ai)

## 배경

사용자가 홈 화면 "이슈를 웹툰으로" 섹션의 "금통위, 문이 닫히다" 카드를 클릭해도 상세 페이지로
안 넘어간다고 리포트. 이어서 같은 증상이 "이슈 톡톡"(레터 상세)에서도 난다고 확인 — 특정
컴포넌트 버그가 아니라 사이트 전역의 클라이언트 사이드 라우팅 문제라는 뜻이었다. 콘솔에 에러가
안 뜨고, URL도 안 바뀌고, 프로그레스 바(NavProgress)만 15%에서 멈추는 조용한 실패라 원인
특정이 오래 걸렸다.

## 한 것 — 진단 경위 (틀렸던 가설들 포함)

**1차: 컴포넌트 코드 의심 → 배제.** `WebtoonPreviewSection.tsx`의 `<Link href>`가 실제
`<a href="/webtoon/view?id=...">`로 정상 렌더링되는 것을 DOM 인스펙션으로 확인. 클릭 이벤트가
`document`까지 capture-phase로 정상 전파되는 것도 임시 `console.log` 계측으로 확인
(`NavProgress.tsx`의 전역 클릭 리스너 — 나중에 원상복구). **로컬(`localhost:3000`) 개발
서버에서는 동일 코드로 정상 동작 확인** — 이 시점에 코드 자체는 무죄로 결론.

**2차: 배포 스크립트의 캐시 정책 의심.** `service/frontend/deploy.sh`가 엔트리 파일에
`max-age=300`을 주고, CloudFront invalidation을 요청만 하고 완료를 기다리지 않는(`create-invalidation`
후 바로 "배포 완료") 두 가지 실제 결함을 발견 — 이건 진짜 버그였지만 이번 증상의 원인은
아니었다. `no-cache, must-revalidate` + `aws cloudfront wait invalidation-completed`로 고쳐서
재배포했지만 증상 재현됨.

**3차: RSC 페이로드 Content-Type 의심.** 로컬 dev 서버가 실제로 내려주는 RSC 네비게이션
응답의 Content-Type이 `text/x-component`인데, `aws s3 cp`가 `.txt` 확장자만 보고
`text/plain`으로 잘못 지정하고 있는 걸 curl로 대조 확인. `deploy.sh`/`deploy-admin.sh`에
`--content-type "text/x-component"` 명시하는 별도 업로드 단계를 추가해서 재배포 — 실제로
Content-Type은 맞게 고쳐졌지만(재배포 후 curl로 검증 완료) **이것도 증상의 직접 원인은
아니었다.**

**4차(진짜 원인): CloudFront Function의 `_rsc` 폴백 오처리.** 사용자가 Network 탭에서 카드
클릭 시 마지막으로 나가는 요청이 `https://ailens.sedaily.ai/webtoon/view?id=...&_rsc=<hash>`
(세그먼트 캐시 미스 시 Next 라우터가 던지는 "전체 라우트 RSC 재요청" 폴백)이고, 이 요청이
`200 text/html`을 받는다는 걸 실측으로 짚어냄. `curl`로 재현: 정말로 `.txt`가 아니라 정적
HTML을 반환하고 있었다.

원인을 거슬러 올라가니 distribution `E1QS7PY350VHF6`의 viewer-request에 이미 붙어있던
CloudFront Function `sedaily-mbti-letter-html-rewrite`(2026-05-25 최초 작성)에 이런 주석이
있었다:

> `// RSC prefetch (?_rsc=) 도 같은 처리 — 동일 HTML 반환되면 Next.js 가 embedded RSC 추출.`

즉 애초에 "`_rsc` 요청도 그냥 `.html`을 붙여 반환하면, HTML 안에 임베드된 RSC를 Next가 알아서
추출할 것"이라는 **설계 당시의 가정 자체가 틀렸다.** 그 가정은 브라우저가 그 HTML을 직접
로드하며 임베드된 하이드레이션 스크립트를 실행하는 최초 페이지 진입 시에만 성립하고,
`next/link`의 background `fetch()` 기반 클라이언트 라우팅에는 적용되지 않았다 — 라우터는
받은 응답을 flight 포맷으로 파싱하지 못해 조용히 멈춘다(에러 throw 없음, URL 안 바뀜).

목록 페이지(`/webtoon`, `/letters`)는 세그먼트 캐시가 안정적으로 맞아떨어져 이 폴백 경로를
탈 일이 없어서 멀쩡했고, `?id=`가 붙는 상세 페이지(웹툰·레터 둘 다)만 이 폴백을 타서 깨졌다 —
정확히 리포트된 증상 범위와 일치.

## 결정

- **CloudFront Function을 직접 수정** — `_rsc` 쿼리스트링이 있으면 `.html` 대신 `.txt`(진짜
  RSC 페이로드)로 라우팅하도록 한 줄 분기 추가. 기존 로직(확장자 있는 요청 통과, 일반 라우트
  `.html`/`index.html`)은 그대로 유지.
  - 프론트(`sedaily-mbti-letter-html-rewrite`)와 어드민(`admin-html-extension-rewrite`) 둘 다
    동일한 설계 실수가 있어서 같이 고쳤다 — 어드민은 `/posts/edit?id=...` 같은 쿼리 기반
    라우트로 클라이언트 네비게이션하는 화면(글 목록 → 글 수정)이 많아 잠재적으로 영향권.
  - 라이브에 붙이기 전 `aws cloudfront test-function`으로 4가지 케이스(정상 라우트, 루트,
    확장자 있는 정적 파일, `_rsc` 있는 경우)를 각각 검증한 뒤 `publish-function`으로 배포.
- **함수 소스를 레포에 저장** — `service/frontend/infrastructure/cloudfront-functions/letter-html-rewrite.js`,
  `admin/infrastructure/cloudfront-functions/admin-html-extension-rewrite.js`. 배포 자동화에
  포함되진 않지만(수동 `aws cloudfront update-function`으로 관리), "지금 LIVE에 뭐가 올라가
  있는지" 레포에서 추적 가능하게 함. 각 파일 상단에 수동 배포 명령어와 변경 히스토리 기록.
- 2차·3차에서 고친 캐시 정책/Content-Type 변경은 **이번 버그의 직접 원인은 아니었지만 그
  자체로 옳은 개선**이라 되돌리지 않고 그대로 유지.

## 다음

- CloudFront Function은 여전히 수동 CLI로만 관리된다 — `deploy.sh`/`deploy-admin.sh`에
  통합하거나 최소한 "배포 시 이 함수도 같이 확인하라"는 체크리스트가 없으면, 다음에 누군가
  이 함수를 다시 잘못 고칠 위험이 있다. Terraform/CDK 같은 IaC로 옮기는 게 정석이지만 지금은
  범위 밖.
- 다른 static export 구조(`service/frontend`의 나머지 쿼리 기반 라우트, 예: `/letters/view`,
  `/timeline` 등)도 같은 클래스의 버그에서 자유로운지 전수 점검은 안 함 — 이번엔 웹툰·레터
  두 곳만 확인. `_rsc` 폴백 자체가 라우트 종류와 무관하게 동일 CloudFront Function을 타므로
  이번 수정으로 전역적으로 해결됐을 가능성이 높지만, 명시적으로 재확인은 안 했다.

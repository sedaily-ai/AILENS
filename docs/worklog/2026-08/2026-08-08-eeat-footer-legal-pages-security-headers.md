# 2026-08-08 E-E-A-T 보강 — footer/법적 페이지/RSS/CloudFront 보안 헤더

작성: Claude Code
관련: `docs/worklog/2026-08/2026-08-07-seo-ssg-content-rendering-fixes.md`(전날 SSG 작업의 연장선)

## 배경

전날 세션에서 SSG 작업을 마친 뒤, 사용자가 "SEO/AEO/GEO 노출이 잘 활용됐는지" 점검을
요청했다. `~/Downloads/TECHNICAL_REPORT_SEO_AEO.md`(자매 사이트 en.sedaily.com의 실측
AEO 리포트 — AI 검색엔진이 트래픽의 49%로 구글 25%를 2:1로 앞선 실증 사례)를 참고 자료로
삼아 AI LENS와 항목별로 대조했다. 대조 결과 구조화 데이터(JSON-LD)는 이미 갖춰져 있었지만,
그 데이터가 주장하는 발행처 관계·회사 정보가 **실제 화면에는 전혀 노출되지 않고 있었다**는
것과, en.sedaily.com에는 있는 개인정보처리방침·이용약관 등 법적 페이지가 **AI LENS엔
아예 없다**는 걸 발견했다. AI LENS가 로그인(Cognito)·구글/카카오 OAuth·뉴스레터 이메일로
실제 개인정보를 수집하고 있다는 점에서 이건 SEO 개선이 아니라 잠재적 법적 공백이었다.

## 한 것

### 1. footer 전면 개편 (`src/widgets/SiteFooter/SiteFooter.tsx`)
- JSON-LD(`NewsMediaOrganization`)에만 있던 발행처 관계(1960년 창간·대표자·사업자등록번호·
  주소·전화)를 실제 보이는 텍스트로 노출.
- MBTI 4-페르소나 폐지(f84fd06, 2026-08-07) 이후에도 남아있던 "네 가지 시선·민철·하은·
  준서·소율" 카피를 브랜드 태그라인에서 마저 제거.
- 정책 페이지 링크(회사소개/문의/이용약관/개인정보처리방침) nav 추가.
- 소셜 아이콘을 2개(Instagram, YouTube)에서 7개로 확장 — 서울경제신문 공식 채널
  전부(네이버TV·YouTube 공식 핸들·Facebook·X·네이버플레이스) + RSS. 전부 기존 아이콘과
  동일한 라인아트 톤(currentColor stroke, rounded-square)으로 신규 SVG 제작.

### 2. 법적/회사 페이지 4종 신규 (`src/app/{privacy,terms,about,contact}/page.tsx`)
en.sedaily.com의 실제 `/privacy`, `/terms`, `/about`, `/contact` 페이지를 WebFetch로
가져와 참고했고, `www.sedaily.com` 자체 footer에서 실제 사업자정보(대표 손동영,
사업자등록번호 208-81-10310, 신문 등록번호 서울 가 00224, 인터넷신문 등록번호
서울 아04065, 주소, 대표전화 02-724-8600)를 확인해 반영했다. 내용은 그대로 번역하지
않고 AI LENS가 실제로 하는 일에 맞게 다시 썼다 — 개인정보처리방침은 AI LENS의 실제
데이터 수집 범위(로그인 이메일/비밀번호, 구글·카카오 OAuth, 뉴스레터 이메일, 읽기기록·
저장문장, GA4)를 코드(`AuthContext.tsx`, `readingTracker.ts`, `archiveApi.ts`)에서
직접 확인한 뒤 작성했다. `/about`은 사용자가 en.sedaily.com 원문을 두 번 붙여주며
"등등 똑같이 했냐"고 되물어 수상 6개 전체(WAN-IFRA APAC 2026 Gold×2·Silver·
Finalist×2·Winner)·연혁·비전(3대 원칙)·다루는 주제(서울경제 7개 카테고리)·등록번호까지
전부 반영해 재작성했다 — 다만 "Coverage Areas"(8개 뉴스 카테고리)와 "English Edition"
섹션은 en.sedaily.com 고유 구조라 AI LENS 실제 콘텐츠 구조(레터·웹툰·트렌드 중심,
카테고리 기반 아님)에 맞게 다르게 표현했다.
- 4개 페이지 공용 셸 `src/shared/ui/StaticPageShell.tsx` 신규 — Header/검색 오버레이
  배선 반복 방지.
- `sitemap.ts`의 `STATIC_ROUTES`에 4개 라우트 등록(낮은 priority, yearly).

### 3. RSS 피드 (`src/app/rss.xml/route.ts`)
사용자가 en.sedaily.com의 `/rss/newsall`을 예시로 들며 "한글로 붙여달라" 요청 —
`output: 'export'`에서도 정적으로 생성되는 Route Handler(`export const dynamic =
'force-static'`)로 최근 레터 30편을 RSS 2.0으로 발행. `layout.tsx` `<head>`에
`<link rel="alternate" type="application/rss+xml">` 추가로 자동 발견 가능하게 하고
footer에도 아이콘 추가.

### 4. layout.tsx JSON-LD 보강 + MBTI 카피 제거
`NewsMediaOrganization`에 `founder`·`address`·`telephone`·`hasMap` 추가, `sameAs`에
새 소셜 채널 반영. `SITE_TITLE`/`SITE_DESC`/keywords/OG 이미지 alt에서 "네 가지 시선/
민철·하은·준서·소율" 제거(f84fd06이 기능은 없앴지만 마케팅 카피는 안 지웠던 부분).
`fortune/page.tsx` 메타데이터도 동일하게 정리 — 실제로는 MBTI 로직과 무관한 순수 사주
기능이라 "MBTI별 AI 사주"라는 제목 자체가 부정확했음(코드 확인: `FortuneClient.tsx`는
`MbtiGroupId`/`selectedGroup`을 전혀 안 씀).

### 5. CloudFront 보안 헤더 (인프라, AWS 콘솔/CLI)
`aws cloudfront get-distribution-config`로 확인한 결과 `E1QS7PY350VHF6`(ailens.sedaily.ai)
배포에 Response Headers Policy가 아예 연결돼 있지 않았다 — en.sedaily.com 리포트가
"SEO Trust Score 7.5→8.5" 근거로 든 항목. 새 정책(`ailens-security-headers`, Id
`2ffbcf45-bf62-4b60-9c15-a79569557629`) 생성 후 `DefaultCacheBehavior`에 연결:
- HSTS(`max-age=63072000; includeSubDomains; preload`), X-Content-Type-Options: nosniff,
  X-Frame-Options: SAMEORIGIN, Referrer-Policy: strict-origin-when-cross-origin.
- Permissions-Policy: `camera=(), geolocation=(), microphone=(self)` — `microphone`은
  끄지 않음(코드에 `audioCapture.ts`로 실제 음성 입력 기능이 있어 확인 후 반영).
- CSP는 프로젝트 전체에서 실제 쓰는 외부 도메인을 코드에서 grep으로 전수 확인한 뒤 작성
  (Google Fonts/GA4/API Gateway 2개·Cognito Hosted UI·ElevenLabs·YouTube·네이버TV·
  구글/카카오 OAuth 리다이렉트 도메인). `script-src`에 `unsafe-inline`/`unsafe-eval`이
  들어가는데, 이는 en.sedaily.com 리포트의 실제 "A등급" CSP도 동일하게 쓰는 표준적
  타협(Next.js 인라인 스크립트·GA4 인라인 초기화 스크립트 때문에 nonce 없이는
  피하기 어려움).

`aws cloudfront create-response-headers-policy` / `update-distribution` 둘 다 Claude
Code 자동 승인 정책(auto mode classifier)이 차단해 사용자가 직접 터미널에서 실행 —
`!` 프리픽스로 대신 실행해준 명령이었다. 배포 직후 `curl -I`로 6개 헤더 전부 응답에
실려 오는 것 확인(CloudFront 상태는 `InProgress`였지만 이미 해당 엣지에는 반영됨).

## 결정

- CSP는 기능이 실제로 깨지는지 브라우저로 직접 확인은 안 했다(이 세션 전체가 브라우저
  검증 없이 진행되는 방침) — 로그인(구글/카카오)·음성 입력·유튜브·네이버TV 임베드가
  실제로 막히지 않는지는 사용자가 직접 한 번씩 눌러보고 확인해달라고 요청해둠. CSP는
  코드만 봐서는 100% 확신하기 어려운 유일한 변경이라 이 부분만 예외적으로 육안 확인을
  권함.
- "Coverage Areas"(8개 뉴스 카테고리), "English Edition" 섹션은 en.sedaily.com
  고유 구조라 AI LENS `/about`에 그대로 옮기지 않고, AI LENS 실제 콘텐츠 구조에 맞게
  재구성(주제는 서울경제 7개 표준 카테고리로, English Edition은 "관련 사이트" 링크로
  대체).
- 개인정보처리방침·이용약관은 en.sedaily.com 실물을 참고해 작성한 **초안**이라고
  사용자에게 명시 — 법적 효력 문서라 게시 전 실제 검토를 권장했음(사용자가 승인 후
  진행하기로 함).

## 다음

- CSP 적용 후 실제 로그인/음성입력/임베드 기능이 브라우저에서 정상 동작하는지 확인 필요
  (콘솔에 CSP 위반 에러가 뜨면 해당 도메인을 CSP 허용 목록에 추가).
- HSTS `preload: true`는 헤더에만 반영됐고, 실제 Chrome/Firefox HSTS preload list
  등재는 별도로 hstspreload.org에 수동 제출해야 함(리포트의 "Immediate Action #1") —
  아직 안 함, 급하지 않아 보류.
- 개인정보처리방침·이용약관 법률 검토 — 게시 전 권장, 아직 안 됨.
- `aws cloudfront create-response-headers-policy`/`update-distribution` 류 명령이
  auto mode classifier에 걸린다는 걸 확인했다 — 다음에 CloudFront/인프라 변경이
  필요하면 처음부터 사용자가 직접 실행할 각오를 하고 명령만 준비해줄 것.

---

## 이어서 한 것 (같은 날 후속) — 사용자 요청 "빡세게" 재검증 + llms.txt/title 버그 + mbti.sedaily.ai 삭제

사용자가 구글 공식 SEO 가이드(SEO 기본 가이드, 사이트링크 문서)를 직접 붙여주며 JSON-LD·
sitemap·메타데이터·canonical을 실제로 파싱해서 철저히 검증해달라고 요청 — 다음을 실측했다.

### 검증 중 발견한 실제 버그 3건

1. **`llms.txt`가 완전히 낡아있었음.** MBTI 4-페르소나(민철·하은·준서·소율), 삭제된
   `/editors` 라우트, `/?tab=community`, 구 URL 형식(`/letters/{group-date}`)을 그대로
   AI 크롤러에게 안내하고 있었다 — f84fd06(MBTI 폐지)·오늘 초반 세션의 footer 정리 때
   `public/llms.txt`만 빠뜨렸던 것. 현재 실제 라우트·기능(레터/웹툰/단어장/RSS 등)
   기준으로 전면 재작성.
2. **레터 5개 중 1개꼴로 옛 기본값 subtitle이 그대로 노출.** `curl`로 CMS API를 직접
   조회해 최근 45편 중 5편이 subtitle `"같은 사실, 네 가지 관점으로"`(MBTI 시절 admin
   폼 기본값)를 그대로 달고 있는 걸 확인 — 이게 검색 스니펫·OG 미리보기·JSON-LD
   description에 그대로 노출되고 있었다. `letters/[id]/page.tsx`에 `usableSubtitle()`
   가드를 추가해 이 문구를 감지하면 본문 요약으로 폴백하게 수정. 모든 레터의 JSON-LD
   BreadcrumbList도 삭제된 `/editors`를 가리키고 있어 `/letters`로 수정.
3. **사이트 전체 `<title>` 중복 버그.** `layout.tsx`의 `title.template`("%s | AI LENS")이
   자동으로 브랜드명을 붙이는데, 레터 상세(전체)·웹툰 상세·about/contact/terms/privacy/
   letters·webtoon 목록/게임 등 12개 파일이 자기 title에 이미 "AI LENS"를 넣어놔서
   "...— AI LENS | AI LENS"로 중복 노출되고 있었다. `find out -name "*.html"`로 빌드
   결과물 전체를 스캔해 "AI LENS" 2회 이상 나오는 title을 찾아내는 방식으로 전수
   확인 후 전부 수정 — 가장 영향이 컸던 건 레터 상세 전체(`letters/[id]/page.tsx`의
   `title = `${letter.headline} — ${ed.name}`` 패턴)와 웹툰 상세.

### 그 외 검증(문제 없음 확인)

- sitemap.xml의 URL 44개 전부 `curl`로 상태코드 200 확인. 다만 `/letters`(전체 목록)·
  `/webtoon`(목록)·`/words`·`/style`이 `STATIC_ROUTES`에서 빠져있어 추가.
- JSON-LD를 실제로 `json.loads()`로 파싱해 NewsArticle 필수 필드(headline/datePublished/
  author/publisher/image/mainEntityOfPage) 전부 존재 확인.
- canonical — 홈·레터·웹툰 전부 `ailens.sedaily.ai`로 self-canonical, 레거시 별칭
  `mbti.sedaily.ai`도 삭제 전까지 동일하게 `ailens.sedaily.ai`로 canonical 걸려있어
  중복 콘텐츠 리스크 없었음(현재는 도메인 자체가 없어져 무의미).
- 이미지 alt 텍스트 — 레터/웹툰/영상 컴포넌트 전수 확인, 전부 의미 있는 값(제목 등)
  이거나 의도적 장식용 `alt=""`.

### 검색 노출 관련 — 정상 범위임을 확인

사용자가 구글에서 "ailens"/"ailens sedaily" 검색 시 사이트가 안 뜨고 "aliens"로
자동수정되는 스크린샷을 공유 — 기술적 결함이 아니라 신규 색인 사이트에서 흔한 현상임을
설명했다(구글이 아직 "ailens"를 브랜드로 인식할 만한 신호(백링크·클릭 데이터)가 없는
상태). en.sedaily.com 리포트의 실제 사례(첫날 순위 24.4위 → 2주 뒤 5.6위)를 근거로
제시.

### mbti.sedaily.ai 도메인 완전 삭제

사용자가 "이제 안 씁니다, ailens.sedaily.ai로 합칠 거"라고 요청. 처음엔 301 리다이렉트를
제안했으나(기존 백링크·북마크 보존) 사용자가 명확히 "삭제"를 선택 — 그대로 실행:
- Route53(`Z07543813V4FC5RK599U0`)에서 `mbti.sedaily.ai`의 A/AAAA 레코드 삭제
  (`aws route53 change-resource-record-sets`).
- CloudFront(`E1QS7PY350VHF6`) `Aliases`에서 `mbti.sedaily.ai` 제거, `ailens.sedaily.ai`만
  남김(`aws cloudfront update-distribution`).
- 코드에 남아있던 참조(`src/shared/config/auth.ts`의 Cognito `redirectSignIn`/
  `redirectSignOut` 배열) 제거.
- `curl`로 `mbti.sedaily.ai` 접속 불가(연결 실패), `ailens.sedaily.ai`는 정상(200)
  확인.
- 이번엔 `create-response-headers-policy`/`update-distribution` 둘 다 auto mode
  classifier 차단 없이 직접 실행됐다 — 어제(2026-08-07) CloudFront 보안 헤더 작업
  때는 매번 차단됐던 것과 대조적. 어떤 조건에서 막히고 안 막히는지는 불명확.

## 다음 (후속)

- Cognito User Pool `us-east-1_ZS8PgF3iX` 조회 시 `ResourceNotFoundException`을
  확인했다(auth.ts 정리 중 부수적으로 발견) — 이번 세션 스코프 밖이라 더 파지 않았지만,
  실제로 유저풀이 없어진 거라면 로그인 기능 자체가 깨져 있을 수 있다. 다음 세션에서
  로그인 플로우 점검 필요.
- 개인정보처리방침·이용약관 법률 검토는 여전히 미완.

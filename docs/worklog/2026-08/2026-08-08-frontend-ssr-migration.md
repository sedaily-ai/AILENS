# 2026-08-08 프론트엔드 SSR 전환 — S3+CloudFront 정적 export → EC2(PM2+nginx)

작성: Claude Code
관련: `docs/architecture/2026-08-07-rendering-strategy-decision.md`(이번에 재검토·뒤집힌 이전 결정),
`~/.claude/plans/cozy-squishing-balloon.md`(이 마이그레이션의 상세 실행계획, 로컬 플랜 파일)

## 배경

사용자가 admin에서 새 웹툰을 발행했는데 라이브 사이트(`ailens.sedaily.ai`)에 안 보인다고
리포트. 조사 결과 DB(DynamoDB `sedaily-mbti-cms-posts-dev`)·S3(이미지)는 정상 저장돼 있었고,
문제는 두 가지가 겹쳐 있었다:

1. `service/frontend`가 `output: 'export'`(완전 정적, 서버 없음)라 발행 후 재빌드+재배포를
   해야만 반영되는 구조적 한계.
2. 마침 그 재빌드조차 `.next/cache/fetch-cache/`에 발행 전 시점 API 응답이 stale 캐시로
   남아있어 실패 — `deploy.sh`가 빌드 전에 `.next`를 안 지워서 발생. `.next` 클린 리빌드로
   그 자리에서 즉시 해결·배포했다(이 부분은 이 문서보다 앞선 대화 턴에서 완료).

①을 두고 "발행 시 자동 재빌드(CodeBuild 트리거)"를 제안했으나 — 사실 이건 2026-08-07에
이미 "SSG + 발행 시 재빌드"로 결정했었던 것인데(`docs/architecture/2026-08-07-rendering-
strategy-decision.md`), AWS를 직접 확인해보니 그 자동화(CodeBuild 프로젝트, admin 발행 API의
트리거 코드) 자체가 애초에 구현된 적이 없었다 — 결정만 되고 실행이 안 된 상태였다.

사용자가 "재빌드 자체가 말이 안 된다, 네이버 블로그처럼 발행하면 바로 실시간으로 보여야
한다"고 요구. "다른 레터는 실시간으로 올라가지 않냐"는 반박이 있었으나 직접 확인 후 "아니네요,
그렇게 안 올라가네요"로 정정하고 **EC2 SSR 전환**을 명시적으로 지시했다. 2026-08-07 결정
당시 SSR을 기각했던 이유(SEO/AEO 우선순위, 팀의 새 스택 부담, 콜드스타트가 Core Web Vitals에
주는 악영향)를 다시 설명했지만, 사용자가 트레이드오프를 듣고도 재확정 — 이 세션에서 그
결정을 뒤집고 실행했다.

## 한 것

### 1. 계획 수립 (plan mode)

자매 사이트 en.sedaily.com(별도 저장소, 같은 AWS 계정)이 정확히 이 목표 아키텍처
(CloudFront → EC2 커스텀 오리진, ALB 없음, nginx→PM2)로 이미 운영 중인 걸 확인하고 청사진으로
삼았다. 단 그 EC2의 보안그룹(`sg-0bb3e61c52c16d0be`)이 FTP 21번 전체공개, SSH 20여 개 임시
화이트리스트, 3000/30000-30100 노출 등 방치된 설정이라 **그대로 재사용하지 않고** 최소권한으로
새로 설계했다. 상세 계획은 `~/.claude/plans/cozy-squishing-balloon.md`(레포 밖, 로컬 플랜
파일)에 있다.

### 2. 코드 변경 (`service/frontend`)

- `next.config.ts`: `output: "export"` → `output: "standalone"`.
- `letters/[id]/page.tsx`, `webtoon/[slug]/page.tsx`: `generateStaticParams` + export 전용
  placeholder 우회 코드 삭제. `letters/[id]`의 `findLetter()`는 순차 스캔(최대 14일)이던 걸
  `Promise.all` 병렬 스캔으로 개선(SSR에선 매 요청마다 돌기 때문에 레이턴시 누적 방지).
- `rss.xml/route.ts`, `sitemap.ts`: `force-static` 삭제. **`sitemap.ts`는 그냥 지우는 것만으론
  부족했다** — 내부 `fetch()`에 캐시 옵션이 없으면 Next가 자체적으로 "정적 캐시 가능"으로
  추론해 빌드 시점에 다시 고정돼버려서(직접 빌드해서 확인함), `export const dynamic =
  'force-dynamic'`을 명시적으로 추가해야 했다.
- **계획에 없었지만 빌드 결과 확인 중 추가로 발견해서 고친 것**: `/`(홈), `/letters`,
  `/webtoon` 목록 페이지 3곳도 전부 `○ Static`으로 빌드되고 있었다 — 이 페이지들의 서버
  컴포넌트가 `fetchXxx()`를 캐시 옵션 없이 호출해서 Next가 정적으로 캐싱해버렸기 때문. 이
  세 곳 다 `force-dynamic`을 안 넣으면 **애초에 이번 마이그레이션의 이유였던 "웹툰 목록에
  새 글 안 보임" 버그가 SSR로 바꿔도 똑같이 재발했을 것**이라 필수로 추가.
- `cmsPostsApi.ts`, `todayLettersApi.ts`: 모듈스코프 in-memory 캐시 TTL을 3~5분 → 20초로
  단축 — SSR에서는 이 캐시가 "빌드 1회성"이 아니라 "EC2 Node 프로세스가 떠있는 내내 전체
  방문자가 공유하는 서버 캐시"로 의미가 바뀌기 때문.
- `package.json`에 `start:ssr` 스크립트, 신규 `ecosystem.config.js`(PM2, cluster 2 인스턴스,
  `max_memory_restart: 400M`) 추가.
- 로컬에서 `next build` + `node .next/standalone/server.js`로 매 단계 검증(홈/레터상세/
  웹툰목록/웹툰상세/rss/sitemap curl 체크리스트).

### 3. AWS 인프라 프로비저닝

- **보안그룹** `sg-026385217d66ed9e1`(`ailens-ssr-prod`): 인바운드 80/tcp ← CloudFront 관리형
  프리픽스 리스트 `pl-3b927c52`만(AWS CLI로 실존 확인 후 사용). **SSH(22) 인바운드 자체가
  없음** — 대신 SSM Session Manager로 명령 실행. 3000(Next 내부 포트)도 인바운드 없음.
- **IAM 역할** `ailens-ssr-ec2-role`: `AmazonSSMManagedInstanceCore` + `CloudWatchAgentServerPolicy`
  + (아래 이유로 추가된) `ailens-ssr-releases-read`(신규 S3 버킷 하나에 대한 `GetObject`/
  `ListBucket`만, 인라인 정책). en.sedaily.com의 과도한 `S3FullAccess`/`DynamoDBFullAccess`는
  반복하지 않음.
- **EC2** `i-077eb96afcc2597d4`(t3.small, Amazon Linux 2023, VPC `vpc-07a3a75110d6594aa`
  기존 default VPC, subnet `subnet-0c6f948312e9eef83` 재사용), **EIP** `34.230.221.250`.
- **S3 버킷** `ailens-ssr-releases`(신규, 퍼블릭 액세스 전면 차단) — SSH 없이 빌드 산출물을
  EC2로 전달하기 위한 배포 아티팩트 저장소. 계획에서 "S3 경유"로 이미 예상했던 경로.
- **서버 구성**: `dnf install nodejs20 nginx` + `npm install -g pm2`(SSM `send-command`로
  원격 실행, 버전 확인: Node 20.20.2 / nginx 1.30.4 / PM2 7.0.3). nginx는 80번 → 127.0.0.1:3000
  리버스 프록시로 새로 작성(AL2023 기본 `nginx.conf`의 내장 default 서버 블록은 주석 처리해
  포트 충돌 방지). 로컬에서 `npm run build` → `.next/standalone` + `.next/static` + `public/`
  묶어 tar.gz → S3 업로드 → EC2가 SSM으로 다운로드·압축해제 → `/opt/ailens/releases/<ts>/`
  + `current` 심볼릭 링크 → `pm2 start ecosystem.config.js` → `pm2 save` →
  `pm2 startup systemd`.
- 검증: 제 로컬 IP를 SG에 **임시로**(설명에 "TEMP verification - remove before cutover"
  명시) 추가해 EIP+Host 헤더로 CloudFront와 동일한 경로 직접 확인 → 통과 후 즉시 규칙 제거.

### 4. CloudFront 컷오버

- Route53에 `origin-ailens.sedaily.ai` A레코드(→ EIP) 추가 — `ailens.sedaily.ai` alias
  자체는 안 건드림(롤백 안전장치의 핵심).
- distribution `E1QS7PY350VHF6`의 config를 **한 번의 update-distribution 호출로** 변경:
  EC2 커스텀 오리진 추가(http-only, 80번) + `DefaultCacheBehavior.TargetOriginId`를 S3 →
  EC2로 교체 + `CachePolicyId`를 Managed-CachingOptimized → **Managed-CachingDisabled**로
  교체(엣지 캐시가 "즉시 반영"을 막지 않도록) + `sedaily-mbti-letter-html-rewrite`
  CloudFront Function detach(정적 export 전용 `.html`/`.txt` 강제 URL rewrite라 SSR에선
  오히려 깨짐) + `/_next/static/*` 전용 캐시 비헤이비어 추가(EC2 오리진 + CachingOptimized
  장기캐시 유지). **S3 오리진 자체는 config에서 안 지움** — 롤백용.
- 배포 완료 대기(`wait distribution-deployed`) → 전체 invalidate → 실도메인 검증.

### 5. 컷오버 중 발견해서 즉시 고친 버그 — `DefaultRootObject`

첫 컷오버 직후 `https://ailens.sedaily.ai/`(홈)만 404. distribution의
`DefaultRootObject`가 정적 export 시절 값(`"index.html"`)으로 남아있어서, CloudFront가
`/` 요청을 `/index.html`로 바꿔 오리진에 전달하고 있었다 — SSR 서버는 그런 리터럴 경로가
없어(Next 라우터는 `/`를 서빙하지 `index.html`을 서빙하지 않음) 404. `DefaultRootObject`를
빈 문자열로 바꾸고 재배포·재검증해서 해결.

## 검증

실도메인(`https://ailens.sedaily.ai`) 기준:
- 홈 200(477KB, 실콘텐츠 확인), `/letters` 200, `/webtoon` 200(2026-08-06·2026-08-08 둘 다
  노출 — 애초에 이번 전체 작업의 발단이었던 버그가 재빌드 없이 해결됐음을 실증), 웹툰 상세
  200, `/rss.xml` 200, `/sitemap.xml` 200, `/_next/static/*` 청크 200.
- 응답 헤더: `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`,
  `X-Cache: Miss from cloudfront` — 엣지 캐시가 아니라 매 요청이 실제로 EC2까지 가는 것
  확인. `Via: CloudFront` — 트래픽이 CloudFront를 정상적으로 거침. 이전 세션에서 붙인 보안
  헤더(CSP/HSTS)도 `ResponseHeadersPolicyId`를 그대로 승계해 살아있음.

## 결정

- SSR 채택 자체는 사용자의 명시적 재확정(트레이드오프 재설명 후에도 유지)에 따른 것 —
  2026-08-07 결정을 뒤집는 결정이라 이 문서에 왜 뒤집혔는지 남긴다.
- CodeBuild 자동 재빌드(더 작은 변경)보다 EC2 SSR(더 큰 변경)을 택함 — "발행 즉시 반영"을
  진짜 즉시로 만들 수 있는 유일한 방법이라 판단.
- en.sedaily.com의 EC2 패턴(CloudFront가 EC2에 직접 커스텀 오리진, ALB 없음)을 그대로
  따름 — 이미 검증된 경로라 리스크가 낮음. 단 보안그룹·IAM은 그 사이트의 방치된 설정을
  절대 복제하지 않고 최소권한으로 새로 설계.
- admin 발행 → EC2로 알리는 명시적 webhook(`revalidatePath` 등)은 **이번에 안 만듦** —
  캐시 TTL 20초 단축만으로 "즉시"라는 요구를 실용적으로 충족한다고 판단, webhook까지 가면
  스코프(공유 시크릿, EC2 다운 시 발행 흐름 안 막는 예외처리)가 커져서 후속 과제로 미룸.
- CloudFront Origin Group(EC2 장애 시 S3로 자동 failover)도 이번엔 안 만듦 — 안정화 후
  별도 제안.

## 후속 — 캐시 완전 제거 ("무조건 실시간성")

컷오버 직후 실사용 테스트 중 admin에서 삭제한 글("222")이 홈 두 섹션("요즘 가장 많이 읽힌
글" — `SideRail.tsx`, "이번 주 인기 칼럼" — `ColumnPreviewSection.tsx`)에 계속 남아있는
문제를 사용자가 발견. DynamoDB·API(`/api/v2/posts`, `/api/v2/today-letters`) 전부 확인한
결과 백엔드는 완전히 깨끗했고, 원인은 브라우저 sessionStorage에 남아있던 캐시(배포 전 코드가
3~5분 TTL로 써둔 값)였다.

사용자가 "디시인사이드처럼 CRUD가 무조건 실시간이어야 한다"고 명확히 요구 — 논의 결과
"admin이 다른 사용자의 브라우저 캐시를 지울 방법은 없다(웹소켓 등 실시간 푸시 인프라 없이는)"
는 점을 설명하고, 대신 **애초에 클라이언트에 지속 캐시를 두지 않는** 방향으로 확정:

- `cmsPostsApi.ts`, `todayLettersApi.ts`: `readSession`/`writeSession`(sessionStorage) 완전
  삭제. 모듈스코프 `Map` 캐시도 TTL 기반에서 **진행 중 요청만 묶는 in-flight coalescing**으로
  교체(응답이 오는 즉시 캐시에서 제거 — 같은 페이지 안에서 동시에 여러 섹션이 같은 API를
  부를 때만 중복 요청을 줄이고, 그 다음 호출은 항상 새 네트워크 요청).
- 두 파일의 raw `fetch()` 호출 6곳에 `cache: 'no-store'`를 다시 추가 — 이것들은 원래
  2026-08-07(정적 export 시절)에 "빌드 시 워커 여러 개가 동시에 같은 URL을 fetch하다 실패"
  하는 문제 때문에 뺐던 건데, SSR인 지금은 그 문제 자체가 없다(빌드타임 다중워커 프리렌더가
  없음). 없으면 Next의 자체 fetch 캐시가 응답을 재사용해버릴 위험이 있다(`sitemap.ts`의
  `force-dynamic` 미적용 때 겪은 것과 같은 종류의 문제).
- 로컬 빌드 검증(라우트 dynamic 마킹 동일) → EC2에 릴리스 재배포(S3 업로드 → release
  디렉터리 → `pm2 reload`, 무중단) → 실도메인에서 홈/레터목록 200 + `today-letters` API로
  "222" 완전히 사라진 것 재확인.

### 결정 (후속)

- 진짜 실시간(웹소켓/SSE로 admin 액션을 다른 사용자 브라우저에 즉시 push)은 이번엔 안 함 —
  이 서비스 규모에 과한 인프라라고 판단, "클라이언트 캐시를 아예 없애 매 로드가 항상 서버를
  다시 묻게 한다"만으로 사용자가 원하는 "체감 실시간"은 충분히 달성됨.
- in-flight coalescing(TTL 없음)은 유지 — 이건 신선도를 절대 희생하지 않으면서(다음 호출은
  무조건 새 요청) 동시 다발 요청만 줄여주는, 순수하게 이득만 있는 최적화라 제거할 이유가 없음.

## 다음

- **admin 발행 → EC2 반영 실제 왕복 테스트**: 이번엔 이미 발행돼 있던 두 웹툰이 재빌드
  없이 뜨는 것으로 간접 검증했지만, admin에서 새 글을 발행→20~30초 내 반영→unpublish까지
  직접 왕복 테스트는 아직 안 해봄.
- **PM2 재부팅 복구 실제 검증**: `pm2 startup systemd` + `pm2 save`는 해뒀지만 실제
  인스턴스 재부팅으로 복구되는지는 아직 안 해봄.
- **CloudWatch 모니터링**: PM2/nginx 로그를 CloudWatch Agent로 보내는 것, EC2 status check
  실패 자동복구 알람 — 계획에는 있었지만 이번 세션에서 실행은 안 함.
- **CloudFront Origin Group failover**: 위 "결정" 참조, 안정화 후 별도 세션.
- **S3 구정적 콘텐츠 정리 시점**: 롤백 안전망으로 당분간 유지, 안정화되면(1~2주?) 별도
  worklog 남기고 정리할지 결정.
- **비용 실측**: 예상 순증분 월 $17~20(t3.small+EBS)이었는데, 실제 청구서로 확인은 아직.
- ~~`docs/architecture/2026-08-07-rendering-strategy-decision.md` 갱신~~ — 완료(위 "후속"
  섹션 작업 중 상단에 정정 노트 추가함).
- **admin 이미지 업로드 실패 리포트(미해결)**: 사용자가 웹툰 컷 2번째 이미지 업로드가
  실패했다고 리포트했으나 원인 미확정 상태로 다른 이슈(삭제 반영 안 됨)로 넘어감. admin
  Lambda 로그(`sedaily-mbti-admin-api-dev`)엔 해당 시간대 presign 요청이 1건(성공)뿐이라
  두 번째 업로드는 서버까지 요청이 안 간 것으로 보임 — `admin/frontend/src/lib/uploadImage.ts`
  의 클라이언트 사이드 10MB 용량 체크(presign 호출 전에 막음)가 유력 후보. 실제 에러 토스트
  문구·재현 필요.

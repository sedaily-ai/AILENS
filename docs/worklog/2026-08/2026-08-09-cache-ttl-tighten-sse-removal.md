# 2026-08-09 캐시 TTL 5초 단축 + SSE 아키텍처 제거 (지침서 적용)

작성: Claude Code
관련: 커밋 da4cfb4 (main), EC2 릴리스 `20260808-151642`, admin Lambda 재배포,
CloudFront `E1QS7PY350VHF6` 비헤이비어 정리

## 배경

전날(2026-08-08) admin에서 글을 수정했는데 이미 열려있던 새 창에서 새로고침해도
반영이 안 되는 것처럼 보인 사고를 실제로 조사했다 — DB(DynamoDB `sedaily-mbti-cms-posts-dev`)
· 공개 API(`/api/v2/posts`) · SSR 서버(EC2) 전부 이미 정상 반영돼 있었고, "저장 직후
곧바로 새로고침"이 admin→프론트 webhook 도착 전 타이밍과 겹친 것으로 결론 냈다(당시
`REVALIDATE_SECRET`가 PM2 프로세스에 안 실려 있는 것처럼 보였던 건 `pm2 env`로 확인한
게 오판이었다 — `.env.production.local`을 Next가 직접 로드하는 방식이라 `pm2 env`엔
안 잡힘, 실제로는 정상 로드돼 있었음. `/api/revalidate`를 직접 secret으로 호출해
200을 확인하며 정정).

이 조사 직후 사용자가 범용 "언론사 CMS 캐싱 아키텍처 지침서"(Redis/RDS Read Replica
전제, SSE 불필요·짧은 TTL 재검증으로 충분하다는 입장)를 붙여넣고 적용을 요청했다.

## 한 것

1. **코드 감사** — 지침서 항목을 실제 스택(DynamoDB + Next SSR on EC2/PM2 + CloudFront,
   Redis·RDS 없음)에 매핑. 태그 기반 무효화·webhook·soft delete(`posts_repo.py`의
   `deleted_at`)·긴급삭제 동기처리는 이미 충족돼 있었음을 확인. 진짜 갭은 TTL(60초)과
   admin 응답 헤더(Cache-Control 자체가 없음) 둘뿐이었다.
2. 사용자 확답으로 스코프 확정: SSE 제거, 실패 알림(Slack/CloudWatch)은 스킵, CMS
   상태값(REVIEW 단계 등)은 현행 유지.
3. **콘텐츠 fetch revalidate 60초 → 5초** — `cmsPostsApi.ts` 6곳,
   `letters/[id]/page.tsx`, `sitemap.ts`. `todayLettersApi.ts`의 60초는 죽은
   `/api/v2/today-letters`(RDS) 호출이라 안 건드림.
4. **SSE 아키텍처 전체 제거** — `widgets/LiveRevalidateListener/`,
   `shared/lib/sseHub.ts`, `app/api/events/route.ts` 삭제. `providers.tsx`와
   `app/api/revalidate/route.ts`에서 참조 제거(`revalidateTag()` 무효화 자체는 유지).
   PM2는 fork/1-instance 그대로 유지 — SSE 때문이 아니라 Next Data Cache가 cluster
   멀티프로세스에서 워커마다 따로 노는 문제 때문에 고정한 것이라 무관.
5. **admin 응답에 `Cache-Control: no-store`** — `admin/backend/shared/response.py`의
   `ok()`/`err()`에서만 추가. `common/http.py`(v1/v2 공개 콘텐츠 API와 공유하는 CORS
   중립 모듈)에는 안 얹었다 — 공개 콘텐츠는 반대로 캐시가 돼야 하므로.
6. 검증: `tsc`/`eslint`/`npm run build`(frontend+admin) 통과, admin pytest 135개 통과,
   로컬 standalone 서버로 `/api/revalidate`(200)·`/api/events`(404) 확인.
7. 배포: git push → EC2에 새 릴리스(`ailens-ssr-releases` S3 버킷 경유, `/opt/ailens/releases/
   20260808-151642` → `current` 심볼릭 링크 전환 → `pm2 restart ailens-frontend
   --update-env`) → `admin/backend/deploy-admin-api.sh`로 admin Lambda 갱신 →
   CloudFront `E1QS7PY350VHF6`에서 `/api/events` 캐시 비헤이비어 제거(`update-distribution`).
   실서비스에서 `s-maxage=5` 헤더, `/api/events` 404, admin 응답 `cache-control: no-store`
   전부 실측 확인.

## 결정

- SSE는 실제로 동작하던 기능이었지만(이날 아침 완성·배포) "이미 열려있는 탭에 서버가
  능동 push"하는 요구가 실사용에서 확인되지 않았고, 짧은 TTL 재검증만으로 사용자가
  요구한 "요청-응답 기반 최신성"을 충분히 만족한다고 판단해 사용자 확답을 거쳐 제거했다.
  되살릴 필요가 생기면 이 워크로그 이전 커밋(`fc3fead`~`c98f949` 근방, 8/8 SSE
  아키텍처 도입 시점)을 참조.
- Redis/RDS Read Replica 등 지침서의 나머지 항목은 우리 스택에 아예 없는 레이어라
  도입하지 않음(오버엔지니어링 회피, MAU 30만 목표에 모놀리식 유지 원칙과 일치).
- 배포용 EC2 릴리스 스크립트가 저장소에 커밋돼 있지 않다 — 이번에도 수동으로
  build→tar.gz→S3→SSM extract→symlink→pm2 restart 과정을 그대로 재현했다. 반복 작업이니
  다음에 또 필요하면 `service/frontend/deploy-ssr.sh`로 스크립트화하는 게 나아 보인다.

## 다음

- **EC2 SSR 배포 스크립트 커밋 필요** — 현재 `service/frontend/deploy.sh`는 마이그레이션
  이전의 정적 export(S3+CloudFront) 배포용으로 stale하다. 실제 배포 절차(release
  tar.gz→S3→SSM extract→symlink→pm2 restart)를 스크립트로 남겨두지 않으면 다음 세션도
  매번 수동 재현해야 한다.
- 알림(webhook 실패 시 Slack/CloudWatch)은 이번에 스킵했다 — 필요해지면
  `cost_monitoring.sh`의 CloudWatch Alarm→SNS 패턴을 재사용할 수 있다는 조사 결과를
  남겨둔다.

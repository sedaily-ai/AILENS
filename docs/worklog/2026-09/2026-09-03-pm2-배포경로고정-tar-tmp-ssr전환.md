# 2026-09-03 배포 파이프라인 근본 버그 3종 + 아카이브 페이지네이션 SSR 전환

작성: Claude Code
관련: `service/frontend/deploy.sh`, `lens/webtoon/video/listen` `page/[n]/page.tsx`

## 배경

당일 세션에서 letters→lens 데이터 소스 전환 + ArticlePageShell 추출(별도
작업, 이미 커밋·머지됨)을 배포하려고 `deploy.sh`를 돌렸는데, 4/5(EC2 릴리스
전환) 단계에서 3번 연속 실패했다. 세 번 다 원인이 달랐고, 그 중 하나는
**오늘까지의 모든 배포가 실제로는 프로덕션에 반영되지 않았을 수 있다**는
심각한 발견으로 이어졌다.

## 한 것

### 1. tar macOS xattr — EC2(GNU tar)가 못 읽는 확장 헤더
- `public/`의 다운로드된 jpg 2개가 macOS 전용 xattr(`com.apple.quarantine`
  등)을 갖고 있었고, 맥에서 `tar -czf`로 패키징할 때 이게 PAX 확장
  헤더로 아카이브에 같이 담겼다. EC2(Linux, GNU tar)가 이 키워드를 몰라
  "Ignoring unknown extended header keyword" 경고를 내며 비정상 종료 →
  `set -e`가 배포를 중단시켰다.
- 1차 시도 `COPYFILE_DISABLE=1`은 **틀렸다** — 로컬 재현으로 직접 확인:
  최신 macOS(Darwin 25+)의 `cp -r`은 이 env var를 줘도 xattr을 그대로
  복사한다. 최종 수정: `tar --no-xattrs --no-mac-metadata --no-acls
  --no-fflags`로 아카이브 "생성" 시점에 아예 안 담기게 함(소스 파일이
  xattr을 갖고 있든 말든 무관하게 동작 — 로컬 재현으로 검증).

### 2. PM2가 최초 등록 경로를 영원히 재사용 — 오늘까지의 배포가 무효했을 가능성
- `pm2 restart <name>`은 **이미 등록된 프로세스 정의를 그대로 재실행**할
  뿐, 스크립트 경로를 갱신하지 않는다. `pm2 describe`로 확인한 실제 상태:
  script path가 `/opt/ailens/releases/20260903-052934/server.js`(오늘
  새벽 05:29 릴리스)로 고정돼 있었다 — `current` 심볼릭 링크는 매 배포
  최신 릴리스를 가리켜도, **PM2가 실제로 실행하던 코드는 계속 그 옛
  릴리스였다**. 즉 이 EC2를 세팅한 이후의 모든 "성공한" 배포가 실제로는
  프로덕션에 반영 안 됐을 가능성이 있다는 뜻.
- 오늘 배포 도중 그 옛 릴리스 폴더가 `deploy.sh`의 보존정리(최신 2개만
  유지)로 삭제되자, `pm2 restart`가 재시작할 파일을 못 찾아 502가 났다
  (`local_status=000`, `curl`로 connection refused 직접 확인).
- 수정: `pm2 delete {process} || true` 후 `cd /opt/ailens/current && pm2
  start server.js --name {process} --cwd /opt/ailens/current
  --update-env` + `pm2 save`로 매 배포마다 프로세스 정의 자체를 새로
  등록 — `current` 심볼릭 링크를 항상 새로 따라가게 함.
- 부수 수정: 재시작 직후 고정 2초 대기 + curl 1회 헬스체크는 서버가 아직
  포트 바인딩 전이라 오탐 실패(`curl` 자체 종료코드 7 = connection
  refused)를 내고 `set -e`로 배포를 죽였다 — 최대 10초까지 1초 간격
  재시도로 교체.

### 3. `/tmp`(RAM 기반 957MB tmpfs) 용량 부족 — 실패한 배포의 잔해 누적
- 오늘 실패한 배포 3번이 전부 자기 정리 라인(`rm -f /tmp/{ts}.tar.gz`,
  배포 끝부분)까지 못 가고 죽어서 `/tmp`에 ~330MB짜리 tarball 3개(총
  949M)가 쌓였다. `/tmp`는 루트 볼륨(40GB, 여유 충분)이 아니라 **별도
  tmpfs(957MB 고정, RAM 기반)**라 기존 디스크 사전확인(`df --output=avail
  -k /`)이 이 문제를 전혀 못 잡았다 — 다음 배포의 S3→`/tmp` 다운로드가
  `[Errno 28] No space left on device`로 실패.
- 수정: `deploy.sh`의 EC2 릴리스 정리 로직(배포 "시작" 시점에 청소하는
  기존 원칙과 동일 위치)에 `rm -f /tmp/*.tar.gz` 추가 — 실패한 배포의
  잔해가 다음 배포를 막지 못하게.

### 4. 아카이브 페이지네이션 SSR 전환 (사용자 요청 — "빌드마다 정적생성 짜증나는데 SSR이 해결하나")
- 사용자에게 "완전 SSR"과 "페이지네이션만 SSR" 트레이드오프 설명 —
  `[slug]` 상세 페이지는 `generateStaticParams`가 없으면 `<Link>` 자동
  프리페치가 꺼진다(코드 주석에 이미 문서화된 이유)는 게 핵심 논거.
  사용자가 "권장하는 방식"(페이지네이션만) 선택.
- `lens/webtoon/video/listen`의 `page/[n]/page.tsx` 4개에서
  `generateStaticParams()` 완전 제거(+ 이제 안 쓰는 `*_PAGE_SIZE` import
  정리). `[slug]` 상세 페이지 4개(`STATIC_PARAMS_LIMIT=10`)와
  `webtoon/series/[slug]`는 그대로 둠 — 프리페치·SEO 유지.
- 검증(로컬 빌드): 전체 정적 페이지 289→135(-53%), 정적 생성 단계
  144초→91초(-37%), route table에서 `page/[n]` 4개는 `ƒ Dynamic`,
  `[slug]` 4개+`webtoon/series/[slug]`는 `●` SSG 그대로 유지 확인.
- 배포 후 실측: 릴리스 tarball 320M→**40M**(-87%, 예상보다 훨씬 큰
  절감 — 페이지네이션 페이지들의 사전렌더 HTML/데이터가 생각보다
  release 크기를 많이 차지하고 있었다는 뜻).

## 결정

- `COPYFILE_DISABLE=1`(1차 시도) 대신 `tar --no-xattrs` 등 명시적
  플래그를 최종 채택 — 전자는 macOS 버전에 따라 안 먹힐 수 있다는 걸
  직접 재현으로 확인했고, 후자는 소스 파일 상태와 무관하게 확실히
  동작.
- 완전 SSR이 아니라 "페이지네이션만 SSR" — 근본 원인 우선 원칙을
  "안 쓰는 낭비(아카이브 뒷장)를 걷어내는 것"으로 해석. 상세 페이지의
  `<Link>` 프리페치·체감 속도는 실사용자 영향이 커서 지킴.
- Docker/ECS Fargate 전환은 **오늘 범위 밖** — 세 버그 전부의 공통
  근본 원인("가변 서버에 계속 덧쓰기")이라는 점을 사용자와 논의했고,
  이 레포의 파이프라인(mustknow_auto 등)이 이미 그 패턴이라 프런트엔드도
  옮기면 인프라가 일관돼진다는 데 의견 일치 — 별도 프로젝트로 남김.

## 다음

- Docker/ECS Fargate로 프런트엔드 배포 전환 — 사용자가 관심 표명, 아직
  착수 안 함. ECR 이미지 빌드(CI), ECS 서비스·태스크 정의, 무중단 배포
  전략(rolling/blue-green) 설계 필요.
- PM2가 왜 애초에 절대경로(심볼릭 링크 미경유)로 최초 등록됐는지는
  끝까지 못 밝힘 — 이 EC2 최초 세팅 스크립트(오늘 세션 범위 밖)를
  확인해볼 것. 지금은 재발 방지(delete+start)로 덮었지만, 원인 자체를
  알아두면 좋음.

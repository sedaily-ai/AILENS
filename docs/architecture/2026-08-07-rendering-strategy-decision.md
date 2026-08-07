# 2026-08-07 렌더링 전략 결정 — SSG + 발행 시 재빌드 (서버 없음)

작성: Claude Code (사용자와의 논의 결과 기록)
관련: `docs/worklog/2026-08/2026-08-07-cloudfront-rsc-navigation-bug.md`(이 논의의 발단이 된
버그), 계획 파일 `~/.claude/plans/cozy-squishing-balloon.md`

## 배경 — 왜 이 논의가 시작됐나

2026-08-07, 홈 화면 웹툰 카드 클릭이 상세 페이지로 안 넘어가는 버그를 추적하다가 근본 원인을
발견했다: `service/frontend`는 `output: 'export'`(정적 export, 서버 없음)인데 콘텐츠 식별을
`?id=` 쿼리스트링으로 하면서 동시에 Next.js의 RSC 클라이언트 라우팅(서버가 있어야 정상 동작)을
쓰려 했다. 서버 없이 CloudFront Function으로 RSC 폴백을 흉내 내다 깨진 게 그날의 버그였다
(경위: 위 worklog 참조).

이 사고를 계기로 "애초에 렌더링 전략을 어떻게 가져가야 하는가"를 처음부터 다시 논의했다.
사용자는 매일 기사를 발행할 계획이고, **SEO/AEO/GEO 검색·답변엔진 노출이 최우선 순위**라고
확인했다.

## 검토한 대안들

### 1. 정적 export 유지, 버그만 땜빵 (기각)
크롤러가 원본 HTML만 보고 판단하는 게 문제의 핵심인데, 현재 상세 페이지는 브라우저에서 JS로
데이터를 채우는 방식(CSR)이라 JS를 안 돌리는 크롤러(Bing, 그리고 특히 AEO/GEO 계열 —
PerplexityBot 등)에게는 빈 페이지로 보인다. SEO가 최우선 순위인데 이 핵심 문제를 안 고치는
선택지라 목표와 정면으로 충돌 — 기각.

### 2. SSR + On-Demand ISR on EC2 (en.sedaily.com 패턴 그대로) (기각)
회사가 이미 운영 중인 영문사이트(`sedaily-ai/AI-GLOBE-ensedaily`, en.sedaily.com)가 정확히
이 패턴(Next.js standalone + PM2 + nginx, EC2 t3.medium)으로 SSR+ISR을 실전 운영 중이라는
걸 확인하고, 처음엔 이 패턴을 그대로 이식하려 했다. t3.small(2vCPU/2GB, 월 ~$15)로 시작하는
안까지 구체적으로 설계했었다.

### 3. SSR + On-Demand ISR on Lambda (OpenNext) (기각)
BBC(서버리스 Lambda, 초당 최대 2000회 처리 — InfoQ/Medium 공개 사례)와 Vercel의 On-Demand
ISR 권고안을 근거로, "성공했을 때도 안 무너지는" 구조로 처음부터 서버리스로 가는 안도 검토했다.
자동 확장이라는 실질적 이점은 있으나:
- OpenNext(Next.js→Lambda 변환 도구)는 팀이 가진 두 Next.js 프로젝트(영문사이트, AI LENS)
  어디에도 사용 경험이 없는 새 스택.
- 서버 함수 + ISR 캐시(S3+DynamoDB) + 재검증 큐(SQS) + CloudFront 배선까지 구성 요소가
  EC2 대비 훨씬 많아 디버깅 난이도가 높음.
- SSR 콜드 스타트가 있어 Core Web Vitals(실제 SEO 랭킹 신호)에 역효과를 낼 수 있음.
- BBC 사례를 그대로 벤치마킹하는 건 규모·전담 인력 차이를 무시한 survivorship bias에
  가깝다고 판단.

### 4. SSG + 발행 시 재빌드 (채택)
판단 기준을 하나로 좁혔다: **"이 페이지 내용이, 같은 순간에 두 사람이 봤을 때 서로 다른가?"**
- 다르다 → 서버(SSR) 필요.
- 같다 → 서버 불필요(SSG로 충분).

AI LENS의 기사·레터·웹툰 본문은 누가 언제 보든 동일한 콘텐츠다. 서버가 SSG 대비 주는 두 가지
이점 — ① 사람마다 다른 결과, ② 빌드 시점 이후 즉시 반영 — 중 ①은 애초에 해당 없고, ②는
"발행 시 재빌드"로 충분히 해결된다. 남은 유일한 변수는 재빌드 시간이었고, 이건 의견이 아니라
실측 가능한 숫자였다.

## 실측 근거

2026-08-07, dev2 체크아웃에서 직접 측정:

```
$ cd service/frontend && time npm run build
...
npm run build  29.73s user 4.41s system 170% cpu 20.061 total
```

**전체 재빌드 20.06초** (현재 콘텐츠 규모 기준, 라우트 26개). "몇십 초~1~2분대면 SSG 확정,
5분 이상이거나 발행자가 기다리기 부담스러운 수준이면 그때 서버 재논의"라는 기준을 세워뒀고,
이 숫자는 기준을 명확히 만족한다.

## 최종 결정

**SSG(정적 export 유지) + 발행 시 자동 재빌드.** 새 서버 인프라(EC2/Lambda/DynamoDB/SQS)
없음. 기존 S3+CloudFront+`deploy.sh` 그대로 두고, admin의 발행 API가 AWS CodeBuild를
트리거해서 재빌드→S3 업로드→CloudFront 무효화를 자동화한다.

### 지금 확정하는 것 (나중에 바꾸면 손해가 큼 — 먼저 확정)
1. **URL — 경로 기반 + 의미 있는 슬러그.** 쿼리스트링(`?id=`)으로 시작하지 않는다. SEO
   자산(색인·백링크·순위)은 시간이 쌓여야 힘을 발휘하고, URL을 나중에 바꾸면 그 자산이
   리셋될 위험이 있다.
2. **구조화 마크업 — 처음부터.** JSON-LD(`NewsArticle`), `sitemap.xml`(발행 시 자동 갱신),
   `robots.txt`(AI 크롤러 허용 확인).

### 나중에 재검토할 것
재빌드 시간이 아카이브 증가로 실제 부담되는 수준(5분 이상, 또는 발행자가 체감할 만큼)에
도달하면 그때 서버 도입을 재논의한다. 1순위 후보는 en.sedaily.com이 이미 검증한 EC2+PM2
패턴 — Lambda/OpenNext보다 팀 숙련도·디버깅 난이도 면에서 리스크가 낮다. 다만 이때도
en.sedaily.com의 선택이 "검증된 정답"이라서가 아니라 "그때 그렇게 되어 있었던 것"이라는
점은 구분해서 판단할 것 — 그 시점의 실제 트래픽·팀 상황에 맞게 다시 비교할 것.

이 결정의 실행 계획은 `~/.claude/plans/cozy-squishing-balloon.md`(로컬 플랜 파일, 레포
밖)에 단계별로 정리돼 있다.

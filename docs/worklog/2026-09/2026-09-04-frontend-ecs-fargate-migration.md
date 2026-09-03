# 2026-09-04 프런트엔드 EC2+PM2 → Docker+ECS Fargate 마이그레이션

작성: Claude Code
관련: `service/frontend/Dockerfile`, `provision-fargate.sh`, `deploy.sh`,
`taskdef.json`, CloudFront `E1QS7PY350VHF6`

## 배경

전날(2026-09-03) 세션에서 `deploy.sh` 배포가 3번 연속 실패했고, 근본 원인이
전부 "가변 EC2 서버에 계속 덧쓰기" 구조의 증상이었다(tar xattr, pm2
restart가 최초 등록 경로를 영원히 재사용, 실패한 배포 잔해가 `/tmp`를
채움 — 자세한 경위는 `2026-09-03-pm2-배포경로고정-tar-tmp-ssr전환.md`
참조). 사용자가 "근본적으로 완벽한" 해결을 요청 — 이 레포의 파이프라인
(`mustknow_auto`/`frontpage_auto`)이 이미 Docker+ECS Fargate로 이 문제
클래스(가변 서버 상태 누적)를 원천 차단하고 있어 프런트엔드도 같은
패턴으로 옮겼다.

## 한 것

Plan Mode로 3개 Explore 에이전트 병렬 조사(파이프라인의 Docker/ECS
컨벤션, 현재 EC2/CloudFront 인프라, Next.js 런타임 요구사항) → 계획
승인 → 구현.

### 1. 신규 파일 (`service/frontend/`)
- `Dockerfile` — 멀티스테이지(`node:20-bookworm` 빌더 → `node:20-bookworm-slim`
  러너), `output: "standalone"` 산출물을 그대로 컨테이너에 담음.
- `taskdef.json` — Fargate 태스크 정의(512 CPU/1024 MB, ARM64), 
  `REVALIDATE_SECRET`을 ECS `secrets`(SSM Parameter Store, 기존
  `/sedaily-mbti/ssr-revalidate-secret` 재사용)로 컨테이너 시작 시 주입
  — 예전처럼 배포마다 평문 파일을 복사해 이어받지 않는다.
- `trust-policy-ecs-tasks.json`, `execution-role-secrets-policy.json`,
  `tags-ecs.json` — IAM/태그 설정 파일.
- `provision-fargate.sh` — 1회성 인프라 프로비저닝 기록(ECR→IAM 2개
  역할→로그그룹→보안그룹 2개→ALB+타깃그룹+리스너→ECS 클러스터→태스크
  정의→서비스). `pipelines/frontpage_auto/provision.sh`와 같은 컨벤션
  (CDK/CloudFormation 안 씀).
- `deploy.sh` 교체(EC2/PM2 버전은 git 히스토리 참조) — 이미지
  빌드·push→태스크 정의 새 리비전 등록→`ecs update-service
  --force-new-deployment`→`wait services-stable`→ALB 헬스체크.

### 2. 실제 프로비저닝한 AWS 자원 (계정 887078546492, us-east-1)
- ECR: `sedaily-lens-frontend`
- IAM: `sedaily-lens-frontend-execution-role`(AmazonECSTaskExecutionRolePolicy
  + SSM/KMS 인라인), `sedaily-lens-frontend-task-role`(빈 역할, 확장 대비)
- 보안그룹: `sedaily-lens-frontend-alb-sg`(80 ← CloudFront prefix list
  `pl-3b927c52`만), `sedaily-lens-frontend-task-sg`(3000 ← ALB SG만)
- ALB `sedaily-lens-frontend-alb` + 타깃그룹(포트 3000, health check `/`)
  — 기존 퍼블릭 서브넷 2개(`subnet-0c6f948312e9eef83` us-east-1f,
  `subnet-0b5a146ca8ed1ddfe` us-east-1d) 재사용, 새 서브넷 안 만듦.
- ECS 클러스터 `sedaily-lens-frontend` + 서비스(desiredCount=1,
  `propagateTags: TASK_DEFINITION`)

### 3. 발견·수정한 프로비저닝 스크립트 버그
`aws ecs create-cluster --tags`는 ECR과 달리 **소문자** `key`/`value`
필드를 요구한다(대문자 `Key`/`Value`를 주면 파라미터 검증 에러) —
`pipelines/frontpage_auto/provision.sh`의 주석("`ecr, ecs cluster` 둘 다
`TAGS_JSON`")이 부정확했던 걸 실제 실행으로 발견, `TAGS_JSON_ECS`(소문자)
변수를 별도로 분리해 수정.

### 4. 검증
- 로컬: `docker build --platform linux/arm64` 성공, `docker run`으로
  로컬 렌더 확인(`/`, `/lens`, `/webtoon` 200).
- 배포 후: ECS 서비스 RUNNING+stable, ALB 타깃 healthy.
- 비용태그: `aws ecs list-tags-for-resource`로 **실행 중인 태스크**에
  `Service=atlas4` 등 실제 부착 확인(task-definition 태그만으론 부족 —
  `docs/architecture/비용태깅_규칙.md` §5 그대로 실측 검증).
- ALB DNS 직접 확인 시 자기 IP를 임시로 SG에 허용 → curl(3개 라우트
  200) → 즉시 `revoke-security-group-ingress`로 원복(최소 권한 원칙).
- **CloudFront 오리진 스왑**(`E1QS7PY350VHF6`의 `EC2-ailens-ssr` 오리진
  DomainName을 `origin-ailens.sedaily.ai`(EC2 IP) → ALB DNS로 교체,
  http-only/포트80 그대로 유지) — 사용자 명시 승인 후 진행, 배포
  전파(`Deployed`) 확인 후 실도메인(`https://ailens.sedaily.ai/`) 헬스체크:
  `/`, `/lens`, `/webtoon/page/2`, `/video` 전부 200, 응답 헤더에
  `x-powered-by: Next.js`·`via: CloudFront`로 실제 새 경로 확인.

## 결정

- 리소스명 `sedaily-lens-frontend-*`(사용자 결정 — 파이프라인
  `sedaily-lens-*`와 일관), CPU ARM64/Graviton(사용자 결정 — 파이프라인과
  동일, 비용 절감).
- ALB가 필수라고 판단 — Fargate 태스크는 고정 IP가 없어 CloudFront
  커스텀 오리진(고정 도메인 필요)으로 직접 못 씀.
- 태스크 사이즈 512 CPU/1024 MB로 보수적으로 시작(기존 EC2
  t3.small=2vCPU/2GB보다 작게) — 실 부하 관찰 후 필요시 조정.
- EC2(`ailens-ssr-*`)는 **즉시 삭제하지 않고 유지** — 문제 생기면
  CloudFront 오리진을 즉시 되돌릴 롤백 경로. 삭제는 별도 세션에서.

## 다음

- 수일간 Fargate 서비스 관찰(에러율·지연시간·재시작 횟수) — 문제
  없으면 EC2 인스턴스·관련 IAM 역할·S3 릴리스 버킷 등 EC2/PM2 전용
  자원 정리를 별도 세션 작업으로 진행.
- 태스크 사이즈(512/1024)가 실제 트래픽에 부족한지 CloudWatch
  CPUUtilization/MemoryUtilization으로 확인 필요.
- HA 원하면 `desiredCount`를 1→2로(현재는 단일 태스크 — EC2 시절과
  동일한 단일 인스턴스 수준의 가용성, 개선 여지).
- GitHub Actions 등 CI 자동화는 이번 범위 밖 — 레포 컨벤션(수동
  `deploy.sh`) 유지, 도입은 별도 논의.

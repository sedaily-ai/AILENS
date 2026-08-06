# CLAUDE.md

## ⚠️ 세션 시작 전 반드시 읽을 것 — 로컬에 체크아웃이 2개다

`2_ailens/` 아래에 **완전히 별개의 git 히스토리를 가진 두 로컬 체크아웃**이 있다:

| 체크아웃 | GitHub 원격 | 상태 |
|---|---|---|
| **`dev2` (여기)** | `https://github.com/sedaily-ai/AILENS.git` (하이픈 없음) | **정본. 여기서 작업할 것** (사용자 확인, 2026-08-06) |
| `dev` | `https://github.com/sedaily-ai/AI-LENS.git` (하이픈 있음) | 낡은 체크아웃. **쓰지 말 것** |

두 저장소는 브랜치가 갈라진 게 아니라 **공통 조상 커밋이 아예 없다**
(`git merge-base` 결과 없음) — `dev2`는 어느 시점에 작업 디렉터리를 스냅샷 떠서
새로 `git init` 한 것이라 `dev`와 히스토리가 완전히 무관하다.

🛑 **그런데 두 체크아웃의 배포 스크립트가 가리키는 AWS 리소스는 완전히 동일하다** —
같은 S3 버킷(`sedaily-mbti-frontend-dev`, `sedaily-mbti-admin-frontend-dev`), 같은
CloudFront(`E1QS7PY350VHF6`, `E1MITYI58DB9UW`), 같은 Lambda 함수 이름
(`sedaily-mbti-admin-api-dev`, `sedaily-mbti-v2-today-letters-dev`,
`sedaily-mbti-v2-posts-dev` 등). **`dev`에서 배포하면 `dev2`가 이미 프로덕션에
올려둔 더 최신 코드를 조용히 덮어쓴다** — 2026-08-06에 실제로 이 사고가 나서
프로덕션이 잠깐 깨졌었다(`/api/v2/today-letters` 500). 경위·복구 전체 기록:
[`docs/worklog/2026-08/2026-08-06-dev-dev2-checkout-incident.md`](docs/worklog/2026-08/2026-08-06-dev-dev2-checkout-incident.md).

**따라서:**
- 새 세션을 열 때 반드시 `pwd`로 지금 어느 체크아웃인지 확인한다. `dev`라면 사용자에게
  확인 없이 코드를 고치거나 배포하지 않는다.
- `git remote -v`가 `AI-LENS`(하이픈)를 가리키면 잘못된 체크아웃이다.
- 배포 스크립트(`service/backend/deploy.sh`, `service/backend/admin/deploy-admin-api.sh`,
  `service/frontend/deploy.sh`, `admin/deploy-admin.sh`)를 돌리기 전에, 다른 체크아웃
  쪽에서 더 최근에 배포된 게 없는지(worklog, git log 시각) 먼저 확인한다.

---

이 파일은 아직 `dev`의 대형 `CLAUDE.md`처럼 전체 아키텍처를 다시 옮겨 적지 않았다 —
2026-08-05 v1/v2 폴더 통합(`153c18a`), 자동 파이프라인(Collector/Editor Pick/Core 3)
전면 폐기 등으로 `dev`의 서술과 실제 구조가 이미 상당히 달라졌기 때문에, 옛 문서를
그대로 복사하면 오히려 오해를 만든다. 아키텍처가 궁금하면:

- `docs/README.md` — 문서 체계 지도, 배치 규칙, worklog 컨벤션
- `docs/worklog/2026-08/` — 최근 작업 기록 (v1/v2 통합, CMS DynamoDB 마이그레이션,
  파이프라인 폐기 경위 등 전부 여기)
- `admin/CLAUDE.md` — admin 콘솔 전용 규칙 (Next.js 16 breaking changes 포함)
- `service/backend/deploy.sh`, `service/frontend/deploy.sh`, `admin/deploy-admin.sh`,
  `service/backend/admin/deploy-admin-api.sh` — 배포 스크립트 자체가 현재 구조를
  가장 정확히 반영한다 (스크립트 상단 주석 참조)

전체 아키텍처 문서를 dev2 기준으로 새로 정리하는 작업은 별도 세션에서 진행할 것.

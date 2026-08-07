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
- 배포 스크립트(`service/backend/deploy.sh`, `admin/backend/deploy-admin-api.sh`,
  `service/frontend/deploy.sh`, `admin/frontend/deploy-admin.sh`)를 돌리기 전에, 다른
  체크아웃 쪽에서 더 최근에 배포된 게 없는지(worklog, git log 시각) 먼저 확인한다.
  (2026-08-08: admin 백엔드가 `service/backend/admin/` → `admin/backend/` 로 이동 —
  `admin/`이 이제 `admin/frontend/` + `admin/backend/` 로 나뉜다.)

---

이 파일은 아직 `dev`의 대형 `CLAUDE.md`처럼 전체 아키텍처를 다시 옮겨 적지 않았다 —
2026-08-05 v1/v2 폴더 통합(`153c18a`), 자동 파이프라인(Collector/Editor Pick/Core 3)
전면 폐기 등으로 `dev`의 서술과 실제 구조가 이미 상당히 달라졌기 때문에, 옛 문서를
그대로 복사하면 오히려 오해를 만든다. 아키텍처가 궁금하면:

- `docs/README.md` — 문서 체계 지도, 배치 규칙, worklog 컨벤션
- `docs/worklog/2026-08/` — 최근 작업 기록 (v1/v2 통합, CMS DynamoDB 마이그레이션,
  파이프라인 폐기 경위 등 전부 여기)
- `admin/frontend/CLAUDE.md` — admin 콘솔 프런트엔드 전용 규칙 (Next.js 16 breaking
  changes 포함)
- `service/backend/deploy.sh`, `service/frontend/deploy.sh`, `admin/frontend/deploy-admin.sh`,
  `admin/backend/deploy-admin-api.sh` — 배포 스크립트 자체가 현재 구조를
  가장 정확히 반영한다 (스크립트 상단 주석 참조)

전체 아키텍처 문서를 dev2 기준으로 새로 정리하는 작업은 별도 세션에서 진행할 것.

## worklog는 요청 없이도 기본으로 남긴다

`docs/README.md`의 worklog 규칙(경로 `docs/worklog/YYYY-MM/YYYY-MM-DD-주제.md`,
템플릿 `docs/worklog/_TEMPLATE.md` — 배경/한 것/결정/다음 4섹션)은 원래
"세션 마무리하면서 사용자가 요청하면" 남기는 걸로 돼 있었다. **2026-08-06부터는
기본값으로 바꾼다** — 사용자가 "worklog 남겨줘"라고 말하지 않아도, 의미 있는
변화(코드 머지, 인프라 변경, 방향 결정, 조사로 알게 된 중요한 사실)를 만든
세션은 마무리 시점에 알아서 worklog를 남긴다. 같은 날 같은 주제면 새 파일
대신 기존 파일에 이어 쓴다. 사소한 질의응답이나 되돌린 실험처럼 남길 게
없는 세션은 당연히 생략한다.

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

## AWS 리소스·Bedrock 을 건드리기 전에 — 비용태깅 규칙

[`docs/architecture/비용태깅_규칙.md`](docs/architecture/비용태깅_규칙.md) 를 먼저 읽는다.
**리소스를 만들거나 Bedrock 을 호출하는 작업이면 예외 없이 해당된다.**

요약만 적어두면:

- **`modelId` 에 베어 모델 ID(`us.anthropic.*` · `anthropic.claude-*` · `amazon.nova-*`)를
  넣지 않는다.** 태그가 붙을 자리가 없어 100% 미태깅으로 샌다. application inference profile
  ARN 을 경유한다. 이 레포는 이 문제로 **W22 에 주당 약 $1,156 을 미지정으로 흘린 전례**가 있고
  (`constants.py` `BEDROCK_MODEL_ID_OPUS` 주석), Opus 만 고쳐져 Haiku·Sonnet·Nova·챗봇 경로는
  아직 베어다.
- **AI LENS 전체의 `Service` 값은 `lens`.** 2026-08-24부터 Atlas 크레딧 lane `atlas4`로
  옮겼던 리소스는 원복이 끝났다(AI-dashboard `ops/atlas-lane-rollback`). `atlas4`를 새로 붙이지 않는다.
- **태그는 소급되지 않는다.** 일회성·단발 작업은 기회가 한 번뿐이므로 **착수 전에** 붙인다.
- 태그 값을 스크립트 사본마다 하드코딩하지 않는다 — 변수 한 곳으로 뺀다. 배포가 덮어쓴 전례가 있다.

## 배포는 빠르게, 커밋·푸시는 나중에 몰아서 (2026-09-18, 사용자 요청 — "속도가 생명")

이 저장소 작업은 코드를 고치는 즉시 **배포부터** 한다 — `git commit`/`git push`를
기다리지 않는다. 배포 스크립트(`admin/backend/deploy-admin-api.sh`,
`admin/frontend/deploy-admin.sh`, `service/lens-cms-api/deploy.sh`)는 전부
현재 작업 디렉터리 내용을 그대로 빌드해서 AWS로 올릴 뿐 git 상태와 무관하다 —
커밋 여부가 배포를 막을 이유가 없다.

- 변경 → 검증(`tsc`/`eslint`/`build`, 백엔드는 `pyflakes`) → **배포** 순서로
  진행하고, `git add`/`commit`/`push`는 나중에(여러 변경을 모아서, 또는 세션
  마무리 시점에) 한다.
- 커밋 자체는 여전히 사용자가 명시적으로 요청하지 않아도 진행 중 알아서 남길
  수 있다 — 다만 그 커밋을 **원격에 push하거나 배포 순서에 끼워 넣어 기다리게
  하지 않는다.**
- push·PR처럼 원격/공유 상태에 영향을 주는 단계는 여전히 별도 확인 없이
  자동 실행하지 않는다 — 이건 "배포 전에 반드시 커밋·푸시부터"라는 순서만
  없앤 것이지, 원격 반영 자체를 사용자 확인 없이 해도 된다는 뜻이 아니다.

## 팀 공유가 필요한 변경은 브랜치+PR로 (2026-09-20)

지금까지는 커밋을 `main`에 직접 쌓고 필요할 때 `git push`만 했는데, 이러면
GitHub→Slack 알림이 안 붙는다 — GitHub Slack 앱은 **PR(Pull Request)
open/merge 이벤트**에만 반응해서 PR 제목·본문(왜/무엇이 바뀜/영향 범위)을
채널에 그대로 포맷해 보여준다. `git push`는 ref 갱신 사실만 남기고 커밋
메시지 본문은 어디에도 안 뜬다(서울경제 다른 레포, 예: AI-GLOBE-ensedaily의
`#2_영문-pr` 채널이 이 방식으로 PR 본문을 자동 공유하고 있음).

그래서 **팀이 봐야 할 변경(다른 사람이 리뷰하거나 알아야 하는 작업)은
앞으로 브랜치 → PR → `main` 머지로 진행**한다 — `git checkout -b
<type>/<slug>` 로 새 브랜치를 만들어 커밋하고, `gh pr create --base main`
으로 PR을 올린 뒤 머지한다. PR 본문은 개조식·왜/무엇이 바뀜/영향 범위
3단 구성(옵시디언 볼트 `공통도구/1_글쓰기·문체/문체정본_보이스·톤매트릭스.md`
"PR·커밋" 행 정본)을 그대로 따른다. 배포(`deploy.sh` 등)는 이 흐름과 무관하게 코드
변경 직후 바로 진행(위 "배포는 빠르게" 원칙 그대로) — PR 머지를 기다리지
않는다.

## worklog는 요청 없이도 기본으로 남긴다

`docs/README.md`의 worklog 규칙(경로 `docs/worklog/YYYY-MM/YYYY-MM-DD-주제.md`,
템플릿 `docs/worklog/_TEMPLATE.md` — 배경/한 것/결정/다음 4섹션)은 원래
"세션 마무리하면서 사용자가 요청하면" 남기는 걸로 돼 있었다. **2026-08-06부터는
기본값으로 바꾼다** — 사용자가 "worklog 남겨줘"라고 말하지 않아도, 의미 있는
변화(코드 머지, 인프라 변경, 방향 결정, 조사로 알게 된 중요한 사실)를 만든
세션은 마무리 시점에 알아서 worklog를 남긴다. 같은 날 같은 주제면 새 파일
대신 기존 파일에 이어 쓴다. 사소한 질의응답이나 되돌린 실험처럼 남길 게
없는 세션은 당연히 생략한다.

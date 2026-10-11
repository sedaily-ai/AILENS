# CLAUDE.md

## 작업 시작 전 확인 — 체크아웃은 1개(`dev`)

- 정본 저장소: `https://github.com/sedaily-ai/AILENS.git`(하이픈 없음). 로컬 경로는 `2_ai_lens/dev` 하나이고, `git remote -v` 로 확인한다.
- 옛 체크아웃 `dev`/`dev2` 이중 구조는 정리됐다. 과거 `AI-LENS`(하이픈) 저장소는 쓰지 않는다. 2026-08-06 에 낡은 체크아웃에서 배포해 운영 코드를 덮어쓴 사고가 있었다(경위: [`docs/worklog/2026-08/2026-08-06-dev-dev2-checkout-incident.md`](docs/worklog/2026-08/2026-08-06-dev-dev2-checkout-incident.md)).
- 배포 스크립트는 현재 작업 디렉터리 내용을 그대로 올리므로, 실행 전에 `git log`/`git status` 와 최근 worklog 로 다른 곳에서 더 최근에 배포된 것이 없는지 확인한다.
- 리소스 이름·ID 정본은 `config/resources.env`, 모델 ARN 정본은 `pipelines/common/bedrock_models.py`. 스크립트·코드에 복사하지 않는다.
- 코드·설정·이름의 기준은 [`docs/architecture/개발원칙.md`](docs/architecture/개발원칙.md).

구조가 궁금하면: `docs/README.md`(문서 지도), `docs/architecture/배포_스크립트_지도.md`(배포 스크립트), `docs/worklog/`(변경 경위), `admin/frontend/CLAUDE.md`(admin 규칙).

## AWS 리소스·Bedrock 을 건드리기 전에 — 비용태깅 규칙

[`docs/architecture/비용태깅_규칙.md`](docs/architecture/비용태깅_규칙.md) 를 먼저 읽는다.
**리소스를 만들거나 Bedrock 을 호출하는 작업이면 예외 없이 해당된다.**

요약만 적어두면:

- **`modelId` 에 베어 모델 ID(`us.anthropic.*` · `anthropic.claude-*` · `amazon.nova-*`)를
  넣지 않는다.** 태그가 붙을 자리가 없어 100% 미태깅으로 샌다. application inference profile
  ARN 을 경유한다. 이 레포는 이 문제로 **W22 에 주당 약 $1,156 을 미지정으로 흘린 전례**가 있고
  (`constants.py` `BEDROCK_MODEL_ID_OPUS` 주석), Opus 만 고쳐져 Haiku·Sonnet·Nova·챗봇 경로는
  아직 베어다.
- **2026-09-30까지 AI LENS 전체의 `Service` 기본값은 `atlas4`.** 기존 113개도 2026-08-24
  이관 완료됐고, 9/30에 `lens`로 원복한다. 2026-10-01 이후 신규는 `lens`를 쓴다.
  최종 크레딧 적격성은 이테크가 판정하므로 `atlas4=AI LENS 전체`임을 매핑표에 명시한다.
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

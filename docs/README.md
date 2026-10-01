# docs — AI LENS 문서 체계

갱신: 2026-08-22. 이 파일이 docs/ 의 지도다. 새 문서를 만들기 전에 아래 배치 규칙을 보고, 작업을 마쳤으면 worklog 를 남긴다.

## 폴더 구조

기존 최상위 7개는 각각 서로 겹치지 않는 질문 하나씩에 답하는 구조였다.
2026-09-25부터 `backoffice/`를 예외로 추가했다 — "질문별"이 아니라
"기능별"(어드민 CMS 프롬프트 실험공간)로 묶는 실험이며, 전체 `docs/`를
기능별 구조로 재설계할지 판단하기 위한 시범 폴더다(자세한 배경은
`backoffice/README.md`). 재설계 전까지는 이 폴더 하나만 예외로 두고,
나머지는 아래 질문별 구조를 그대로 따른다. 세부 규칙은 각 폴더 자체의
README를 볼 것 — 이 파일은 전체 지도만.

```
docs/
├── README.md               ← 이 파일 (전체 지도)
├── worklog/README.md       ← "언제 무슨 일이 있었나?"
│                              YYYY-MM/YYYY-MM-DD-주제[-plan|-design].md
├── architecture/README.md  ← "지금 시스템이 어떻게 동작하나?" (엔지니어)
├── product/README.md       ← "서비스가 뭘 해야 하나, 왜 이렇게 만들었나?" (기획)
├── evaluation/README.md    ← "잘 만들고 있는지 어떻게 아나?" (품질 평가)
├── design-system/README.txt ← "화면이 어떻게 생겨야 하나?" (디자이너)
├── resources/README.md     ← "참고할 원본 콘텐츠가 뭐가 있나?" (에디터)
├── archive/README.md       ← "예전엔 정본이었는데 지금은 아닌 게 뭔가?"
└── backoffice/README.md    ← (예외, 기능별) "CMS 프롬프트 실험공간을 어떻게 전문성 있게 키우나?"
```

## 배치 규칙 (요약 — 세부는 각 폴더 README)

- 시스템이 어떻게 생겼는지(How) → `architecture/`. 코드가 바뀌면 문서도 같이 고친다.
  - 운영 규칙 중 **비용태깅**은 `architecture/비용태깅_규칙.md`. AWS 리소스를 만들거나
    Bedrock 을 호출하기 전에 읽는다 — 베어 모델 ID 금지, `Service` 기본값 `lens`,
    태그는 소급 안 되므로 일회성 작업은 착수 전에 붙일 것.
- 서비스가 무엇을 왜(Why) 이렇게 만들었는지 → `product/`.
- 품질을 어떻게 재는지(방법론+실행 하네스+평가 결과) → `evaluation/`.
- 특정 날짜의 작업·결정·회의·계획·설계 산출물은 전부 → `worklog/YYYY-MM/`.
  진행 중이든 완료된 계획이든 구분하지 않는다 — 날짜와 주제로 찾는다.
  날짜가 붙은 확정 리포트(PDF 등)도 여기지 `product/`/`architecture/`가 아니다.
- 콘텐츠 원본/참고 자료(문서가 아닌 것) → `resources/`.
- 낡아서 현행과 어긋난 문서는 지우지 말고 `archive/` 로 옮기고, 옮긴
  이유를 worklog 에 한 줄 남긴다. 다만 재사용 가치가 전혀 없다고
  판단되면(예: 존재한 적 없는 스크립트를 가리키는 죽은 문서) 사용자 확인
  후 진짜 삭제도 가능 — archive는 기본, 삭제는 예외.
- **폐기 여부는 문서 카테고리만 보고 판단하지 않는다** — 관련 코드를
  실제로 grep해서 아직 쓰이는지 확인한 뒤 옮기거나 지운다(design-system/
  사례: MBTI 폐기로 죽은 줄 알았지만 캐릭터 색이 `SideRail.tsx`에 실제
  렌더링되고 있어서 유지로 뒤집힘).
- 날짜가 들어가는 파일명은 전부 `YYYY-MM-DD` (또는 파일명 맨 앞 `YYMMDD`) 형식.

## worklog 규칙 (팀 공통)

작업 세션(사람이든 Claude Code 세션이든)이 의미 있는 변화를 만들었으면 기록을 남긴다.
"의미 있는 변화" = 코드 머지, 인프라 변경, 방향 결정, 조사로 알게 된 중요한 사실.

- 경로: `worklog/YYYY-MM/YYYY-MM-DD-주제.md` (예: `worklog/2026-08/2026-08-03-front-page-timing.md`)
- 같은 날 같은 주제를 이어서 하면 새 파일을 만들지 말고 기존 파일에 덧붙인다.
- 템플릿: `worklog/_TEMPLATE.md` 복사해서 시작. 형식보다 내용 — 4개 섹션(배경/한 것/결정/다음)만 지키면 된다.
- 다음 세션의 자신 또는 팀원이 이 파일만 읽고 이어서 작업할 수 있게 쓴다. 특히 "다음" 섹션에 막힌 지점과 이유를 남긴다.
- Claude Code 로 작업할 때: 세션을 마무리하면서 Claude 에게 "오늘 worklog 남겨줘"라고 하면 이 규칙대로 기록한다.

## 정본 문서 빠른 링크

| 알고 싶은 것 | 문서 |
|---|---|
| 어드민 스택 | `architecture/admin-stack.md` |
| 배포 스크립트 어디 있고 뭘 배포하나 | `architecture/배포_스크립트_지도.md` |
| 음성 대화 아키텍처 | `architecture/voice-conversation-architecture.md` |
| 4포맷이 왜 이렇게 설계됐나 | `product/4format-persona-system.md` |
| 레터·4포맷 품질 평가 체계 | `evaluation/letter-evaluation-system.md`, `evaluation/4format-evaluation-system.md` |
| 뉴스 선별 파이프라인 설계(Step1+지면특별코너) | `worklog/2026-08/2026-08-22-news-selection-pipeline-design.pdf` |
| 디자인 시스템(캐릭터·컬러·폰트) | `design-system/README.txt` |

## 이력

**2026-08-22 대규모 재구성**(4라운드에 걸쳐 진행, 자세한 경위는
`worklog/2026-08/2026-08-22-docs-reorganization.md`):
1. `worklog/`(진행형) · `history/`(종결 기록) · `superpowers/`(설계+계획)
   세 폴더가 전부 "특정 시점 작업 기록"이라는 같은 성격이라 `worklog/`로 통합,
   `history/`는 성격상 겹치는 `archive/`로 흡수.
2. 잡파일(`.DS_Store`) 정리, 붕 뜬 백업 zip과 스스로 "폐기됨"이라 적어둔
   문서를 `archive/`로.
3. **내용 감사** — 문서를 실제로 다 읽고 코드와 대조해서 죽은 문서 2개
   삭제(`AWS_BACKEND_ARCHITECTURE.md`: v1 스냅샷, 이미 폐기된 인프라만
   다룸 / `newsletter-ses-plan.md`: v2 Lambda 기반, 실제 코드와 아키텍처가
   다름), 무효 섹션엔 경고 추가. `design-system/`(당시 이름 `design-handoff/`)는
   MBTI 폐기로 죽은 줄 알았으나 `SideRail.tsx`에 실사용되고 있어 유지로 뒤집힘.
4. **폴더 재설계** — `product/`에서 평가 방법론(레터·4포맷 평가, `prompt-eval/`
   하네스, 샘플)을 분리해 `evaluation/` 신설. 날짜 있는 설계 리포트(PDF)는
   `product/`가 아니라 `worklog/`로. `design-handoff/` → `design-system/`
   개명(내부 이름 중복된 하위폴더는 `tokens/`로) — "한 번 전달하고 끝난
   아카이브"가 아니라 "지금도 쓰는 살아있는 기준"이라는 실제 성격에 맞춤.

MBTI 4-페르소나(민철/하은/준서/소율) 체계와 그걸 생성하던 v1 Step Functions
파이프라인은 2026-08 폐지됐다(root `CLAUDE.md` 참조) — 다만 캐릭터 자산
자체는 `design-system/`에서 보듯 부분적으로 여전히 살아있으니 주의.

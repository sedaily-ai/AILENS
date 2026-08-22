# docs — AI LENS 문서 체계

갱신: 2026-08-22. 이 파일이 docs/ 의 지도다. 새 문서를 만들기 전에 아래 배치 규칙을 보고, 작업을 마쳤으면 worklog 를 남긴다.

**2026-08-22 재구성**: 예전엔 날짜가 들어간 기록이 `worklog/`(진행형) ·
`history/`(종결된 프로젝트 단위 기록) · `superpowers/`(기능 설계+계획)
세 곳으로 갈라져 있었다. 셋 다 결국 "특정 시점의 작업 기록"이라는 점은
같은데 폴더만 다른 게 오히려 어디서 뭘 찾아야 할지 헷갈리게 만들어서,
날짜가 있는 건 전부 `worklog/YYYY-MM/`로 통합하고(옛 `superpowers/plans`
는 파일명에 `-plan`, `superpowers/specs`는 원래 이름 그대로 `-design`류
접미사 유지), 종결되어 더 이상 현행과 안 맞는 건 `archive/`로 옮겼다
(옛 `history/` 전체). 자세한 경위는
`worklog/2026-08/2026-08-22-docs-reorganization.md` 참조.

## 폴더 구조

각 폴더는 자기 규칙을 담은 `README.md`를 갖고 있다 — 이 파일은 전체 지도만,
세부 규칙은 해당 폴더의 README를 볼 것.

```
docs/
├── README.md           ← 이 파일 (전체 지도)
├── worklog/README.md   ← 작업 기록 전체(진행형+완료 계획/스펙 전부)
│                          YYYY-MM/YYYY-MM-DD-주제[-plan|-design].md
├── architecture/README.md  ← 시스템 구조 정본 (파이프라인·어드민·음성)
├── product/README.md       ← 프로덕트 설계 정본 (레터 평가·선별 파이프라인)
├── design-handoff/README.txt ← 디자인 스펙 (캐릭터·컬러·폰트·레이아웃)
├── prompt-eval/README.md   ← 프롬프트 평가 하네스 (코드 포함)
├── resources/README.md     ← 참고 콘텐츠 데이터 (edragon 등)
└── archive/README.md       ← 종결되어 현행과 안 맞는 옛 문서 (참고용으로만)
```

## 배치 규칙 (요약 — 세부는 각 폴더 README)

- 시스템이 어떻게 생겼는지 설명하는 문서 → `architecture/`. 코드가 바뀌면 문서도 같이 고친다.
- 서비스가 무엇이어야 하는지 정의하는 문서 → `product/`.
- 특정 날짜의 작업·결정·회의·계획·스펙 기록은 전부 → `worklog/YYYY-MM/`.
  진행 중이든 완료된 계획이든 구분하지 않는다 — 날짜와 주제로 찾는다.
- 콘텐츠 원본/참고 자료(문서가 아닌 것) → `resources/`.
- 낡아서 현행과 어긋난 문서(더 이상 안 쓰는 기능·폐기된 아키텍처)는
  지우지 말고 `archive/` 로 옮기고, 옮긴 이유를 worklog 에 한 줄 남긴다.
  다만 아무 재사용 가치가 없다고 판단되면(예: 존재한 적 없는 스크립트를
  가리키는 죽은 문서) 사용자 확인 후 진짜 삭제도 가능 — archive는 기본,
  삭제는 예외.
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
| 음성 대화 아키텍처 | `architecture/voice-conversation-architecture.md` |
| 레터 품질 평가 체계 | `product/letter-evaluation-system.md` |
| 4포맷(레터·팟캐스트·웹툰·영상) 평가·페르소나 체계 | `product/4format-evaluation-system.md`, `product/4format-persona-system.md` |
| 뉴스 선별 파이프라인 설계(Step1+지면특별코너) | `product/news-selection-pipeline-20260822.pdf` |

MBTI 4-페르소나(민철/하은/준서/소율) 체계와 그걸 생성하던 v1 Step Functions 파이프라인은
2026-08 폐지됐다(root `CLAUDE.md` 참조). 그 시절 정본이던 `architecture/ARTICLE_PIPELINE.md`,
`product/letter-framework-v2.md`, `product/persona-voice-cards.md`, `prompt-mbti-v2/`,
v2 phase history·2026-05 세션 기록 등은 2026-08-22에 정리됐다(사용자가 별도
백업 보유 확인 후 직접 삭제) — 경위는 `worklog/2026-08/2026-08-08-mbti-
persona-shared-cleanup.md`, `worklog/2026-08/2026-08-22-docs-
reorganization.md` 참조.

같은 날 콘텐츠 감사에서 추가로 죽은 문서 2개(`architecture/
AWS_BACKEND_ARCHITECTURE.md` — v1 프로덕션 스냅샷, 이미 전부 폐기된 인프라만
다룸; `product/newsletter-ses-plan.md` — v2 Lambda 기반 계획서, 실제 라이브
코드와 아키텍처가 완전히 다름)도 삭제, `product/letter-eval-baseline-
20260523.md`는 역사적 데이터 스냅샷이라 `archive/`로 이동. `design-handoff/`는
겉보기엔 같은 부류로 보였지만 캐릭터 색·이름(민철 등)이 `SideRail.tsx`에서
실제로 렌더링되는 걸 확인해 유지 — 삭제 전 반드시 코드에서 실사용 여부를
확인할 것(문서만 보고 판단하지 말 것).

# docs — AI LENS 문서 체계

갱신: 2026-08-03. 이 파일이 docs/ 의 지도다. 새 문서를 만들기 전에 아래 배치 규칙을 보고, 작업을 마쳤으면 worklog 를 남긴다.

## 폴더 구조

```
docs/
├── README.md           ← 이 파일 (지도 + 규칙)
├── worklog/            ← 작업 기록. YYYY-MM/YYYY-MM-DD-주제.md (아래 규칙 참조)
├── architecture/       ← 시스템 구조 정본 (파이프라인·AWS 인벤토리·어드민·음성)
├── product/            ← 프로덕트 설계 정본 (레터 프레임워크·평가·페르소나·뉴스레터)
├── history/            ← 지난 기록 (phase 히스토리·회의록·스프린트 추적·완료 todo)
├── superpowers/        ← 기능 단위 설계 문서 (specs/) + 구현 계획 (plans/), 날짜 접두
├── design-handoff/     ← 디자인 스펙 (캐릭터·컬러·폰트·레이아웃)
├── prompt-mbti-v2/     ← 4유형 레터 프롬프트 소스 + 샘플
├── prompt-eval/        ← 프롬프트 평가 하네스 (코드 포함, README 별도)
└── archive/            ← 더 이상 안 맞는 옛 문서 (참고용으로만)
```

## 배치 규칙

- 시스템이 어떻게 생겼는지 설명하는 문서 → `architecture/`. 코드가 바뀌면 문서도 같이 고친다.
- 서비스가 무엇이어야 하는지 정의하는 문서 → `product/`.
- 특정 날짜의 작업·결정·회의 기록 → `worklog/` (진행형) 또는 `history/` (종결된 프로젝트 단위 기록).
- 낡아서 현행과 어긋난 문서는 지우지 말고 `archive/` 로 옮기고, 옮긴 이유를 worklog 에 한 줄 남긴다.
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
| v1 파이프라인 (Step Functions) | `architecture/ARTICLE_PIPELINE.md` |
| AWS 리소스 전체 인벤토리 | `architecture/AWS_BACKEND_ARCHITECTURE.md` |
| 어드민 스택 | `architecture/admin-stack.md` |
| 음성 대화 아키텍처 | `architecture/voice-conversation-architecture.md` |
| 레터 프레임워크 (오늘 한 통) | `product/letter-framework-v2.md` |
| 레터 품질 평가 체계 | `product/letter-evaluation-system.md` |
| 페르소나 보이스 카드 | `product/persona-voice-cards.md` |
| 뉴스레터 SES 발송 계획 | `product/newsletter-ses-plan.md` |
| v2 개발 히스토리 | `history/v2-phase-history.md` |

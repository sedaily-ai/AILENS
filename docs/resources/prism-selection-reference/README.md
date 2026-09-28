# Prism 기사 선별 프롬프트 (참고용 원본)

출처: `1_ai_link/prism/dev/DATA/Prompt/04_글로벌 투자자/분류/`
(같은 서울경제신문 사내 프로덕트 AI 프리즘 — 8개 독자 유형별로 하루 400여개
기사 중 유형별 관심 기사를 선별해 레터 1건에 4~6건을 묶어 발행)
수집: 2026-09-28, AI LENS "일반" 카테고리 20건 선정 로직을 재설계하던 중
참고용으로 복사. 그 폴더의 파일 7개 **전부** 가져왔다(2026-09-28, 처음엔
3개만 가져왔다가 "다 가져온 거 맞냐"는 지적으로 나머지 4개도 마저 확인).

## 왜 여기 있는가

AI LENS `mustknow_auto`의 "일반" 카테고리 선정 로직을 AI 채점(1~10점,
7.0 임계값)에서 "LLM이 후보 전체를 보고 직접 고르는" 방식으로 바꾸는 걸
논의하며, Prism의 기존 선별 프롬프트를 참고했다.

## 🛑 중요 — Prism은 완전자동이 아니라 사람이 확인/동의하는 대화형 워크플로우다

처음 3개 파일만 보고 "LLM이 후보를 보고 한 번에 직접 고른다"로 이해했는데,
`selection_global_investor_knowledge.txt`의 `command_execution_guide`를
마저 읽어보니 실제로는 **3단계 모두 사람의 확인을 기다린다**:

1. 기사 파일 업로드 → Claude가 기사 수 확인 → 사용자가 "확인" 입력
2. 사용자가 "확인" → Claude가 분류+추천(12개→6개) → 사용자가 "동의" 또는
   "변경" 입력
3. 사용자가 "동의" → Claude가 선정 기사 파일 생성

mustknow_auto는 하루 4~8회 무인 자동 실행이라 이 확인 게이트를 그대로
가져올 수 없다. 다만 **"분류 통계 + 선정 이유를 사람이 읽을 수 있게
구조화해서 보여준다"는 형식 자체는 로깅/감사 목적으로 그대로 쓸모 있다**
— 자동으로 흘러가더라도 각 회차가 무엇을 골랐고 왜 골랐는지 CloudWatch
로그에 사람이 읽을 수 있는 형태로 남기면, 차후 이상 여부를 사람이 검토할
수 있다.

## 파일

| 파일 | 원본 경로 | 내용 |
|---|---|---|
| `core_knowledge.txt` | `core_knowledge.txt` | AI 프리즘 시스템 공통 구조 — 3단계 선별 프로세스(초기 스크리닝→심층평가→최종선별), 품질 검증 기준. 8개 독자 유형 전체가 공유하는 공용 모듈 |
| `desc_global_investor.txt` | `desc.txt` | 프로젝트 개요 — 핵심 원칙·콘텐츠 구조·품질 검증 요약. `inst.txt`·`selection_..._knowledge.txt`와 내용 중복 있음(같은 5개 자체검증 질문이 여기도 나옴) |
| `inst_global_investor.txt` | `inst.txt` | 실행 지침 — 12개→6개 최종 선별 워크플로우, 5개 자체검증 질문(예/아니오 게이트) |
| `reader_profile_global_investor.txt` | `reader_profile_global_investor.txt` | 독자 페르소나 상세(관심사 7개+중요도, 가치 우선순위, 언어 선호도, 심리적 특성) — **투자자 전용이라 AI LENS "일반 독자"엔 재사용 불가**, 페르소나 정의 항목 구성 방식만 참고 가치 |
| `selection_metrics_global_investor.txt` | `selection_metrics_global_investor.txt` | 평가 지표(투자자 전용, 재사용 불가) + `diversity_mechanism`(다양성 메커니즘, 관심사 쏠림 방지 상한·이상적 비율) |
| `selection_global_investor_knowledge.txt` | `selection_global_investor_knowledge.txt` | **가장 정보량 많음.** `selection_strategies`(다양성 확보 방안 — 테마뿐 아니라 지역·자산군·정보유형·시간프레임 등 **여러 차원을 동시에 균형**, `연결성 구축 방법`), `market_insights`(투자자 전용, 재사용 불가), `command_execution_guide`(3단계 확인 워크플로우 전체 — 위 참고) |
| `command_execution_examples_global_investor.txt` | `command_execution_examples_global_investor.txt` | `selection_..._knowledge.txt`의 `command_execution_guide`와 **내용이 완전히 동일**(중복 파일) |

## 처음에 놓쳤다가 다시 반영한 것

1. **다차원 다양성** — `core_knowledge.txt`만 봤을 땐 "카테고리 쏠림 방지"
   하나로 이해했는데, `selection_global_investor_knowledge.txt`의
   `selection_strategies`를 보면 Prism은 테마뿐 아니라 **지역·자산군·
   정보유형·시간프레임·시나리오까지 여러 차원을 동시에** 균형 잡는다.
   AI LENS "일반"은 카테고리(테마) 외에 두 번째 차원(예: 정책발표/
   사건사고/시장분석 같은 "정보 유형")을 추가할지는 미정 — 과한
   복잡도일 수 있어 v1 범위에는 넣지 않기로 함(2026-09-28).
2. **검증 결과 로깅** — `desc.txt`의 `quality_verification`에 "총 검증된
   기사 수, 제외된 기사 수와 주요 사유, 최종 선정 기사의 검증 통과 확인"을
   문서화하라는 지침이 있다. 우리 프롬프트 출력에도 선정 이유뿐 아니라
   "이번 회차 전체 후보 수 / 제외 수 / 제외 주요 사유" 요약을 넣으면
   운영 중 이상 탐지에 쓸 수 있다 — v1.1 검토 항목.

## 재사용 시 주의

`selection_metrics_global_investor.txt`·`reader_profile_global_investor.txt`·
`market_insights`(평가 지표·독자 프로필·시장 인사이트 전부)는 "글로벌
투자자" 페르소나 전용이라 AI LENS "일반 독자" 톤에 안 맞는다 —
**구조(3단계 깔때기, 다양성 메커니즘, 자체검증 게이트, 검증 결과 로깅)만
참고하고, 평가 지표·페르소나 내용은 AI LENS 자체 것
(`service/backend/prompts/mustknow/published.md`)을 유지**한다.

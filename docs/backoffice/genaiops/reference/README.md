# GenAIOps/LLMOps 분야 지도

[← genaiops](../README.md)

갱신: 2026-09-26 최초 작성 (Claude Code 조사).

"LLMOps"는 학계가 만든 단일 학문 분야가 아니라 업계가 붙인 실무
브랜드다. 그 밑을 받치는 평가 방법론 연구는 NLP/ML 평가론 쪽에서
나온다 — 아래를 두 갈래(학술/업계)로 나눠 정리한다.

## 학술 — 평가 방법론의 뿌리

| 자료 | 기관 | 왜 중요한가 |
|---|---|---|
| HELM (Holistic Evaluation of Language Models), Liang et al. 2022 | Stanford CRFM(Center for Research on Foundation Models) | 여러 축(정확성·강건성·공정성 등)으로 나눠 채점 기준을 설계하는 방법론의 가장 널리 인용되는 레퍼런스. `content-quality-audit.md`가 하려는 일(무엇을 어떻게 채점할지 확정)과 성격이 정확히 같음 |
| "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena", Zheng et al. 2023 | UC Berkeley LMSYS Org(Chatbot Arena) | 모델이 모델 출력을 판정하게 했을 때 얼마나 믿을 수 있나를 정면으로 다룸 — AI-GLOBE의 JUDGE/GATE 패턴(GATE.md가 JUDGE.md보다 확정형 오류를 더 잘 잡았다는 실측 결론)과 같은 결의 발견 |

일반 학회: NeurIPS/ICML/ICLR(벤치마크 트랙), ACL/EMNLP(NLP 평가
방법론 본진), MLSys(서빙·관측성 인프라 쪽).

## 업계 — 지금 만들려는 걸 이미 제품으로 만든 곳들

프롬프트 버전관리+평가+A/B를 하나의 콘솔로 만든 회사들 — UX·기능
구성을 그대로 참고할 수 있는 롤모델.

| 회사/제품 | 참고할 지점 | backoffice 관련 축 |
|---|---|---|
| Humanloop | 프롬프트 버전관리+평가+A/B — backoffice 4축과 가장 근접한 제품 구조 | 워크플로우·평가 |
| LangSmith(LangChain) | 트레이싱(관측성)+평가를 한 파이프라인에 | 관측성·평가 |
| Braintrust, Galileo | 평가 전용 — 버전 간 채점·비교 UX | 평가 |
| PromptLayer | 프롬프트 버전관리 원조격 | 아키텍처·워크플로우 |
| W&B Weave, Arize Phoenix | LLM 관측성(트레이스·스팬) 전문 | 관측성 |

## 오픈소스 프레임워크 (방법론만 가져다 쓰기 좋음)

- **OpenAI Evals** — 평가 세트/채점기 정의 방식
- **EleutherAI lm-evaluation-harness** — MBTI 쪽 `evaluation/harness/`가 이미 이 계열
- **RAGAS** — RAG 특화 평가
- **DeepEval** — LLM 앱 평가 라이브러리

## 벤더 문서 (지금 스택과 직결)

- **AWS Bedrock Model Evaluation** — Bedrock 콘솔 내장 평가 기능. 같은
  Bedrock 위에서 AWS가 이미 "무엇을 어떻게 평가 항목으로 잡을지"
  설계해둔 레퍼런스라 붙임새가 가장 좋음 — `평가/` 축 착수 전 1순위로
  확인할 문서

## 지금 시점 우선순위 3개

1. **HELM 논문** — 평가 축·루브릭 설계 방법론 (`평가/` 축 착수 전 필독)
2. **LLM-as-a-Judge 논문(LMSYS)** — GATE/JUDGE 패턴을 backoffice에도
   도입하려면 이게 이론적 근거
3. **Humanloop 또는 LangSmith 제품 UX** — `워크플로우/` 축(draft/publish,
   A/B) 설계할 때 바퀴 재발명 안 하려면

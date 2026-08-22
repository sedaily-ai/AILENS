# product — 프로덕트 설계 정본

"서비스가 무엇을 해야 하는가"를 담는다. `architecture/`가 "지금 어떻게
동작하는가"(엔지니어 관점)라면, 여기는 "왜 이런 기능이 필요하고 무엇을
목표로 하는가"(기획 관점)다.

## 규칙

- 평가 체계·발송 계획처럼 계속 참조되는 정본은 날짜 없이 주제명으로만
  (`letter-evaluation-system.md`처럼).
- 특정 시점의 설계 리포트(예: 파이프라인 설계안)는 날짜를 파일명에 붙인다
  (`news-selection-pipeline-20260822.pdf`처럼) — 이런 건 사실 정본이라기보다
  "그 시점 확정 스펙의 산출물"에 가까우므로, 이후 설계가 바뀌면 새 날짜
  파일을 추가하고 이 README에 최신 버전이 뭔지 표시한다.
- 실제 산출물 샘플(`4format-samples/`처럼 생성 결과 예시)은 하위 폴더에
  모아 정본 문서와 구분한다 — 이건 "무엇을 해야 하는가"가 아니라 "실제로
  뭐가 나왔는가"의 증거 자료.
- 서비스 방향이 바뀌어 문서 내용이 안 맞게 되면 `architecture/`와 같은
  규칙 — 지우지 말고 경고 붙여서 `archive/`로.

## 지금 있는 것

| 파일 | 다루는 것 |
|---|---|
| `letter-evaluation-system.md` / `letter-eval-baseline-20260523.md` | 레터 품질 평가 체계 |
| `4format-evaluation-system.md` / `4format-persona-system.md` | 4포맷(레터·팟캐스트·웹툰·영상) 평가·페르소나 체계 |
| `4format-samples/` | 4포맷 생성 산출물 실제 샘플 |
| `newsletter-ses-plan.md` | 뉴스레터 SES 발송 계획 |
| `news-selection-pipeline-20260822.pdf` | 뉴스 선별 파이프라인(Step1+지면특별코너) 설계 리포트, 2026-08-22 확정판 |

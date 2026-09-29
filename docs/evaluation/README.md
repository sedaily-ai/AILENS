# evaluation — 콘텐츠 품질을 어떻게 재는가

"잘 만들고 있는지 어떻게 아는가"를 담는다. 2026-08-22 이전엔 이 내용이
`product/`(평가 체계 문서)와 `prompt-eval/`(실행 하네스)로 나뉘어 있었는데,
결국 둘 다 "품질을 재는 방법"이라 하나로 합쳤다.

## 규칙

- 평가 **방법론**(무엇을 어떻게 채점할지) 문서와 평가 **하네스**(실제로
  돌리는 코드)를 구분해서 본다 — 방법론은 이 폴더 바로 아래, 하네스는
  `harness/`.
- 평가 **결과**(특정 시점 실행 산출물)는 날짜를 붙여서 구분한다
  (`4format-samples/YYYY-MM-DD-주제/`처럼).
- 새 포맷이 생기거나 평가 기준이 바뀌면 방법론 문서를 갱신 —
  `harness/config.yaml`의 파라미터도 같이 맞춘다.

## 지금 있는 것

| 경로 | 다루는 것 |
|---|---|
| `letter-evaluation-system.md` | 레터 5 가상독자 × rubric 평가 체계 |
| `4format-evaluation-system.md` | 4포맷 공통 평가 체계 |
| `4format-samples/` | 실제 4포맷 생성 산출물 샘플(라운드별) |
| `harness/`, `clusters/` | MBTI 프롬프트 평가 하네스 코드 + 동결 클러스터(자세한 방법론은 `harness/README.md`) |
| `selection-harness/` | mustknow_auto "일반" 카테고리 선정 로직을 여러 날짜에 걸쳐 반복 실행해 규칙 위반(다양성 쏠림 등)을 빠르게 확인하는 하네스(자세한 방법론은 `selection-harness/README.md`) |

⚠️ `harness/`는 마지막 커밋이 2026-08-05(2026-08-22 기준 약 2.5주 전)로,
최근 계속 쓰이고 있는지 확인이 필요하다 — 새로 돌리기 전에 `config.yaml`의
inference profile ARN이 아직 유효한지부터 확인할 것.

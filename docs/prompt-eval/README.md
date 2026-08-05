# MBTI 프롬프트 평가 하네스

프롬프트 버전을 빠르게 많이 돌려보고 어느 게 나은지 신뢰 가능하게 가리는 도구.
목적은 "평가 인프라 구축"이 아니라 "프롬프트 반복 속도".

## 방법론 (2026 보편 + 우리 보정)

- 절대점수(0~10) 폐기 → 블라인드 페어와이즈 승률. 점수 인플레이션 없고 인간 선호 상관이 높음.
- Generator ≠ Judge: 생성 Sonnet 4.6, 채점 Opus 4.7 (self-enhancement 완화).
- Position swap: A/B 순서 2회 스왑 채점 → position bias 상쇄.
- 5축만: 신선도·깊이·내러티브·페르소나차별·신뢰(팩트). 14축 과설계 폐기. 친근감/행동트리거는 베타 독자 반응으로 측정할 항목.
- 고정 클러스터: 5세트 동결(`clusters/`). 모든 버전이 같은 입력 → 소재 효과 제거. (v1/v2 비교가 흔들린 근본 원인이 이것이었음.)
- 4 페르소나 컨센서스 평가는 쓰지 않음: 같은 페르소나로 생성+채점은 순환 편향. Finale 데모 화술로만.

## 디렉터리

```
docs/prompt-eval/
  clusters/        5세트 동결 (clusters.json = 인덱스)
                   C1 거시정책 / C2 증권실적 / C3 부동산정책 /
                   C4 산업인프라 / C5 스트레스(의도적 약결합)
  harness/
    config.yaml        프로파일 ARN·방법론 파라미터·리소스 추적
    extract_clusters.py 클러스터 동결 (1회성, 이미 실행됨)
    generate.py        Bedrock 생성 (TODO)
    judge.py           Bedrock 페어와이즈 채점 (TODO)
    run.py             오케스트레이터 (TODO)
    report.py          정적 HTML 리포트 (TODO)
  runs/            실행별 산출물/평가/리포트 (대용량 — git 제외 권장)
```

## AWS 리소스 (생성·추적)

전용 application inference profile 2개 (2026-05-16 생성, ACTIVE, 스모크 검증):

| 용도 | name | id | model |
|---|---|---|---|
| Generator | mbti-eval-sonnet-46 | `ymxbqn4lqro1` | claude-sonnet-4-6 |
| Judge | mbti-eval-opus-47 | `7pr9ue3os1ro` | claude-opus-4-7 |

- ARN: `arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/<id>`
- 태그: Service=p1 / ServiceName=MBTI-PromptEval / Environment=dev / CostCenter=sedaily-ai
- 비용: 생성 무과금. 호출 토큰분만 과금, prism(p1) 롤업에 들어가되 ServiceName으로 분리 필터 가능.
- 정리: `aws bedrock delete-inference-profile --inference-profile-identifier <arn> --region us-east-1`

## 상태

- [x] 클러스터 5세트 동결
- [x] 전용 Bedrock 프로파일 생성·검증
- [x] config + 방법론 문서
- [ ] generate.py / judge.py / run.py / report.py
- [ ] 평가 대상 2번째 프롬프트 버전 (현재 v3.0.0 단일 — 페어와이즈는 ≥2 버전 필요)
- [ ] 영광님 골든셋 30쌍 → Human alignment r 검증

## 다음

페어와이즈는 비교 대상 2개가 필요. v3.0.0(현행) vs v3.1(분량 압축·NT 용어풀이·SF 액션 보강)을
만들어 첫 실 비교를 돌리는 것이 다음 수.

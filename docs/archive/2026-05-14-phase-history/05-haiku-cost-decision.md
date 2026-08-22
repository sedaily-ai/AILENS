# Phase 05 — 베타 단계 비용 절감 (Opus 4.6 → Haiku 4.5)

작성: 2026-05-14 · 상태: LANDED (코드 변경 완료, AWS 배포는 Phase 03 Phase 2 와 동시)

## Why
[Phase 03](./03-backend-editor-pick.md) 의 Editor Pick 모델을 처음에 Opus 4.6 (가장 비싼 모델) 으로 박았으나, 베타 단계라 비용 효율이 우선. 사용자 결정: "지금은 베타 임, Haiku 로 진행."

## Before
`backend/v2/core25/editor_pick_service.py`:
```python
_OPUS_4_6_MODEL_ID = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/t6eh3tnfgr6b"
# 비용 1 invoke/일 = 월 ~$20
```

## After
```python
_HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
# Haiku 4.5 system inference profile (cross-region)
# 비용 1 invoke/일 ≈ $0.045/일 = 월 ~$1.4
```

## 모델별 가격 비교 (Bedrock us-east-1, 입력·출력 토큰당)

| 모델 | input/M | output/M | 1 invoke 추정 비용* |
|------|---------|----------|---------------------|
| Opus 4.6 | $15 | $75 | $0.68 |
| Sonnet 4.5 | $3 | $15 | $0.13 |
| **Haiku 4.5** | **$1** | **$5** | **$0.045** |

*입력 ~15K tok + 출력 ~6K tok 기준 (4 페르소나 카드 + 후보 20 article 메타 + 4 letter 출력).

→ Haiku = Opus 대비 **약 1/15 비용**.

## 변경 파일

| 파일 | 변경 |
|------|------|
| `backend/v2/core25/editor_pick_service.py` | `_OPUS_4_6_MODEL_ID` → `_HAIKU_MODEL_ID`, 시스템 inference profile ARN 으로, 비용 docstring 갱신 |

## 의사결정

1. **시스템 inference profile (`us.*`)** vs application inference profile (ARN).  
   v2 Core 2 Transform 은 비용 태깅용 application inference profile (`arn:...t6eh3tnfgr6b`) 사용 중. Editor Pick 은 일 1회라 비용 태깅 우선순위 낮음. Haiku application profile 발급 받기 전까지는 시스템 profile.
2. **운영 단계 모델 결정 기준** — 베타 1 주 모니터링 후 letter 톤·일관성·실패율 점검. Haiku 가 페르소나 분리·JSON 출력 안정성 부족하면 Sonnet 4.5 또는 Opus 4.6 으로 단계적 승격.
3. **프롬프트 캐싱** — Haiku 도 `cache_control: ephemeral` 그대로. 일 1회라 캐시 효과는 거의 0 이지만 `.clauderules #7` 일관성.

## 검증

- pytest 14 케이스 통과 (모델 ID 의존성 없는 단위 테스트 mock 으로)
- `python3 -c "import ast; ast.parse(open('v2/core25/editor_pick_service.py').read())"` 통과
- 실제 Bedrock 호출은 Phase 03 Phase 2 완료 시 manual invoke 로 1회 검증

## 다음 단계

- 베타 1 주 운영 후 모델 톤·일관성·실패율 메트릭 수집
- 데이터 기준으로 Haiku 유지 vs Sonnet 승격 vs Opus 승격 결정
- application inference profile 발급 받으면 ARN 으로 교체 (비용 태깅 활성)

# Observability

CloudWatch dashboard / metric 정의. SCP 가 Cost Explorer / Budgets 를 차단한 환경에서 application-level cost proxy 로 운영.

## Dashboard: Bedrock token & cost estimate

**File**: `dashboards/bedrock-cost.json`

**Apply**:
```bash
./dashboards/apply-dashboard.sh
```

**View**: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=sedaily-mbti-v2-bedrock-cost

**Metric source**: `sedaily-mbti/v2/BedrockTokens` (Cost-1b commit 5da37f8) — EmbeddingV2Client가 매 Bedrock invoke 시 input/output token count 를 CloudWatch 에 emit. (⚠️ transform_v2_service.py는 2026-08-05 삭제됨 — Transform 파이프라인이 2026-08-04에 이미 폐기되어 죽은 코드였다. 아래 Opus 관련 예시는 그 시절 기록이다.)

**Dimensions**:
- `Lambda` — 호출 Lambda 함수명 (예: `sedaily-mbti-v2-transform-dev`)
- `Model` — Bedrock model id (실제 emit 값 기준):
  - `amazon.titan-embed-text-v2:0` (embedding)
  - `us.anthropic.claude-opus-4-6-v1` (transform — cross-region inference profile, no `:0` suffix)
- `TokenType` — `input` 또는 `output`

## Pricing assumptions

us-east-1, on-demand, 2026-05 기준 (가격은 시간 따라 변경 — 출처: AWS Bedrock pricing page + 다수 third-party):

| Model | Input ($/1k tok) | Output ($/1k tok) |
|---|---|---|
| amazon.titan-embed-text-v2:0 | 0.00002 | 0 |
| us.anthropic.claude-opus-4-6-v1 | 0.005 | 0.025 |

⚠️ Dashboard estimate 는 **하한값** — 실제 청구 ≥ estimate. 다음 항목이 estimate 에 빠져있음:
- Cross-region inference (~10% premium) — 현재 안 쓰지만 model_id 가 `us.` prefix 라 향후 가능성
- Provisioned Throughput
- Knowledge Bases / Agents / Guardrails 추가 비용
- Data transfer

⚠️ Opus 4.7 업그레이드 시 model_id 변경 + 같은 rate 이지만 tokenizer 차이로 토큰 수 ~0-35% 증가. dashboard JSON 의 `Model` dimension 값 + Cost-1b emit 코드의 `_OPUS_4_6_MODEL_ID` 둘 다 갱신 필요.

## SCP 완화 후 transition

Master account admin 이 `ce:*` / `budgets:*` 권한 풀어주면:
1. AWS Billing console → Cost Allocation Tags 활성화 (24h 대기)
2. Cost Explorer 에서 `Project=sedaily-mbti` 또는 `Component=backend-v2` dimension 으로 group
3. 이 dashboard 의 estimate 와 actual billing 비교 — ±5% 안에 들어오면 정확. 차이 크면 cross-region 또는 다른 요인 점검.
4. SCP 풀린 후 dashboard 재설계 검토 (token-level proxy 보다 actual billing 직접 view 가 더 정확)

## Lambda metric emit 코드

(2026-08-05, v1/v2 소스 통합으로 경로가 `backend/v2/clients/` → `backend/clients/`로 바뀜)

- `backend/clients/cloudwatch_metrics.py` — `emit_bedrock_token_usage`, `parse_bedrock_response_tokens`
- `backend/clients/embedding_v2_client.py` — Titan V2 호출 후 emit (response 헤더 직접 read, Collector가 사용)
- ~~`transform_v2_service.py`~~ — 2026-08-05 삭제됨 (Transform 파이프라인 자체가 2026-08-04 폐기)

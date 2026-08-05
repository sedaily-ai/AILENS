# AWS SA 미팅 토론 자료 — AI LENS 프로젝트

- **일시**: 2026-05-08
- **참석**: AWS 영업 / AWS SA / AI LENS 팀
- **목적**: 인터넷·공식문서로 답이 나오는 질문은 사전에 제거하고, SA의 internal-only 정보·우리 아키텍처 평가·로드맵 NDA·협상 leverage에만 시간을 쓴다.
- **운영 원칙**: 일반론으로 빠지면 SA가 자료 읽어주는 것과 같음. "우리 컨텍스트 + 구체 질문 + 어떤 형태의 답을 원함" 3종 세트로 묻는다.

---

## 0. 미팅 운영 가이드 (사회자용)

- **선행 공유**: 미팅 1일 전 §1 (1-page summary) + §2 (Top 5 질문)을 SA에게 메일로 송부. 사전 준비된 SA의 답변 품질이 즉답보다 2배 이상 깊다. 안 보내면 미팅 절반은 "검토 후 회신드리겠습니다"로 채워짐.
- **시간 배분 (60분 가정)**:
  - 0~5분: 자기소개 + 미팅 목표 명시 ("우리는 B-2와 E-1 이 두 개에 가장 큰 결정이 걸려 있습니다")
  - 5~10분: 아키텍처 워크스루 (§1 그대로 읽지 말고 다이어그램 한 장으로)
  - 10~30분: §3 Track A (Bedrock 비용)
  - 30~45분: §4 Track B (SCP / Cost Visibility) + §7 Track E (AgentCore)
  - 45~55분: §10 Track H (협상 토픽)
  - 55~60분: 후속 액션 합의 + 미답변 항목 follow-up 메일 약속
- **금기**:
  - SA가 "공식 답변은 어렵고…"로 운을 뗄 때 끊지 말 것. NDA 정보 흘리는 cue다.
  - 우리 incident (Phase 5 retry 폭주, SCP 막힌 cost blind spot, v1/v2 6개월 병렬)는 §13 framing에 따라 약점이 아닌 maturity로 노출.
  - SA에게 가르치려 들지 말 것. 우리가 더 깊게 안다고 해서 leverage가 생기지는 않는다.
- **녹취 + Follow-up**: 매 트랙 끝에 "이 항목 후속 메일로 회신 가능?" 명시. 미답변 항목은 미팅 후 24h 내 정리해서 송부 (§12).

---

## 1. 1-Page Project Summary (SA에게 컨텍스트 주는 용도)

서울경제신문의 MBTI 맞춤형 경제 뉴스 서비스. 원본 기사 한 건을 4개 MBTI 그룹(NT/NF/ST/SF) 스타일로 LLM이 리라이팅해 제공. Production at `mbti.sedaily.ai`.

### v1 (production, ~6개월 운영)

- **Compute**: 23 Lambda (Python 3.11) + Step Functions (chained Map, MaxConcurrency=3)
- **Schedule**: EventBridge 8회/일 → Phase 4-A에서 1회/일 KST midnight으로 변경
- **AI**: Bedrock — Opus 4.6 (transform, 4 parallel calls/article) + Nova Lite (filter/classify/validate) + Haiku 3.5 (chatbot, RAG) + Titan v2 (embedding, 1024-dim)
- **Storage**: DynamoDB 6 tables + S3 split-storage (article body) + OpenSearch (RAG) + RDS pgvector (similarity)
- **Auth**: Cognito (사용자) + 자체 admin (argon2id + JWT, 8h, 5-fail/5min lockout)

### v2 (parallel redesign, partial production cutover)

- pgvector-centric storage hub. **Core 1 Collection** → **Core 1.5 Selector** (Nova Lite scoring per MBTI) → **Core 2 Transform** (Opus 4.6 + inline Nova Lite Validator) → **Core 3 Personalization** (MemoryManager + ContextBroker + RecommendAgent, 모두 inline in Feed Lambda)
- **Cutover (2026-04-27 deployed)**: `/api/v2/feed` + `/api/v2/article/{id}` 프로덕션 트래픽 처리 중. 프론트엔드는 어댑터로 v2 응답을 v1 타입에 매핑.
- **Pending**: Chat Agent on Bedrock AgentCore Runtime (이게 §7 Track E의 핵심).

### 비용 구조 (대략)

- **Bedrock invocation**: 가장 큰 단일 비용 항목. Opus 4.6의 4-call/article × 일 ~22 articles × 4 versions = 일 ~88 Opus calls (paper-mode 변경 후 안정화).
- **Lambda + EventBridge + DynamoDB + S3 + CloudFront + RDS + OpenSearch**: AWS 인프라 전반.
- **Anthropic console (별도 channel)**: Bedrock 안의 Anthropic 비용은 organization-level에서 따로 attribution.
- **블라인드 스폿**: 부모 SCP가 `ce:*` / `budgets:*` 차단 → sub-account에서 Cost Explorer / Budgets 사용 불가. 현재는 application-level proxy (CloudWatch dashboard로 토큰 → $ 추정)로 lower-bound만 알고 있음. 이게 §4 Track B의 가장 큰 통증점.

### 최근 의사결정 / 운영 사건 (Talking Points)

- **Phase 4-A (collector scope)**: XML reconnaissance로 `paragraph='TOP'` 메타가 각 지면 메인 기사 마커임을 확인. 8회/일 polling을 1회/일 KST midnight + paragraph='TOP' filter로 단순화. 일 22.6 articles 안정.
- **Phase 5 (retry-limit)**: 단일 article `2KCBCMQSBO`가 24h 내 125+ retry 발생 → 주간 Opus 비용의 12% 차지. `validation_failure_count` + DDB threshold + Feed의 `INNER JOIN article_versions`로 차단. 1주일 내 영구 fix.
- **Cost-3**: `Service=mbti` cost allocation tag를 sedaily-mbti 109개 리소스에 적용 (`scripts/apply_service_tag.py`, dynamic enumeration). Bedrock invoke는 taggable 아님. 태그 활성화 (Billing console 수동 + ~24h propagation) 미완.
- **Admin-2c**: Postgres password를 Lambda env var → SSM SecureString + AWS-managed KMS로 마이그레이션. v2 Lambda role에 `V2SecretsAccess` 인라인 정책 추가.
- **Admin-5**: `mbti-admin.sedaily.ai` 별도 도메인 + S3 + CloudFront + ACM + Route53 + OAC. API GW CORS를 `["*"]` → 두 origin 화이트리스트로 좁힘.

이 1페이지를 prep으로 SA에게 미리 송부.

---

## 2. SA에게 답을 받고 싶은 Top 5 (선행 공유용 — 가장 우선순위)

이 5개는 미팅에서 반드시 답을 받아야 한다. 나머지는 시간 남으면.

1. **Bedrock 비용 attribution을 tag-driven으로 만들 수 있나?**
   Bedrock invoke는 taggable이 아닌데, `Service=mbti`처럼 tag로 cost grouping이 필요. **Application Inference Profile + tag**가 답이라는 글이 있는데, 우리 us-east-1 + cross-region inference 환경에서 실제로 작동하나?

2. **우리 토큰 패턴에서 Provisioned Throughput break-even이 어디?**
   일 ~88 Opus 호출 + KST midnight burst + prompt caching 30~50% hit. PT의 model unit minimum + 시간당 commitment 모델에서 우리 패턴이 적합한지 / 적합하지 않다면 어떤 사용량이 되어야 하는지.

3. **SCP가 `ce:*` / `budgets:*` 차단된 sub-account에서 cost visibility를 회복하는 가장 짧은 경로?**
   - SCP 수정 안 하고 가능한 옵션 (CUR S3 export to sub-account, Cost Categories from management account 등)
   - SCP 수정한다면 최소 권한 ARN 패턴

4. **AgentCore Runtime의 2026 Q2 production-readiness?**
   GA 상태, SLA, 가격 모델 (per-session / per-token / runtime-hour), Knowledge Bases 통합 일정. 자체 RAG (OpenSearch + pgvector) 운영 vs AgentCore + KB의 cost/maintenance 비교.

5. **Bedrock Batch Inference를 Selector / Validator에 적용 시 절감 vs 운영 fitness?**
   Selector는 비실시간이라 batch 적합. Validator는 inline retry 로직과 충돌. Batch + prompt caching 호환성 / SLA / 절감률.

---

## 3. Track A — Bedrock 비용 최적화 (Highest ROI, 15~20분 할당)

가장 큰 비용 항목. SA에게 가장 많은 시간 쓰는 트랙.

### A-1. Prompt Caching 효율 측정

**컨텍스트**: Step 3 Opus + chatbot Haiku에 system prompt `cache_control: {"type": "ephemeral"}` 적용 중. 우리 추정으로 30~50% input token 절감 가능. 그러나 실제 cache hit rate 모니터링 불가 (우리 emit 메트릭은 input/output만 분리, cache_read vs cache_creation 분리 안 함).

**질문**:
- Bedrock Invocation Logs (CloudWatch / S3 destination)에 `cache_read_input_tokens` / `cache_creation_input_tokens` 별도 dimension이 export되나? log shape 예시.
- Bedrock에서 caching이 적용되지 **않는** edge case (cross-region inference + caching 호환성, region별 caching 미지원, message order 제약)?
- Anthropic API의 1h cache 옵션이 Bedrock에 GA될 일정 (§9 G-3와 cross-reference).

**기대 답 (체크리스트)**:
- [ ] Cache hit rate 정량 측정 패턴 (Invocation Logs schema + Athena query 예시)
- [ ] Cross-region에서 caching 동작 confirmation (yes/no/with caveat)
- [ ] 5min ephemeral 외 더 긴 TTL 출시 일정

### A-2. Cross-Region Inference Premium의 정확한 비용 모델

**컨텍스트**: Opus 4.6은 `us.anthropic.claude-opus-4-6-v1:0` (cross-region routing). 우리 백엔드는 us-east-1 안. cost dashboard는 cross-region premium을 lower bound로 빼고 있음. 정확한 수치 모름.

**질문**:
- us-east-1에서 `us.` inference profile 호출 시 routing 비용 + 데이터 전송 비용의 산정식 (% of token cost? flat per-invocation?)
- `us-west-2` 같은 다른 region 직접 호출 시 latency / 비용 차이 (cross-region premium 회피 가능?)
- Application Inference Profile로 region 명시 고정 시 비용 / SLA 변화

**기대 답**:
- [ ] Cross-region premium 정량 수치 (% 또는 absolute)
- [ ] Cost-optimal region 가이드
- [ ] Application Inference Profile + 단일 region pin의 권고

### A-3. Provisioned Throughput Break-Even Calculation

**컨텍스트**: Opus 4.6 일 ~88 호출 + paper-mode KST midnight 집중 burst + 평균 input ~3K tokens. PT는 sustained throughput에 적합한데 우리는 burst라 idle cost가 클 듯.

**질문**:
- 1 model unit (Opus 4.6) 기준 처리 가능한 input/output token throughput과 시간당 commitment 가격 — 정량으로 우리 break-even 계산 가능?
- PT + on-demand hybrid (PT base + on-demand overflow)이 단일 inference profile에서 가능? 아니면 별도 inference profile 두 개로 application-side에서 라우팅?
- PT contract length / 변경 유연성 / 중도 해지 페널티

**기대 답**:
- [ ] 우리 패턴에 PT 적합/부적합 판단
- [ ] Adopting threshold (예: "Opus 호출 일 X 이상 + sustained")
- [ ] Hybrid 가능 여부

### A-4. Bedrock Batch Inference for Selector / Validator

**컨텍스트**: Core 1.5 Selector + Validator 둘 다 비실시간 처리 (Selector는 collection 끝나고 batch로 가능, Validator는 inline retry 로직). Real-time invoke 사용 중.

**질문**:
- Bedrock Batch Inference의 SLA (24h? 더 짧음?), batch window, 실제 절감률 (% of on-demand)
- Batch가 prompt caching과 호환? 같은 system prompt에 대량 batch 보낼 때 caching benefit 받는지
- Selector를 batch로 옮기면 우리 Core 1.5 → Core 2 schedule 간 buffer time이 batch SLA보다 큰지 확인 필요

**기대 답**:
- [ ] Batch SLA + 절감률
- [ ] Batch + caching 호환성
- [ ] Selector batch 전환 권고

### A-5. 4-Way Parallel vs Single Multi-Output Prompt

**컨텍스트**: Transform이 한 article을 4개 MBTI로 변환 시 4개의 독립 Opus 호출을 parallel 실행. 같은 source article을 4번 보냄. Article body를 user message에, MBTI persona를 system에 두고 system을 cache.

**질문**:
- Single multi-output (한 호출로 NT/NF/ST/SF 4 versions 동시 생성)이 token 효율적인지, 아니면 quality 저하 위험이 더 크다는 게 일반 견해?
- 4-way parallel + system prompt caching vs 1-way single multi-output (4× output tokens) — 어느 쪽이 net cheaper?
- 우리 message ordering (article body in user, persona in system, cache on system)이 권고 패턴인지

**기대 답**:
- [ ] Multi-output 권고 / caution
- [ ] 우리 patterning이 cache-optimal인지

### A-6. Validator Model Downsize / Guardrails 대체 가능성

**컨텍스트**: Validator는 Nova Lite로 hallucination check inline. Phase 5에서 retry-limit 도입했지만 transform마다 1회 호출.

**질문**:
- Bedrock Guardrails의 factuality / hallucination policy가 LLM-judge Validator를 어디까지 대체할 수 있나?
- Guardrails latency overhead per invocation
- Validator를 더 작은 모델 (Haiku 3.5 또는 Llama 3 8B)로 다운사이즈한 customer 사례

**기대 답**:
- [ ] Guardrails coverage for our use case
- [ ] Validator 다운사이즈 권고

---

## 4. Track B — SCP / Cost Visibility (Critical Blocker, 10~15분)

이게 안 풀리면 Track A 최적화 ROI 측정이 안 됨. 두 번째 우선순위.

### B-1. SCP 우회 / 회피 경로

**컨텍스트**: 부모 organization SCP가 `ce:*` (Cost Explorer) + `budgets:*` (Budgets) + `aws-portal:*` 차단. sedaily-mbti sub-account에서 비용 직접 못 봄. CloudWatch dashboard로 lower-bound 토큰 기반 추정만.

**질문**:
- SCP 수정 **없이** sub-account에서 cost visibility 확보:
  - CUR (Cost and Usage Report)을 management account에서 export → S3 → sub-account 공유 가능?
  - Cost Categories를 management account에서 만들고 sub-account가 read-only로 사용?
  - QuickSight dashboard를 management account에서 만들어 sub-account에 share?
- SCP 수정한다면 최소 권한 ARN 패턴 (Cost Explorer 읽기만, 모든 mutation 차단)
- Anthropic Console (Bedrock 안의 Anthropic 호출) billing을 organization-level로 따로 보는 방법

**기대 답**:
- [ ] SCP 수정 없이 가능한 경로 (가장 짧은 것)
- [ ] SCP 수정 필요 시 최소 권한 정책

### B-2. Service=mbti 태그가 Bedrock 비용을 attribution하는가 (가장 중요)

**컨텍스트**: Cost-3에서 109개 리소스에 `Service=mbti` tag 적용 완료. 그런데 Bedrock invoke는 taggable resource가 아니므로 token cost가 어디로 attribution되는지 모름.

**질문**:
- Cost Explorer에서 Bedrock 비용을 grouping할 때 가능한 dimensions (Service O, Linked Account O, Region O, User-defined tag X — 맞나?)
- **Application Inference Profile에 tag를 붙이면 그 profile로 호출된 invocation이 user-defined tag로 grouping 가능?** (이게 우리에게 가장 큰 unlock — 만약 yes면 우리는 즉시 4개 MBTI별 inference profile + tag로 cost split 가능)
- IAM caller (호출 Lambda role)로 cost attribution 가능?

**기대 답**:
- [ ] Application Inference Profile + tag 가능 여부 (yes/no/with caveat) — 미팅 hard requirement
- [ ] Caller-based attribution 옵션
- [ ] Tag 활성화 후 propagation lag (24h?)

### B-3. CloudWatch + Athena 기반 Cost Reconstruction

**컨텍스트**: 우리는 EmbeddingV2Client + transform_v2_service에서 input/output token을 CloudWatch metric으로 emit. dashboard는 평균 token price × count로 lower-bound.

**질문**:
- CloudWatch Embedded Metric Format (EMF) → S3 → Athena 패턴으로 token-level cost를 정확히 재구성하는 권장 architecture
- Bedrock Invocation Logs (S3 destination 설정 가능) + CUR을 join하는 패턴 — token-level granularity 가능?
- 우리가 만들 dashboard / report의 모범 사례

**기대 답**:
- [ ] Token-level cost reconstruction 정확도 한계 (실제 청구가 대비 ±몇 %)
- [ ] Recommended pipeline (Invocation Logs → S3 → Athena → QuickSight)

### B-4. Bedrock Pricing Change Notification

**컨텍스트**: Anthropic이 Bedrock 가격을 조정할 때 우리는 dashboard 상수만 수동 업데이트. Pricing 변경 alert 메커니즘 없음.

**질문**:
- Bedrock에서 Anthropic 모델 pricing 변경의 공지 채널 (Personal Health Dashboard? Pricing API? AWS Marketplace?)
- AWS Pricing API (Public)로 모델 단가를 자동 fetch해서 dashboard에 반영하는 customer 패턴

**기대 답**:
- [ ] Pricing change notification channel
- [ ] Pricing API 활용 패턴

---

## 5. Track C — v2 데이터 인프라 (RDS pgvector + OpenSearch, 5~10분)

### C-1. RDS pgvector vs Aurora Serverless v2 vs OpenSearch Serverless

**컨텍스트**: v2 = pgvector-centric storage hub. 단일 RDS PostgreSQL instance + private VPC subnet. v1에서 OpenSearch도 RAG용 유지. v2 article volume은 일 ~90 vectors (22.6 articles × 4 versions), 누적 작음.

**질문**:
- 우리 볼륨 + access pattern (read-heavy at API time, write-heavy at midnight cron)에서 RDS provisioned vs Aurora Serverless v2 vs OpenSearch Serverless의 cost / latency 비교
- pgvector index — dimension 1024 + 작은 데이터에서 HNSW vs IVFFlat 권고 (recall vs latency)
- v1 OpenSearch + v2 pgvector 둘 다 유지하는 게 옳은지, OpenSearch를 deprecate하고 pgvector 단일화 권고?

**기대 답**:
- [ ] 우리 볼륨 best-fit (Aurora Serverless v2 가능성 큼)
- [ ] pgvector index choice
- [ ] OpenSearch deprecation 권고 (v2 안정화 후)

### C-2. Lambda + RDS Private Subnet 패턴

**컨텍스트**: v2 RDS는 private VPC subnet 안. Lambda는 VPC 밖에서 실행 (cold start 최소화). 운영자 머신에서 `init_pgvector_v2.py` 직접 실행 불가능 → Phase 5에서 in-Lambda `ALTER TABLE IF NOT EXISTS` migration 패턴 강제.

**질문**:
- Lambda를 VPC에 안 넣고 RDS 접근하는 방법:
  - RDS Data API (현재 Aurora Serverless에만 있는데 RDS에도 일정?)
  - RDS Proxy + IAM auth + VPC Lambda — Proxy의 cold start latency 정량
- In-Lambda migration이 best practice인지, 별도 migration runner pattern이 권고인지
- 운영자 ad-hoc query — Session Manager + bastion EC2? AWS CloudShell + VPC endpoint?

**기대 답**:
- [ ] Operator access best practice
- [ ] Migration pattern 권고
- [ ] RDS Proxy의 우리 use case 적합성

### C-3. RDS pgvector DR Posture

**컨텍스트**: v2 pgvector 추정 single-AZ. RPO/RTO 명시 안 됐지만 데이터 자체는 derived (article body in S3, vectors regeneratable via Titan).

**질문**:
- "1시간 내 복구 가능" 수준이면 cost-effective DR 설정 (Multi-AZ + automated backups)
- Vector를 application-layer에서 regenerate하는 DR 패턴 (Titan 호출 비용 vs Multi-AZ premium)이 합리적?

**기대 답**:
- [ ] Cost-aware DR posture 권고

---

## 6. Track D — Step Functions + Lambda 아키텍처 (5분, 시간 부족 시 컷)

### D-1. Inline Map의 256KB State 제약

**컨텍스트**: v1 Step Functions는 chained Map (Step3 → Step4 → Supervisor inline) + MaxConcurrency=3. 256KB 제약 회피하려고 OutputPath로 per-iteration result projection. 일 ~22 articles 볼륨.

**질문**:
- Distributed Map (S3-backed) + child workflow가 우리 볼륨에서 over-engineering?
- Express vs Standard 비용 차이 — 우리 패턴 (per-state-transition + Map 안 long-running Bedrock invoke)에서 Standard 정당화?
- 현재 chained-Map의 article-사이 failure isolation 평가

**기대 답**:
- [ ] Distributed Map 의미 / 무의미 판단
- [ ] Express 검토 가치

### D-2. Lambda Cold Start / Warming

**컨텍스트**: `setup-lambda-warming.sh`로 5분마다 search/article/post Lambda 3개를 `{warmup: true}`로 ping. v2 Lambda warming 패턴 미정. Python 3.11 + pg8000 + opensearch-py + boto3 무거움.

**질문**:
- Lambda SnapStart Python 지원 일정 (2026 Q2 시점)
- 5-min warming 32 Lambda × 12회/h × 24h × 30일 = ~27만 invocation/월 vs Provisioned Concurrency의 break-even
- Lambda Layer로 boto3 분리 시 cold start 단축 효과 정량

**기대 답**:
- [ ] SnapStart Python 지원 여부
- [ ] PC 비용 break-even

### D-3. 23 Lambda → 통합 vs 유지

**컨텍스트**: v1 핸들러 23개. 같은 권한/dependencies 공유 Lambda 다수 (search + article + recommendation). monolith pattern (단일 Lambda + API GW HTTP API 라우팅)과 trade-off.

**질문**:
- 같은 권한 dependencies 공유 Lambda를 단일화하는 게 best practice? 아니면 deployment isolation이 가치 있다고 보는지

**기대 답**:
- [ ] 통합 / 유지 trade-off 평가

---

## 7. Track E — Agent / AgentCore / Bedrock Agents (10~15분, 큰 결정 영향)

v2 미완료 영역. 결정에 따라 v2 roadmap 바뀜.

### E-1. AgentCore Runtime Production-Readiness (2026 Q2)

**컨텍스트**: v2 chat agent를 Bedrock AgentCore Runtime 위에서 운영 예정. 2025 re:Invent에 발표. GA 상태 / SLA / 가격 모델 불명. Q3 production timeline에서 betting risk.

**질문**:
- AgentCore Runtime 현재 GA 여부, SLA, 가격 모델 (per-session / per-token / runtime-hour)
- Knowledge Bases와 통합 일정 — KB attached가 standard pattern이 되는지
- 다른 customer가 AgentCore production 사례 / lessons learned (NDA 가능 범위 내)
- AgentCore 안 쓰고 Lambda + Bedrock InvokeAgent + 자체 RAG (OpenSearch + pgvector) 조합이 simpler인지

**기대 답**:
- [ ] AgentCore GA timeline + SLA
- [ ] Lambda + InvokeAgent vs AgentCore Runtime 권고
- [ ] KB integration roadmap

### E-2. Bedrock Knowledge Bases vs 자체 OpenSearch + pgvector

**컨텍스트**: 우리는 OpenSearch (RAG, v1) + pgvector (similarity, v2) 자체 운영. KB로 옮기면 운영 부담 ↓ but lock-in / 비용 ↑ risk.

**질문**:
- KB chunking / embedding model 유연성 — 현재 Titan v2 사용 중. Cohere multilingual 또는 다른 모델로 교체 가능?
- KB pricing이 vector DB 운영비 + Titan embedding 호출비를 합한 것보다 비싼지 ($/document/month estimate)
- KB의 multi-tenant retrieval (사용자별 ranking weight) 가능? 우리 Core 3는 사용자별 preference embedding으로 ranking

**기대 답**:
- [ ] KB cost structure
- [ ] Multi-tenant pattern 지원 여부

### E-3. Bedrock Agents의 Action Group + Lambda 패턴

**컨텍스트**: 현재 chatbot은 Lambda + 자체 RAG. Agent 전환 시 Lambda를 Action Group으로 wrap.

**질문**:
- Action Group + Lambda의 latency overhead per-action invocation
- ReAct loop이 chatbot use case에서 over-engineering vs multi-tool reasoning 가치

**기대 답**:
- [ ] Chatbot use case에 Agent 적용 권고

---

## 8. Track F — 보안 / Auth / Compliance (5~10분, 시간 부족 시 F-2만)

### F-1. Admin Auth: Cognito vs 자체 (argon2id + JWT)

**컨텍스트**: Admin Lambda는 argon2id + JWT (8h) + 5회 실패/5분 lockout. SSM Parameter Store에 password hash + JWT secret. Cognito 안 쓴 이유는 single-admin + JWT secret rotation 단순성.

**질문**:
- 일인 관리자 + minimal user mgmt 요구에서 Cognito over-engineering인지 SA 입장
- 현재 자체 auth의 가장 큰 위험 (timing attack on argon2id verify? JWT secret 노출? Brute-force on lockout?)
- WAF (AWS WAF) + CloudFront로 admin 도메인 protection 권고 여부

**기대 답**:
- [ ] 자체 auth 유지 가능 + 추가 보강 포인트
- [ ] WAF rule 권고

### F-2. Bedrock Guardrails 적용 (필수)

**컨텍스트**: 현재 Guardrails 미사용. inline LLM Validator만. PII / 민감정보 / 금융 규제 (서울경제 = 경제 뉴스, 투자 권유 금지) 측면 위험.

**질문**:
- 우리 use case (뉴스 리라이팅 + chatbot)에서 most-impactful Guardrails policy (PII detection, denied topics, sensitive info filter, contextual grounding)
- Guardrails latency overhead per invocation
- Guardrails + 우리 자체 Validator의 layered defense pattern

**기대 답**:
- [ ] Recommended Guardrails policy set for news/finance domain
- [ ] Latency overhead 정량

### F-3. KMS / SSM 회전 정책

**컨텍스트**: SSM에 PG password + admin password hash + JWT secret. AWS-managed KMS (`alias/aws/ssm`). Rotation 정책 미수립.

**질문**:
- AWS-managed KMS vs Customer-managed — 우리 sensitivity 수준에서 customer-managed로 가야?
- SSM SecureString rotation pattern (Lambda + EventBridge)
- RDS password를 Secrets Manager로 옮기면 자동 rotation. SSM vs Secrets Manager 선택 기준

**기대 답**:
- [ ] Customer-managed KMS 도입 가치
- [ ] Secrets Manager 마이그레이션 권고

---

## 9. Track G — Roadmap / Beta Features (NDA 영역, 10분, 미팅 진짜 가치)

이게 SA 미팅의 차별화 가치. 인터넷에 없음.

### G-1. Bedrock에서 Anthropic Opus 4.7 + 1M Context 일정

**컨텍스트**: Anthropic API에는 Opus 4.7 + 1M context 이미 있음 (이 어시스턴트가 그 모델). Bedrock에서는 Opus 4.6이 최신. 우리는 prompt caching + article body까지 입력 = 4.7 1M context 의미 큼.

**질문**:
- Bedrock에서 Opus 4.7 + 1M context 출시 시점 (분기 단위라도)
- 1M context의 pricing tier (per-token이 변하는지, threshold-based stepping)
- 우리 패턴 (article transform + caching)에서 4.6 → 4.7 마이그레이션 시 비용/품질 변화 견적

**기대 답**:
- [ ] Opus 4.7 Bedrock GA timeline
- [ ] 4.7 pricing tiers

### G-2. Bedrock PT Pricing Direction / Spot

**컨텍스트**: Anthropic 또는 AWS가 PT 비용 모델 변경 가능성 (re:Invent 2025+ 이후).

**질문**:
- PT model unit pricing의 향후 변경 예고 (% 또는 directional)
- Spot-style discount (idle PT capacity를 cheaper rate로 sell) roadmap

**기대 답**:
- [ ] PT pricing direction
- [ ] Spot model 가능성

### G-3. Bedrock Caching 확장

**컨텍스트**: 현재 ephemeral 5min만. Anthropic API는 1h cache 옵션 존재.

**질문**:
- Bedrock에서 1h+ cache TTL 일정
- Implicit caching (Anthropic Console처럼 자동 prefix caching) Bedrock 적용 일정

**기대 답**:
- [ ] 1h cache GA timeline
- [ ] Implicit caching 일정

### G-4. AgentCore + KB + Agents의 Integration Depth

**컨텍스트**: KB가 Agent에 자동 attached되는 패턴이 표준화될지. 3개 product가 단일 product 일정으로 가는지.

**질문**:
- KB + Agent + AgentCore의 integration roadmap

**기대 답**:
- [ ] Integration roadmap

### G-5. Bedrock Cross-Region Inference의 Cost-Optimal Routing

**컨텍스트**: 현재 cross-region premium은 black box. Anthropic capacity 부족 시 자동 routing되는 region이 우리 비용에 영향.

**질문**:
- Cross-region routing의 region 선택 알고리즘이 cost-aware인지 capacity-aware인지
- Customer가 cross-region cost를 control할 수 있는 옵션 향후 추가 일정

**기대 답**:
- [ ] Routing 알고리즘 visibility 및 control 옵션

---

## 10. Track H — 비즈니스 / 협상 토픽 (10분, 미팅 ROI 최대화)

300만원 미팅의 핵심 ROI. 마지막 10분에 배치. 인프라 질문 다 끝낸 후로 시간 확보.

### H-1. Enterprise Support / TAM

**컨텍스트**: 현재 Basic Support 추정. 1년 운영 후 incident 1건 (Phase 5 retry 폭주, SCP 막혀서 cost blind spot).

**질문**:
- 우리 monthly spend 수준에서 Enterprise Support / Business Support의 ROI 비교 (TAM 유무)
- TAM이 sub-account + SCP 상황에서 specifically 도움 되는 영역 (escalation routing, internal AWS team intro)

**기대 답**:
- [ ] Support tier 권고

### H-2. AWS Activate / GenAI Startup Program / Innovation Center

**컨텍스트**: Sedaily는 established media company → Activate eligibility 낮을 수 있음. 그러나 AI LENS는 신규 product (sub-account 단위). 별도 entity로 분류 가능?

**질문**:
- 신규 AI product / sub-account 단위 Activate / GenAI startup program / AI Innovation Center eligibility
- Anthropic Marketplace credit 또는 Bedrock 사용 credit 협상 가능 여부 + application timeline

**기대 답**:
- [ ] Eligible programs + application path

### H-3. Marketplace Private Offer / Volume Discount

**컨텍스트**: Bedrock 비용이 monthly spend 큰 비중. Volume threshold에서 협상 가능.

**질문**:
- 우리 Bedrock 월 spend 단계에서 Private Offer / Volume discount eligible threshold
- 협상 단위 (월/년 commit, take-or-pay)
- Anthropic이 Marketplace에서 직접 negotiate vs AWS sales rep 통한 negotiate 차이

**기대 답**:
- [ ] Discount threshold + 협상 path

### H-4. Co-Marketing / Case Study

**컨텍스트**: 우리는 v1 → v2 transition + Korean media + MBTI persona = unusual combination. AWS blog / re:Invent / Summit 사례 후보.

**질문**:
- AWS Marketing 측 customer story / case study 협업 (그 대가로 credit 협상 leverage)
- AWS Korea Summit 2026에서 customer presentation 슬롯

**기대 답**:
- [ ] Co-marketing opportunity + credit trade

### H-5. Bedrock Capacity Reservation

**컨텍스트**: paper-mode KST midnight burst 시 Anthropic capacity throttling 위험 (현재 MaxConcurrency=3으로 self-throttle 중).

**질문**:
- Bedrock에서 reserved capacity 옵션 (PT 외에 burst-capacity reservation 같은 것)이 있는지
- Throttling SLA — 현재 우리 burst에서 throttle 발생 빈도를 SA가 알 수 있는지

**기대 답**:
- [ ] Capacity reservation 옵션
- [ ] Throttling visibility

---

## 11. 시간 부족 시 컷할 트랙 (Drop List)

미팅 60분 빠듯할 가능성 큼. 우선순위 기반 컷:

| 우선순위 | 트랙 | 컷 시점 | 이유 |
|---|---|---|---|
| Cut First | §6 Track D (Step Functions) | 즉시 | 자체 판단 가능, ROI 작음 |
| Cut Second | §8 Track F-1, F-3 (Auth, KMS) | 시간 확인 후 | Compliance 요구 발생 시 별도 미팅 |
| Cut Third | §5 Track C-2, C-3 (RDS pattern, DR) | 시간 확인 후 | 운영 stability 영향 작음, C-1만 받기 |
| **Never Cut** | §3 Track A | — | Bedrock 비용 = 최대 ROI |
| **Never Cut** | §4 Track B | — | Cost visibility 회복 = 다른 모든 최적화 측정 가능 |
| **Never Cut** | §7 Track E (E-1) | — | AgentCore 결정 = v2 roadmap 결정 |
| **Never Cut** | §10 Track H | — | 협상 leverage = 미팅 ROI |
| **Never Cut** | §9 Track G | — | NDA roadmap = SA-only 정보 |

---

## 12. 미팅 후 24시간 내 Follow-up Action

- [ ] SA에게 즉답 못 받은 질문 (이 문서 미답변 항목)을 정리해 메일 송부
- [ ] 추천받은 architecture pattern 중 highest-ROI 1개를 다음 sprint PoC 등록
- [ ] B-2 (Application Inference Profile + tag) 답이 yes면 즉시 4개 MBTI inference profile 분리 + tag 적용 PoC
- [ ] Volume discount / Private Offer / Activate 후속 신청 (별도 트랙)
- [ ] Cost visibility 회복 경로 (B-1 권고 기반) 1주일 내 시도
- [ ] AgentCore production-readiness (E-1) 답변 기반으로 v2 chat agent roadmap 조정 (AgentCore Go vs Lambda + InvokeAgent)
- [ ] Service=mbti tag 활성화 (Billing console 수동, ~24h propagation) + activation 후 Cost Explorer로 grouping 검증

---

## 13. Framing 가이드 — "약점"으로 노출하지 말 것

협상 leverage 측면에서 부정적 톤 회피. 사실은 그대로지만 표현이 다르다.

| 사건 | 약점으로 들리는 표현 | Maturity로 들리는 표현 |
|---|---|---|
| Phase 5 retry 폭주 (article 1건이 24h 125+ retry, 주간 Opus 12% 차지) | "monitoring gap, 비용 누수" | "rapid detection + permanent fix in <1 week (Phase 5: validation_failure_count + DDB threshold)" |
| SCP가 ce:* 막아서 lower-bound estimate만 운영 | "cost blind spot" | "creative application-level instrumentation (CloudWatch token-emit + dashboard)" |
| v1/v2 6개월+ 병렬 운영 | "indecision, 기술부채 두 배" | "production cutover risk management — TASK-7 frontend 2026-04-27 cutover 후 안정화" |
| Bedrock invoke가 taggable 아니어서 cost grouping 못 만듦 | "AWS의 한계로 막힘" | "Cost-3에서 109개 리소스에 Service tag 적용 후 Bedrock attribution 패턴을 SA 미팅 어젠다로 escalate" |
| Admin이 Cognito 안 쓰고 자체 argon2id+JWT | "Cognito를 모름" | "single-admin + minimal user mgmt 요구에서 의도적 simplification, threat model 분석 후 결정" |

핵심은 **"우리는 인지하고 있다 + 답을 찾고 있다 + SA의 의견을 수렴 중"** 이다.

---

## 14. 노트 (메모용 빈 칸)

미팅 중 받은 답을 직접 기록. 트랙별로 미리 영역 잡아둠.

```
A-1 Cache rate measurement:        ___________________________________________
A-2 Cross-region premium:          ___________________________________________
A-3 PT break-even:                 ___________________________________________
A-4 Batch SLA + 절감률:            ___________________________________________
A-5 Multi-output 권고:             ___________________________________________
A-6 Guardrails factuality:         ___________________________________________

B-1 SCP 우회 path:                 ___________________________________________
B-2 Inference Profile + tag:       ___________________________________________  ← 가장 important
B-3 Athena pipeline:               ___________________________________________
B-4 Pricing notification channel:  ___________________________________________

C-1 Aurora vs RDS vs OS:           ___________________________________________
C-2 Operator access pattern:       ___________________________________________
C-3 DR posture 권고:               ___________________________________________

D-1 Distributed Map 의미:          ___________________________________________
D-2 SnapStart Python 일정:         ___________________________________________
D-3 Lambda 통합 권고:              ___________________________________________

E-1 AgentCore GA + SLA + pricing:  ___________________________________________  ← v2 roadmap 결정
E-2 KB cost structure:             ___________________________________________
E-3 Agent latency:                 ___________________________________________

F-1 자체 admin auth 평가:          ___________________________________________
F-2 Guardrails policy set:         ___________________________________________
F-3 KMS rotation 권고:             ___________________________________________

G-1 Opus 4.7 + 1M context 일정:    ___________________________________________
G-2 PT pricing direction:          ___________________________________________
G-3 1h cache GA:                   ___________________________________________
G-4 AgentCore+KB+Agents 통합:      ___________________________________________
G-5 Cross-region routing control:  ___________________________________________

H-1 Enterprise Support ROI:        ___________________________________________
H-2 Activate / GenAI eligibility:  ___________________________________________
H-3 Volume discount threshold:     ___________________________________________
H-4 Co-marketing 가능 여부:        ___________________________________________
H-5 Capacity reservation:          ___________________________________________
```

---

## 15. 참고 — 미팅에서 일반론으로 빠지지 않게 하는 트릭

- "공식 문서에 있는 X는 봤습니다. 우리 케이스에서 다른 점은…" 으로 시작하면 SA가 일반론을 못 함.
- "Yes/No로 먼저 답해주시고 caveats를 부연해주시면" 이라고 못 박으면 SA가 hedging만 늘어놓는 답 못 함.
- "후속 메일로 회신 가능하시면 된 답변과 더 깊은 답을 받고 싶은 항목을 분리할게요" 라고 시작하면 SA가 즉답 부담 줄고 retain rate 올라감.
- 가격 / 일정 같은 NDA 영역은 "구체 수치는 NDA로 따로 받을 수 있을까요?" 로 한 번 더 escalate.
- 미팅 끝 5분 전: "오늘 답을 받은 것 vs 후속 메일로 받을 것 정리해서 24h 내 송부드리겠습니다. 동의하시면 그 메일에 우리 의사결정 timeline도 같이 적어두겠습니다" — 이게 자동 follow-up 강제.

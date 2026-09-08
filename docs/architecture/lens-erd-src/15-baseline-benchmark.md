# 15 · DynamoDB 베이스라인 (Postgres 이관 전 측정)

측정일: 2026-09-08 · 계정 887078546492 · 리전 us-east-1

Postgres로 이관한 뒤 "빨라졌다/느려졌다"를 말하려면 이관 전 숫자가 있어야
한다. 이 문서는 그 기준선이다. **이관 후엔 같은 명령을 똑같이 다시 돌려서
아래 표 옆에 "이관 후" 열을 추가하는 방식으로 쓴다** — 새 문서를 만들지
않는다.

## 1. 테이블 규모 (2026-09-08 기준)

| 테이블 | 아이템 수 | 크기 | 과금 모드 | GSI |
|---|---|---|---|---|
| `sedaily-mbti-cms-posts-dev` | 3,897 | 21.3MB | PAY_PER_REQUEST | channel-publish_date, status-publish_date, slug |
| `sedaily-mbti-articles-dev` | 24,613 | 218.9MB | PAY_PER_REQUEST | item_type-published_at, category-published_at |
| `sedaily-mbti-daily-letters-dev` | 0 | 0 | PAY_PER_REQUEST | letter_date |
| `sedaily-mbti-personal-dev` | 200 | 226KB | PAY_PER_REQUEST | (단일 테이블, PK=user_id/SK=sk) |
| `sedaily-mbti-podcast-dev` | 3 | 2KB | PAY_PER_REQUEST | date |
| `sedaily-mbti-quiz-questions-dev` | 5 | 2KB | PAY_PER_REQUEST | status-publish_date |
| `sedaily-mbti-engagement-dev` | 198 | 37KB | PAY_PER_REQUEST | (없음) |
| `sedaily-mbti-external-content-dev` | 51 | 440KB | PAY_PER_REQUEST | (없음) |
| `sedaily-mbti-newsletter-subscribers-dev` | 3 | 609B | PAY_PER_REQUEST | group |

`ItemCount`/`TableSizeBytes`는 DynamoDB가 6시간 주기로 갱신하는 근사치
(`describe-table` 문서 명시) — 정밀 비교용이 아니라 규모 감 잡는 용도.

측정 명령:
```bash
aws dynamodb describe-table --region us-east-1 --table-name <table> \
  --query 'Table.{ItemCount:ItemCount,SizeBytes:TableSizeBytes,BillingMode:BillingModeSummary.BillingMode,GSI:GlobalSecondaryIndexes[].IndexName}'
```

## 2. DynamoDB 자체 처리 지연시간 (CloudWatch, 최근 48시간 평균/p99)

| 테이블 · 오퍼레이션 | Average | p99 | Max |
|---|---|---|---|
| cms-posts / Query | 17.5~22.3ms | 47.7~67.0ms | 301~350ms |
| cms-posts / Scan | 28.1~30.3ms | 50.9~52.0ms | ~54ms |
| articles / Query | 15.1~16.8ms | 38.3~41.9ms | 241~266ms |
| articles / GetItem | 4.5~5.2ms | 19.4~23.3ms | ~19~23ms |

측정 명령:
```bash
aws cloudwatch get-metric-statistics --region us-east-1 --namespace AWS/DynamoDB \
  --metric-name SuccessfulRequestLatency \
  --dimensions Name=TableName,Value=<table> Name=Operation,Value=<Query|Scan|GetItem> \
  --start-time <48h 전> --end-time <지금> --period 86400 \
  --statistics Average Maximum --extended-statistics p99
```

## 3. 종단 간(end-to-end) API 응답시간 — 실제 프로덕션 엔드포인트

`https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev` (service/backend)

| 요청 | 응답시간 | 페이로드 | 비고 |
|---|---|---|---|
| `channel=lens&limit=20` | 4.25s | 68.8KB | 일반 페이지 크기 |
| `channel=webtoon&limit=20` | 2.10s | 14.3KB | |
| `channel=video&limit=20` | 1.42s | 14.7KB | |
| `channel=letters&limit=20` | 1.27s | 160.1KB | |
| `channel=lens&limit=1000` | 5.57s | 2.47MB | 2026-09-07 GSI 이관 문서와 동일 조건 재현 |
| `channel=webtoon&limit=1000` | 2.89s | 603.3KB | 이관 문서 수치(2.9~4.4s, 604KB)와 거의 일치 — 이관 후 상태 확인됨 |

측정 명령:
```bash
curl -s -o /dev/null -w "time_total=%{time_total}s size=%{size_download}bytes\n" \
  "$BASE/api/v2/posts?channel=<channel>&limit=<n>"
```

**핵심 관찰**: DynamoDB 자체 처리는 15~30ms인데 종단 간 응답은 1.2~5.6초다.
**병목이 DynamoDB 엔진이 아니라 애플리케이션 레이어(스캔 후 필터링, 큰
페이로드 직렬화·전송)에 있다는 걸 다시 확인한다** — 2026-09-07 GSI 이관
문서의 결론과 일치. 이 격차 자체가 Postgres 이관에서 지켜봐야 할 핵심
지표다: Postgres는 WHERE 절로 DB가 직접 필터링하므로 이 격차가 줄어드는지가
이관 성공의 실질적 증거가 된다.

## 4. 2일 소비 용량 (트래픽 규모 감)

| 테이블 | ConsumedReadCapacityUnits (2일 합) | ConsumedWriteCapacityUnits (2일 합) |
|---|---|---|
| cms-posts | 20,431 | 23,137 |
| articles | 563.5 | 1,289 |
| personal | 59 | 9 |

`cms-posts`는 측정 구간(2일) 동안 쓰기 용량(23,137)이 읽기 용량(20,431)보다
많았다. 원인 분석은 이번 조사 범위 밖.

## 5. 이관 후 측정 (2026-09-08, Postgres dev 인스턴스)

`lens-postgres-migration-dev`(Aurora PostgreSQL 16.14, Serverless v2)에
v1.4 데이터 마이그레이션 완료 후 측정. **방법론 차이를 먼저 밝힌다**:
§3(DynamoDB)은 실제 프로덕션 API(`curl`)로 Lambda·API Gateway를 포함한
종단 간 응답을 쟀지만, Postgres 쪽은 **아직 그 앞단(Lambda/API)이 없어서
Python 스크립트→DB 직접 쿼리 왕복시간**을 쟀다 — 네트워크 왕복은
포함되지만 애플리케이션 레이어 처리(JSON 직렬화, 인증 등)는 빠져 있다.
그래서 아래 숫자는 "완전히 같은 조건의 재측정"이 아니라 **DB 계층
자체가 실제로 얼마나 빠른지의 참고치**로 읽어야 한다.

| 요청 | Postgres 응답시간 | 페이로드 | DynamoDB 이관 전(§3) | 비고 |
|---|---|---|---|---|
| webtoon limit=20 | 0.39s | 7.2KB | 2.10s / 14.3KB | |
| video limit=20 | 0.19s | 7.2KB | 1.42s / 14.7KB | |
| publications(=lens 대응) limit=20 | 0.19s | 13.8KB | 4.25s / 68.8KB | |
| webtoon limit=1000 | 0.77s | 300.6KB | 2.89s / 603.3KB | 986건 중 848건 반환(전체가 848건) |
| publications limit=1000(=lens 대응) | 0.39s | 603.4KB | 5.57s / 2.47MB | 986건 전부 반환 |

**EXPLAIN ANALYZE 결과** (`publications` 최신순 20건 조회):
```
Limit → Sort(top-N heapsort) → Seq Scan on publications
Execution Time: 0.380 ms
```
인덱스(`publications_published_idx`)를 안 쓰고 **Seq Scan**을 쓰고 있다 —
지금 데이터가 986건뿐이라 Postgres 플래너가 "테이블 전체를 훑는 게
인덱스 타는 것보다 싸다"고 판단한 것으로, **오작동이 아니라 이 규모에서
정상적인 판단**이다. 실제 프로덕션 규모(articles 기준 수만~수십만 건)로
커지면 플래너가 인덱스 스캔으로 전환하는지 재확인이 필요하다 — 지금
검증된 건 아님.

측정 스크립트: `scratchpad/benchmark.py`(psycopg2 직접 실행, `time.perf_counter()`로 측정).

## 이관 후 비교 방법 (재사용 절차)

1. 위 4개 표의 명령을 Postgres 이관 완료 시점에 동일하게 재실행
   (curl 대상만 새 API로 교체, DynamoDB 항목은 해당 없음 처리)
2. 표에 "이관 후" 열 추가, 개선율(%) 계산
3. 데이터 볼륨이 측정 시점마다 다를 수 있으니 §1의 아이템 수를 같이
   기록해 "비슷한 규모에서 비교"인지 확인
4. `13-physical-design.md`의 "DynamoDB 실사용 패턴과의 대조" 절과
   교차 참조

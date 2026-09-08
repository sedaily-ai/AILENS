# 14 · 운영 결정 — 원본에 없던 기술 결정 4가지

갱신: 2026-09-08

`lens_schema_2026-08-26.sql`(원본, 수정하지 않는다)에 조건부로 남겨져 있던
기술 결정과, 원본에도 없던 회원 탈퇴 삭제 정책을 확정한다. 원본 파일은
"기준 파일"로 그대로 두고, 이 문서가 원본 이후의 추가 결정을 담는다 —
`docs/architecture` 규칙("코드가 바뀌면 문서도 같이 고친다")에 따라 실제
마이그레이션 시 이 문서의 SQL을 원본 DDL 뒤에 이어서 실행한다.

**남은 미해결은 회원 탈퇴 삭제 정책 1건뿐** — 이건 법무/정책 판단이 필요해
이 문서에서 다루지 않는다 (`README.md` 참조).

---

## 1. 한국어 전문검색 — pg_bigm 채택

원본 주석(articles/publications/glossary_terms/media_assets 공통):
> "RDS에서 pg_bigm 사용이 가능한지 확인한 뒤, 가능하면 → pg_bigm GIN 인덱스로
> 교체(search_vector 칸은 제거), 불가하면 → pg_trgm GIN 인덱스로 보완"

**확인 결과**: pg_bigm은 Amazon Aurora PostgreSQL·RDS for PostgreSQL 양쪽 다
공식 지원 확장이다(AWS 데이터베이스 블로그, 2026 확인). → **pg_bigm 채택**.

### 왜 필요한가
`'simple'` tsvector 설정은 형태소를 안 나눠 조사가 붙은 채 색인된다("경제는"과
"경제가"가 다른 토큰) — 한국어 검색 품질이 나쁘다. pg_bigm은 2-gram 기반이라
한국어(특히 2음절 단어)에 pg_trgm(3-gram)보다 적합하다 — 원본 작성자가 이미
이 순서로 판단해뒀다.

### 스키마 변경
`search_vector` GENERATED 컬럼과 그 GIN 인덱스를 제거하고, 원문 컬럼에
`gin_bigm_ops` 인덱스를 직접 건다. 영향 테이블: `articles`, `publications`,
`glossary_terms`, `media_assets`(transcript), `rendition_blocks`(content).

```sql
CREATE EXTENSION IF NOT EXISTS pg_bigm;

-- articles: search_vector 컬럼·articles_fts_idx 제거 후
ALTER TABLE articles DROP COLUMN search_vector;
CREATE INDEX articles_title_bigm_idx    ON articles USING GIN (title gin_bigm_ops);
CREATE INDEX articles_subtitle_bigm_idx ON articles USING GIN (subtitle gin_bigm_ops);
CREATE INDEX articles_body_bigm_idx     ON articles USING GIN (body gin_bigm_ops);

-- publications: 동일 패턴
ALTER TABLE publications DROP COLUMN search_vector;
CREATE INDEX publications_title_bigm_idx    ON publications USING GIN (title gin_bigm_ops);
CREATE INDEX publications_subtitle_bigm_idx ON publications USING GIN (subtitle gin_bigm_ops);
CREATE INDEX publications_question_bigm_idx ON publications USING GIN (question gin_bigm_ops);

-- glossary_terms
ALTER TABLE glossary_terms DROP COLUMN search_vector;
CREATE INDEX glossary_terms_name_bigm_idx ON glossary_terms USING GIN (name gin_bigm_ops);
CREATE INDEX glossary_terms_desc_bigm_idx ON glossary_terms USING GIN (description gin_bigm_ops);

-- media_assets
ALTER TABLE media_assets DROP COLUMN search_vector;
CREATE INDEX media_assets_transcript_bigm_idx ON media_assets USING GIN (transcript gin_bigm_ops);

-- rendition_blocks: 익명 GIN(to_tsvector(...)) 인덱스를 bigm으로 교체
DROP INDEX rendition_blocks_fts_idx;
CREATE INDEX rendition_blocks_content_bigm_idx ON rendition_blocks USING GIN (content gin_bigm_ops);
```

`title_trgm_idx`류(pg_trgm, 오타 대응용 유사검색)는 그대로 둔다 — pg_bigm은
전문검색용, pg_trgm은 유사검색(슬러그·제목 fuzzy match)용으로 목적이 달라
둘 다 필요하다. 확장 선언에서 `pg_trgm`을 빼지 않는다.

### 애플리케이션 영향 (스키마 밖, 구현 시 처리)
tsvector 기반은 `ts_rank()`로 title A/subtitle B/body C 가중 랭킹을 DB가
계산해줬는데, pg_bigm은 컬럼별 유사도(`=%` 연산자, `bigm_similarity()`)만
주므로 **가중 합산 랭킹은 쿼리에서 직접 조합**해야 한다:

```sql
SELECT *,
  (bigm_similarity(title, :q) * 3
 + bigm_similarity(subtitle, :q) * 2
 + bigm_similarity(body, :q) * 1) AS relevance
FROM articles
WHERE title =% :q OR subtitle =% :q OR body =% :q
ORDER BY relevance DESC;
```
가중치(3/2/1)는 원본의 A/B/C 순서를 그대로 옮긴 것 — 검색 품질 튜닝 시
조정 대상.

---

## 2. 월별 파티션 자동화 — pg_partman 채택

원본은 `view_events`, `ai_usage_logs`에 2026-09/10 파티션만 수동으로 만들어
뒀다(`CREATE TABLE ..._2026_09 PARTITION OF ... FOR VALUES FROM ... TO ...`).
11월 이후를 누가 만드는지가 미정이었다.

**확인 결과**: pg_partman은 Aurora/RDS PostgreSQL 공식 지원 확장이고, AWS가
"시계열 파티션 관리용"으로 직접 소개하는 도구다. → **pg_partman 채택**.
RDS/Aurora에서는 `pg_partman_bgw`(백그라운드 워커)를 쓰려면 파라미터 그룹의
`shared_preload_libraries` 변경 + 재부팅이 필요해 운영 부담이 크므로, 대신
기존에 이미 쓰고 있는 EventBridge 스케줄 패턴(`pipeline_runs.trigger_source`
기본값이 `eventbridge`인 것과 동일한 방식)으로 `run_maintenance_proc()`를
매달 호출한다.

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

SELECT partman.create_parent(
    p_parent_table := 'public.view_events',
    p_control       := 'occurred_at',
    p_interval      := 'monthly',
    p_premake       := 2   -- 항상 2개월 치를 미리 만들어둔다
);
UPDATE partman.part_config
   SET retention = '90 days', retention_keep_table = false
 WHERE parent_table = 'public.view_events';
-- 원본 주석("90일 후 파티션째 삭제")을 pg_partman 설정으로 구현

SELECT partman.create_parent(
    p_parent_table := 'public.ai_usage_logs',
    p_control       := 'occurred_at',
    p_interval      := 'monthly',
    p_premake       := 2
);
-- retention 설정 안 함 = 무기한 보관. 비용/정산 원장 성격이라 임의로
-- 삭제 정책을 만들지 않는다 — 보존기간이 필요해지면 별도 결정.
```

**운영**: 매달 1일 00:10(KST) EventBridge 규칙 → 기존 파이프라인과 같은
방식의 경량 Lambda/ECS 태스크 1개가 `CALL partman.run_maintenance_proc();`
실행. 새 인프라 패턴을 만들지 않고 기존 것을 재사용한다.

---

## 3. `view_counts` 갱신 권한 분리

원본 주석: "real_count는 배치만 갱신한다. 애플리케이션 계정에는 UPDATE 권한을
주지 않는다. ※ 제약으로 표현할 수 없다. DB 권한으로 처리한다" — GRANT/REVOKE
문 자체는 원본에 없었다. 이 레포가 이미 `service/backend`(공개 사이트)와
`admin/backend`(편집자 도구)로 나뉜 두 백엔드 구조라, DB 역할도 그 경계를
그대로 따른다.

```sql
-- 세 역할: 공개 사이트 / 편집자 도구 / 조회수 집계 배치
CREATE ROLE lens_service_app LOGIN PASSWORD '...';
CREATE ROLE lens_admin_app   LOGIN PASSWORD '...';
CREATE ROLE lens_batch       LOGIN PASSWORD '...';

REVOKE ALL ON view_counts FROM PUBLIC;
GRANT SELECT ON view_counts TO lens_service_app, lens_admin_app, lens_batch;
GRANT INSERT ON view_counts TO lens_batch;                              -- 신규 발행물 첫 카운트 행
GRANT UPDATE (real_count, updated_at)  ON view_counts TO lens_batch;    -- 실측 갱신 = 배치 전용
GRANT UPDATE (adjustment, updated_at)  ON view_counts TO lens_admin_app; -- 조정 = 편집자 도구 전용
```

`lens_service_app`(공개 사이트)은 `view_counts`에 SELECT조차 직접 쓸 일이
없다 — 화면은 항상 `v_live_renditions` 뷰를 통해 `display_count`를 읽는다
(원본 뷰 설계 의도 그대로). `view_adjustments`(조정 사유 감사 기록)에는
`lens_admin_app`만 INSERT 가능하게 같이 묶는다.

```sql
GRANT SELECT, INSERT ON view_adjustments TO lens_admin_app;
GRANT SELECT ON view_adjustments TO lens_service_app; -- 필요 시 조정 이력 노출용, 아니면 생략
```

---

## 4. 회원 탈퇴 삭제 정책 — 하드 삭제 원칙 (2026-09-08)

### 법적 근거

개인정보보호법 제21조: 개인정보처리자는 보유기간 경과·처리 목적 달성 등
개인정보가 불필요해졌을 때 **지체 없이** 파기해야 한다. 파기 시에는
복구·재생되지 않도록 조치해야 한다(소프트 삭제 플래그만으로는 이 요건을
충족하지 못한다). 단서: 다른 법령이 보존을 요구하는 경우는 예외이며, 그
경우 해당 정보는 다른 개인정보와 **분리해서** 저장·관리해야 한다.

업계 실무 관행: "지체 없이"는 통상 근무일 기준 5일 이내로 처리된다.

### AI LENS 서비스에 적용

AI LENS는 전자상거래(결제·환불 기록 보존 의무 없음)나 통신(통신비밀보호법
대상 아님) 서비스가 아니어서, 회원 정보 보존을 강제하는 별도 법령이 없다.
→ **예외 없이 원칙(즉시 파기) 그대로 적용**.

### 결정

**탈퇴 = 하드 삭제(실제 행 삭제), 접수 후 영업일 5일 이내 처리.**

- `users.status='withdrawn'`은 탈퇴 요청 접수 시점부터 삭제 배치가 실제
  `DELETE`를 실행하기 전까지의 **임시 상태**로만 쓴다. 취소 가능한 유예
  기간이 아니라, 배치 처리 지연을 위한 임시 상태다.
- 배치가 `DELETE FROM users WHERE id = ...`를 실행하면, 원본 스키마의
  `ON DELETE CASCADE` 관계(`user_identities`, `user_archives`,
  `user_readings`, `recommendations`, `chat_conversations` → `chat_messages`
  → `chat_message_sources`, `subscriptions`)가 그대로 하드 삭제 경로가
  된다. **스키마 변경 없음** — 원본 설계가 이미 이 방식에 맞게 돼 있었다.
- `ai_usage_logs`는 `rendition_id`/`message_id`/`candidate_id`에 FK가
  없어(11-pipeline.mmd 참조) CASCADE 대상이 아니다 — `chat_messages`가
  삭제돼도 `ai_usage_logs` 행은 그대로 남고, 그 자체에 PII 컬럼이 없다.
  이게 법이 요구하는 "다른 개인정보와 분리해서 관리"를 구조적으로
  만족시킨다 — 별도 조치 불필요.

### 미해결

- 탈퇴 취소(그레이스 기간) 기능은 이번 결정 범위에 없음 — 필요하면
  이용약관에 별도 근거를 마련하고 그 기간의 열람 제한 방식을 따로
  설계해야 한다.

← [postgres 트랙 이력](../db-changelog/postgres/README.md)

**Sources:**
- [개인정보의 파기 — 찾기쉬운 생활법령정보](https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=1257&ccfNo=2&cciNo=2&cnpClsNo=3)
- [개인정보 보호법 제21조 — CaseNote](https://casenote.kr/%EB%B2%95%EB%A0%B9/%EA%B0%9C%EC%9D%B8%EC%A0%95%EB%B3%B4_%EB%B3%B4%ED%98%B8%EB%B2%95/%EC%A0%9C21%EC%A1%B0)
- [탈퇴한 회원의 개인정보 보관 및 처리 방안 가이드라인 — 법무법인 비트](https://www.veatlaw.kr/main/board_detail/1025)

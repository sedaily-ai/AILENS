# 13 · 물리 설계 — 인덱스 · 파티셔닝

갱신: 2026-09-08 (원본 `lens_디비.sql` 확인 후 전면 재작성)

**이 문서는 더 이상 추측이 아니다.** 2026-08-26 작성된 원본 DDL(`lens_디비.sql`,
로컬 `~/Downloads/lens_디비.sql`)에 인덱스·파티셔닝이 이미 전부 정의돼 있다.
아래 표는 그 정의를 그대로 옮긴 것이고, "검증" 절만 실제 DynamoDB 접근
패턴(2026-09-07 채널 GSI 이관 조사 근거)과 대조해 갭이 있는지 확인한다.

## 도메인별 인덱스 (원본 DDL 그대로)

| 테이블 | 인덱스 | 조건/방식 |
|---|---|---|
| `articles` | `articles_published_idx` | (published_at DESC) |
| | `articles_section_idx` | (section_id, published_at DESC) |
| | `articles_fts_idx` | GIN(search_vector) |
| | `articles_keywords_idx` / `articles_hashtags_idx` | GIN(배열) |
| | `articles_title_trgm_idx` | GIN(title gin_trgm_ops) |
| `article_categories` | `article_categories_reverse_idx` | (category_id, article_no) |
| `article_embeddings` | `article_embeddings_hnsw_idx` | hnsw(embedding vector_cosine_ops) |
| `external_archives` | `external_archives_date_idx` | (provider, published_at DESC) |
| `publications` | `publications_published_idx` | (published_at DESC) WHERE status='published' AND deleted_at IS NULL |
| | `publications_category_idx` | (category_id, published_at DESC) WHERE 상동 |
| | `publications_section_idx` | (section_id, published_at DESC) WHERE 상동 |
| | `publications_editor_idx` | (editor_no, updated_at DESC) |
| | `publications_deleted_idx` | (deleted_at) WHERE deleted_at IS NOT NULL |
| | `publications_fts_idx` / `publications_title_trgm_idx` | GIN(search_vector) / GIN(title gin_trgm_ops) |
| `publication_articles` | `publication_articles_reverse_idx` | (article_no) |
| `publication_slug_history` | `publication_slug_history_pub_idx` | (publication_id) |
| `renditions` | `renditions_format_idx` | (format, created_at DESC) WHERE status='ready' |
| | `renditions_retry_idx` | (next_retry_at) WHERE status='failed' |
| | `renditions_webtoon_seq_idx` | UNIQUE(sequence_no) WHERE format='webtoon' AND sequence_no IS NOT NULL |
| `rendition_blocks` | (익명 인덱스) | GIN(to_tsvector('simple', content)) |
| `media_assets` | `media_assets_fts_idx` | GIN(search_vector) |
| `publication_revisions` | `publication_revisions_pub_idx` | (publication_id, changed_at DESC) |
| `glossary_terms` | `glossary_terms_fts_idx` / `glossary_terms_trgm_idx` | GIN(search_vector) / GIN(name gin_trgm_ops) |
| | `glossary_terms_review_idx` | (created_at DESC) WHERE created_by_type='auto' AND NOT is_reviewed |
| `user_identities` | `user_identities_user_idx` | (user_id) |
| `sentence_stats` | `sentence_stats_popular_idx` | (saved_count DESC) WHERE saved_count > 1 |
| `user_archives` | `user_archives_calendar_idx` | (user_id, saved_at DESC) |
| | `user_archives_hash_idx` | (sentence_hash) |
| `archive_keywords` | `archive_keywords_archive_idx` | (archive_id) |
| `archive_embeddings` | `archive_embeddings_hnsw_idx` | hnsw(embedding vector_cosine_ops) |
| `recommendations` | `recommendations_user_idx` | (user_id, score DESC) |
| `view_events` | `view_events_pub_idx` | (publication_id, occurred_at DESC) |
| `view_counts` | `view_counts_popular_idx` | (display_count DESC) |
| `chat_conversations` | `chat_conversations_user_idx` | (user_id, updated_at DESC) WHERE user_id IS NOT NULL |
| `subscriptions` | `subscriptions_active_idx` | (newsletter_id) WHERE cancelled_at IS NULL |
| `newsletter_send_items` | `newsletter_send_items_send_idx` | (send_id) |
| `pipeline_runs` | `pipeline_runs_started_idx` | (started_at DESC) |
| `pipeline_run_items` | `pipeline_run_items_run_idx` | (run_id) |
| `lens_candidates` | `lens_candidates_article_idx` | (article_no, scored_at DESC) |
| `ai_usage_logs` | `ai_usage_logs_purpose_idx` | (purpose, occurred_at DESC) |
| `prompt_versions` | `prompt_versions_active_idx` | UNIQUE(prompt_id) WHERE is_active |
| `incidents` | `incidents_open_idx` | (opened_at DESC) WHERE status='open' |

## 파티셔닝 (원본 DDL 그대로)

- **`view_events`**: `PARTITION BY RANGE (occurred_at)`, 월별(`view_events_2026_09`,
  `view_events_2026_10` 이미 생성됨). COMMENT: "이 시스템에서 가장 빨리 커진다 ·
  조회수를 직접 UPDATE하지 않고 여기에 쌓은 뒤 주기적으로 합산 · 90일 후
  파티션째 삭제".
- **`ai_usage_logs`**: `PARTITION BY RANGE (occurred_at)`, 월별(2026_09/2026_10
  이미 생성됨), `PRIMARY KEY (id, occurred_at)` — 파티션 키가 PK에 포함돼야
  하는 Postgres 제약을 정확히 반영.

두 테이블 다 신규 월 파티션을 매달 미리 만들어두는 운영 절차가 필요했다 —
**pg_partman 채택으로 해결. `14-operations.md` 참조.**

## DynamoDB 실사용 패턴과의 대조 (검증)

2026-09-07 채널 GSI 이관 조사에서 확인한 실제 접근 패턴을 위 인덱스와 대조:

| 실제 패턴 (DynamoDB) | 대응하는 실제 인덱스 | 판정 |
|---|---|---|
| channel/status + 발행일 범위 목록 조회 | `publications_category_idx`, `publications_section_idx`, `publications_published_idx` | 일치 — 부분 인덱스(`WHERE status='published'`)까지 정확히 대응 |
| `Attr(...).contains()` 부분일치 텍스트 검색 | `publications_fts_idx`/`articles_fts_idx` GIN(search_vector) | 일치 — 원본이 이미 이 문제를 알고 설계(주석: "DDB full-scan 대체") |
| slug-trim fallback 루프 | `publications_title_trgm_idx`, `articles_title_trgm_idx` | 일치 (단, 이건 en.sedaily 프로젝트의 pg_trgm 슬러그 유사검색 사례를 본뜬 것으로 보이며, AI LENS엔 slug 자체의 trgm 인덱스는 없고 title에만 있음 — slug 오타 대응이 필요하면 추가 검토) |
| 조회수 read-modify-write(비원자적) | `view_counts.real_count`는 "배치만 갱신, 애플리케이션 계정엔 UPDATE 권한을 안 준다"(REVOKE/GRANT로 처리, 제약으로 표현 불가) | 원본이 이미 원자성보다 강한 방식(권한 분리)으로 해결 — 구체적 역할·GRANT문은 `14-operations.md` §3 |
| 챗봇 컨텍스트가 요청당 같은 인덱스 3회 호출 | 해당하는 원본 인덱스 없음(애플리케이션 레이어 이슈) | 스키마로 해결할 문제가 아님 — 이관 시 애플리케이션 코드에서 배치/조인으로 합칠 것 |
| `limit=1000` 대량 조회 | 해당 인덱스는 있으나(정렬 인덱스) LIMIT 강제는 애플리케이션 책임 | 스키마 아님 — API 계약에서 강제 필요 |

## 미해결 → 3건 결정 완료 (2026-09-08), 1건만 남음

원본에 조건부/미정으로 남아있던 3가지 기술 결정을 AWS 확장 지원 확인 후
확정했다. 구체적 SQL·근거는 `14-operations.md` 참조:

- ~~월별 파티션 자동화~~ → **pg_partman 채택** (§2)
- ~~한국어 전문검색 설정~~ → **pg_bigm 채택** (§1, tsvector 'simple' 설정 폐기)
- ~~view_counts 갱신 권한 분리~~ → **역할 3개(service/admin/batch) + 컬럼 단위 GRANT** (§3)

**남은 미해결은 회원 탈퇴 삭제 정책 1건뿐** — 법무/정책 판단 필요,
`README.md` 참조.

# 1단계 — v1 DynamoDB(기존) + v2 RDS 시도 + CMS DynamoDB 신설 (~2026-07-27 ~ 08-04)

**주의**: 이 저장소의 git 히스토리는 `2026-08-05`(`1752cac`, 초기 스냅샷
커밋)부터 시작한다. 이 단계는 커밋이 아니라 코드 주석·worklog 회고로
역추적한 것 — 실제 "단계"는 [2단계](2단계-v1v2통합-페이지네이션버그.md)부터
커밋으로 추적 가능하다.

**상태**: v1 DynamoDB 테이블(`articles`(PK `news_id`, GSI
`category-published_at-index`), `personal`, `podcast`, legacy `questions`)이
이미 운영 중이었다(`service/backend/clients/dynamodb_client.py`,
`service/backend/config/constants.py`).

**원래 계획과 실제 벌어진 일**: CMS(`cms_posts`)는 원래 **RDS pgvector
테이블로 설계**됐었다(`docs/worklog/2026-07/2026-07-27-ailens-cms-design.md`
§2.3 "신규 cms_posts 테이블 (A안)"). 그런데 `2026-08-04` 세션에서 RDS
`sedaily-mbti-pgvector-v2-dev`가 삭제되며 `cms_posts`도 함께 소실
(`docs/worklog/2026-08/2026-08-04-transform-pipeline-decommission.md`).
이 사고로 v2 Lambda 7개(today-letters/front-page/posts/collector/
editor-pick/article/feed)가 전부 깨졌고, **살아남은 유일한 읽기 경로가
v1 DynamoDB**(`/api/posts`, `/api/questions`)였다.

**결정**: 같은 날 `docs/worklog/2026-08/2026-08-04-cms-posts-dynamodb-migration.md`
에서 **CMS 저장소를 RDS 복구 대신 DynamoDB로 신규 구축**하기로 결정. 신규
테이블 `sedaily-mbti-cms-posts-dev`(PK `id`, GSI `slug-index`, GSI
`status-publish_date-index`) 생성, `admin/repo/posts_repo.py`를 SQL에서
DynamoDB로 전면 교체, moto 기반 테스트 13건 재작성. (이 결정 자체의
커밋은 다음날 스냅샷 이전이라 해시가 없고 파일만 08-05 스냅샷에 포함됨.)

**이 이력에서 배울 것**: 지금 이 프로젝트가 "DynamoDB → PostgreSQL 이관"을
검토하는 이유 중 하나가 여기 있다 — CMS는 원래 관계형(RDS)으로 설계됐다가
인프라 사고로 어쩔 수 없이 DynamoDB로 급전환된 이력이 있다. 지금의 Postgres
이관 검토는 "새로운 시도"가 아니라 "원래 계획으로의 복귀"에 가깝다.

← [dynamodb 트랙 인덱스](README.md) · 다음: [2단계](2단계-v1v2통합-페이지네이션버그.md)

# db-changelog — AI LENS 데이터베이스 전체 이력

AI LENS의 데이터 저장 방식이 처음부터 지금까지 어떻게 바뀌어왔는지, 왜
그렇게 됐는지, 어떤 성과(비포/애프터 수치)가 있었는지를 두 트랙으로 나눠
버전별 파일에 남긴다. 한 파일에 다 몰아넣지 않고 폴더+버전별 파일로 쪼갠
이유는 순전히 가독성 — 한눈에 훑고 싶은 항목만 열어보게.

## 두 트랙

- **[dynamodb/](dynamodb/README.md)** — 지금 실제로 돌고 있는 시스템의
  역사. 2026-07말부터 지금까지: v1 운영, CMS의 관계형→DynamoDB 급전환,
  버그와 수정, 성능 사고와 해결.
- **[postgres/](postgres/README.md)** — DynamoDB에서 이관하기 위해 짓고
  있는 미래 설계의 역사. 2026-08-26 원본 설계부터 지금 논리·물리 설계
  확정까지.

두 트랙은 2026-09-07(dynamodb의 GSI 이관 실측)과 2026-09-08(양쪽 다 활동)
에서 서로 참조한다 — dynamodb 트랙의 실측이 postgres 트랙의 물리 설계
근거가 되는 식.

## 통합 타임라인

| 날짜 | 트랙 | 항목 |
|---|---|---|
| ~2026-07-27~08-04 | dynamodb | [1단계 — v1 초기설계, CMS 관계형→DynamoDB 급전환](dynamodb/1단계-v1초기설계-cms신설.md) |
| 2026-08-05~08-09 | dynamodb | [2단계 — v1/v2 통합, 페이지네이션 버그](dynamodb/2단계-v1v2통합-페이지네이션버그.md) |
| 2026-08-17~08-23 | dynamodb | [3단계 — 리네이밍, 채널 분리+백필](dynamodb/3단계-리네이밍-채널분리-백필.md) |
| 2026-08-26 | postgres | [v0.1 — 원본 스키마 설계](postgres/v0.1-원본-스키마-설계.md) |
| 2026-09-01 | postgres | [v0.2 — ERD 문서화](postgres/v0.2-erd-문서화.md) |
| 2026-09-03 | dynamodb | [lens 500 에러, payload 최적화](dynamodb/2026-09-03-lens-500에러-payload최적화.md) |
| 2026-09-07 | dynamodb | [channel GSI 이관 (9.8초→6.0초)](dynamodb/2026-09-07-channel-gsi-이관.md) |
| 2026-09-08 | postgres | [v1.0 — 논리·물리 설계 확정](postgres/v1.0-논리물리-설계-확정.md) |
| 2026-09-08 | dynamodb | [이관 전 베이스라인 확보](dynamodb/2026-09-08-이관전-베이스라인.md) |
| 2026-09-08 | postgres | [v1.1 — 회원 탈퇴 삭제 정책 확정](postgres/v1.1-탈퇴정책-확정.md) |
| 2026-09-08 | postgres | [v1.2 — Aurora PostgreSQL dev 인스턴스 프로비저닝](postgres/v1.2-인프라-프로비저닝.md) |
| 2026-09-08 | postgres | [v1.3 — 스키마·운영 결정 실적용 및 검증](postgres/v1.3-스키마-실적용-검증.md) |
| 2026-09-08 | postgres | [v1.4 — 데이터 마이그레이션 실행 (28,970건 실사용 데이터 이관)](postgres/v1.4-데이터-마이그레이션-실행.md) |
| 2026-09-08 | postgres | [v1.5 — 이관 전/후 베이스라인 비교](postgres/v1.5-베이스라인-비교.md) |
| 2026-09-08 | postgres | [v1.6 — articles 본문 백필 + 이미지·관련기사 이관](postgres/v1.6-articles-본문-백필.md) |
| 2026-09-08 | postgres | [v1.7 — article_categories 매핑 확정·이관](postgres/v1.7-article-categories-매핑.md) |
| 2026-09-09 | postgres | [v1.8 — 뱃지·커뮤니티 게시판 스키마 확장](postgres/v1.8-뱃지-커뮤니티-스키마확장.md) |
| 2026-09-09 | postgres | [v1.9 — newsletters 시드 + 구독자 이관](postgres/v1.9-newsletter-구독자-이관.md) |
| 2026-09-09 | postgres | [v1.10 — 백엔드 Postgres 클라이언트 작성·검증](postgres/v1.10-백엔드-postgres-클라이언트.md) |
| 2026-09-09 | postgres | [v1.11 — 프로덕션 배포](postgres/v1.11-프로덕션-배포.md) |
| 2026-09-09 | postgres | [v1.12 — lens 콘텐츠 백필](postgres/v1.12-lens-콘텐츠-백필.md) |
| 2026-09-09 | postgres | [v1.13 — pg8000 전환 + slug 이슈 발견](postgres/v1.13-pg8000-전환-slug이슈.md) |
| 2026-09-09 | postgres | [v1.14 — pg8000 전환분 프로덕션 배포](postgres/v1.14-pg8000-배포.md) |
| 2026-09-09 | postgres | [v1.15 — publication_slug_history 백필 + slug 폴백](postgres/v1.15-slug-history-백필.md) |
| 2026-09-09 | postgres | [v1.16 — slug 조회 channel 기반 포맷 disambiguation](postgres/v1.16-slug-channel-disambiguation.md) |
| 2026-09-09 | postgres | [v1.17 — lens 단건 조회 렌디션 조립](postgres/v1.17-lens-단건조회-조립.md) |
| 2026-09-09 | postgres | [v1.18 — lens 목록 조회 라벨 배치 조회](postgres/v1.18-lens-목록조회-라벨.md) |
| 2026-09-09 | postgres | [v1.19 — 컷오버 전 데이터 재동기화](postgres/v1.19-재동기화.md) |

## 새 항목 추가 규칙

1. 의미 있는 변화(스키마 결정, 실측 결과, 방향 전환, 사고와 해결)가
   생기면 해당 트랙 폴더에 새 파일을 만든다.
2. 파일명: postgres 트랙은 `vX.Y-주제.md`, dynamodb 트랙은 날짜 단위
   사건이면 `YYYY-MM-DD-주제.md`, 여러 주에 걸친 뭉치라면 `N단계-주제.md`.
3. 새 파일을 해당 트랙 `README.md` 표와 이 파일의 통합 타임라인 양쪽에
   추가하고, 앞뒤 항목의 "이전/다음" 링크도 갱신한다.
4. 지나간 항목은 고치지 않는다 — 나중에 틀린 게 밝혀져도 취소선 + 정정
   링크만 추가한다("그때는 이렇게 판단했다"가 기록의 가치).

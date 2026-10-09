# 05. CMS 백오피스·프롬프트 실험 환경 점검

결론: CRUD는 동기·소프트 삭제·감사 로그로 동작하나 사이트 갱신 실패가 조용히 묻히고 낙관적 락이 없음. 프롬프트 랩은 "눈으로 확인하는 용도" 수준이며, 시험과 실제 파이프라인 사이 괴리와 "저장=즉시 발행" 구조가 핵심 문제.

조사는 코드 기준(프론트 일부 키워드 검색). 운영에서 CRUD를 직접 실행해 확인한 것은 아님.

## 1. CMS CRUD 경로

공통: 브라우저(`adminClient.request`, 타임아웃 없음) → API Gateway(HTTP) → Lambda `lambda_handler` → JWT 검증 → `posts_repo`(urllib, 8초 타임아웃) → `lens-cms-api`(EC2, HTTP) → Aurora. 이어서 Lambda가 `audit.log`와 `notify_content_changed`(revalidate)를 동기 호출.

| 작업 | 라우트 | 서버 동작 | 후처리 |
|---|---|---|---|
| 생성 | `POST /admin/posts` | 항상 draft로 INSERT | 감사 · revalidate |
| 수정 | `PUT /admin/posts/{id}?channel=` | 본문 변경 시 renditions DELETE 후 재작성 | 감사 · revalidate |
| 상태 변경 | `POST …/publish`·`unpublish` | `set_status` | 감사 · revalidate |
| 삭제 | `DELETE` | 소프트 삭제(`deleted_at`) | 감사 · revalidate |
| 순서 변경 | 전용 라우트 없음 (`display_order`는 일반 PUT 필드) | — | — |
| 대량 작업 | 서버 API 없음, 프론트가 `Promise.allSettled`로 DELETE N회 | 건당 1회 | 건당 revalidate |

반영 경로: Lambda → `POST {SITE_URL}/api/revalidate`(헤더 `X-Revalidate-Secret`) → Next가 8개 `posts:*` 태그를 `revalidateTag(tag,{expire:0})`. CloudFront에 쌓인 HTML은 TTL(홈 300초 + stale 300초)로 최대 약 10분 지연.

## 2. 일관성·UX 위험

| # | 위험 | 상태 | 조치(제안) |
|---|---|---|---|
| 1 | 저장 성공 + 사이트 갱신 실패 | fail-open: 응답은 성공, 로그 warning만. 재시도 큐·알림 없음. 최대 5~10분 지연 | 갱신 실패를 응답·UI에 표시, 재시도 |
| 2 | 낙관적 락 없음 | last-write-wins, 수정 시 DELETE 후 재INSERT | `updated_at` 비교(기반 버전 전달) |
| 3 | 클라이언트 타임아웃 없음 | 지연 시 API Gateway 30초 504만 표시 | 요청 타임아웃·재시도 안내 |
| 4 | 대량 삭제 부분 실패 | "N건 삭제, M건 실패"만 표시, 실패 id 없음 | 실패 id 노출, 서버 일괄 삭제 API |
| 5 | audit 실패 무시(fail-open) | 감사 누락 가능 | 실패 시 경고 |
| 6 | `letters`는 DynamoDB 사용 | `letters_repo.py` 잔존 | Aurora 이관 완결 |
| 7 | slug 중복 레이스 | SELECT 후 INSERT, UNIQUE 제약 여부 미확인(추정) | 제약 확인·재시도 |
| 8 | 잘못된 JSON 본문 | `{}`로 처리 → 수정은 빈 수정으로 200 가능 | 400 반환 |
| 9 | 내부 API 평문 HTTP | EC2 IP:80 | HTTPS 전환(주석 TODO) |
| 10 | 낙관적 업데이트 없음 | 저장 후 응답으로 갱신 | 현행 유지 가능 |

양호: 신규 글은 항상 draft, 삭제는 소프트, 감사 로그(세션·IP) 기록, `busy`로 중복 제출 방지, 401 시 로그인 이동.

## 3. 테스트 현황

| 항목 | 결과 |
|---|---|
| admin 백엔드 | 146건 중 144 통과, 2 실패, 1개 파일 수집 오류 |
| 실패 1 | `test_get_returns_404_when_missing`: 모킹 `lambda pid`가 `posts_repo.get(id, channel)` 2번째 인자 미수용 |
| 실패 2 | `test_update_writes_audit_row`: 모킹 시그니처 `(id, body, channel)` 불일치 |
| 수집 오류 | `test_handler_dispatch.py`: 테스트 환경에 `elevenlabs_tts` 모듈 없음(배포 시 복사되는 모듈) |
| 덮는 범위 | 라우트 17건, repo HTTP 클라이언트 9건 |
| 못 덮는 범위 | revalidate 호출, `lens-cms-api` SQL(테스트 없음), 동시 수정, 대량 삭제, 크기 한도 |
| 프론트 | 테스트 0건 |

## 4. CRUD 스모크 테스트 (7단계)

로컬 서버(`local_server.py`) 또는 스테이징에서만 실행. 운영에서 실행하면 revalidate가 운영 캐시를 흔들고 실제 데이터에 쓰므로 `notify`를 끄거나 별도 환경 사용.

| 단계 | 호출 | 검증 | 오염 방지 |
|---|---|---|---|
| 1 | `POST /admin/posts` — headline `__SMOKE__-{ts}`, `publish_date` 2000-01-01, `channels:["feed"]` | 201, `status==draft`, slug에 `__SMOKE__`, `published_at` null | draft라 공개 목록 미노출 |
| 2 | `GET /admin/posts/{id}` | 필드 일치 | — |
| 3 | `PUT` headline 변경 | 응답·재조회 모두 변경값, `updated_at` 증가 | — |
| 4 | publish 후 즉시 unpublish | 중간 `published` + `published_at` 채움, 최종 draft | 노출 구간 최소화, publish는 스테이징 권장 |
| 5 | 공개 `GET /api/v2/posts/{slug}`(draft 상태) | 404 또는 목록 미포함 | — |
| 6 | `DELETE` | 200, 재조회 404, 목록 미포함 | 소프트 삭제 → `__SMOKE__` 접두사로 주기 정리(SQL은 DBA 승인 후 수동) |
| 7 | `GET /admin/audit` | create·update·publish·unpublish·delete 5건 확인 | — |
| 부가 | `notify` 모킹·시크릿 비운 환경 | revalidate 실패에도 200 (fail-open 확인) | — |

주기 실행(주 1회) 시 자동화하고 결과를 06 문서의 QA 리포트에 합산.

## 5. 프롬프트 실험 환경

### 5.1 제공 기능

| 기능 | 상태 |
|---|---|
| 설명·지침·파일 개별 편집, 발행 시 조립 | 있음 |
| 저장과 활성화 분리 | 있음 (`activate=False` 저장 + 별도 `/activate`) — 단 랩의 "발행"은 즉시 활성화 |
| 버전 이력·이름·삭제 | 있음 (활성 버전 삭제 거부) |
| 버전 비교 | 색깔 diff 없음, 과거 버전을 읽기 전용으로 나란히 표시 |
| 롤백 | 과거 버전을 활성화로 대체 |
| 시험 실행 | 비동기 job + 폴링, 기사 원문 붙여넣기 |
| 모델 선택 | opus-5 · sonnet-5 · opus-5-5 · gpt-6-astra · gpt-6-sol |
| 이미지 모델 실험 | 웹툰 탭 |
| 스레드(대화) 저장 | 있음 |

### 5.2 시험 환경 vs 실제 파이프라인

| 항목 | 파이프라인 | 시험 | 영향 |
|---|---|---|---|
| 팩트시트 | 있음 (`extract_facts`) | 없음 | 높음 — 숫자·날짜 처리가 달라 품질 오판 |
| 분량 점검·재시도 | 예산 점검 후 재생성 | 1회 호출 | 높음 — 시험에선 초과가 보이나 실제는 보정 |
| 웹툰 max_tokens | `call_json` 4,000(주석 기준, 현재 값 미확인) | 16,000 | 높음 — 시험 통과 후 실제에서 잘릴 수 있음 |
| 후처리 | 컷 정규화 등 | 원문 텍스트 그대로 | 중간 |
| 입력 기사 상한 | 제한 없음(추정) | 시험 job 60KB, 채팅 경로 12,000자(조용히 잘림) | 중간 — 경로 간 결과 상이 |
| 지침 출처 | 활성 버전 | 초안·임의 버전 | 의도된 차이 |

### 5.3 안전성

| 항목 | 현황 |
|---|---|
| 저장=발행 | 랩 "발행"은 `activate=True`로 즉시 활성화, 확인·가드 없음 |
| 권한 | 단일 공유 관리자 계정, 편집자 구분 없음, 로그인 5회 실패 lockout |
| 동시 편집 | 낙관적 잠금 없음, 버전 번호 `MAX+1`이라 동시 저장 시 충돌 가능(추정) |
| 비용 폭주 | 기사 60KB 상한만 있음, 호출 횟수·일일 한도·동시 job 제한 없음 |
| 크기 한도 | 프롬프트 340KB 초과 시 400 |
| 타임아웃 | API Gateway 30초 → 비동기 job, Bedrock 300초, Lambda 900초 |
| 추론 토큰 소진 | sonnet-5는 `thinking` 비활성화로 완화, opus-5-5는 비활성화 미지원(`adaptive`+`low`만), gpt-6 계열은 thinking 파라미터 거부 |
| 감사 | `prompt-activate`·`prompt-test-*` 기록, 활성화 로그에 actor 없음 |

### 5.4 개선 항목

| ID | 항목 | 난이도 | 효과 |
|---|---|---|---|
| L1 | 랩 "발행"을 비활성 저장으로 바꾸고, 활성화는 별도 확인(변경 요약·직전 활성 버전 표시)으로 분리 | 하 | 저장 즉시 반영 위험 제거 |
| L2 | 시험에 파이프라인과 같은 입력 조립(팩트시트)·후처리(분량·형식 검사) 공유 모듈 적용 | 중~상 | 시험 신뢰도 확보 (파이프라인 코드를 admin Lambda가 import하지 않는 구조라 모듈 분리 필요) |
| L3 | 웹툰 max_tokens 괴리(4,000 vs 16,000) 확인·통일 | 하 | 실제 발행 잘림 방지 |
| L4 | 시험 결과에 입력·출력 토큰과 추정 비용 표시 | 하 | Converse 응답 `usage` 저장 |
| L5 | 같은 기사로 버전 A·B 병렬 비교 + 자동 채점(분량 예산·숫자 대조·형식 파싱) | 중 | 눈대중 평가 제거 |
| L6 | 호출 횟수·동시 job·일일 비용 상한 | 중 | 비용 폭주 방지 |
| L7 | 낙관적 잠금(기반 버전 번호 전달), 활성화 로그에 편집자 기록 | 중 | 덮어쓰기 방지 |
| L8 | 골든 세트(기사 10건) 일괄 실행 | 상 | 회귀 검증 |
| L9 | 시험 시 모델·temperature 고정 저장 | 중 | 재현성 (모델 시드 지원 여부 미확인) |
| L10 | 입력 기사 상한 일관화(60KB vs 12,000자) | 하 | 경로 간 결과 일치 |

### 5.5 확인하지 못한 부분

- 프론트 `lib/adminClient.ts`와 `app/(authenticated)/prompts/**` 본문, 일부 `main.py` 랩 발행 함수
- 시험 job 저장소 TTL
- 랩 "발행"의 내부 `activate` 값(기본 호출로 추정)

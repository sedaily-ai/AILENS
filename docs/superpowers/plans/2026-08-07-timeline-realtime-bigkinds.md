# 작업지시서 — 타임라인 "실시간 News" 빅카인즈 연동

작성일: 2026-08-07
대상: 백엔드 담당 팀원

## 1. 목표

홈 "실시간 News" 섹션(`TimelinePreviewSection.tsx`)과 `/timeline` 페이지의 뉴스
목록을 목업이 아닌 **빅카인즈(BigKinds) API 기반 실제 뉴스**로 연결하고,
지연 없이 계속 갱신되도록 만든다.

## 2. 목적

지금은 프론트 UI만 완성된 상태고 뉴스 목록은 고정 목업이라 "실시간"이라는
이름이 실제로는 작동하지 않는다. 사용자가 접속할 때마다 최신 경제 뉴스를
지연 없이 볼 수 있어야 "실시간 News" 섹션이 제 몫을 한다.

## 3. 이상적 완성의 기준 (Definition of Done)

1. `GET/POST /api/timeline`이 404가 아니라 실제 데이터를 반환한다.
2. 홈 "실시간 News" 섹션과 `/timeline` 페이지 둘 다 목업이 아닌 실제
   최신 기사를 지연 없이(체감상 실시간에 가깝게) 보여준다.
3. 빅카인즈 API 실패 시에도 기존 DynamoDB 폴백(`/api/search`)으로 자연스럽게
   내려앉아 화면이 깨지지 않는다 — 이미 구현된 폴백 로직(NewsTimeMachine.tsx
   `fetchDayArticles`)은 그대로 유지.
4. `TimelinePreviewSection.tsx`의 목업 배열(`DATE_OPTIONS`)과 날짜→목업
   매핑 로직(`bucketForDate`)을 제거하고 실제 API 응답으로 교체한다.

## 4. 현재 상태 (2026-08-07 실측)

| 항목 | 상태 |
|---|---|
| 백엔드 코드 (`handlers/timeline_handler.py`, `clients/bigkinds_client.py`) | ✅ 이미 존재 (완료) |
| `config/settings.py`/`constants.py`의 빅카인즈 설정 | ✅ 이미 존재 (완료) |
| `deploy.sh`의 `API_FUNCTIONS`에 `sedaily-mbti-timeline-dev` 등록 | ✅ 이미 존재 (완료) |
| Lambda 함수 `sedaily-mbti-timeline-dev` | ❌ 없음 (`GetFunction` 404 확인) |
| API Gateway 라우트 `GET/POST /api/timeline` | ❌ 없음 (라우트 목록에 없음) |
| SSM `BIGKINDS_API_KEY` | ❌ 없음 |
| 홈 "실시간 News" / `/timeline` 프론트 | ✅ UI 완성, 목업 데이터로 동작 중 |

## 5. 남은 작업 — ⚠️ 아래는 사람 승인 필요 (자동화 대상 아님)

- [ ] Lambda 함수 `sedaily-mbti-timeline-dev` 생성 (기존 `sedaily-mbti-search-dev`
      설정을 템플릿으로 — 역할·런타임 동일, 핸들러만
      `handlers.timeline_handler.lambda_handler`)
- [ ] API Gateway(`chzwwtjtgk`)에 `GET /api/timeline`, `POST /api/timeline`
      라우트 2개 추가 (기존 `POST /api/search` 라우트를 템플릿으로)
- [ ] 빅카인즈 API 키 발급(한국언론진흥재단) 후 SSM SecureString으로 등록
      (`common/secrets.py` 패턴 참조)
- [ ] `./deploy.sh api` 재실행 — Lambda 생성 후엔 자동으로 코드 업데이트됨
- [ ] `TimelinePreviewSection.tsx` 목업 제거, 실제 fetch로 교체 (프론트)

## 6. 참고

더 상세한 기술 배경(엔드포인트 스펙, 폴백 설계 이유 등)은 같은 폴더의
`2026-08-06-timeline-lambda-connect.md` 참고 — 단, 그 문서의 "§A 코드 포팅"
부분은 이미 완료된 상태(위 §4 참조)라 무효.

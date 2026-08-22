# "타임라인" 탭 실연결 작업요청서

**작성일**: 2026-08-06
**대상**: 백엔드/인프라 작업자 (사람 또는 에이전트)
**작업 디렉터리**: `service/backend/` (모든 명령은 여기서 실행)

---

## 1. 배경 — 지금 뭐가 문제인가

헤더 "타임라인" 탭(`/timeline`)은 `NewsTimeMachine.tsx`가 렌더한다. 이 컴포넌트는
`/api/timeline`(1순위, 빅카인즈 기반 — 에디터별 보기 + "그날의 이슈")을 먼저 호출하고
실패하면 `/api/search`(2순위, 기존 DynamoDB)로 자동 폴백하도록 **의도적으로** 설계돼
있다. 코드 자체는 잘 만들어져 있다 — 문제는 1순위 엔드포인트가 배포된 적이 없다는
것이다.

**확인된 사실 (2026-08-06 실측):**

```bash
$ curl -s -o /dev/null -w "%{http_code}" \
  "https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/timeline?date=2026-08-05"
404

$ aws lambda get-function --function-name sedaily-mbti-timeline-dev --region us-east-1
ResourceNotFoundException: Function not found

$ aws apigatewayv2 get-routes --api-id chzwwtjtgk --region us-east-1 \
  --query "Items[?contains(RouteKey, 'timeline')]"
[]   # 라우트 자체가 없다

$ curl -s -X POST ".../api/search" -d '{"query":"*","filters":{...}}'
200  # 폴백 경로는 정상 동작
```

**사용자 체감:** 화면이 완전히 깨지진 않는다 — 폴백이 있어서 기본 기사 목록은 나온다.
다만 "에디터별 보기를 불러오지 못해 기본 목록을 보여주고 있어요" 배너가 뜨고,
**"그날의 이슈" 탭은 폴백이 없어서 에러 상태**가 된다(`NewsTimeMachine.tsx`의
`fetchIssues()`는 실패 시 `.catch(() => setIssuesError(true))`만 하고 대체 데이터가
없다).

## 2. 원인 — 왜 배포가 안 됐나

이 레포는 로컬에 두 개의 체크아웃이 있다(`dev`, `dev2` — 같은 GitHub 저장소,
서로 다른 커밋에서 갈라짐). **`/api/timeline`을 구현한 백엔드 코드는 `dev2`에만
있고, 실제로 배포되는 쪽(`dev`)에는 없다.**

```
service/backend/handlers/timeline_handler.py          dev: 없음   dev2: 있음 (609줄)
service/backend/clients/bigkinds_client.py             dev: 없음   dev2: 있음 (632줄)
service/backend/services/issue_digest_service.py       dev: 없음   dev2: 있음 (123줄)
service/backend/services/persona_curation_service.py   dev: 없음   dev2: 있음 (168줄)
```

`dev2`의 `deploy.sh`에는 `sedaily-mbti-timeline-dev`가 `API_FUNCTIONS`에 이미
들어 있다(주석: "함수가 아직 없으면 아래 배포 루프가 [SKIP]으로 조용히 건너뛴다") —
즉 코드를 쓴 사람도 이 Lambda가 아직 없다는 걸 알고 있었다. `dev`의 `deploy.sh`에는
이 항목 자체가 없다.

흥미로운 점: `dev`의 `config/settings.py`/`config/constants.py`에는 이미
`bigkinds_api_key`/`bigkinds_api_url`/`BIGKINDS_API_URL_DEFAULT` 가 있다 — 이 기능을
붙이려던 흔적은 `dev` 쪽에도 있었는데, 실제 클라이언트/핸들러 파일과 나머지 상수가
빠진 채로 멈춰 있었다.

## 3. 작업 범위

### A. 코드 포팅 (dev2 → dev)

- [ ] **신규 파일 4개를 `dev2`에서 `dev`로 그대로 복사한다:**
  - `service/backend/handlers/timeline_handler.py`
  - `service/backend/clients/bigkinds_client.py`
  - `service/backend/services/issue_digest_service.py`
  - `service/backend/services/persona_curation_service.py`
  - 복사 전에 `dev`에 같은 이름의 파일이 없는지 다시 확인할 것(위 표 기준으로는 없음).
  - 복사 후 두 체크아웃의 `handlers/search_handler.py`(`timeline_handler.py`가
    2순위 폴백으로 import하는 `search_dynamodb_optimized`)가 시그니처까지
    동일한지 diff로 확인 — 다르면 `timeline_handler.py`를 `dev`쪽 시그니처에 맞게 조정.

- [ ] **`config/constants.py` 병합** — `dev`에는 `BIGKINDS_API_URL_DEFAULT`(68행)와
  `MAX_PAGE_SIZE`(204행)만 있다. `dev2`의 같은 파일에서 아래 블록을 가져와
  `BIGKINDS_API_URL_DEFAULT` 선언 근처에 추가한다 (`dev2/service/backend/config/constants.py`
  205~380행 부근):
  - `BIGKINDS_ENDPOINT_SEARCH` / `_ISSUE_RANKING` / `_WORD_CLOUD` / `_TIME_LINE` / `_QUERY_RANK`
  - `BIGKINDS_PROVIDER_SEDAILY`, `BIGKINDS_PROVIDER_CODE_SEDAILY`
  - `BIGKINDS_MAX_RETURN_FROM`, `BIGKINDS_MAX_RETURN_SIZE`, `BIGKINDS_MAX_HILIGHT`
  - `BIGKINDS_DEFAULT_FIELDS`
  - `BIGKINDS_CATEGORY_TO_STANDARD`
  - `dev`의 기존 `MAX_PAGE_SIZE = 100` 등 겹치는 상수는 건드리지 않는다 — 위 블록만 추가.

- [ ] **`config/settings.py`는 이미 호환** — `bigkinds_api_key`/`bigkinds_api_url`
  필드가 `dev`에 이미 있다(위 §2 참조). 수정 불필요, import만 확인.

- [ ] **로컬 `main.py`(FastAPI) 연결은 선택사항** — `dev2/main.py`에는
  `/api/timeline` GET/POST 라우트가 이미 있다(37행, 156~224행 부근). `dev`의
  `main.py`는 로컬 개발 서버 전용이라 급하지 않지만, 로컬에서 검증하려면 이 부분도
  같이 포팅하는 게 편하다.

- [ ] **문법·타입 검증:**
  ```bash
  cd service/backend
  python3 -c "import ast; ast.parse(open('handlers/timeline_handler.py').read())"
  python3 -c "import ast; ast.parse(open('clients/bigkinds_client.py').read())"
  python3 -c "import ast; ast.parse(open('services/issue_digest_service.py').read())"
  python3 -c "import ast; ast.parse(open('services/persona_curation_service.py').read())"
  python3 -c "from handlers.timeline_handler import lambda_handler"
  ```

- [ ] **테스트 포팅** — `dev2/service/backend/tests/`에 timeline 관련 테스트가
  있는지 확인하고(`find . -iname "*timeline*" -path "*/tests/*"`), 있으면 같이
  포팅해서 `dev`에서도 통과하는지 확인한다.

### B. AWS 리소스 생성 — ⚠️ 여기부터는 반드시 사전 승인받고 진행

레포 규칙(v2 `.clauderules`와 동일한 원칙을 v1에도 적용): **Lambda 함수 생성·삭제와
API Gateway 라우트 생성은 자동화하지 않는다.** `update-function-code`만 자동 경로다.
아래는 사람이 직접(또는 명시적 승인 후) 실행한다.

- [ ] **Lambda 함수 생성** — 기존 `sedaily-mbti-search-dev`를 템플릿으로 쓴다
  (2026-08-06 실측 설정):
  ```
  Role:        arn:aws:iam::887078546492:role/sedaily-mbti-lambda-execution-dev
  Runtime:     python3.11
  Handler:     handlers.timeline_handler.lambda_handler
  Timeout:     30초 이상 권장 (빅카인즈 왕복 2회 — issue_ranking + 배치 상세조회)
  MemorySize:  1024
  함수 이름:    sedaily-mbti-timeline-dev
  ```
  코드는 `./deploy.sh`가 만드는 `lambda_package.zip`을 그대로 쓸 수 있다(§A 포팅이
  끝나면 `API_FUNCTIONS` 배열에 `sedaily-mbti-timeline-dev`를 추가 — 아래 §D 참조).

- [ ] **API Gateway 라우트 2개 추가** — 기존 `POST /api/search` 라우트를 템플릿으로
  쓴다 (2026-08-06 실측 설정, API ID `chzwwtjtgk`):
  ```
  IntegrationType:        AWS_PROXY
  IntegrationMethod:      POST
  PayloadFormatVersion:   2.0
  IntegrationUri:         arn:aws:lambda:us-east-1:887078546492:function:sedaily-mbti-timeline-dev
  AuthorizationType:      NONE
  ApiKeyRequired:         false
  ```
  라우트는 **GET과 POST 둘 다** 필요하다 — `NewsTimeMachine.tsx`가 두 메서드를 모두
  쓴다(`fetchDayArticles`/`fetchIssues`는 POST, `main.py`엔 GET도 있음 — 실제
  프론트 호출 방식을 `dev2`의 `NewsTimeMachine.tsx`에서 다시 한번 확인하고 필요한
  메서드만 정확히 연다).
  Lambda 쪽에 API Gateway invoke 권한(`lambda add-permission`, principal
  `apigateway.amazonaws.com`)도 함께 추가해야 403이 안 난다.

### C. 외부 의존성 — 빅카인즈 API 키

- [ ] `BIGKINDS_API_KEY` 환경변수가 **어디에도 없다** (SSM에 관련 파라미터 0개,
  기존 Lambda 어디에도 env var 없음 — 2026-08-06 확인). 키가 없으면
  `bigkinds_client.py`는 인증 실패로 폴백(2순위 DynamoDB)만 타서, Lambda를 배포해도
  "에디터별 보기"·"그날의 이슈"는 여전히 안 나온다(기존 폴백과 결과가 같아짐 —
  단 최소한 404는 사라지고 정상 경로를 타게 됨).
  - 한국언론진흥재단 빅카인즈에서 API 키를 발급받아야 한다(외부 서비스,
    가입/승인 필요할 수 있음 — 소요 시간 확인 필요).
  - 발급받으면 Lambda 환경변수 `BIGKINDS_API_KEY`로 주입(SSM SecureString 경유
    권장 — `common/secrets.py` 패턴 참조, `service/backend/CLAUDE.md`의 `common/`
    섹션).

### D. 배포 스크립트 반영

- [ ] `service/backend/deploy.sh`의 `API_FUNCTIONS` 배열에
  `"sedaily-mbti-timeline-dev"`를 추가한다(`dev2`의 같은 파일 112~120행 부근을
  참고 — 이미 정확히 이 항목이 들어있다).
- [ ] 최초 1회는 위 §B의 Lambda가 **먼저 수동으로 생성돼 있어야** `./deploy.sh api`가
  `update-function-code`로 코드를 올릴 수 있다(함수가 없으면 조용히 [SKIP]됨 —
  실패로 안 보이니 배포 로그를 반드시 확인).

### E. 검증

- [ ] 배포 후:
  ```bash
  curl -s -X POST ".../dev/api/timeline" \
    -H "Content-Type: application/json" \
    -d '{"date":"2026-08-05","mode":"personas","per_persona":5,"page_size":30}'
  # 200 + articles/personas/source 필드 확인. source 가 "dynamodb"면 빅카인즈 키
  # 미설정 상태에서도 정상 폴백 중인 것 — 404가 아니라는 게 1차 목표.
  ```
- [ ] 프론트(`dev2` 기준, 추후 `dev`에도 반영) `/timeline`에서 "에디터별 보기" 배너가
  사라지는지, "그날의 이슈" 탭이 에러 없이 뜨는지 브라우저로 확인.
- [ ] 빅카인즈 키를 넣은 뒤에는 응답의 `source`가 `"bigkinds"`로 바뀌는지 확인.

## 4. 완료 기준

1. `GET/POST https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/api/timeline`이 404가 아니다.
2. `/timeline` 화면에서 "에디터별 보기를 불러오지 못해…" 배너가 안 뜬다.
3. "그날의 이슈" 탭이 에러 상태 없이 렌더된다(빅카인즈 키 없어도 최소한 크래시는 없어야 함 — 키가 없으면 이슈 목록이 비어 보이는 것까지는 정상, 에러 배너가 뜨는 건 비정상).
4. `service/backend/deploy.sh api`가 `sedaily-mbti-timeline-dev`를 [SKIP] 없이 업데이트한다.

## 5. 참고 — 이번 조사에서 확인한 파일 위치

| 내용 | 경로 |
|---|---|
| 프론트 호출부 | `service/frontend/src/components/timeline/NewsTimeMachine.tsx` (dev/dev2 공통 존재, 로직 동일) |
| 헤더 탭 정의 | `service/frontend/src/shared/lib/headerTabs.ts` |
| 백엔드 핸들러 (dev2에만 있음) | `service/backend/handlers/timeline_handler.py` |
| 빅카인즈 클라이언트 (dev2에만 있음) | `service/backend/clients/bigkinds_client.py` |
| 관련 서비스 (dev2에만 있음) | `service/backend/services/issue_digest_service.py`, `services/persona_curation_service.py` |
| 배포 스크립트 | `service/backend/deploy.sh` (`API_FUNCTIONS` 배열) |
| 기존 Lambda 설정 템플릿 | `sedaily-mbti-search-dev` (역할·런타임·핸들러 패턴 참고용) |
| 기존 API GW 라우트 템플릿 | `POST /api/search` (integration 설정 참고용) |

## 6. 미해결 질문 (작업자가 판단해야 할 것)

- 빅카인즈 API 키를 지금 발급받을 것인지, 아니면 일단 Lambda·라우트만 만들어서
  "폴백이지만 404는 아닌" 상태로 먼저 개선할 것인지 — 우선순위 확인 필요.
- `dev`/`dev2` 두 체크아웃이 계속 따로 존재하는 것 자체가 근본 문제다(이번
  타임라인 건 외에도 CMS 트렌드/칼럼 카드 기능 등에서 같은 종류의 혼선이 반복됐다).
  이 작업과 별개로 두 체크아웃을 하나로 합치는 정리가 필요해 보인다.

# Lambda 폐기 기록 — 2026-07-30

CloudWatch 실측으로 미사용이 확인된 Lambda 13개를 삭제했다. 이 디렉터리는 **되돌릴 수 있게** 하려고 남긴다.

## 왜 삭제했나

30일치 `AWS/Lambda` `Invocations` 를 측정했다. 단, **호출 수를 그대로 읽으면 안 된다** —
`sedaily-mbti-lambda-warming` 규칙이 `rate(5 minutes)` 로 5개 함수를 찌르고 있어
30일에 **정확히 8,640회**가 자동으로 쌓인다. 차감 후 판단했다.

삭제 대상은 아래를 모두 만족한다.

- 워밍 차감 후 30일 실호출 **0회**
- EventBridge 스케줄 없음 (또는 v1 파이프라인처럼 DISABLED 이고 v2 가 대체)
- 프론트엔드 / 어드민 코드에 호출 흔적 없음
- `list-event-source-mappings` 결과 없음

## 삭제 목록

### A. 배선 자체가 없던 것 (8)

| 함수 | 사유 |
|---|---|
| `sedaily-mbti-pipeline-step1-dev` | v1 Step Functions 파이프라인. 스케줄 `sedaily-mbti-pipeline-schedule-dev` DISABLED |
| `sedaily-mbti-pipeline-step2-dev` | 〃 |
| `sedaily-mbti-pipeline-step3-dev` | 〃 |
| `sedaily-mbti-pipeline-step4-dev` | 〃 |
| `sedaily-mbti-pipeline-supervisor-dev` | 〃. v2 collector/selector 가 대체 |
| `sedaily-mbti-ga4-stats-dev` | **API Gateway 라우트가 아예 없었다.** 코드는 `GET /api/stats/ga4` 를 문서화하지만 연결된 적 없음 |
| `sedaily-mbti-translation-dev` | 라우트·스케줄·참조 전무 |
| `sedaily-mbti-v2-newsletter-dev` | 라우트·스케줄 없음. 발송측이 결선되지 않음 |

### B. 라우트는 있었으나 트래픽 0 (5)

| 함수 | 함께 제거한 라우트 |
|---|---|
| `sedaily-mbti-abtest-dev` | `ANY /api/ab-test`, `ANY /api/ab-test/{proxy+}` |
| `sedaily-mbti-engagement-dev` | `/api/engagement/*` 10개 |
| `sedaily-mbti-metrics-dev` | `ANY /api/metrics`, `ANY /api/metrics/{proxy+}` |
| `sedaily-mbti-stats-dev` | `GET /api/stats/visitors`, `POST /api/stats/pageview` |
| `sedaily-mbti-tts-dev` | `POST /api/tts` |

### 삭제하지 않은 것 — 판단 근거

| 함수 | 왜 남겼나 |
|---|---|
| `sedaily-mbti-v2-transform-dev` | 호출 0이지만 **의도적 정지**다. `067fcbd` 에서 월 $270 절감 목적으로 트리거를 껐다. 죽은 코드가 아니다 |
| `sedaily-mbti-v2-consolidate-dev` | 크론이 DISABLED 라 0회. Core 3 재개 시 필요 |
| `sedaily-mbti-v2-health-dev` | 호출 0이지만 헬스 엔드포인트는 장애 대응 때 쓴다. 지우는 이득보다 손해가 크다 |
| `sedaily-mbti-voice-stt-url-dev` | 호출 0이나 `voice-tts`(36회)·`voice-stt-presign` 과 한 기능이라 짝을 깨면 위험 |
| `user` `chatbot` `archive` `podcast` `recommend` `v2-interaction` `v2-subscribe` | **프론트가 부르는데 호출이 0.** 안 쓰는 게 아니라 **끊어진** 것일 수 있어, 지우면 고장을 덮는다. 별도 조사 대상 |

## 복원 방법

`configs/<함수명>.json` 이 `aws lambda get-function` 의 전체 응답이다. 여기에
런타임·핸들러·메모리·타임아웃·IAM 역할·환경변수·레이어·VPC 설정이 들어 있다.

```bash
# 1) 함수 재생성 (코드 zip 은 아래 아카이브 참조)
aws lambda create-function --region us-east-1 \
  --function-name <함수명> \
  --runtime "$(jq -r .Configuration.Runtime configs/<함수명>.json)" \
  --handler "$(jq -r .Configuration.Handler configs/<함수명>.json)" \
  --role   "$(jq -r .Configuration.Role configs/<함수명>.json)" \
  --timeout "$(jq -r .Configuration.Timeout configs/<함수명>.json)" \
  --memory-size "$(jq -r .Configuration.MemorySize configs/<함수명>.json)" \
  --zip-file fileb://<아카이브>/code/<함수명>.zip

# 2) 환경변수 복원
jq '.Configuration.Environment' configs/<함수명>.json
aws lambda update-function-configuration --region us-east-1 \
  --function-name <함수명> --environment '<위 JSON>'

# 3) B그룹은 API Gateway 라우트/통합/권한도 함께 복원
#    apigw-routes-snapshot.json / apigw-integrations-snapshot.json 참조
aws lambda add-permission --region us-east-1 --function-name <함수명> \
  --statement-id apigateway-invoke --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn 'arn:aws:execute-api:us-east-1:887078546492:chzwwtjtgk/*/*/<경로>'
```

### ⚠️ 마스킹된 값

`configs/sedaily-mbti-pipeline-supervisor-dev.json` 의 `PG_PASSWORD` / `PG_USER` 는
`<<REDACTED>>` 로 치환했다. **이 함수는 운영 Postgres 비밀번호를 SSM 이 아니라 Lambda
환경변수에 평문으로 들고 있었다.** 백업을 그대로 커밋했으면 자격증명이 저장소에 박혔을
것이다. 복원이 필요하면 운영자가 직접 다시 넣어야 한다.

## 코드 아카이브

zip 합계 301MB 라 저장소에 두지 않았다. 로컬 보관:

```
~/ailens-lambda-archive-2026-07-30/code/
```

13개 중 11개는 `deploy.sh` 가 빌드하는 v1 공통 패키지와 같은 내용이라 git 에서 재생성
가능하다. 예외 2개는 **저장소에 소스가 없었다**:

- `sedaily-mbti-ga4-stats-dev` → `orphan-source/ga4_stats_handler.py`
- `sedaily-mbti-stats-dev` → `orphan-source/stats_handler.py`

둘 다 `deploy.sh` 함수 목록에 없고 `service/backend/handlers/` 에도 없던, Lambda zip
안에만 존재하던 코드다. 소실을 막으려고 핸들러 소스만 꺼내 두었다.

## 코드 주석에 남은 v1 참조

v2 코드 여러 곳이 주석·독스트링으로 삭제된 v1 파일을 가리킨다
(`v2/clients/selector_service.py` 의 "v1 step1_select.SCORING_BATCH_SIZE" 등).
**의도적으로 남겼다** — 튜닝된 상수가 어디서 왔는지 설명하는 유일한 기록이고,
파일 자체는 git 이력에 남아 있다. 원본을 보려면:

```bash
git show 04654b2:service/backend/handlers/pipeline/step1_select.py
```

---

# 자격증명 정리 — 2026-07-30

## 무엇이 문제였나

운영 Postgres 비밀번호가 **살아있는 Lambda 11개의 평문 환경변수**에 복제돼 있었다.
Lambda 설정은 콘솔·`get-function`·CloudTrail 어디서든 평문으로 보인다.

그런데 v2 코드는 **그 환경변수를 읽지 않는다.** `PgVectorV2Client.__init__` 은
`get_pg_password()` → SSM SecureString `/sedaily-mbti/v2/pg-password` 로만 간다
(Admin-2c 이후). `test_pgvector_v2_client.py:149` 가 그 사실을 못박아 두었다:

```python
monkeypatch.setenv("PG_V2_PASSWORD", "pw")  # 무시되어야 한다
...
assert c._password != "pw", "PG_V2_PASSWORD 가 다시 읽히고 있다"
```

즉 8개 함수의 환경변수는 **기능이 0인 채 비밀만 노출하고 있었다.**

## 조치

**1) 죽은 환경변수 제거 (8개)** — v2-interaction · v2-today-letters ·
v2-front-page · v2-posts · v2-feed · v2-article · v2-editor-pick.
각각 제거 전후로 실제 엔드포인트를 호출해 응답 코드가 같은지 확인했다.
가장 결정적인 증거는 v2-interaction 이었다 — 환경변수를 지운 뒤
`POST /api/v2/interactions` 가 `{"ok": true, "profile_created": true}` 를
반환했다. SSM 경로로 Postgres 에 **실제로 썼다**는 뜻이다.

**2) admin 을 SSM 으로 이관 (1개)** — `admin/shared/pg_client.py` 는 v2 와 달리
`os.environ["PG_V2_PASSWORD"]` 를 진짜로 읽고 있었다. `common.secrets.
get_pg_password()` 로 바꿨다(같은 비밀을 가리키므로 드롭인).

⚠️ 이 과정에서 걸린 함정: admin 역할의 SSM 권한이 `/sedaily-mbti/admin/*` 뿐이라
**코드만 배포했으면 admin API 가 깨졌다.** IAM 정책에 pg-password 를 추가하되,
기존 구문에 얹으면 `ssm:PutParameter` 까지 딸려가 admin 이 DB 비밀번호를
덮어쓸 수 있게 되므로 **읽기 전용 별도 구문**(`SSMReadPgPasswordOnly`)으로 분리했다.
`simulate-principal-policy` 로 Get=allowed / Put=implicitDeny 확인.
변경 전 정책 원본: `iam-AdminApiAccess-before.json`.

## 남은 것

| 함수 | 변수 | 왜 남았나 |
|---|---|---|
| `sedaily-mbti-archive-dev` | `PG_PASSWORD` | v1 pgvector (`clients/pgvector_client.py:60`). v1 용 SSM 파라미터가 아직 없다 |
| `sedaily-mbti-recommend-dev` | `PG_PASSWORD` | 〃 |

둘 다 30일 실호출 0회다. v1 pgvector 를 계속 쓸지 정한 뒤 SSM 파라미터를 만들어
같은 방식으로 옮기면 된다.

## 비밀번호 교체 — 완료 (2026-07-30)

### v1 자격증명: 교체 불필요로 판명

`archive` · `recommend` 가 들고 있던 `PG_PASSWORD` 는
`sedaily-mbti-pgvector-dev` 를 가리키는데, **그 RDS 인스턴스가 존재하지 않는다**
(DNS 해석 실패, `describe-db-instances` 에도 없음). 유출됐던 v1 비밀번호는 이미
아무 데도 열지 못하는 값이었다. 두 함수에서 환경변수만 제거했다 —
`PG_HOST` 는 남겼다. `clients/pgvector_client.py` 는 비밀번호가 비면 pgvector
작업을 조용히 건너뛰므로(graceful degradation) 동작이 바뀌지 않는다.
제거 후 `/api/archive` · `/api/recommend` 둘 다 200 확인.

### v2 자격증명: 교체 완료

`sedaily-mbti-pgvector-v2-dev` 마스터 비밀번호를 40자 난수로 교체했다.

1. `modify-db-instance --apply-immediately` → 즉시 적용 확인 (새 값으로 접속 성공)
2. SSM `/sedaily-mbti/v2/pg-password` 갱신 (버전 2)
3. **컨테이너 강제 재활용** — `common/secrets` 는 5분 TTL 캐시라 웜 컨테이너가
   옛 값을 들고 있을 수 있다. v2 Lambda 11개 + admin 의 description 을 갱신해
   콜드스타트를 유도했다.
4. 콜드스타트 상태에서 전 경로 재검증 — today-letters · front-page · posts ·
   feed · health · api/posts · api/questions 모두 200,
   `POST /api/v2/interactions` 200 (실제 DB 쓰기), admin/login 401(정상).
5. 옛 값으로 접속 시도 → `DatabaseError` 로 거부 확인.

기존 커넥션은 비밀번호 변경으로 끊기지 않으므로 무중단이었다.

### 작업용 임시 접근 — 원복 완료

RDS 보안그룹(`sg-0681e807d6d3b8607`)이 VPC 대역 + 사무실 IP 만 허용해 작업 IP 를
임시 추가했다(규칙 `sgr-0f0fff9afa49750ce`). 정리·검증 후 **제거했고**, 현재
허용 CIDR 은 원래대로 `172.31.0.0/16` 과 `121.128.240.250/32` 둘뿐이다.

⚠️ 별건으로, `sedaily-mbti-pgvector-v2-dev` 는 `PubliclyAccessible: true` 다.
보안그룹이 막고 있어 실질 노출은 아니지만, VPC 전용으로 바꾸면 로컬에서 도는
`v2/scripts/apply_*.py` 계열이 못 붙는다. 별도 판단 사항.

## 검증 후 잔여 데이터

스모크 테스트로 `user_id='smoke-test-decommission'` 행이 v2 Postgres 에 생겼다.
정리 SQL:

```sql
DELETE FROM user_interactions WHERE user_id = 'smoke-test-decommission';
DELETE FROM user_profiles     WHERE user_id = 'smoke-test-decommission';
```


---

# 프론트 배선 조사 — 2026-07-30

"프론트가 부르는데 실호출 0" 인 7개를 조사한 결과, **거의 하나의 원인**이었다.

## 기사 읽기 경로: 의도된 은퇴

`067fcbd` (2026-05-15, 레터 전환) 가 `NewsFeedTab` 에서 기사 목록을 통째로
들어냈다. 직전 커밋 `050ccd1` 까지는 자식 컴포넌트에
`articles={filteredArticles}` / `onArticleClick={onArticleClick}` 을 넘겼는데,
그 두 줄과 날짜 네비게이터·오디오 브리핑·스켈레톤이 함께 삭제됐다. 커밋 메시지가
제거 항목을 명시하고 있어 **사고가 아니라 제품 전환**이다.

`onArticleClick` 이 `ArticleView` 로 가는 유일한 입구였으므로, 그 아래가 전부
도달 불가가 됐다:

| 엔드포인트 | 왜 0인가 |
|---|---|
| `/api/v2/article` | `ArticleView` 진입 불가 |
| `/api/user/read` | 〃 (ArticleView 안에서 호출) |
| `/api/v2/interactions` | 〃 |

## 렌더되지 않는 컴포넌트

`MbtiChatBot` · `DnaTab` · `SubscribeForm` 은 **어디에서도 렌더되지 않는다**
(`<컴포넌트명` 검색 0건). 각각 `/api/chat` · `/api/recommend` ·
`/api/v2/subscribe` 가 0인 이유다. `SubscribeForm` 은 레터 전환 **이후**인
`46b7a82` 에서 추가됐는데도 결선되지 않았다 — 미완성 기능으로 보인다
(발송측 `sedaily-mbti-v2-newsletter-dev` 도 결선 전이라 이번에 폐기했다).

## 실제로 "안 쓰는" 것

`archive` 와 `podcast` 둘뿐이다. 도달 가능한데 사용자가 안 쓴다.

## 백엔드는 멀쩡하다

검증 중 `POST /api/v2/interactions` 를 직접 쳤더니
`{"ok": true, "profile_created": true}` 로 Postgres 에 정상 기록했다.
끊긴 것은 프론트 배선이지 백엔드가 아니다. **그래서 이 7개를 삭제하지 않았다.**

## 남은 낭비

`FeedPage` 는 지금도 매 페이지 로드마다 `/api/v2/feed` 를 부르고 응답을 버린다
(`NewsFeedTab` 이 `articles` prop 을 안 쓴다). 30일 282회. 기사 피드를 되살릴지
정한 뒤 처리할 일이라 코드는 건드리지 않았다.

워밍 규칙에서는 실호출 0인 `sedaily-mbti-article-dev` 와
`sedaily-mbti-v2-article-dev` 를 제외했다 — 둘이서 30일 17,280회를 쓰고 있었다.
남은 워밍 대상은 `post` · `search` · `v2-feed` 셋이다.

---

# 2차 폐기 — 도달 불가 코드 (2026-07-30)

프론트 배선 조사에서 "도달 불가" 로 판정된 것들을 제거했다. 판정 기준은
**측정 트래픽 0 + 유일한 호출 컴포넌트가 렌더되지 않음** 두 가지를 모두 만족.

## 삭제

| 대상 | 근거 |
|---|---|
| `sedaily-mbti-recommend-dev` + 라우트 4개 | 유일한 호출자 `recommendApi.ts` ← `DnaTab`. FeedPage 가 `DnaTab` 을 import 하지만 **렌더하지 않는다** — dna 탭은 `ComingSoonNotice` 를 렌더한다 (FeedPage:1141) |
| `sedaily-mbti-podcast-dev` + 라우트 8개 | 진입점 `startAudioBriefing` 이 `067fcbd` 에서 `NewsFeedTab` 에서 제거됐다. `showAudioPlayer` 를 true 로 만드는 곳은 `startAudioBriefing` 자신뿐이라 **닫힌 고리** |

프론트: `features/news-dna/` · `shared/lib/recommendApi.ts` ·
`features/news-feed/components/SubscribeForm.tsx` 삭제, FeedPage 의 죽은
`DnaTab` import 제거.

백엔드: `handlers/{podcast,recommendation}_handler.py` ·
`services/collaborative_filter_service.py` · `clients/podcast_db_client.py` ·
`clients/personalize_client.py` · `repositories/podcast_repository.py` ·
`models/podcast.py` · `prompts/podcast/` 삭제. 배럴 3개
(`clients`/`repositories`/`models`) 의 export 정리. `deploy.sh` API_FUNCTIONS
19 → 17.

테스트: `tests/test_new_apis.py` 에서 podcast/recommend 테스트 4개 제거
(archive 2개 유지, 592→368줄), `tests/test_full_integration.py` 의
Phase 5 recommend 블록 제거.

## 삭제하지 않은 것 — 조사 중 판정이 뒤집힌 것들

**`sedaily-mbti-v2-subscribe-dev` — 지우려다 멈췄다.**
구독 폼(`SubscribeForm`)은 렌더되지 않아 `POST /api/v2/subscribe` 는 도달
불가다. 그런데 같은 Lambda 가 `GET /api/v2/unsubscribe` 도 소유하고,
`v2/handlers/subscribe.py:6` 이 명시한다: *"1클릭, 법적 필수"*.
구독자 테이블에 **활성 구독자 3명**이 있고 한 명은 2026-07-15(2주 전) 가입,
각자 `unsubscribe_token` 을 갖고 있다. 지우면 이미 발송된 메일 속 수신거부
링크가 죽어 법적 옵트아웃 수단이 사라진다. 유지가 맞다.

**`sedaily-mbti-chatbot-dev` — 도달 가능하다.**
`MbtiChatBot` 은 렌더되지 않지만 `/api/chat` 은 두 경로가 더 있다 —
`BriefingPage`(app/page.tsx 에서 렌더) 와 `SajuChat` ← `SajuStoryReveal` ←
`FortuneResult` 로 **라이브인 사주 기능**이다. 처음 "MbtiChatBot 이 렌더 안 되니
/api/chat 도 죽었다" 고 판단했는데 불완전했다.

⚠️ 그 과정에서 **버그를 발견했다**: `SajuChat.tsx:81` 이
`POST /api/chat/stream` 을 부르는데 **API Gateway 에 그 라우트가 없다**
(`OPTIONS /api/chat` 과 `POST /api/chat` 뿐). 사주 챗 스트리밍은 404 를 받고
있을 것이다. chatbot Lambda 의 30일 호출 0회와 일치한다. 별건으로 고칠 일.

**`sedaily-mbti-user-dev`** — `recordArticleRead` ← `ArticleView`(도달 불가)
말고도 `AuthContext.tsx:64` 가 `/api/user/profile` 을 부른다. 로그인 흐름이라
살아 있다.

**MBTI 기사 파이프라인 (`v2-transform` · `v2-feed` · `v2-article`)** — 셋은
하나의 단위이고 비용 절감으로 **의도적으로 멈춘** 상태다. `v2-transform` 을
남긴 것과 같은 이유로 읽기 API 둘도 남겼다.

**`v2-interaction` · `v2-consolidate`** — Core 3 쓰기 측. 비활성화가 잠정이며
재개 예정이라고 확인받았다.

**DynamoDB `sedaily-mbti-podcast-dev` 테이블** — Lambda 는 지웠지만 테이블은
남겼다. 생성된 팟캐스트 데이터가 들어 있고 테이블 삭제는 되돌릴 수 없다.

## 도달성 판정 방법에 대한 경고

처음에 `app/**/page.tsx` 를 루트로 JSX 렌더 그래프를 계산해 봤는데
**틀렸다** — `front-page` 와 `v2-posts` 를 미도달로 판정했지만 둘 다 실제
트래픽이 있고 직접 호출해 200 을 받았다. 배럴 import 한 홉을 놓친 것이다.
그래프를 버리고 **측정 트래픽 + 컴포넌트별 직접 확인**으로 판정했다.
이 종류의 자동 판정은 false negative 가 나면 살아있는 것을 지운다.

## 검증

- 프론트: `tsc --noEmit` 0 에러, `npm run build` 성공(26 라우트),
  lint 에러 수 변경 전후 동일
- 백엔드: 823 passed, 배럴 import 전부 OK, 배포 스크립트 참조 함수 전부 실재
- 라이브: today-letters·front-page·posts·api/posts·questions·feed·health·
  archive·time-machine 전부 200
- 삭제 라우트: `/api/recommend` · `/api/podcast/*` 전부 404
- 수신거부 유지 확인: `/api/v2/unsubscribe?token=bogus` →
  `{"error":"invalid token"}` (핸들러 정상 응답), 구독자 3명 전원 `active`

Lambda 34 → 32개.

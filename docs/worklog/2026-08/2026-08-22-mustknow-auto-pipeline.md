# 2026-08-22 뉴스 선별 엔진(mustknow_auto) — Step1 필수뉴스 분류기 + 지면특별코너 4탭 재설계

작성: 영광 + Claude Code
관련: `pipelines/mustknow_auto/`, `pipelines/common/bedrock_client.py`,
`service/backend/prompts/mustknow/`, `docs/product/news-selection-pipeline-
20260822.pdf`(설계 리포트)

## 배경

로드맵 목표(일 400건 기사 중 35~40건을 저비용으로 골라 4포맷 자동 발행)
대비, 실가동 자동화는 `frontpage_auto`(지면1면 전용, 1일 1회, 5건/일)
뿐이었다. "지금 어디까지 구현이 된건지" 질문에서 시작해 이 격차를
확인하고, 그걸 메우는 Step1 분류기(일반 필수뉴스 판별)와 기존 "지면
특별코너" 4탭(전체/증권/산업/시그널) 위젯의 개수 제한 없는 문제를 같이
재설계했다. 설계 과정은 대화로 길게 진행(볼륨·모델·스케줄·비용·중복방지
방식 등 매 단계 사용자 확인) — 전체 스펙은 `docs/product/news-selection-
pipeline-20260822.pdf`에 정리돼 있음. 이 문서는 그 설계를 실제로 구현하며
겪은 것들의 기록이다.

## 설계 요약 (PDF 리포트에서 확정된 것)

- 입력 범위: 제목+부제+리드 200자만(본문 전체 안 읽음) — 한국 기사는
  역피라미드 구조라 리드에 핵심이 담기고, 어차피 선정된 기사는 Step2가
  본문 전체를 다시 읽어 정보 손실 없음
- 모델: Bedrock Claude Sonnet 5 — Sonnet 4.6보다 저렴($2/$10 vs $3/$15,
  MTok당)하면서 최신
- 스케줄: 08/12/15/18/21/23시 KST 하루 6회, 델타 처리(직전 실행 이후
  신규 기사만) — daily-xml이 하루 종일 갱신된다는 걸(8/21 파일 마지막
  수정 23:55 KST) 실측으로 확인하고 정한 스케줄
- 선별 방식: 하루치를 모아 상대 순위(top-N)를 매기지 않는다. 절대
  기준선(일반 ≥7.0, 지면특별코너 4탭 ≥8.0) 통과 시 그 회차 안에서
  즉시 Step2로 넘긴다 — 지연 방지
- 지면특별코너 4탭: 전체(지면1면)는 `paperNumber=="1"` TOP 배치 우선(점수
  불필요, 실제 편집 데이터), 증권/산업/시그널은 카테고리 매칭 후보군에서
  Sonnet 5 점수 순으로 탭당 최대 4건, 재순위 없음(먼저 채워지면 그날은
  마감 — 라이브 콘텐츠를 나중에 더 좋은 기사로 대체하지 않는다는 v1 결정)
- frontpage_auto는 건드리지 않음 — 지면1면 이관 여부는 미결정으로 남기고,
  대신 `_already_published_elsewhere()`로 발행 직전 교차 확인해 중복만 방지
- 태그: 이번에 새로 만드는 모든 AWS 리소스에 `WorkItem=atlas-4444`
  (사용자 지정 코드) 포함 — 빌링에서 이 프로젝트 비용을 한 번에 집계
  하기 위함

## 프리즘 프로젝트 리서치 (설계에 참고, 그대로 베끼지 않음)

서울경제 프리즘(8유형 독자 큐레이션) 프로젝트의 실제 프로덕션 코드를
조사해서 참고했다. **재사용한 것**: 저비용 규칙 필터를 먼저 태우고 소수의
LLM 콜로 마무리하는 구조, 다차원 가중 스코어링 방식(1~10점씩), 환각
방지 가드. **버린 것**: 페르소나별 개별 프롬프트 내용(투자자 특화 기준 —
우리는 일반 독자 단일 기준), 본문 전체를 매번 읽는 방식(프리즘은 8
페르소나×본문 전체라 우리 목적엔 과함).

이 저장소 안에 이미 있던 `service/backend/prompts/selection/
article_scorer.md`(폐기된 Core1.5 Selector의 MBTI 페르소나별 스코어링
프롬프트)의 "감별 기준"(홍보성/인사/부고/중복 자동 감점) 부분도 그대로
차용해서 `mustknow/published.md`에 반영.

## 구현

### 새 파일

`pipelines/mustknow_auto/run.py`(진입점), `classify.py`(Sonnet 5 배치
채점), infra 파일 일습(`task-policy.json`, `taskdef.json`,
`trust-policy-*.json`, `eventbridge-*.json`, `provision.sh`).
`frontpage_auto/run.py`의 함수들(`_publish`≈`process_article`,
`_generate_video`, `_upload`, `_parse_letters`, `_slugify`,
`_CATEGORY_MAP`)을 그대로 복사해왔다 — import 아님(frontpage_auto는
스크립트라 import 시 부작용 있고, 프로덕션 코드를 이번 작업으로 건드리는
리스크도 피하기 위함). 공용화는 frontpage_auto 이관 여부 결정 이후 별도
작업으로 미룸.

`discovery.pipeline.py`는 수정 없음 — `fetch_articles()`/`fetch_front_page()`가
필요한 필드를 이미 다 줌.

### AWS 리소스 (전부 WorkItem=atlas-4444 태그)

- Bedrock application inference profile `mbti-mustknow-sonnet-5`
  (`arn:...application-inference-profile/bevq2226yzcq`)
- DynamoDB `sedaily-mbti-mustknow-seen-dev`(PK `article_key`, 중복 방지용
  — GetItem 조회라 Scan 기반인 frontpage_auto의 `_already_published()`보다
  테이블이 커져도 안 느려짐)
- IAM 역할 2개(`sedaily-mbti-mustknow-auto-task-role`,
  `...-eventbridge-role`), CloudWatch 로그그룹, 태스크 정의
  `sedaily-mbti-mustknow-auto`(**frontpage_auto와 같은 ECR 이미지·ECS
  클러스터 재사용** — Dockerfile이 `pipelines/` 전체를 COPY하므로
  `mustknow_auto/`도 이미 이미지 안에 있고, taskdef의 `workingDirectory`
  오버라이드로 같은 이미지·다른 진입점으로 실행), EventBridge 규칙
  `sedaily-mbti-mustknow-auto-6x-daily`(cron 콤마로 6개 시각 한 번에,
  **DISABLED 상태로 생성** — 수동 run-task로 충분히 검증한 뒤 활성화 예정)
- `service/backend/prompts/mustknow/published.md` 작성 + DDB
  (`sedaily-mbti-admin-prompts-dev`)에 `PROMPT#mustknow/published`
  LATEST/v#1로 시딩 — 기존 4포맷 프롬프트와 같은 스키마, admin에서
  나중에 편집 UI 붙이면 그대로 씀

### 실제 검증 중 발견한 버그 4건

로컬에서 오늘(8/22) 실제 daily-xml로 3차례 실행하며 전부 실제 데이터로
검증. 처음 두 번은 각각 다른 버그로 죽었고, 세 번째에 전부 고쳐서 정상
동작 확인:

1. **`temperature` deprecated (Sonnet 5)** — `bedrock_client.py`가
   `temperature=0.7`을 항상 보냈는데 Sonnet 5는 이 파라미터 자체를 거부.
   기본값을 `None`으로 바꾸고 명시적으로 넘겼을 때만 포함하도록 수정.
2. **content 블록 순서 가정 오류** — 긴 프롬프트(분류 배치)에서 Sonnet 5가
   추론 블록을 text 블록보다 먼저 반환해(`content[0]`이 boto3가
   `SDK_UNKNOWN_MEMBER`로 표시하는 추론 블록) `content[0]["text"]`가
   KeyError. 인덱스 0을 가정하지 않고 `text` 키를 가진 첫 블록을 찾도록
   수정.
3. **배치 타임아웃 + 응답 잘림** — 60건 배치가 boto3 기본 read timeout
   (60초)을 넘겨 전부 실패 → `Config(read_timeout=300)`으로 늘림. 그래도
   30건 배치가 `max_tokens=9000` 안에서 마지막 항목 reasoning 도중
   잘려서 JSON을 못 닫는 걸 확인(Sonnet 5는 항목별 reasoning이 길고,
   새 토크나이저가 같은 텍스트에도 더 많은 토큰을 씀) → 배치를 20건으로
   더 줄이고 `max_tokens=16000`으로 늘림. 추가로 응답이 그래도 잘리는
   경우를 위한 살리기(salvage) 파서를 넣어서, 마지막으로 완전히 닫힌
   `}` 뒤를 잘라내고 배열을 닫아 재시도하도록 함(완성된 항목까지는
   건지고 나머지는 다음 회차로 이월).
4. **DynamoDB float 미지원** — `_mark_seen()`에 점수(예: 7.2, Python
   float)를 그대로 넣었다가 `TypeError: Float types are not supported.
   Use Decimal types instead.`로 파이프라인 전체가 죽음(그 시점까지의
   선별 결과가 하나도 안 남고 예외 전파). `Decimal(str(v))`로 변환하는
   방어 코드 추가.

세 번째 실행에서 122건 전부 채점 성공(122/122), 첫 통과 기사 4/4 포맷
(레터·팟캐스트·웹툰·영상) 전부 성공 발행 확인. 나머지 기사 처리는
계속 진행 중.

## 결정

- `bedrock_client.py`의 세 가지 함정(temperature 지원 모델별 상이,
  content 블록 순서 가정 금지, 추론 오버헤드로 인한 지연/잘림)은 앞으로
  다른 Bedrock 모델을 붙일 때 재발할 수 있어 파일 docstring에 전부
  남겨둠(§ `2026-08-22-video-bedrock-migration.md`도 참고).
- 지면특별코너 4탭의 "재순위 없음"(이슈 A) 결정 — 한번 채워진 탭은
  그날 더 안 받는다. 라이브 콘텐츠를 나중에 더 좋은 기사로 교체하지
  않는 쪽을 우선.
- frontpage_auto와의 관계(이슈 B, 지면1면을 이 파이프라인이 흡수해
  대체할지)는 여전히 미결정 — 교차 중복 방지만 해두고 결정은 보류.

## 로컬 검증 결과 (세 번째 실행, 21:18~22:5x KST 진행, 노트북 종료로 중단)

세 가지 버그(위 1~4) 전부 수정한 뒤 실행한 세 번째 로컬 실행은 총
122건 채점 성공(122/122) 후 발행 단계로 진입, 사용자가 노트북을 끄기로
하면서 6번째 기사(20081958) 처리 도중 중단됐다. 중단 시점까지 확인된
결과:

- 지면1면 5건: 전부 오늘 아침 frontpage_auto가 이미 발행한 것과 정확히
  일치해 `_already_published_elsewhere()` 교차 확인으로 스킵됨 —
  frontpage_auto와의 중복 방지가 실전 데이터로 검증됨(§이슈 B 관련
  안전장치는 작동 확인, 이관 여부 결정 자체는 여전히 미정).
- 일반(≥7.0) 카테고리: **5건 완전 발행**(레터·팟캐스트·웹툰·영상
  4/4 전부 성공, `paper_section=None`) — 트럼프 스톡커 바이백 기사,
  부동산정책 여론조사, 삼성전자 주주환원, 종합특검 김건희, 삼성·SK하이닉스
  주주환원 비교. video 재요청 로직(§비디오 이관 worklog)도 6번째 기사
  처리 중 실제로 한 번 발동해 정상 해결되는 것 확인.
- 증권/산업/시그널 지면특별코너 탭(≥8.0): 중단 시점까지 로그에 발행
  기록 없음 — 오늘 후보 중 8.0 기준선을 넘은 게 없었을 가능성이 높음
  (일반 임계값 7.0보다 1점 높게 잡은 의도대로 "아무도 없으면 그냥
  빈 채로 둔다"가 실제로 관찰됨 — 억지로 채우지 않는 설계가 맞게 동작).
  다만 표본이 하루뿐이라 이 기준선이 실제로 적절한지는 며칠 더 지켜봐야
  판단 가능.
- 세션 도중 발견한 부수 버그: `bedrock_client.py`의 temperature/content-
  블록 수정이 video 파이프라인(Sonnet 4.6)에도 영향 없는지 재검증 완료
  (회귀 없음).

노트북에서 돈 로컬 프로세스라 완전 종료 시 그대로 멈춘다 — seen
테이블 설계상 안전하게 멈춘다(지금까지 처리분은 seen에 남고, 미처리분은
다음 실행 때 이어서 처리됨), 데이터 훼손·중복 발행 위험 없음.

## 다음

- 중단된 로컬 검증 이어서 완료(남은 기사들 최종 처리 결과 확인)
- 실제 Fargate `run-task`로 1회 더 검증(로컬과 동일하게 동작하는지,
  특히 frontpage_auto와의 교차 중복 방지가 실제 배포 환경에서도
  작동하는지)
- 증권/산업/시그널 8.0 기준선이 계속 "0건"으로 나오면 기준을 낮출지
  며칠 더 관찰할지 판단 필요
- 검증 통과하면 EventBridge 규칙 `ENABLE`
- frontpage_auto 이관 여부(이슈 B) 결정
- 4탭 재순위 문제(이슈 A)는 v1 결정대로 갈지, 나중에 재검토할지는
  실제 운영 데이터를 보고 판단

# pipelines/ — 4포맷 생성 파이프라인 + 자동 발행

AI LENS "4가지 시선"(레터/웹툰/팟캐스트/영상) 각 포맷을 실제로 생성하는
스크립트 모음 + 그걸 무인으로 매일 돌리는 자동 발행 파이프라인
(`frontpage_auto/`, `mustknow_auto/`). 포맷 생성 쪽은 전부 admin 프롬프트
드로어(`/lens` → 프롬프트)가 DDB에 저장한 프롬프트를 그대로 읽어서 쓴다 —
프롬프트를 admin에서 고치면 다음 실행부터 바로 반영된다
(`pipelines/common/ddb_prompt.py`).

**2026-08-23 — 텍스트 생성을 GPT에서 Bedrock Claude로 전면 이관했다**
(letters/podcast/webtoon 스크립트/video 각본 전부). GPT는 웹툰 3단계
이미지 생성에서만 남아있었는데, 그마저도 OpenAI 크레딧 소진 사고 이후
Bedrock 이미지 모델(배경) + PIL(텍스트 합성) 조합으로 기본값이 바뀌었다
— GPT 경로는 `webtoon/pipeline.py`의 `IMAGE_PROVIDER` 플래그로 전환
가능한 채 코드에 남아있다(자세한 경위는
`docs/worklog/2026-08/2026-08-23-webtoon-channel-split-and-bedrock-image.md`).

| 폴더 | 언어 | 산출물 | 비고 |
|---|---|---|---|
| `letters/` | Python | 텍스트 | Bedrock Claude 1회 호출 |
| `podcast/` | Python | 텍스트 + mp3 | Bedrock Claude(대본) + AWS Polly(음성, Seoyeon generative) |
| `webtoon/` | Python | 이미지 8장 | Bedrock Claude(1·2단계 스크립트/장면연출) + Bedrock Stability Stable Image Core(3단계 배경) + PIL(말풍선·캡션 텍스트 합성). `IMAGE_PROVIDER="openai"`로 바꾸면 GPT-5.5 경로로 원복 가능 |
| `video/` | Node(렌더)+Python(각본) | mp4 | `generate_script.py`(1단계, Bedrock Claude 각본 JSON) → `npm run render`(2·3단계, AWS Polly TTS + Remotion 렌더) |
| `discovery/` | Python | 분류 JSON | 포맷 생성 이전 단계 — 그날 기사 XML을 후보로 분류만(아래 참고) |
| `frontpage_auto/` | Python(엔트리) | DDB write + S3 미디어 | **실가동 중** — 지면 1면 기사를 매일 07:00 KST 1회 자동으로 4포맷 발행(EventBridge). letters/podcast/webtoon/video의 `run_article()`을 그대로 호출 |
| `mustknow_auto/` | Python(엔트리) | DDB write + S3 미디어 | **실가동 중** — 지면특별코너 4탭(전체/증권/산업/시그널) + 일반 필수뉴스를 하루 6회(08/12/15/18/21/23시 KST) 자동 채점·발행. `classify.py`가 Bedrock Sonnet 5로 배치 채점(20건씩), 임계값(일반 7.0/특별탭 8.0) 넘는 기사만 발행 |
| `common/` | Python | — | `ddb_prompt.py`(프롬프트 로드), `bedrock_client.py`(Bedrock Claude 호출, 2026-08-22 신설), `openai_client.py`(웹툰 이미지 생성 전용으로 축소), `text_utils.py`(코드블록 벗기기) |

## discovery/ — 지면 특별 코너 후보 분류

나머지 4개와 달리 admin 프롬프트를 안 읽는다 — "어떤 기사로 콘텐츠를
만들지" 고르는 단계라, letters/podcast/webtoon/video보다 앞선
단계다. `s3://sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml`(서울
경제 일일 기사 XML, `service/backend/clients/s3_xml_client.py`가 쓰는
것과 같은 버킷)을 읽어 4개 지면(전체/증권/산업/시그널) 후보로 분류만
하고 로컬 JSON으로 저장한다 — S3 업로드도 DDB write도 안 함(생성까지만
하는 다른 파이프라인들과 같은 원칙). "전체"(지면 1면)는 실제 인쇄판
지면 배치 데이터(`<paper><editingInfo><paperNumber>`)로 판별 — 규칙
기반 추정이 아니라 편집팀이 실제로 그렇게 배치한 기사 그대로다.

신문은 전날 저녁 마감이라, 예를 들어 오늘(8/21) 아침 지면 1면 기사는
대부분 어제(8/20) daily-xml 파일에 이미 웹 게재돼 있다(`<paper>
<publishInfo><date>`가 "이 기사가 실릴 지면의 발행일"을 따로 갖고
있어서, 게재일과 지면일이 다르다). `python3 discovery/pipeline.py
20260821`을 실행하면 "전체"는 자동으로 8/20+8/21 두 파일을 같이
훑어서 지면일이 정확히 8/21인 기사만 골라준다 — 증권/산업/시그널은
지면과 무관해서(순수 웹 카테고리) 그대로 8/21 파일 하나만 본다.

```
python3 discovery/pipeline.py 20260821
```

## 왜 언어가 섞여 있나

`video/`만 렌더링에 Node/Remotion(React 기반 비디오 프레임워크)을 쓴다 —
어쩔 수 없는 부분. 억지로 Python으로 통일하지 않았다 — 도구에 맞는
언어를 쓰는 게 "폴더 이름 일관성"보다 우선. 다만 1단계(기사 → 각본
JSON, GPT 호출)는 Python으로 남겨뒀다 — `common/`을 그대로 재사용할 수
있고, letters/podcast/webtoon과 같은 패턴을 유지할 수 있어서다. 같은
`video/` 폴더 안에 언어가 섞여 있는 게 어색해 보일 수 있지만, 1단계와
2·3단계는 실행 시점도 책임도 완전히 분리돼 있어(각본 확정 → 그 JSON을
렌더에 넘김) 실질적인 결합은 없다.

## video 1단계 — `generate_script.py`

```
python3 generate_script.py <name> <article_path> --output-root output
npm run render -- --input output/<name>/script.json --format horizontal --output out/<name>.mp4
```

2026-08-21까지 GV90·트럼프北핵·전력망·SK하이닉스·코스닥급락 5건 전부
GPT가 만든 각본 JSON이 스키마를 위반해(빈 `data` 필드, 화이트리스트
밖 아이콘) 사람이 매번 즉석 스크립트로 후처리해야 했다. `fix_script()`가
장식성 결함(아이콘 화이트리스트 치환, `highlight`/`closing`의 빈
`data`, 나레이션 없는 `closing` 컷 제거)만 자동으로 고친다 —
`stat`/`diagram`/`chart` 컷에 실제 수치·정보가 빠진 경우는 임의로
채우지 않고 `validate_script()`가 명확한 에러로 멈춘다(뉴스 콘텐츠라
없는 통계를 지어내지 않는다는 원칙).

## 배포 — `frontpage_auto/deploy.sh` (공유 Docker 이미지)

```bash
cd pipelines
./frontpage_auto/deploy.sh
```

`frontpage_auto/`·`mustknow_auto/` 둘 다 **같은 Docker 이미지**를 쓴다
(`Dockerfile`이 `pipelines/` 전체를 `COPY . .`로 담아서 letters/podcast/
webtoon/video/discovery/common 코드가 이미 다 이미지 안에 있음 —
`mustknow_auto`의 ECS 태스크 정의는 `workingDirectory`만 다르게 잡아
같은 이미지의 다른 진입점을 실행). 그래서 **어느 하나의 코드만 고쳐도
이 스크립트 하나로 둘 다 갱신된다**.

1. `docker build --platform linux/arm64`(Fargate 태스크 정의와 아키텍처 일치)
2. ECR(`sedaily-lens-frontpage-auto`) push
3. `aws ecs register-task-definition`으로 `frontpage_auto` 새 리비전 등록

`mustknow_auto`의 태스크 정의는 이미지를 `:latest` 태그로 참조하므로,
위 3번(리비전 등록)은 `frontpage_auto`만 해도 된다 — `mustknow_auto`는
다음 실행부터 자동으로 새 이미지를 pull한다. 지금 바로 검증하려면
(다음 EventBridge 스케줄까지 안 기다리고):

```bash
# frontpage_auto
aws ecs run-task --cluster sedaily-lens-frontpage-auto \
  --task-definition sedaily-lens-frontpage-auto --launch-type FARGATE \
  --network-configuration '{"awsvpcConfiguration":{"subnets":["subnet-0b5a146ca8ed1ddfe"],"securityGroups":["sg-05cb5f7bc29891cf8"],"assignPublicIp":"ENABLED"}}' \
  --region us-east-1

# mustknow_auto — 같은 클러스터, 태스크 정의만 다름
aws ecs run-task --cluster sedaily-lens-frontpage-auto \
  --task-definition sedaily-lens-mustknow-auto --launch-type FARGATE \
  --network-configuration '{"awsvpcConfiguration":{"subnets":["subnet-0b5a146ca8ed1ddfe"],"securityGroups":["sg-05cb5f7bc29891cf8"],"assignPublicIp":"ENABLED"}}' \
  --region us-east-1
```

로그는 CloudWatch `/ecs/sedaily-lens-frontpage-auto`,
`/ecs/sedaily-lens-mustknow-auto`.

## 배경

`docs/evaluation/4format-samples/2026-08-11-빵지순례/라운드기록.md`(각 프롬프트
버전·문제/솔루션 이력), `docs/worklog/2026-08/2026-08-20-homepage-refresh-seo-category-pipeline-reorg.md`
(이 폴더 구조가 왜 이렇게 됐는지), `docs/worklog/2026-08/2026-08-23-*`
(GPT→Bedrock 이관, mbti→lens 리네이밍, 자동 발행 실가동 경위) 참고.

# pipelines/ — 4포맷 생성 파이프라인

AI LENS "4가지 시선"(레터/웹툰/팟캐스트/영상) 각 포맷을 실제로 생성하는
독립 실행 스크립트 모음. 전부 admin 프롬프트 드로어(`/lens` → 프롬프트)가
DDB에 저장한 프롬프트를 그대로 읽어서 쓴다 — 프롬프트를 admin에서 고치면
다음 실행부터 바로 반영된다(`pipelines/common/ddb_prompt.py`).

| 폴더 | 언어 | 산출물 | 비고 |
|---|---|---|---|
| `letters/` | Python | 텍스트 | GPT-4o 1회 호출 |
| `podcast/` | Python | 텍스트 + mp3 | GPT-4o + AWS Polly |
| `webtoon/` | Python | 이미지 8장 | GPT-4o(대사) + gpt-5.5 image_generation |
| `video/` | Node(렌더)+Python(각본) | mp4 | `generate_script.py`(1단계, 각본 JSON) → `npm run render`(2·3단계, TTS+렌더) |
| `discovery/` | Python | 분류 JSON | 4포맷 생성 이전 단계 — GPT 호출 없이 그날 기사 XML을 지면 특별 코너 후보로 분류만(아래 참고) |
| `common/` | Python | — | `ddb_prompt.py`(프롬프트 로드), `openai_client.py`(GPT 호출), `text_utils.py`(코드블록 벗기기). letters/podcast/webtoon/video가 공용으로 씀. discovery/는 GPT를 안 써서 미사용 |

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

## 배경

`docs/product/4format-samples/2026-08-11-빵지순례/라운드기록.md`(각 프롬프트
버전·문제/솔루션 이력), `docs/worklog/2026-08/2026-08-20-homepage-refresh-seo-category-pipeline-reorg.md`
(이 폴더 구조가 왜 이렇게 됐는지) 참고.

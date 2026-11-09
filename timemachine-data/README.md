# timemachine-data — 타임머신용 지면 1면 이미지·데이터

렌즈 타임머신에서 사용자가 연월일을 고르면 그날의 **지면 1면 이미지**와 **1면 기사 데이터**를 보여 주기 위한
데이터를 모으고 가공하는 폴더. 콘텐츠 생성·발행(`pipelines/`)과 서비스 런타임(`service/`)과는 별개이며, 서비스 배포 패키지에 들어가지 않는다.


## 자료 현황과 수집 일정(2026-11-09)

- 이미지 수집 규칙은 KST 매일 13:10·14:10·15:10이다. 당일 이미지와 e-Paper 기사 기록이 모두 있으면 나머지 회차는 외부 요청 전에 건너뛴다. 발행 시각은 전수 확인되지 않았고, 미수집은 기존 감시·알림으로 확인한다.
- 기존 누락 감시 함수는 매시간 25분에 실행된다. 매일 13:25에는 1960년부터 올해까지 S3 이미지·기사 인덱스를 다시 대조해 현황과 연도별 집계를 갱신하며, 바뀐 파일만 쓴다. 14:25·15:25에는 올해 현황을 재확인한다. 지정 연도(최대 5개)는 `{"availability_years":[1996,2026]}` 이벤트로 재처리할 수 있다.
- 공개 현황: `timemachine-newspaper/availability/v1/YYYY.json`, 연도별 집계: `timemachine-newspaper/availability/v1/summary.json`. 조회 가능 범위·확인 시각과 이미지·기사 상태를 따로 기록한다. 오늘 이미지가 아직 없으면 `unknown`, 전수 목록에서 확인한 과거 날짜에 이미지가 없으면 `unavailable`이다. 빅카인즈 기사 데이터는 전수 확인되지 않아 `unknown`이며 화면의 기존 조회로 보완한다. 네이버 수집은 꺼져 있다.
- 파일의 갱신과 화면 캐시에는 시차가 있다(최대 10분의 캐시 설정). e-Paper 기사 제목·위치 기록은 화면용 기사 목록이 아니므로 기사 제공으로 판정하지 않는다. 실패 시 Lambda 오류 알람을 사용한다.

## 날짜별 현황 v2와 기사 캐시 색인(운영 반영 2026-11-09)

- `availability/v2/YYYY.json`에 사진, 기존 네이버 1면, e-Paper 기록, 빅카인즈 1면·그날 기사를 출처별로 기록한다. e-Paper 기록은 기사 본문 또는 표시 가능한 기사로 간주하지 않는다.
- 기존 1면 확인 달력의 확인 구간은 최초 조사 시각을 함께 반영하고, 달력이 확인하지 않은 일요일과 실패 날짜는 미확인으로 둔다. 기존 v1 파일도 유지한다.
- `BIGKINDS_CACHE_TABLE`이 설정된 정기 실행은 DynamoDB의 기존 1면 조회 캐시를 시간당 최대 600일을 50일씩 나눠 읽어 현황에 반영한다. 대체 신문 날짜를 선택일의 기사로 취급하지 않고, 만료되거나 최근 30일 중 6시간이 지난 캐시는 건너뛴다. 전체 날짜를 확인하면 처음부터 다시 순환한다. 기사 본문은 현황에 넣지 않는다.
- `BIGKINDS_BACKFILL_TARGET`이 설정된 정기 실행은 시간당 최대 2일을 조회하고, 매일 13:25에는 전날을 추가로 확인한다. 캐시에 저장됐는지 재조회로 확인한 뒤 비공개 진행 파일을 전진한다. 오류 시 `ops/status/bigkinds-backfill-paused.json`을 남기고 중지한다. 하위 API가 403·429도 502로 감추므로 원인을 확인하기 전 자동으로 다시 시작하지 않는다.
- 현재 빅카인즈 API의 호출 한도와 계약은 확인되지 않았다. 신규 백필을 켜기 전 한도와 운영 권한을 확인한다. 현재 `BIGKINDS_CACHE_TABLE`만 켜져 있고, `BIGKINDS_BACKFILL_TARGET`과 네이버 `NAVER_DAILY`는 꺼져 있다. 1990-01-02 소량 조회는 BigKinds 뉴스 검색 응답 시간 초과로 실패했다.

## 구성

| 경로 | 역할 | 상태 |
|---|---|---|
| `collect/crawl_naver_front.py` | 네이버 서울경제(언론사 011) 신문보기에서 1면 기사 목록 수집 → CSV | 완료(2026-01-01~11-03 샘플 1,171건) |
| `collect/fetch_epaper_front.py` | e-Paper 최신호 1면 이미지 받기(→ 폴더 또는 S3 `timemachine-newspaper/img/`). 시험 `collect/test_fetch_epaper_front.py` | 작성(2026-11-03), 시험 13개 통과 |
| `upload/check_images.py` | 원본 이미지 올리기 전 점검(→ `newspaper_manifest.csv`)·올린 뒤 S3 목록 대조(일일 수집분은 따로 알림). 시험 `upload/test_check_images.py` | 작성(2026-11-03), 대조 시험 17개 통과 |
| `collect/naver_daily.py`, `collect/daily_handler.py` | 네이버 1면 목록 일일 수집(연도 파일에 이어 붙임), 누락 목록, 알림 지표, 날짜 지정 재처리. 시험 `collect/test_naver_daily.py`. AWS: `aws/provision_daily.sh`(Lambda·EventBridge·SNS·알람), `aws/deploy_daily.sh` | 작성(2026-11-03), 시험 42개 통과. **네이버 수집은 꺼진 채**(`NAVER_DAILY`) |
| `upload/count_day_types.py` | 날짜 종류별 개수표: 날짜마다 1면 사진·네이버 1면 목록이 있는지 세어 연도별 표와 사진이 이어서 없는 구간을 만든다. 시험 `upload/test_count_day_types.py` | 작성(2026-11-03), 시험 18개 통과 |
| `build/build_year_files.py` | 1면 기사 CSV → 연도 파일(`timemachine-newspaper/index/v1/YYYY.json`). 연도 파일 전체를 새로 만든다(아래 "연도 파일 만들기"). 시험 `build/test_build_year_files.py` | 작성(2026-11-03), 시험 11개 통과 |
| `261103_타임머신_지면1면_요구사항.html` | 개요, 로드맵, 과제와 목표, 수집 출처 | v1.3 |
| `261103_타임머신_1면이미지_인수규격.md` | 이미지 저장소·형식·구조·업로드·검증 기준 | v1 |
| `261103_타임머신_신문장면_표시규칙.md` | 신문 장면의 기사 출처·표시·"1면" 문구·대체 규칙·안내 문구 | v1 |

## 수집 범위(2026-11-03 확인)

| 구분 | 범위 | 비고 |
|---|---|---|
| 이미지 | 1960-08-01 ~ 2026-11-02, 16,254장·21.3GB | 로컬 보관(`마스터DB/06_콘텐츠/지면1면/연도/월/YYYYMMDD.jpg`). 1978~87, 1991~93 없음 |
| 텍스트 | 네이버 2011-07-09 이후 | 표본 조회로 확인. 전수는 미확인. 이전 구간은 네이버에 없음 |

## 실행

```
cd timemachine-data
python3 collect/crawl_naver_front.py 2026-01-01 2026-11-03 naver_front_2026.csv
```

- 이어받기: 같은 명령을 다시 실행하면 CSV에 있는 날짜는 건너뛴다.
- 지면이 없는 날(일요일·휴간)은 행이 없다.
- 요청 간 0.7초 대기, 일 1회 요청.
- **대량 수집 전에 확인할 것**: `https://media.naver.com/robots.txt`는 모든 봇에 `Disallow: /`이고 AI 학습·RAG 목적 수집을 금지한다고 적혀 있다(2026-11-03 확인). 2011-07-09~2025-12-31(약 4,600일)을 이 방식으로 모으기 전에 허용 여부를 확인한다. 같은 자료를 서울경제 내부 지면 데이터에서 받을 수 있는지도 함께 본다(e-Paper 페이지 설명에 1960년 창간호부터 최근호까지 볼 수 있다고 적혀 있다).
- 확인한 페이지 모양(날짜당 1건): 2011-07-09부터 1면 목록이 있고(2011-07-08은 "발행된 종이신문이 없거나 신문게재 정보가 입력되지 않았습니다"), 일요일·휴간일도 같은 문구다. 2011·2013·2018년 모두 같은 구조로 읽혔다(기사 6·4·5건).

### 연도 파일 만들기

```
cd timemachine-data
python3 build/build_year_files.py --csv naver_front_2026.csv --covers 2026-01-01:2026-11-03 --out year-files
cd build && python3 -m unittest test_build_year_files -v
```

- 입력 CSV는 `date`·`rank`·`title`·`url` 열이 있으면 된다(수집 스크립트의 CSV 그대로). `--csv`와 `--covers`는 여러 번 쓸 수 있다.
- `--covers`는 그 기간의 모든 날짜를 확인했다는 선언이다. 확인한 기간에 기사가 없는 날은 "1면 기사가 없는 날", 확인하지 않은 기간은 화면이 기존 방식(빅카인즈)으로 채운다. 선언한 기간 밖의 행이 있으면 오류다.
- 같은 입력이면 같은 파일이 나오고, `updated_at`만 다르면 파일을 다시 쓰지 않는다(`unchanged`). 기사 수가 3~6건이 아니거나 순서가 이어지지 않으면 `[확인]`으로 알린다.
- **이 도구는 연도 파일 전체를 새로 만든다.** S3에 이미 있는 같은 해 파일 위에 올리면 그 파일이 통째로 바뀐다. 일일 수집(`collect/daily_handler.py`)이 켜져 이어 붙인 해의 파일은 옛 CSV로 다시 만들어 올리지 않는다(이어 붙인 날이 사라진다). 그래서 **연도 파일은 일일 수집을 켜기 전에 올리고**, 켠 뒤에 다시 만들어야 하면 이어 붙인 날짜까지 CSV에 넣는다.
- 만든 파일은 일일 수집(`naver_daily.py`), 개수표(`upload/count_day_types.py`), 화면(`parseNewspaperYear`)이 같은 형식으로 읽는 것을 확인했다(빌더로 만든 파일에 일일 수집이 하루를 이어 붙인 결과까지).

## CSV 컬럼

`date, page, rank, is_top, article_id, title, url, thumbnail` — `date`는 이미지 파일명 일자와 연결 키. `is_top`은 썸네일이 붙은 기사를 톱으로 보는 추정 기준.

## 일일 수집·누락 목록·알림·재처리(2026-11-03)

이미지 수집(`lambda_handler.py`, 매일 13·14·15시 10분 KST)과 별개 함수 `sedaily-lens-timemachine-newspaper-daily`(이름 정본 `config/resources.env`의 `TIMEMACHINE_DAILY_FUNCTION`)가 매시간 25분에 돈다.

| 기능 | 동작 |
|---|---|
| 네이버 1면 목록 수집 | 오늘부터 7일 전까지 **확인하지 못한 날만** 받아 연도 파일(`index/v1/YYYY.json`)에 이어 붙인다. 일요일(1996-09-29~)은 받지 않고 확인 처리한다. 오늘은 06~14시(KST)에만 받고, 목록이 아직 없으면 확인 처리하지 않는다. 지난 날은 목록이 없으면 "1면 없음"으로 확인 처리한다. 있던 목록은 빈 화면이 와도 지우지 않는다 |
| 재시도 | 요청 안에서 3번(2초·4초 대기). 확인하지 못한 날은 `text_covers`에 넣지 않아 다음 실행이 다시 받는다(그동안 화면은 빅카인즈로 채운다). 403·429는 재시도 없이 그 실행을 멈추고 오류로 끝낸다. 요청 간 0.7초, User-Agent는 수집기라고 밝힌다 |
| 누락 목록 | 실행마다 `ops/status/missing.json`에 쓴다(공개 경로 `timemachine-newspaper/` 밖). `naver`는 `NAVER_DAILY_FROM` 이후 확인하지 못한 날, `image`는 2026-11-03 이후 사진이 없는 발행 예상일(13시 이후 오늘 포함), 둘 다 **최근 것부터** 60개. `naver_backfill`은 시작일 이전 2011-07-09~의 미확인 일수로 정보만 적는다(알림에 쓰지 않는다) |
| 날짜 지정 재처리 | 이벤트 `{"dates": ["2026-11-03"]}` 또는 `{"from": "...", "to": "..."}`(최대 31일, `"force": true`면 확인한 날도 다시 받음). 네이버 수집이 켜져 있을 때만 |
| 알림 | CloudWatch 알람 3개 → SNS 토픽 `TIMEMACHINE_ALERT_TOPIC`: 새 함수 오류, **이미지 수집 함수 오류**(지금까지 알림이 없었다), 마감(13시) 뒤에도 사진이 없는 발행 예상일이 3시간 연속. 받는 곳은 슬랙 `#3_lens_alarm` 채널이다(Amazon Q Developer 채널 설정 `ailens-ops-alerts-slack`에 이 토픽을 추가해 연결, 2026-11-04, 시험 알림 통과). 이메일은 쓰지 않지만 `provision_daily.sh`에 `ALERT_EMAIL`을 주면 구독을 만들 수 있다. 알람이 풀릴 때(OK)도 같은 토픽으로 알린다(`provision_daily.sh` 기준이며, 이미 만들어진 알람은 스크립트를 다시 실행해야 바뀐다. 전에 `CHECK_ONLY=1`로 덮어쓸 항목을 확인할 수 있다). 슬랙 연결을 되돌리려면 채널 설정의 SNS 토픽 목록에서 이 토픽만 뺀다. **토픽에 연결된 곳이 없으면 알람 상태는 CloudWatch 콘솔에서만 보이고 아무에게도 가지 않는다** |

환경 변수: `NEWSPAPER_BUCKET`(필수), `NAVER_DAILY`(`on`이 아니면 **네이버에 요청하지 않는다**, 기본 꺼짐), `NAVER_DAILY_FROM`(켤 때 필수, 일일 수집 시작일). 꺼져 있어도 이미지 누락 목록과 지표는 만든다.

**네이버 수집을 켜기 전에**: `media.naver.com/robots.txt`는 모든 봇의 전체 접근을 막고 AI 학습·RAG 목적 접근도 금지한다고 적고 있다(2026-11-03 확인). 하루 1~8건이라 규모는 작지만 같은 사안이어서 구성은 꺼진 채 만든다. 켜는 것은 별도 결정이다. 켜면 시작일 이후 연도 파일에는 그날들만 들어가므로, 2011~2025년은 별도 과거 수집이 채워야 한다.

e-Paper 기록(`epaper/YYYY/MM/YYYYMMDD.json`)에는 이미 매일 1면 기사 id·제목·위치가 저장돼 있다. 네이버를 켜지 않아도 이 기록으로 2026-11-03 이후의 1면 목록을 만들 수 있을 가능성이 있다. 다만 기사 링크로 쓸 수 있는지(기사 id가 빅카인즈 기사 번호와 맞는지)는 확인하지 않았다.

## 날짜 종류별 개수표

사진 목록이 생기면(올리기 전 `newspaper_manifest.csv`, 올린 뒤 S3 목록) 날짜마다 무엇이 있는지 세어 연도별로 보여 준다. 읽기만 하고 아무것도 바꾸지 않는다.

```
cd timemachine-data/upload
python3 count_day_types.py --manifest newspaper_manifest.csv [--year-files <index/v1이 든 폴더>] [--out <결과폴더>] [--until YYYY-MM-DD]
python3 count_day_types.py --listing listing.json            [--year-files <폴더>]              # 올린 뒤
python3 -m unittest test_count_day_types -v                                                       # 시험(이미지·네트워크·AWS 없이)
```

- 날짜는 창간일(1960-08-01)부터 `--until`(기본: 사진·목록 중 가장 늦은 날짜)까지 하나씩 센다. 종류는 발행 중단(1980-11-26~1988-07-31), 일요일 휴간(1996-09-29~), 옛 일요일(1996-09-29 전), 그리고 발행 예상일(사진+목록 · 사진만 · 목록만 · 둘 다 없음 · 목록 미확인).
- 네이버 목록은 `--year-files`를 주면 연도 파일의 `days`(있음)와 `text_covers`(확인한 기간, 그 안에서 없으면 "없음")로 판단하고, 주지 않으면 모두 "미확인"이다.
- `--out`을 주면 `day_types.csv`(날짜별 종류), `year_counts.csv`(연도별 표), `missing_runs.csv`(사진이 이어서 없는 구간)를 쓴다.
- **일요일 확인 결과(2026-11-04, 실제 목록 16,254장)**: 1996-09-29 전 일요일은 사진이 있는 날이 82.7%(사진 없는 알려진 구간을 뺀 1,177일 중 973일)로 같은 기간 월~토(88.1%)와 비슷하다. 1996-09-29 이후 일요일은 1,541일 중 14일(0.9%, 명절·특집)이고 월~토는 97.8%다. 그래서 일요일을 월요일 우선으로 처리하는 시작일(`birthdayNewspaper.ts`의 `NO_SUNDAY_FROM`, 1996-09-29)은 그대로 둔다. 옛 일요일 중 1970·1971년은 사진이 전부 없고 1994~1996년은 약 3분의 1이 없다. 사진이 없는 날은 화면 안내로 처리한다. (이전 문장의 "옛 일요일에는 사진이 거의 없을 것"이라는 추정은 틀렸다.)

## 데이터를 저장소에 넣지 않는 이유

이미지 21.3GB와 수집 CSV는 git 대상이 아니다. 이미지는 S3, CSV는 작업 폴더에 둔다. 수집 결과 요약은 `마스터DB/06_콘텐츠/지면1면/` 문서에 있다.

## 데이터 구조(2026-11-03 설계)

요구사항은 `261103_타임머신_지면1면_요구사항.html`, 이미지 올리기 규격은 `261103_타임머신_1면이미지_인수규격.md`.

| 항목 | 결정 |
|---|---|
| 저장소 | S3 `sedaily-lens-timemachine-newspaper`(us-east-1). 비공개, 버전 관리, 이전 버전 90일 뒤 삭제. 이름 정본은 `config/resources.env` `TIMEMACHINE_NEWSPAPER_BUCKET` |
| 공개 주소 | 사이트 CloudFront(`SERVICE_CF_DIST_ID`) 경로 `/timemachine-newspaper/*` → 버킷 `timemachine-newspaper/`(OAC). `intake/`는 공개하지 않는다 |
| 원본 이미지 | `timemachine-newspaper/img/YYYY/MM/YYYYMMDD.jpg`. 원본 JPEG 그대로(자르기·크기 변경·재인코딩 없음). `Cache-Control: public, max-age=2592000` |
| 받은 자료 | `intake/check/`(점검 결과), `intake/text/`(네이버 CSV) |
| 연도 파일 | `timemachine-newspaper/index/v1/YYYY.json`. 개발이 만든다. `Cache-Control: public, max-age=600` |
| 태그 | Service=lens, Project=Sedaily-LENS, ServiceName=Sedaily-LENS, Environment=prod, CostCenter=sedaily-ai, Purpose=timemachine-newspaper, DoNotDelete=true |
| AWS 상태 | 버킷 생성 완료(2026-11-03). 태그·공개 차단·버전 관리·수명 주기·소유권을 만든 뒤 다시 조회해 확인했다. 업로드 전용 정책 `lens-timemachine-newspaper-upload`는 만들었고 아직 누구에게도 연결하지 않았다. 사이트 CloudFront에 `/timemachine-newspaper/*` 경로를 연결했다(2026-11-03, 원본 접근 제어 `lens-timemachine-newspaper-oac`). 시험 파일은 200·`image/jpeg`로 열렸고 확인 뒤 삭제했으며, 없는 파일은 404였다 |

새 버킷을 쓰는 이유: 기존 미디어 버킷(`sedaily-mbti-cms-media-dev`)은 S3 주소로 공개 읽기·CloudFront 미경유이고, admin이 객체를 지운다. 21GB 원본 보관은 권한을 따로 둔다.

연도 파일 v1(예시):

```json
{
  "schema": 1,
  "year": 2014,
  "updated_at": "2026-11-10T06:05:00+09:00",
  "text_covers": [["2014-01-01", "2014-12-31"]],
  "days": {
    "2014-05-17": {
      "articles": [{ "rank": 1, "title": "기사 제목", "url": "https://n.news.naver.com/..." }]
    }
  }
}
```

- 이미지는 연도 파일에 없다. 화면이 날짜로 정해진 주소(`/timemachine-newspaper/img/2014/05/20140517.jpg`)를 직접 불러서, 이미지를 올리면 바로 보인다. 없으면 안내한다.
- `days`에는 네이버 1면 기사가 있는 날만 있다. `articles`는 네이버가 준 순서(`rank`) 그대로 3~6건을 모두 담고, 화면이 앞 4건을 쓴다. 썸네일 유무(`is_top`)는 쓰지 않는다.
- 보여 줄 신문 날짜(일요일·명절 대체)는 기존 1면 조회(`/time-machine?front=`)가 정하고, 화면은 그 날짜가 2011-07-09 이후이면 `days`의 같은 날짜 목록을 붙인다(없으면 빅카인즈 기사). `text_covers`는 네이버 목록을 확인한 기간으로, 지금 화면은 읽지 않는다. 조회를 건너뛰는 것은 연도 파일이 전 기간을 채운 뒤의 과제다(표시 규칙 7절 과제 6).
- 형식을 바꾸면 `index/v2/`를 새로 만들고 화면의 버전 값만 바꾼다. 이미지 경로는 바꾸지 않는다. 파일이 커서 느리면 월별 파일로 나눌 수 있다.
- 화면 표시·문구·대체 규칙은 `261103_타임머신_신문장면_표시규칙.md`.
- 원본은 평균 1.3MB라 모바일 첫 표시가 느릴 수 있다. 필요해지면 비율 그대로 줄인 사본을 `timemachine-newspaper/web/`에 따로 만들고 원본은 그대로 둔다(지금은 만들지 않는다).

## 일일 수집: e-Paper 최신호 1면 이미지(2026-11-03 확인)

로그인 없이 받을 수 있는 건 최신호 1면뿐이라 매일 받아 두어야 한다.

- `https://epaper.sedaily.com/` 첫 화면에 최신호 정보가 박혀 있다: 발행일 `FREE_PUB_DATE`, 1시간짜리 이미지 토큰 `imgToken`, 면 목록 `pdfData`(32면, 면마다 이미지 폴더·파일명과 기사 제목·영역).
- 이미지 주소는 `CDN_URL + 면 폴더 + 파일명 + '?' + IMG_TOKEN_NAME + '=' + imgToken`이다. 서버가 토큰의 슬래시를 `\/`로 내보내서 풀어 써야 한다(안 풀면 403). Referer나 로그인은 필요 없다.
- 2026-11-03 1면은 2495×3507, 905,533바이트 JPEG이고(보관 원본은 평균 1.3MB) `upload/check_images.py`를 오류 없이 통과한다. 가로세로 비율은 1.405배다.
- 같은 날짜의 파일이 이미 있으면 내용이 같을 때 건너뛰고, 다르면 그대로 두고 알린다(`--force`로만 덮어쓴다). 토큰·서명값은 출력하지 않는다(시험이 확인).
- `pdfData`의 1면 항목에는 기사 8개(광고 칸 포함)의 번호·제목(`headLine`)·영역(`poly`)이 있고, 이것도 최신호만 무료라 이미지와 함께 저장한다: `timemachine-newspaper/epaper/YYYY/MM/YYYYMMDD.json`(폴더 모드는 `<out>/epaper/...`). 내용은 `schema`·`date`·`saved_at`·`image`(파일명·가로·세로·바이트)·`articles`(`id`·`headline`·`poly`)이고, 영역 좌표는 1면 이미지의 픽셀(`image.width × image.height`) 기준이다. `R(x1,y1,x2,y2)`는 사각형, `P(x,y;x,y;...)`는 다각형이다. 같은 날짜 기록이 이미 있으면 그대로 두고(`--force`로만 덮어쓴다), 저장에 실패해도 이미지는 저장하며 종료 코드는 이미지 기준이다. 11/3 기사 번호(`02100311.…`)는 빅카인즈의 서울경제 기사 번호와 앞부분이 같지만 서로 맞는지는 확인하지 않았다.
- 아직 없는 것: 새 호가 올라오는 시각 측정, 새 호가 안 올라왔을 때 알림. AWS에서의 실제 실행은 2026-11-03에 확인했다(아래 "AWS 일일 실행").

```
cd timemachine-data
python3 collect/fetch_epaper_front.py --out local-capture                          # 폴더에 YYYY/MM/YYYYMMDD.jpg (local-capture/는 저장소에 넣지 않는다)
python3 collect/fetch_epaper_front.py --s3-bucket sedaily-lens-timemachine-newspaper   # S3 timemachine-newspaper/img/YYYY/MM/YYYYMMDD.jpg
python3 collect/fetch_epaper_front.py --dry-run                                    # 받아서 확인만
cd collect && python3 -m unittest test_fetch_epaper_front -v                       # 시험(네트워크·AWS 없이)
```

### AWS 일일 실행(Lambda + EventBridge)

- Lambda `sedaily-lens-timemachine-newspaper-capture`(이름 정본은 `config/resources.env`의 `TIMEMACHINE_CAPTURE_FUNCTION`)를 EventBridge가 **매일 13·14·15시 10분(KST)**에 부른다. 당일 이미지와 기사 기록이 이미 있으면 외부 요청 없이 건너뛴다.
- 진입점은 `collect/lambda_handler.py`(`handler`). 환경 변수 `NEWSPAPER_BUCKET`, 실행 제한 120초, 256MB, 파이썬 3.12(boto3는 기본 제공). 실패하면 예외로 끝나 Lambda `Errors`에 잡힌다. 로그는 한 줄 JSON(`event`·`status`·`date`·크기)이고 토큰은 들어가지 않는다.
- 권한은 로그 쓰기, 버킷 `timemachine-newspaper/img/*`·`timemachine-newspaper/epaper/*` 목록 조회, 같은 경로 `PutObject`만이다. 없는 파일에 `head_object`를 하면 목록 권한이 없을 때 404와 403이 구분되지 않아, 접두어를 제한한 목록 조회로 있는지 본다.
- 만들기: `bash timemachine-data/aws/provision.sh`(AWS 자격 증명이 있는 기기). 계정·버킷 확인 → 로그 그룹(30일) → IAM 역할 → 코드 묶음 → Lambda → 규칙·호출 권한·대상 → 태그를 다시 조회해 `Service=lens` 확인. 이미 있는 리소스는 건너뛴다. 코드만 바꿀 때는 `bash timemachine-data/aws/deploy.sh`(`CodeSha256`과 `State`·`LastUpdateStatus`로 확인). 권한과 코드가 함께 바뀌었으면 `provision.sh`(권한 정책을 덮어써 최신으로 맞춤) → `deploy.sh` 순서로 실행한다.
- 태그는 `Project=Sedaily-LENS`, `CostCenter=sedaily-ai`, `ServiceName=Sedaily-LENS`, `Environment=prod`, `Service=lens`, `Workload=timemachine-newspaper-capture`.
- 새 호가 올라오는 시각 확인(CloudWatch Logs Insights, 로그 그룹 `/aws/lambda/<함수 이름>`): `fields @timestamp, date, status | filter event = "capture" and status = "saved" | sort @timestamp asc`
- 일일 수집이 올린 사진(2026-11-03 이후)은 보관 이미지 점검 목록(`newspaper_manifest.csv`)에 없다. 올린 뒤 대조(`check_images.py --compare`)는 목록의 마지막 날짜 뒤이고 2026-11-03 이후인 파일을 "자동 수집분"으로 따로 알리고 차이로 세지 않는다. 오늘 날짜는 조건에 넣지 않는다(대조가 도는 기기의 시계가 틀려도 결과가 같아야 해서). 이름이 날짜가 아닌 파일, 시작일 이전 파일, 목록 범위 안의 목록 외 파일은 그대로 차이로 센다. 시험 `upload/test_check_images.py`.
- 수집 오류와 사진 누락은 위 일일 감시의 알람과 슬랙 경로를 쓴다. 최초 정기 실행과 알림의 실제 동작은 배포 후 확인한다.

남은 요구사항: 2011-07-09 이전 텍스트는 네이버에 없고 기존 빅카인즈 경로(1994-01~1996-07 1면)가 후퇴하지 않아야 한다. 매일 최신호 1면(e-Paper) 이미지와 네이버 1면 텍스트를 자동 수집하고, 실패 재시도와 누락 알림이 필요하다.

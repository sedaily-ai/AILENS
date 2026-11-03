# timemachine-data — 타임머신용 지면 1면 이미지·데이터

렌즈 타임머신에서 사용자가 연월일을 고르면 그날의 **지면 1면 이미지**와 **1면 기사 데이터**를 보여 주기 위한
데이터를 모으고 가공하는 폴더. 콘텐츠 생성·발행(`pipelines/`)과 서비스 런타임(`service/`)과는 별개이며, 서비스 배포 패키지에 들어가지 않는다.

## 구성

| 경로 | 역할 | 상태 |
|---|---|---|
| `collect/crawl_naver_front.py` | 네이버 서울경제(언론사 011) 신문보기에서 1면 기사 목록 수집 → CSV | 완료(2026-01-01~11-03 샘플 1,171건) |
| `collect/fetch_epaper_front.py` | e-Paper 최신호 1면 이미지 받기(→ 폴더 또는 S3 `timemachine-newspaper/img/`). 시험 `collect/test_fetch_epaper_front.py` | 작성(2026-11-03), 시험 13개 통과 |
| `upload/check_images.py` | 원본 이미지 올리기 전 점검(→ `newspaper_manifest.csv`)·올린 뒤 S3 목록 대조 | 작성(2026-11-03) |
| `upload/count_day_types.py` | 날짜 종류별 개수표: 날짜마다 1면 사진·네이버 1면 목록이 있는지 세어 연도별 표와 사진이 이어서 없는 구간을 만든다. 시험 `upload/test_count_day_types.py` | 작성(2026-11-03), 시험 18개 통과 |
| `build/` | 연도 파일(`timemachine-newspaper/index/v1/YYYY.json`) 생성 | 네이버 과거 수집 뒤 작성 |
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

## CSV 컬럼

`date, page, rank, is_top, article_id, title, url, thumbnail` — `date`는 이미지 파일명 일자와 연결 키. `is_top`은 썸네일이 붙은 기사를 톱으로 보는 추정 기준.

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
- **확인할 것(2026-11-03 계산)**: 요구사항 HTML의 "사진 없는 구간"을 빼고 일요일(1996-09-29부터)을 뺀 발행 예상일은 16,307일, HTML의 사진은 16,254장이다. 1996-09-29 전의 일요일 1,177일에도 사진이 있다고 보면 차이가 1,230일로 커진다. 그 시기 일요일에는 사진이 거의 없을 가능성이 크며, 실제 목록으로 개수표의 "옛 일요일 사진" 열이 거의 0인지 확인한다. 그렇다면 일요일을 월요일 우선으로 처리하는 시작일(`birthdayNewspaper.ts`의 `NO_SUNDAY_FROM`)도 다시 본다.

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

- 매일 자동으로 받으려고 Lambda `sedaily-lens-timemachine-newspaper-capture`(이름 정본은 `config/resources.env`의 `TIMEMACHINE_CAPTURE_FUNCTION`)를 EventBridge가 **매시간 10분**에 부른다. 새 호가 올라오는 시각을 아직 몰라서이고, 같은 호는 건너뛰므로 여러 번 돌아도 안전하다. 시각을 알게 되면 `provision.sh`의 `SCHEDULE`만 줄여 다시 실행한다.
- 진입점은 `collect/lambda_handler.py`(`handler`). 환경 변수 `NEWSPAPER_BUCKET`, 실행 제한 120초, 256MB, 파이썬 3.12(boto3는 기본 제공). 실패하면 예외로 끝나 Lambda `Errors`에 잡힌다. 로그는 한 줄 JSON(`event`·`status`·`date`·크기)이고 토큰은 들어가지 않는다.
- 권한은 로그 쓰기, 버킷 `timemachine-newspaper/img/*`·`timemachine-newspaper/epaper/*` 목록 조회, 같은 경로 `PutObject`만이다. 없는 파일에 `head_object`를 하면 목록 권한이 없을 때 404와 403이 구분되지 않아, 접두어를 제한한 목록 조회로 있는지 본다.
- 만들기: `bash timemachine-data/aws/provision.sh`(AWS 자격 증명이 있는 기기). 계정·버킷 확인 → 로그 그룹(30일) → IAM 역할 → 코드 묶음 → Lambda → 규칙·호출 권한·대상 → 태그를 다시 조회해 `Service=lens` 확인. 이미 있는 리소스는 건너뛴다. 코드만 바꿀 때는 `bash timemachine-data/aws/deploy.sh`(`CodeSha256`과 `State`·`LastUpdateStatus`로 확인). 권한과 코드가 함께 바뀌었으면 `provision.sh`(권한 정책을 덮어써 최신으로 맞춤) → `deploy.sh` 순서로 실행한다.
- 태그는 `Project=Sedaily-LENS`, `CostCenter=sedaily-ai`, `ServiceName=Sedaily-LENS`, `Environment=prod`, `Service=lens`, `Workload=timemachine-newspaper-capture`.
- 새 호가 올라오는 시각 확인(CloudWatch Logs Insights, 로그 그룹 `/aws/lambda/<함수 이름>`): `fields @timestamp, date, status | filter event = "capture" and status = "saved" | sort @timestamp asc`
- 일일 수집이 올린 날짜(2026-11-03 이후)는 보관 이미지 점검 목록(`newspaper_manifest.csv`)에 없어서, 올린 뒤 대조(`check_images.py --compare`)에서 "목록에 없는데 올라간 파일"로 나오는 것이 정상이다.
- 아직 없는 것: 실패·미게시 알림(알림 채널 결정 필요).

남은 요구사항: 2011-07-09 이전 텍스트는 네이버에 없고 기존 빅카인즈 경로(1994-01~1996-07 1면)가 후퇴하지 않아야 한다. 매일 최신호 1면(e-Paper) 이미지와 네이버 1면 텍스트를 자동 수집하고, 실패 재시도와 누락 알림이 필요하다.

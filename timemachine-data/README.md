# timemachine-data — 타임머신용 지면 1면 이미지·데이터

렌즈 타임머신에서 사용자가 연월일을 고르면 그날의 **지면 1면 이미지**와 **1면 기사 데이터**를 보여 주기 위한
데이터를 모으고 가공하는 폴더. 콘텐츠 생성·발행(`pipelines/`)과 서비스 런타임(`service/`)과는 별개이며, 서비스 배포 패키지에 들어가지 않는다.

## 구성

| 경로 | 역할 | 상태 |
|---|---|---|
| `collect/crawl_naver_front.py` | 네이버 서울경제(언론사 011) 신문보기에서 1면 기사 목록 수집 → CSV | 완료(2026-01-01~11-03 샘플 1,171건) |
| `upload/check_images.py` | 원본 이미지 올리기 전 점검(→ `newspaper_manifest.csv`)·올린 뒤 S3 목록 대조 | 작성(2026-11-03) |
| `build/` | 연도 파일(`timemachine-newspaper/index/v1/YYYY.json`) 생성 | 네이버 과거 수집 뒤 작성 |
| `261103_타임머신_지면1면_요구사항.html` | 개요, 로드맵, 과제와 목표, 수집 출처 | v1.3 |
| `261103_타임머신_1면이미지_인수규격.md` | 이미지 저장소·형식·구조·업로드·검증 기준 | v1 |

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
| AWS 상태 | 버킷 생성 완료(2026-11-03). 태그·공개 차단·버전 관리·수명 주기·소유권을 만든 뒤 다시 조회해 확인했다. 업로드 전용 정책 `lens-timemachine-newspaper-upload`는 만들었고 아직 누구에게도 연결하지 않았다. 사이트 경로(`/timemachine-newspaper/*`) 연결은 이미지를 올린 뒤 AWS를 쓰는 기기에서 한다 |

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
      "w": 4465, "h": 6100,
      "articles": [{ "rank": 1, "title": "기사 제목", "url": "https://n.news.naver.com/..." }]
    }
  }
}
```

- 이미지와 기사는 날짜로 짝이 맞는다. 이미지 주소는 날짜로 정해지고(`/timemachine-newspaper/img/2014/05/20140517.jpg`), 같은 날짜의 기사가 같은 항목(`days`)에 들어 있다.
- `days`에는 이미지나 기사 중 하나라도 있는 날이 모두 있다. `w`·`h`가 있으면 이미지가 있는 날이고(이미지가 뜨기 전 자리를 잡는 데 쓴다, 값은 `newspaper_manifest.csv`), `articles`가 있으면 네이버 1면 기사가 있는 날이다. 한쪽만 있는 날도 빠지지 않는다.
- 기사는 순서(`rank`)대로 모두 담고, 화면이 앞에서 4건을 골라 보여 준다(지금 화면과 같다). 네이버 1면은 3~6건이다.
- `text_covers`는 네이버 목록을 날짜별로 확인한 기간이다. 2011-07-09 이전과 기사가 없는 날의 기사를 기존 1면 조회(`/time-machine?front=`)로 채우는 규칙은 화면 작업 때 정한다.
- 형식을 바꾸면 `index/v2/`를 새로 만들고 화면의 버전 값만 바꾼다. 이미지 경로는 바꾸지 않는다.
- 원본은 평균 1.3MB라 모바일 첫 표시가 느릴 수 있다. 필요해지면 비율 그대로 줄인 사본을 `timemachine-newspaper/web/`에 따로 만들고 원본은 그대로 둔다(지금은 만들지 않는다).

남은 요구사항: 2011-07-09 이전 텍스트는 네이버에 없고 기존 빅카인즈 경로(1994-01~1996-07 1면)가 후퇴하지 않아야 한다. 매일 최신호 1면(e-Paper) 이미지와 네이버 1면 텍스트를 자동 수집하고, 실패 재시도와 누락 알림이 필요하다.

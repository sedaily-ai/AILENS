# instagram_seoul_economic — 서울경제 지면 1면 사진 카드 인스타그램 자동 게시

매일 06·07·08·12·14시 KST엔 서울경제 **지면 1면** 기사, 10·16·19·21시엔 **연예·영화** 기사를 1건씩 인스타그램 `@seoul_economic`에
**사진 1장 + 본문형 캡션**으로 올린다(하루 최대 1면 5건 + 연예 4건). LENS 시험 채널(`../instagram_single/`)과 같은 카드 형식이다.

> **상태(2026-11-26): 게시 권한 연결 완료, AWS 미설치.** "Seoul Economic" 포트폴리오가 "서울경제 LENS"(1277934024536624)에
> `@seoul_economic` 콘텐츠 권한을 파트너 할당했고, 시스템 사용자 `seoul-economic-publisher`에 앱·계정을 배정해
> 토큰을 받았다. 게시 준비(컨테이너 FINISHED)까지 시험함, 실제 게시는 아직 안 함.

## LENS 카드(`instagram_single`)와 다른 점

| | LENS (`@lens.sedaily`) | 서울경제 (`@seoul_economic`) |
|---|---|---|
| 기사 출처 | LENS 공개 API의 1면 탭(07:00 발행 뒤) | **S3 `daily-xml` 직접** — 새벽 6시 게시 가능 |
| 시간 | 09·12·15·18시, 하루 4건 | 06·07·08·12·14시, 하루 5건 |
| 순서 | LENS display_order | 지면 맨 위(TOP) 먼저 → 나머지는 웹 게재 시각 순 |
| 제목 말투 | SNS 썸네일 말투(ㄷㄷ 허용) | 담백한 뉴스 제목체(인터넷 말투 금지) |
| 로고 | 오른쪽 위 LENS | 아래 가운데 S 아이콘 + 서울경제 |
| 사진 설명 | 원문 페이지 figcaption | XML `image` 의 caption 속성 |
| 알림 | Slack #03_lens-alarm | 보내지 않음(CloudWatch 로그만) |

같은 점: 1080×1350, 제목 2줄(1줄 흰색·2줄 파란색 (91,141,239)), 제목 위 날짜, 글자는 가운데 900px 안,
캡션 형식(도입 → 📌×2 → 마무리 → `사진=출처` → `원문: 서울경제신문` → AI 해시태그 5~7개).

## 기사 고르기

1면 기사는 신문 날짜 **전날 저녁 5시 반~7시 반**(맨 위 기사는 밤 11시 반 전후, 가끔 자정 직후)에 웹에 올라온다
(11/17~26 지면 9일 실측). 그래서 지면 날짜 D의 1면은 `daily-xml/{D-1}.xml`과 `{D}.xml`을 함께 보고
`paper/editingInfo/paperNumber == "1"` 이고 `paper/publishInfo/date == D` 인 기사만 고른다.

- 1면은 하루 4~5건 → 4건뿐인 날은 14시 칸이 비고 아무것도 하지 않는다.
- 일요일·휴간일은 1면 기사가 없어 하루 내내 아무것도 하지 않는다.
- 사진 없는 기사, 가로 600px 미만 사진 기사는 건너뛴다(로그에 남김).

## 연예 기사(10·16·19·21시)

- 후보: 그 시각 기준 **최근 24시간**에 웹에 올라온 기사 중 분류가 `연예,…` 이거나 `문화·라이프,문화,영화`인 것
  (m.sedaily.com/culture/movie "영화·미디어" 페이지에 나오는 기사와 같다), 사진 600px 이상.
- 서울경제 모바일 **"문화 많이 본 뉴스"**(조회수 순위)에 오른 후보가 있으면 먼저, 아니면 AI가 1건 고른다.
- 빼는 것(민감): 열애설·결별·이혼·불륜, 사건·사고·범죄·마약 논란, 투병·건강 악화, 폭로·악플.
  공식 결혼·열애 발표, 임신·출산, 자녀 이야기, 고인 추모, 성형·시술 고백은 허용(11/26 결정).
- 영화 분류는 리뷰·인터뷰·흥행 소식만. 최근 3일 올린 것과 같은 이야기, 바로 전 게시물과 같은 종류 소재는 뺀다.
- AI가 "올릴 만한 기사 없음"이라고 하면 그 칸은 비운다(애매하면 안 올리는 쪽).
- 평일엔 연예 기사가 하루 9~13건이라 충분하지만, 주말·월요일엔 하루 1건 정도라 0~1건만 올라간다(11/19~26 실측).

## 제목 규칙에서 특히 막는 것

- 기사 속 서로 다른 대상·조치를 한 문장으로 합치기(예: 내신 '퇴학' + 국가시험 '징역 5년' → "퇴학+징역 5년")
- 따옴표 안 발언을 바꿔 쓰기(줄이는 것만 허용) — 지시문으로 막고, 코드(`check_quotes`)가 따옴표 속 단어가 기사의 한 문장
  안에 다 있는지 검사해 없으면 따옴표를 뗀다(지어낸 말이 발언처럼 보이지 않게)
- 기사 제목·부제에 없는 본문 소재로 주제 바꾸기
- **한자** — 제목 글꼴(Pretendard)에 한자가 없어 네모로 깨진다. 지시문으로 막고, 코드(`no_hanja`)가 자주 쓰는 한자
  (李·靑·美·中 등)를 한글로 바꾸며, 그래도 남으면 그 기사를 실패 처리한다.

## 리소스 (계정 887078546492, us-east-1, 태그 6키 `Workload=instagram-seoul-economic`)

| 리소스 | 이름 |
|---|---|
| Lambda | `sedaily-instagram-seoul-economic` (python3.12, x86_64, 300초, 1024MB, 비동기 재시도 0) |
| IAM 역할 | `sedaily-instagram-seoul-economic-role` — `iam-policy.json` + 관리형 AWSLambdaBasicExecutionRole |
| EventBridge | `sedaily-instagram-seoul-economic-front` cron(0 21,22,23,3,5 * * ? *) 입력 {"kind":"front"} = 06·07·08·12·14시 KST / `sedaily-instagram-seoul-economic-ent` cron(0 1,7,10,12 * * ? *) 입력 {"kind":"ent"} = 10·16·19·21시 KST (+ Lambda 리소스 정책 `events-front`·`events-ent`). **처음엔 DISABLED** — 첫 게시를 사람이 확인한 뒤 켠다 |
| Bedrock 앱 프로필 | `seoul-economic-instagram-sonnet-5` (02pyphvnvieh) — `us.anthropic.claude-sonnet-5` 복사, 비용 태그용 |
| 토큰 | SSM SecureString `/sedaily-lens/instagram/token-seoul-economic` — "서울경제 LENS" 시스템 사용자 `seoul-economic-publisher`(ID 61596631964956, Employee, 만료 없음, instagram_basic·instagram_content_publish) |
| 게시 기록 | `s3://sedaily-mbti-cms-media-dev/instagram/seoul_economic_posted.json` |

Lambda 환경변수: `MODEL_ID`(앱 프로필 ARN). 나머지는 코드 기본값(`IG_USER_ID=17841401925138933`, `MAX_PER_DAY=5`).

## 배포·수동 실행

```bash
python pipelines/instagram_seoul_economic/build_zip.py
aws lambda update-function-code --function-name sedaily-instagram-seoul-economic \
  --zip-file fileb://pipelines/instagram_seoul_economic/build/function.zip --region us-east-1 --profile sedaily
# 만들기만(업로드·게시·기록 없음)
aws lambda invoke --function-name sedaily-instagram-seoul-economic --payload '{"dry_run": true}' \
  --cli-binary-format raw-in-base64-out --region us-east-1 --profile sedaily out.json
```

## 로고 파일

`sedaily-logo-white.png`는 sedaily.com이 쓰는 로고 두 개를 합친 것이다 — CSS 안의 "서울경제" 글자 SVG(검정 → 흰색)와
`static.sedaily.com/img/favicon-228.png`(파란 S). 공식 원본 파일을 받으면 같은 이름으로 바꾸면 된다.

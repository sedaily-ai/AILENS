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
| 로고·날짜 | 오른쪽 위 LENS, 제목 위 날짜 | 아래 가운데 S 아이콘 + 서울경제(높이 65px), 날짜 없음 |
| 사진 설명 | 원문 페이지 figcaption | XML `image` 의 caption 속성 |
| 알림 | Slack #03_lens-alarm | 보내지 않음(CloudWatch 로그만) |

같은 점: 1080×1350, 제목 2줄(1줄 흰색·2줄 파란색 (91,141,239)), 글자는 가운데 900px 안,
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

## 코주부(@co.ju.boo) 자동 게시 (평일 09·11·13·15·17시, 11/30 시작)

같은 Lambda·같은 카드(서울경제 로고 그대로)로 코주부 계정에도 올린다. EventBridge 규칙
`sedaily-instagram-seoul-economic-cojuboo` cron(0 0,2,4,6,8 ? * MON-FRI *) 입력 `{"kind":"cojuboo"}`, 하루 최대 5건 = 주식 3·부동산 1·코인 1(순서 주식→부동산→주식→코인→주식, 그 주제가 없으면 다른 주제로 채움). 1~5면 종합면 기사는 제외. 코드의 `COJUBOO_START`(2026-11-30) 전엔 게시하지 않는다.

- **후보:** 그날 지면(publishInfo/date = 오늘) 기사 중
  - 주식 = 분류 `증권,…` 이면서 지면 6면 이상(신문 뒤쪽 증권면 = Market-signal 지면에 가깝게. XML·e-Paper에 섹션 이름이 없어 면 번호로 근사)
  - 부동산 = 분류 `부동산,…`
  - 코인 = 분류 `블록체인,…` 또는 분류·제목에 코인·가상자산
  - 사진 600px 이상, 사진 설명이 그래픽·표·로고·캡처로 보이면 제외, **사진 설명이 빈 기사도 제외**(지면 그래픽은 설명이 빈 경우가 많음)
- **고르기(규칙):** 오늘 덜 올린 주제 → 바로 전 게시와 다른 주제 → 지면 앞쪽. 주식·부동산·코인이 섞인다.
- 서울경제(1면·연예)와 같은 기사가 나가도 된다(계정별로 중복을 따로 본다). 기록 키 `{날짜}_cojuboo`, 이미지 `media/instagram/seoul_economic/cojuboo/{날짜}/`.
- **권한 구조:** 코주부 계정은 별도 비즈니스 포트폴리오(인스타 로그인 신분이 전체 관리자)에 있고, 그 포트폴리오가 "서울경제 LENS"에
  콘텐츠 권한을 파트너 할당 → 시스템 사용자 `seoul-economic-publisher`에 co.ju.boo(콘텐츠) 배정. **토큰은 서울경제와 같은 것**
  (`/sedaily-lens/instagram/token-seoul-economic`). IG 사용자 ID `17841446436396009`(환경변수 `COJUBOO_IG_ID`로 바꿀 수 있음).
- 11/27 규칙을 평일(MON-FRI)로 바꿔 켬, 실제 첫 게시는 11/30(월) 09시(코드의 시작일 조건). 끄기: `aws events disable-rule --name sedaily-instagram-seoul-economic-cojuboo`.

## 숫자 규칙 (11/27, 1면·연예·코주부 공통)

AI가 지시를 어기고 기사에 없는 숫자를 만든 적이 있어(700조·2000조 → "3배") 프롬프트와 코드 둘 다로 막는다.

- **프롬프트:** 기사 숫자 그대로·단위 필수("3000억 원"), %와 %p 구분, 반올림하면 "약", 전망·목표를 확정처럼 쓰지 않기, 계산해 새 숫자 만들기 금지.
- **코드 대조(`copy_problems` → `missing_numbers`):** 카드 제목 2줄과 캡션 본문(출처·원문·해시태그 제외)의 숫자를 뽑아
  기사(제목·부제·본문·사진 설명)와 대조한다. 쉼표·띄어쓰기·전각은 무시하고 조·억·만·천을 값으로 바꿔 비교한다(3,000억 원 = 3000억).
  - %·%p·배는 기사에도 같은 단위여야 한다(1.2%P를 "1.2%"로 쓰면 불일치).
  - 날짜·서수(년·월·일·분기·차·호·위 등)는 숫자만 기사에 있으면 통과.
  - "약 72만 명"처럼 "약"이 붙으면 기사 숫자(72만6454)를 같은 자리에서 내림·반올림한 값까지 인정, "약" 없는 "73만명"은 불일치
    (기사 제목에 73만명이 따로 있으면 통과).
- 걸리면 문제 목록을 붙여 AI에 **1회 다시 쓰게** 하고, 그래도 걸리면 `CopyCheckError`로 그 기사를 실패 처리한다
  (`{키}_failed`에 기록, 다음 칸은 다음 기사).
- **코주부만:** 투자 권유 표현(매수·매도 권유, "지금 사야", "급등 예상", "추천 종목", "투자 기회" 등, `ADVICE_RE`)도 같은 방식으로 검사하고,
  캡션 "원문:" 줄 다음에 `※ 본 게시물은 투자 권유가 아닙니다.`를 고정으로 넣는다. "순매수·매도세" 같은 사실 서술은 걸리지 않는다.
- 프롬프트 첫 줄 기사 소개를 종류별로 바꾼다(1면 / 연예·영화 / 증권·부동산·코인). 11/27 전엔 코주부도 '연예·영화 기사'로 소개되던 버그가 있었다.
- 프롬프트는 `%` 포맷을 쓰므로 규칙 문구 안의 퍼센트 기호는 `%%`로 써야 한다.

## 제목 규칙에서 특히 막는 것

- 기사 속 서로 다른 대상·조치를 한 문장으로 합치기(예: 내신 '퇴학' + 국가시험 '징역 5년' → "퇴학+징역 5년")
- 따옴표 안 발언을 바꿔 쓰기(줄이는 것만 허용) — 두 줄에 걸친 따옴표도 이어서 검사(11/27) — 지시문으로 막고, 코드(`check_quotes`)가 따옴표 속 단어가 기사의 한 문장
  안에 다 있는지 검사해 없으면 따옴표를 뗀다(지어낸 말이 발언처럼 보이지 않게)
- 기사 제목·부제에 없는 본문 소재로 주제 바꾸기
- **한자** — 제목 글꼴(Pretendard)에 한자가 없어 네모로 깨진다. 지시문으로 막고, 코드(`no_hanja`)가 자주 쓰는 한자
  (李·靑·美·中 등)를 한글로 바꾸며, 그래도 남으면 그 기사를 실패 처리한다.

## 리소스 (계정 887078546492, us-east-1, 태그 6키 `Workload=instagram-seoul-economic`)

| 리소스 | 이름 |
|---|---|
| Lambda | `sedaily-instagram-seoul-economic` (python3.12, x86_64, 300초, 1024MB, 비동기 재시도 0) |
| IAM 역할 | `sedaily-instagram-seoul-economic-role` — `iam-policy.json` + 관리형 AWSLambdaBasicExecutionRole |
| EventBridge | `sedaily-instagram-seoul-economic-front` cron(0 21,22,23,3,5 * * ? *) 입력 {"kind":"front"} = 06·07·08·12·14시 KST / `sedaily-instagram-seoul-economic-ent` cron(0 1,7,10,12 * * ? *) 입력 {"kind":"ent"} = 10·16·19·21시 KST / `sedaily-instagram-seoul-economic-cojuboo` cron(0 0,2,4,6,8 ? * MON-FRI *) 입력 {"kind":"cojuboo"} = 평일 09·11·13·15·17시 KST (+ Lambda 리소스 정책 `events-front`·`events-ent`·`events-cojuboo`). 1면 11/26·연예 11/27 켬, 코주부는 11/27 켬(11/30부터 게시) |
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

## 직접 올리기 사이트 "서울경제 인스타 — 인스타 바로 게시" (11/27 배포)

**주소:** https://dokvadx52y5zlcpqcykjiewc5u0mqgzw.lambda-url.us-east-1.on.aws/ (공용 비밀번호는 SSM에만 — 문서에 적지 않는다)

기자가 고른 기사 링크를 붙여 넣고 채널을 고르면, 자동 게시와 같은 카드·캡션 규칙(숫자 대조·한자·따옴표 검사 포함)으로
만들어 **확인 없이 바로** 올리고, 카드·캡션·해시태그·게시물 링크와 그 채널의 최근 게시 목록을 보여 준다.
카드뉴스 사이트(AX-CONTENTS-LAB)는 최신 원본이 GitHub에 없어(서버엔 컴파일본만, 마지막 배포 8/10) 손대지 않고
**별도 사이트**로 둔다(같은 Lambda의 Function URL).

| 구성 | 내용 |
|---|---|
| 화면 | `page.html` (`GET /`, 누구나) — 공용 비밀번호를 한 번 넣으면 브라우저가 기억(localStorage) |
| 비밀번호 | 헤더 `X-Upload-Key` ↔ SSM SecureString `/sedaily-lens/instagram/upload-password`(5분 캐시). 틀리면 401 + 1초 지연 |
| 확인 | `GET /auth` → 200/401 |
| 올리기 | `POST /post` `{"url": "...", "channel": "seoul_economic"\|"co.ju.boo", "force": false}` → `post_url()` |
| 기록 | `GET /history?channel=...` → 그 채널 최근 30건 |
| 수동 호출 | `{"action": "post_url", "url": "...", "channel": "...", "dry_run": true}`, `{"action": "history", "channel": "..."}` |
| 자동 게시 | 그 밖의 이벤트 → `auto_post()` (front·ent·cojuboo 그대로) |

- 채널: 서울경제(@seoul_economic) · 코주부(@co.ju.boo) 연결됨, 어썸머니는 화면에 "연결 전"으로만 보이고 서버도 거절.
- 코주부로 올리면 프롬프트 라벨 "증권·부동산·코인", 투자 권유 금지 검사, 캡션 끝 면책 문구가 적용된다.
  서울경제는 분류가 연예·영화면 연예 말투, 아니면 1면 뉴스 제목체.
- 기록 키: 서울경제 `{날짜}_manual`, 코주부 `{날짜}_cojuboo_manual` — 자동 게시 하루 한도와 섞이지 않는다.
  중복은 **계정별**(서울경제 키끼리 / `_cojuboo` 들어간 키끼리)로 막는다(`force`로 허용).
- 링크 인식: `…sedaily.com/…/article/{번호}` (www·m·signal). 최근 4일 daily-xml에서 `key`로 찾고, 없으면 기사 페이지를
  직접 읽는다(og:title·og:image·부제·본문·figcaption).

배포 기록(11/27 11:24 KST):
1. SSM SecureString `/sedaily-lens/instagram/upload-password` 생성(태그 6키, Workload=instagram-seoul-economic).
   비밀번호 바꾸기: `aws ssm put-parameter --name /sedaily-lens/instagram/upload-password --type SecureString --overwrite --value '<새 값>'` → 5분 안에 반영.
2. IAM 인라인 정책 `instagram-seoul-economic` 갱신(upload-password GetParameter 추가).
3. Lambda 코드 교체 → 자동 게시 dry_run 3종(front·ent·cojuboo) 정상.
4. Function URL(AuthType NONE) + 리소스 정책 `function-url-public`(lambda:InvokeFunctionUrl, principal *).
   확인: `GET /` 200, `/history` 비밀번호 없음·틀림 401, 맞음 200(채널별 기록). `POST /post`는 실제 게시라 시험하지 않음.

되돌리기:
- 사이트만 닫기: `aws lambda delete-function-url-config --function-name sedaily-instagram-seoul-economic` (자동 게시는 그대로).
- 코드까지 되돌리기: 배포 직전 코드(CodeSha256 `sn5sNMyGKc3LxTBDTZ8fEEa0RgD8nytq67RmR9mqsXw=`, 브랜치 feat/instagram-seoul-economic a541543d)를
  그 브랜치에서 `build_zip.py`로 다시 묶어 `update-function-code`.

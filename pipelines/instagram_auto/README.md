# instagram_auto — 1면 웹툰 인스타그램 자동 게시

매일 08:00 KST, 그날 서울경제 1면 AI LENS 기사(보통 4~5건)를 인스타그램 `@lens.sedaily`에
**여러 장 게시물(캐러셀) 10장**으로 올리고 결과를 Slack `#03_lens-alarm`으로 보낸다.

| 순서 | 장 | 내용 |
|---|---|---|
| 1 | 표지 | 첫 컷을 흐리게 깐 바탕 + "AI LENS 웹툰" + 기사 제목 + "서울경제 1면 · 날짜" |
| 2~9 | 웹툰 8컷 | 사이트 웹툰 컷 그대로(WebP → JPEG) |
| 10 | 마무리 | "전체 기사는 AI LENS에서 / 읽기 · 보기 · 듣기 / ailens.sedaily.ai" |

캡션: 제목 + 웹툰 첫·마지막 컷 자막(이미 검수된 문장) + 안내 + 해시태그 5개. 인스타 캡션의 주소는
눌리지 않으므로 "프로필 링크"로 안내한다.

## 흐름

```
EventBridge sedaily-lens-instagram-webtoon-daily  cron(0 23 * * ? *) = 08:00 KST
  → Lambda sedaily-lens-instagram-webtoon
      1. GET ailens.sedaily.ai/api/v2/posts?channel=lens → paper_section="전체" & 오늘 날짜
      2. 기사마다 웹툰 8컷 내려받기 → 표지·마무리 합성(Pillow) → JPEG 10장
      3. S3 media/instagram/{날짜}/{기사번호}/NN.jpg 업로드 (media/* 는 버킷 정책상 공개 읽기 → 인스타가 가져감)
      4. 그래프 API: 컷마다 is_carousel_item 컨테이너 → CAROUSEL 컨테이너 → media_publish (기사 사이 60초)
      5. 게시 기록 s3://…/instagram/posted.json(비공개)에 기사 id → 링크 (같은 기사 재게시 방지)
      6. SNS ailens-ops-alerts → Amazon Q Developer → Slack #03_lens-alarm
```

컷이 8장 미만인 기사는 건너뛰고 알림에 이유를 남긴다. 한 기사가 실패해도 다음 기사는 계속한다.

## 리소스 (계정 887078546492, us-east-1, 태그 `Service=lens` 외 6키 `Workload=instagram-webtoon`)

이름 정본은 `config/resources.env`의 `INSTAGRAM_*` 값.

| 리소스 | 이름 |
|---|---|
| Lambda | `sedaily-lens-instagram-webtoon` (python3.12, x86_64, 900초, 1024MB) |
| IAM 역할 | `sedaily-lens-instagram-webtoon-role` — S3 `media/instagram/*` 쓰기, `instagram/*` 읽기·쓰기, SSM 토큰 읽기, SNS 발행만 |
| EventBridge 규칙 | `sedaily-lens-instagram-webtoon-daily` |
| SSM SecureString | `/sedaily-lens/instagram/token` |
| 게시 기록 | `s3://sedaily-mbti-cms-media-dev/instagram/posted.json` |
| Slack | 기존 `ailens-ops-alerts` 토픽 재사용(새 Slack 앱 설치 한도가 차서 Q Developer 경로) |

## Meta 쪽 설정 (2026-11-20)

- 개발자 앱 `LENS Webtoon Publisher`(앱 ID `1519370460032688`), 이용 사례 "Instagram에서 메시지 및 콘텐츠 관리",
  **통합 로그인(Unified login)** 구성 — 비즈니스 포트폴리오 "서울경제 LENS" 소속.
- 토큰: **시스템 사용자 액세스 토큰(만료 없음)**. 대시보드의 "토큰 생성"은 토큰을 화면에 보여주지 않는다 —
  리디렉션 URL(`https://ailens.sedaily.ai/`)을 등록하고 로그인 URL로 받은 `?code=`를
  `GET graph.facebook.com/v27.0/oauth/access_token?client_id&client_secret&redirect_uri&code`로 바꿔야 한다.
- 템플릿에 광고·댓글·메시지 권한이 묶여 있어 끌 수 없었다. 코드는 게시 API만 부른다.
- 이 토큰에는 **게시물 삭제 권한이 없다**(DELETE → `#10 Insufficient permissions`). 삭제는 인스타 앱에서 사람이 한다.
- 인스타 API 한도: 24시간에 게시 100개. 이미지는 JPEG만.

## 배포

```bash
python pipelines/instagram_auto/build_zip.py
aws lambda update-function-code --function-name sedaily-lens-instagram-webtoon \
  --zip-file fileb://pipelines/instagram_auto/build/function.zip --region us-east-1 --profile sedaily
```

## 수동 실행

```bash
# 미리보기(게시·업로드·알림 없음) — 로그에 기사별 결과
aws lambda invoke --function-name sedaily-lens-instagram-webtoon --payload '{"dry_run": true}' \
  --cli-binary-format raw-in-base64-out --region us-east-1 --profile sedaily out.json
# 특정 날짜의 n번째 1면 기사만 실제 게시
aws lambda invoke ... --payload '{"date": "2026-11-21", "only": 2}' ...
```

끄기: `aws events disable-rule --name sedaily-lens-instagram-webtoon-daily --region us-east-1 --profile sedaily`

## 알아둘 점

- 프로필 격자는 사진 가운데를 세로 3:4로 잘라 보여준다. 표지 글자는 그 안(`grid_safe_box`)에만 둔다
  (첫 게시 때 제목이 잘려 다시 올렸다).
- 08:00 이후 늦게 발행된 1면 기사는 그날 빠진다. 토요일은 1면이 없어 "1면 기사 없음" 알림만 간다.
- 토큰을 바꾸면 SSM 값만 덮어쓰면 된다(`put-parameter --overwrite`).

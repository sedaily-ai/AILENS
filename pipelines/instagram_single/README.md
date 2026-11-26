# instagram_single — 1면 기사 사진 카드 인스타그램 자동 게시

매일 09·12·15·18시 KST에 한 번씩, 그날 서울경제 1면 AI LENS 기사 1건을 인스타그램 `@lens.sedaily`에
**사진 1장 + 본문형 캡션**으로 올리고 결과를 Slack `#03_lens-alarm`으로 보낸다(하루 최대 4건).

서울경제 국문 채널(`@seoul_economic_daily` 등)의 단일 이미지 게시물 형식을 따른다. `@lens.sedaily`는
국문 채널로 넓히기 전 **시험 운영 채널**이라, 같은 1면 기사가 웹툰(`instagram_auto/`)과 겹쳐도 그대로 둔다.

| 요소 | 내용 |
|---|---|
| 이미지 | 1080×1350. 원문 대표 사진 + 아래쪽 어둡게 + 제목 위 날짜(예: 2026.11.24 (화)) + 제목 2줄(1줄 흰색, 2줄 파란색 (91,141,239) — 11/24~25엔 형광 연두였다가 11/26 되돌림) + 오른쪽 위 LENS 로고. 글자는 프로필 격자(3:4)에서 안 잘리게 가운데 900px 안 |
| 캡션 | 도입 2~3문장 → 📌 소제목 + 요점 ×2 → 마무리 → `사진=출처` → `원문: 서울경제신문` → 해시태그 |

말풍선·인물 누끼·스티커는 넣지 않는다(기본형).

## 흐름

```
EventBridge sedaily-lens-instagram-single-4x  cron(0 0,3,6,9 * * ? *) = 09·12·15·18시 KST
  → Lambda sedaily-lens-instagram-single  (한 번에 1건)
      1. GET ailens.sedaily.ai/api/v2/posts?channel=lens → paper_section="전체" & 오늘, display_order 순
         → 게시 기록·실패 기록에 없는 첫 기사
      2. 기사 상세의 photo_image_url(원문 사진) + 원문 페이지 figcaption(사진 설명·출처)
      3. Bedrock Claude Sonnet 5(converse, 사진 첨부): 제목 2줄 · focus_x(자를 가로 위치) · 캡션 · 해시태그 JSON
      4. Pillow로 이미지 합성 → S3 media/instagram/single/{날짜}/{기사번호}.jpg (공개 읽기)
      5. 그래프 API: 이미지 컨테이너 → media_publish
      6. 게시 기록 s3://…/instagram/single_posted.json(비공개)에 {날짜: [{id, link, at}]}
      7. SNS ailens-ops-alerts → Amazon Q Developer → Slack #03_lens-alarm
```

- 1면이 없는 날(주말 등)은 Slack 없이 끝낸다.
- 실패하면 Slack에 실패 알림을 보내고 그 기사를 `{날짜}_failed`에 넣어 다음 시간대엔 다음 기사로 넘어간다.
- 비동기 자동 재시도는 0회로 꺼 두었다(재시도로 같은 글이 두 번 올라가는 것을 막기 위해).

## 사진 자르기

1면 사진은 가로로 긴 단체 사진(예: 장관 후보자 5명, 1200×273)이 있다. 가운데를 자르면 제목 속 인물이 아닌
사람이 남는다. 그래서 원문 사진 설명(예: "강금실 …(왼쪽부터), … 홍익표 …")을 AI에 같이 주고,
**설명의 순서**로 주인공의 가로 위치(focus_x)를 받는다. 얼굴로 사람을 알아보게 하지 않는다.
위치를 모르면 제목에 사진에 없는 인물 이름을 넣지 않게 지시한다. 가로세로 2:1이 넘는 사진은 15% 더 당겨
옆 사람·사진 경계선을 뺀다.

## 리소스 (계정 887078546492, us-east-1, 태그 `Service=lens` 외 6키 `Workload=instagram-single`)

이름 정본은 `config/resources.env`의 `INSTAGRAM_SINGLE_*` 값.

| 리소스 | 이름 |
|---|---|
| Lambda | `sedaily-lens-instagram-single` (python3.12, x86_64, 300초, 1024MB, 비동기 재시도 0) |
| IAM 역할 | `sedaily-lens-instagram-single-role` — 권한은 `iam-policy.json` 그대로 |
| EventBridge 규칙 | `sedaily-lens-instagram-single-4x` (+ Lambda 리소스 정책 `events-4x`) |
| Bedrock 앱 프로필 | `lens-instagram-single-sonnet-5` — `us.anthropic.claude-sonnet-5` 복사, 비용 태그용 |
| SSM SecureString | `/sedaily-lens/instagram/token` (웹툰과 공용) |
| 게시 기록 | `s3://sedaily-mbti-cms-media-dev/instagram/single_posted.json` |

Lambda 환경변수: `MODEL_ID`(앱 프로필 ARN), `NOTIFY_TOPIC_ARN`, `MAX_PER_DAY=4`.

## 배포

```bash
python pipelines/instagram_single/build_zip.py
aws lambda update-function-code --function-name sedaily-lens-instagram-single \
  --zip-file fileb://pipelines/instagram_single/build/function.zip --region us-east-1 --profile sedaily
```

## 수동 실행

```bash
# 만들기만(업로드·게시·기록 없음) — 로그에 제목·캡션
aws lambda invoke --function-name sedaily-lens-instagram-single --payload '{"dry_run": true}' \
  --cli-binary-format raw-in-base64-out --region us-east-1 --profile sedaily out.json
# 다음 기사 1건 바로 게시(하루 4건을 넘기면 건너뜀)
aws lambda invoke --function-name sedaily-lens-instagram-single --payload '{}' ...
```

끄기: `aws events disable-rule --name sedaily-lens-instagram-single-4x --region us-east-1 --profile sedaily`

## 알아둘 점

- Sonnet 5는 답 전에 생각 토큰을 쓴다. `maxTokens`가 작으면(2000) 본문 없이 `max_tokens`로 끝나 12000으로 둔다.
- 캡션 사실은 LENS 레터(이미 발행된 내용)에서만 가져오게 지시한다. 사진 출처가 원문 설명에 없으면 `사진=` 줄을 뺀다.
- 토큰에는 삭제 권한이 없다. 잘못 올라간 게시물은 인스타 앱에서 사람이 지운다(`instagram_auto/README.md` 참고).
- 11/24 마케팅팀 피드백으로 글자 축소(격자에서 양옆 잘림 방지)·둘째 줄 형광 연두·제목 위 날짜를 반영했다.

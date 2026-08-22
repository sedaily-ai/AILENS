# AI LENS 런치 스프린트 — UTM 트래킹 플레이북

> 성과 발표회 직전 1주일 sprint. 지인 카톡 + SNS + 커피쿠폰 이벤트로 유입 → GA4 채널별 효과 측정.

---

## 0. UTM 규칙 (반드시 이대로 사용)

```
utm_source   = 어디서 왔는가 (kakao, instagram, twitter, youtube, invite, coffee_event)
utm_medium   = 어떤 형식 (referral, story, reels, bio, video, dm, promo)
utm_campaign = 어떤 캠페인 (launch_w1 = 런치 1주차)
utm_content  = (선택) 세부 변형 (어떤 게시물·어떤 친구·어떤 페르소나)
```

GA4 “트래픽 획득” 리포트에서 source/medium/campaign 단위로 자동 분류됨.

---

## 1. 채널별 기본 URL (복사해서 바로 사용)

### 📱 카카오톡

```
단톡방 / 1:1 일반 공유
https://mbti.sedaily.ai/?utm_source=kakao&utm_medium=referral&utm_campaign=launch_w1

카톡 공유에 페르소나 강조 (NF 하은 레터 푸시 시)
https://mbti.sedaily.ai/letters/nf-2026-05-23?utm_source=kakao&utm_medium=referral&utm_campaign=launch_w1&utm_content=letter_nf

사주 페이지 단독 공유
https://mbti.sedaily.ai/fortune?utm_source=kakao&utm_medium=referral&utm_campaign=launch_w1&utm_content=saju

짝꿍/궁합 페이지 (호기심 강함)
https://mbti.sedaily.ai/saju-match?utm_source=kakao&utm_medium=referral&utm_campaign=launch_w1&utm_content=match
```

### 📷 인스타그램

```
프로필 링크 (bio · 늘 노출)
https://mbti.sedaily.ai/?utm_source=instagram&utm_medium=bio&utm_campaign=launch_w1

스토리 스티커 링크
https://mbti.sedaily.ai/?utm_source=instagram&utm_medium=story&utm_campaign=launch_w1

릴스 / 피드 게시물 (캡션 또는 첫 댓글)
https://mbti.sedaily.ai/?utm_source=instagram&utm_medium=reels&utm_campaign=launch_w1
https://mbti.sedaily.ai/?utm_source=instagram&utm_medium=feed&utm_campaign=launch_w1

특정 게시물 식별 (게시물 ABC 분석할 때)
…&utm_content=post_2026-05-23_haeeun
…&utm_content=post_2026-05-24_saju
```

### 🐦 X / 트위터

```
https://mbti.sedaily.ai/?utm_source=twitter&utm_medium=social&utm_campaign=launch_w1
```

### 🎬 유튜브 (영상 설명란)

```
https://mbti.sedaily.ai/?utm_source=youtube&utm_medium=video&utm_campaign=launch_w1
```

### ✉️ 개인 초대 (지인 DM / 문자)

```
일반 초대
https://mbti.sedaily.ai/?utm_source=invite&utm_medium=dm&utm_campaign=launch_w1

특정 그룹 식별 (회사 동료 / 가족 / 대학동기)
…&utm_content=group_company
…&utm_content=group_family
…&utm_content=group_college
```

### ☕ 커피쿠폰 이벤트

```
이벤트 안내 페이지 어디서 보내든 동일 UTM
https://mbti.sedaily.ai/?utm_source=coffee_event&utm_medium=promo&utm_campaign=launch_w1

채널 분기 시 utm_content 로 (어디서 본 이벤트인가)
…&utm_content=kakao_post
…&utm_content=insta_story
…&utm_content=offline_qr   ← 사무실 QR 코드 부착 시
```

---

## 2. 채널별 메시지 템플릿 (예시 — 그대로 보내도 됨)

### 카톡 단톡방 공유

```
같은 뉴스를 네 사람의 시선으로 다시 본다는 게 신기해서 공유 🙋
AI 에디터 4명이 매일 한 통씩 보내주는 경제 뉴스 — 출근길에 1편만 봐도 충분.

https://mbti.sedaily.ai/?utm_source=kakao&utm_medium=referral&utm_campaign=launch_w1

생일 넣으면 사주 + 짝꿍 에디터도 풀어줘요 ㅋㅋ
```

### 인스타 스토리

```
스토리 텍스트:
"같은 뉴스, 네 가지 시선" — 출근길 1분 컷
링크 스티커: 위 instagram/story URL
```

### 인스타 피드 게시물 (캡션)

```
[캡션]
오늘 신문 안 본 사람 손 ✋
민철·하은·준서·소율 네 명의 AI 에디터가 같은 뉴스를 각자 결로 다시 써주는 곳.
프로필 링크에서 → 출근길에 1편만 봐도 충분.

#AI_LENS #서울경제 #경제뉴스 #출근길 #뉴스레터

[프로필 링크 = bio URL 사용]
```

### 커피쿠폰 이벤트 안내

```
☕ AI LENS 오픈 기념 이벤트
선착순 OO명에게 커피쿠폰 보내드려요.

참여 방법:
1. https://mbti.sedaily.ai/?utm_source=coffee_event&utm_medium=promo&utm_campaign=launch_w1 접속
2. 메인 페이지 하단 "메일 받기" 에 이메일 입력
3. 자동 응답 메일로 쿠폰 도착!
```

---

## 3. GA4 에서 결과 보는 법

### 발표회용 채널 비교 (가장 중요)

1. GA4 → 보고서 → 획득 → **트래픽 획득**
2. 차원: "세션 소스 / 매체" (기본값)
3. 측정항목 우측: 사용자, 세션, 참여 시간, 핵심 이벤트
4. 날짜 범위: 캠페인 시작일 ~ 발표회 직전일

이걸로 보여드릴 수 있는 슬라이드:
- “일주일간 OOO명, 그 중 카톡 N%, 인스타 N%, 쿠폰 이벤트 N%”
- 채널별 평균 체류 시간 비교

### 캠페인별 깊이 보기

1. 같은 리포트에서 "세션 캠페인" 으로 차원 변경
2. `launch_w1` 만 필터링
3. utm_content 별 비교 (어떤 인스타 게시물이 효과적이었는지)

### 핵심 행동 카운트 (이미 박은 5 이벤트)

GA4 → 보고서 → 참여도 → **이벤트** 에서 다음 이벤트 카운트 확인:
- `saju_calculate` (사주 푼 사람 수)
- `newsletter_subscribe` (구독 완료 수)
- `letter_complete` (레터 완독 수)
- `editor_swap` (에디터 갈아탄 수)
- `compat_input` (짝꿍 위젯 입력 수)

이 카운트들을 캠페인 차원과 cross-tab 해서 “**카톡으로 온 N명 중 OO명이 사주를 풀어봄**” 같은 funnel 수치 추출 가능.

---

## 4. 일자별 운영 체크리스트

| D-day | 액션 | 측정 시점 |
|---|---|---|
| D-7 (오늘) | UTM 링크 세트 확정, SNS 콘텐츠 초안 작성 | — |
| D-6 ~ D-5 | 가까운 지인 카톡 1:1 공유 (소규모 테스트) | 다음날 |
| D-4 | 인스타 프로필 bio 링크 박기 | — |
| D-3 | 인스타 피드 게시물 1, 스토리 1 | 다음날 |
| D-2 | 단톡방 5~10곳 공유 + 커피쿠폰 이벤트 시작 | 다음날 |
| D-1 | 인스타 릴스 1편 + 마지막 푸시 | 당일 |
| D-day | 발표회 직전 GA4 캡쳐 / 슬라이드 정리 | — |

---

## 5. 발표회 슬라이드 핵심 숫자 5개 (이 5개만 명확히)

1. **누적 방문자 수** — “1주일간 N명 방문”
2. **활성 사용자** — “사주 입력 N명 / 챗봇 사용 N명 / 뉴스레터 구독 N명”
3. **평균 체류 시간** — “한 사람당 평균 N분 머묾”
4. **채널 분포** — “지인 N% / SNS N% / 직접 N% / 쿠폰 N%”
5. **레터 완독률** — “letter_complete ÷ 레터 페이지 방문 수”

---

## 6. 참고 — 메일 발송 추적은 자동

뉴스레터 메일 본문의 모든 링크는 자동으로 UTM 태깅됨 (`utm_source=newsletter`).
별도 작업 불필요. SES Configuration Set `ailens-newsletter`로 오픈/클릭도 CloudWatch에 누적.

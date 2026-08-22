# 2026-08-22 video 파이프라인 각본 생성 — GPT-4o에서 Bedrock Claude로 이관

작성: 영광 + Claude Code
관련: `pipelines/video/generate_script.py`, `pipelines/common/bedrock_client.py`
(신설), `pipelines/common/openai_client.py`

## 배경

"동영상 자동화는 안되었네용.." — 전날(8/21) 지면1면 자동화 첫 실행에서
5건 중 4건이 영상 생성에 실패했던 것(§ `2026-08-22-frontpage-auto-first-
run-timezone-bug.md`)을 다시 들여다보는 과정에서, 실패 원인이 원문에
수치가 진짜 없어서가 아니라 GPT가 정성적 문장에 `stat`(숫자 하나) 컷
타입을 잘못 배정한 실수였다는 걸 확인했다. 이걸 고치는 김에, 사용자가
"GPT는 이미지 생성(webtoon) 전용으로만 쓰기로 한다"는 정책을 정하면서
video 각본 생성도 이번에 Bedrock Claude로 옮기게 됐다.

## 한 것

### 1. stat/chart 컷 타입 오배정 — 1회 재요청으로 자동 복구

`generate_script.py`의 `validate_script()` 실패 시, 에러 내용+원문+틀린
JSON을 다시 GPT에 보내 "원문에 실제 수치가 있으면 채우고, 없는 정성적
내용이면 stat/chart 대신 highlight로 바꿔라 — 지어내지 말라"고 재요청하는
로직 추가. 실제 실패 기사 2건(현대차 파업, 카카오 분할)으로 검증 — 현대차는
원문에 있던 진짜 수치("10년 만의 전면 파업")로 재시도 성공, 카카오는
재시도 자체가 실패해도 원래 에러로 안전하게 폴백(지어내는 방향으로 안 샘).

### 2. bedrock_client.py 신설 — video 각본 생성을 Bedrock Claude로

`pipelines/common/bedrock_client.py` 신설, `openai_client.call_text()`와
동일한 시그니처로 만들어 `generate_script.py`의 import 한 줄만 바꾸면
되게 함. 전용 application inference profile `mbti-video-sonnet-46`
(Sonnet 4.6, `arn:...application-inference-profile/yeypch70w7ej`, Service=mbti·
Workload=video-script 태그 — 기존 `mbti-sonnet-46`은 Workload=chatbot이라
재사용하면 비용 추적이 섞임)을 새로 만들어 씀. `frontpage_auto/task-policy.json`에
이 프로파일 + 밑에 깔린 cross-region 시스템 프로파일 + 리전별 foundation
model 3개에 대한 `bedrock:InvokeModel` 권한 추가.

같은 기사 3건(현대차/카카오/교육교부금)으로 GPT 대비 비교 검증 —
stat 컷 오배정이 재요청 없이 1회 통과로 거의 사라짐. 대신 Claude는
문자열 안에 따옴표를 이스케이프 없이 쓰는 새 실패 유형이 있어(JSON
파싱 자체가 깨짐) 여기에도 별도 "형식만 고쳐서 다시" 재요청을 추가.

컨테이너 재빌드·재배포 완료, 실제 Fargate에서 새 이미지로 정상 실행
확인(exit 0) — 다만 이날 실행에선 오늘 지면1면 5건이 전부 이미 발행된
상태라 영상 생성 코드 경로 자체는 타지 않았음(IAM 권한은
`simulate-principal-policy`로 별도 확인).

### 3. mustknow_auto 개발 중 발견된 추가 버그 2건 (같은 bedrock_client.py)

이후 같은 날 `mustknow_auto` 파이프라인을 Sonnet 5로 처음 호출하면서
`bedrock_client.py`의 숨은 버그 2개를 더 찾아 고침(§
`2026-08-22-mustknow-auto-pipeline.md` 참고):
- `temperature`가 Sonnet 5에서 deprecated라 ValidationException — 기본값을
  0.7 고정에서 `None`(명시적으로 넘겼을 때만 포함)으로 변경
- 긴 프롬프트에서 응답 content 블록이 `[추론 블록, text 블록]` 순서로
  와서 `content[0]["text"]`가 KeyError — 인덱스 0을 가정하지 않고
  `text` 키를 가진 첫 블록을 찾도록 수정

두 수정 다 video(Sonnet 4.6) 쪽도 재검증해서 회귀 없음 확인.

## 결정

- GPT는 webtoon 이미지 생성 전용으로만 쓴다. letters/podcast는 아직 GPT
  텍스트 생성을 그대로 씀(이번 이관 범위 밖 — video만 우선 옮김).
- bedrock_client.py는 이제 video·mustknow_auto 두 파이프라인이 공유하는
  진짜 공용 모듈이 됐다. 앞으로 Bedrock 모델을 하나 더 붙일 때 여기서
  겪은 3가지 함정(temperature 지원 모델별 상이, content 블록 순서
  가정 금지, 추론 오버헤드로 인한 응답 지연)을 다시 겪지 않도록 이
  파일의 docstring에 전부 남겨뒀다.

## 다음

- letters/podcast도 GPT→Bedrock 이관할지는 별도 논의 필요(이번 세션
  범위 밖으로 명시적으로 남겨둠).

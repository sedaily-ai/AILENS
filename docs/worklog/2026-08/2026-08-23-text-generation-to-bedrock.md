# 2026-08-23 letters/podcast/webtoon 텍스트 생성 GPT → Bedrock 이관

작성: Claude Code
관련: pipelines/letters, pipelines/podcast, pipelines/webtoon, pipelines/common

## 배경

video 각본 생성은 이미 2026-08-22에 GPT에서 Bedrock Claude로 옮겨져
있었는데, letters(레터 본문)·podcast(대본)·webtoon(1·2단계 스크립트/
장면연출)은 여전히 GPT-4o를 쓰고 있었다. 사용자가 "텍스트는 전부
Bedrock, 이미지만 GPT 아니었나요?"라고 지적 — 실제로는 그렇게 안
돼있었던 걸 확인하고 통일하기로 함. 마침 이 시점에 OpenAI API 크레딧이
소진돼 레터 생성이 막혀있던 상태였는데(별도 장애, `docs/worklog/2026-08/
2026-08-23-mbti-to-lens-pipeline-rename.md` 참조), 이번 이관으로 이미지
생성 빼고는 그 장애를 우회하게 됐다.

## 한 것

- Bedrock inference profile 3개 신설 (각 파이프라인 비용 추적 분리,
  전부 Sonnet 4.6, `Sedaily-LENS`/`lens` 태그):
  - `lens-letters-sonnet-46` (application-inference-profile/nrr81xvevv5k)
  - `lens-podcast-sonnet-46` (application-inference-profile/kmkagk616y1c)
  - `lens-webtoon-script-sonnet-46` (application-inference-profile/yirjajon82n7)
- `pipelines/letters/pipeline.py`, `pipelines/podcast/pipeline.py`:
  `openai_client.call_text` → `bedrock_client.call_text`로 교체, 위 전용
  프로파일을 `model=`로 명시.
- `pipelines/webtoon/pipeline.py`: 1·2단계(스크립트/장면연출)만 이관,
  3단계(실제 컷 이미지 생성)는 그대로 GPT(`gpt-5.5`, Responses API
  `image_generation` 툴) 유지 — Bedrock엔 대응 기능이 없음. OpenAI의
  `response_format=json_object`(JSON 강제) 대응 기능이 Bedrock converse
  API엔 없어서, 프롬프트에 "```json 코드블록 하나로만 응답" 지침을
  추가하고 `video/generate_script.py`와 같은 방식(`extract_json_block`
  패턴)으로 파싱하는 `_extract_json_block`을 새로 작성.
- `pipelines/common/openai_client.py`: 이제 아무 데서도 안 쓰는
  `call_text()` 삭제 — 이제 이 모듈은 webtoon 이미지 생성 전용.
- `pipelines/frontpage_auto/task-policy.json`,
  `pipelines/mustknow_auto/task-policy.json`: 새 프로파일 3개에 대한
  `bedrock:InvokeModel` 권한(`TextGenBedrockInvoke` 문) 추가, 라이브 IAM
  역할(`sedaily-lens-frontpage-auto-task-role`,
  `sedaily-lens-mustknow-auto-task-role`)에도 반영.
- 로컬에서 `AWS_PROFILE=yeonggwang`으로 세 파이프라인 전부 실제 Bedrock
  호출 검증 — letters(레터 정상 생성), podcast(대본 생성 + ElevenLabs
  TTS까지 정상), webtoon(1단계 스크립트 JSON 파싱 정상, 8컷 확인).
- 공유 이미지 재빌드·ECR push·`sedaily-lens-frontpage-auto` 태스크정의
  리비전 3 등록 완료.

## 결정

- webtoon 이미지 생성은 GPT에 남긴다 — Bedrock/Claude 계열에 대응하는
  이미지 생성 기능이 없어서(Nova Canvas 등 대안은 이번 스코프 밖,
  필요하면 별도 검토).
- 파이프라인마다 전용 inference profile을 새로 만든다(공용 프로파일
  재사용 안 함) — 이 프로젝트 전체에서 이미 확립된 관례(video/mustknow도
  각자 전용 프로파일)로, Bedrock 비용을 워크로드 단위로 추적하기 위함.

## 다음

- 다음 실제 Fargate 실행(오늘 15:00 KST 스케줄)에서 레터·팟캐스트가
  Bedrock으로 정상 발행되는지 확인 — 이미 별도로 모니터링 중.
- 웹툰까지 포함한 4/4 포맷 완주는 OpenAI 크레딧 충전 후에나 확인 가능
  (이미지 생성 단계만 여전히 그 계정에 의존).

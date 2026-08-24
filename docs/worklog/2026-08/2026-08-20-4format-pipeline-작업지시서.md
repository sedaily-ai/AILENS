# 작업 지시서 — AILENS 4포맷 자동 생성 파이프라인 구축

날짜: August 20, 2026 → August 21, 2026
담당자: 이민서
상태: 시작 전
카테고리: ailens

1. 목표

기사 원문 1건을 입력하면, 사람 개입 없이 레터·웹툰·팟캐스트·영상 4개 포맷을 자동 생성하고 사실 커버리지를 검증까지 하는 파이프라인 구축. 현재 하루 2건 수동 발행 → 10월 목표 하루 50~100건.

기사 원문
↓
[0단계] 사실 추출 → facts.json
↓
├─→ 웹툰 → script.json → scenes.json → GPT 이미지 ×8
├─→ 레터 → [letter.md](http://letter.md/)
├─→ 팟캐스트 → podcast.txt → TTS
└─→ 영상 → video.json → Remotion
↓
[검증] facts.json 대비 커버리지 확인

1. 이미 있는 것 (재사용하면 됨)

프롬프트 원본 8개 문서
2_ailens/마스터DB/03_개발·프롬프트/4포맷_파이프라인/ — 00_CONTEXT.md(맥락·절대원칙) ~ 07_VERIFY.md(검증 기준). 0단계 사실추출 프롬프트(02_EXTRACT.md), 4포맷 각각의 프롬프트(03_LETTER~`06_WEBTOON), 검증 프롬프트(07_VERIFY`)가 전부 여기 있음.

프롬프트 DB (실제 편집·운영 버전)
DynamoDB sedaily-mbti-admin-prompts-dev, 키 PROMPT#<category>/<scope> (category=letters/webtoon/podcast/video, scope=draft/published). 읽는 코드: service/backend/services/prompt_loader.py의 load_prompt(category, name) — 5분 캐시, DDB 장애 시 service/backend/prompts/<category>/<name>.md 파일로 자동 폴백.

웹툰 이미지 생성 — 이미 검증 완료
2_ailens/마스터DB/03_개발·프롬프트/뉴스웹툰_파이프라인/([pipeline.py](http://pipeline.py/), [prompts.py](http://prompts.py/)). 1단계 스크립트(GPT-4o) → 2단계 장면연출(GPT-4o) → 3단계 이미지(Responses API, model gpt-5.5, image_generation 툴, 1024x1536). 실제 지면 기사 20건으로 이미 검증됨(README 기록). 어제 이 파이프라인 그대로 재사용해서 실제 기사로 8컷 다시 생성 성공.

LLMOps 테스트 실행 API
POST /admin/prompts/{category}/{name}/test (base: [https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev](https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev), JWT 인증 필요) — {content, article} 넘기면 GPT-4o가 그 프롬프트로 산출물을 즉시 반환. 지금은 admin 프롬프트 드로어의 "테스트 실행" 버튼과 /lens/edit의 "AI로 생성" 버튼이 이걸 쓴다. 자동 파이프라인의 텍스트 생성 단계는 이 엔드포인트 로직(admin/backend/routes/prompts.py의 handle_test/_call_openai)을 그대로 서버-투-서버로 재사용하면 됨.

OpenAI 키
Secrets Manager sedaily-mbti/openai-api-key (us-east-1, 계정 887078546492), JSON {"OPENAI_API_KEY": "..."}.

lens 콘텐츠 저장 구조
CmsLensItem에 포맷별 필드 이미 추가됨 — paragraphs(레터), images(웹툰, {url, caption}[]), video_url(영상), media_url(팟캐스트). 타입: admin/frontend/src/lib/types.ts, service/frontend/src/shared/lib/api/cmsPostsApi.ts. 공개 API 응답 조립: service/backend/handlers/cms_posts_public.py의 _shape_lens.

팟캐스트 음성 — 임시로 동작 확인
ElevenLabs 대신 AWS Polly(한국어 Seoyeon, generative 엔진)로 실제 mp3 생성 테스트 완료 — 별도 키 없이 바로 됨. 정식 채택은 미정(아래 5번 참고).

1. 없는 것 — 이번에 만들어야 할 것
- 0단계 사실추출 자동화: 02_EXTRACT.md 프롬프트로 기사 → facts.json 생성하는 실제 호출부. 지금은 존재하지 않음(수동 생성 테스트할 때도 이 단계를 건너뛰고 원문을 각 포맷 프롬프트에 바로 넣었음).
- 오케스트레이션: 기사 1건 입력 → 0단계 → 4포맷 병렬 생성 → 07_VERIFY 검증 → CMS 발행까지 잇는 실제 파이프라인 코드. 지금은 admin이 /lens/edit에서 포맷별로 수동으로 "AI로 생성" 누르고 결과를 손으로 다듬어 저장하는 반자동 흐름뿐.
- 영상 렌더링(Remotion): 전혀 안 붙어 있음. 05_VIDEO.md가 정의하는 JSON(cuts, type별 data 스키마)까지만 생성 가능, 실제 영상 파일로 렌더링하는 부분은 처음부터 구축 필요.
- 팟캐스트 TTS 정식 연동: ElevenLabs든 Polly든 결정 후 파이프라인에 실제로 붙이는 작업.
- facts.json 커버리지 검증 자동화: 07_VERIFY.md 프롬프트로 "core 사실이 최소 2개 포맷에 있는가"를 자동 체크하는 부분.
1. 아직 결정 안 된 것 — 작업 시작 전 확인 필요

┌────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
│      항목      │                                      상태                                       │

┌────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
│      항목      │                                      상태                                       │
├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ ElevenLabs 키  │ Secrets Manager에 후보 2개(ElevenLabs/ApiKey, ai-labs/elevenlabs) — 둘 다       │
│                │ 설명·태그 없어 이 프로젝트 소유인지 미확인. Polly로 계속 갈지 결정 필요         │
├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 레터 분량 미달 │ 프롬프트에 "2000~2800자 반드시 지킨다" 강제 문구를 넣었는데도 GPT-4o가 1000자   │
│                │ 안팎으로 짧게 냄 — 미해결. max_tokens/few-shot 예시 보강 등 추가 튜닝 필요      │
├────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ 웹툰 실제 상호 │ "실제 로고·상표 금지" 지시에도 배경 간판에 실존 브랜드명(예: 성심당)이 그대로   │
│  노출          │ 렌더된 사례 확인 — 발행 전 육안 검수 절차 또는 프롬프트 추가 제약 필요          │
└────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

1. 참고할 때 순서 제안
2. 00_CONTEXT.md → 01_COMMON.md 먼저 읽고 전체 그림 파악
3. 뉴스웹툰_파이프라인/pipeline.py 읽고 "0단계 없이 단발 호출" 패턴부터 이해(이미 동작하는 코드라 가장 빠른 참고점)
4. 02_EXTRACT.md로 0단계 붙이기
5. 나머지 3포맷(레터/팟캐스트/영상)을 웹툰과 같은 구조로 확장
6. 07_VERIFY.md로 검증 단계 마무리

필요하면 docs/worklog/2026-08/2026-08-20-4format-prompt-pipeline-and-lens-editor.md에 오늘 작업 경위가 더 자세히 적혀 있습니다.
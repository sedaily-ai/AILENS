# 2026-08-23 video TTS를 ElevenLabs로 전환 + mustknow_auto 실가동 시작

작성: Claude Code
관련: pipelines/video, pipelines/mustknow_auto, pipelines/frontpage_auto,
docs/worklog/2026-08/2026-08-22-mustknow-auto-pipeline.md,
docs/worklog/2026-08/2026-08-22-video-bedrock-migration.md

## 배경

전날(2026-08-22) Bedrock Connect timeout을 LENS 전용 VPC 엔드포인트로
해결해 Fargate에서 지면1면 기사 하나가 letters→podcast→webtoon→
video-script까지는 성공했지만, **영상 렌더링**(TTS 단계)이 실패했다.
원인은 `pipelines/video`가 Google Cloud TTS(Chirp3-HD)를 쓰는데, 로컬
개인 gcloud OAuth(ADC)로 인증하는 방식이라 Fargate 컨테이너엔 그 인증이
없었기 때문. 처음엔 전용 GCP 서비스 계정을 새로 만들려 했으나, 사용자가
"저희 AWS 쓰는거 아닌가요? TTS는 지금 사용 안 하는데?"라고 지적 —
팟캐스트가 이미 ElevenLabs로 검증돼 있는데 영상만 별도 GCP 벤더를 쓸
이유가 없다는 게 맞아서, video의 TTS 자체를 ElevenLabs로 바꾸는 쪽으로
방향을 틀었다.

## 한 것

- `pipelines/video/src/lib/tts.ts`: `@google-cloud/text-to-speech` 제거,
  ElevenLabs REST API(`fetch`) + `@aws-sdk/client-secrets-manager`로 교체.
  팟캐스트(`pipelines/podcast/pipeline.py`)와 동일 보이스
  (`8lidWTlnwgjObqCImnE2` — Juan, eleven_multilingual_v2) 재사용. 새
  IAM/Secrets 설정 불필요 — `ElevenLabs/ApiKey` 시크릿과 태스크 IAM 권한이
  frontpage_auto·mustknow_auto 둘 다 이미 갖고 있었음.
- `pipelines/video/src/lib/ssml.ts` 삭제, `resolveAudio.ts`가 narration
  평문을 그대로 TTS에 넘기도록 변경 — ElevenLabs는 임의 SSML `<break>`를
  지원하지 않고, 팟캐스트도 평문만 보내서 이미 검증됨. 실제 오디오 길이는
  합성 후 mp3 메타데이터로 측정하는 구조라(스키마상 duration은 참고값)
  break 태그를 없애도 영상 타이밍 로직엔 영향 없음.
- `pipelines/video/scripts/list-voices.ts` 삭제(Google 전용 보이스 목록
  조회 스크립트, ElevenLabs 전환 후 의미 없음). `package.json`의
  `tts:voices` 스크립트도 같이 제거.
- `npx tsc --noEmit` 통과 확인 후 커밋(`c7d87c9`).
- `frontpage_auto/deploy.sh`로 공유 이미지 재빌드·ECR push·태스크 정의
  재등록(frontpage_auto revision 5) — mustknow_auto도 같은 이미지를 씀.
- Fargate에서 `mustknow_auto` 실행 1회(`run-task`) — 정상 종료(exit 0),
  오늘(20260823) 신규 후보 11건 채점, 임계값 넘긴 기사가 없어 발행 0건
  (영상 단계까지는 못 감 — 정상 동작, TTS 검증은 아님).
- TTS 자체는 로컬에서 실제 코드 경로로 별도 검증: `npm run tts:resolve`로
  테스트 스크립트 1건 합성 → Secrets Manager에서 키 정상 조회, ElevenLabs
  API 정상 응답, 3.37초 유효 MP3 파일 생성 확인.
- EventBridge 규칙 `sedaily-mbti-mustknow-auto-6x-daily`를 `enable-rule`로
  활성화 — **mustknow_auto가 오늘부터 실제로 하루 6회(08/12/15/18/21/23시
  KST) 자동 실행됨.**

## 결정

- 영상 TTS 벤더를 GCP에서 ElevenLabs로 완전히 바꿈(대안이었던 "전용 GCP
  서비스 계정 신설"은 폐기) — 이 프로젝트가 기본적으로 AWS 위주고, 이미
  검증된 벤더를 재사용하는 게 인프라도 안 늘고 인증 만료 문제도 없앰.

## 다음

- 다음 실제 발행 건(영상까지 포함하는 기사)이 나오면 4/4 포맷이 끝까지
  정상 생성되는지 확인 — 오늘 실행에선 발행 자체가 없어서 TTS 코드는
  검증했지만 실제 파이프라인 안에서 영상까지 도는 end-to-end는 아직 미확인.
  다음 스케줄 실행(오늘 12시 KST~) 로그를 확인할 것.
- 실가동 시작이므로 며칠간 발행 건수·탭별 분포를 관찰해 임계값(전체 4건,
  증권/산업/시그널 ≥8.0 탭당 4건, 일반 ≥7.0 무제한) 조정 필요 여부 판단.

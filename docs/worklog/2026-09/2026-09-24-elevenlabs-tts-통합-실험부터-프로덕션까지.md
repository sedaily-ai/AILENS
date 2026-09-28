# ElevenLabs TTS 통합 — 실험 패널부터 팟캐·영상 발행까지 (2026-09-24)

## 문제 발견

- "음성도 ElevenLabs 모델을 선택할 수 있게" 요청 — 기존엔 CMS 실험 패널이 Polly 전용이고, 2026-08-27 비용 사유로 발행 파이프라인도 Polly로 이미 전환돼 있던 상태
- 조사 착수 시점에 기존 Secrets Manager ElevenLabs 키 2개 모두 401(무효) 확인

## 문제 정의

- 신규 키 재발급(tier=creator) 후에도 실사용 가능한 보이스·모델·파라미터 스키마가 코드 어디에도 정의돼 있지 않음 — API를 직접 조회해 확정해야 하는 상태
- `GET /v1/voices/{id}/settings` 조회 결과 실제 파라미터는 stability/similarity_boost/style/use_speaker_boost/speed 5개뿐이고, pitch는 존재하지 않는 파라미터(boundary 테스트로 무응답 무시 확인, 400도 없음)
- 모델별 지원 파라미터가 상이(`can_use_style`/`can_use_speaker_boost`) — 일괄 노출 시 미지원 모델에서 안 먹는 설정을 보여주게 됨
- Polly는 성우·엔진·속도·음량까지 조절 가능한데 ElevenLabs 실험 패널 초안은 성우·모델뿐 — 대칭이 안 맞음
- "성우 미리듣기"/"영상 생성"이 독립된 위/아래 목록이라, 각본 텍스트를 두 번 따로 입력해야 함

## 왜 그렇게 했는지

- 성우 262개 전량 노출 대신 팟캐스트 톤에 맞는 8개(남/여 각 4)만 큐레이션 — 실시간 API 호출 없이 미리듣기 샘플을 S3에 사전 업로드해 드롭다운 응답성 확보
- 모델 5개 중 `eleven_storytel_v2`(설명에 파트너 전용 명시)·`eleven_flash_v2_5`(turbo와 용도 중복)를 제외하고 3개만 노출 — 안 쓸 옵션을 보여주지 않음
- pitch는 UI에 아예 안 넣음 — 미작동 설정 노출은 사용자 기만이라는 이 세션 반복 원칙
- Python(`elevenlabs_tts.py`)과 Node(`tts.ts`)에 각각 구현하되 REST 요청 모양(엔드포인트·바디·헤더)을 의도적으로 동일하게 작성 — "동일한 부분은 동일하게" 원칙
- 설정 대칭화는 컴포넌트 복붙 대신 `ElevenLabsVoiceSettingsFields.tsx` 공유 컴포넌트 신설로 팟캐/영상 양쪽에 동일 적용
- 카드 통합은 새 입력 컴포넌트를 만드는 대신 `extractNarration()`으로 렌더용 JSON의 `cuts[].narration`을 자동 추출 — 입력창 1개로 성우 미리듣기+영상 생성을 동시 처리

## 어떻게 달라졌는지

| | 이전 | 이후 |
|---|---|---|
| TTS 제공자 | Polly 고정 | Polly/ElevenLabs 카드별 전환, 생성 시점 설정을 배지로 고정(A/B 비교 가능) |
| 노출 모델 | — | 3종(multilingual_v2/v3/turbo_v2_5), 실사용 262보이스 중 8종 큐레이션 |
| 파라미터 대칭 | Polly만 세부 조절(성우/엔진/속도/음량) | ElevenLabs도 5개 슬라이더(stability 등) 동일 지원 |
| 팟캐 발행 경로 | Polly 고정 | `podcast_voice.py` PROVIDER 분기, task role에 `secretsmanager:GetSecretValue`(ai-labs/elevenlabs) 추가 |
| 영상 발행 경로 | Polly 고정, 환경변수 조립이 진입점 2곳(`render_from_script.py`/`publish_utils.py`)에 중복 | `video_settings.py::get_render_env()`로 통합, `tts.ts`에 ElevenLabs 분기 추가 |
| 성우 미리듣기/영상 생성 | 독립된 2개 목록, 입력 2번 | `VideoCardGenerator.tsx` 단일 카드로 병합, 입력 1번 |

## 버그 — 타임아웃

- 실사용 중 "음성 합성 실패: The read operation timed out" 발생
- 원인: `elevenlabs_tts.py`의 `urllib.request.urlopen(timeout=30)` — 9컷 통합 나레이션(~600자) 합성에 30초 부족(CloudWatch 트레이스백으로 확인)
- admin Lambda 자체 타임아웃(900초) 여유를 확인한 뒤 텍스트를 자르는 대신 타임아웃을 30초→300초(5분)로 상향 — 각본 전체 미리듣기 유용성을 우선하고, Lambda 타임아웃 여유가 커 비용·성능 부담 없다고 판단

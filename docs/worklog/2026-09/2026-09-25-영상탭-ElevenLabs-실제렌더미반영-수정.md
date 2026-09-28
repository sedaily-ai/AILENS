# 영상 탭 카드에서 고른 ElevenLabs가 실제 렌더에 반영되지 않던 문제 수정 (2026-09-25)

## 문제 발견

- 사용자 리포트: "일레븐 랩스를 선택하고 영상을 생성했는데... 음성 부분은 따로 일레븐 랩스로 생성이 되었거든요? 근데, 영상에 담긴거는 polly 음성이 선택이 되어서 나왔네요"

## 문제 정의

- `VideoCardGenerator.tsx`의 "생성" 버튼 하나가 `synthesize_audio`(성우 미리듣기)·`render_video`(실제 영상) 두 WS 요청을 같이 보내는데, `synthesize_audio`만 카드의 `provider`/`voice_id`/`model_id`/`voice_settings`를 실어 보내고 `render_video`는 `{text, slot_id}`뿐이었음
- `chat_ws.py::_run_render_video_flow`도 이 값을 받는 파라미터 자체가 없어 항상 `video_settings.get_render_settings()`로 CMS에 **발행된** 프로덕션 설정만 읽었음 — 카드에서 무엇을 고르든 실제 렌더는 그 선택과 무관했음
- `_run_synthesize_audio_flow`의 기존 주석에 이 비대칭이 그대로 문서화돼 있었음: "이건 저장되는 설정이 아니라 이 한 번의 슬롯 생성에만 쓰이는 값이고, 실제 발행 파이프라인(video 렌더)은 이 분기를 아예 모른다(2026-08-27 비용 결정 유지)" — 의도된 설계였으나, 어제 두 카드(미리듣기+영상)를 하나로 합치면서 provider 토글이 하나로 보이게 돼 사용자 기대와 어긋났음

## 왜 그렇게 했는지

- 두 가지 선택지(①카드 선택을 실제 렌더에도 반영 ②미리듣기 전용임을 UI로 안내)를 사용자에게 제시 — "카드 선택대로 실제 영상도 렌더"를 선택받아 그 방향으로 구현
- `video_settings.get_render_settings()`/`get_render_env()`에 `override` 인자를 추가해 발행값 위에 None이 아닌 키만 덮어쓰는 방식 채택 — 자동 발행 파이프라인(`publish_utils.py::generate_video()`)은 override를 안 넘기므로 이 변경과 완전히 무관, 발행 설정 그대로 동작
- `render_from_script.py`에 `--settings-override`(JSON 문자열) CLI 인자 추가 — ECS `containerOverrides.command`는 셸을 안 거치는 배열이라 JSON을 그대로 인자 하나로 안전하게 전달 가능
- `_run_render_video_flow`가 `synthesize_audio`와 같은 파라미터(provider/voice_id/model_id/voice_settings/polly_settings)를 받아 override dict로 조립 — 새 프로토콜을 만들지 않고 이미 있는 `get_render_settings()`의 반환 모양을 그대로 재사용

## 어떻게 달라졌는지

| | 이전 | 이후 |
|---|---|---|
| `render_video` WS 페이로드 | `{text, slot_id}` | `{text, slot_id, provider, voice_id/model_id/voice_settings 또는 polly_settings}` |
| `_run_render_video_flow` | provider 정보 없음, 항상 발행 설정 사용 | override 조립 후 `--settings-override`로 ECS에 전달 |
| `get_render_settings()`/`get_render_env()` | 인자 없음 | `override` 인자로 발행값 부분 덮어쓰기 |
| 실제 영상에 담기는 음성 | 카드에서 ElevenLabs를 골라도 발행 설정(Polly)로 렌더 | 카드 선택(ElevenLabs) 그대로 렌더 |

- 검증: 실제 ECS RunTask 경로로 `--settings-override '{"provider":"elevenlabs",...}'`를 직접 넣어 렌더 — 로그에 `렌더 시작... (provider=elevenlabs...)` 확인, ElevenLabs API 키 조회·TTS 9/9 합성·렌더링·업로드 전부 에러 없이 완료
- 배포: `admin/backend`(Lambda)·`admin/frontend`(S3/CF)·공유 파이프라인 이미지(`frontpage_auto:latest`, 리비전 72) 3곳 전부 반영
- `tsc --noEmit`/`eslint`(프론트), `pyflakes`(3개 Python 파일) 클린 확인

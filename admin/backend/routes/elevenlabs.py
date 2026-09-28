"""ElevenLabs 실험 옵션 조회 — 2026-09-24 신설.

프론트(PodcastAudioGenerator.tsx)의 성우/모델 드롭다운이 이 라우트로 목록을
받아온다. 값 자체는 pipelines/common/elevenlabs_tts.py가 정본(배포 시 zip
루트에 flat-copy됨, deploy-admin-api.sh 참고) — 여기선 그대로 감싸서
내려줄 뿐 별도 값을 정의하지 않는다."""
import elevenlabs_tts
from shared import response


def handle_get_options(body: dict, path_params: dict, query_params: dict) -> dict:
    return response.ok({
        "voices": elevenlabs_tts.VOICES,
        "models": elevenlabs_tts.MODELS,
        "voice_settings_defaults": elevenlabs_tts.DEFAULT_VOICE_SETTINGS,
        "voice_settings_ranges": elevenlabs_tts.VOICE_SETTINGS_RANGES,
    })

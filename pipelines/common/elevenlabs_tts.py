"""ElevenLabs 텍스트 음성 변환 모듈.

팟캐스트 발행(podcast_voice.synthesize())은 발행 설정의 PROVIDER가 "elevenlabs"일 때
이 모듈을 호출하며, 기본값은 Polly다(비용 사유: ElevenLabs 월 $95.81 vs Polly generative 월 $17).
CMS "성우 미리듣기"는 voice_id/model_id를 요청마다 받아 합성만 하고 저장하지 않는다.

영상 발행의 실제 TTS는 Node(pipelines/video/src/lib/tts.ts)에 있다. 이 모듈의 get_api_key()로
얻은 키를 video_settings.get_render_env()가 ELEVENLABS_API_KEY 환경변수로 넘기며,
tts.ts는 새 npm 의존성을 피하려고 같은 REST 호출(엔드포인트·바디·헤더 동일)을 직접 수행한다.

API 키는 Secrets Manager `ai-labs/elevenlabs`({"api_key": "..."})이며
service/backend/handlers/voice/tts.py와 같은 시크릿을 공유한다.
"""
import json
import os
import urllib.error
import urllib.request

import boto3

_API_BASE = "https://api.elevenlabs.io/v1"
_SECRET_ID = os.environ.get("ELEVENLABS_SECRET_ID", "ai-labs/elevenlabs")
# 미리듣기에 전체 각본(9컷, 약 600자)을 보내면 30초 타임아웃으로 실패한 사례가 있어 300초로 둔다.
# admin Lambda 타임아웃은 900초이고 chat_ws.py가 비동기 재호출(InvocationType="Event")하므로
# API Gateway 통합 타임아웃과 무관하다.
_TIMEOUT_SECONDS = 300

# 계정의 한국어 라벨 성우 262개 중 팟캐스트 톤에 맞는 8개(남/여 각 4)만 노출한다.
# MBTI 페르소나 등 다른 프로젝트의 커스텀 성우는 혼선 방지를 위해 제외했다.
#
# sample_url은 성우별 짧은 인삿말("안녕하세요, 반갑습니다.")을 기본 모델·기본 voice_settings로
# 미리 합성해 CMS 미디어 버킷(공개 S3)에 올려둔 고정 URL이다. 드롭다운을 열 때마다 API를
# 호출하면 크레딧이 낭비되므로 재생만 한다. 재생성은 synthesize(인삿말, voice_id=...) 결과를
# 같은 키로 다시 업로드한다.
VOICES: list[dict] = [
    {"id": "JO0IpD6HQh6hw7PlOIeI", "label": "podcast 남성", "gender": "male", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/JO0IpD6HQh6hw7PlOIeI.mp3"},
    {"id": "cuXUjH0CSJkKipo0Hy9i", "label": "Hyunsu (팟캐스트)", "gender": "male", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/cuXUjH0CSJkKipo0Hy9i.mp3"},
    {"id": "CtfB5gGKt7VmWeObgBhO", "label": "Jicheol (차분한 팟캐스트 호스트)", "gender": "male", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/CtfB5gGKt7VmWeObgBhO.mp3"},
    {"id": "mVMNSRhuCVCkUj7v7Eyq", "label": "YoungSeok (평범한 한국어 톤)", "gender": "male", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/mVMNSRhuCVCkUj7v7Eyq.mp3"},
    {"id": "8uGBWRHC9MO9v9Y9VSLn", "label": "podcast 여성", "gender": "female", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/8uGBWRHC9MO9v9Y9VSLn.mp3"},
    {"id": "QPFsEL6IBxlT15xfiD6C", "label": "Hana Lee (밝고 자연스러움)", "gender": "female", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/QPFsEL6IBxlT15xfiD6C.mp3"},
    {"id": "0oqpliV6dVSr9XomngOW", "label": "Jini (따뜻하고 지적인 톤)", "gender": "female", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/0oqpliV6dVSr9XomngOW.mp3"},
    {"id": "uyVNoMrnUku1dZyVEXwD", "label": "Anna Kim", "gender": "female", "sample_url": "https://sedaily-mbti-cms-media-dev.s3.us-east-1.amazonaws.com/media/voice-samples/uyVNoMrnUku1dZyVEXwD.mp3"},
]
DEFAULT_VOICE_ID = VOICES[0]["id"]

# GET /v1/models 응답으로 범용 모델 3개만 남겼다.
#   - eleven_storytel_v2: 오디오북 회사 전용 커스텀 모델이라 제외.
#   - eleven_flash_v2_5: turbo_v2_5와 스펙이 겹쳐 제외(turbo가 비영어권에 더 적합).
# supports_style/supports_speaker_boost는 API 응답 그대로이며, 프런트가 모델별로 해당
# 컨트롤을 숨기는 데 쓴다(미지원 모델에 보내면 에러 없이 무시된다).
MODELS: list[dict] = [
    {"id": "eleven_multilingual_v2", "label": "Multilingual v2 (기본, 안정적)", "supports_style": True, "supports_speaker_boost": True},
    {"id": "eleven_v3", "label": "v3 (최신)", "supports_style": False, "supports_speaker_boost": False},
    {"id": "eleven_turbo_v2_5", "label": "Turbo v2.5 (빠름·비영어권 특화)", "supports_style": False, "supports_speaker_boost": False},
]
DEFAULT_MODEL_ID = MODELS[0]["id"]

_VOICE_IDS = {v["id"] for v in VOICES}
_MODEL_IDS = {m["id"] for m in MODELS}

_api_key_cache: str | None = None


def get_api_key() -> str:
    global _api_key_cache
    if _api_key_cache:
        return _api_key_cache
    client = boto3.client("secretsmanager", region_name="us-east-1")
    secret = json.loads(client.get_secret_value(SecretId=_SECRET_ID)["SecretString"])
    _api_key_cache = secret["api_key"]
    return _api_key_cache


# GET /v1/voices/{id}/settings로 확인한 실제 스키마다. pitch는 존재하지 않는 파라미터라
# (보내도 조용히 무시됨) 일부러 넣지 않았다. 범위는 경계값 호출로 확인했다.
#   stability          0.0~1.0  (낮을수록 표현 풍부·불안정, 높을수록 단조·일관)
#   similarity_boost   0.0~1.0  (원본 성우 톤 충실도)
#   style              0.0~1.0  (감정 과장 정도)
#   use_speaker_boost  bool
#   speed              0.7~1.2  (범위 밖은 400 Invalid setting)
# 기본값은 API가 돌려준 값 그대로다.
DEFAULT_VOICE_SETTINGS: dict = {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": True,
    "speed": 1.0,
}
VOICE_SETTINGS_RANGES = {
    "stability": (0.0, 1.0),
    "similarity_boost": (0.0, 1.0),
    "style": (0.0, 1.0),
    "speed": (0.7, 1.2),
}


def _clamp_voice_settings(voice_settings: dict | None) -> dict:
    """모르는 키는 버리고, 아는 키는 범위 밖이면 클램프한다 — 프런트가
    범위 밖 값을 보내도(옛 버전, 조작된 요청 등) 400으로 죽는 대신
    안전하게 잘라 넣는다."""
    result = dict(DEFAULT_VOICE_SETTINGS)
    if not voice_settings:
        return result
    for key, (lo, hi) in VOICE_SETTINGS_RANGES.items():
        if key in voice_settings:
            try:
                result[key] = max(lo, min(hi, float(voice_settings[key])))
            except (TypeError, ValueError):
                pass
    if "use_speaker_boost" in voice_settings:
        result["use_speaker_boost"] = bool(voice_settings["use_speaker_boost"])
    return result


def synthesize(
    text: str, voice_id: str | None = None, model_id: str | None = None, voice_settings: dict | None = None,
) -> bytes:
    """텍스트 → mp3 bytes. voice_id/model_id가 이 모듈이 아는 값이 아니면
    기본값으로 조용히 떨어진다(resolve_text_model과 같은 방어 — 프런트가
    옛 값을 보내도 안전해야 함). voice_settings는 위 5개 키 중 있는 것만
    반영하고 나머지는 기본값(_clamp_voice_settings)."""
    voice_id = voice_id if voice_id in _VOICE_IDS else DEFAULT_VOICE_ID
    model_id = model_id if model_id in _MODEL_IDS else DEFAULT_MODEL_ID

    body = json.dumps({
        "text": text,
        "model_id": model_id,
        "voice_settings": _clamp_voice_settings(voice_settings),
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{_API_BASE}/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=body,
        method="POST",
        headers={
            "xi-api-key": get_api_key(),
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            return res.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"ElevenLabs API 오류({e.code}): {detail}") from e

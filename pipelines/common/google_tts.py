"""Google Gemini 텍스트 음성 변환 모듈(2026-10-22).

CMS 영상 탭·PRISM 탭의 제공자 "Google"이 쓴다. 영상 렌더의 실제 TTS는 Node(pipelines/video/src/lib/tts.ts)가
하며, video_settings.get_render_env()가 이 모듈의 get_api_key()로 읽은 키를 GOOGLE_TTS_API_KEY 환경변수로
넘긴다(elevenlabs_tts.py와 같은 구조). 이 모듈의 synthesize()는 CMS "성우 미리듣기" 전용이다.

API 키는 Secrets Manager `ai-labs/google-tts`({"api_key": "..."})이며, 회사 구글 계정의 AI Studio에서
만든 키다. 성우는 언어별로 나뉘지 않는다 — 같은 성우가 대본 언어(영어·한국어)대로 읽는다.

응답은 WAV(24kHz·모노·16bit)다(2026-10-21 실제 호출과 ai.google.dev 문서로 확인). 렌더 경로(tts.ts)는
ffmpeg로 mp3로 바꾸고, 미리듣기는 브라우저가 WAV를 그대로 재생하므로 바꾸지 않는다.
"""
import base64
import io
import json
import os
import urllib.error
import urllib.request
import wave

import boto3

_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
_SECRET_ID = os.environ.get("GOOGLE_TTS_SECRET_ID", "ai-labs/google-tts")
# 이름에 preview가 없는 모델(2026-10-21 이 키의 models 목록으로 확인). tts.ts의 GOOGLE_TTS_MODEL과 같은 값.
MODEL_ID = "gemini-3.8-flash-tts"
_TIMEOUT_SECONDS = 300  # elevenlabs_tts.py와 같은 이유(전체 각본 미리듣기)

# ai.google.dev/gemini-api/docs/speech-generation "Voice options" 표 30종(2026-10-22 확인).
# 라벨의 설명은 그 표의 스타일 설명을 옮긴 것. admin/frontend PromptChatLab/googleVoices.ts와 같은 목록.
VOICES: list[dict] = [
    {"id": "Kore", "label": "Kore — 단호한"},
    {"id": "Puck", "label": "Puck — 경쾌한"},
    {"id": "Charon", "label": "Charon — 정보 전달형"},
    {"id": "Zephyr", "label": "Zephyr — 밝은"},
    {"id": "Fenrir", "label": "Fenrir — 들뜬"},
    {"id": "Leda", "label": "Leda — 젊은"},
    {"id": "Orus", "label": "Orus — 단호한"},
    {"id": "Aoede", "label": "Aoede — 산뜻한"},
    {"id": "Callirrhoe", "label": "Callirrhoe — 느긋한"},
    {"id": "Autonoe", "label": "Autonoe — 밝은"},
    {"id": "Enceladus", "label": "Enceladus — 숨소리 섞인"},
    {"id": "Iapetus", "label": "Iapetus — 또렷한"},
    {"id": "Umbriel", "label": "Umbriel — 느긋한"},
    {"id": "Algieba", "label": "Algieba — 부드러운"},
    {"id": "Despina", "label": "Despina — 부드러운"},
    {"id": "Erinome", "label": "Erinome — 또렷한"},
    {"id": "Algenib", "label": "Algenib — 거친"},
    {"id": "Rasalgethi", "label": "Rasalgethi — 정보 전달형"},
    {"id": "Laomedeia", "label": "Laomedeia — 경쾌한"},
    {"id": "Achernar", "label": "Achernar — 부드러운"},
    {"id": "Alnilam", "label": "Alnilam — 단호한"},
    {"id": "Schedar", "label": "Schedar — 차분한"},
    {"id": "Gacrux", "label": "Gacrux — 성숙한"},
    {"id": "Pulcherrima", "label": "Pulcherrima — 적극적인"},
    {"id": "Achird", "label": "Achird — 친근한"},
    {"id": "Zubenelgenubi", "label": "Zubenelgenubi — 편안한"},
    {"id": "Vindemiatrix", "label": "Vindemiatrix — 온화한"},
    {"id": "Sadachbia", "label": "Sadachbia — 생기 있는"},
    {"id": "Sadaltager", "label": "Sadaltager — 박식한"},
    {"id": "Sulafat", "label": "Sulafat — 따뜻한"},
]
VOICE_IDS = {v["id"] for v in VOICES}
DEFAULT_VOICE = "Kore"

_api_key_cache: str | None = None


def get_api_key() -> str:
    global _api_key_cache
    if _api_key_cache:
        return _api_key_cache
    client = boto3.client("secretsmanager", region_name="us-east-1")
    secret = json.loads(client.get_secret_value(SecretId=_SECRET_ID)["SecretString"])
    _api_key_cache = secret["api_key"].strip()
    return _api_key_cache


def _pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def synthesize(text: str, voice: str | None = None) -> bytes:
    """text → WAV bytes. 목록에 없는 성우면 DEFAULT_VOICE로 합성한다."""
    voice = voice if voice in VOICE_IDS else DEFAULT_VOICE
    body = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    req = urllib.request.Request(
        f"{_API_BASE}/models/{MODEL_ID}:generateContent",
        data=json.dumps(body).encode("utf-8"),
        headers={"x-goog-api-key": get_api_key(), "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            data = json.loads(res.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"Google TTS 오류({e.code}, voice: {voice}): {detail}") from e
    try:
        inline = data["candidates"][0]["content"]["parts"][0]["inlineData"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Google TTS 응답에 오디오가 없습니다(voice: {voice})") from e
    audio = base64.b64decode(inline["data"])
    # 스트리밍이 아니면 WAV로 오지만, 헤더 없는 PCM(audio/l16)으로 오면 WAV로 감싼다.
    if inline.get("mimeType", "").lower().startswith("audio/l16"):
        return _pcm_to_wav(audio)
    return audio

"""팟캐스트 음성 설정 — admin DB 발행 문서(PROMPT#podcast-voice/published).

webtoon_image.py와 같은 패턴이다: ## 헤딩으로 값을 직렬화하고, 캐시 없이 DDB를 매번 조회하며,
실패하면 코드 내 기본값으로 조용히 폴백한다. 저장은 범용 라우트
`POST /admin/prompts/podcast-voice/published`(PodcastVoiceSettingsPanel.tsx의 "발행")를 쓴다.

엔진은 성우에 종속되지 않는다. `aws polly describe-voices --language-code ko-KR` 기준
Jihye는 neural만, Seoyeon은 generative/neural/standard를 지원하므로 ENGINE을 별도 헤딩으로
두었고, _VOICE_ENGINE_OPTIONS 밖의 조합은 parse_prompt_doc이 걸러낸다. generative·neural
엔진은 SSML <prosody>의 rate·volume만 지원하고 pitch는 지원하지 않아 노출하지 않는다.

synthesize()는 발행 파이프라인(pipelines/podcast/pipeline.py)과 admin 음성 미리듣기
(routes/chat_ws.py)가 공유한다. admin/backend/deploy-admin-api.sh가 이 파일을 zip 루트에 복사한다.
"""
import os
import re
from xml.sax.saxutils import escape as _xml_escape

import boto3

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
# 동기 SynthesizeSpeech API 상한은 3,000자이므로 여유를 두고 이 값 아래에서 문장 경계로 쪼갠다.
_POLLY_MAX_CHARS = 2800

_polly_client = None

# PROVIDER 헤딩으로 실제 발행에서도 ElevenLabs를 고를 수 있다.
# ELEVENLABS_VOICE/MODEL은 elevenlabs_tts.py의 VOICES/MODELS id를 그대로 저장하고,
# ELEVENLABS_STABILITY 등 5개는 elevenlabs_tts.DEFAULT_VOICE_SETTINGS와 같은 키
# (stability/similarity_boost/style/speed/use_speaker_boost)를 저장한다.
_DOC_HEADINGS = (
    "PROVIDER", "VOICE", "ENGINE", "RATE", "VOLUME", "ELEVENLABS_VOICE", "ELEVENLABS_MODEL",
    "ELEVENLABS_STABILITY", "ELEVENLABS_SIMILARITY_BOOST", "ELEVENLABS_STYLE", "ELEVENLABS_SPEED", "ELEVENLABS_SPEAKER_BOOST",
)
_DOC_HEADING_RE = re.compile(
    r"^##\s+(PROVIDER|VOICE|ENGINE|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|"
    r"ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST)\s*$"
)

_VALID_PROVIDERS = ("polly", "elevenlabs")
_DEFAULT_PROVIDER = "polly"  # 설정이 없으면 Polly

# 실제 AWS 지원 조합(`aws polly describe-voices --language-code ko-KR`로 확인).
# 이 밖의 (voice, engine) 조합은 Polly가 거부한다.
_VOICE_ENGINE_OPTIONS = {
    "Seoyeon": ("generative", "neural", "standard"),
    "Jihye": ("neural",),
}
_DEFAULT_VOICE = "Seoyeon"  # 비용 비교(2026-08-27) 기준 기본 성우
_DEFAULT_ENGINE = "generative"  # Seoyeon+generative 조합이 기본
_VALID_RATES = ("80%", "90%", "100%", "110%", "120%")
_DEFAULT_RATE = "100%"
_VALID_VOLUMES = ("-6dB", "-3dB", "+0dB", "+3dB", "+6dB")
_DEFAULT_VOLUME = "+0dB"


def serialize_prompt_doc(
    provider: str, voice: str, engine: str, rate: str, volume: str,
    elevenlabs_voice: str = "", elevenlabs_model: str = "",
    elevenlabs_stability: str = "", elevenlabs_similarity_boost: str = "",
    elevenlabs_style: str = "", elevenlabs_speed: str = "", elevenlabs_speaker_boost: str = "",
) -> str:
    """DDB에 저장할 content 문자열. parse_prompt_doc의 역함수."""
    parts = {
        "PROVIDER": provider.strip(),
        "VOICE": voice.strip(),
        "ENGINE": engine.strip(),
        "RATE": rate.strip(),
        "VOLUME": volume.strip(),
        "ELEVENLABS_VOICE": elevenlabs_voice.strip(),
        "ELEVENLABS_MODEL": elevenlabs_model.strip(),
        "ELEVENLABS_STABILITY": elevenlabs_stability.strip(),
        "ELEVENLABS_SIMILARITY_BOOST": elevenlabs_similarity_boost.strip(),
        "ELEVENLABS_STYLE": elevenlabs_style.strip(),
        "ELEVENLABS_SPEED": elevenlabs_speed.strip(),
        "ELEVENLABS_SPEAKER_BOOST": elevenlabs_speaker_boost.strip(),
    }
    return "\n\n".join(f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS)


def parse_prompt_doc(content: str) -> dict:
    """content → {"provider","voice","engine","rate","volume",
    "elevenlabs_voice","elevenlabs_model","elevenlabs_voice_settings"}.
    값이 없거나 유효하지 않으면 예외 없이 빈 값으로 채운다(기본값은 호출부가 적용).
    voice/engine 조합이 _VOICE_ENGINE_OPTIONS에 없으면(예: Jihye+generative) engine을 비운다.
    elevenlabs_* 값은 elevenlabs_tts를 top-level import하면 순환 의존이라 여기서 검증하지 않고,
    elevenlabs_tts.synthesize()의 _clamp_voice_settings()가 처리한다."""
    buckets: dict[str, list[str]] = {h: [] for h in _DOC_HEADINGS}
    current: str | None = None
    for line in content.split("\n"):
        m = _DOC_HEADING_RE.match(line.strip())
        if m:
            current = m.group(1)
            continue
        if current:
            buckets[current].append(line)
    values = {h: ("\n".join(buckets[h])).strip() for h in _DOC_HEADINGS}
    provider = values["PROVIDER"] if values["PROVIDER"] in _VALID_PROVIDERS else ""
    voice = values["VOICE"] if values["VOICE"] in _VOICE_ENGINE_OPTIONS else ""
    engine = values["ENGINE"] if voice and values["ENGINE"] in _VOICE_ENGINE_OPTIONS.get(voice, ()) else ""
    rate = values["RATE"] if values["RATE"] in _VALID_RATES else ""
    volume = values["VOLUME"] if values["VOLUME"] in _VALID_VOLUMES else ""

    def _num(raw: str) -> float | None:
        try:
            return float(raw)
        except ValueError:
            return None

    voice_settings = {
        "stability": _num(values["ELEVENLABS_STABILITY"]),
        "similarity_boost": _num(values["ELEVENLABS_SIMILARITY_BOOST"]),
        "style": _num(values["ELEVENLABS_STYLE"]),
        "speed": _num(values["ELEVENLABS_SPEED"]),
        "use_speaker_boost": values["ELEVENLABS_SPEAKER_BOOST"] == "True" if values["ELEVENLABS_SPEAKER_BOOST"] else None,
    }
    # None 값은 키를 빼서 elevenlabs_tts._clamp_voice_settings()가 기본값으로 채우게 한다.
    voice_settings = {k: v for k, v in voice_settings.items() if v is not None}
    return {
        "provider": provider,
        "voice": voice,
        "engine": engine,
        "rate": rate,
        "volume": volume,
        "elevenlabs_voice": values["ELEVENLABS_VOICE"],
        "elevenlabs_model": values["ELEVENLABS_MODEL"],
        "elevenlabs_voice_settings": voice_settings,
    }


def _load_prompt_doc() -> dict:
    """DDB(PROMPT#podcast-voice/published)를 캐시 없이 매번 읽는다. 문서가 없거나
    조회가 실패해도 팟캐스트 생성을 막으면 안 되므로 빈 값으로 폴백한다."""
    try:
        import ddb_prompt  # pipelines/common/ 내 sibling — flat import

        content = ddb_prompt.load_prompt("podcast-voice", "published")
        return parse_prompt_doc(content)
    except Exception as e:  # noqa: BLE001 — 팟캐스트 생성 자체를 절대 막으면 안 됨
        print(
            f"[podcast_voice] podcast-voice/published 로드 실패"
            f"({type(e).__name__}: {e}) — 코드 내 기본값 사용"
        )
        return {
            "provider": "", "voice": "", "engine": "", "rate": "", "volume": "",
            "elevenlabs_voice": "", "elevenlabs_model": "", "elevenlabs_voice_settings": {},
        }


def get_voice_settings() -> dict:
    """발행 파이프라인이 지금 써야 할 음성 설정을 캐시 없이 매번 조회한다
    (CMS에서 저장하면 재배포 없이 다음 합성부터 반영).

    반환: provider("polly"|"elevenlabs"), voice, engine, rate("100%" 형식),
    volume("+0dB" 형식), elevenlabs_voice, elevenlabs_model, elevenlabs_voice_settings.
    elevenlabs_voice_settings 외에는 항상 채워진 값이며(provider가 elevenlabs여도
    Polly 값을 채워 dict 구조를 일정하게 유지), voice_settings의 빠진 키는
    elevenlabs_tts._clamp_voice_settings()가 기본값으로 채운다. engine이 비면
    voice가 _DEFAULT_VOICE일 때 _DEFAULT_ENGINE, 아니면 그 voice의 첫 지원 엔진을 쓴다."""
    doc = _load_prompt_doc()
    voice = doc["voice"] or _DEFAULT_VOICE
    engine = doc["engine"] or (_DEFAULT_ENGINE if voice == _DEFAULT_VOICE else _VOICE_ENGINE_OPTIONS[voice][0])
    return {
        "provider": doc["provider"] or _DEFAULT_PROVIDER,
        "voice": voice,
        "engine": engine,
        "rate": doc["rate"] or _DEFAULT_RATE,
        "volume": doc["volume"] or _DEFAULT_VOLUME,
        "elevenlabs_voice": doc["elevenlabs_voice"],
        "elevenlabs_model": doc["elevenlabs_model"],
        "elevenlabs_voice_settings": doc["elevenlabs_voice_settings"],
    }


def _polly() -> "boto3.client":
    global _polly_client
    if _polly_client is None:
        session = (
            boto3.Session(profile_name=_AWS_PROFILE)
            if _AWS_PROFILE
            else boto3.Session()
        )
        _polly_client = session.client("polly", region_name=_REGION)
    return _polly_client


def _split_for_polly(text: str) -> list[str]:
    """_POLLY_MAX_CHARS 이하 조각으로 문장 경계에서 나눈다. 한도를 넘는 단일 문장은
    그대로 하나의 조각이 되며, Polly 에러로 드러나게 둔다."""
    if len(text) <= _POLLY_MAX_CHARS:
        return [text]
    sentences = re.split(r"(?<=[.!?다요]\s)", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) > _POLLY_MAX_CHARS:
            chunks.append(current)
            current = sentence
        else:
            current += sentence
    if current:
        chunks.append(current)
    return chunks


def _synthesize_polly(text: str, settings: dict) -> bytes:
    audio = b""
    for chunk in _split_for_polly(text):
        # SSML <prosody>로 rate/volume을 반영한다. 청크가 문장 경계로 나뉘어 있어
        # "온전한 문장 단위로만 prosody 사용 가능"한 generative 엔진 제약과 맞는다.
        ssml = (
            f'<speak><prosody rate="{settings["rate"]}" volume="{settings["volume"]}">'
            f"{_xml_escape(chunk)}</prosody></speak>"
        )
        resp = _polly().synthesize_speech(
            Text=ssml,
            TextType="ssml",
            OutputFormat="mp3",
            VoiceId=settings["voice"],
            Engine=settings["engine"],
            LanguageCode="ko-KR",
        )
        audio += resp["AudioStream"].read()
    return audio


def synthesize(
    text: str, voice: str | None = None, engine: str | None = None,
    rate: str | None = None, volume: str | None = None,
) -> bytes:
    """text → mp3 bytes.

    voice/engine/rate/volume을 생략하면 발행된 CMS 음성 설정(get_voice_settings())을 쓰고,
    그 provider가 "elevenlabs"면 elevenlabs_tts로 위임한다(매일 자동 발행의 기본 호출).
    voice/engine을 명시하면(CMS "Polly" 카드의 일회성 실험) 발행 설정의 provider와 무관하게
    그 값으로 Polly 합성한다. _VOICE_ENGINE_OPTIONS에 없는 조합이면 무시하고 발행 설정으로
    돌아가며, 이 오버라이드는 저장되지 않는다.
    """
    if voice and voice in _VOICE_ENGINE_OPTIONS and engine in _VOICE_ENGINE_OPTIONS[voice]:
        settings = {
            "voice": voice,
            "engine": engine,
            "rate": rate if rate in _VALID_RATES else _DEFAULT_RATE,
            "volume": volume if volume in _VALID_VOLUMES else _DEFAULT_VOLUME,
        }
        return _synthesize_polly(text, settings)

    settings = get_voice_settings()  # admin CMS에서 fresh 조회(캐시 없음)
    if settings["provider"] == "elevenlabs":
        import elevenlabs_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

        return elevenlabs_tts.synthesize(
            text, settings["elevenlabs_voice"], settings["elevenlabs_model"],
            voice_settings=settings["elevenlabs_voice_settings"],
        )
    return _synthesize_polly(text, settings)

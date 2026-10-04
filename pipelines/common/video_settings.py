"""영상 렌더 설정 — admin DB 발행 문서(PROMPT#video-settings/published).

podcast_voice.py와 같은 패턴이다(## 헤딩 발행 문서, 캐시 없는 DDB 조회, 실패 시 코드 내 기본값
폴백). 저장은 범용 라우트 `POST /admin/prompts/video-settings/published`
(VideoRenderSettingsPanel.tsx의 "발행")를 쓴다. 성우/엔진 조합표와 RATE/VOLUME 값 집합은
podcast_voice.py와 같으며(Polly 한국어 보이스 제약, SSML <prosody> 허용값), FORMAT은
render.ts의 `--format vertical|horizontal`이다.

실제 영상 TTS는 Node(pipelines/video/src/lib/tts.ts)가 수행하므로, get_render_env()가 설정을
`npm run render` 서브프로세스의 환경변수(TTS_*/ELEVENLABS_*)로 변환한다. render_from_script.py와
publish_utils.py::generate_video()가 이 함수 하나를 공유해 환경변수 조립이 어긋나지 않게 한다.
"""
import os
import re

import boto3

# ELEVENLABS_STABILITY 등 5개는 elevenlabs_tts.DEFAULT_VOICE_SETTINGS와 같은 키이며
# get_render_env()가 ELEVENLABS_* 환경변수로 넘긴다. rate/volume과 달리 SSML이 아니라
# API 바디의 voice_settings로 실리므로 tts.ts의 SSML 지원 여부와 무관하게 반영된다.
_DOC_HEADINGS = (
    "PROVIDER", "VOICE", "ENGINE", "FORMAT", "RATE", "VOLUME", "ELEVENLABS_VOICE", "ELEVENLABS_MODEL",
    "ELEVENLABS_STABILITY", "ELEVENLABS_SIMILARITY_BOOST", "ELEVENLABS_STYLE", "ELEVENLABS_SPEED", "ELEVENLABS_SPEAKER_BOOST",
)
_DOC_HEADING_RE = re.compile(
    r"^##\s+(PROVIDER|VOICE|ENGINE|FORMAT|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|"
    r"ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST)\s*$"
)

_VALID_PROVIDERS = ("polly", "elevenlabs")
_DEFAULT_PROVIDER = "polly"  # 설정이 없으면 Polly

# 실제 AWS 지원 조합(podcast_voice.py::_VOICE_ENGINE_OPTIONS와 동일).
_VOICE_ENGINE_OPTIONS = {
    "Seoyeon": ("generative", "neural", "standard"),
    "Jihye": ("neural",),
}
_DEFAULT_VOICE = "Seoyeon"  # tts.ts::DEFAULT_VOICE와 동일
_DEFAULT_ENGINE = "generative"
_VALID_FORMATS = ("horizontal", "vertical")
_DEFAULT_FORMAT = "horizontal"  # render_from_script.py 기본값과 동일

# podcast_voice.py와 동일한 값 집합(같은 SSML <prosody> 속성 허용값).
_VALID_RATES = ("80%", "90%", "100%", "110%", "120%")
_DEFAULT_RATE = "100%"
_VALID_VOLUMES = ("-6dB", "-3dB", "+0dB", "+3dB", "+6dB")
_DEFAULT_VOLUME = "+0dB"

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_POLLY_MAX_CHARS = 2800  # podcast_voice.py와 동일(동기 API 상한 3,000자 미만)

_polly_client = None


def serialize_prompt_doc(
    provider: str, voice: str, engine: str, fmt: str,
    rate: str = "", volume: str = "",
    elevenlabs_voice: str = "", elevenlabs_model: str = "",
    elevenlabs_stability: str = "", elevenlabs_similarity_boost: str = "",
    elevenlabs_style: str = "", elevenlabs_speed: str = "", elevenlabs_speaker_boost: str = "",
) -> str:
    """DDB에 저장할 content 문자열. parse_prompt_doc의 역함수."""
    parts = {
        "PROVIDER": provider.strip(),
        "VOICE": voice.strip(),
        "ENGINE": engine.strip(),
        "FORMAT": fmt.strip(),
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
    """content → {"provider","voice","engine","format",
    "elevenlabs_voice","elevenlabs_model","elevenlabs_voice_settings"}.
    값이 없어도 예외 없이 빈 값으로 채우며 기본값은 호출부가 적용한다."""
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
    fmt = values["FORMAT"] if values["FORMAT"] in _VALID_FORMATS else ""
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
    voice_settings = {k: v for k, v in voice_settings.items() if v is not None}
    return {
        "provider": provider,
        "voice": voice,
        "engine": engine,
        "format": fmt,
        "rate": rate,
        "volume": volume,
        "elevenlabs_voice": values["ELEVENLABS_VOICE"],
        "elevenlabs_model": values["ELEVENLABS_MODEL"],
        "elevenlabs_voice_settings": voice_settings,
    }


def _load_prompt_doc() -> dict:
    """DDB(PROMPT#video-settings/published)를 캐시 없이 매번 읽는다. 문서가 없거나
    조회가 실패해도 영상 생성을 막으면 안 되므로 빈 값으로 폴백한다."""
    try:
        import ddb_prompt  # pipelines/common/ 내 sibling — flat import

        content = ddb_prompt.load_prompt("video-settings", "published")
        return parse_prompt_doc(content)
    except Exception as e:  # noqa: BLE001 — 영상 생성 자체를 절대 막으면 안 됨
        print(
            f"[video_settings] video-settings/published 로드 실패"
            f"({type(e).__name__}: {e}) — 코드 내 기본값 사용"
        )
        return {
            "provider": "", "voice": "", "engine": "", "format": "", "rate": "", "volume": "",
            "elevenlabs_voice": "", "elevenlabs_model": "", "elevenlabs_voice_settings": {},
        }


def get_render_settings(override: dict | None = None) -> dict:
    """렌더(render_from_script.py, publish_utils.py::generate_video)가 지금 써야 할 설정을
    캐시 없이 매번 조회한다(CMS에서 저장하면 재배포 없이 다음 렌더부터 반영).

    반환: provider, voice, engine, format, rate, volume, elevenlabs_voice, elevenlabs_model,
    elevenlabs_voice_settings. 마지막 항목 외에는 항상 채워진 값이며, voice_settings의 빠진
    키는 tts.ts가 자기 기본값으로 채운다. 환경변수 형태가 필요하면 get_render_env()를 쓴다.

    override는 None이 아닌 키만 발행값 위에 덮어쓴다. CMS 영상 탭 카드가 "성우 미리듣기"에서
    고른 provider/voice를 실제 렌더에도 반영할 때 chat_ws.py가 --settings-override로 넘기며,
    매일 자동 발행(generate_video)은 override 없이 발행 설정만 쓴다."""
    doc = _load_prompt_doc()
    voice = doc["voice"] or _DEFAULT_VOICE
    engine = doc["engine"] or (_DEFAULT_ENGINE if voice == _DEFAULT_VOICE else _VOICE_ENGINE_OPTIONS[voice][0])
    settings = {
        "provider": doc["provider"] or _DEFAULT_PROVIDER,
        "voice": voice,
        "engine": engine,
        "format": doc["format"] or _DEFAULT_FORMAT,
        "rate": doc["rate"] or _DEFAULT_RATE,
        "volume": doc["volume"] or _DEFAULT_VOLUME,
        "elevenlabs_voice": doc["elevenlabs_voice"],
        "elevenlabs_model": doc["elevenlabs_model"],
        "elevenlabs_voice_settings": doc["elevenlabs_voice_settings"],
    }
    if override:
        settings.update({k: v for k, v in override.items() if v is not None})
    return settings


def get_render_env(override: dict | None = None) -> dict:
    """get_render_settings()를 `npm run render`(render.ts → tts.ts) 서브프로세스에 넘길
    환경변수 딕셔너리로 변환한다. 진입점이 두 곳(render_from_script.py, generate_video)이라
    각자 조립하지 않고 이 함수를 공유한다. override는 get_render_settings()에 그대로 전달된다.

    provider가 "elevenlabs"면 elevenlabs_tts.get_api_key()로 읽은 키를 ELEVENLABS_API_KEY로
    넘긴다(tts.ts는 AWS SDK 없이 헤더에 그대로 사용). FORMAT은 render.ts가 --format 인자로
    따로 받으므로 넣지 않는다. voice_settings 5개는 저장된 키만 넘기고, 없는 키는 tts.ts가
    기본값·범위 클램프를 적용한다.
    """
    settings = get_render_settings(override)
    env = {
        "TTS_PROVIDER": settings["provider"],
        "TTS_VOICE_ID": settings["voice"],
        "TTS_ENGINE": settings["engine"],
        "TTS_RATE": settings["rate"],
        "TTS_VOLUME": settings["volume"],
    }
    if settings["provider"] == "elevenlabs":
        import elevenlabs_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

        env["ELEVENLABS_VOICE_ID"] = settings["elevenlabs_voice"]
        env["ELEVENLABS_MODEL_ID"] = settings["elevenlabs_model"]
        env["ELEVENLABS_API_KEY"] = elevenlabs_tts.get_api_key()
        vs = settings["elevenlabs_voice_settings"]
        if "stability" in vs:
            env["ELEVENLABS_STABILITY"] = str(vs["stability"])
        if "similarity_boost" in vs:
            env["ELEVENLABS_SIMILARITY_BOOST"] = str(vs["similarity_boost"])
        if "style" in vs:
            env["ELEVENLABS_STYLE"] = str(vs["style"])
        if "speed" in vs:
            env["ELEVENLABS_SPEED"] = str(vs["speed"])
        if "use_speaker_boost" in vs:
            env["ELEVENLABS_SPEAKER_BOOST"] = "true" if vs["use_speaker_boost"] else "false"
    return env


def _polly() -> "boto3.client":
    global _polly_client
    if _polly_client is None:
        session = boto3.Session(profile_name=_AWS_PROFILE) if _AWS_PROFILE else boto3.Session()
        _polly_client = session.client("polly", region_name=_REGION)
    return _polly_client


def _split_for_polly(text: str) -> list[str]:
    """podcast_voice.py::_split_for_polly와 동일 — 문장 경계로 청크 분할."""
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


def synthesize(
    text: str, voice: str | None = None, engine: str | None = None,
    rate: str | None = None, volume: str | None = None,
) -> bytes:
    """text → mp3 bytes. CMS "성우 미리듣기"(admin/backend/routes/chat_ws.py) 전용이다.

    Polly 경로는 실제 렌더(tts.ts)와 같은 SSML <prosody> 방식으로 호출해 미리듣기가 렌더 결과와
    같은 소리를 내게 한다. voice/engine을 명시하면(CMS "Polly" 카드의 일회성 실험) 발행 설정의
    provider와 무관하게 그 값으로 Polly 합성하고, 잘못된 조합이면 발행 설정으로 폴백한다.
    rate/volume이 없거나 유효하지 않으면 기본값을 쓴다. 오버라이드가 없고 발행 provider가
    "elevenlabs"면 elevenlabs_tts로 위임한다(실제 렌더의 ElevenLabs 경로는 tts.ts가 별도 수행).
    """
    if voice and voice in _VOICE_ENGINE_OPTIONS and engine in _VOICE_ENGINE_OPTIONS[voice]:
        settings = {
            "voice": voice,
            "engine": engine,
            "rate": rate if rate in _VALID_RATES else _DEFAULT_RATE,
            "volume": volume if volume in _VALID_VOLUMES else _DEFAULT_VOLUME,
        }
        return _synthesize_polly(text, settings)

    settings = get_render_settings()  # admin CMS에서 fresh 조회(캐시 없음)
    if settings["provider"] == "elevenlabs":
        import elevenlabs_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

        return elevenlabs_tts.synthesize(
            text, settings["elevenlabs_voice"], settings["elevenlabs_model"],
            voice_settings=settings["elevenlabs_voice_settings"],
        )
    return _synthesize_polly(text, settings)


def _synthesize_polly(text: str, settings: dict) -> bytes:
    """<prosody rate volume>으로 감싼 SSML로 합성한다(podcast_voice.py와 동일 패턴).
    rate/volume은 닫힌 값 집합에서만 오므로 내레이션 텍스트만 이스케이프한다."""
    from xml.sax.saxutils import escape as xml_escape

    audio = b""
    for chunk in _split_for_polly(text):
        ssml = (
            f'<speak><prosody rate="{settings["rate"]}" volume="{settings["volume"]}">'
            f"{xml_escape(chunk)}</prosody></speak>"
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

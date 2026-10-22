"""영상 렌더 설정 — admin DB 발행 문서(PROMPT#video-settings/published).

podcast_voice.py와 같은 패턴이다(## 헤딩 발행 문서, 캐시 없는 DDB 조회, 실패 시 코드 내 기본값
폴백). 저장은 범용 라우트 `POST /admin/prompts/video-settings/published`
(VideoRenderSettingsPanel.tsx의 "발행")를 쓴다. 성우/엔진 조합표와 RATE/VOLUME 값 집합은
podcast_voice.py와 같으며(Polly 한국어 보이스 제약, SSML <prosody> 허용값), FORMAT은
render.ts의 `--format vertical|horizontal`이다.

실제 영상 TTS는 Node(pipelines/video/src/lib/tts.ts)가 수행하므로, get_render_env()가 설정을
`npm run render` 서브프로세스의 환경변수(TTS_*/ELEVENLABS_*/GOOGLE_TTS_*)로 변환한다. render_from_script.py와
publishing.py::generate_video()가 이 함수 하나를 공유해 환경변수 조립이 어긋나지 않게 한다.
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
    "GOOGLE_VOICE",
)
_DOC_HEADING_RE = re.compile(
    r"^##\s+(PROVIDER|VOICE|ENGINE|FORMAT|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|"
    r"ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST|GOOGLE_VOICE)\s*$"
)

# google(2026-10-22) — CMS 영상·PRISM 탭은 Polly/Google만 보여 준다(ElevenLabs는 화면에서 숨김, 코드는 유지).
_VALID_PROVIDERS = ("polly", "elevenlabs", "google")
_DEFAULT_PROVIDER = "polly"  # 설정이 없으면 Polly

# 실제 AWS 지원 조합(podcast_voice.py::_VOICE_ENGINE_OPTIONS와 동일).
_VOICE_ENGINE_OPTIONS = {
    "Seoyeon": ("generative", "neural", "standard"),
    "Jihye": ("neural",),
}
_DEFAULT_VOICE = "Seoyeon"  # tts.ts::DEFAULT_VOICE와 동일
_DEFAULT_ENGINE = "generative"

# AI PRISM(영문 영상) 성우 — 2026-10-21 `aws polly describe-voices`로 확인한 영어 보이스 중
# generative 엔진을 지원하는 것만 둔다. 엔진 튜플 순서가 곧 기본 우선순위다.
_PRISM_VOICE_ENGINE_OPTIONS = {
    "Joanna": ("generative", "neural", "standard"),
    "Matthew": ("generative", "neural", "standard"),
    "Ruth": ("generative", "neural"),
    "Stephen": ("generative", "neural"),
    "Danielle": ("generative", "neural"),
    "Amy": ("generative", "neural", "standard"),
    "Brian": ("generative", "neural", "standard"),
}
_PRISM_DEFAULT_VOICE = "Joanna"

# Polly LanguageCode — 예전엔 "ko-KR" 고정이었다. 영어 보이스에 ko-KR을 넘기면 안 되므로 보이스로 정한다.
_VOICE_LANGUAGE = {
    "Seoyeon": "ko-KR", "Jihye": "ko-KR",
    "Joanna": "en-US", "Matthew": "en-US", "Ruth": "en-US", "Stephen": "en-US", "Danielle": "en-US",
    "Amy": "en-GB", "Brian": "en-GB",
}

# 설정 문서(카테고리)별 성우 목록·기본 성우. LENS 영상은 video-settings, PRISM 영상은 prism-settings —
# 렌더는 각본 design.theme으로 고른다(settings_category_for). 인자를 안 넘기면 지금처럼 LENS 설정이다.
SETTINGS_CATEGORY = "video-settings"
PRISM_SETTINGS_CATEGORY = "prism-settings"
_PROFILES = {
    SETTINGS_CATEGORY: (_VOICE_ENGINE_OPTIONS, _DEFAULT_VOICE),
    PRISM_SETTINGS_CATEGORY: (_PRISM_VOICE_ENGINE_OPTIONS, _PRISM_DEFAULT_VOICE),
}


def _profile(category: str) -> tuple[dict, str]:
    return _PROFILES.get(category, _PROFILES[SETTINGS_CATEGORY])


def settings_category_for(script: dict) -> str:
    """각본이 PRISM 디자인(design.theme "prism")이면 prism-settings, 아니면 video-settings."""
    return PRISM_SETTINGS_CATEGORY if (script.get("design") or {}).get("theme") == "prism" else SETTINGS_CATEGORY


def language_for(voice: str) -> str:
    return _VOICE_LANGUAGE.get(voice, "ko-KR")
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
    google_voice: str = "",
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
        "GOOGLE_VOICE": google_voice.strip(),
    }
    return "\n\n".join(f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS)


def parse_prompt_doc(content: str, category: str = SETTINGS_CATEGORY) -> dict:
    """content → {"provider","voice","engine","format",
    "elevenlabs_voice","elevenlabs_model","elevenlabs_voice_settings","google_voice"}.
    값이 없어도 예외 없이 빈 값으로 채우며 기본값은 호출부가 적용한다.
    VOICE는 그 카테고리의 성우 목록에 있을 때만 받는다(PRISM 문서에 Seoyeon이 있으면 빈 값)."""
    import google_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

    voices, _ = _profile(category)
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
    voice = values["VOICE"] if values["VOICE"] in voices else ""
    engine = values["ENGINE"] if voice and values["ENGINE"] in voices.get(voice, ()) else ""
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
        "google_voice": values["GOOGLE_VOICE"] if values["GOOGLE_VOICE"] in google_tts.VOICE_IDS else "",
    }


def _load_prompt_doc(category: str = SETTINGS_CATEGORY) -> dict:
    """DDB(PROMPT#{category}/published)를 캐시 없이 매번 읽는다. 문서가 없거나
    조회가 실패해도 영상 생성을 막으면 안 되므로 빈 값으로 폴백한다(PRISM 설정을 아직
    한 번도 저장하지 않았으면 여기로 와서 PRISM 기본 성우를 쓴다)."""
    try:
        import ddb_prompt  # pipelines/common/ 내 sibling — flat import

        content = ddb_prompt.load_prompt(category, "published")
        return parse_prompt_doc(content, category)
    except Exception as e:  # noqa: BLE001 — 영상 생성 자체를 절대 막으면 안 됨
        print(
            f"[video_settings] {category}/published 로드 실패"
            f"({type(e).__name__}: {e}) — 코드 내 기본값 사용"
        )
        return {
            "provider": "", "voice": "", "engine": "", "format": "", "rate": "", "volume": "",
            "elevenlabs_voice": "", "elevenlabs_model": "", "elevenlabs_voice_settings": {}, "google_voice": "",
        }


def get_render_settings(override: dict | None = None, category: str = SETTINGS_CATEGORY) -> dict:
    """렌더(render_from_script.py, publishing.py::generate_video)가 지금 써야 할 설정을
    캐시 없이 매번 조회한다(CMS에서 저장하면 재배포 없이 다음 렌더부터 반영).

    반환: provider, voice, engine, format, rate, volume, elevenlabs_voice, elevenlabs_model,
    elevenlabs_voice_settings, google_voice. 마지막 항목 외에는 항상 채워진 값이며, voice_settings의 빠진
    키는 tts.ts가 자기 기본값으로 채운다. 환경변수 형태가 필요하면 get_render_env()를 쓴다.

    override는 None이 아닌 키만 발행값 위에 덮어쓴다. CMS 영상 탭 카드가 "성우 미리듣기"에서
    고른 provider/voice를 실제 렌더에도 반영할 때 chat_ws.py가 --settings-override로 넘기며,
    매일 자동 발행(generate_video)은 override 없이 발행 설정만 쓴다.

    category는 읽을 설정 문서(video-settings / prism-settings). "language"(Polly LanguageCode)는
    override까지 반영한 최종 성우로 정한다."""
    voices, default_voice = _profile(category)
    doc = _load_prompt_doc(category)
    voice = doc["voice"] or default_voice
    engine = doc["engine"] or (_DEFAULT_ENGINE if _DEFAULT_ENGINE in voices[voice] else voices[voice][0])
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
        "google_voice": doc["google_voice"],
    }
    if override:
        settings.update({k: v for k, v in override.items() if v is not None})
    settings["language"] = language_for(settings["voice"])
    return settings


def get_render_env(override: dict | None = None, category: str = SETTINGS_CATEGORY) -> dict:
    """get_render_settings()를 `npm run render`(render.ts → tts.ts) 서브프로세스에 넘길
    환경변수 딕셔너리로 변환한다. 진입점이 두 곳(render_from_script.py, generate_video)이라
    각자 조립하지 않고 이 함수를 공유한다. override는 get_render_settings()에 그대로 전달된다.

    provider가 "elevenlabs"면 elevenlabs_tts.get_api_key()로 읽은 키를 ELEVENLABS_API_KEY로
    넘긴다(tts.ts는 AWS SDK 없이 헤더에 그대로 사용). FORMAT은 render.ts가 --format 인자로
    따로 받으므로 넣지 않는다. voice_settings 5개는 저장된 키만 넘기고, 없는 키는 tts.ts가
    기본값·범위 클램프를 적용한다.

    provider가 "google"이면 GOOGLE_TTS_VOICE·GOOGLE_TTS_API_KEY를 넘긴다. Polly 성우(TTS_VOICE_ID 등)도
    그대로 넘기는 이유는 Google 합성에 실패하면 영상 전체를 Polly로 다시 읽기 때문이다(resolveAudio.ts). 키를 못 읽어도
    (권한 누락 등) 렌더를 막지 않고 빈 키로 넘겨 tts.ts가 Polly로 대신하게 한다.
    """
    settings = get_render_settings(override, category)
    env = {
        "TTS_PROVIDER": settings["provider"],
        "TTS_VOICE_ID": settings["voice"],
        "TTS_ENGINE": settings["engine"],
        "TTS_LANGUAGE": settings["language"],
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
    elif settings["provider"] == "google":
        import google_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

        env["GOOGLE_TTS_VOICE"] = settings["google_voice"] or google_tts.DEFAULT_VOICE
        env["GOOGLE_TTS_MODEL"] = google_tts.MODEL_ID
        try:
            env["GOOGLE_TTS_API_KEY"] = google_tts.get_api_key()
        except Exception as e:  # noqa: BLE001 — 키를 못 읽어도 영상은 Polly로 나가야 함
            print(f"[video_settings] Google TTS 키 조회 실패({type(e).__name__}: {e}) — Polly로 대신 읽음")
            env["GOOGLE_TTS_API_KEY"] = ""
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
    rate: str | None = None, volume: str | None = None, category: str = SETTINGS_CATEGORY,
) -> bytes:
    """text → mp3 bytes(발행 provider가 google이면 WAV bytes). CMS "성우 미리듣기"(admin/backend/routes/chat_ws.py) 전용이다.

    Polly 경로는 실제 렌더(tts.ts)와 같은 SSML <prosody> 방식으로 호출해 미리듣기가 렌더 결과와
    같은 소리를 내게 한다. voice/engine을 명시하면(CMS "Polly" 카드의 일회성 실험) 발행 설정의
    provider와 무관하게 그 값으로 Polly 합성하고, 잘못된 조합이면 발행 설정으로 폴백한다.
    rate/volume이 없거나 유효하지 않으면 기본값을 쓴다. 오버라이드가 없고 발행 provider가
    "elevenlabs"면 elevenlabs_tts로 위임한다(실제 렌더의 ElevenLabs 경로는 tts.ts가 별도 수행).
    category는 성우 목록·발행 설정을 고를 문서(CMS PRISM 탭은 prism-settings).
    """
    voices, _ = _profile(category)
    if voice and voice in voices and engine in voices[voice]:
        settings = {
            "voice": voice,
            "engine": engine,
            "rate": rate if rate in _VALID_RATES else _DEFAULT_RATE,
            "volume": volume if volume in _VALID_VOLUMES else _DEFAULT_VOLUME,
        }
        return _synthesize_polly(text, settings)

    settings = get_render_settings(category=category)  # admin CMS에서 fresh 조회(캐시 없음)
    if settings["provider"] == "elevenlabs":
        import elevenlabs_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

        return elevenlabs_tts.synthesize(
            text, settings["elevenlabs_voice"], settings["elevenlabs_model"],
            voice_settings=settings["elevenlabs_voice_settings"],
        )
    if settings["provider"] == "google":
        import google_tts  # pipelines/common/ 내 sibling — flat import(admin)/같은 디렉터리(ECS)

        return google_tts.synthesize(text, settings["google_voice"])
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
            LanguageCode=language_for(settings["voice"]),
        )
        audio += resp["AudioStream"].read()
    return audio

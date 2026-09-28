"""영상 렌더 설정 — admin DB 발행 문서(PROMPT#video-settings/published).

2026-09-23 신설 — 사용자 요청: "팟캐스트 부분처럼 성우선택하고 값
설정하는 거 대본 프롬프트 아래에 동일하게 넣으면 되지 않아요? 그리고
동영상 부분은 동영상 관련해서 설정 가능한 걸 넣어주세요." 패턴은
pipelines/common/podcast_voice.py와 완전히 동일(## 헤딩 발행 문서, fresh
DDB 조회·캐시 없음, 실패 시 코드 내 기본값으로 조용히 폴백) —
admin/backend/routes/prompts.py::handle_update가 category/name이
무엇이든 받는 범용 라우트라 여기도 새 백엔드 라우트가 필요 없다
(`POST /admin/prompts/video-settings/published`,
VideoRenderSettingsPanel.tsx의 "발행" 버튼이 부른다).

**성우/엔진은 podcast_voice.py와 정확히 같은 조합표를 쓴다** — 둘 다
같은 AWS Polly 한국어 보이스 제약(`aws polly describe-voices
--language-code ko-KR`로 확인: Jihye=neural만, Seoyeon=generative·
neural·standard 전부)을 받기 때문.

**RATE/VOLUME(2026-09-25 추가)** — 사용자 요청: "팟캐스트 부분처럼..
동일하게 해야죠." 원래는 일부러 뺐었다(pipelines/video/src/lib/tts.ts가
SSML <prosody> 없이 평문 Text=만 보내서 설정을 노출해도 반영이 안
됐음) — 이번에 tts.ts에 실제로 <prosody> 지원을 추가했으므로
podcast_voice.py와 동일한 _VALID_RATES/_VALID_VOLUMES 값 집합·헤딩을
그대로 들여왔다. get_render_env()가 TTS_RATE/TTS_VOLUME 환경변수로
넘기면 tts.ts가 <prosody rate volume>에 그대로 싣는다.

**FORMAT은 video 전용 설정** — pipelines/video/scripts/render.ts가 실제로
받는 `--format vertical|horizontal` 그대로(가로=유튜브·웹 게시용,
세로=쇼츠·릴스용). 기존 render_from_script.py가 "horizontal"로
하드코딩했던 것과 동일한 기본값을 유지한다.

**PROVIDER(2026-09-24 추가)** — 사용자 요청: "가장 우측 부분은...
프로덕션을 위해서 발행하는 공간으로 정의할게요. 따라서, 음성 부분도...
폴리 뿐 아니고 일레븐 랩스도 같이 적용할 수 있도록 해야합니다", "동일한
부분은 동일하게 로직이나 코드 사용할 수 있도록". podcast_voice.py와
정확히 같은 패턴(PROVIDER/ELEVENLABS_VOICE/ELEVENLABS_MODEL 헤딩,
get_render_settings()가 provider 필드까지 포함해 항상 채워진 dict 반환)
— 다만 실제 합성 위치가 다르다: 팟캐스트는 이 파일과 같은 Python
(podcast_voice.synthesize())이 직접 Polly/ElevenLabs를 부르지만, 영상은
Python이 아니라 pipelines/video/src/lib/tts.ts(Node)가 진짜 렌더 TTS를
담당한다. 그래서 get_render_env()(신설)가 "이 설정을 npm run render
서브프로세스에 환경변수로 어떻게 넘길지"까지 한 곳에서 결정한다 —
render_from_script.py와 publish_utils.py::generate_video() 둘 다 이
함수 하나를 불러야, 두 진입점이 각자 환경변수 딕셔너리를 따로
조립하다 어긋나는 일이 없다(이번 요청의 "동일한 부분은 동일하게"에
해당)."""
import os
import re

import boto3

# ELEVENLABS_STABILITY 등 5개(2026-09-24 후속) — 사용자 지적: "폴리는
# 그대로 옵션이 구성되어있지만... 일레븐랩스는 그렇지 않네요... 동일한
# 환경이 되도록 구축해주세요." podcast_voice.py와 정확히 같은 확장 —
# elevenlabs_tts.py::DEFAULT_VOICE_SETTINGS/VOICE_SETTINGS_RANGES와 같은
# 5개 키 그대로 저장, get_render_env()가 ELEVENLABS_* 환경변수로 넘겨
# tts.ts가 소비한다(rate/volume과 달리 SSML이 아니라 API voice_settings
# 바디에 직접 실리는 값이라 tts.ts의 SSML 미지원과 무관하게 실제로 반영됨).
_DOC_HEADINGS = (
    "PROVIDER", "VOICE", "ENGINE", "FORMAT", "RATE", "VOLUME", "ELEVENLABS_VOICE", "ELEVENLABS_MODEL",
    "ELEVENLABS_STABILITY", "ELEVENLABS_SIMILARITY_BOOST", "ELEVENLABS_STYLE", "ELEVENLABS_SPEED", "ELEVENLABS_SPEAKER_BOOST",
)
_DOC_HEADING_RE = re.compile(
    r"^##\s+(PROVIDER|VOICE|ENGINE|FORMAT|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|"
    r"ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST)\s*$"
)

_VALID_PROVIDERS = ("polly", "elevenlabs")
_DEFAULT_PROVIDER = "polly"  # 명시적으로 안 바꾸면 지금까지처럼 Polly — 기존 동작 유지

# 실제 AWS 지원 조합 — podcast_voice.py::_VOICE_ENGINE_OPTIONS와 동일 근거.
_VOICE_ENGINE_OPTIONS = {
    "Seoyeon": ("generative", "neural", "standard"),
    "Jihye": ("neural",),
}
_DEFAULT_VOICE = "Seoyeon"  # tts.ts::DEFAULT_VOICE 기존 기본값과 동일
_DEFAULT_ENGINE = "generative"
_VALID_FORMATS = ("horizontal", "vertical")
_DEFAULT_FORMAT = "horizontal"  # render_from_script.py 기존 하드코딩값과 동일

# podcast_voice.py::_VALID_RATES/_VALID_VOLUMES와 동일한 값 집합(같은 SSML
# <prosody> 속성이 받는 값이라 다를 이유가 없다).
_VALID_RATES = ("80%", "90%", "100%", "110%", "120%")
_DEFAULT_RATE = "100%"
_VALID_VOLUMES = ("-6dB", "-3dB", "+0dB", "+3dB", "+6dB")
_DEFAULT_VOLUME = "+0dB"

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
_POLLY_MAX_CHARS = 2800  # podcast_voice.py와 동일 근거

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
    다 없어도 ValueError를 안 던진다(podcast_voice.py와 같은 이유 — 필수
    값이 아니라 기본값으로 조용히 채우면 되는 가벼운 설정)."""
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
    """DDB(PROMPT#video-settings/published)에서 fresh하게 읽는다 — 캐시
    없음(podcast_voice.py와 같은 이유). 문서가 아예 없거나 조회 자체가
    실패해도 영상 생성을 막으면 안 되므로 조용히 폴백."""
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
    """실제 렌더(pipelines/video/render_from_script.py, 발행 파이프라인의
    pipelines/common/publish_utils.py::generate_video 둘 다)가 지금 써야
    할 설정. admin이 발행한 값을 매번 fresh하게 읽는다(캐시 없음) —
    관리자가 CMS에서 저장하면 재배포 없이 다음 렌더부터 반영된다.

    반환: {"provider": "polly"|"elevenlabs", "voice": "Seoyeon"|"Jihye",
    "engine": "generative"|"neural"|"standard",
    "format": "horizontal"|"vertical", "elevenlabs_voice": str,
    "elevenlabs_model": str, "elevenlabs_voice_settings": dict} — 전부
    항상 채워진 값(elevenlabs_voice_settings만 예외 — 저장 안 된 키는
    빠져 있고, tts.ts 쪽에서 자기 기본값으로 채운다). 실제로 npm run
    render 서브프로세스에 넘길 환경변수 모양까지 필요하면 get_render_env()를
    쓸 것(이 함수를 감싼다).

    override(2026-09-25 추가, 사용자 리포트 — "일레븐 랩스를 선택하고
    영상을 생성했는데... 영상에 담긴거는 polly 음성이 선택이 되어서
    나왔네요") — CMS 영상 탭 카드(VideoCardGenerator.tsx)가 "성우
    미리듣기"에서 고른 provider/voice를 실제 영상 렌더에도 그대로
    반영하고 싶을 때, 발행된 값 대신 쓸 값을 여기 담아 넘긴다(사용자
    선택: "카드 선택대로 실제 영상도 렌더"). None이 아닌 키만 발행값
    위에 덮어쓴다 — chat_ws.py::_run_render_video_flow가 조립해
    render_from_script.py의 --settings-override로 전달한다. 발행
    파이프라인(publish_utils.py::generate_video, 매일 자동 발행)은
    override를 안 넘기므로 이 변경과 무관하게 항상 발행된 설정만 쓴다."""
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
    """get_render_settings()를 `npm run render`(pipelines/video/scripts/
    render.ts → src/lib/tts.ts) 서브프로세스에 그대로 넘길 환경변수
    딕셔너리로 바꾼다. render_from_script.py와 publish_utils.py::
    generate_video() 둘 다 각자 딕셔너리를 조립하는 대신 이 함수 하나를
    불러야 한다(2026-09-24, 사용자 요청 — "동일한 부분은 동일하게
    로직이나 코드 사용할 수 있도록 구조를 짜고") — 진입점이 두 곳이라
    로직이 갈라지면 한쪽만 고쳐지는 사고가 나기 쉽다.

    override(2026-09-25 추가) — get_render_settings()에 그대로 전달한다,
    그쪽 docstring 참고.

    provider가 "elevenlabs"면 elevenlabs_tts.get_api_key()로 Secrets
    Manager에서 키를 한 번 읽어 ELEVENLABS_API_KEY로 얹는다 — tts.ts는
    AWS SDK 없이 이 값을 그대로 헤더에 꽂기만 한다(새 npm 의존성 불필요,
    tts.ts 상단 주석 참고). FORMAT은 여기 안 넣는다 — render.ts가
    --format CLI 인자로 따로 받는다(기존 방식 유지).

    stability/similarity_boost/style/speed/speaker_boost(2026-09-24 후속,
    "동일한 환경이 되도록") — elevenlabs_tts.py의 _clamp_voice_settings()와
    같은 기본값·범위로 tts.ts 쪽에서 직접 클램프한다(env var는 항상
    문자열이라 여기서 미리 안전한 값으로 바꿔 넘길 필요는 없음 — 클램프
    로직을 두 언어에 각각 두는 대신, 저장 안 된 키가 없으면 tts.ts가 그냥
    자기 기본값을 쓰게 비워둔다)."""
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
    """text → mp3 bytes. 2026-09-24, CMS "성우 미리듣기"(admin/backend/
    routes/chat_ws.py) 전용 신설 — Polly 경로는 실제 렌더(pipelines/video/
    src/lib/tts.ts)와 똑같은 방식으로 호출해야 "미리듣기"가 실제 렌더
    결과와 같은 소리를 낸다(미리듣기의 존재 이유).

    2026-09-25 — tts.ts가 SSML <prosody> 지원을 실제로 갖추면서(사용자
    요청: "팟캐스트 부분처럼.. 동일하게 해야죠") 이 함수도 podcast_voice.
    synthesize()와 동일하게 SSML로 바꿨다 — rate/volume 인자 추가, 아래
    _synthesize_polly()가 <prosody>로 감싼다.

    voice/engine(2026-09-24 추가) — podcast_voice.synthesize()와 같은
    이유(사용자 요청: "폴리를 클릭했을때 튜닝할 수 있는거는 합치면
    좋겠네요"): 카드별로 발행 설정과 다른 조합을 일회성으로 시험해볼 수
    있게 한다(항상 Polly로 — 이 함수 호출부가 명시적으로 Polly를
    의도하는 경우). 잘못된 조합이면 조용히 발행 설정으로 폴백. rate/
    volume도 같은 원리 — voice/engine 오버라이드와 별개로 값이 오면
    그대로 쓰고, 없으면 _DEFAULT_RATE/_DEFAULT_VOLUME으로 폴백한다.

    2026-09-24(같은 날 후속) — voice/engine 오버라이드가 없으면(발행
    설정 그대로 쓰는 기본 호출) 발행 설정의 provider를 본다.
    "elevenlabs"면 elevenlabs_tts.py로 위임(podcast_voice.synthesize()와
    동일 구조 — 사용자 요청: "동일한 부분은 동일하게"). 실제 렌더
    (tts.ts)의 ElevenLabs 경로는 별도 구현이지만(Node), 이 미리듣기
    함수는 그것과 별개로 Python REST 호출을 그대로 쓴다."""
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
    """podcast_voice.py::_synthesize_polly와 동일 패턴(2026-09-25) —
    <prosody rate volume>으로 감싼 SSML. rate/volume은 닫힌 값 집합
    (_VALID_RATES/_VALID_VOLUMES)에서만 오므로 이스케이프 불필요, 내레이션
    텍스트만 이스케이프한다."""
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

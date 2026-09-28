"""팟캐스트 음성 설정 — admin DB 발행 문서(PROMPT#podcast-voice/published).

2026-09-22 신설 — 사용자 요청: "팟캐스트도... 성우를 선택하거나... 값을
조정하거나 할 수 있지 않을까요? 웹툰이랑 동일한 구조로 짜주시죠."
pipelines/common/webtoon_image.py의 admin 발행 문서 패턴(## 헤딩으로 값을
직렬화, fresh DDB 조회·캐시 없음, 실패 시 코드 내 기본값으로 조용히
폴백)을 그대로 따른다 — admin/backend/routes/prompts.py::handle_update가
category/name이 무엇이든 받는 범용 라우트라 여기도 새 백엔드 라우트 없이
재사용한다(`POST /admin/prompts/podcast-voice/published`,
PodcastVoiceSettingsPanel.tsx의 "발행" 버튼이 부른다).

**엔진은 성우에 종속된 고정값이 아니다(2026-09-22 정정)** — 처음엔
pipeline.py 모듈 docstring(2026-08-27 항목, "Seoyeon/generative 기본값
승격")만 보고 "성우 하나당 엔진 하나"로 잘못 단순화했었다. 사용자가
"다른 값들은 정말 없었냐"고 재확인을 요청해 `aws polly describe-voices
--language-code ko-KR`로 직접 조회한 결과:
    Jihye  — SupportedEngines: neural
    Seoyeon — SupportedEngines: generative, neural, standard
Jihye는 정말 neural 하나뿐이지만, Seoyeon은 세 엔진을 전부 지원한다 —
같은 "서연" 목소리로도 standard(가장 저렴·기계적)/neural/generative(가장
자연스러움·2026-08-27 비용 비교의 기준) 중 고를 수 있다는 뜻이라, ENGINE을
VOICE와 독립된 별도 헤딩으로 뒀다. _VOICE_ENGINE_OPTIONS가 그 실제
AWS 지원 조합표 — 이 표 밖의 (voice, engine) 조합은 저장 자체가 막힌다
(parse_prompt_doc이 검증).

rate/volume만 노출하고 pitch를 안 넣은 이유 — AWS 문서 확인(2026-09-22,
docs.aws.amazon.com/polly/latest/dg/prosody-tag.html): generative·neural
엔진은 SSML <prosody>의 rate·volume은 지원하지만 pitch는 지원하지 않는다.

**synthesize()(2026-09-22 추가)** — 원래 pipelines/podcast/pipeline.py
안에 있던 `_polly()`/`_split_for_polly()`/`_synthesize_polly()`를 여기로
옮겼다. 사용자가 CMS 프롬프트 실험 화면에서 "대본만 텍스트로 나오는데
음성도 들을 수 있으면 좋겠다"고 요청 — admin/backend(routes/chat_ws.py의
새 "synthesize_audio" WS kind)도 실제 발행 파이프라인과 정확히 같은
합성 로직을 불러야 진짜 미리듣기가 된다(webtoon_image.py::
generate_cut_image()가 admin 실험 패널과 발행 파이프라인 양쪽에서 공유되는
것과 같은 이유 — 정리후보 A 선례). admin/backend/deploy-admin-api.sh가
이 파일 전체를 zip 루트에 flat-copy한다(WEBTOON_IMAGE_MODULE과 같은
패턴) — admin Lambda가 이 모듈을 통째로 필요로 하므로 개별 함수만 복사한
webtoon_image.py보다 오히려 더 간단하다."""
import os
import re
from xml.sax.saxutils import escape as _xml_escape

import boto3

_AWS_PROFILE = os.environ.get("AWS_PROFILE")
_REGION = os.environ.get("AWS_REGION", "us-east-1")
# 동기 SynthesizeSpeech API 실제 상한은 3,000자 — 여유를 두고 이 아래에서 문장
# 경계로 쪼갠다(실측 대본 평균 1,386자·최대 1,815자라 지금은 거의 안 걸리지만,
# 프롬프트가 바뀌어 길어져도 조용히 잘리지 않게 방어).
_POLLY_MAX_CHARS = 2800

_polly_client = None

# 2026-09-24, 사용자 요청 — "가장 우측 부분은... 프로덕션을 위해서 발행
# 하는 공간으로 정의할게요. 따라서, 음성 부분도... 폴리 뿐 아니고
# 일레븐 랩스도 같이 적용할 수 있도록 해야합니다": PROVIDER 헤딩을
# 추가해 실제 발행(get_voice_settings()가 읽는 이 문서)에서도
# ElevenLabs를 고를 수 있게 한다 — 2026-08-27에 비용 때문에 ElevenLabs→
# Polly로 전환했던 결정을 관리자가 다시 명시적으로 뒤집는 것(CMS 실험
# 패널에서만 쓰던 elevenlabs_tts.py를 이제 이 함수, 즉 실제
# pipelines/podcast/pipeline.py 발행 경로에서도 부를 수 있다).
# ELEVENLABS_VOICE/ELEVENLABS_MODEL은 elevenlabs_tts.py::VOICES/MODELS의
# id 값을 그대로 저장한다.
#
# ELEVENLABS_STABILITY 등 5개(2026-09-24 후속) — 사용자 지적: "폴리는
# 그대로 옵션이 구성되어있지만... 일레븐랩스는 그렇지 않네요... 동일한
# 환경이 되도록 구축해주세요." Polly는 VOICE/ENGINE/RATE/VOLUME 다 여기서
# 고를 수 있는데 ElevenLabs는 성우·모델뿐이었던 걸 맞춘다 — elevenlabs_tts.py
# ::DEFAULT_VOICE_SETTINGS/VOICE_SETTINGS_RANGES와 같은 5개 키
# (stability/similarity_boost/style/speed/use_speaker_boost) 그대로 저장.
_DOC_HEADINGS = (
    "PROVIDER", "VOICE", "ENGINE", "RATE", "VOLUME", "ELEVENLABS_VOICE", "ELEVENLABS_MODEL",
    "ELEVENLABS_STABILITY", "ELEVENLABS_SIMILARITY_BOOST", "ELEVENLABS_STYLE", "ELEVENLABS_SPEED", "ELEVENLABS_SPEAKER_BOOST",
)
_DOC_HEADING_RE = re.compile(
    r"^##\s+(PROVIDER|VOICE|ENGINE|RATE|VOLUME|ELEVENLABS_VOICE|ELEVENLABS_MODEL|"
    r"ELEVENLABS_STABILITY|ELEVENLABS_SIMILARITY_BOOST|ELEVENLABS_STYLE|ELEVENLABS_SPEED|ELEVENLABS_SPEAKER_BOOST)\s*$"
)

_VALID_PROVIDERS = ("polly", "elevenlabs")
_DEFAULT_PROVIDER = "polly"  # 명시적으로 안 바꾸면 지금까지처럼 Polly — 기존 동작 유지

# 실제 AWS 지원 조합(2026-09-22, `aws polly describe-voices --language-code
# ko-KR`로 직접 확인) — 이 밖의 (voice, engine) 조합은 Polly가 애초에
# 거부한다.
_VOICE_ENGINE_OPTIONS = {
    "Seoyeon": ("generative", "neural", "standard"),
    "Jihye": ("neural",),
}
_DEFAULT_VOICE = "Seoyeon"  # 2026-08-27 결정 그대로 — 기존 동작과 동일한 기본값
_DEFAULT_ENGINE = "generative"  # 위와 동일 — Seoyeon+generative가 기존 하드코딩값
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
    webtoon_image.parse_prompt_doc과 달리 여긴 ValueError를 안 던진다 —
    STYLE/CHARACTER처럼 "없으면 발행물 자체가 의미 없는 필수 값"이 아니라,
    다 없어도 그냥 기본값으로 조용히 채우면 되는 가벼운 설정이라서다.
    voice/engine 조합이 _VOICE_ENGINE_OPTIONS에 실제로 없는 값(예:
    Jihye+generative — Polly가 지원 안 함)이면 engine을 통째로 비워
    호출부가 그 voice의 기본 엔진으로 채우게 한다. elevenlabs_voice/model/
    voice_settings는 여기서 검증 안 한다(elevenlabs_tts를 이 파일이 top-level
    import하면 순환 의존이라 — resolve는 elevenlabs_tts.synthesize()의
    _clamp_voice_settings()가 이미 하고 있다, get_voice_settings()도 참고)."""
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
    # None 값은 아예 키를 빼서 elevenlabs_tts._clamp_voice_settings()가
    # DEFAULT_VOICE_SETTINGS로 채우게 한다(값이 없다=명시적으로 저장 안 됨).
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
    """DDB(PROMPT#podcast-voice/published)에서 fresh하게 읽는다 — 캐시
    없음(webtoon_image.py와 같은 이유). 문서가 아예 없거나(옛 발행 전)
    조회 자체가 실패해도 팟캐스트 생성을 막으면 안 되므로 조용히 폴백."""
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
    """실제 발행 파이프라인(pipelines/podcast/pipeline.py)이 지금 써야 할
    음성 설정. admin이 발행한 값을 매번 fresh하게 읽는다(캐시 없음) —
    관리자가 CMS에서 저장하면 재배포 없이 다음 합성부터 반영된다.

    반환: {"provider": "polly"|"elevenlabs", "voice": "Seoyeon"|"Jihye",
    "engine": "generative"|"neural"|"standard", "rate": "100%" 형식,
    "volume": "+0dB" 형식, "elevenlabs_voice": str, "elevenlabs_model": str,
    "elevenlabs_voice_settings": dict} — 전부 항상 채워진 값이라 호출부가
    별도 폴백을 신경 쓸 필요 없다(elevenlabs_voice_settings만 예외 —
    저장 안 된 키는 빠져 있고, elevenlabs_tts.synthesize()의
    _clamp_voice_settings()가 그 자리를 기본값으로 채운다).
    provider="elevenlabs"일 때도 voice/engine/rate/volume은 그대로
    Polly 기본값으로 채워둔다(호출부가 provider 무관하게 dict 구조를
    똑같이 다룰 수 있게, synthesize()가 실제로 쓰는 건 provider에 맞는
    필드뿐). engine이 비어 있으면(발행 문서에 없거나 그 voice가 지원
    안 하는 값) voice==_DEFAULT_VOICE일 때만 _DEFAULT_ENGINE, 그 외에는
    그 voice가 지원하는 첫 엔진으로 채운다."""
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
    """_POLLY_MAX_CHARS 이하 조각으로 문장 경계에서 나눈다(문장이 그 자체로
    한도를 넘는 극단적 경우엔 그 문장 하나만 통째로 넘는 조각이 된다 —
    Polly가 그 조각에서 에러를 내면 그대로 실패해서 눈에 띄게 한다)."""
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
        # SSML <prosody>로 rate/volume을 반영 — 기본값(100%/+0dB)일 때는
        # 예전 Text= 평문 호출과 들리는 결과가 동일하다. 청크는 이미 문장
        # 경계로 쪼개져 있어(_split_for_polly) "온전한 문장 단위로만
        # prosody를 쓸 수 있다"는 generative 엔진 제약과 맞는다.
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
    """text → mp3 bytes. voice/engine/rate/volume을 안 주면(기본, 실제
    발행 파이프라인이 부르는 방식) 지금 발행된 CMS 음성 설정
    (get_voice_settings())을 그대로 쓴다 — 발행 파이프라인
    (pipelines/podcast/pipeline.py)과 admin CMS 음성 미리듣기(admin/
    backend/routes/chat_ws.py) 양쪽이 이 함수 하나를 공유한다.

    2026-09-24 추가 — CMS "음성 생성" 카드가 Polly를 고르고도 발행 설정
    하나로만 고정돼 있어서(카드별 실험이 안 됨) 사용자가 지적: "폴리를
    클릭했을때 튜닝할 수 있는거는 합치면 좋겠네요"(ElevenLabs 카드처럼
    카드마다 독립적으로 값을 바꿔가며 비교하고 싶다는 뜻). voice/engine을
    명시적으로 주면(이 함수 호출부 — CMS "Polly" 카드 — 가 항상 Polly를
    의도하는 경우) 발행 설정의 provider가 무엇이든 무시하고 Polly로,
    그 값 그대로 합성한다 — 단, _VOICE_ENGINE_OPTIONS에 없는 조합이면
    조용히 무시하고 발행 설정으로 되돌아간다. 이 오버라이드는 저장되지
    않는다 — 실제 발행 설정(get_voice_settings()가 읽는 DDB 문서)은
    전혀 안 건드린다.

    2026-09-24(같은 날 후속) — 사용자 요청: "가장 우측 부분은...
    프로덕션을 위해서 발행하는 공간으로 정의할게요. 따라서... 폴리
    뿐 아니고 일레븐 랩스도 같이 적용할 수 있도록 해야합니다": voice/
    engine 오버라이드가 없으면(즉 발행 설정 그대로 쓰는 기본 호출 —
    pipelines/podcast/pipeline.py가 매일 자동 발행 때 부르는 방식)
    발행 설정의 provider를 본다. "elevenlabs"면 elevenlabs_tts.py로
    위임 — 2026-08-27에 비용 때문에 이 파이프라인을 ElevenLabs에서
    Polly로 전환했던 결정을, 관리자가 CMS에서 명시적으로 다시 켤 수
    있게 됐다(elevenlabs_tts.py 모듈 docstring도 더는 "CMS 실험
    전용"이 아니게 됐음을 참고)."""
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

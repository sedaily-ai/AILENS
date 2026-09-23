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

_DOC_HEADINGS = ("VOICE", "ENGINE", "RATE", "VOLUME")
_DOC_HEADING_RE = re.compile(r"^##\s+(VOICE|ENGINE|RATE|VOLUME)\s*$")

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


def serialize_prompt_doc(voice: str, engine: str, rate: str, volume: str) -> str:
    """네 값 → DDB에 저장할 content 문자열. parse_prompt_doc의 역함수."""
    parts = {"VOICE": voice.strip(), "ENGINE": engine.strip(), "RATE": rate.strip(), "VOLUME": volume.strip()}
    return "\n\n".join(f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS)


def parse_prompt_doc(content: str) -> tuple[str, str, str, str]:
    """content → (voice, engine, rate, volume). webtoon_image.parse_prompt_doc과
    달리 여긴 ValueError를 안 던진다 — STYLE/CHARACTER처럼 "없으면 발행물
    자체가 의미 없는 필수 값"이 아니라, 넷 다 없어도 그냥 기본값으로
    조용히 채우면 되는 가벼운 설정이라서다. voice/engine 조합이
    _VOICE_ENGINE_OPTIONS에 실제로 없는 값(예: Jihye+generative — Polly가
    지원 안 함)이면 engine을 통째로 비워 호출부가 그 voice의 기본
    엔진으로 채우게 한다."""
    buckets: dict[str, list[str]] = {h: [] for h in _DOC_HEADINGS}
    current: str | None = None
    for line in content.split("\n"):
        m = _DOC_HEADING_RE.match(line.strip())
        if m:
            current = m.group(1)
            continue
        if current:
            buckets[current].append(line)
    voice, engine, rate, volume = (("\n".join(buckets[h])).strip() for h in _DOC_HEADINGS)
    if voice not in _VOICE_ENGINE_OPTIONS:
        voice = ""
    if voice == "" or engine not in _VOICE_ENGINE_OPTIONS.get(voice, ()):
        engine = ""
    if rate not in _VALID_RATES:
        rate = ""
    if volume not in _VALID_VOLUMES:
        volume = ""
    return voice, engine, rate, volume


def _load_prompt_doc() -> tuple[str, str, str, str]:
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
        return ("", "", "", "")


def get_voice_settings() -> dict:
    """실제 발행 파이프라인(pipelines/podcast/pipeline.py)이 지금 써야 할
    음성 설정. admin이 발행한 값을 매번 fresh하게 읽는다(캐시 없음) —
    관리자가 CMS에서 저장하면 재배포 없이 다음 합성부터 반영된다.

    반환: {"voice": "Seoyeon"|"Jihye",
    "engine": "generative"|"neural"|"standard", "rate": "100%" 형식,
    "volume": "+0dB" 형식} — 전부 항상 채워진 값이라 호출부가 별도
    폴백을 신경 쓸 필요 없다. engine이 비어 있으면(발행 문서에 없거나
    그 voice가 지원 안 하는 값) voice==_DEFAULT_VOICE일 때만
    _DEFAULT_ENGINE, 그 외에는 그 voice가 지원하는 첫 엔진으로 채운다."""
    voice, engine, rate, volume = _load_prompt_doc()
    voice = voice or _DEFAULT_VOICE
    if not engine:
        engine = _DEFAULT_ENGINE if voice == _DEFAULT_VOICE else _VOICE_ENGINE_OPTIONS[voice][0]
    return {
        "voice": voice,
        "engine": engine,
        "rate": rate or _DEFAULT_RATE,
        "volume": volume or _DEFAULT_VOLUME,
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


def synthesize(text: str) -> bytes:
    """text → mp3 bytes, 지금 발행된 CMS 음성 설정(get_voice_settings())
    그대로. 발행 파이프라인(pipelines/podcast/pipeline.py)과 admin CMS
    음성 미리듣기(admin/backend/routes/chat_ws.py) 양쪽이 이 함수 하나를
    공유한다 — 실제 자동 발행과 100% 같은 소리가 나야 "미리듣기"가
    의미 있어서다."""
    settings = get_voice_settings()  # admin CMS에서 fresh 조회(캐시 없음)
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

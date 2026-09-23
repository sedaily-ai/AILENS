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
neural·standard 전부)을 받기 때문. **rate/volume은 일부러 안 넣었다** —
pipelines/video/src/lib/tts.ts는 podcast/pipeline.py와 달리 SSML
<prosody>로 텍스트를 감싸지 않아서(평문 Text=만 보냄), 지금 코드로는
설정을 노출해도 실제로 반영이 안 된다. 반영 안 되는 값을 보여주는 건
사용자를 속이는 것과 같아서, tts.ts에 prosody 지원을 실제로 추가하기
전까지는 뺀다.

**FORMAT은 video 전용 설정** — pipelines/video/scripts/render.ts가 실제로
받는 `--format vertical|horizontal` 그대로(가로=유튜브·웹 게시용,
세로=쇼츠·릴스용). 기존 render_from_script.py가 "horizontal"로
하드코딩했던 것과 동일한 기본값을 유지한다."""
import re

_DOC_HEADINGS = ("VOICE", "ENGINE", "FORMAT")
_DOC_HEADING_RE = re.compile(r"^##\s+(VOICE|ENGINE|FORMAT)\s*$")

# 실제 AWS 지원 조합 — podcast_voice.py::_VOICE_ENGINE_OPTIONS와 동일 근거.
_VOICE_ENGINE_OPTIONS = {
    "Seoyeon": ("generative", "neural", "standard"),
    "Jihye": ("neural",),
}
_DEFAULT_VOICE = "Seoyeon"  # tts.ts::DEFAULT_VOICE 기존 기본값과 동일
_DEFAULT_ENGINE = "generative"
_VALID_FORMATS = ("horizontal", "vertical")
_DEFAULT_FORMAT = "horizontal"  # render_from_script.py 기존 하드코딩값과 동일


def serialize_prompt_doc(voice: str, engine: str, fmt: str) -> str:
    """세 값 → DDB에 저장할 content 문자열. parse_prompt_doc의 역함수."""
    parts = {"VOICE": voice.strip(), "ENGINE": engine.strip(), "FORMAT": fmt.strip()}
    return "\n\n".join(f"## {h}\n{parts[h]}" for h in _DOC_HEADINGS)


def parse_prompt_doc(content: str) -> tuple[str, str, str]:
    """content → (voice, engine, format). 셋 다 없어도 ValueError를 안
    던진다(podcast_voice.py와 같은 이유 — 필수 값이 아니라 기본값으로
    조용히 채우면 되는 가벼운 설정)."""
    buckets: dict[str, list[str]] = {h: [] for h in _DOC_HEADINGS}
    current: str | None = None
    for line in content.split("\n"):
        m = _DOC_HEADING_RE.match(line.strip())
        if m:
            current = m.group(1)
            continue
        if current:
            buckets[current].append(line)
    voice, engine, fmt = (("\n".join(buckets[h])).strip() for h in _DOC_HEADINGS)
    if voice not in _VOICE_ENGINE_OPTIONS:
        voice = ""
    if voice == "" or engine not in _VOICE_ENGINE_OPTIONS.get(voice, ()):
        engine = ""
    if fmt not in _VALID_FORMATS:
        fmt = ""
    return voice, engine, fmt


def _load_prompt_doc() -> tuple[str, str, str]:
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
        return ("", "", "")


def get_render_settings() -> dict:
    """실제 렌더(pipelines/video/render_from_script.py, 발행 파이프라인의
    pipelines/common/publish_utils.py::generate_video 둘 다)가 지금 써야
    할 설정. admin이 발행한 값을 매번 fresh하게 읽는다(캐시 없음) —
    관리자가 CMS에서 저장하면 재배포 없이 다음 렌더부터 반영된다.

    반환: {"voice": "Seoyeon"|"Jihye",
    "engine": "generative"|"neural"|"standard",
    "format": "horizontal"|"vertical"} — 전부 항상 채워진 값."""
    voice, engine, fmt = _load_prompt_doc()
    voice = voice or _DEFAULT_VOICE
    if not engine:
        engine = _DEFAULT_ENGINE if voice == _DEFAULT_VOICE else _VOICE_ENGINE_OPTIONS[voice][0]
    return {"voice": voice, "engine": engine, "format": fmt or _DEFAULT_FORMAT}

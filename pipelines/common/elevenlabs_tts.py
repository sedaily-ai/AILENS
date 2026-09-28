"""ElevenLabs 텍스트 음성 변환 — 2026-09-24 CMS 프롬프트랩 실험용으로
신설(사용자 요청: "음성도 모델들 보여지면 좋겠는데... 일레븐랩스...
선택할 수 있도록"). 같은 날 후속 요청으로 실제 발행 경로에도 열렸다:
"가장 우측 부분은... 프로덕션을 위해서 발행하는 공간으로 정의할게요.
따라서... 폴리 뿐 아니고 일레븐 랩스도 같이 적용할 수 있도록 해야합니다."

**팟캐스트 발행**(pipelines/podcast/pipeline.py → podcast_voice.synthesize())
은 발행 설정(PodcastVoiceSettingsPanel.tsx가 저장하는 PROVIDER 헤딩)이
"elevenlabs"면 이 모듈을 실제로 호출한다 — 2026-08-27에 비용 때문에
(ElevenLabs 월 $95.81 vs Polly generative 월 $17, 약 82% 절감)
ElevenLabs→Polly로 전환했던 결정을, 관리자가 CMS에서 명시적으로 다시
켤 수 있다는 뜻이다(기본값은 여전히 Polly — 아무도 안 건드리면 예전과
동일하게 동작).

**영상 발행**의 실제 TTS는 Python이 아니라 pipelines/video/src/lib/tts.ts
(Node)에 있어서 이 모듈을 직접 호출하지 않는다 — 대신 render_from_script.py/
publish_utils.py::generate_video()가 video_settings.get_render_env()를
통해 이 모듈의 get_api_key()로 얻은 키를 ELEVENLABS_API_KEY 환경변수로
Node 프로세스에 넘기고, tts.ts가 이 모듈과 "의도적으로 같은 모양"인
REST 호출(엔드포인트·바디·헤더 동일, tts.ts 상단 주석 참고)을 직접
한다 — Node에 새 npm 의존성을 안 넣기 위한 선택.

CMS "성우 미리듣기" 실험 패널에서 부를 때는 voice_id/model_id를 매
요청마다 그때그때 넘겨받을 뿐 아무 데도 저장하지 않는다(카드별 일회성
값) — 반면 podcast_voice.get_voice_settings()를 거쳐 부를 때는 DDB에
저장된 실제 발행 설정을 쓴다. 이 모듈 자신은 그 차이를 모른다 — 그냥
voice_id/model_id를 받아 합성만 한다.

API 키는 Secrets Manager `ai-labs/elevenlabs`({"api_key": "sk_..."} 형태) —
service/backend/handlers/voice/tts.py(별개 기능, mbti 페르소나 음성대화)의
_get_elevenlabs_api_key()와 같은 시크릿을 공유한다.
"""
import json
import os
import urllib.error
import urllib.request

import boto3

_API_BASE = "https://api.elevenlabs.io/v1"
_SECRET_ID = os.environ.get("ELEVENLABS_SECRET_ID", "ai-labs/elevenlabs")
# 2026-09-24 — 30초였다가 5분(300초)으로 올림. VideoCardGenerator.tsx의
# 통합 입력창(같은 날 신설)이 렌더용 JSON을 붙여넣으면 extractNarration()이
# 모든 컷의 narration을 이어붙여 "성우 미리듣기" 한 번에 보내는데, 9컷짜리
# 실제 각본(약 600자)을 ElevenLabs로 합성하다 정확히 30.0초에 TimeoutError:
# "The read operation timed out"로 실패한 사례를 CloudWatch에서 확인
# (admin Lambda REPORT Duration 30400.56ms, format=video·provider=elevenlabs).
# 사용자 판단: "실제로 동영상 생성할 때" 벌어진 일이라 미리듣기 텍스트를
# 짧게 자르기보다(전체를 미리 들어보는 게 유용) 타임아웃 자체를 넉넉히
# 주는 쪽을 택함("5분으로 맞춰도 되지 않나요?") — admin Lambda 자체
# 타임아웃이 900초라 여유가 크다(chat_ws.py가 InvocationType="Event"로
# 비동기 재호출해 API Gateway 통합 타임아웃과도 무관).
_TIMEOUT_SECONDS = 300

# 2026-09-24 — 계정에 실제 존재하는(list-voices로 확인) 한국어 라벨 성우
# 262개 중, 팟캐스트 톤에 맞고 설명이 분명한 것만 8개(남/여 각 4) 추렸다.
# 나머지(민철/소율/준서/하은 등)는 MBTI 페르소나 등 다른 프로젝트가 이미
# 쓰고 있는 커스텀 성우라 여기 목록에서 뺐다 — 섞이면 혼란만 는다.
#
# sample_url(2026-09-24 추가, 사용자 요청: "성우들 드롭다운열면... 간단한
# 인삿말로.. 미리듣기 할 수 있도록.. 재생버튼") — 성우당 짧은 인삿말
# ("안녕하세요, 반갑습니다.")을 기본 모델(eleven_multilingual_v2)·기본
# voice_settings로 미리 한 번 합성해 공개 S3(CMS 미디어 버킷과 동일,
# webtoon_jobs.py가 쓰는 것과 같은 버킷)에 올려뒀다. 드롭다운을 열
# 때마다 ElevenLabs를 실시간 호출하지 않고 이 고정 URL을 그대로 재생만
# 한다 — 매번 호출하면 크레딧 낭비고, 드롭다운을 여는 것만으로 과금될
# 이유도 없다. 재생성하려면 이 파일 옆 스크립트 없이 그냥 파이썬 REPL에서
# elevenlabs_tts.synthesize(GREETING, voice_id=v)를 돌려 같은 키로 다시
# 올리면 된다.
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

# 2026-09-24(후속) — 사용자 요청: "여러 모델들이있는데... 최신 모델을만
# 선별해줄 수 있나요? 혹은 좋은 모델 3개정도로만" — GET /v1/models로 각
# 모델의 실제 설명·can_use_style/can_use_speaker_boost 플래그를 직접 확인
# 하고 5개→3개로 추렸다:
#   - eleven_storytel_v2: 응답 description이 문자 그대로 "Model for
#     Storytel"(오디오북 회사 전용 커스텀 모델) — 범용이 아니라서 제외.
#   - eleven_flash_v2_5: turbo_v2_5와 스펙이 거의 겹쳐서(둘 다 저지연,
#     style/speaker_boost 미지원) 하나만 남기고 제외 — turbo 쪽 설명이
#     "고품질+비영어권 특화"로 우리 용도(한국어)에 더 맞는다고 판단.
# 남은 3개도 supports_style/supports_speaker_boost 값을 API 응답 그대로
# 박아뒀다 — 프론트가 이 값으로 "스타일 과장"/"스피커 부스트" 컨트롤을
# 모델별로 숨긴다(그 값을 안 받는 모델에 보내도 에러 없이 조용히
# 무시될 뿐이라, 안 보여주는 게 맞다 — 직접 호출로 확인).
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


# 2026-09-24, 사용자 요청 — "일래븐 랩스쪽은.. 폴리처럼.. 파라미터들?
# 피치나 속도나.. 조정하도록 하는건 안되는건가요" → "어던 것들을 제어할
# 수 있는지 봐주실랴요? 포함 시켜야 합니다": GET /v1/voices/{id}/settings
# 로 실제 스키마를 직접 확인(추측 금지) — pitch는 존재하지 않는
# 파라미터(보내도 조용히 무시됨, 400도 안 남 — 그래서 이 dict에 일부러
# 안 넣었다). 아래 5개가 API가 실제로 검증하는 전부(범위도 전부 경계값
# 테스트로 직접 확인):
#   stability          0.0~1.0  (낮을수록 표현이 풍부·불안정, 높을수록 단조·일관)
#   similarity_boost   0.0~1.0  (원본 성우 톤 충실도)
#   style              0.0~1.0  (감정 과장 정도)
#   use_speaker_boost  bool
#   speed              0.7~1.2  (그 밖의 값은 400 Invalid setting)
# GET /v1/voices/{id}/settings가 돌려준 기본값 그대로 default로 쓴다.
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

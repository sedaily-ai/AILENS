"""Bedrock 추론 프로파일(application inference profile) ARN 정본.

모든 파이프라인의 모델 지정은 여기 별칭으로만 한다 — ARN 문자열을 코드에 복사하지 않는다.
복사본이 어긋나 IAM 정책에서 빠진 프로파일을 호출하면 오류가 폴백에 가려진다(2026-10-12 제목 생성 사고).
모델 교체는 이 표만 고친다. 임시 교체는 환경변수 BEDROCK_MODEL_<별칭 대문자>로 덮어쓴다.
task-policy.json이 이 표와 어긋나지 않는지는 test_bedrock_models.py가 검사한다.
비용 태그(Service=lens 등)는 프로파일 생성 시 붙인다(docs/architecture/비용태깅_규칙.md).
"""
import os

ACCOUNT_ID = "887078546492"

# 별칭 → (리전, 프로파일 ID, 프로파일 이름)
PROFILES = {
    "letters_sonnet5": ("us-east-1", "dt2qj8drli0n", "lens-letters-sonnet-5"),
    "letters_sonnet46": ("us-east-1", "nrr81xvevv5k", "lens-letters-sonnet-46"),
    "podcast_sonnet5": ("us-east-1", "3qaaegkca5yz", "lens-podcast-sonnet-5"),
    "video_sonnet5": ("us-east-1", "044jm6k57jgh", "lens-video-sonnet-5"),
    "webtoon_script_sonnet5": ("us-east-1", "dy1fhtb04pon", "lens-webtoon-script-sonnet-5"),
    "webtoon_script_sonnet46": ("us-east-1", "yirjajon82n7", "lens-webtoon-script-sonnet-46"),
    "mustknow_sonnet5": ("us-east-1", "zmdham3vkj89", "lens-mustknow-sonnet-5"),
    # PRISM 일괄 제작(2026-10-22) — 대본은 영상 프로파일(Sonnet 5), 장면 나누기는 Haiku 5.5(A/B 시험 결과, 비용 1/20).
    # 대본 모델을 바꿀 때는 이미지 재빌드 없이 작업 정의 환경변수 BEDROCK_MODEL_PRISM_SCRIPT 로 덮어쓴다.
    "prism_script": ("us-east-1", "044jm6k57jgh", "lens-video-sonnet-5"),
    "prism_scene": ("us-east-1", "njzeyj54dn12", "lens-prism-haiku-5-5"),
    "image_stable_core": ("us-west-2", "5jauvzgplsjx", "lens-webtoon-image-stable-core"),
    "image_sd35_large": ("us-west-2", "52u16muojn2u", "lens-webtoon-image-sd35-large"),
    "image_sd_ultra": ("us-west-2", "htvjnctxyvs1", "lens-webtoon-image-sd-ultra"),
    "image_nova_canvas": ("us-east-1", "jbnsv603bm7x", "lens-webtoon-image-nova-canvas"),
}


def profile_arn(alias: str) -> str:
    """별칭의 ARN. 환경변수 BEDROCK_MODEL_<ALIAS>가 있으면 그 값을 쓴다."""
    override = os.environ.get(f"BEDROCK_MODEL_{alias.upper()}")
    if override:
        return override
    region, pid, _ = PROFILES[alias]
    return f"arn:aws:bedrock:{region}:{ACCOUNT_ID}:application-inference-profile/{pid}"

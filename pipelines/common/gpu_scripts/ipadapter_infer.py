"""웹툰 GPU IP-Adapter 추론 CLI — pipelines/common/gpu_ipadapter.py가 SSM으로
이 스크립트를 호출한다. 단일 캐릭터(A 또는 B)의 얼굴을 참조로 고정한
포토리얼 이미지 1장을 생성해 S3에 업로드한다(그 다음 Bedrock Style
Transfer가 화풍을 입히는 건 호출부 책임).

사용법:
  python3 ipadapter_infer.py --character A --brief "..." --out-key <s3 key>
"""
import argparse
import boto3
import torch
from diffusers import StableDiffusionPipeline, DDIMScheduler
from PIL import Image

BUCKET = "sedaily-webtoon-ipadapter-887078546492"
REF_PATHS = {
    "A": "/home/ec2-user/refs/character_ref_A.png",
    "B": "/home/ec2-user/refs/character_ref_B.png",
}

_pipe = None


def get_pipe():
    global _pipe
    if _pipe is None:
        _pipe = StableDiffusionPipeline.from_pretrained(
            "stable-diffusion-v1-5/stable-diffusion-v1-5",
            dtype=torch.float16,
            safety_checker=None,
        ).to("cuda")
        _pipe.scheduler = DDIMScheduler.from_config(_pipe.scheduler.config)
        _pipe.load_ip_adapter("h94/IP-Adapter", subfolder="models", weight_name="ip-adapter-plus_sd15.bin")
    return _pipe


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--character", choices=["A", "B", "NONE"], required=True)
    ap.add_argument("--brief-file", required=True, help="사진 브리핑 텍스트가 담긴 로컬 파일 경로(쉘 인용 문제 회피용)")
    ap.add_argument("--out-key", required=True)
    ap.add_argument("--scale", type=float, default=0.7)
    ap.add_argument("--steps", type=int, default=30)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    brief = open(args.brief_file, encoding="utf-8").read()

    pipe = get_pipe()

    solo = args.character != "NONE"
    people_note = "Exactly one person only, nobody else in the frame." if solo else "Exactly two people only, nobody else in the frame."
    prompt = f"Photograph. {people_note} Photorealistic, natural lighting, documentary photography style.\n\n{brief}"
    negative_prompt = (
        "cartoon, illustration, anime, painting, drawing, extra person, additional person, "
        "third person, duplicate person, twins, clone, split screen, multiple views, "
        "two women, two men, deformed, blurry, low quality, watermark, "
        # 2026-09-18, 양진희 피드백("손이 겹쳐서 나온다던지") — SD1.5의 잘 알려진
        # 약점(손·손가락)에 대한 negative_prompt 항목이 전혀 없었다. SD1.5
        # 커뮤니티에서 표준적으로 쓰이는 손 교정 키워드를 추가한다.
        "bad hands, malformed hands, deformed hands, mutated hands, extra fingers, "
        "missing fingers, fused fingers, too many fingers, extra limbs, "
        # 배경 소품(간판·안내판 등)에 가짜 한글/한자/일본어 혼종 문자가 새어
        # 들어오는 문제(같은 피드백)도 같이 막는다 — _PHOTOREAL_NEGATIVE_PROMPT
        # (webtoon_image.py)에 적용한 것과 같은 방향.
        "signage text, readable text, storefront text, price board text, "
        "screen text, letters, watermark, text"
    )

    kwargs = dict(
        prompt=prompt,
        negative_prompt=negative_prompt,
        num_inference_steps=args.steps,
        guidance_scale=7.0,
        width=576,
        height=512,
        generator=torch.Generator(device="cuda").manual_seed(args.seed) if args.seed else None,
    )

    if solo:
        ref_image = Image.open(REF_PATHS[args.character]).convert("RGB")
        pipe.set_ip_adapter_scale(args.scale)
        kwargs["ip_adapter_image"] = ref_image
    else:
        pipe.set_ip_adapter_scale(0.0)
        kwargs["ip_adapter_image"] = Image.open(REF_PATHS["A"]).convert("RGB")  # 필수 인자라 넣되 scale=0이라 영향 없음

    result = pipe(**kwargs).images[0]
    out_path = "/tmp/ipadapter_out.png"
    result.save(out_path)

    s3 = boto3.client("s3", region_name="ap-northeast-2")
    s3.upload_file(out_path, BUCKET, args.out_key)
    print(f"OK uploaded s3://{BUCKET}/{args.out_key}")


if __name__ == "__main__":
    main()

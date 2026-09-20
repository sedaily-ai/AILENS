"""인물·화풍 참조 이미지(refs/*.png) 업로드·갤러리 — 2026-09-16 신설.
코드/GPU 인스턴스에만 있던 이미지 자산 두 종류(화풍 레퍼런스, 인물 A/B
참조 사진)를 admin에서 직접 업로드/교체할 수 있게 한다("코드로 설정하는
건 전부 화면에서 커스터마이징 가능해야" 요청). 저장은
gpu_ipadapter.GPU_BUCKET을 그대로 재사용(이미 admin Lambda 역할에
Get/Put/Delete 권한이 있어 새 IAM 불필요, AdminWebtoonGpuBucket 참고).
style_reference.png는 webtoon_image.py가 60초 캐시로 읽고, 두
character_ref는 gpu_ipadapter.ensure_gpu_running()이 배치 시작마다
인스턴스 로컬 디스크로 동기화한다 — 실제 생성 코드는 항상 이 "정본 키"
3개(refs/style_reference.png, refs/character_ref_A.png,
refs/character_ref_B.png)만 본다.

2026-09-16(같은 날 후속) — "여러 샘플 중에서 골라 비교하고 싶다" 요청으로
갤러리를 추가했다. 업로드는 이제 정본 키를 바로 덮어쓰지 않고 asset별
refs/gallery/{asset}/{uuid}.png 에 쌓인다(과거 업로드가 안 사라짐) —
handle_gallery_select가 고른 갤러리 파일을 정본 키로 copy_object 해야
실제 생성에 반영된다(업로드 직후에는 프론트가 업로드 응답의 key로 바로
select까지 호출해 "올리면 즉시 반영"이던 기존 동작을 그대로 유지한다).
"지금 활성인 샘플"은 별도 포인터 테이블 없이 ETag로 판별한다 — S3
PutObject/CopyObject의 ETag는(멀티파트가 아닌 한) 내용의 MD5라서, 정본
키의 ETag와 같은 갤러리 항목이 곧 "그 내용이 복사돼 지금 쓰이는
파일"이다."""
from __future__ import annotations

import logging
import uuid

import boto3

from shared import audit, response
import gpu_ipadapter  # pipelines/common/ — GPU_BUCKET·GPU_REGION·_sync_character_refs 재사용

logger = logging.getLogger(__name__)

BUCKET = gpu_ipadapter.GPU_BUCKET
REGION = gpu_ipadapter.GPU_REGION
ASSET_KEYS = {
    "style": "refs/style_reference.png",
    "char_female": "refs/character_ref_A.png",
    "char_male": "refs/character_ref_B.png",
}
GALLERY_PREFIXES = {
    "style": "refs/gallery/style/",
    "char_female": "refs/gallery/char_female/",
    "char_male": "refs/gallery/char_male/",
}
MAX_BYTES = 8 * 1024 * 1024
URL_EXPIRES = 300
GALLERY_MAX_ITEMS = 24  # 오래된 샘플은 목록에서만 안 보임(S3에서 안 지움 — 실수로 고른 걸 되돌릴 수 있게)

_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name=REGION)
    return _s3_client


def handle_get(body: dict, path_params: dict, query_params: dict) -> dict:
    """화풍/인물 참조 이미지 미리보기 URL — 실제 생성이 읽는 바로 그 S3
    객체를 가리키는 presigned GET(5분 유효)이다. 키가 없으면(업로드 전)
    null을 돌려줘 프론트가 "아직 없음"으로 처리하게 한다(세 키 다
    2026-09-16에 그때까지 쓰이던 값으로 시딩해둬서 보통은 항상 있다)."""
    s3 = _s3()
    urls: dict[str, str | None] = {}
    for asset, key in ASSET_KEYS.items():
        try:
            s3.head_object(Bucket=BUCKET, Key=key)
            urls[f"{asset}_url"] = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": BUCKET, "Key": key},
                ExpiresIn=URL_EXPIRES,
            )
        except Exception:  # noqa: BLE001 — 아직 업로드된 적 없는 키(정상 상태)
            urls[f"{asset}_url"] = None
    return response.ok(urls)


def handle_presign(body: dict, path_params: dict, query_params: dict) -> dict:
    """참조 이미지 업로드용 presigned PUT 발급 — routes/media.py의 프리사인
    업로드와 같은 이유(admin Lambda를 안 거치고 브라우저가 S3에 직접 올려야
    페이로드 한계를 안 걸림)로 같은 패턴을 쓴다. media.py처럼 매번 새
    키(uuid)를 발급한다 — 2026-09-16부터 정본 키를 바로 안 덮어쓰고 갤러리에
    쌓은 뒤 handle_gallery_select로 골라야 반영되는 구조로 바뀌었다(위
    모듈 docstring 참고)."""
    body = body or {}
    asset = (body.get("asset") or "").strip()
    content_type = (body.get("content_type") or "").strip()
    size = body.get("size") or 0

    if asset not in ASSET_KEYS:
        return response.err(f"unknown asset: {asset} (style|char_female|char_male)", 400)
    if content_type != "image/png":
        return response.err(f"unsupported content_type: {content_type} (image/png only)", 400)
    try:
        size = int(size)
    except (TypeError, ValueError):
        return response.err("size must be a number", 400)
    if size <= 0 or size > MAX_BYTES:
        return response.err(f"size must be 1..{MAX_BYTES} bytes", 400)

    key = f"{GALLERY_PREFIXES[asset]}{uuid.uuid4().hex}.png"
    upload_url = _s3().generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": content_type},
        ExpiresIn=URL_EXPIRES,
    )
    audit.log("webtoon-lab-image-asset-presign", {"asset": asset, "key": key})
    return response.ok({"upload_url": upload_url, "key": key, "expires_in": URL_EXPIRES})


def handle_gallery(body: dict, path_params: dict, query_params: dict) -> dict:
    """asset 하나의 업로드 이력을 최신순으로 반환 — 갤러리 그리드용. 정본
    키의 ETag와 같은 항목에 active:true를 표시한다(위 모듈 docstring의
    ETag 판별 방식 참고). 정본 키가 아직 없으면(최초 상태) 전부 active:false."""
    query_params = query_params or {}
    asset = (query_params.get("asset") or "").strip()
    if asset not in ASSET_KEYS:
        return response.err(f"unknown asset: {asset} (style|char_female|char_male)", 400)

    s3 = _s3()
    try:
        active_etag = s3.head_object(Bucket=BUCKET, Key=ASSET_KEYS[asset])["ETag"]
    except Exception:  # noqa: BLE001 — 정본 키가 아직 없음(정상 상태)
        active_etag = None

    resp = s3.list_objects_v2(
        Bucket=BUCKET,
        Prefix=GALLERY_PREFIXES[asset],
        MaxKeys=GALLERY_MAX_ITEMS,
    )
    items = sorted(resp.get("Contents", []), key=lambda o: o["LastModified"], reverse=True)
    return response.ok({
        "items": [
            {
                "key": obj["Key"],
                "url": s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": BUCKET, "Key": obj["Key"]},
                    ExpiresIn=URL_EXPIRES,
                ),
                "uploaded_at": obj["LastModified"].isoformat(),
                "active": active_etag is not None and obj["ETag"] == active_etag,
            }
            for obj in items
        ],
    })


def handle_gallery_select(body: dict, path_params: dict, query_params: dict) -> dict:
    """갤러리에서 고른 샘플을 정본 키로 복사 — 이 순간부터 다음 생성이 이
    사진/이미지를 쓴다(style은 다음 컷 생성부터 60초 캐시 후, character는
    GPU가 꺼져있었다면 다음 배치 시작 때, 이미 켜져 있었다면 아래에서
    바로 한 번 더 동기화해 즉시 — 2026-09-18 수정, 아래 주석 참고).
    key가 그 asset의 갤러리 프리픽스 밖을 가리키면 거부한다(다른 asset
    파일을 잘못 골라 정본을 덮어쓰는 사고 방지)."""
    body = body or {}
    asset = (body.get("asset") or "").strip()
    key = (body.get("key") or "").strip()
    if asset not in ASSET_KEYS:
        return response.err(f"unknown asset: {asset} (style|char_female|char_male)", 400)
    if not key.startswith(GALLERY_PREFIXES[asset]):
        return response.err("key does not belong to this asset's gallery", 400)

    s3 = _s3()
    try:
        s3.copy_object(
            Bucket=BUCKET,
            CopySource={"Bucket": BUCKET, "Key": key},
            Key=ASSET_KEYS[asset],
            ContentType="image/png",
        )
    except Exception as e:  # noqa: BLE001 — 존재하지 않는 키 등 사용자 입력 오류를 400으로
        return response.err(f"select failed: {e}", 400)
    audit.log("webtoon-lab-image-asset-select", {"asset": asset, "key": key})

    # 2026-09-18 버그 수정 — character 참조는 GPU 인스턴스 로컬 디스크
    # (/home/ec2-user/refs/)에서 읽히고, 그 동기화는 원래 GPU가 새로
    # 켜질 때(ensure_gpu_running)만 일어났다. "테스트 세션 동안 GPU를
    # 계속 켜둔다"는 정상 사용 패턴에서는 select가 S3 정본 키를 바꿔도
    # 이미 켜져 있는 GPU가 재기동 전까지 예전 사진을 계속 쓰는 채로
    # 남아있었다(양진희 피드백 — "샘플을 추가했는데도 이미지 반영이
    # 되지 않았습니다"). GPU가 이미 running이면 여기서 바로 한 번 더
    # 동기화해 재기동 없이도 즉시 반영되게 한다.
    if asset in ("char_female", "char_male"):
        try:
            ec2 = boto3.client("ec2", region_name=gpu_ipadapter.GPU_REGION)
            state = ec2.describe_instances(
                InstanceIds=[gpu_ipadapter.GPU_INSTANCE_ID]
            )["Reservations"][0]["Instances"][0]["State"]["Name"]
            if state == "running":
                gpu_ipadapter._sync_character_refs()
        except Exception as e:  # noqa: BLE001 — 즉시 동기화 실패해도 select 자체는 성공(다음 GPU 재기동 때 다시 시도됨)
            logger.warning(f"character ref 즉시 동기화 실패(무시): {e}")

    return response.ok({"selected": True})

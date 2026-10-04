"""frontpage_auto/mustknow_auto 공용 S3 업로드 헬퍼 — 두 파일에 바이트
단위로 동일한 함수가 복사돼 있던 걸 공용화(2026-08-23 코드 리팩토링 감사).
"""
import mimetypes
from pathlib import Path

from config import AWS_REGION


def upload_media(s3, local_path: Path, key: str, bucket: str) -> str:
    # .webp는 구버전 Python의 mimetypes가 모를 수 있어 명시한다(2026-10-01).
    ctype = "image/webp" if str(local_path).lower().endswith(".webp") else (mimetypes.guess_type(str(local_path))[0] or "application/octet-stream")
    # CacheControl(2026-10-04): 지정이 없으면 S3가 Cache-Control 없이 내려줘 브라우저·크롤러가 매번 재검증한다(og 이미지 직접 접근 시 확인).
    # 같은 키를 덮어쓰는 경우(재합성)가 있어 immutable은 쓰지 않고 하루로 둔다 — 이미지는 사이트에서 /_next/image(CloudFront)를 거쳐 따로 캐시된다.
    s3.upload_file(str(local_path), bucket, key, ExtraArgs={"ContentType": ctype, "CacheControl": "public, max-age=86400"})
    return f"https://{bucket}.s3.{AWS_REGION}.amazonaws.com/{key}"

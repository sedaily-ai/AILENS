"""frontpage_auto/mustknow_auto 공용 S3 미디어 업로드 헬퍼."""
import mimetypes
from pathlib import Path

from config import AWS_REGION


def upload_media(s3, local_path: Path, key: str, bucket: str) -> str:
    # .webp는 구버전 Python의 mimetypes가 모를 수 있어 명시한다.
    ctype = "image/webp" if str(local_path).lower().endswith(".webp") else (mimetypes.guess_type(str(local_path))[0] or "application/octet-stream")
    # Cache-Control이 없으면 브라우저·크롤러가 매번 재검증한다. 같은 키를 덮어쓰는 경우(재합성)가 있어
    # immutable 대신 하루로 둔다(사이트는 /_next/image(CloudFront)를 거쳐 따로 캐시된다).
    s3.upload_file(str(local_path), bucket, key, ExtraArgs={"ContentType": ctype, "CacheControl": "public, max-age=86400"})
    return f"https://{bucket}.s3.{AWS_REGION}.amazonaws.com/{key}"

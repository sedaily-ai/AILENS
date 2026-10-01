"""frontpage_auto/mustknow_auto 공용 S3 업로드 헬퍼 — 두 파일에 바이트
단위로 동일한 함수가 복사돼 있던 걸 공용화(2026-08-23 코드 리팩토링 감사).
"""
import mimetypes
from pathlib import Path

from config import AWS_REGION


def upload_media(s3, local_path: Path, key: str, bucket: str) -> str:
    # .webp는 구버전 Python의 mimetypes가 모를 수 있어 명시한다(2026-10-01).
    ctype = "image/webp" if str(local_path).lower().endswith(".webp") else (mimetypes.guess_type(str(local_path))[0] or "application/octet-stream")
    s3.upload_file(str(local_path), bucket, key, ExtraArgs={"ContentType": ctype})
    return f"https://{bucket}.s3.{AWS_REGION}.amazonaws.com/{key}"

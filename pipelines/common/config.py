"""frontpage_auto/mustknow_auto 공용 발행 대상(TABLE/BUCKET/REGION) — 두
파이프라인이 같은 값을 각자 하드코딩(REGION은 env override도 없이)하고
있던 걸 여기로 통일(2026-08-23, 코드 리팩토링 감사). ddb_prompt.py와 같은
"env var 있으면 override, 없으면 이 기본값" 패턴.
"""
import os

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
CMS_POSTS_TABLE = os.environ.get("CMS_POSTS_TABLE", "sedaily-mbti-cms-posts-dev")
CMS_MEDIA_BUCKET = os.environ.get("CMS_MEDIA_BUCKET", "sedaily-mbti-cms-media-dev")

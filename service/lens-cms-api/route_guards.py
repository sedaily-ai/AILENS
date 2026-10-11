"""라우트 공용 가드·검증(내부 토큰, 필드 크기, 레터 오류 변환).

main.py 분리(2026-10-12 리팩토링 5단계)로 이동했다.
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException

from letter_errors import LetterError

# ── admin 쓰기(CRUD) — v1.21 ──────────────────────────────────────────
# admin/backend(Lambda)가 DynamoDB 대신 이 내부 API를 호출한다. admin
# Lambda를 RDS와 같은 VPC에 직접 붙이면 오늘 해결한 Lambda+RDS 문제가
# 재발할 뿐 아니라 CloudWatch/EventBridge/SSM/webhook 같은 다른 인터넷
# 접근까지 깨지므로, RDS 접근을 이 상시 서버 하나로 집중시킨다.
# 공유 시크릿 헤더(X-Internal-Token)로 보호 — 아직 HTTPS 경유 안 함
# (직접 EC2 공인 IP:80 호출, TODO: CloudFront behavior 추가해 HTTPS화).
_ADMIN_TOKEN = os.environ.get("ADMIN_INTERNAL_TOKEN", "")


def _check_admin_token(x_internal_token: Optional[str]) -> None:
    if not _ADMIN_TOKEN or x_internal_token != _ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


# 2026-09-25 — 프롬프트 실험(챗랩) 백엔드 CRUD 점검 중 추가. admin/backend/
# routes/posts.py::_MAX_PAYLOAD_BYTES(340KB, CMS 글 본문 기준)와 같은
# 원칙 — 크기 제한이 아예 없는 텍스트/JSONB 필드가 2026-09-25 admin/posts
# 413(payload too large)의 원인이었다(목록 조회가 이 무제한 필드를 그대로
# 실어 보내서). 그 사고를 겪은 필드(prompt_lab_thread_messages.payload)와
# 같은 패턴(대화 메시지·프롬프트 실험 파일)에 선제적으로 상한을 건다 —
# 아직 이 필드들에서 같은 사고가 난 적은 없지만 구조가 동일하다.
_MAX_TEXT_FIELD_BYTES = 200 * 1024


def _check_field_size(value: str, field_name: str) -> None:
    size = len(value.encode("utf-8"))
    if size > _MAX_TEXT_FIELD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} too large: {size} bytes (max {_MAX_TEXT_FIELD_BYTES})",
        )


# ── DynamoDB 잔여 이관 — v1.36 (설계: docs/architecture/lens-erd-src/16-ddb-잔여-이관-설계.md) ──────────
# 세 테이블 모두 호출자(ECS 파이프라인·관리자 Lambda·서비스 Lambda)가 내부 토큰으로만 접근한다.
def _bad_request(e: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))



# ── 용어 퀴즈 — v1.22, 응답 집계는 v1.26 ─────────────────────────────
# ── 이슈 레터(모아쓰기 레터) — v1.37 ──────────────────────────────────────
# 공개: 목록·상세·투표(인증 없음). 관리: X-Internal-Token + 본문 actor(관리자 Lambda가 로그인한 편집자 정보를 실어 보낸다).
# 설계: docs/architecture/lens-erd-src/17-이슈레터-설계.md. 옛 /admin/letters*(폐기 후보)와 겹치지 않게 issue-letters 를 쓴다.

def _letter_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except LetterError as e:
        raise HTTPException(status_code=e.status, detail=str(e))

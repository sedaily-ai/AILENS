"""인증 / JWT / rate limit / audit log.

handle_login: argon2id verify + JWT(HS256) 8시간 발급.
verify_jwt: handler.py 가 jwt_required=True route 진입 전 호출.
audit_log: 모든 mutating action 후 호출.
rate limit: 5회 fail → 5분 lockout.

2026-09-09(v1.28): lockout 상태 저장을 DynamoDB(admin-config 테이블
AUTH/lockout/global)에서 PostgreSQL(lens-cms-api, `admin_login_lockout`
단일 싱글턴 행)로 전환.
"""

import datetime as dt
import os
import logging

import jwt as pyjwt
from argon2 import PasswordHasher, exceptions as argon2_exc

from repo import config_repo
from shared import audit, response, ssm_client

logger = logging.getLogger(__name__)

PASSWORD_HASH_PARAM = os.environ.get("PASSWORD_HASH_PARAM", "/sedaily-mbti/admin/password-hash")
JWT_SECRET_PARAM = os.environ.get("JWT_SECRET_PARAM", "/sedaily-mbti/admin/jwt-secret")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "8"))
LOCKOUT_THRESHOLD = int(os.environ.get("LOCKOUT_THRESHOLD", "5"))
LOCKOUT_DURATION_MINUTES = int(os.environ.get("LOCKOUT_DURATION_MINUTES", "5"))

_ph = PasswordHasher()


class AuthError(Exception):
    """JWT 검증 실패 또는 헤더 누락."""


def _check_lockout() -> int | None:
    """lockout 활성 시 retry_after_seconds 반환, 아니면 None."""
    return config_repo.check_lockout()


def _record_fail() -> tuple[int, str | None]:
    return config_repo.record_login_fail(
        threshold=LOCKOUT_THRESHOLD, lockout_minutes=LOCKOUT_DURATION_MINUTES,
    )


def _reset_fail() -> None:
    config_repo.reset_login_fail()


def audit_log(action: str, detail: dict | None = None, actor: str = "admin") -> None:
    """하위호환 별칭 — shared.audit.log 로 위임한다.

    actor 인자는 무시된다. 호출 9곳 어디서도 기본값을 덮어쓰지 않았고,
    단일 공유 비밀번호 구조에서는 의미가 없다. 세션·출처 IP 는
    shared.audit 의 컨텍스트가 담는다.
    """
    audit.log(action, detail)


def handle_login(body: dict, path_params: dict, query_params: dict) -> dict:
    retry_after = _check_lockout()
    if retry_after is not None:
        return response.err("locked out", 423, retry_after_seconds=retry_after)

    password = body.get("password", "")
    if not password:
        audit_log("login-fail", {"reason": "empty-password"})
        return response.err("password required", 400)

    stored_hash = ssm_client.get_secure(PASSWORD_HASH_PARAM)

    try:
        _ph.verify(stored_hash, password)
    except (argon2_exc.VerifyMismatchError, argon2_exc.InvalidHashError):
        fail_count, lockout_until = _record_fail()
        audit_log("login-fail", {"fail_count": fail_count, "locked": bool(lockout_until)})
        return response.err("invalid credentials", 401)

    _reset_fail()

    secret = ssm_client.get_secure(JWT_SECRET_PARAM)
    now = dt.datetime.now(dt.timezone.utc)
    exp = now + dt.timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {"sub": "admin", "iat": int(now.timestamp()), "exp": int(exp.timestamp())}
    token = pyjwt.encode(payload, secret, algorithm="HS256")

    audit_log("login-success")
    return response.ok({"token": token, "expires_at": exp.strftime("%Y-%m-%dT%H:%M:%SZ")})


def verify_jwt(authorization_header: str | None) -> dict:
    if not authorization_header:
        raise AuthError("missing authorization header")
    parts = authorization_header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("invalid authorization format")
    token = parts[1]
    secret = ssm_client.get_secure(JWT_SECRET_PARAM)
    try:
        return pyjwt.decode(token, secret, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise AuthError("token expired")
    except pyjwt.InvalidTokenError as e:
        raise AuthError(f"invalid token: {e}")

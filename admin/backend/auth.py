"""인증 / JWT / rate limit / audit log.

handle_login: argon2id verify + JWT(HS256) 8시간 발급.
verify_jwt: handler.py 가 jwt_required=True route 진입 전 호출.
audit_log: 모든 mutating action 후 호출.
rate limit: 5회 fail → 5분 lockout (DDB AUTH/lockout/global).
"""

import datetime as dt
import os
import logging

import jwt as pyjwt
from argon2 import PasswordHasher, exceptions as argon2_exc
from boto3.dynamodb.conditions import Key

from shared import audit, ddb_client, response, ssm_client

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
    table = ddb_client.config_table()
    resp = table.get_item(Key={"pk": "AUTH", "sk": "lockout/global"})
    item = resp.get("Item")
    if not item:
        return None
    lockout_until = item.get("lockout_until")
    if not lockout_until:
        return None
    now = dt.datetime.now(dt.timezone.utc)
    try:
        until_dt = dt.datetime.strptime(lockout_until, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None
    if now >= until_dt:
        return None
    return int((until_dt - now).total_seconds())


def _record_fail() -> tuple[int, str | None]:
    table = ddb_client.config_table()
    resp = table.get_item(Key={"pk": "AUTH", "sk": "lockout/global"})
    item = resp.get("Item", {}) or {}
    fail_count = int(item.get("fail_count", 0)) + 1
    new_item: dict = {
        "pk": "AUTH",
        "sk": "lockout/global",
        "fail_count": fail_count,
    }
    lockout_until: str | None = None
    if fail_count >= LOCKOUT_THRESHOLD:
        until = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        lockout_until = until.strftime("%Y-%m-%dT%H:%M:%SZ")
        new_item["lockout_until"] = lockout_until
    table.put_item(Item=new_item)
    return fail_count, lockout_until


def _reset_fail() -> None:
    table = ddb_client.config_table()
    table.put_item(Item={"pk": "AUTH", "sk": "lockout/global", "fail_count": 0})


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

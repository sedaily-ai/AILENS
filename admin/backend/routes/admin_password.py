"""admin password 변경 — old verify + new hash + SSM put."""

import logging

from argon2 import PasswordHasher, exceptions as argon2_exc

import auth
from shared import audit, response, ssm_client

logger = logging.getLogger(__name__)

_ph = PasswordHasher()
MIN_PASSWORD_LENGTH = 12


def handle_change(body: dict, path_params: dict, query_params: dict) -> dict:
    old = body.get("old", "")
    new = body.get("new", "")
    if not old or not new:
        return response.err("old and new required", 400)
    if len(new) < MIN_PASSWORD_LENGTH:
        return response.err(f"new password must be at least {MIN_PASSWORD_LENGTH} chars", 400)
    if old == new:
        return response.err("new password must differ from old", 400)

    stored_hash = ssm_client.get_secure(auth.PASSWORD_HASH_PARAM)
    try:
        _ph.verify(stored_hash, old)
    except (argon2_exc.VerifyMismatchError, argon2_exc.InvalidHashError):
        audit.log("admin-password-change", {"result": "old-mismatch"})
        return response.err("old password mismatch", 401)

    new_hash = _ph.hash(new)
    ssm_client.put_secure(auth.PASSWORD_HASH_PARAM, new_hash)

    audit.log("admin-password-change", {"result": "success"})
    return response.ok({"ok": True})

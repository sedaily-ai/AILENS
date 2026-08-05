"""JWT verification for Cognito-issued ID tokens.

Lambda handlers that need to know "who is this user" must call
``verify_cognito_token(event)`` (or ``get_authenticated_user_id(event)``)
instead of trusting ``body['user_id']`` or ``queryStringParameters['user_id']``.

Until 2026-04 every authenticated endpoint trusted a client-supplied
``user_id`` field, so any caller could impersonate any user (post votes,
read archived content, sync profiles, etc.). The fix is two-sided:

1. Backend verifies the Cognito ID token signature against the Cognito
   JWKS, validates ``iss``/``aud``/``exp``, and uses the resulting
   ``sub`` claim as the authoritative user_id.
2. Frontend (Amplify) attaches ``Authorization: Bearer <idToken>`` to
   every authenticated request via ``shared/lib/authFetch.ts``.

The JWKS is fetched once per Lambda container and re-used (PyJWKClient
caches by ``kid``); the cost of verification per request is a single
RSA signature check (~1 ms).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import jwt
from jwt import PyJWKClient

from config import settings
from .exceptions import AuthenticationError

logger = logging.getLogger(__name__)


def _jwks_url() -> str:
    return (
        f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/"
        f"{settings.cognito_user_pool_id}/.well-known/jwks.json"
    )


def _issuer() -> str:
    return (
        f"https://cognito-idp.{settings.cognito_region}.amazonaws.com/"
        f"{settings.cognito_user_pool_id}"
    )


# Lazily constructed at first use so module import doesn't make an HTTP call.
# PyJWKClient caches signing keys by `kid` for the container lifetime.
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(_jwks_url(), cache_keys=True)
    return _jwks_client


def _extract_bearer_token(event: Dict[str, Any]) -> Optional[str]:
    """Pull the JWT out of `Authorization: Bearer ...`.

    HTTP headers are case-insensitive but API Gateway preserves the casing
    the client sent, so both lower- and PascalCase need to be checked.
    """
    headers = event.get('headers') or {}
    auth = headers.get('authorization') or headers.get('Authorization')
    if not auth:
        return None
    parts = auth.split(' ', 1)
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    token = parts[1].strip()
    return token or None


def verify_cognito_token(event: Dict[str, Any]) -> Dict[str, Any]:
    """Verify the Cognito ID token attached to the request.

    Returns the decoded claims on success. Useful fields:
      * ``sub``    — Cognito UUID; canonical user_id
      * ``email``  — verified email (if present in pool)
      * ``name``   — display name
      * ``picture``— OAuth profile picture URL

    Raises ``AuthenticationError`` (mapped to HTTP 401 by the
    ``@lambda_handler`` decorator) on missing / malformed / expired /
    untrusted token.
    """
    token = _extract_bearer_token(event)
    if not token:
        raise AuthenticationError("Missing or malformed Authorization: Bearer header")

    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    except Exception as e:
        logger.warning("JWKS lookup failed: %s", e)
        raise AuthenticationError("Could not validate token signing key") from e

    try:
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=['RS256'],
            audience=settings.cognito_app_client_id,
            issuer=_issuer(),
            options={
                "verify_signature": True,
                "verify_aud": True,
                "verify_iss": True,
                "verify_exp": True,
            },
        )
    except jwt.ExpiredSignatureError as e:
        raise AuthenticationError("Token expired") from e
    except jwt.InvalidAudienceError as e:
        raise AuthenticationError("Token audience mismatch") from e
    except jwt.InvalidIssuerError as e:
        raise AuthenticationError("Token issuer mismatch") from e
    except jwt.InvalidTokenError as e:
        raise AuthenticationError("Invalid token") from e

    # Reject access tokens — they don't carry the user identity claims we want.
    # Cognito ID tokens always have token_use='id'.
    if claims.get('token_use') != 'id':
        raise AuthenticationError("Expected an ID token, got token_use=" + str(claims.get('token_use')))

    if 'sub' not in claims:
        raise AuthenticationError("Token missing 'sub' claim")

    return claims


def get_authenticated_user_id(event: Dict[str, Any]) -> str:
    """Verify the token and return only the user_id (``sub``)."""
    return verify_cognito_token(event)['sub']


def try_get_authenticated_user_id(event: Dict[str, Any]) -> Optional[str]:
    """Like ``get_authenticated_user_id`` but returns ``None`` instead of
    raising when no/invalid token is present.

    Use only on endpoints where authenticated and anonymous access both
    make sense (e.g. read endpoints that personalize when logged in but
    work without auth).
    """
    try:
        return get_authenticated_user_id(event)
    except AuthenticationError:
        return None

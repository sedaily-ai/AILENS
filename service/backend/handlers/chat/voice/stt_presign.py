"""
챗봇 음성 통화 STT presign 핸들러.

POST /api/voice/stt-presign
body = { "sample_rate": 16000, "language": "ko-KR" }

AWS Transcribe Streaming WebSocket 으로 직접 연결할 수 있는
SigV4 서명된 wss:// URL 을 생성해 반환. 브라우저는 이 URL 로 WebSocket
연결을 열고 PCM audio chunk 를 EventStream 으로 전송.

응답: { url, region, language, sample_rate, expires_in }
"""
import hashlib
import hmac
import json
import logging
from datetime import datetime
from urllib.parse import quote

import boto3

from config.constants import CORS_HEADERS
from handlers.chat.voice.responses import json_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_REGION = 'us-east-1'
_SERVICE = 'transcribe'
_HOST = f'transcribestreaming.{_REGION}.amazonaws.com'
_ENDPOINT = f'{_HOST}:8443'


def _sign(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()


def lambda_handler(event: dict, context) -> dict:
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    try:
        body_raw = event.get('body') or '{}'
        body = json.loads(body_raw)
    except json.JSONDecodeError:
        body = {}

    language = body.get('language', 'ko-KR')
    sample_rate = int(body.get('sample_rate', 16000))

    try:
        creds = boto3.Session().get_credentials()
        access_key = creds.access_key
        secret_key = creds.secret_key
        session_token = creds.token

        t = datetime.utcnow()
        amz_date = t.strftime('%Y%m%dT%H%M%SZ')
        date_stamp = t.strftime('%Y%m%d')

        credential_scope = f'{date_stamp}/{_REGION}/{_SERVICE}/aws4_request'
        algorithm = 'AWS4-HMAC-SHA256'

        params = {
            'X-Amz-Algorithm': algorithm,
            'X-Amz-Credential': f'{access_key}/{credential_scope}',
            'X-Amz-Date': amz_date,
            'X-Amz-Expires': '300',
            'X-Amz-SignedHeaders': 'host',
            'language-code': language,
            'media-encoding': 'pcm',
            'sample-rate': str(sample_rate),
        }
        if session_token:
            params['X-Amz-Security-Token'] = session_token

        canonical_qs = '&'.join(
            f'{quote(k, safe="")}={quote(str(v), safe="")}'
            for k, v in sorted(params.items())
        )

        canonical_headers = f'host:{_ENDPOINT}\n'
        signed_headers = 'host'
        payload_hash = hashlib.sha256(b'').hexdigest()

        canonical_request = '\n'.join([
            'GET',
            '/stream-transcription-websocket',
            canonical_qs,
            canonical_headers,
            signed_headers,
            payload_hash,
        ])

        string_to_sign = '\n'.join([
            algorithm,
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode('utf-8')).hexdigest(),
        ])

        k_date = _sign(('AWS4' + secret_key).encode('utf-8'), date_stamp)
        k_region = _sign(k_date, _REGION)
        k_service = _sign(k_region, _SERVICE)
        k_signing = _sign(k_service, 'aws4_request')
        signature = hmac.new(k_signing, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

        url = (
            f'wss://{_ENDPOINT}/stream-transcription-websocket'
            f'?{canonical_qs}'
            f'&X-Amz-Signature={signature}'
        )

        logger.info(f"transcribe presign issued: lang={language} sr={sample_rate}")
        return json_response(200, {
            'url': url,
            'region': _REGION,
            'language': language,
            'sample_rate': sample_rate,
            'expires_in': 300,
        })
    except Exception as e:
        logger.exception(f"presign fail: {e}")
        return json_response(500, {'error': str(e)})

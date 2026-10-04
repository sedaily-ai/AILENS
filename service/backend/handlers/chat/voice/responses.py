"""voice 핸들러(stt_presign, tts) 공용 JSON 응답 — CORS 헤더를 얹는다."""
import json
from typing import Any, Dict

from config.constants import CORS_HEADERS


def json_response(status: int, body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'statusCode': status,
        'headers': CORS_HEADERS,
        'body': json.dumps(body, ensure_ascii=False),
    }

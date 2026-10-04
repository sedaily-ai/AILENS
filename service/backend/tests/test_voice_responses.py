import json

from config.constants import CORS_HEADERS
from handlers.chat.voice.responses import json_response


def test_json_response_shape():
    r = json_response(400, {'error': '한글'})
    assert r['statusCode'] == 400 and r['headers'] == CORS_HEADERS
    assert json.loads(r['body']) == {'error': '한글'} and '한글' in r['body']

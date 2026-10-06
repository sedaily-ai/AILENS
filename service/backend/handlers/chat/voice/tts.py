"""
챗봇 음성 통화용 TTS 핸들러.

POST /api/voice/tts
body = {
    "text": "..."
}
`mbti_group` 이 포함되어도 무시하며 단일 기본 voice 를 사용한다.

기본 voice: AWS Polly (Seoyeon generative, 실패 시 neural 자동 폴백). 외부 의존성
(ElevenLabs API key) 없이 항상 사용할 수 있다. ElevenLabs 연동 코드(`_synth_elevenlabs`)는
provider 분기를 다시 켤 때를 위해 유지하며 현재는 호출되지 않는다.

응답: { audio (base64 mp3), provider, voice_id, engine }
"""
import base64
import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

import boto3

from config.constants import CORS_HEADERS
from handlers.chat.voice.responses import json_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_polly = None
_secretsmanager = None


def _get_polly():
    global _polly
    if _polly is None:
        _polly = boto3.client('polly', region_name='us-east-1')
    return _polly


def _get_secretsmanager():
    global _secretsmanager
    if _secretsmanager is None:
        _secretsmanager = boto3.client('secretsmanager', region_name='us-east-1')
    return _secretsmanager


# ElevenLabs API key: Secrets Manager(ai-labs/elevenlabs)에서 조회하며 5분 TTL 로 캐시한다.
_ELEVEN_KEY_CACHE: Tuple[Optional[str], float] = (None, 0.0)
_ELEVEN_KEY_TTL_SEC = 300


def _get_elevenlabs_api_key() -> Optional[str]:
    global _ELEVEN_KEY_CACHE
    cached, exp = _ELEVEN_KEY_CACHE
    now = time.time()
    if cached and now < exp:
        return cached
    try:
        resp = _get_secretsmanager().get_secret_value(SecretId='ai-labs/elevenlabs')
        payload = json.loads(resp.get('SecretString') or '{}')
        key = payload.get('api_key')
        if key:
            _ELEVEN_KEY_CACHE = (key, now + _ELEVEN_KEY_TTL_SEC)
            return key
    except Exception as e:
        logger.warning(f"elevenlabs secret fetch fail: {e}")
    return None


# 단일 기본 챗봇 voice. Seoyeon generative 를 사용하며 실패 시 _synth_polly 가 neural 로 자동 폴백한다.
DEFAULT_CHAT_VOICE = {
    'provider': 'polly',
    'voice_id': 'Seoyeon',
    'engine': 'generative',
}

# ElevenLabs Multilingual v2 — 한국어 자연 발화 모델.
ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2'
ELEVENLABS_VOICE_SETTINGS = {
    'stability': 0.5,
    'similarity_boost': 0.78,
    'style': 0.25,
    'use_speaker_boost': True,
}
ELEVENLABS_TIMEOUT_SEC = 12

# Polly 가 어색하게 읽는 영어 약어를 한국식 발음으로 치환한다.
# 단어 경계(\b)를 적용해 단어 일부만 치환되지 않게 한다.
import re as _re

_PRONOUNCE_SUBS = [
    # 한국 기업·기관
    (r'\bKT\b', '케이티'),
    (r'\bSK\b', '에스케이'),
    (r'\bSKT\b', '에스케이티'),
    (r'\bLG\b', '엘지'),
    (r'\bGS\b', '지에스'),
    (r'\bCJ\b', '씨제이'),
    (r'\bHD\b', '에이치디'),
    (r'\bKB\b', '케이비'),
    # 일반 약어
    (r'\bAI\b', '에이아이'),
    (r'\bIT\b', '아이티'),
    (r'\bICT\b', '아이씨티'),
    (r'\bCEO\b', '씨이오'),
    (r'\bCFO\b', '씨에프오'),
    (r'\bCTO\b', '씨티오'),
    (r'\bGDP\b', '지디피'),
    (r'\bCPI\b', '씨피아이'),
    (r'\bPPI\b', '피피아이'),
    (r'\bIPO\b', '아이피오'),
    (r'\bETF\b', '이티에프'),
    (r'\bPER\b', '피이알'),
    (r'\bPBR\b', '피비알'),
    (r'\bROE\b', '알오이'),
    (r'\bM&A\b', '엠앤에이'),
    (r'\bMZ\b', '엠제트'),
    (r'\bSNS\b', '에스엔에스'),
    (r'\bAPI\b', '에이피아이'),
    (r'\bUSB\b', '유에스비'),
    # 단위·기호
    (r'%', ' 퍼센트'),
    (r'(\d)\s*bp\b', r'\1 베이시스포인트'),
    (r'\bbp\b', '베이시스포인트'),
    # 한자 표현
    (r'勞勞', '노노'),
    (r'勞使', '노사'),
    (r'勞', '노'),
    (r'使', '사'),
]


def preprocess_for_polly(text: str) -> str:
    """Polly 가 어색하게 읽는 단어들을 한국식 발음으로 치환."""
    out = text
    for pat, repl in _PRONOUNCE_SUBS:
        out = _re.sub(pat, repl, out)
    # 다중 공백 정리
    out = _re.sub(r'\s+', ' ', out).strip()
    return out


def lambda_handler(event: dict, context) -> dict:
    method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    try:
        body_raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            body_raw = base64.b64decode(body_raw).decode('utf-8')
        body = json.loads(body_raw)
    except json.JSONDecodeError:
        return json_response(400, {'error': 'invalid JSON body'})

    text = (body.get('text') or '').strip()
    if not text:
        return json_response(400, {'error': 'text 가 비어있습니다.'})
    if len(text) > 3000:
        return json_response(400, {'error': 'text 너무 김 (max 3000자)'})

    spec = DEFAULT_CHAT_VOICE
    # 영어 약어·단위·한자를 한국식 발음으로 치환한다. Polly·ElevenLabs 모두 약어를 그대로 읽으면
    # 어색하므로 동일한 전처리를 적용한다.
    tts_text = preprocess_for_polly(text)

    provider = spec.get('provider', 'polly')

    try:
        if provider == 'elevenlabs':
            audio_bytes, used_voice, used_engine = _synth_elevenlabs(tts_text, spec)
        else:
            audio_bytes, used_voice, used_engine = _synth_polly(tts_text, spec)
        audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
        logger.info(
            f"TTS ok: provider={provider} voice={used_voice} "
            f"engine={used_engine} len={len(text)} bytes={len(audio_bytes)}"
        )
        return json_response(200, {
            'audio': audio_b64,
            'content_type': 'audio/mpeg',
            'provider': provider,
            'voice_id': used_voice,
            'engine': used_engine,
        })
    except Exception as e:
        logger.exception(f"TTS synth fail (provider={provider}): {e}")
        return json_response(500, {'error': f'TTS synthesize failed: {e}'})


def _synth_polly(text: str, spec: Dict[str, Any]) -> Tuple[bytes, str, str]:
    """Polly 합성. generative 실패 시 neural fallback."""
    voice_id = spec['voice_id']
    engine = spec.get('engine', 'neural')
    polly = _get_polly()

    def _call(eng: str) -> bytes:
        resp = polly.synthesize_speech(
            Text=text,
            TextType='text',
            OutputFormat='mp3',
            VoiceId=voice_id,
            Engine=eng,
        )
        return resp['AudioStream'].read()

    try:
        return _call(engine), voice_id, engine
    except Exception as e:
        if engine == 'generative':
            logger.warning(f"polly generative fail, fallback neural: {e}")
            return _call('neural'), voice_id, 'neural'
        raise


def _synth_elevenlabs(text: str, spec: Dict[str, Any]) -> Tuple[bytes, str, str]:
    """ElevenLabs HTTP 호출. 실패 시 Polly Seoyeon neural 로 폴백하며, 응답의 provider 는 실제 합성에 쓰인 값('polly')을 반영한다.

    기본 voice 가 Polly 이므로 현재는 호출되지 않는다.
    """
    voice_id = spec['voice_id']
    api_key = _get_elevenlabs_api_key()
    if not api_key:
        logger.warning("elevenlabs api key missing → polly fallback")
        return _synth_polly(text, {'voice_id': 'Seoyeon', 'engine': 'neural'})

    body = json.dumps({
        'text': text,
        'model_id': ELEVENLABS_MODEL_ID,
        'voice_settings': ELEVENLABS_VOICE_SETTINGS,
    }).encode('utf-8')
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}',
        data=body,
        method='POST',
        headers={
            'xi-api-key': api_key,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=ELEVENLABS_TIMEOUT_SEC) as resp:
            audio = resp.read()
        return audio, voice_id, ELEVENLABS_MODEL_ID
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')[:300]
        logger.warning(f"elevenlabs HTTP {e.code}: {err_body} → polly fallback")
        return _synth_polly(text, {'voice_id': 'Seoyeon', 'engine': 'neural'})
    except Exception as e:
        logger.warning(f"elevenlabs call fail ({e}) → polly fallback")
        return _synth_polly(text, {'voice_id': 'Seoyeon', 'engine': 'neural'})

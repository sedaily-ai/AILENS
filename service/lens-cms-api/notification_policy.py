"""개인화 알림 입력·기기 암호화·서버 일정. 외부 호출 없음."""
import base64
import json
import math
import os
import re
from urllib.parse import urlsplit,urlunsplit
from zoneinfo import ZoneInfo
from cryptography.fernet import Fernet,InvalidToken
from cryptography.hazmat.primitives.asymmetric import ec
from content_resolver import DashboardError

DEFAULT={'version':1,'briefing':False,'followups':False,'weekly':False,'frequency':'daily','time':'08:00','timezone':'Asia/Seoul','weeklyDay':1,'paused':False,'categorySource':True,'keywordSource':True,'sentenceSource':False}
ZONES=('Asia/Seoul','America/New_York','Europe/London','UTC')
BOOLS=('briefing','followups','weekly','paused','categorySource','keywordSource','sentenceSource')


def invalid(message='알림 입력을 확인해 주세요.'):
    raise DashboardError(400,'INVALID_ARGUMENT',message)


def mode():
    value=os.environ.get('LENS_PUSH_MODE','dry_run')
    if value not in ('dry_run','live'):raise DashboardError(503,'PUSH_CONFIGURATION_REQUIRED','푸시 설정을 확인해 주세요.')
    return value


def policy_version():return os.environ.get('LENS_PUSH_POLICY_VERSION','lens-personal-push-v1')
def key_version():return os.environ.get('LENS_PUSH_KEY_VERSION','v1')


def cipher(version=None):
    try:
        keys=json.loads(os.environ.get('LENS_PUSH_ENCRYPTION_KEYS','{}'))
        value=keys.get(version or key_version()) or (os.environ.get('LENS_PUSH_ENCRYPTION_KEY') if (version or key_version())==key_version() else None)
        return Fernet(value.encode())
    except (ValueError,TypeError,AttributeError):
        raise DashboardError(503,'PUSH_CONFIGURATION_REQUIRED','기기 연결 암호화 설정이 필요해요.') from None


def encrypt(data):return cipher().encrypt(json.dumps(data,separators=(',',':')).encode()).decode()

def decrypt(value,version):
    try:return json.loads(cipher(version).decrypt(value.encode()))
    except (InvalidToken,ValueError,TypeError):raise DashboardError(503,'PUSH_KEY_UNAVAILABLE','기기 연결 키를 다시 확인해 주세요.') from None


def preferences(body):
    if not isinstance(body,dict) or set(body)!={'revision','preferences'} or type(body['revision']) is not int or not 0<=body['revision']<2**63:invalid()
    p=body['preferences']
    if not isinstance(p,dict) or set(p)!=set(DEFAULT) or type(p['version']) is not int or p['version']!=1 or any(type(p[k]) is not bool for k in BOOLS):invalid()
    if p['frequency'] not in ('daily','threeDays') or p['timezone'] not in ZONES or type(p['weeklyDay']) is not int or not 0<=p['weeklyDay']<=6 or not isinstance(p['time'],str) or not re.fullmatch(r'(?:0[89]|1\d|20):[0-5]\d',p['time']):invalid()
    return dict(p)


def decode64(value):
    if not isinstance(value,str) or len(value)>512 or not re.fullmatch(r'[A-Za-z0-9_-]+={0,2}',value):invalid('푸시 기기 키가 올바르지 않아요.')
    try:return base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True)
    except ValueError:invalid('푸시 기기 키가 올바르지 않아요.')


def subscription(body,now):
    simulated=mode()=='dry_run'
    if not isinstance(body,dict) or set(body)!={'subscription','permission'} or body['permission'] not in (('simulated','granted') if simulated else ('granted',)):invalid()
    s=body['subscription']
    if not isinstance(s,dict) or not {'endpoint','keys'}<=set(s) or set(s)-{'endpoint','keys','expirationTime'}:invalid()
    endpoint=s['endpoint']
    if not isinstance(endpoint,str) or not 1<=len(endpoint)<=2048:invalid()
    try:
        url=urlsplit(endpoint);host=(url.hostname or '').lower()
        allowed=host in ('fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com') or host.endswith('.push.apple.com')
        if simulated and host=='push.invalid':allowed=True
        if not allowed or url.scheme!='https' or url.username or url.password or url.port not in (None,443) or url.fragment or not url.path or any(c.isspace() or ord(c)<32 or ord(c)==127 for c in endpoint):invalid('지원하는 푸시 제공자의 HTTPS 주소가 필요해요.')
    except ValueError:invalid('푸시 주소를 확인해 주세요.')
    endpoint=urlunsplit(('https',host,url.path,url.query,''))
    keys=s['keys']
    if not isinstance(keys,dict) or set(keys)!={'p256dh','auth'}:invalid()
    public,secret=decode64(keys['p256dh']),decode64(keys['auth'])
    if len(public)!=65 or public[0]!=4 or len(secret)!=16:invalid('푸시 기기 키 길이가 올바르지 않아요.')
    try:ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(),public)
    except ValueError:invalid('P-256 기기 키가 올바르지 않아요.')
    expiry=s.get('expirationTime')
    if expiry is not None and (type(expiry) not in (int,float) or not math.isfinite(expiry) or not now.timestamp()*1000<expiry<=253402300799000):invalid('만료된 기기를 연결할 수 없어요.')
    return {'endpoint':endpoint,'keys':dict(keys),'expirationTime':expiry},simulated


def due_types(p,now):
    local=now.astimezone(ZoneInfo(p['timezone']))
    if p['paused'] or not '08:00'<=local.strftime('%H:%M')<='20:59' or local.strftime('%H:%M')<p['time']:return []
    kinds=[]
    if p['frequency']=='daily' or local.weekday() in (0,2,4):kinds.extend(k for k in ('briefing','followups') if p[k])
    if p['weekly'] and (local.weekday()+1)%7==p['weeklyDay']:kinds.append('weekly')
    return kinds


def consent_valid(c):return bool(c and c['granted'] and c['policy_version']==policy_version())


def public_config():
    try:cipher();encryption=True
    except DashboardError:encryption=False
    active=mode()
    enabled=active=='dry_run' or os.environ.get('LENS_PUSH_LIVE_ENABLED')=='true' and bool(os.environ.get('LENS_PUSH_VAPID_PUBLIC_KEY') and os.environ.get('LENS_PUSH_VAPID_PRIVATE_KEY') and os.environ.get('LENS_PUSH_VAPID_SUBJECT'))
    return {'mode':active,'policy_version':policy_version(),'supported':encryption and enabled,'vapid_public_key':os.environ.get('LENS_PUSH_VAPID_PUBLIC_KEY') if active=='live' and enabled else None}

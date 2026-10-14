"""provider HTTP를 대체하여 결과 분류·키 회전을 검사. 외부 발송 없음."""
import base64
import datetime as dt
import importlib
from pathlib import Path
import sys
from types import SimpleNamespace
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def adapter(monkeypatch):
    for name in ('notification_policy','push_provider'):monkeypatch.delitem(sys.modules,name,raising=False)
    monkeypatch.setenv('LENS_PUSH_ENCRYPTION_KEY',Fernet.generate_key().decode())
    monkeypatch.setenv('LENS_PUSH_MODE','live');monkeypatch.setenv('LENS_PUSH_LIVE_ENABLED','true')
    for name in ('PUBLIC_KEY','PRIVATE_KEY','SUBJECT'):monkeypatch.setenv('LENS_PUSH_VAPID_'+name,'synthetic-provider-config')
    return importlib.import_module('push_provider')


def sub():
    pub=ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(Encoding.X962,PublicFormat.UncompressedPoint)
    enc=lambda v:base64.urlsafe_b64encode(v).decode().rstrip('=')
    return {'endpoint':'https://fcm.googleapis.com/local-fixture','keys':{'p256dh':enc(pub),'auth':enc(b'x'*16)},'expirationTime':None}


@pytest.mark.parametrize('http,status',[(200,'accepted'),(201,'accepted'),(202,'accepted'),(410,'gone'),(404,'gone'),(429,'retry'),(503,'retry'),(400,'failed')])
def test_http_status_mapping_without_transport(adapter,monkeypatch,http,status):
    calls=[]
    def fake(subscription,**kwargs):
        calls.append(kwargs)
        assert not kwargs['requests_session'].trust_env
        assert kwargs['timeout']==10 and kwargs['ttl']==3600
        assert len(kwargs['headers']['Topic'])==32
        return SimpleNamespace(status_code=http)
    monkeypatch.setitem(sys.modules,'pywebpush',SimpleNamespace(webpush=fake,WebPushException=type('StubWebPushError',(Exception,),{})))
    result=adapter.send(sub(),{'title':'나의 LENS','body':'새 글을 확인하세요.'},'12345678-1234-1234-1234-123456789012')
    assert result['status']==status and len(calls)==1


def test_dry_run_never_loads_sender_and_live_requires_configuration(adapter,monkeypatch):
    monkeypatch.setenv('LENS_PUSH_MODE','dry_run')
    monkeypatch.setitem(sys.modules,'pywebpush',None)
    assert adapter.send({}, {}, 'd')=={'status':'simulated','code':None}
    monkeypatch.setenv('LENS_PUSH_MODE','live');monkeypatch.delenv('LENS_PUSH_LIVE_ENABLED')
    assert adapter.send(sub(),{},'d')=={'status':'failed','code':'PROVIDER_CONFIGURATION'}


def test_no_response_is_unknown_and_exception_endpoint_not_returned(adapter,monkeypatch):
    class Unknown(Exception):
        status_code=None;response=None
    def fake(*args,**kwargs):raise Unknown('private endpoint and key must not leak')
    monkeypatch.setitem(sys.modules,'pywebpush',SimpleNamespace(webpush=fake,WebPushException=Unknown))
    assert adapter.send(sub(),{},'d')=={'status':'unknown','code':'PROVIDER_OUTCOME_UNKNOWN'}


def test_keyring_reads_old_cipher_and_expired_subscription_rejected(adapter,monkeypatch):
    p=adapter.policy
    old=Fernet.generate_key().decode();monkeypatch.setenv('LENS_PUSH_ENCRYPTION_KEY',old)
    encrypted=p.encrypt(sub())
    new=Fernet.generate_key().decode();monkeypatch.setenv('LENS_PUSH_KEY_VERSION','v2')
    monkeypatch.setenv('LENS_PUSH_ENCRYPTION_KEY',new)
    monkeypatch.setenv('LENS_PUSH_ENCRYPTION_KEYS',__import__('json').dumps({'v1':old,'v2':new}))
    assert p.decrypt(encrypted,'v1')['endpoint'].startswith('https://fcm.googleapis.com/')
    expired={**sub(),'expirationTime':1}
    with pytest.raises(p.DashboardError):p.subscription({'subscription':expired,'permission':'granted'},dt.datetime.now(dt.timezone.utc))

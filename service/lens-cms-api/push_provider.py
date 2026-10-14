"""암호화 Web Push provider. 기본 dry_run은 HTTP를 한 번도 호출하지 않는다."""
import datetime as dt
import json
import os
import notification_policy as policy


def send(subscription,payload,delivery_id):
    if policy.mode()=='dry_run':return {'status':'simulated','code':None}
    if not policy.public_config()['supported']:return {'status':'failed','code':'PROVIDER_CONFIGURATION'}
    try:policy.subscription({'subscription':subscription,'permission':'granted'},dt.datetime.now(dt.timezone.utc))
    except policy.DashboardError:return {'status':'failed','code':'INVALID_SUBSCRIPTION'}
    from pywebpush import webpush,WebPushException
    import requests
    class Session(requests.Session):
        def post(self,url,*args,**kwargs):
            kwargs['allow_redirects']=False
            return super().post(url,*args,**kwargs)
    session=Session();session.trust_env=False
    try:
        result=webpush(subscription,data=json.dumps(payload,ensure_ascii=False),vapid_private_key=os.environ['LENS_PUSH_VAPID_PRIVATE_KEY'],vapid_claims={'sub':os.environ['LENS_PUSH_VAPID_SUBJECT']},ttl=3600,timeout=10,headers={'Topic':str(delivery_id).replace('-','')[:32]},requests_session=session)
        status=result.status_code
    except WebPushException as exc:
        status=getattr(exc,'status_code',None) or (exc.response.status_code if exc.response is not None else None)
    except requests.RequestException:
        return {'status':'unknown','code':'NETWORK_OUTCOME_UNKNOWN'}
    except (ValueError,KeyError,TypeError):
        return {'status':'failed','code':'PROVIDER_CONFIGURATION'}
    finally:session.close()
    if status in (200,201,202):return {'status':'accepted','code':None}
    if status in (404,410):return {'status':'gone','code':f'HTTP_{status}'}
    if status==429 or status and 500<=status<600:return {'status':'retry','code':f'HTTP_{status}'}
    return {'status':'failed' if status else 'unknown','code':f'HTTP_{status}' if status else 'PROVIDER_OUTCOME_UNKNOWN'}

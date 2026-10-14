"""계정 대시보드 저장 primitive. 내부 토큰 필수, 공개 JWT 처리는 Lambda 책임."""
from fastapi import APIRouter, Body, Header, HTTPException, Query
import dashboard_repo
from content_resolver import DashboardError
from route_guards import _check_admin_token

router = APIRouter(prefix='/internal/personal/lens')


def _call(token, fn, *args):
    _check_admin_token(token)
    try:
        return fn(*args)
    except DashboardError as exc:
        raise HTTPException(exc.status, detail={'code': exc.code, 'message': exc.message}) from exc


@router.get('/preferences')
def preferences(user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.get_preferences, user_id)


@router.put('/preferences')
def replace_preferences(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.replace_preferences, user_id, payload)


@router.get('/letter-bookmarks')
def bookmarks(user_id: str, limit: int = Query(50, ge=1, le=200), cursor: str | None = None, q: str = '', read: str = 'all', x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.list_bookmarks, user_id, limit, cursor, q, read)


@router.put('/letter-bookmarks/{letter_id}')
def save_bookmark(letter_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.set_bookmark, user_id, letter_id, True)


@router.delete('/letter-bookmarks/{letter_id}')
def remove_bookmark(letter_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.set_bookmark, user_id, letter_id, False)


@router.get('/content/resolve')
def resolve(user_id: str, kind: str, key_type: str, key: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.resolve, user_id, kind, key_type, key)


@router.post('/activity/sessions')
def session(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import activity_repo
    return _call(x_internal_token, activity_repo.create_session, user_id, payload)


@router.post('/activity/events')
def event(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import activity_repo
    return _call(x_internal_token, activity_repo.accept_event, user_id, payload)


@router.get('/recommendation-inputs')
def recommendation_inputs(user_id: str, x_internal_token: str | None = Header(default=None)):
    import recommendation_repo
    return _call(x_internal_token, recommendation_repo.inputs, user_id)


@router.get('/sentence-inputs/{sentence_id}')
def sentence_inputs(sentence_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    import recommendation_repo
    return _call(x_internal_token, recommendation_repo.inputs, user_id, sentence_id)


@router.post('/recommendation-candidates')
def recommendation_candidates(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import recommendation_repo
    return _call(x_internal_token, recommendation_repo.candidates, user_id, payload)


@router.get('/activity')
def reading_activity(user_id: str, period: str = 'week', anchor: str | None = None, x_internal_token: str | None = Header(default=None)):
    import reading_records_repo
    return _call(x_internal_token, reading_records_repo.activity, user_id, period, anchor)


@router.get('/rewards')
def reading_rewards(user_id: str, week: str | None = None, x_internal_token: str | None = Header(default=None)):
    import reading_records_repo
    return _call(x_internal_token, reading_records_repo.rewards, user_id, week)


@router.get('/notifications/preferences')
@router.get('/notifications/consent')
def notification_settings(user_id: str, x_internal_token: str | None = Header(default=None)):
    import notifications_repo
    return _call(x_internal_token, notifications_repo.get, user_id)


@router.put('/notifications/preferences')
def notification_preferences(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notifications_repo
    return _call(x_internal_token, notifications_repo.save, user_id, payload)


@router.put('/notifications/consent')
def notification_consent(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notifications_repo
    return _call(x_internal_token, notifications_repo.consent, user_id, payload)


@router.post('/push-subscriptions')
def push_subscription(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notifications_repo
    return _call(x_internal_token, notifications_repo.register, user_id, payload)


@router.delete('/push-subscriptions/{subscription_id}')
def push_unsubscribe(subscription_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    import notifications_repo
    return _call(x_internal_token, notifications_repo.remove, user_id, subscription_id)


@router.get('/notifications/context')
def notification_context(user_id: str, x_internal_token: str | None = Header(default=None)):
    import notification_inputs
    return _call(x_internal_token, notification_inputs.context, user_id)


@router.get('/notifications/inputs')
def notification_recommendation_inputs(user_id: str, x_internal_token: str | None = Header(default=None)):
    import notification_inputs
    return _call(x_internal_token, notification_inputs.inputs, user_id)


@router.get('/notifications/candidates')
def notification_candidates(user_id: str, x_internal_token: str | None = Header(default=None)):
    import notification_inputs
    return _call(x_internal_token, notification_inputs.candidates, user_id)


@router.get('/notifications/due')
def notifications_due(x_internal_token: str | None = Header(default=None)):
    import notification_inputs
    return _call(x_internal_token, notification_inputs.due)


@router.post('/notifications/plans')
def notification_plan(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notification_delivery_repo
    def plan():
        if 'mode' not in payload:notification_delivery_repo.policy.invalid()
        body=dict(payload);mode=body.pop('mode')
        return notification_delivery_repo.plan(user_id,body,expected_mode=mode)
    return _call(x_internal_token,plan)


@router.post('/notifications/claim')
def notification_claim(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notification_delivery_repo
    def claim():
        if set(payload)!={'mode'}:notification_delivery_repo.policy.invalid()
        return notification_delivery_repo.claim(user_id,expected_mode=payload['mode'])
    return _call(x_internal_token,claim)


@router.post('/notifications/send-claim')
def notification_send_claim(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notification_delivery_repo
    def send():
        if 'mode' not in payload:notification_delivery_repo.policy.invalid()
        body=dict(payload);mode=body.pop('mode')
        return notification_delivery_repo.send_claim(user_id,body,expected_mode=mode)
    return _call(x_internal_token,send)


@router.post('/notifications/due')
def claim_notifications_due(payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import notification_inputs
    from notification_policy import invalid
    def claim():
        if set(payload)!={'mode','limit'} or payload['mode'] not in ('dry_run','live'):invalid()
        return notification_inputs.due(payload['limit'],payload['mode'])
    return _call(x_internal_token,claim)


@router.get('/format-preference')
def format_preference(user_id: str, x_internal_token: str | None = Header(default=None)):
    import format_preference_repo
    from db import get_cursor
    def load():
        with get_cursor() as cur:
            dashboard_repo._account(cur,user_id)
            return format_preference_repo.preference(cur,user_id)
    return _call(x_internal_token,load)


@router.get('/followed-editors')
def followed_editors(user_id: str, x_internal_token: str | None = Header(default=None)):
    import account_connections_repo
    return _call(x_internal_token,account_connections_repo.list_followed,user_id)


@router.put('/followed-editors/{editor_slug}')
def follow_editor(editor_slug: str,user_id: str,x_internal_token: str | None = Header(default=None)):
    import account_connections_repo
    return _call(x_internal_token,account_connections_repo.set_followed,user_id,editor_slug,True)


@router.delete('/followed-editors/{editor_slug}')
def unfollow_editor(editor_slug: str,user_id: str,x_internal_token: str | None = Header(default=None)):
    import account_connections_repo
    return _call(x_internal_token,account_connections_repo.set_followed,user_id,editor_slug,False)


@router.post('/imports/bookmarks')
def import_bookmarks(user_id: str,payload: dict = Body(...),x_internal_token: str | None = Header(default=None)):
    import account_connections_repo
    return _call(x_internal_token,account_connections_repo.import_bookmarks,user_id,payload)

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
def bookmarks(user_id: str, limit: int = Query(50, ge=1, le=200), cursor: str | None = None, q: str = '', x_internal_token: str | None = Header(default=None)):
    # 읽음 필터(read)는 제거됐다. 옛 호출이 read를 붙여도 선언하지 않은 쿼리라 무시되고 전체 목록을 돌려준다.
    return _call(x_internal_token, dashboard_repo.list_bookmarks, user_id, limit, cursor, q)


@router.put('/letter-bookmarks/{letter_id}')
def save_bookmark(letter_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.set_bookmark, user_id, letter_id, True)


@router.delete('/letter-bookmarks/{letter_id}')
def remove_bookmark(letter_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.set_bookmark, user_id, letter_id, False)


# 저장한 기사(v1.57) — 기사 화면 '저장'과 나의 LENS 내 서랍 '저장한 기사'.
@router.get('/article-bookmarks')
def article_bookmarks(user_id: str, limit: int = Query(50, ge=1, le=200), cursor: str | None = None, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.list_article_bookmarks, user_id, limit, cursor)


@router.get('/article-bookmarks/{article_id}')
def article_bookmark(article_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.get_article_bookmark, user_id, article_id)


@router.put('/article-bookmarks/{article_id}')
def save_article_bookmark(article_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.set_article_bookmark, user_id, article_id, True)


@router.delete('/article-bookmarks/{article_id}')
def remove_article_bookmark(article_id: str, user_id: str, x_internal_token: str | None = Header(default=None)):
    return _call(x_internal_token, dashboard_repo.set_article_bookmark, user_id, article_id, False)


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


@router.delete('/activity/history')
def clear_reading_history(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import activity_repo
    return _call(x_internal_token, activity_repo.clear_history, user_id, payload)


@router.get('/recommendation-inputs')
def recommendation_inputs(user_id: str, x_internal_token: str | None = Header(default=None)):
    import recommendation_repo
    return _call(x_internal_token, recommendation_repo.inputs, user_id)


@router.post('/recommendation-candidates')
def recommendation_candidates(user_id: str, payload: dict = Body(...), x_internal_token: str | None = Header(default=None)):
    import recommendation_repo
    return _call(x_internal_token, recommendation_repo.candidates, user_id, payload)


# 알림 설정·동의 조회·변경(/notifications/preferences·/consent)과 웹 푸시 기기 등록·해제(/push-subscriptions)는
# 계정 API 공개 경로와 함께 지웠다(2026-10-20 기능 다이어트).
# 알림 워커가 쓰던 /notifications/due·context·inputs·candidates·plans·claim·send-claim도
# 워커와 함께 지웠다(2026-10-20 기능 다이어트로 알림 워커 제거). 알림 테이블과 데이터는 그대로 둔다.


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

"""계정 대시보드 operation. 인증 owner와 허용 입력만 저장 계층에 전달."""
from models.dashboard import DashboardError, validate_preferences
from repositories.dashboard_repository import DashboardRepository


def dispatch(method, path, owner, body, params):
    repo = DashboardRepository()
    if path in ('/format-preference','/followed-editors') and method=='GET':
        if params:raise DashboardError(400,'INVALID_ARGUMENT','조회 조건을 확인해 주세요.')
        return repo.request(method,path,owner)
    if path.startswith('/followed-editors/') and method in ('PUT','DELETE'):
        return repo.request(method,path,owner)
    if path=='/imports/bookmarks' and method=='POST':
        return repo.request(method,path,owner,body=body)
    if path.startswith('/notifications/') or path.startswith('/push-subscriptions'):
        from services.user.notifications import dispatch as notifications
        return notifications(owner,method,path,body,params)
    if method == 'GET' and path in ('/activity','/rewards'):
        allowed={'period','anchor'} if path=='/activity' else {'week'}
        if set(params)-allowed:
            raise DashboardError(400,'INVALID_ARGUMENT','기록 조회 조건을 확인해 주세요.')
        return repo.request('GET',path,owner,query=params)
    if method == 'POST' and path in ('/activity/sessions','/activity/events'):
        from services.user.activity import dispatch as activity
        return activity(owner,path,body)
    if method == 'GET' and path == '/dashboard':
        from services.user.dashboard_summary import get_dashboard
        return get_dashboard(owner,params)
    if method == 'GET' and path == '/recommendations':
        from services.user.recommendations import recommend
        return recommend(owner,params)
    if method == 'GET' and path.startswith('/sentences/') and path.endswith('/recommendations'):
        from services.user.recommendations import recommend
        sentence_id=path.removeprefix('/sentences/').removesuffix('/recommendations')
        if set(params)-{'limit'}:
            raise DashboardError(400,'INVALID_ARGUMENT','문장 추천 조건을 확인해 주세요.')
        return recommend(owner,{'kind':'news','reason':'sentence',**params},sentence_id=sentence_id)

    if path == '/preferences' and method in ('GET', 'PUT'):
        return repo.request(method, path, owner, validate_preferences(body) if method == 'PUT' else None)
    if path == '/letter-bookmarks' and method == 'GET':
        if set(params)-{'read','limit','cursor','q'} or params.get('read','all') not in ('all','unread','completed'):
            raise DashboardError(400,'INVALID_ARGUMENT','서버 읽음 필터를 확인해 주세요.')
        try:
            limit = int(params.get('limit', '50'))
        except (ValueError, TypeError) as exc:
            raise DashboardError(400, 'INVALID_ARGUMENT', 'limit을 확인해 주세요.') from exc
        if not 1 <= limit <= 200:
            raise DashboardError(400, 'INVALID_ARGUMENT', 'limit은 1~200이에요.')
        return repo.request(method, path, owner, query={k: params[k] for k in ('limit', 'cursor', 'q', 'read') if k in params})
    if path.startswith('/letter-bookmarks/') and method in ('PUT', 'DELETE'):
        lid = path.removeprefix('/letter-bookmarks/')
        if not lid.isascii() or not lid.isdigit() or not 0 < int(lid) < 2**63:
            raise DashboardError(400, 'INVALID_ARGUMENT', '레터 ID를 확인해 주세요.')
        return repo.request(method, path, owner)
    if path == '/content/resolve' and method == 'GET':
        if set(params) != {'kind', 'key_type', 'key'}:
            raise DashboardError(400, 'INVALID_ARGUMENT', '콘텐츠 식별자를 확인해 주세요.')
        return repo.request(method, path, owner, query=params)
    raise DashboardError(404, 'NOT_FOUND', '지원하지 않는 개인 API예요.')

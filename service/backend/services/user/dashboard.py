"""계정 대시보드 operation. 인증 owner와 허용 입력만 저장 계층에 전달."""
from models.dashboard import DashboardError, validate_preferences
from repositories.dashboard_repository import DashboardRepository


def dispatch(method, path, owner, body, params):
    repo = DashboardRepository()
    # 형식 비율(/format-preference)·기간 기록(/activity)·리워드(/rewards) 조회는 제거됐다. 끝의 404로 간다.
    # 열람 보고(/activity/sessions·/activity/events)는 아래에서 그대로 전달한다.
    if path == '/followed-editors' and method=='GET':
        if params:raise DashboardError(400,'INVALID_ARGUMENT','조회 조건을 확인해 주세요.')
        return repo.request(method,path,owner)
    if path.startswith('/followed-editors/') and method in ('PUT','DELETE'):
        return repo.request(method,path,owner)
    if path=='/imports/bookmarks' and method=='POST':
        return repo.request(method,path,owner,body=body)
    if path.startswith('/notifications/') or path.startswith('/push-subscriptions'):
        from services.user.notifications import dispatch as notifications
        return notifications(owner,method,path,body,params)
    if method == 'POST' and path in ('/activity/sessions','/activity/events'):
        from services.user.activity import dispatch as activity
        return activity(owner,path,body)
    if method == 'GET' and path == '/dashboard':
        from services.user.dashboard_summary import get_dashboard
        return get_dashboard(owner,params)
    if method == 'GET' and path == '/recommendations':
        from services.user.recommendations import recommend
        return recommend(owner,params)
    # 저장 문장 관련 글(/sentences/{id}/recommendations)은 2026-10-19 기능 다이어트로 제거했다. 단어 하나만 겹쳐도
    # 무관한 글이 추천됐다. 예전 화면이 부르면 아래 404로 끝나고, 예전 화면은 '관련 뉴스를 불러오지 못했어요'만 보여 준다.

    if path == '/preferences' and method in ('GET', 'PUT'):
        clean = validate_preferences(body) if method == 'PUT' else None
        if method == 'PUT' and clean is None:
            # 예전 웹의 읽을 시간만 저장하는 요청: 쓰지 않고 현재 설정을 돌려준다(관심·저장된 값 유지). 다음 정리 때 제거.
            return repo.request('GET', path, owner)
        return repo.request(method, path, owner, clean)
    if path == '/letter-bookmarks' and method == 'GET':
        # 읽음 필터(read)는 제거됐다. 옛 화면이 보내는 read는 값과 관계없이 받아 두고 CMS로 넘기지 않는다.
        if set(params)-{'read','limit','cursor','q'}:
            raise DashboardError(400,'INVALID_ARGUMENT','저장 레터 조회 조건을 확인해 주세요.')
        try:
            limit = int(params.get('limit', '50'))
        except (ValueError, TypeError) as exc:
            raise DashboardError(400, 'INVALID_ARGUMENT', 'limit을 확인해 주세요.') from exc
        if not 1 <= limit <= 200:
            raise DashboardError(400, 'INVALID_ARGUMENT', 'limit은 1~200이에요.')
        return repo.request(method, path, owner, query={k: params[k] for k in ('limit', 'cursor', 'q') if k in params})
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

"""공개 이용 신호를 내부 원자적 저장 operation으로 전달."""
from models.dashboard import DashboardError
from repositories.dashboard_repository import DashboardRepository


def dispatch(owner,path,body):
    if path not in ('/activity/sessions','/activity/events'):
        raise DashboardError(404,'NOT_FOUND','이용 신호 API를 찾을 수 없어요.')
    return DashboardRepository().request('POST',path,owner,body=body)

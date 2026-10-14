"""계정 설정과 북마크의 저장 경계."""
from clients.pg import dashboard


class DashboardRepository:
    def request(self, method, path, owner, body=None, query=None):
        return dashboard.request(method, path, owner, body, query)

"""공개 개인 API 입력·오류 계약."""
class DashboardError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


def validate_preferences(body):
    if not isinstance(body, dict) or set(body) != {'interests', 'minutes', 'revision'}:
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심·읽을 시간·revision을 확인해 주세요.')
    if type(body['revision']) is not int or not 0 <= body['revision'] < 2**63 or type(body['minutes']) is not int or body['minutes'] not in (0, 5, 10):
        raise DashboardError(400, 'INVALID_ARGUMENT', '설정 값이 올바르지 않아요.')
    items = body['interests']
    if not isinstance(items, list):
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심은 최대 40개까지 선택할 수 있어요.')
    for item in items:
        if not isinstance(item, dict) or set(item) != {'type', 'key'} or item['type'] not in ('category', 'topic') or not isinstance(item['key'], str) or not 0 < len(item['key'].strip()) <= 64:
            raise DashboardError(400, 'INVALID_ARGUMENT', '관심 항목이 올바르지 않아요.')
    if len({(item['type'], item['key'].strip()) for item in items}) > 40:
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심은 최대 40개까지 선택할 수 있어요.')
    return body

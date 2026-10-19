"""공개 개인 API 입력·오류 계약."""
class DashboardError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message
        super().__init__(message)


# 읽을 시간(minutes)은 제거된 기능이다. 예전 화면이 보내도 400을 내지 않고 값은 버린다. 다음 정리 때 이 두 모양을 뺀다.
_LEGACY_SHAPES = ({'interests', 'minutes', 'revision'}, {'minutes', 'revision'})


def validate_preferences(body):
    """저장 요청을 검사해 CMS로 보낼 {interests, revision}을 돌려준다.

    예전 웹의 읽을 시간만 바꾸는 요청({minutes, revision})은 저장할 것이 없어 None을 돌려준다.
    호출부는 아무것도 쓰지 않고 현재 설정을 돌려주므로 관심·저장된 읽을 시간 값이 덮이지 않는다.
    """
    if not isinstance(body, dict) or set(body) != {'interests', 'revision'} and set(body) not in _LEGACY_SHAPES:
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심·revision을 확인해 주세요.')
    if type(body['revision']) is not int or not 0 <= body['revision'] < 2**63:
        raise DashboardError(400, 'INVALID_ARGUMENT', '설정 값이 올바르지 않아요.')
    if 'interests' not in body:
        return None
    items = body['interests']
    if not isinstance(items, list):
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심은 최대 40개까지 선택할 수 있어요.')
    for item in items:
        if not isinstance(item, dict) or set(item) != {'type', 'key'} or item['type'] not in ('category', 'topic') or not isinstance(item['key'], str) or not 0 < len(item['key'].strip()) <= 64:
            raise DashboardError(400, 'INVALID_ARGUMENT', '관심 항목이 올바르지 않아요.')
    if len({(item['type'], item['key'].strip()) for item in items}) > 40:
        raise DashboardError(400, 'INVALID_ARGUMENT', '관심은 최대 40개까지 선택할 수 있어요.')
    return {'interests': items, 'revision': body['revision']}

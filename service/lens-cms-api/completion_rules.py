"""클라이언트 진행의 서버 한도와 completion-v1 순수 판정."""
import math
from content_resolver import DashboardError

VERSION = 'completion-v1'


def invalid(message='완료 진행 값을 확인해 주세요.'):
    raise DashboardError(400, 'INVALID_ARGUMENT', message)


def merged_ranges(value, duration, maximum=100):
    if not isinstance(value, list) or len(value) > maximum:
        invalid()
    ranges = []
    for pair in value:
        if not isinstance(pair, list) or len(pair) != 2 or any(type(n) not in (int, float) or not math.isfinite(n) for n in pair):
            invalid()
        start, end = pair
        if duration is None or not 0 <= start < end <= duration:
            invalid('등록된 미디어 길이를 벗어난 구간이에요.')
        ranges.append([start, end])
    merged = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def seconds(ranges):
    return sum(end-start for start, end in ranges)


def progress(session, payload, elapsed_ms, delta_ms):
    visible = payload['visible_ms']
    active = payload.get('active_ms', 0)
    ratio = payload.get('scroll_ratio', 0)
    panels = payload.get('viewed_panel_ids', [])
    rules = session['completion_rules']
    duration = rules.get('duration_seconds')
    ranges = merged_ranges(payload.get('consumed_ranges', []), duration)
    if type(active) is not int or not 0 <= active <= visible or active < session['active_ms'] or active-session['active_ms'] > delta_ms+2000:
        invalid()
    if not isinstance(panels, list) or len(panels) > 500 or not all(isinstance(p, str) for p in panels) or len(set(panels)) != len(panels):
        invalid()
    if not set(session['viewed_panel_ids']) <= set(panels) or not set(panels) <= set(rules.get('panel_ids', [])):
        invalid('콘텐츠의 실제 컷만 보고할 수 있어요.')
    fmt = session['format']
    if fmt == 'letter' and (panels or ranges) or fmt == 'webtoon' and (ratio or ranges) or fmt in ('podcast', 'video') and (ratio or panels):
        invalid('형식에 맞지 않는 진행 정보예요.')
    if ratio < float(session['scroll_ratio']):
        invalid()
    old_ranges = session['consumed_ranges']
    union = merged_ranges(old_ranges+ranges, duration, 200) if old_ranges else ranges
    if abs(seconds(union)-seconds(ranges)) > .01:
        invalid('이전 소비 구간이 빠졌어요.')
    gained = seconds(ranges)-seconds(old_ranges)
    if gained*1000 > (visible-session['visible_ms'])*2+2000 or seconds(ranges)*1000 > visible*2+2000:
        invalid('서버에서 허용하는 재생 속도를 벗어났어요.')
    # 이전 visible-v1 세션은 메타데이터가 비어 있으므로 소급 완료하지 않는다.
    enabled = bool(rules.get('completion_enabled'))
    if fmt == 'letter':
        completed = enabled and visible >= 30000 and elapsed_ms >= 30000 and ratio >= .8
    elif fmt == 'webtoon':
        completed = enabled and visible >= 10000 and elapsed_ms >= 10000 and len(panels) >= math.ceil(len(rules.get('panel_ids', []))*.8)
    else:
        completed = enabled and duration is not None and seconds(ranges) >= duration*.8 and active >= duration*.8*1000/2
    return completed, {'active_ms':active, 'scroll_ratio':ratio, 'viewed_panel_ids':panels, 'consumed_ranges':ranges}
